import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { appendAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";

export type QueueStatus = "menunggu" | "dipanggil" | "dinilai" | "selesai" | "dilewati" | "absen";

export interface QueueEntry {
  id: number;
  contest_id: number;
  team_id: number;
  position: number;
  status: QueueStatus;
  called_at: string | null;
  name: string;
  npp: string;
  category: string;
}

/** Antrean dibuat otomatis saat lomba pertama kali dibutuhkan. */
export function ensureQueue(contestId: number): void {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) AS n FROM team_queue WHERE contest_id = ?").get(contestId) as { n: number }).n;
  if (count > 0) return;
  const now = new Date().toISOString();
  const teams = db
    .prepare(
      `SELECT id FROM teams
       ORDER BY CASE category WHEN 'penegak' THEN 0 WHEN 'penggalang_putra' THEN 1 ELSE 2 END, name ASC`,
    )
    .all() as { id: number }[];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO team_queue (contest_id, team_id, position, status, created_at) VALUES (?, ?, ?, 'menunggu', ?)",
  );
  const tx = db.transaction(() => {
    teams.forEach((team, index) => insert.run(contestId, team.id, index + 1, now));
  });
  tx();
}

export function queueFor(contestId: number): QueueEntry[] {
  ensureQueue(contestId);
  return getDb()
    .prepare(
      `SELECT q.*, t.name, t.npp, t.category
       FROM team_queue q JOIN teams t ON t.id = q.team_id
       WHERE q.contest_id = ?
       ORDER BY q.position ASC, q.id ASC`,
    )
    .all(contestId) as QueueEntry[];
}

/** Tim yang sedang dipanggil: ditentukan server, bukan dipilih juri. */
export function currentEntry(contestId: number, category?: string | null): QueueEntry | null {
  ensureQueue(contestId);
  const row = getDb()
    .prepare(
      `SELECT q.*, t.name, t.npp, t.category
       FROM team_queue q JOIN teams t ON t.id = q.team_id
       WHERE q.contest_id = ? AND q.status IN ('dipanggil','dinilai')
         AND (? IS NULL OR t.category = ?)
       ORDER BY q.position ASC LIMIT 1`,
    )
    .get(contestId, category ?? null, category ?? null) as QueueEntry | undefined;
  return row ?? null;
}

export function callNext(contestId: number, category?: string | null): QueueEntry | null {
  const db = getDb();
  const current = currentEntry(contestId, category);
  const tx = db.transaction(() => {
    if (current) {
      db.prepare("UPDATE team_queue SET status = 'selesai' WHERE id = ?").run(current.id);
    }
    const next = db
      .prepare(
        `SELECT q.id FROM team_queue q JOIN teams t ON t.id = q.team_id
         WHERE q.contest_id = ? AND q.status = 'menunggu' AND (? IS NULL OR t.category = ?)
         ORDER BY q.position ASC LIMIT 1`,
      )
      .get(contestId, category ?? null, category ?? null) as { id: number } | undefined;
    if (!next) return null;
    db.prepare("UPDATE team_queue SET status = 'dipanggil', called_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      next.id,
    );
    return currentEntry(contestId, category);
  });
  return tx();
}

export function markScored(contestId: number, teamId: number): void {
  getDb()
    .prepare("UPDATE team_queue SET status = 'dinilai' WHERE contest_id = ? AND team_id = ? AND status = 'dipanggil'")
    .run(contestId, teamId);
}

