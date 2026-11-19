import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { AuthShell } from "@/components/AuthShell";
import { PrintButton } from "@/components/PrintButton";
import { Alert, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getDb } from "@/lib/db";
import { categoryLabel } from "@/lib/constants";
import { markCardsPrintedAction } from "@/app/admin/actions";

export default async function AccountCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; ok?: string; error?: string }>;
}) {
  const user = await pageUser("pengguna.kelola");
  const query = await searchParams;
  const role = query.role === "peserta" ? "peserta" : "juri";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.username, t.name AS team_name, t.npp, t.category AS team_category,
              c.name AS contest_name
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id
       LEFT JOIN assignments a ON a.juri_id = u.id
       LEFT JOIN contests c ON c.id = a.contest_id
       WHERE u.role = ? AND u.active = 1
       ORDER BY COALESCE(c.name, t.category) ASC, u.name ASC`,
    )
    .all(role) as {
    id: number;
    name: string;
    username: string;
    team_name: string | null;
    npp: string | null;
    team_category: string | null;
    contest_name: string | null;
  }[];

  const header = await headers();
  const host = header.get("host") ?? "localhost:3100";
  const proto = header.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const loginUrl = `${proto}://${host}/login`;
  const cards = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      qr: await QRCode.toDataURL(loginUrl, { margin: 0, width: 220 }),
    })),
  );

  return (
    <AuthShell user={user} active="/admin/pengguna">
      <div className="no-print">
        <PageHeader
          eyebrow="Administrasi"
          title="Kartu akun"
          description="Kartu berisi nama, nama pengguna, alamat aplikasi, dan kode QR menuju halaman login. Kata sandi tidak dicetak ulang karena hanya hash yang tersimpan — bagikan kata sandi saat dibuat atau setelah direset."
          actions={
            <>
              <Link href="/admin/pengguna" className="btn btn-secondary">
                Kembali
              </Link>
              <PrintButton label="Cetak / Simpan PDF" />
            </>
          }
        />
        {query.ok ? (
          <div className="mb-4">
            <Alert tone="success" title="Tercatat">{query.ok}</Alert>
          </div>
        ) : null}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/admin/pengguna/kartu?role=juri" className="btn text-sm" style={role === "juri" ? { background: "var(--c-primary)", color: "var(--c-on-primary)" } : { border: "1px solid var(--c-border)" }}>
            Kartu juri ({role === "juri" ? cards.length : "—"})
          </Link>
          <Link href="/admin/pengguna/kartu?role=peserta" className="btn text-sm" style={role === "peserta" ? { background: "var(--c-primary)", color: "var(--c-on-primary)" } : { border: "1px solid var(--c-border)" }}>
            Kartu peserta
          </Link>
          <form action={markCardsPrintedAction}>
            <input type="hidden" name="role" value={role} />
            <button type="submit" className="btn btn-secondary text-sm">
              Catat pencetakan {role}
            </button>
          </form>
          <span className="text-sm" style={{ color: "var(--c-muted)" }}>
            {cards.length} kartu · alamat {loginUrl}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.id}
            className="card break-inside-avoid p-4 print:rounded-none print:border print:border-gray-400 print:shadow-none"
          >
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--c-accent)" }}>
              ABRAKADABRA 9 · SMK Telkom 1 Medan
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--c-muted)" }}>
              Kartu {role === "juri" ? "Juri" : "Peserta"}
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-tight">{card.name}</h2>
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>
              {role === "juri"
                ? card.contest_name ?? "Belum ditugaskan"
                : `${card.npp ?? ""} · ${card.team_name ?? ""}`}
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[0.65rem] uppercase tracking-widest" style={{ color: "var(--c-muted)" }}>
                  Nama pengguna
                </p>
                <p className="num text-lg font-bold">{card.username}</p>
                <p className="mt-2 text-[0.65rem] uppercase tracking-widest" style={{ color: "var(--c-muted)" }}>
                  Kata sandi
                </p>
                <p className="text-xs">………………………………</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.qr} alt={`Kode QR menuju ${loginUrl}`} width={72} height={72} className="shrink-0" />
            </div>
            <p className="mt-2 break-all text-[0.6rem]" style={{ color: "var(--c-muted)" }}>
              {loginUrl}
            </p>
          </article>
        ))}
      </div>

      {cards.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--c-muted)" }}>
          Belum ada akun aktif untuk peran ini.
        </p>
      ) : null}
    </AuthShell>
  );
}
