import { NextResponse } from "next/server";
import { readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { requestCorrection } from "@/lib/services/penilaian";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requirePermission("nilai.kirim");
  const { id } = await ctx.params;
  const body = await readJson<{ reason?: string }>(req);
  requestCorrection(user, Number(id), body.reason ?? "");
  return NextResponse.json({ ok: true });
});
