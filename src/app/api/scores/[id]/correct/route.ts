import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { correctScore } from "@/lib/services/penilaian";
import type { Values } from "@/lib/scoring";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const admin = await requirePermission("nilai.koreksi");
  const { id } = await ctx.params;
  const body = await readJson<{ values?: Values; penaltyIds?: number[]; reason?: string }>(req);
  if (!body.values) throw new ApiError("Nilai baru belum diisi.");
  const result = correctScore(
    admin,
    Number(id),
    body.values,
    Array.isArray(body.penaltyIds) ? body.penaltyIds.map(Number) : [],
    body.reason ?? "",
  );
  return NextResponse.json({
    ok: true,
    pendingSignature: true,
    revisionId: result.revisionId,
    total: result.score.total,
    revision: result.score.revision,
    message:
      "Revisi tersimpan dan menunggu tanda tangan ulang juri. Peringkat tetap memakai nilai lama sampai ditandatangani.",
  });
});
