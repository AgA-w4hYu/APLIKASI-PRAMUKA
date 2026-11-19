import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { advanceByJudge } from "@/lib/queue";

export const POST = route(async (req: Request) => {
  const user = await requirePermission("nilai.kirim");
  const url = new URL(req.url);
  const contestId = Number(url.searchParams.get("contestId"));
  if (!contestId) {
    return NextResponse.json({ error: "Lomba wajib dipilih." }, { status: 400 });
  }
  const next = advanceByJudge(user, contestId);
  return NextResponse.json({
    ok: true,
    next: next ? { teamId: next.team_id, position: next.position } : null,
    message: next ? "Tim berikutnya sudah dipanggil." : "Semua tim pada antrean sudah selesai.",
  });
});
