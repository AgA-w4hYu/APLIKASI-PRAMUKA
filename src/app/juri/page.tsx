import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Badge, Card, EmptyState, Icon, PageHeader, ProgressBar } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { juriContests } from "@/lib/services/contests";
import { myHistory, pendingRevisions, progressFor } from "@/lib/services/penilaian";
import { currentEntry } from "@/lib/queue";
import { categoryLabel, formatDate } from "@/lib/constants";

export default async function JuriHome() {
  const user = await pageUser("nilai.kirim");
  const contests = juriContests(user.id);
  const contest = contests[0];

  if (!contest) {
    return (
      <AuthShell user={user} active="/juri">
        <PageHeader eyebrow="Tugas menilai" title={`Selamat bertugas, ${user.name}`} />
        <EmptyState icon="flag" title="Belum ada lomba untuk Anda">
          Panitia belum menugaskan Anda pada lomba mana pun. Hubungi panitia bila ini keliru.
        </EmptyState>
      </AuthShell>
    );
  }

  const current = currentEntry(contest.id, user.judgeCategory);
  const progress = progressFor(contest.id, user.id, user.judgeCategory);
  const history = myHistory(contest.id, user.id);
  const pending = pendingRevisions(user.id);
  const anonymous = Boolean(contest.anonymous);
  const categoryOk = !user.judgeCategory || current?.category === user.judgeCategory;

  return (
    <AuthShell user={user} active="/juri">
      <PageHeader
        eyebrow="Beranda juri"
        title={contest.name}
        description="Tim yang dinilai ditetapkan panitia. Anda tidak perlu memilih lomba atau tim."
        actions={<AutoRefresh generatedAt={new Date().toISOString()} />}
      />

      <Card className="mb-4">
        <ProgressBar value={progress.done} max={progress.total} label="Tim sudah Anda nilai" />
        <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
          {progress.done} dari {progress.total} tim sudah dinilai. Nilai yang terkirim terkunci dan tidak dapat Anda ubah.
        </p>
      </Card>

      {pending.length > 0 ? (
        <div className="mb-4 space-y-3">
          {pending.map((revision) => (
            <Card key={revision.id} className="border-l-4" >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--c-accent)" }}>
                    Tinjau dan tanda tangan koreksi
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{revision.team_name}</h2>
                  <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                    Panitia mengoreksi nilai ini: {revision.reason}
                  </p>
                </div>
                <Link href={`/juri/koreksi/${revision.id}`} className="btn btn-primary">
                  <Icon name="shield" size={18} /> Tinjau koreksi
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {current ? (
        <section
          className="rise rounded-3xl p-6 text-white sm:p-8"
          style={{ background: "var(--c-primary)" }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">Tim sekarang</p>
          <p className="num mt-2 text-lg opacity-90">
            Nomor urut {current.position} · {categoryLabel(current.category)}
          </p>
          <h2 className="display mt-1 text-4xl font-semibold sm:text-5xl">
            {anonymous ? `Tim #${current.position}` : current.name}
          </h2>
          <p className="num mt-1 opacity-80">{current.npp}</p>
          {!categoryOk ? (
            <p className="mt-4 rounded-xl bg-white/15 p-3 text-sm">
              Tim ini di luar kategori penugasan Anda. Tunggu tim dari kategori Anda atau hubungi panitia.
            </p>
          ) : null}
          {categoryOk ? (
            <Link href={`/juri/${contest.id}/${current.team_id}`} className="btn btn-lg mt-6 w-full bg-white text-[color:var(--c-primary)] sm:w-auto">
              <Icon name="score" size={20} /> Mulai Menilai
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="card p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: "var(--c-primary-soft)", color: "var(--c-primary)" }}>
            <Icon name="clock" size={28} />
          </span>
          <h2 className="mt-3 text-2xl font-semibold">Menunggu tim berikutnya dari panitia</h2>
          <p className="mt-1" style={{ color: "var(--c-muted)" }}>
            Layar ini memperbarui sendiri. Anda tidak dapat memanggil tim pertama; panitia yang membuka antrean.
          </p>
        </section>
      )}

      <Card className="mt-4 p-0">
        <details>
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-5 text-lg font-semibold">
            Riwayat Saya ({history.length})
            <span className="text-sm font-normal" style={{ color: "var(--c-muted)" }}>
              tanpa angka nilai
            </span>
          </summary>
          <div className="border-t" style={{ borderColor: "var(--c-border)" }}>
            {history.length === 0 ? (
              <p className="p-5 text-sm" style={{ color: "var(--c-muted)" }}>
                Belum ada tim yang Anda nilai.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--c-border)" }}>
                {history.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="font-medium">
                        Nomor {row.position ?? "—"} · {anonymous || !row.team_name ? "Tim anonim" : row.team_name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                        {categoryLabel(row.category)} · dikirim {formatDate(row.submitted_at)}
                      </p>
                    </div>
                    <Badge tone={row.revision > 1 ? "accent" : "success"}>
                      {row.revision > 1 ? `Dikoreksi · revisi ${row.revision}` : "Terkirim"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/bantuan" className="btn btn-secondary">
          <Icon name="help" size={18} /> Bantuan
        </Link>
        <a href="tel:+62610000000" className="btn btn-secondary">
          <Icon name="users" size={18} /> Panggil panitia
        </a>
      </div>
    </AuthShell>
  );
}
