import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Badge, Card, EmptyState, Icon, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getDb } from "@/lib/db";
import { CATEGORIES, contestStatusLabel, formatScore } from "@/lib/constants";
import { getTeam, listContests } from "@/lib/services/contests";
import { releasedCategories, teamScoreDetail, teamTotal } from "@/lib/services/leaderboard";

export default async function PesertaHome() {
  const user = await pageUser("nilai.sendiri");
  if (!user.teamId) {
    return (
      <AuthShell user={user} active="/peserta">
        <PageHeader title="Akun belum terhubung ke tim" />
        <Alert tone="danger" title="Hubungi panitia">
          Akun ini belum memiliki data tim. Panitia dapat menghubungkannya di menu Tim &amp; Akun.
        </Alert>
      </AuthShell>
    );
  }

  const team = getTeam(user.teamId);
  const category = CATEGORIES.find((c) => c.key === team.category);
  const contests = listContests();
  const scores = teamScoreDetail(team.id);
  const total = teamTotal(team.id);
  const db = getDb();
  const lctp = contests.find((c) => c.type === "lctp");
  const session = lctp
    ? (db
        .prepare("SELECT status, score FROM exam_sessions WHERE contest_id = ? AND team_id = ?")
        .get(lctp.id, team.id) as { status: string; score: number | null } | undefined)
    : undefined;

  return (
    <AuthShell user={user} active="/peserta" teamName={team.name}>
      <div
        className="rounded-2xl p-6 text-white sm:p-8"
        style={{ background: category?.color ?? "var(--c-primary)" }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">{category?.label}</p>
        <h1 className="display mt-2 text-3xl font-semibold sm:text-5xl">{team.name}</h1>
        <p className="num mt-1 opacity-85">{team.npp}</p>
        <p className="mt-4 max-w-xl text-sm opacity-85">
          Nilai tim Anda hanya dapat dilihat oleh tim Anda sendiri. Peringkat di leaderboard terbuka untuk semua, tetapi
          angka nilai tim lain tidak ditampilkan.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Total nilai dirilis
          </p>
          <p className="num text-3xl font-semibold">{formatScore(total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Lomba sudah dirilis
          </p>
          <p className="num text-3xl font-semibold">{scores.filter((s) => s.released).length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Ujian LCTP
          </p>
          <p className="text-2xl font-semibold">
            {session ? (session.status === "selesai" ? "Sudah dikerjakan" : "Sedang berlangsung") : "Belum"}
          </p>
        </div>
      </div>

      {lctp ? (
        <Card className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ujian {lctp.name}</h2>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              {lctp.duration_min} menit · {lctp.team_size} orang per tim · {contestStatusLabel(lctp.status)}
            </p>
          </div>
          <Link href="/peserta/lctp" className="btn btn-primary">
            <Icon name="exam" size={18} />
            {session?.status === "selesai" ? "Lihat status" : session ? "Lanjutkan ujian" : "Buka ujian"}
          </Link>
        </Card>
      ) : null}

      <h2 className="mb-3 mt-8 text-2xl font-semibold">Rekap nilai tim</h2>
      {scores.length === 0 ? (
        <EmptyState title="Belum ada lomba">Panitia belum menyiapkan lomba.</EmptyState>
      ) : (
        <div className="space-y-3">
          {scores.map((score) => {
            const released = score.released && releasedCategories(score.contestId).includes(team.category);
            return (
              <Card key={score.contestId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{score.contestName}</h3>
                    <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                      {released
                        ? score.total !== null
                          ? `Peringkat ${score.rank ?? "—"} dari ${score.of} tim`
                          : "Nilai belum diinput juri"
                        : "Nilai belum dirilis panitia"}
                    </p>
                  </div>
                  {released ? (
                    <div className="text-right">
                      <p className="num text-3xl font-semibold">{formatScore(score.total)}</p>
                      <Badge tone="success">Dirilis</Badge>
                    </div>
                  ) : (
                    <Badge tone="accent">Menunggu rilis</Badge>
                  )}
                </div>

                {released && score.detail.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--c-primary)" }}>
                      Rincian per kriteria
                    </summary>
                    <table className="mt-2 w-full text-sm">
                      <tbody>
                        {score.detail.map((item) => (
                          <tr key={item.item} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                            <td className="py-1.5">{item.item}</td>
                            <td className="num py-1.5 text-right">{formatScore(item.value)}</td>
                            <td className="num py-1.5 text-right" style={{ color: "var(--c-muted)" }}>
                              /{item.max}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/leaderboard" className="btn btn-secondary">
          <Icon name="trophy" size={18} /> Buka leaderboard
        </Link>
        <Link href="/bantuan" className="btn btn-secondary">
          <Icon name="help" size={18} /> Bantuan
        </Link>
      </div>
    </AuthShell>
  );
}
