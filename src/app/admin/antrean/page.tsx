import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { listContests } from "@/lib/services/contests";
import { queueFor, currentEntry } from "@/lib/queue";
import { categoryLabel, formatDate } from "@/lib/constants";
import {
  moveTeamAction,
  nextTeamAction,
  restoreTeamAction,
  skipTeamAction,
  toggleAnonymousAction,
} from "@/app/admin/antrean/actions";

const STATUS_LABEL: Record<string, string> = {
  menunggu: "Menunggu",
  dipanggil: "Dipanggil",
  dinilai: "Sedang dinilai",
  selesai: "Selesai",
  dilewati: "Dilewati",
  absen: "Absen",
};

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ contest?: string; ok?: string; error?: string }>;
}) {
  const user = await pageUser("lomba.ubah");
  const query = await searchParams;
  const contests = listContests().filter((contest) => contest.type === "juri");
  const selectedId = Number(query.contest) || contests[0]?.id || 0;
  const contest = contests.find((item) => item.id === selectedId) ?? contests[0];

  return (
    <AuthShell user={user} active="/admin/antrean">
      <PageHeader
        eyebrow="Kendali panitia"
        title="Antrean tim"
        description="Panitia menentukan tim yang dipanggil. Juri hanya menerima satu tim dan tidak dapat melompati urutan."
      />
      <Flash ok={query.ok} error={query.error} />

      {contests.length === 0 ? (
        <EmptyState title="Belum ada lomba yang dinilai juri">Buat lomba bertipe juri terlebih dahulu.</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {contests.map((item) => (
              <Link
                key={item.id}
                href={`/admin/antrean?contest=${item.id}`}
                className="btn text-sm"
                style={
                  item.id === contest.id
                    ? { background: "var(--c-primary)", color: "var(--c-on-primary)", minHeight: 44 }
                    : { background: "var(--c-surface)", border: "1px solid var(--c-border)", minHeight: 44 }
                }
              >
                {item.name}
              </Link>
            ))}
          </div>

          <QueueBody contestId={contest.id} contestName={contest.name} anonymous={Boolean(contest.anonymous)} />
        </>
      )}
    </AuthShell>
  );
}

function QueueBody({ contestId, contestName, anonymous }: { contestId: number; contestName: string; anonymous: boolean }) {
  const entries = queueFor(contestId);
  const current = currentEntry(contestId);
  const done = entries.filter((entry) => entry.status === "selesai").length;

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--c-accent)" }}>
              Tim sekarang · {contestName}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {current ? `Nomor ${current.position} · ${current.name}` : "Belum ada tim dipanggil"}
            </h2>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              {current
                ? `${categoryLabel(current.category)} · dipanggil ${formatDate(current.called_at)}`
                : "Tekan Panggil Tim Pertama untuk membuka antrean."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={nextTeamAction}>
              <input type="hidden" name="contestId" value={contestId} />
              <button type="submit" className="btn btn-primary">
                {current ? "Selesaikan dan panggil berikutnya" : "Panggil Tim Pertama"}
              </button>
            </form>
            <form action={toggleAnonymousAction}>
              <input type="hidden" name="contestId" value={contestId} />
              <button type="submit" className="btn btn-secondary">
                {anonymous ? "Matikan mode anonim" : "Aktifkan mode anonim"}
              </button>
            </form>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="success">{done} selesai</Badge>
          <Badge>{entries.length} tim dalam antrean</Badge>
          <Badge tone={anonymous ? "accent" : "neutral"}>
            {anonymous ? "Anonim: nama tim disembunyikan dari juri" : "Nama tim terlihat juri"}
          </Badge>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0" style={{ background: "var(--c-surface)" }}>
              <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                <th className="px-4 py-3 font-semibold">Urut</th>
                <th className="px-3 py-3 font-semibold">Tim</th>
                <th className="px-3 py-3 font-semibold">Kategori</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                  <td className="num px-4 py-3">{entry.position}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{entry.name}</p>
                    <p className="num text-xs" style={{ color: "var(--c-muted)" }}>
                      {entry.npp}
                    </p>
                  </td>
                  <td className="px-3 py-3">{categoryLabel(entry.category)}</td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        entry.status === "selesai"
                          ? "success"
                          : entry.status === "dipanggil" || entry.status === "dinilai"
                            ? "accent"
                            : entry.status === "absen"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <form action={moveTeamAction}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <input type="hidden" name="direction" value="naik" />
                        <button type="submit" className="btn btn-ghost text-xs" aria-label={`Naikkan ${entry.name}`}>
                          ↑ Naik
                        </button>
                      </form>
                      <form action={moveTeamAction}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <input type="hidden" name="direction" value="turun" />
                        <button type="submit" className="btn btn-ghost text-xs" aria-label={`Turunkan ${entry.name}`}>
                          ↓ Turun
                        </button>
                      </form>
                      {entry.status !== "selesai" ? (
                        <>
                          <form action={skipTeamAction}>
                            <input type="hidden" name="entryId" value={entry.id} />
                            <input type="hidden" name="status" value="dilewati" />
                            <button type="submit" className="btn btn-ghost text-xs">
                              Lewati
                            </button>
                          </form>
                          <form action={skipTeamAction}>
                            <input type="hidden" name="entryId" value={entry.id} />
                            <input type="hidden" name="status" value="absen" />
                            <button type="submit" className="btn btn-ghost text-xs">
                              Absen
                            </button>
                          </form>
                        </>
                      ) : null}
                      {entry.status === "dilewati" || entry.status === "absen" ? (
                        <form action={restoreTeamAction}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button type="submit" className="btn btn-ghost text-xs">
                            Tarik kembali
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
