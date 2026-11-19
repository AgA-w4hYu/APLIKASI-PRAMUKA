"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { callNext, currentEntry, moveQueueEntry, setQueueStatus } from "@/lib/queue";

function back(message: string, ok = true): never {
  redirect(`/admin/antrean?${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);
}

export async function nextTeamAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const contestId = Number(form.get("contestId"));
  if (!contestId) back("Lomba wajib dipilih.", false);
  const current = currentEntry(contestId);
  const next = callNext(contestId);
  appendAudit({ id: admin.id, name: admin.name }, "antrean.maju_admin", "contest", contestId, {
    from: current?.team_id ?? null,
    to: next?.team_id ?? null,
  });
  revalidatePath("/admin/antrean");
  revalidatePath("/juri");
  back(next ? `Tim nomor ${next.position} dipanggil.` : "Antrean sudah habis.");
}

export async function skipTeamAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const entryId = Number(form.get("entryId"));
  const status = form.get("status") === "absen" ? "absen" : "dilewati";
  setQueueStatus(admin, entryId, status);
  revalidatePath("/admin/antrean");
  revalidatePath("/juri");
  back(status === "absen" ? "Tim ditandai absen." : "Tim dilewati.");
}

export async function restoreTeamAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const entryId = Number(form.get("entryId"));
  setQueueStatus(admin, entryId, "menunggu");
  revalidatePath("/admin/antrean");
  revalidatePath("/juri");
  back("Tim dikembalikan ke antrean.");
}

export async function moveTeamAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const entryId = Number(form.get("entryId"));
  const direction = form.get("direction") === "naik" ? "naik" : "turun";
  moveQueueEntry(admin, entryId, direction);
  revalidatePath("/admin/antrean");
  back("Urutan antrean diperbarui.");
}

export async function toggleAnonymousAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const contestId = Number(form.get("contestId"));
  const db = getDb();
  const contest = db.prepare("SELECT id, name, anonymous FROM contests WHERE id = ?").get(contestId) as
    | { id: number; name: string; anonymous: number }
    | undefined;
  if (!contest) back("Lomba tidak ditemukan.", false);
  db.prepare("UPDATE contests SET anonymous = ? WHERE id = ?").run(contest.anonymous ? 0 : 1, contestId);
  appendAudit({ id: admin.id, name: admin.name }, "lomba.anonim", "contest", contestId, {
    anonymous: !contest.anonymous,
  });
  revalidatePath("/admin/antrean");
  revalidatePath("/juri");
  back(contest.anonymous ? "Mode anonim dimatikan." : "Mode anonim diaktifkan: juri hanya melihat nomor urut.");
}
