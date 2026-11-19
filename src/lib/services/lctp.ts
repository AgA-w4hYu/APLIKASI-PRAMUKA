import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { appendAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { getContest } from "@/lib/services/contests";

export interface ExamQuestionRow {
  id: number;
  text: string;
  image_url: string | null;
  options: string;
  answer_index: number;
  score: number;
  difficulty: string;
}

export interface ExamSessionRow {
  id: number;
  contest_id: number;
  team_id: number;
  user_id: number;
  started_at: string;
  ends_at: string;
  submitted_at: string | null;
  status: string;
  score: number | null;
  question_order: string;
  option_order: string;
}

function shuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let state = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function findSession(contestId: number, teamId: number): ExamSessionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM exam_sessions WHERE contest_id = ? AND team_id = ?")
    .get(contestId, teamId) as ExamSessionRow | undefined;
}

function requireStudent(user: SessionUser): number {
  if (!user.teamId) throw new ApiError("Akun ini tidak terhubung ke tim mana pun.", 403);
  if (!user.permissions.includes("ujian.kerjakan")) {
    throw new ApiError("Akun ini tidak dapat mengerjakan ujian.", 403);
  }
  return user.teamId;
}

export interface ExamPayload {
  sessionId: number;
  contestName: string;
  endsAt: string;
  serverNow: string;
  durationMin: number;
  questions: { id: number; text: string; imageUrl: string | null; options: string[]; score: number }[];
  answers: Record<string, number>;
  status: string;
}

export function examPayload(session: ExamSessionRow): ExamPayload {
  const db = getDb();
  const contest = getContest(session.contest_id);
  const order = JSON.parse(session.question_order) as number[];
  const optionOrder = JSON.parse(session.option_order) as Record<string, number[]>;
  const all = db
    .prepare("SELECT * FROM questions WHERE contest_id = ?")
    .all(session.contest_id) as ExamQuestionRow[];
  const byId = new Map(all.map((q) => [q.id, q]));
  const chosen = db
    .prepare("SELECT question_id, chosen FROM exam_answers WHERE session_id = ?")
    .all(session.id) as { question_id: number; chosen: number }[];
  const answers: Record<string, number> = {};
  for (const a of chosen) answers[String(a.question_id)] = a.chosen;

  const questions = order
    .map((id) => byId.get(id))
    .filter((q): q is ExamQuestionRow => Boolean(q))
    .map((q) => {
      const options = JSON.parse(q.options) as string[];
      const indexes = optionOrder[String(q.id)] ?? options.map((_, i) => i);
      return {
        id: q.id,
        text: q.text,
        imageUrl: q.image_url,
        options: indexes.map((i) => options[i]),
        score: q.score,
      };
    });

  return {
    sessionId: session.id,
    contestName: contest.name,
    endsAt: session.ends_at,
    serverNow: new Date().toISOString(),
    durationMin: contest.duration_min,
    questions,
    answers,
    status: session.status,
  };
}

export function currentExam(user: SessionUser, contestId: number): ExamPayload | null {
  const teamId = requireStudent(user);
  const session = findSession(contestId, teamId);
  if (!session) return null;
  return examPayload(session);
}

export function startExam(user: SessionUser, contestId: number): ExamPayload {
  const teamId = requireStudent(user);
  const contest = getContest(contestId);
  if (contest.type !== "lctp") throw new ApiError("Lomba ini bukan ujian LCTP.");
  if (contest.status !== "berjalan") {
    throw new ApiError("Sesi ujian belum dibuka panitia atau sudah ditutup.");
  }
  const db = getDb();
  const questions = db
    .prepare("SELECT * FROM questions WHERE contest_id = ? ORDER BY sort_order ASC, id ASC")
    .all(contestId) as ExamQuestionRow[];
  if (questions.length === 0) throw new ApiError("Soal ujian belum tersedia.");

  const existing = findSession(contestId, teamId);
  if (existing) return examPayload(existing);

  const seed = `${contestId}-${teamId}-${Date.now()}`;
  const ordered = shuffle(questions, seed);
  const optionOrder: Record<string, number[]> = {};
  for (const q of questions) {
    const options = JSON.parse(q.options) as string[];
    optionOrder[String(q.id)] = shuffle(options.map((_, i) => i), `${seed}-${q.id}`);
  }
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + contest.duration_min * 60_000);
  const info = db
    .prepare(
      `INSERT INTO exam_sessions (contest_id, team_id, user_id, started_at, ends_at, status, question_order, option_order)
       VALUES (?, ?, ?, ?, ?, 'berjalan', ?, ?)`,
    )
    .run(
      contestId,
      teamId,
      user.id,
      startedAt.toISOString(),
      endsAt.toISOString(),
      JSON.stringify(ordered.map((q) => q.id)),
      JSON.stringify(optionOrder),
    );
  appendAudit({ id: user.id, name: user.name }, "ujian.mulai", "exam_session", Number(info.lastInsertRowid), {
    contest: contest.name,
    teamId,
  });
  return examPayload(findSession(contestId, teamId)!);
}

function ensureOpen(session: ExamSessionRow): void {
  if (session.status !== "berjalan") throw new ApiError("Ujian sudah selesai.", 409);
  if (Date.now() > new Date(session.ends_at).getTime() + 10_000) {
    throw new ApiError("Waktu ujian sudah habis.", 409);
  }
}

