import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Card, Icon, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { CATEGORIES, categoryColor, formatScore } from "@/lib/constants";
import { listContests } from "@/lib/services/contests";
import { standings } from "@/lib/services/leaderboard";
import { getSetting } from "@/lib/db";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ contest?: string; category?: string }>;
}) {
  const user = await pageUser("laporan.unduh");
  const query = await searchParams;
  const contests = listContests();
  const contestId = Number(query.contest) || 0;
  const category = query.category ?? "semua";
  const contest = contests.find((c) => c.id === contestId);

  const rows = contestId ? standings(contestId).filter((r) => r.score !== null) : [];
  const filtered = category === "semua" ? rows : rows.filter((r) => r.category === category);
  const params = new URLSearchParams();
  if (contestId) params.set("contest", String(contestId));
  if (category !== "semua") params.set("category", category);
  const suffix = params.toString() ? `&${params.toString()}` : "";

  return (
    <AuthShell user={user} active="/admin/laporan">
      <PageHeader
        eyebrow="Laporan"
        title="Ekspor hasil lomba"
        description="Laporan Word rapi siap dicetak, ditandatangani, dan diserahkan ke sekolah. Excel untuk pengolahan lanjutan."
      />

      <Card className="mb-5">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="report-contest" className="label">
              Cakupan lomba
            </label>
            <select id="report-contest" name="contest" defaultValue={contestId ? String(contestId) : ""} className="input">
              <option value="">Seluruh acara</option>
              {contests.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-category" className="label">
              Kategori
            </label>
            <select id="report-category" name="category" defaultValue={category} className="input">
              <option value="semua">Semua kategori</option>
              {CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn btn-secondary w-full">
              Terapkan
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/export?format=docx${suffix}`} className="btn btn-primary" download>
            <Icon name="download" size={18} /> Unduh Word (.docx)
          </a>
          <a href={`/api/export?format=xlsx${suffix}`} className="btn btn-secondary" download>
            <Icon name="download" size={18} /> Unduh Excel (.xlsx)
          </a>
          <span className="self-center text-xs" style={{ color: "var(--c-muted)" }}>
            PDF belum tersedia; gunakan &quot;Cetak → Simpan sebagai PDF&quot; dari Word.
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="text-lg font-semibold">
            Pratinjau {contest ? contest.name : "seluruh acara"}
            {category !== "semua" ? ` · ${CATEGORIES.find((c) => c.key === category)?.label}` : ""}
          </h2>
          {!contestId ? (
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
              Pilih satu lomba untuk melihat pratinjau peringkat. Berkas Word tetap memuat seluruh lomba yang dipilih.
            </p>
          ) : filtered.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
              Belum ada nilai pada cakupan ini.
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                  <th className="py-2">Peringkat</th>
                  <th className="py-2">Tim</th>
                  <th className="py-2">Kategori</th>
                  <th className="py-2 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.teamId} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                    <td className="num py-2">{row.rank ?? "—"}</td>
                    <td className="py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(row.category) }} />
                      {row.name}
                    </td>
                    <td className="py-2" style={{ color: "var(--c-muted)" }}>
                      {CATEGORIES.find((c) => c.key === row.category)?.label}
                    </td>
                    <td className="num py-2 text-right font-semibold">{formatScore(row.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Isi laporan Word</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--c-muted)" }}>
            <li>Sampul: {getSetting("event_name")} · {getSetting("event_venue")} · {getSetting("event_year")}</li>
            <li>Ringkasan juara 1–3 setiap kategori di tiap lomba</li>
            <li>Tabel rekap nilai dan peringkat</li>
            <li>Rincian nilai per kriteria dan juri</li>
            <li>Blok pengesahan untuk tanda tangan panitia dan kepala sekolah</li>
          </ul>
          <p className="mt-3 text-sm" style={{ color: "var(--c-muted)" }}>
            Berkas Excel memuat tiga lembar: Rekap Nilai, Rincian Kriteria, dan Ujian LCTP.
          </p>
          <Link href="/admin/nilai" className="btn btn-secondary mt-4 text-sm">
            Pastikan nilai sudah dirilis
          </Link>
        </Card>
      </div>
    </AuthShell>
  );
}
