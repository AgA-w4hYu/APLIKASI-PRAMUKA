import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import type { ScoreItem, ScorePenalty } from "@/lib/scoring";

export interface Contest {
  id: number;
  name: string;
  slug: string;
  type: "juri" | "lctp";
  team_size: number;
  duration_min: number;
  description: string | null;
  status: string;
  show_leaderboard: number;
  anonymous: number;
  sort_order: number;
}

export interface Team {
  id: number;
  name: string;
  npp: string;
  category: string;
  school: string | null;
}

export interface SheetSection {
  id: number;
  name: string;
  sort_order: number;
  items: ScoreItem[];
}

export interface SheetDetail {
  id: number;
  contest_id: number;
  version: number;
  locked: number;
  sections: SheetSection[];
  penalties: ScorePenalty[];
}

export function listContests(): Contest[] {
  return getDb()
    .prepare("SELECT * FROM contests ORDER BY sort_order ASC, id ASC")
    .all() as Contest[];
}

export function getContest(id: number): Contest {
  const row = getDb().prepare("SELECT * FROM contests WHERE id = ?").get(id) as Contest | undefined;
  if (!row) throw new ApiError("Lomba tidak ditemukan.", 404);
  return row;
}

export function listTeams(): Team[] {
  return getDb().prepare("SELECT * FROM teams ORDER BY category ASC, name ASC").all() as Team[];
}

export function getTeam(id: number): Team {
  const row = getDb().prepare("SELECT * FROM teams WHERE id = ?").get(id) as Team | undefined;
  if (!row) throw new ApiError("Tim tidak ditemukan.", 404);
  return row;
}

export function latestSheet(contestId: number): SheetDetail | null {
  const db = getDb();
  const sheet = db
    .prepare("SELECT * FROM sheets WHERE contest_id = ? ORDER BY version DESC LIMIT 1")
    .get(contestId) as { id: number; contest_id: number; version: number; locked: number } | undefined;
  if (!sheet) return null;
  return sheetDetail(sheet.id);
}

export function sheetDetail(sheetId: number): SheetDetail {
  const db = getDb();
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ?").get(sheetId) as
    | { id: number; contest_id: number; version: number; locked: number }
    | undefined;
  if (!sheet) throw new ApiError("Lembar penilaian tidak ditemukan.", 404);
  const sections = db
    .prepare("SELECT id, name, sort_order FROM sheet_sections WHERE sheet_id = ? ORDER BY sort_order ASC, id ASC")
    .all(sheetId) as { id: number; name: string; sort_order: number }[];
  const items = db
    .prepare("SELECT * FROM sheet_items WHERE sheet_id = ? ORDER BY sort_order ASC, id ASC")
    .all(sheetId) as (ScoreItem & { sheet_id: number })[];
  const penalties = db
    .prepare("SELECT id, name, value FROM penalties WHERE sheet_id = ? ORDER BY sort_order ASC, id ASC")
    .all(sheetId) as ScorePenalty[];
  return {
    ...sheet,
    sections: sections.map((s) => ({ ...s, items: items.filter((i) => i.section_id === s.id) })),
    penalties,
  };
}

export function contestQuestions(contestId: number) {
  return getDb()
    .prepare("SELECT * FROM questions WHERE contest_id = ? ORDER BY sort_order ASC, id ASC")
    .all(contestId) as {
    id: number;
    contest_id: number;
    text: string;
    image_url: string | null;
    options: string;
    answer_index: number;
    score: number;
    difficulty: string;
    package_name: string;
    sort_order: number;
  }[];
}

export function juriContests(juriId: number): (Contest & { sheet_id: number | null; total_teams: number })[] {
  const db = getDb();
  const contests = db
    .prepare(
      `SELECT c.*, (SELECT id FROM sheets s WHERE s.contest_id = c.id ORDER BY version DESC LIMIT 1) AS sheet_id
       FROM contests c
       JOIN assignments a ON a.contest_id = c.id
       WHERE a.juri_id = ? AND c.type = 'juri'
       ORDER BY c.sort_order ASC`,
    )
    .all(juriId) as (Contest & { sheet_id: number | null })[];
  return contests.map((c) => ({
    ...c,
    total_teams: (db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number }).n,
  }));
}

export function isAssigned(juriId: number, contestId: number): boolean {
  return Boolean(
    getDb().prepare("SELECT 1 AS ok FROM assignments WHERE juri_id = ? AND contest_id = ?").get(juriId, contestId),
  );
}

export function contestSummary(contestId: number) {
  const db = getDb();
  const sheet = db
    .prepare("SELECT id FROM sheets WHERE contest_id = ? ORDER BY version DESC LIMIT 1")
    .get(contestId) as { id: number } | undefined;
  return sheet ? sheetDetail(sheet.id) : null;
}
