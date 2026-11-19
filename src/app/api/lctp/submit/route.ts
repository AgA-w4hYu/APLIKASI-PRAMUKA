import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { submitExam } from "@/lib/services/lctp";

export const POST = route(async (req: Request) => {
  const user = await requirePermission("ujian.kerjakan");
  const body = await readJson<{ sessionId?: number }>(req);
  if (!body.sessionId) throw new ApiError("Sesi ujian tidak dikenal.");
  const result = submitExam(user, Number(body.sessionId));
  return NextResponse.json({ ok: true, ...result });
});
