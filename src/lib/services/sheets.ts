import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { appendAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { getContest, latestSheet } from "@/lib/services/contests";

export interface SheetPayloadSection {
  name: string;
  items: { name: string; hint?: string; max: number; weight?: number; type?: string }[];
}

export interface SheetPayload {
  sections: SheetPayloadSection[];
  penalties: { name: string; value: number }[];
}

function validate(payload: SheetPayload): void {
  if (!Array.isArray(payload.sections) || payload.sections.length === 0) {
    throw new ApiError("Lembar penilaian harus memiliki minimal satu kategori penilaian.");
  }
  let totalMax = 0;
  for (const section of payload.sections) {
    if (!section.name?.trim()) throw new ApiError("Setiap kategori penilaian wajib punya nama.");
    if (!Array.isArray(section.items) || section.items.length === 0) {
      throw new ApiError(`Kategori "${section.name}" belum punya kriteria.`);
    }
    for (const item of section.items) {
      if (!item.name?.trim()) throw new ApiError("Setiap kriteria wajib punya nama.");
      const max = Number(item.max);
      if (!Number.isFinite(max) || max <= 0) {
        throw new ApiError(`Nilai maksimum "${item.name}" harus lebih besar dari 0.`);
      }
      totalMax += max * (Number(item.weight) > 0 ? Number(item.weight) : 1);
    }
  }
  if (totalMax <= 0) throw new ApiError("Total nilai maksimum harus lebih besar dari 0.");
  for (const penalty of payload.penalties ?? []) {
    if (!penalty.name?.trim()) throw new ApiError("Nama penalti wajib diisi.");
  }
}

function writeContent(sheetId: number, payload: SheetPayload): void {
  const db = getDb();
  db.prepare("DELETE FROM sheet_sections WHERE sheet_id = ?").run(sheetId);
  db.prepare("DELETE FROM penalties WHERE sheet_id = ?").run(sheetId);
  const sectionInsert = db.prepare(
    "INSERT INTO sheet_sections (sheet_id, name, sort_order) VALUES (?, ?, ?)",
  );
  const itemInsert = db.prepare(
    `INSERT INTO sheet_items (section_id, sheet_id, name, hint, max_value, weight, input_type, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  payload.sections.forEach((section, sIndex) => {
    const sectionId = Number(sectionInsert.run(sheetId, section.name.trim(), sIndex).lastInsertRowid);
    section.items.forEach((item, iIndex) => {
      itemInsert.run(
        sectionId,
        sheetId,
        item.name.trim(),
        (item.hint ?? "").trim() || null,
        Number(item.max),
        Number(item.weight) > 0 ? Number(item.weight) : 1,
        item.type ?? "angka",
        iIndex,
      );
    });
  });
  const penaltyInsert = db.prepare("INSERT INTO penalties (sheet_id, name, value, sort_order) VALUES (?, ?, ?, ?)");
  (payload.penalties ?? []).forEach((penalty, index) => {
    penaltyInsert.run(sheetId, penalty.name.trim(), Math.abs(Number(penalty.value)) || 0, index);
  });
}

export function saveSheet(
  admin: SessionUser,
  contestId: number,
  payload: SheetPayload,
  lock: boolean,
): { version: number; newVersion: boolean } {
  const contest = getContest(contestId);
  if (contest.type !== "juri") throw new ApiError("Lomba ini tidak memakai lembar penilaian manual.");
  validate(payload);
  const db = getDb();
  const current = latestSheet(contestId);
  const scoreCount = current
    ? (db.prepare("SELECT COUNT(*) AS n FROM scores WHERE contest_id = ?").get(contestId) as { n: number }).n
    : 0;

  const now = new Date().toISOString();
  let version: number;
  let newVersion = false;

  if (!current) {
    version = 1;
    const sheetId = Number(
      db.prepare("INSERT INTO sheets (contest_id, version, locked, created_at) VALUES (?, 1, ?, ?)").run(
        contestId,
        lock ? 1 : 0,
        now,
      ).lastInsertRowid,
    );
    writeContent(sheetId, payload);
  } else if (scoreCount > 0) {
    // Nilai lama tetap utuh pada versi sebelumnya.
    db.prepare("UPDATE sheets SET locked = 1 WHERE id = ?").run(current.id);
    version = current.version + 1;
    newVersion = true;
    const sheetId = Number(
      db.prepare("INSERT INTO sheets (contest_id, version, locked, created_at) VALUES (?, ?, 1, ?)").run(
        contestId,
        version,
        now,
      ).lastInsertRowid,
    );
    writeContent(sheetId, payload);
  } else {
    version = current.version;
    writeContent(current.id, payload);
    db.prepare("UPDATE sheets SET locked = ? WHERE id = ?").run(lock ? 1 : 0, current.id);
  }

  appendAudit({ id: admin.id, name: admin.name }, "lembar.simpan", "sheet", contestId, {
    contest: contest.name,
    version,
    newVersion,
    criteria: payload.sections.reduce((n, s) => n + s.items.length, 0),
  });

  return { version, newVersion };
}
