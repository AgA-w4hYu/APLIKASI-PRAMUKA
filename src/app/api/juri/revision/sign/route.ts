import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { signRevision } from "@/lib/services/penilaian";
import type { SignaturePayload } from "@/lib/signature";

export const POST = route(async (req: Request) => {
  const user = await requirePermission("nilai.kirim");
  const body = await readJson<{ revisionId?: number; signature?: SignaturePayload }>(req);
  if (!body.revisionId) throw new ApiError("Revisi wajib dipilih.");
  if (!body.signature) throw new ApiError("Tanda tangan wajib sebelum revisi diterapkan.", 422);
  const forwarded = req.headers.get("x-forwarded-for");
  const score = signRevision(user, Number(body.revisionId), body.signature, {
    ip: forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip"),
    device: req.headers.get("user-agent")?.slice(0, 250) ?? null,
  });
  return NextResponse.json({ ok: true, total: score.total, revision: score.revision });
});
