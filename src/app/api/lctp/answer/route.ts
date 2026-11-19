import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { saveAnswer } from "@/lib/services/lctp";

export const POST = route(async (req: Request) => {
  const user = await requirePermission("ujian.kerjakan");
  const body = await readJson<{ sessionId?: number; questionId?: number; choice?: number }>(req);
  if (!body.sessionId || !body.questionId || body.choice === undefined) {
    throw new ApiError("Jawaban tidak lengkap.");
  }
  const result = saveAnswer(user, Number(body.sessionId), Number(body.questionId), Number(body.choice));
  return NextResponse.json({ ok: true, ...result });
});