/** Jawaban dikirim dalam urutan tampilan; server memetakan ke indeks asli. */
export function saveAnswer(
  user: SessionUser,
  sessionId: number,
  questionId: number,
  displayIndex: number,
): { saved: boolean; endsAt: string } {
  const teamId = requireStudent(user);
  const db = getDb();
  const session = db.prepare("SELECT * FROM exam_sessions WHERE id = ?").get(sessionId) as
    | ExamSessionRow
    | undefined;
  if (!session) throw new ApiError("Sesi ujian tidak ditemukan.", 404);
  if (session.team_id !== teamId) throw new ApiError("Sesi ujian ini bukan milik tim Anda.", 403);
  ensureOpen(session);

  const optionOrder = JSON.parse(session.option_order) as Record<string, number[]>;
  const order = optionOrder[String(questionId)];
  if (!order) throw new ApiError("Soal tidak dikenal pada sesi ini.");
  const original = order[displayIndex];
  if (original === undefined) throw new ApiError("Pilihan jawaban tidak valid.");
  const question = db
    .prepare("SELECT * FROM questions WHERE id = ? AND contest_id = ?")
    .get(questionId, session.contest_id) as ExamQuestionRow | undefined;
  if (!question) throw new ApiError("Soal tidak ditemukan.");

  db.prepare(
    `INSERT INTO exam_answers (session_id, question_id, chosen, correct, answered_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, question_id) DO UPDATE SET chosen = excluded.chosen, correct = excluded.correct, answered_at = excluded.answered_at`,
  ).run(session.id, questionId, original, original === question.answer_index ? 1 : 0, new Date().toISOString());
  return { saved: true, endsAt: session.ends_at };
}

export function submitExam(user: SessionUser, sessionId: number): { score: number; total: number; correct: number } {
  const teamId = requireStudent(user);
  const db = getDb();
  const session = db.prepare("SELECT * FROM exam_sessions WHERE id = ?").get(sessionId) as
    | ExamSessionRow
    | undefined;
  if (!session) throw new ApiError("Sesi ujian tidak ditemukan.", 404);
  if (session.team_id !== teamId) throw new ApiError("Sesi ujian ini bukan milik tim Anda.", 403);
  if (session.status === "selesai") {
    return {
      score: session.score ?? 0,
      total: 100,
      correct: (db.prepare("SELECT COUNT(*) AS n FROM exam_answers WHERE session_id = ? AND correct = 1").get(session.id) as { n: number }).n,
    };
  }

  const questions = db
    .prepare("SELECT id, score FROM questions WHERE contest_id = ?")
    .all(session.contest_id) as { id: number; score: number }[];
  const answers = db
    .prepare("SELECT question_id, correct FROM exam_answers WHERE session_id = ?")
    .all(session.id) as { question_id: number; correct: number }[];
  const correctMap = new Map(answers.map((a) => [a.question_id, a.correct === 1]));
  let gained = 0;
  let max = 0;
  for (const q of questions) {
    max += q.score;
    if (correctMap.get(q.id)) gained += q.score;
  }
  const score = max > 0 ? Math.round((gained / max) * 10000) / 100 : 0;
  const correct = answers.filter((a) => a.correct === 1).length;
  const now = new Date().toISOString();
  const contest = getContest(session.contest_id);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE exam_sessions SET status = 'selesai', submitted_at = ?, score = ? WHERE id = ?",
    ).run(now, score, session.id);
    db.prepare(
      `INSERT INTO scores (contest_id, sheet_id, team_id, juri_id, status, total, breakdown, penalties, revision, created_at, updated_at, submitted_at)
       VALUES (?, NULL, ?, NULL, 'terkirim', ?, ?, '[]', 1, ?, ?, ?)
       ON CONFLICT(contest_id, team_id) WHERE juri_id IS NULL
       DO UPDATE SET total = excluded.total, breakdown = excluded.breakdown, submitted_at = excluded.submitted_at, updated_at = excluded.updated_at`,
    ).run(
      session.contest_id,
      session.team_id,
      score,
      JSON.stringify({ correct, totalQuestions: questions.length }),
      now,
      now,
      now,
    );
    appendAudit({ id: user.id, name: user.name }, "ujian.selesai", "exam_session", session.id, {
      contest: contest.name,
      teamId: session.team_id,
      score,
    });
  });
  tx();
  return { score, total: max, correct };
}

export interface ExamAdminRow {
  sessionId: number;
  teamName: string;
  category: string;
  status: string;
  score: number | null;
  submittedAt: string | null;
  startedAt: string;
  answered: number;
  totalQuestions: number;
}

export function examResults(contestId: number): ExamAdminRow[] {
  return getDb()
    .prepare(
      `SELECT es.id AS sessionId, t.name AS teamName, t.category, es.status, es.score,
              es.submitted_at AS submittedAt, es.started_at AS startedAt,
              (SELECT COUNT(*) FROM exam_answers a WHERE a.session_id = es.id) AS answered,
              (SELECT COUNT(*) FROM questions q WHERE q.contest_id = es.contest_id) AS totalQuestions
       FROM exam_sessions es JOIN teams t ON t.id = es.team_id
       WHERE es.contest_id = ?
       ORDER BY es.score DESC, es.submitted_at ASC`,
    )
    .all(contestId) as ExamAdminRow[];
}

/** Soal untuk pratinjau admin: menyertakan kunci jawaban. */
export function questionsWithAnswers(contestId: number) {
  return getDb()
    .prepare("SELECT * FROM questions WHERE contest_id = ? ORDER BY sort_order ASC, id ASC")
    .all(contestId) as (ExamQuestionRow & { contest_id: number; package_name: string; sort_order: number })[];
}
