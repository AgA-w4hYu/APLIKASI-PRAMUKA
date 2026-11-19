import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RevisionSignature } from "@/components/RevisionSignature";
import { Card, Icon, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { pendingRevision, scoreValues, findScoreById } from "@/lib/services/penilaian";
import { sheetDetail, getTeam } from "@/lib/services/contests";
import { categoryLabel, formatDate, formatScore } from "@/lib/constants";

export default async function RevisionPage({ params }: { params: Promise<{ revisionId: string }> }) {
  const user = await pageUser("nilai.kirim");
  const { revisionId } = await params;
  const revision = pendingRevision(Number(revisionId));
  if (!revision || revision.juri_id !== user.id || revision.status !== "menunggu_tanda_tangan") notFound();

  const score = findScoreById(revision.score_id);
  if (!score.sheet_id) notFound();
  const sheet = sheetDetail(score.sheet_id);
  const team = getTeam(score.team_id);
  const oldValues = scoreValues(score);
  const newValues = JSON.parse(revision.new_breakdown) as Record<string, number>;
  const items = sheet.sections.flatMap((section) => section.items);

  return (
    <AuthShell user={user} active="/juri">
      <PageHeader
        eyebrow="Tinjau dan tanda tangan"
        title={team.name}
        description={`${revision.contest_name} · ${categoryLabel(team.category)} · koreksi oleh ${revision.admin_name}, ${formatDate(revision.created_at)}`}
        actions={
          <Link href="/juri" className="btn btn-secondary">
            <Icon name="arrow" size={18} /> Beranda
          </Link>
        }
      />

      <Card className="mb-4">
        <h2 className="text-lg font-semibold">Alasan panitia</h2>
        <p className="mt-1" style={{ color: "var(--c-muted)" }}>{revision.reason}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-base">
            <thead>
              <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                <th className="py-2 font-semibold">Kriteria</th>
                <th className="py-2 text-right font-semibold">Lama</th>
                <th className="py-2 text-right font-semibold">Baru</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const before = oldValues[String(item.id)] ?? 0;
                const after = newValues[String(item.id)] ?? 0;
                return (
                  <tr key={item.id} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                    <td className="py-2">
                      {item.name}
                      <span className="num ml-1 text-xs" style={{ color: "var(--c-muted)" }}>/{item.max_value}</span>
                    </td>
                    <td className="num py-2 text-right" style={{ color: after === before ? "var(--c-muted)" : undefined }}>
                      {formatScore(before)}
                    </td>
                    <td className="num py-2 text-right font-semibold">{formatScore(after)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--c-muted)" }}>
          Selama belum ditandatangani, peringkat tetap memakai nilai lama.
        </p>
      </Card>

      <RevisionSignature revisionId={revision.id} oldTotal={revision.old_total} newTotal={revision.new_total} />
    </AuthShell>
  );
}
