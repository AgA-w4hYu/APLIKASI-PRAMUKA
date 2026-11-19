import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { appendAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/auth";
import { latestSheet, isAssigned, getTeam, getContest, sheetDetail } from "@/lib/services/contests";
import { currentEntry, markScored, queueFor } from "@/lib/queue";
import {
  computeScore,
  validateValues,
  validatePenalties,
  type Values,
} from "@/lib/scoring";
import {
  scoreContentHash,
  signatureHash,
  signatureByScore,
  safeStoreSignature,
  validateSignature,
  type SignaturePayload,
} from "@/lib/signature";

export interface ScoreRow {
  id: number;
  contest_id: number;
  sheet_id: number | null;
  team_id: number;
  juri_id: number | null;
  status: string;
  total: number;
  breakdown: string;
  penalties: string;
  notes: string | null;
  revision: number;
  pending_revision_id: number | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

export interface SignatureMeta {
  ip: string | null;
  device: string | null;
}

function parseValues(json: string): Values {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Values) : {};
  } catch {
    return {};
  }
}

export function findScore(sheetId: number, teamId: number, juriId: number): ScoreRow | undefined {
  return getDb()
    .prepare("SELECT * FROM scores WHERE sheet_id = ? AND team_id = ? AND juri_id = ?")
    .get(sheetId, teamId, juriId) as ScoreRow | undefined;
}

export function findScoreById(id: number): ScoreRow {
  const row = getDb().prepare("SELECT * FROM scores WHERE id = ?").get(id) as ScoreRow | undefined;
  if (!row) throw new ApiError("Nilai tidak ditemukan.", 404);
  return row;
}

export interface SaveScoreInput {
  contestId: number;
  teamId: number;
  values: Values;
  penaltyIds: number[];
  notes?: string;
}

function guardJuri(user: SessionUser, contestId: number): void {
  if (!can(user, "nilai.kirim")) throw new ApiError("Anda tidak memiliki izin menilai.", 403);
  if (!isAssigned(user.id, contestId)) {
    throw new ApiError("Anda tidak ditugaskan pada lomba ini.", 403);
  }
}

/** Hanya tim yang sedang dipanggil panitia yang boleh dinilai. */
function guardCurrentTeam(user: SessionUser, contestId: number, teamId: number): void {
  const contest = getContest(contestId);
  if (contest.type !== "juri") throw new ApiError("Lomba ini tidak dinilai manual.");
  const current = currentEntry(contestId, user.judgeCategory);
  if (!current) {
    throw new ApiError("Panitia belum memanggil tim. Tunggu aba-aba berikutnya.", 409);
  }
  if (current.team_id !== teamId) {
    throw new ApiError("Tim ini bukan giliran yang dipanggil panitia.", 403);
  }
}

function buildScore(user: SessionUser, input: SaveScoreInput) {
  void user;
  const contest = getContest(input.contestId);
  if (contest.type !== "juri") throw new ApiError("Lomba ini tidak dinilai manual.");
  const sheet = latestSheet(contest.id);
  if (!sheet) throw new ApiError("Lembar penilaian belum disiapkan panitia.");
  const team = getTeam(input.teamId);
  const category = user.judgeCategory;
  if (category && team.category !== category) {
    throw new ApiError("Tim ini di luar kategori penugasan Anda.", 403);
  }
  const items = sheet.sections.flatMap((s) => s.items);
  const penaltyIds = validatePenalties(sheet.penalties, input.penaltyIds);
  const result = computeScore(items, input.values, sheet.penalties, penaltyIds);
  return { contest, sheet, team, items, result };
}

