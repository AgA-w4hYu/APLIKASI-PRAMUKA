import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { ScoreForm, type FormItem } from "@/components/ScoreForm";
import { Card, Icon } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getContest, getTeam, isAssigned, latestSheet } from "@/lib/services/contests";
import { findScore, progressFor } from "@/lib/services/penilaian";
import { currentEntry } from "@/lib/queue";
import { CATEGORIES, categoryColor, categoryLabel, formatDate } from "@/lib/constants";

export default async function ScoreEntryPage({
  params,
}: {
  params: Promise<{ contestId: string; teamId: string }>;
}) {
  const user = await pageUser("nilai.kirim");
  const { contestId, teamId } = await params;
  const contestIdNum = Number(contestId);
  const teamIdNum = Number(teamId);

  if (!user.assignedContestId || !isAssigned(user.id, contestIdNum)) redirect("/juri");
  const contest = getContest(contestIdNum);
  const team = getTeam(teamIdNum);
  if (user.judgeCategory && team.category !== user.judgeCategory) redirect("/juri");
  if (contest.type !== "juri") redirect("/juri");
  const sheet = latestSheet(contestIdNum);
  if (!sheet) redirect("/juri");

  const current = currentEntry(contestIdNum, user.judgeCategory);
  if (!current || current.team_id !== teamIdNum) redirect("/juri");

  const existing = findScore(sheet.id, teamIdNum, user.id);
  const submitted = existing && existing.status !== "draf";

  if (submitted) {
    return (
      <AuthShell user={user} active="/juri">
        <Card className="text-center">
          <span
            className="mx-auto grid h-14 w-14 place-items-center rounded-full"
            style={{ background: "rgba(96,106,70,0.15)", color: "var(--c-success)" }}
          >
            <Icon name="check" size={28} />
          </span>
          <h1 className="mt-3 text-2xl font-semibold">Nilai tim ini sudah terkirim</h1>
          <p className="mt-1" style={{ color: "var(--c-muted)" }}>
            Dikirim {formatDate(existing!.submitted_at)} · status terkunci. Angka tidak ditampilkan lagi agar tidak
            terlihat dari layar juri.
          </p>
          <Link href="/juri" className="btn btn-primary mt-5">
            Kembali ke Beranda
          </Link>
        </Card>
      </AuthShell>
    );
  }

  const anonymous = Boolean(contest.anonymous);
  const teamName = anonymous ? `Tim #${current.position}` : team.name;

  const sections = sheet.sections.map((section) => ({
    name: section.name,
    items: section.items.map<FormItem>((item) => ({
      id: item.id,
      name: item.name,
      hint: item.hint,
      max: item.max_value,
      section: section.name,
    })),
  }));

  return (
    <AuthShell user={user} active="/juri">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/juri" className="btn btn-secondary">
          <Icon name="arrow" size={18} /> Beranda
        </Link>
        <span className="text-sm" style={{ color: "var(--c-muted)" }}>
          {categoryLabel(team.category)}
        </span>
      </div>
      <ScoreForm
        contestId={contestIdNum}
        contestName={contest.name}
        teamId={teamIdNum}
        teamName={teamName}
        teamNpp={team.npp}
        position={current.position}
        categoryLabel={CATEGORIES.find((c) => c.key === team.category)?.label ?? team.category}
        categoryColor={categoryColor(team.category)}
        progress={progressFor(contestIdNum, user.id, user.judgeCategory)}
        sections={sections}
        penalties={sheet.penalties.map((p) => ({ id: p.id, name: p.name, value: p.value }))}
        existing={
          existing
            ? {
                id: existing.id,
                status: existing.status,
                total: existing.total,
                values: JSON.parse(existing.breakdown) as Record<string, number>,
                penaltyIds: JSON.parse(existing.penalties) as number[],
              }
            : null
        }
        stopwatch={["lkbb", "pionering"].includes(contest.slug)}
      />
    </AuthShell>
  );
}
