"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { appendAudit } from "@/lib/audit";
import { SESSION_COOKIE, changeOwnPassword, getSession, revokeAllSessions } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

export async function changePasswordAction(form: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const repeat = String(form.get("repeat") ?? "");
  if (next !== repeat) {
    redirect("/akun/sandi?error=" + encodeURIComponent("Ketik ulang kata sandi baru dengan sama."));
  }
  try {
    await changeOwnPassword(user.id, current, next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kata sandi tidak dapat diubah.";
    redirect("/akun/sandi?error=" + encodeURIComponent(message));
  }
  const store = await cookies();
  revokeAllSessions(user.id, store.get(SESSION_COOKIE)?.value);
  appendAudit({ id: user.id, name: user.name }, "pengguna.ganti_sandi", "user", user.id, {});
  redirect(homeFor(user) + "?ok=" + encodeURIComponent("Kata sandi diperbarui. Silakan masuk kembali dengan kata sandi baru."));
}
