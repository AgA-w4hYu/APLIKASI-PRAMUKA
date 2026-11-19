"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { releaseContest, unreleaseContest } from "@/lib/services/leaderboard";
import { appendAudit } from "@/lib/audit";

function back(path: string, message: string, ok = true): never {
  redirect(`${path}?${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);
}

export async function releaseAction(form: FormData): Promise<void> {
  const admin = await requirePermission("rilis.ubah");
  const contestId = Number(form.get("contestId"));
  const category = String(form.get("category") ?? "");
  const mode = String(form.get("mode") ?? "release");
  if (!contestId || !category) back("/admin/nilai", "Lomba dan kategori wajib dipilih.", false);
  if (mode === "unrelease") {
    unreleaseContest(admin, contestId, category);
    revalidatePath("/admin/nilai");
    revalidatePath("/leaderboard");
    back("/admin/nilai", "Rilis nilai ditarik kembali.");
  }
  releaseContest(admin, contestId, category);
  revalidatePath("/admin/nilai");
  revalidatePath("/leaderboard");
  back("/admin/nilai", "Nilai dirilis. Peserta sekarang dapat melihat total timnya sendiri.");
}

export async function decideCorrectionAction(form: FormData): Promise<void> {
  const admin = await requirePermission("nilai.koreksi");
  const requestId = Number(form.get("requestId"));
  const decision = String(form.get("decision") ?? "ditolak");
  const db = getDb();
  const request = db.prepare("SELECT * FROM correction_requests WHERE id = ?").get(requestId) as
    | { id: number; score_id: number; status: string }
    | undefined;
  if (!request) back("/admin/nilai", "Permintaan koreksi tidak ditemukan.", false);
  db.prepare(
    "UPDATE correction_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?",
  ).run(decision, new Date().toISOString(), admin.name, requestId);
  appendAudit({ id: admin.id, name: admin.name }, "koreksi.keputusan", "correction_request", requestId, {
    decision,
  });
  revalidatePath("/admin/nilai");
  back(
    "/admin/nilai",
    decision === "disetujui"
      ? "Permintaan disetujui. Lakukan koreksi pada nilai terkait."
      : "Permintaan koreksi ditolak.",
  );
}
