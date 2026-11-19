import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { saveDraft, submitScore, scoreValues } from "@/lib/services/penilaian";
import type { Values } from "@/lib/scoring";
import type { SignaturePayload } from "@/lib/signature";

interface Body {
  contestId?: number;
  teamId?: number;
  values?: Values;
  penaltyIds?: number[];
  notes?: string;
  action?: "draft" | "submit";
  signature?: SignaturePayload;
}

function clientMeta(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip"),
    device: req.headers.get("user-agent")?.slice(0, 250) ?? null,
  };
}

export const POST = route(async (req: Request) => {
  const user = await requirePermission("nilai.kirim");
  const body = await readJson<Body>(req);
  if (!body.contestId || !body.teamId) throw new ApiError("Lomba dan tim wajib dipilih.");
  if (!body.values || typeof body.values !== "object") throw new ApiError("Nilai belum diisi.");

  const input = {
    contestId: Number(body.contestId),
    teamId: Number(body.teamId),
    values: body.values,
    penaltyIds: Array.isArray(body.penaltyIds) ? body.penaltyIds.map(Number) : [],
    notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : undefined,
  };

  if (body.action === "submit") {
    if (!body.signature) {
      throw new ApiError("Tanda tangan juri wajib sebelum nilai dikirim.", 422);
    }
    const score = submitScore(user, input, body.signature, clientMeta(req));
    return NextResponse.json({
      ok: true,
      id: score.id,
      status: score.status,
      total: score.total,
      revision: score.revision,
      savedAt: score.updated_at,
    });
  }

  const score = saveDraft(user, input);
  return NextResponse.json({
    ok: true,
    id: score.id,
    status: score.status,
    total: score.total,
    revision: score.revision,
    savedAt: score.updated_at,
    values: scoreValues(score),
  });
});