/** Simpan draf. Draf boleh berubah selama belum dikirim. */
export function saveDraft(user: SessionUser, input: SaveScoreInput): ScoreRow {
  guardJuri(user, input.contestId);
  guardCurrentTeam(user, input.contestId, input.teamId);
  const { contest, sheet, items, result } = buildScore(user, input);
  // Draf hanya menyimpan butir yang benar-benar diisi, supaya saat dibuka lagi
  // isian yang belum disentuh tetap kosong (Addendum 2.3).
  const entered: Values = {};
  for (const item of items) {
    const key = String(item.id);
    if (input.values[key] !== undefined) entered[key] = result.breakdown[key];
  }
  const db = getDb();
  const existing = findScore(sheet.id, input.teamId, user.id);
  if (existing && existing.status !== "draf") {
    throw new ApiError("Nilai sudah dikirim dan terkunci. Ajukan permintaan koreksi ke panitia.", 409);
  }
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(
      "UPDATE scores SET total = ?, breakdown = ?, penalties = ?, notes = ?, updated_at = ? WHERE id = ?",
    ).run(result.total, JSON.stringify(entered), JSON.stringify(result.penaltyIds), input.notes ?? null, now, existing.id);
    return findScoreById(existing.id);
  }
  const info = db
    .prepare(
      `INSERT INTO scores (contest_id, sheet_id, team_id, juri_id, status, total, breakdown, penalties, notes, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draf', ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      contest.id,
      sheet.id,
      input.teamId,
      user.id,
      result.total,
      JSON.stringify(entered),
      JSON.stringify(result.penaltyIds),
      input.notes ?? null,
      now,
      now,
    );
  return findScoreById(Number(info.lastInsertRowid));
}

/**
 * Kirim nilai beserta tanda tangan. Tanpa tanda tangan yang sah, server
 * menolak — tampilan bukan satu-satunya penjaga.
 */
export function submitScore(
  user: SessionUser,
  input: SaveScoreInput,
  signature: unknown,
  meta: SignatureMeta,
): ScoreRow {
  guardJuri(user, input.contestId);
  guardCurrentTeam(user, input.contestId, input.teamId);
  const { contest, sheet, team, items, result } = buildScore(user, input);
  const errors = validateValues(items, input.values);
  if (errors.length > 0) throw new ApiError(errors[0]);
  const checked = validateSignature(signature);
  if (!checked.ok) throw new ApiError(checked.message);

  const db = getDb();
  const existing = findScore(sheet.id, input.teamId, user.id);
  if (existing && existing.status !== "draf") {
    throw new ApiError("Nilai untuk tim ini sudah dikirim dan terkunci.", 409);
  }

  const now = new Date().toISOString();
  const revision = existing?.revision ?? 1;
  const contentHash = scoreContentHash({
    contestId: contest.id,
    contestName: contest.name,
    sheetVersion: sheet.version,
    teamId: team.id,
    teamNpp: team.npp,
    teamCategory: team.category,
    juriId: user.id,
    juriUsername: user.username,
    revision,
    values: result.breakdown,
    penaltyIds: result.penaltyIds,
    total: result.total,
    signedAt: now,
  });
  const storeSignature = safeStoreSignature(db);

  const tx = db.transaction(() => {
    let scoreId: number;
    if (existing) {
      db.prepare(
        `UPDATE scores SET status = 'terkirim', total = ?, breakdown = ?, penalties = ?, notes = ?,
                submitted_at = ?, updated_at = ?, pending_revision_id = NULL
         WHERE id = ?`,
      ).run(
        result.total,
        JSON.stringify(result.breakdown),
        JSON.stringify(result.penaltyIds),
        input.notes ?? null,
        now,
        now,
        existing.id,
      );
      scoreId = existing.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO scores (contest_id, sheet_id, team_id, juri_id, status, total, breakdown, penalties, notes, revision, created_at, updated_at, submitted_at)
           VALUES (?, ?, ?, ?, 'terkirim', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          contest.id,
          sheet.id,
          input.teamId,
          user.id,
          result.total,
          JSON.stringify(result.breakdown),
          JSON.stringify(result.penaltyIds),
          input.notes ?? null,
          revision,
          now,
          now,
          now,
        );
      scoreId = Number(info.lastInsertRowid);
    }
    storeSignature({
      scoreId,
      payload: checked.payload,
      contentHash,
      signatureHashValue: signatureHash(contentHash, checked.payload),
      signedAt: now,
      ip: meta.ip,
      device: meta.device,
    });
    markScored(contest.id, input.teamId);
    appendAudit(
      { id: user.id, name: user.name },
      "nilai.kirim",
      "score",
      scoreId,
      { contest: contest.name, teamId: input.teamId, total: result.total, signed: true },
    );
  });
  tx();
  return findScore(existing ? sheet.id : sheet.id, input.teamId, user.id)!;
}

export interface RevisionRow {
  id: number;
  score_id: number;
  old_total: number;
  new_total: number;
  old_breakdown: string;
  new_breakdown: string;
  penalties: string;
  reason: string;
  status: string;
  signed_at: string | null;
  admin_name: string;
  created_at: string;
}

/**
 * Koreksi admin tidak langsung mengubah peringkat. Revisi menunggu tanda
 * tangan ulang dari juri yang bersangkutan; selama itu nilai lama dipakai.
 */
export function correctScore(
  admin: SessionUser,
  scoreId: number,
  values: Values,
  penaltyIds: number[],
  reason: string,
): { score: ScoreRow; revisionId: number } {
  if (!can(admin, "nilai.koreksi")) throw new ApiError("Hanya admin yang dapat mengoreksi nilai.", 403);
  const cleanReason = reason.trim();
  if (cleanReason.length < 5) throw new ApiError("Alasan koreksi wajib diisi, minimal 5 karakter.");

  const db = getDb();
  const score = findScoreById(scoreId);
  if (!score.sheet_id) throw new ApiError("Nilai ini tidak dapat dikoreksi manual.");
  if (score.status === "draf") throw new ApiError("Nilai masih draf; minta juri mengirimnya lebih dulu.");
  if (score.pending_revision_id) {
    throw new ApiError("Masih ada revisi yang menunggu tanda tangan juri.", 409);
  }

  const sheet = sheetDetail(score.sheet_id);
  const items = sheet.sections.flatMap((s) => s.items);
  const errors = validateValues(items, values);
  if (errors.length > 0) throw new ApiError(errors[0]);
  const validPenalties = validatePenalties(sheet.penalties, penaltyIds);
  const result = computeScore(items, values, sheet.penalties, validPenalties);

  const now = new Date().toISOString();
  let revisionId = 0;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO score_revisions (score_id, old_total, new_total, old_breakdown, new_breakdown, penalties, reason, status, admin_id, admin_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu_tanda_tangan', ?, ?, ?)`,
      )
      .run(
        scoreId,
        score.total,
        result.total,
        score.breakdown,
        JSON.stringify(result.breakdown),
        JSON.stringify(validPenalties),
        cleanReason,
        admin.id,
        admin.name,
        now,
      );
    revisionId = Number(info.lastInsertRowid);
    db.prepare("UPDATE scores SET pending_revision_id = ?, updated_at = ? WHERE id = ?").run(
      revisionId,
      now,
      scoreId,
    );
    appendAudit({ id: admin.id, name: admin.name }, "nilai.koreksi", "score", scoreId, {
      reason: cleanReason,
      oldTotal: score.total,
      newTotal: result.total,
      revisionId,
      awaitingSignature: true,
    });
  });
  tx();
  return { score: findScoreById(scoreId), revisionId };
}

