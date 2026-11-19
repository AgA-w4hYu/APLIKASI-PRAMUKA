import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Alert, Badge, Card, Icon, PageHeader, ProgressBar, Stat } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { dashboardData } from "@/lib/services/dashboard";
import { CONTEST_STATUS, formatScore } from "@/lib/constants";

export default async function AdminDashboard() {
  const user = await pageUser("dashboard.lihat");
  const data = dashboardData();

  return (
    <AuthShell user={user} active="/admin">
      <PageHeader
        eyebrow="Panitia"
        title="Dashboard monitoring"
        description="Pantau progres penilaian, status juri, dan ujian LCTP dari satu layar."
        actions={<AutoRefresh generatedAt={data.generatedAt} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tim terdaftar" value={data.counts.teams} hint={`${data.counts.users} akun aktif`} icon="teams" />
        <Stat label="Juri bertugas" value={data.counts.juri} hint="Di semua lomba" icon="shield" />
        <Stat label="Nilai terkirim" value={data.counts.submitted} hint={`${data.counts.locked} nilai terkunci`} icon="score" />
        <Stat
          label="Ujian LCTP"
          value={`${data.lctp.selesai}/${data.counts.teams}`}
          hint={`${data.lctp.berjalan} sedang mengerjakan`}
          icon="exam"
        />
      </div>

      {data.warnings.length > 0 ? (
        <div className="mt-6 space-y-2">
          {data.warnings.map((warning) => (
            <Alert key={warning.kind} tone="warning" title="Perlu perhatian">
              {warning.message}
            </Alert>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <Alert tone="success" title="Semua terkendali">
            Tidak ada peringatan hari ini.
          </Alert>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Progres penilaian</h2>
            <Link href="/admin/nilai" className="link text-sm">
              Buka nilai
            </Link>
          </div>
          <div className="space-y-5">
            {data.contests.map((contest) => (
              <div key={contest.id}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{contest.name}</span>
                    <Badge tone={contest.status === "berjalan" ? "success" : "neutral"}>
                      {CONTEST_STATUS[contest.status] ?? contest.status}
                    </Badge>
                    {contest.type === "lctp" ? <Badge tone="accent">Otomatis</Badge> : null}
                  </div>
                  <span className="text-xs" style={{ color: "var(--c-muted)" }}>
                    {contest.released.length > 0
                      ? `Dirilis: ${contest.released.length} kategori`
                      : "Belum dirilis"}
                  </span>
                </div>
                <ProgressBar value={contest.done} max={contest.total} label="Nilai masuk" />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-semibold">Status juri</h2>
          {data.juri.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              Belum ada juri yang ditugaskan.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--c-border)" }}>
              {data.juri.map((juri) => (
                <li key={`${juri.name}-${juri.contest}`} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{juri.name}</p>
                    <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                      {juri.contest} · {juri.done}/{juri.total}
                    </p>
                  </div>
                  <Badge
                    tone={juri.state === "selesai" ? "success" : juri.state === "sebagian" ? "accent" : "neutral"}
                  >
                    {juri.state === "selesai" ? "Selesai" : juri.state === "sebagian" ? "Sedang menilai" : "Belum mulai"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl font-semibold">Tim per kategori</h2>
          <div className="grid grid-cols-3 gap-3">
            {data.teamsByCategory.map((category) => (
              <div key={category.category} className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
                <p className="num text-2xl font-semibold">{category.count}</p>
                <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                  {category.label}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/tim" className="btn btn-secondary text-sm">
              <Icon name="teams" size={16} /> Kelola tim
            </Link>
            <Link href="/leaderboard" className="btn btn-secondary text-sm">
              <Icon name="trophy" size={16} /> Lihat leaderboard
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-xl font-semibold">Papan LCTP</h2>
          {data.lctp.totalQuestions === 0 ? (
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              Bank soal masih kosong.{" "}
              <Link href="/admin/lctp" className="link">
                Tambah soal
              </Link>
            </p>
          ) : (
            <>
              <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                {data.lctp.totalQuestions} soal siap · {data.lctp.selesai} tim selesai · {data.lctp.berjalan} sedang
                mengerjakan
              </p>
              <ol className="mt-3 space-y-2">
                {data.lctp.top.map((row, index) => (
                  <li key={row.team} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="num mr-2" style={{ color: "var(--c-muted)" }}>
                        {index + 1}.
                      </span>
                      {row.team}
                    </span>
                    <span className="num font-semibold">{formatScore(row.score)}</span>
                  </li>
                ))}
                {data.lctp.top.length === 0 ? (
                  <li className="text-sm" style={{ color: "var(--c-muted)" }}>
                    Belum ada yang menyelesaikan ujian.
                  </li>
                ) : null}
              </ol>
            </>
          )}
        </Card>
      </div>
    </AuthShell>
  );
}
