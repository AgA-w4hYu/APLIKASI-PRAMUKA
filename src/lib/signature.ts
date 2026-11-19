import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

export interface StrokePoint {
  t: number;
  x: number;
  y: number;
  p: number;
}

export interface SignaturePayload {
  strokes: StrokePoint[][];
  image: string;
  deviceTime?: string;
}

export interface SignatureRow {
  id: number;
  score_id: number;
  strokes: string;
  image: string;
  content_hash: string;
  signature_hash: string;
  points: number;
  signed_at: string;
  device_time: string | null;
  ip: string | null;
  device: string | null;
  verification_code: string;
}

const MIN_POINTS = 15;
const MIN_LENGTH = 200;

function pathLength(strokes: StrokePoint[][]): number {
  let length = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      length += Math.hypot(stroke[index].x - stroke[index - 1].x, stroke[index].y - stroke[index - 1].y);
    }
  }
  return length;
}

/** Kotak kosong atau satu titik ditolak; pesannya ramah. */
export function validateSignature(payload: unknown): { ok: true; payload: SignaturePayload } | { ok: false; message: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Tanda tangan belum dibuat. Silakan tanda tangan di dalam kotak." };
  }
  const candidate = payload as SignaturePayload;
  if (!Array.isArray(candidate.strokes) || candidate.strokes.length === 0) {
    return { ok: false, message: "Tanda tangan masih kosong. Silakan tanda tangan di dalam kotak." };
  }
  const strokes: StrokePoint[][] = [];
  let points = 0;
  for (const stroke of candidate.strokes) {
    if (!Array.isArray(stroke)) continue;
    const clean = stroke
      .map((point) => ({
        t: Number(point?.t) || 0,
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
        p: Number(point?.p) || 0.5,
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    points += clean.length;
    if (clean.length > 1) strokes.push(clean);
  }
  if (points < MIN_POINTS || pathLength(strokes) < MIN_LENGTH) {
    return {
      ok: false,
      message: "Tanda tangan terlalu pendek. Tulis nama Anda dengan jelas di dalam kotak, lalu coba lagi.",
    };
  }
  if (typeof candidate.image !== "string" || !candidate.image.startsWith("data:image/")) {
    return { ok: false, message: "Gambar tanda tangan tidak terbaca. Hapus lalu ulangi." };
  }
  if (candidate.image.length > 1_500_000) {
    return { ok: false, message: "Gambar tanda tangan terlalu besar. Hapus lalu ulangi." };
  }
  return {
    ok: true,
    payload: { strokes, image: candidate.image, deviceTime: candidate.deviceTime },
  };
}

export interface ScoreContentInput {
  contestId: number;
  contestName: string;
  sheetVersion: number;
  teamId: number;
  teamNpp: string;
  teamCategory: string;
  juriId: number;
  juriUsername: string;
  revision: number;
  values: Record<string, number>;
  penaltyIds: number[];
  total: number;
  signedAt: string;
}

/**
 * Isi lembar dinormalkan agar hash stabil: butir diurutkan menurut id dan
 * angka dibulatkan dua desimal. Mengubah satu angka di basis data membuat
 * hash tidak cocok lagi saat verifikasi.
 */
export function scoreContentHash(input: ScoreContentInput): string {
  const values = Object.keys(input.values)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => `${key}:${Number(input.values[key]).toFixed(2)}`)
    .join(",");
  const penalties = [...input.penaltyIds].sort((a, b) => a - b).join(",");
  const canonical = [
    "ab9-score-v2",
    input.contestId,
    input.contestName,
    input.sheetVersion,
    input.teamId,
    input.teamNpp,
    input.teamCategory,
    input.juriId,
    input.juriUsername,
    input.revision,
    values,
    penalties,
    input.total.toFixed(2),
    input.signedAt,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function signatureHash(contentHash: string, payload: SignaturePayload): string {
  return createHash("sha256")
    .update(`${contentHash}|${JSON.stringify(payload.strokes)}|${payload.image}`)
    .digest("hex");
}

export function verificationCode(hash: string): string {
  return hash.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}

export function signatureByScore(scoreId: number): SignatureRow | undefined {
  return getDb().prepare("SELECT * FROM signatures WHERE score_id = ?").get(scoreId) as SignatureRow | undefined;
}

export function verificationCodeExists(code: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 AS ok FROM signatures WHERE verification_code = ?").get(code));
}

export function scoreIdByVerificationCode(code: string): number | null {
  const row = getDb()
    .prepare("SELECT score_id FROM signatures WHERE verification_code = ?")
    .get(code.trim().toUpperCase()) as { score_id: number } | undefined;
  return row?.score_id ?? null;
}

export function safeStoreSignature(
  db = getDb(),
): (row: {
  scoreId: number;
  payload: SignaturePayload;
  contentHash: string;
  signatureHashValue: string;
  signedAt: string;
  ip: string | null;
  device: string | null;
}) => void {
  return ({ scoreId, payload, contentHash, signatureHashValue, signedAt, ip, device }) => {
    let code = verificationCode(contentHash);
    let salt = 0;
    while (verificationCodeExists(code)) {
      salt += 1;
      code = verificationCode(signatureHashValue + salt);
    }
    const points = payload.strokes.reduce((sum, stroke) => sum + stroke.length, 0);
    db.prepare(
      `INSERT INTO signatures (score_id, strokes, image, content_hash, signature_hash, points, signed_at, device_time, ip, device, verification_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(score_id) DO UPDATE SET
         strokes = excluded.strokes, image = excluded.image, content_hash = excluded.content_hash,
         signature_hash = excluded.signature_hash, points = excluded.points, signed_at = excluded.signed_at,
         device_time = excluded.device_time, ip = excluded.ip, device = excluded.device`,
    ).run(
      scoreId,
      JSON.stringify(payload.strokes),
      payload.image,
      contentHash,
      signatureHashValue,
      points,
      signedAt,
      payload.deviceTime ?? null,
      ip,
      device,
      code,
    );
  };
}