export function scoreRevisions(scoreId: number): RevisionRow[] {
  return getDb()
    .prepare("SELECT * FROM score_revisions WHERE score_id = ? ORDER BY id DESC")
    .all(scoreId) as RevisionRow[];
}

export interface PendingRevision {
  id: number;
  score_id: number;
  old_total: number;
  new_total: number;
  reason: string;
  status: string;
  admin_name: string;
  created_at: string;
  team_name: string;
  contest_name: string;
  contest_id: number;
  juri_id: number;
  revision: number;
}

export function pendingRevision(revisionId: number): (PendingRevision & { penalties: string; new_breakdown: string }) | undefined {
  return getDb()
    .prepare(
      `SELECT r.*, t.name AS team_name, c.name AS contest_name, c.id AS contest_id,
              s.juri_id AS juri_id, s.revision AS revision
       FROM score_revisions r
       JOIN scores s ON s.id = r.score_id
       JOIN teams t ON t.id = s.team_id
       JOIN contests c ON c.id = s.contest_id
       WHERE r.id = ?`,
    )
    .get(revisionId) as (PendingRevision & { penalties: string; new_breakdown: string }) | undefined;
}

export function pendingRevisions(juriId: number): PendingRevision[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.score_id, r.old_total, r.new_total, r.reason, r.status, r.admin_name, r.created_at,
              t.name AS team_name, c.name AS contest_name, c.id AS contest_id, s.juri_id, s.revision
       FROM score_revisions r
       JOIN scores s ON s.id = r.score_id
       JOIN teams t ON t.id = s.team_id
       JOIN contests c ON c.id = s.contest_id
       WHERE s.juri_id = ? AND r.status = 'menunggu_tanda_tangan'
       ORDER BY r.id DESC`,
    )
    .all(juriId) as PendingRevision[];
}

/** Juri menandatangani ulang revisi koreksi; baru setelah ini nilai berubah. */
export function signRevision(
  user: SessionUser,
  revisionId: number,
  signature: unknown,
  meta: SignatureMeta,
): ScoreRow {
  const db = getDb();
  const revision = pendingRevision(revisionId);
  if (!revision) throw new ApiError("Revisi tidak ditemukan.", 404);
  if (revision.status !== "menunggu_tanda_tangan") {
    throw new ApiError("Revisi ini sudah ditandatangani atau dibatalkan.", 409);
  }
  if (revision.juri_id !== user.id) {
    throw new ApiError("Hanya juri yang menilai tim ini yang dapat menandatangani revisi.", 403);
  }
  const checked = validateSignature(signature);
  if (!checked.ok) throw new ApiError(checked.message);

  const score = findScoreById(revision.score_id);
  if (!score.sheet_id) throw new ApiError("Lembar nilai tidak ditemukan.");
  const sheet = sheetDetail(score.sheet_id);
  const contest = getContest(score.contest_id);
  const team = getTeam(score.team_id);
  const items = sheet.sections.flatMap((s) => s.items);
  const values = parseValues(revision.new_breakdown);
  const errors = validateValues(items, values);
  if (errors.length > 0) throw new ApiError(errors[0]);
  const penaltyIds = validatePenalties(sheet.penalties, JSON.parse(revision.penalties) as number[]);
  const result = computeScore(items, values, sheet.penalties, penaltyIds);
  const now = new Date().toISOString();
  const nextRevision = score.revision + 1;
  const contentHash = scoreContentHash({
    contestId: contest.id,
    contestName: contest.name,
    sheetVersion: sheet.version,
    teamId: team.id,
    teamNpp: team.npp,
    teamCategory: team.category,
    juriId: user.id,
    juriUsername: user.username,
    revision: nextRevision,
    values: result.breakdown,
    penaltyIds: result.penaltyIds,
    total: result.total,
    signedAt: now,
  });
  const storeSignature = safeStoreSignature(db);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE scores SET status = 'dikoreksi', total = ?, breakdown = ?, penalties = ?, revision = ?,
              pending_revision_id = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(result.total, JSON.stringify(result.breakdown), JSON.stringify(result.penaltyIds), nextRevision, now, score.id);
    db.prepare("UPDATE score_revisions SET status = 'diterapkan', signed_at = ? WHERE id = ?").run(now, revisionId);
    storeSignature({
      scoreId: score.id,
      payload: checked.payload,
      contentHash,
      signatureHashValue: signatureHash(contentHash, checked.payload),
      signedAt: now,
      ip: meta.ip,
      device: meta.device,
    });
    appendAudit({ id: user.id, name: user.name }, "nilai.tanda_tangan_revisi", "score", score.id, {
      revisionId,
      revision: nextRevision,
      total: result.total,
    });
  });
  tx();
  return findScoreById(score.id);
}

export function requestCorrection(user: SessionUser, scoreId: number, reason: string): void {
  const score = findScoreById(scoreId);
  if (score.juri_id !== user.id) throw new ApiError("Anda hanya dapat mengajukan koreksi untuk nilai Anda sendiri.", 403);
  if (score.status === "draf") throw new ApiError("Nilai draf masih bisa Anda ubah sendiri.");
  if (reason.trim().length < 5) throw new ApiError("Tuliskan alasan koreksi minimal 5 karakter.");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO correction_requests (score_id, juri_id, reason, status, created_at) VALUES (?, ?, ?, 'menunggu', ?)`,
    )
    .run(scoreId, user.id, reason.trim(), now);
  appendAudit({ id: user.id, name: user.name }, "nilai.minta_koreksi", "score", scoreId, { reason: reason.trim() });
}

