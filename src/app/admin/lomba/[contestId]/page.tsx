import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { SheetEditor } from "@/components/SheetEditor";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getContest, latestSheet } from "@/lib/services/contests";
import { getDb } from "@/lib/db";

export default async function SheetBuilderPage({ params }: { params: Promise<{ contestId: string }> }) {
  const user = await pageUser("lembar.ubah");
  const { contestId } = await params;
  const id = Number(contestId);
  let contest;
  try {
    contest = getContest(id);
  } catch {
    notFound();
  }
  if (contest.type !== "juri") notFound();
  const sheet = latestSheet(id);
  const scoreCount = (
    getDb().prepare("SELECT COUNT(*) AS n FROM scores WHERE contest_id = ?").get(id) as { n: number }
  ).n;

  return (
    <AuthShell user={user} active="/admin/lomba">
      <PageHeader
        eyebrow="Lembar penilaian"
        title={contest.name}
        description="Susun kategori, kriteria, penalti, dan bobot. Pratinjau tampilan juri sebelum lomba dimulai."
        actions={
          <Link href="/admin/lomba" className="btn btn-secondary">
            Kembali ke daftar lomba
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={contest.status === "berjalan" ? "success" : "neutral"}>
          {contest.status === "berjalan" ? "Berlangsung" : contest.status === "selesai" ? "Selesai" : "Belum dimulai"}
        </Badge>
        <Badge>{scoreCount} nilai tercatat</Badge>
        {sheet ? <Badge tone="accent">Versi {sheet.version}</Badge> : null}
      </div>

      {!sheet ? (
        <div className="mb-4">
          <EmptyState title="Lembar masih kosong" icon="score">
            Tambahkan kategori penilaian pertama di bawah, lalu simpan untuk mengunci versi awal.
          </EmptyState>
        </div>
      ) : null}

      <SheetEditor
        contestId={id}
        version={sheet?.version ?? 0}
        hasScores={scoreCount > 0}
        locked={Boolean(sheet?.locked)}
        initialSections={(sheet?.sections ?? []).map((section) => ({
          key: `s${section.id}`,
          name: section.name,
          items: section.items.map((item) => ({
            key: `i${item.id}`,
            name: item.name,
            hint: item.hint ?? "",
            max: item.max_value,
            weight: item.weight,
          })),
        }))}
        initialPenalties={(sheet?.penalties ?? []).map((penalty) => ({
          key: `p${penalty.id}`,
          name: penalty.name,
          value: penalty.value,
        }))}
      />
    </AuthShell>
  );
}
