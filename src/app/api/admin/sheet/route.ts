import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { saveSheet, type SheetPayload } from "@/lib/services/sheets";

export const POST = route(async (req: Request) => {
  const admin = await requirePermission("lembar.ubah");
  const body = await readJson<{ contestId?: number; payload?: SheetPayload; lock?: boolean }>(req);
  if (!body.contestId || !body.payload) throw new ApiError("Data lembar penilaian tidak lengkap.");
  const result = saveSheet(admin, Number(body.contestId), body.payload, Boolean(body.lock));
  return NextResponse.json({ ok: true, ...result });
});
