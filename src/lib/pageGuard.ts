import { redirect } from "next/navigation";
import { can, getSession, type SessionUser } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

export async function pageUser(permission?: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  // Addendum 4.1: wajib ganti kata sandi saat masuk pertama.
  if (user.mustChangePassword) redirect("/akun/sandi");
  if (permission && !can(user, permission)) redirect(homeFor(user));
  return user;
}