export function correctionRequests() {
  return getDb()
    .prepare(
      `SELECT r.*, s.total, s.status AS score_status, t.name AS team_name, c.name AS contest_name, u.name AS juri_name
       FROM correction_requests r
       JOIN scores s ON s.id = r.score_id
       JOIN teams t ON t.id = s.team_id
       JOIN contests c ON c.id = s.contest_id
       JOIN users u ON u.id = r.juri_id
       ORDER BY CASE r.status WHEN 'menunggu' THEN 0 ELSE 1 END, r.id DESC`,
    )
    .all() as {
    id: number;
    score_id: number;
    reason: string;
    status: string;
    created_at: string;
    total: number;
    team_name: string;
    contest_name: string;
    juri_name: string;
  }[];
}

export interface TeamScoreState {
  teamId: number;
  name: string;
  npp: string;
  category: string;
  scoreId: number | null;
  status: string | null;
  total: number | null;
  revision: number;
  updatedAt: string | null;
  position: number;
}

/** Riwayat juri: hanya tim yang sudah ia nilai, tanpa angka. */
export function myHistory(contestId: number, juriId: number) {
  return getDb()
    .prepare(
      `SELECT s.id, s.status, s.submitted_at, s.revision, q.position, t.npp, t.category,
              CASE WHEN c.anonymous = 1 THEN NULL ELSE t.name END AS team_name
       FROM scores s
       JOIN teams t ON t.id = s.team_id
       JOIN contests c ON c.id = s.contest_id
       LEFT JOIN team_queue q ON q.contest_id = s.contest_id AND q.team_id = s.team_id
       WHERE s.contest_id = ? AND s.juri_id = ? AND s.status != 'draf'
       ORDER BY COALESCE(s.submitted_at, s.updated_at) DESC`,
    )
    .all(contestId, juriId) as {
    id: number;
    status: string;
    submitted_at: string | null;
    revision: number;
    position: number | null;
    npp: string;
    category: string;
    team_name: string | null;
  }[];
}

