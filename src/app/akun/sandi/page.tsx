import Link from "next/link";
import { Flash } from "@/components/Flash";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Card, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/nav";
import { changePasswordAction } from "@/app/akun/actions";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const flash = await searchParams;

  return (
    <AuthShell user={user} active="/akun/sandi">
      <PageHeader
        eyebrow="Keamanan akun"
        title="Ganti kata sandi"
        description="Gunakan kata sandi yang mudah Anda ingat tetapi sulit ditebak orang lain."
      />
      <Flash ok={flash.ok} error={flash.error} />

      {user.mustChangePassword ? (
        <div className="mb-4">
          <Alert tone="warning" title="Wajib ganti kata sandi">
            Panitia meminta Anda mengganti kata sandi awal sebelum memakai aplikasi. Setelah disimpan, masuk kembali
            dengan kata sandi baru.
          </Alert>
        </div>
      ) : null}

      <Card className="max-w-lg">
        <form action={changePasswordAction} className="space-y-4">
          <div>
            <label htmlFor="current" className="label">
              Kata sandi saat ini
            </label>
            <input id="current" name="current" type="password" className="input min-h-[56px]" autoComplete="current-password" required />
          </div>
          <div>
            <label htmlFor="next" className="label">
              Kata sandi baru
            </label>
            <input id="next" name="next" type="password" className="input min-h-[56px]" autoComplete="new-password" minLength={8} required />
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Minimal 8 karakter, memuat huruf dan angka.
            </p>
          </div>
          <div>
            <label htmlFor="repeat" className="label">
              Ketik ulang kata sandi baru
            </label>
            <input id="repeat" name="repeat" type="password" className="input min-h-[56px]" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-lg">
              Simpan kata sandi baru
            </button>
            <Link href={homeFor(user)} className="btn btn-secondary btn-lg">
              Kembali
            </Link>
          </div>
        </form>
      </Card>
    </AuthShell>
  );
}
