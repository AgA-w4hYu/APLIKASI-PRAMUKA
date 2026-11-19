import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { appendAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/constants";
import { getContest, listContests } from "@/lib/services/contests";

export interface Standing {
  teamId: number;
  name: string;
  npp: string;
  category: string;
  score: number | null;
  judgeCount: number;
  examSubmittedAt: string | null;
  rank: number | null;
}

export function releasedCategories(contestId: number): string[] {
  return (
    getDb()
      .prepare("SELECT category FROM releases WHERE contest_id = ?")
      .all(contestId) as { category: string }[]
  ).map((r) => r.category);
}

export function isReleased(contestId: number, category: string): boolean {
  return Boolean(
    getDb()
      .prepare("SELECT 1 AS ok FROM releases WHERE contest_id = ? AND category = ?")
      .get(contestId, category),
  );
}

export function releaseContest(admin: SessionUser, contestId: number, category: string): void {
  const contest = getContest(contestId);
  const db = getDb();
  const categories = category === "semua" ? CATEGORIES.map((c) => c.key) : [category];
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const cat of categories) {
      db.prepare(
        "INSERT OR REPLACE INTO releases (contest_id, category, released_at, released_by) VALUES (?, ?, ?, ?)",
      ).run(contest.id, cat, now, admin.name);
      db.prepare(
        `UPDATE scores SET status = 'dirilis'
         WHERE contest_id = ? AND status IN ('terkirim','dikoreksi')
           AND team_id IN (SELECT id FROM teams WHERE category = ?)`,
      ).run(contest.id, cat);
    }
    appendAudit({ id: admin.id, name: admin.name }, "rilis.buka", "contest", contest.id, { category });
  });
  tx();
}

export function unreleaseContest(admin: SessionUser, contestId: number, category: string): void {
  const db = getDb();
  if (category === "semua") {
    db.prepare("DELETE FROM releases WHERE contest_id = ?").run(contestId);
  } else {
    db.prepare("DELETE FROM releases WHERE contest_id = ? AND category = ?").run(contestId, category);
  }
  appendAudit({ id: admin.id, name: admin.name }, "rilis.tarik", "contest", contestId, { category });
}

function rankRows(rows: Omit<Standing, "rank">[], tieBreak: boolean): Standing[] {
  const sorted = [...rows].sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sb !== sa) return sb - sa;
    if (tieBreak && a.examSubmittedAt && b.examSubmittedAt) {
      return new Date(a.examSubmittedAt).getTime() - new Date(b.examSubmittedAt).getTime();
    }
    return a.name.localeCompare(b.name, "id");
  });
  let rank = 0;
  let lastScore: number | null | undefined;
  return sorted.map((row, index) => {
    if (row.score === null) return { ...row, rank: null };
    if (row.score !== lastScore) {
      rank = index + 1;
      lastScore = row.score;
    }
    return { ...row, rank };
  });
}

/** Peringkat per lomba. Nilai adalah rata-rata juri yang ditugaskan. */
export function standings(contestId: number): Standing[] {
  const contest = getContest(contestId);
  const rows = getDb()
    .prepare(
      `SELECT t.id AS teamId, t.name, t.npp, t.category,
              AVG(s.total) AS score, COUNT(s.id) AS judgeCount,
              MIN(CASE WHEN s.juri_id IS NULL THEN s.submitted_at END) AS examSubmittedAt
       FROM teams t
       LEFT JOIN scores s ON s.team_id = t.id AND s.contest_id = ? AND s.status IN ('terkirim','dikoreksi','dirilis')
       GROUP BY t.id
       ORDER BY t.name ASC`,
    )
    .all(contestId) as Omit<Standing, "rank">[];
  return rankRows(rows, contest.type === "lctp");
}

export interface TeamContestScore {
  contestId: number;
  contestName: string;
  type: string;
  released: boolean;
  total: number | null;
  rank: number | null;
  of: number;
  detail: { item: string; value: number; max: number }[];
  judgeCount: number;
}

export function teamScoreDetail(teamId: number): TeamContestScore[] {
  const db = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as
    | { id: number; category: string }
    | undefined;
  if (!team) return [];
  return listContests()
    .filter((c) => c.type === "juri" || c.type === "lctp")
    .map((contest) => {
      const released = isReleased(contest.id, team.category);
      const rows = standings(contest.id);
      const own = rows.find((r) => r.teamId === teamId);
      const scoreRows = db
        .prepare(
          "SELECT * FROM scores WHERE contest_id = ? AND team_id = ? AND status IN ('terkirim','dikoreksi','dirilis')",
        )
        .all(contest.id, teamId) as { breakdown: string; sheet_id: number | null; juri_id: number | null }[];
      const detail: { item: string; value: number; max: number }[] = [];
      if (released) {
        const seen = new Set<number>();
        for (const score of scoreRows) {
          if (!score.sheet_id) continue;
          if (seen.has(score.sheet_id)) continue;
          seen.add(score.sheet_id);
          const items = db
            .prepare(
              `SELECT i.id, i.name, i.max_value FROM sheet_items i WHERE i.sheet_id = ? ORDER BY i.sort_order ASC, i.id ASC`,
            )
            .all(score.sheet_id) as { id: number; name: string; max_value: number }[];
          const values = JSON.parse(score.breakdown) as Record<string, number>;
          for (const item of items) {
            if (detail.some((d) => d.item === item.name)) continue;
            detail.push({ item: item.name, value: values[String(item.id)] ?? 0, max: item.max_value });
          }
        }
      }
      return {
        contestId: contest.id,
        contestName: contest.name,
        type: contest.type,
        released,
        total: released ? (own?.score ?? null) : null,
        rank: released ? (own?.rank ?? null) : null,
        of: rows.filter((r) => r.score !== null).length,
        detail,
        judgeCount: own?.judgeCount ?? 0,
      };
    });
}

/** Total semua lomba yang sudah dirilis untuk satu tim (juara umum). */
export function teamTotal(teamId: number): number {
  return teamScoreDetail(teamId)
    .filter((c) => c.released && c.total !== null)
    .reduce((sum, c) => sum + (c.total ?? 0), 0);
}

export function requireReleasePermission(user: SessionUser): void {
  if (!user.permissions.includes("rilis.ubah")) {
    throw new ApiError("Hanya admin yang dapat merilis nilai.", 403);
  }
}
