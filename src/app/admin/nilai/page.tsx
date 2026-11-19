import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { CorrectionDialog } from "@/components/CorrectionDialog";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getDb } from "@/lib/db";
import { CATEGORIES, SCORE_STATUS, categoryLabel, formatDate, formatScore } from "@/lib/constants";
import { latestSheet, listContests, sheetDetail } from "@/lib/services/contests";
import { correctionRequests, scoreRevisions } from "@/lib/services/penilaian";
import { releasedCategories } from "@/lib/services/leaderboard";
import { decideCorrectionAction, releaseAction } from "@/app/admin/nilai/actions";

export default async function AdminScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ contest?: string; ok?: string; error?: string }>;
}) {
  const user = await pageUser("nilai.semua");
  const query = await searchParams;
  const db = getDb();
  const contests = listContests();
  const selectedId = Number(query.contest) || contests[0]?.id || 0;
  const contest = contests.find((c) => c.id === selectedId) ?? contests[0];
  if (!contest) {
    return (
      <AuthShell user={user} active="/admin/nilai">
        <PageHeader title="Nilai dan rilis" />
        <EmptyState title="Belum ada lomba">Buat lomba terlebih dahulu di menu Lomba.</EmptyState>
      </AuthShell>
    );
  }

  const selectedContest = contest;
  const sheet = latestSheet(selectedContest.id);
  const releases = releasedCategories(selectedContest.id);
  const rows = db
    .prepare(
      `SELECT s.*, t.name AS team_name, t.npp, t.category, u.name AS juri_name,
              (SELECT sig.verification_code FROM signatures sig WHERE sig.score_id = s.id) AS verify_code
       FROM scores s JOIN teams t ON t.id = s.team_id LEFT JOIN users u ON u.id = s.juri_id
       WHERE s.contest_id = ? AND s.status != 'draf'
       ORDER BY t.category ASC, t.name ASC, u.name ASC`,
    )
    .all(selectedContest.id) as {
    id: number;
    sheet_id: number | null;
    team_name: string;
    npp: string;
    category: string;
    juri_name: string | null;
    status: string;
    total: number;
    breakdown: string;
    penalties: string;
    revision: number;
    pending_revision_id: number | null;
    verify_code: string | null;
    submitted_at: string | null;
    updated_at: string;
  }[];

  const requests = correctionRequests();
  const sheetCache = new Map<number, ReturnType<typeof sheetDetail>>();
  function itemsFor(sheetId: number | null) {
    if (!sheetId) return { items: [], penalties: [] };
    if (!sheetCache.has(sheetId)) sheetCache.set(sheetId, sheetDetail(sheetId));
    const detail = sheetCache.get(sheetId)!;
    return {
      items: detail.sections.flatMap((s) => s.items.map((i) => ({ id: i.id, name: i.name, max: i.max_value }))),
      penalties: detail.penalties.map((p) => ({ id: p.id, name: p.name, value: p.value })),
    };
  }

  const releasedCount = releases.length;

  return (
    <AuthShell user={user} active="/admin/nilai">
      <PageHeader
        eyebrow="Penilaian"
        title="Nilai, koreksi, dan rilis"
        description="Nilai terkirim hanya dapat diubah di sini, dengan alasan tertulis dan revisi yang tersimpan."
      />
      <Flash ok={query.ok} error={query.error} />

      <div className="mb-4 flex flex-wrap gap-2">
        {contests.map((item) => (
          <Link
            key={item.id}
            href={`/admin/nilai?contest=${item.id}`}
            className="btn text-sm"
            style={
              item.id === selectedContest.id
                ? { background: "var(--c-primary)", color: "var(--c-on-primary)", minHeight: 44 }
                : { background: "var(--c-surface)", border: "1px solid var(--c-border)", minHeight: 44 }
            }
          >
            {item.name}
          </Link>
        ))}
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Rilis nilai — {selectedContest.name}</h2>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              Sebelum dirilis, peserta hanya melihat &quot;Nilai belum dirilis panitia&quot;. Angka pada leaderboard hanya
              terlihat oleh tim sendiri.
            </p>
          </div>
          <Badge tone={releasedCount > 0 ? "success" : "neutral"}>
            {releasedCount > 0 ? `Dirilis untuk ${releasedCount} kategori` : "Belum dirilis"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CATEGORIES.map((category) => {
            const released = releases.includes(category.key);
            const count = rows.filter((r) => r.category === category.key).length;
            return (
              <div key={category.key} className="rounded-xl border p-3" style={{ borderColor: "var(--c-border)" }}>
                <p className="font-semibold">{category.label}</p>
                <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                  {count} nilai terkirim · {released ? "sudah dirilis" : "belum dirilis"}
                </p>
                <form action={releaseAction} className="mt-2">
                  <input type="hidden" name="contestId" value={selectedContest.id} />
                  <input type="hidden" name="category" value={category.key} />
                  <input type="hidden" name="mode" value={released ? "unrelease" : "release"} />
                  <button type="submit" className={`btn text-sm w-full ${released ? "btn-secondary" : "btn-primary"}`}>
                    {released ? "Tarik kembali rilis" : "Rilis nilai"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        <form action={releaseAction} className="mt-3">
          <input type="hidden" name="contestId" value={selectedContest.id} />
          <input type="hidden" name="category" value="semua" />
          <input type="hidden" name="mode" value="release" />
          <button type="submit" className="btn btn-secondary text-sm">
            Rilis untuk semua kategori
          </button>
        </form>
      </Card>

      {requests.length > 0 ? (
        <Card className="mb-5">
          <h2 className="text-xl font-semibold">Permintaan koreksi dari juri</h2>
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--c-border)" }}>
            {requests.slice(0, 6).map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {request.team_name} · {request.contest_name}{" "}
                    <Badge tone={request.status === "menunggu" ? "accent" : "neutral"}>{request.status}</Badge>
                  </p>
                  <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                    {request.juri_name}: {request.reason}
                  </p>
                </div>
                {request.status === "menunggu" ? (
                  <div className="flex gap-2">
                    <form action={decideCorrectionAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="disetujui" />
                      <button type="submit" className="btn btn-primary text-sm">
                        Setujui
                      </button>
                    </form>
                    <form action={decideCorrectionAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="ditolak" />
                      <button type="submit" className="btn btn-secondary text-sm">
                        Tolak
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b p-5" style={{ borderColor: "var(--c-border)" }}>
          <h2 className="text-xl font-semibold">Nilai masuk ({rows.length})</h2>
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Rata-rata juri dipakai untuk peringkat. {sheet ? `Lembar aktif versi ${sheet.version}.` : ""}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Belum ada nilai terkirim">
              Nilai muncul di sini setelah juri menekan Kirim Nilai.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                  <th className="px-5 py-3 font-semibold">Tim</th>
                  <th className="px-3 py-3 font-semibold">Kategori</th>
                  <th className="px-3 py-3 font-semibold">Juri</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Dikirim</th>
                  <th className="px-5 py-3 font-semibold">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const content = itemsFor(row.sheet_id);
                  const status = SCORE_STATUS[row.status as keyof typeof SCORE_STATUS] ?? {
                    label: row.status,
                    tone: "neutral" as const,
                  };
                  return (
                    <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--c-border)" }}>
                      <td className="px-5 py-3">
                        <p className="font-medium">{row.team_name}</p>
                        <p className="num text-xs" style={{ color: "var(--c-muted)" }}>
                          {row.npp}
                        </p>
                      </td>
                      <td className="px-3 py-3">{categoryLabel(row.category)}</td>
                      <td className="px-3 py-3">{row.juri_name ?? "Ujian otomatis"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={status.tone === "success" ? "success" : status.tone === "accent" ? "accent" : "neutral"}>
                            {status.label} · r{row.revision}
                          </Badge>
                          {row.pending_revision_id ? <Badge tone="accent">Menunggu tanda tangan</Badge> : null}
                        </div>
                      </td>
                      <td className="num px-3 py-3 text-right font-semibold">{formatScore(row.total)}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "var(--c-muted)" }}>
                        {formatDate(row.submitted_at)}
                      </td>
                      <td className="px-5 py-3">
                        {row.sheet_id && content.items.length > 0 ? (
                          <CorrectionDialog
                            scoreId={row.id}
                            teamName={row.team_name}
                            total={row.total}
                            items={content.items}
                            penalties={content.penalties}
                            values={JSON.parse(row.breakdown) as Record<string, number>}
                            penaltyIds={JSON.parse(row.penalties) as number[]}
                            revisions={scoreRevisions(row.id)}
                          />
                        ) : (
                          <span className="text-xs" style={{ color: "var(--c-muted)" }}>
                            Dinilai otomatis
                          </span>
                        )}
                        {row.verify_code ? (
                          <Link href={`/verifikasi/${row.verify_code}`} className="link mt-2 block text-xs">
                            Verifikasi {row.verify_code}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Alert tone="info" title="Audit trail">
          Setiap koreksi menyimpan nilai lama, nilai baru, alasan, dan nama admin. Riwayat tidak dapat dihapus dari
          aplikasi.{" "}
          <Link href="/admin/audit" className="link">
            Lihat riwayat perubahan
          </Link>
        </Alert>
      </div>
    </AuthShell>
  );
}