/** Juri hanya boleh memanggil tim berikutnya setelah semua juri lomba ini mengirim nilai. */
export function advanceByJudge(user: SessionUser, contestId: number): QueueEntry | null {
  const db = getDb();
  const category = user.judgeCategory ?? null;
  const current = currentEntry(contestId, category);
  if (!current) return null;
  const own = db
    .prepare(
      "SELECT status FROM scores WHERE contest_id = ? AND team_id = ? AND juri_id = ?",
    )
    .get(contestId, current.team_id, user.id) as { status: string } | undefined;
  if (!own || own.status === "draf") {
    throw new ApiError("Kirim dulu nilai tim sekarang sebelum memanggil tim berikutnya.", 409);
  }
  const judges = db
    .prepare(
      `SELECT u.id FROM users u JOIN assignments a ON a.juri_id = u.id
       WHERE a.contest_id = ? AND u.active = 1 AND u.role = 'juri'
         AND (a.category IS NULL OR a.category = ?)`,
    )
    .all(contestId, current.category) as { id: number }[];
  const submitted = db
    .prepare(
      `SELECT COUNT(DISTINCT juri_id) AS n FROM scores
       WHERE contest_id = ? AND team_id = ? AND juri_id IS NOT NULL AND status != 'draf'`,
    )
    .get(contestId, current.team_id) as { n: number };
  if (judges.length > 0 && submitted.n < judges.length) {
    throw new ApiError("Nilai Anda sudah tersimpan. Menunggu juri lain menyelesaikan tim ini.", 409);
  }
  const next = callNext(contestId, category);
  appendAudit(
    { id: user.id, name: user.name },
    "antrean.maju",
    "contest",
    contestId,
    { from: current.team_id, to: next?.team_id ?? null },
  );
  return next;
}

export function setQueueStatus(
  admin: SessionUser,
  entryId: number,
  status: "dilewati" | "absen" | "menunggu" | "selesai",
): void {
  const db = getDb();
  const entry = db.prepare("SELECT * FROM team_queue WHERE id = ?").get(entryId) as
    | { id: number; contest_id: number; team_id: number; status: string }
    | undefined;
  if (!entry) throw new ApiError("Antrean tidak ditemukan.", 404);
  db.prepare("UPDATE team_queue SET status = ? WHERE id = ?").run(status, entryId);
  appendAudit({ id: admin.id, name: admin.name }, `antrean.${status}`, "team_queue", entryId, {
    contestId: entry.contest_id,
    teamId: entry.team_id,
  });
  if ((status === "dilewati" || status === "absen")) {
    const current = currentEntry(entry.contest_id);
    if (!current) {
      const next = db
        .prepare(
          "SELECT id FROM team_queue WHERE contest_id = ? AND status = 'menunggu' ORDER BY position ASC LIMIT 1",
        )
        .get(entry.contest_id) as { id: number } | undefined;
      if (next) {
        db.prepare("UPDATE team_queue SET status = 'dipanggil', called_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          next.id,
        );
      }
    }
  }
}

export function moveQueueEntry(admin: SessionUser, entryId: number, direction: "naik" | "turun"): void {
  const db = getDb();
  const entry = db.prepare("SELECT * FROM team_queue WHERE id = ?").get(entryId) as
    | { id: number; contest_id: number; position: number }
    | undefined;
  if (!entry) throw new ApiError("Antrean tidak ditemukan.", 404);
  const neighbour = db
    .prepare(
      `SELECT * FROM team_queue WHERE contest_id = ?
       AND position ${direction === "naik" ? "<" : ">"} ?
       ORDER BY position ${direction === "naik" ? "DESC" : "ASC"} LIMIT 1`,
    )
    .get(entry.contest_id, entry.position) as { id: number; position: number } | undefined;
  if (!neighbour) return;
  const tx = db.transaction(() => {
    db.prepare("UPDATE team_queue SET position = ? WHERE id = ?").run(neighbour.position, entry.id);
    db.prepare("UPDATE team_queue SET position = ? WHERE id = ?").run(entry.position, neighbour.id);
  });
  tx();
  appendAudit({ id: admin.id, name: admin.name }, "antrean.ubah_urutan", "team_queue", entryId, { direction });
}

export function queueProgress(contestId: number, category?: string | null): { done: number; total: number } {
  const rows = queueFor(contestId).filter((row) => !category || row.category === category);
  const total = rows.filter((row) => row.status !== "dilewati" && row.status !== "absen").length;
  const done = rows.filter((row) => row.status === "selesai" || row.status === "dinilai").length;
  return { done, total };
}
