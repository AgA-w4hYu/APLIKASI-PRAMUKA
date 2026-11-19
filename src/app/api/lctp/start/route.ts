import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { startExam } from "@/lib/services/lctp";

export const POST = route(async (req: Request) => {
  const user = await requirePermission("ujian.kerjakan");
  const body = await readJson<{ contestId?: number }>(req);
  if (!body.contestId) throw new ApiError("Lomba ujian wajib dipilih.");
  const payload = startExam(user, Number(body.contestId));
  return NextResponse.json({ ok: true, exam: payload });
});