export function progressFor(contestId: number, juriId: number, category?: string | null): { done: number; total: number } {
  const db = getDb();
  const total = queueFor(contestId).filter(
    (row) => (!category || row.category === category) && row.status !== "dilewati" && row.status !== "absen",
  ).length;
  const done = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM scores WHERE contest_id = ? AND juri_id = ? AND status != 'draf'",
      )
      .get(contestId, juriId) as { n: number }
  ).n;
  return { done, total };
}

export function scoreValues(row: ScoreRow): Values {
  return parseValues(row.breakdown);
}

export interface SignatureCheck {
  status: "ok" | "mismatch" | "missing";
  code: string | null;
  signedAt: string | null;
  image: string | null;
  juriName: string | null;
  points: number;
}

/** Verifikasi ulang: hash isi lembar dibandingkan dengan data yang tersimpan. */
export function verifyScoreSignature(scoreId: number): SignatureCheck {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id AS score_id, s.contest_id, s.juri_id, s.revision, s.total, s.breakdown, s.penalties,
              t.id AS team_id, t.npp, t.category, c.name AS contest_name, u.username, u.name AS juri_name,
              sh.version AS sheet_version
       FROM scores s
       JOIN teams t ON t.id = s.team_id
       JOIN contests c ON c.id = s.contest_id
       LEFT JOIN users u ON u.id = s.juri_id
       LEFT JOIN sheets sh ON sh.id = s.sheet_id
       WHERE s.id = ?`,
    )
    .get(scoreId) as
    | {
        score_id: number;
        contest_id: number;
        juri_id: number;
        revision: number;
        total: number;
        breakdown: string;
        penalties: string;
        team_id: number;
        npp: string;
        category: string;
        contest_name: string;
        username: string | null;
        juri_name: string | null;
        sheet_version: number;
      }
    | undefined;
  if (!row) return { status: "missing", code: null, signedAt: null, image: null, juriName: null, points: 0 };
  const signature = signatureByScore(scoreId);
  if (!signature) return { status: "missing", code: null, signedAt: null, image: null, juriName: row.juri_name, points: 0 };

  let recomputed: string | null = null;
  if (row.juri_id && row.username) {
    recomputed = scoreContentHash({
      contestId: row.contest_id,
      contestName: row.contest_name,
      sheetVersion: row.sheet_version,
      teamId: row.team_id,
      teamNpp: row.npp,
      teamCategory: row.category,
      juriId: row.juri_id,
      juriUsername: row.username,
      revision: row.revision,
      values: parseValues(row.breakdown),
      penaltyIds: JSON.parse(row.penalties) as number[],
      total: row.total,
      signedAt: signature.signed_at,
    });
  }
  const strokesOk = (() => {
    try {
      const parsed = JSON.parse(signature.strokes) as SignaturePayload["strokes"];
      return signatureHash(recomputed ?? "", { strokes: parsed, image: signature.image }) === signature.signature_hash;
    } catch {
      return false;
    }
  })();
  return {
    status: recomputed === signature.content_hash && strokesOk ? "ok" : "mismatch",
    code: signature.verification_code,
    signedAt: signature.signed_at,
    image: signature.image,
    juriName: row.juri_name,
    points: signature.points,
  };
}

export function pendingRevisionForScore(scoreId: number) {
  return getDb()
    .prepare("SELECT * FROM score_revisions WHERE score_id = ? AND status = 'menunggu_tanda_tangan' ORDER BY id DESC LIMIT 1")
    .get(scoreId) as RevisionRow | undefined;
}
