import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { QuestionBank, type BankQuestion } from "@/components/QuestionBank";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { listContests } from "@/lib/services/contests";
import { examResults, questionsWithAnswers } from "@/lib/services/lctp";
import { formatDate, formatScore } from "@/lib/constants";
import { updateContestAction } from "@/app/admin/actions";

export default async function AdminLctpPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await pageUser("soal.ubah");
  const flash = await searchParams;
  const contest = listContests().find((c) => c.type === "lctp");
  if (!contest) {
    return (
      <AuthShell user={user} active="/admin/lctp">
        <PageHeader title="Bank soal LCTP" />
        <EmptyState title="Belum ada lomba LCTP">
          Buat lomba bertipe ujian di menu Lomba terlebih dahulu.
        </EmptyState>
      </AuthShell>
    );
  }

  const rawQuestions = questionsWithAnswers(contest.id);
  const questions: BankQuestion[] = rawQuestions.map((q) => ({
    id: q.id,
    text: q.text,
    options: JSON.parse(q.options) as string[],
    answerIndex: q.answer_index,
    score: q.score,
    difficulty: q.difficulty,
    packageName: q.package_name,
  }));
  const results = examResults(contest.id);
  const totalScore = questions.reduce((sum, q) => sum + q.score, 0);

  return (
    <AuthShell user={user} active="/admin/lctp">
      <PageHeader
        eyebrow="LCTP"
        title="Bank soal dan sesi ujian"
        description={`${questions.length} soal · total ${totalScore} poin · durasi ${contest.duration_min} menit. Kunci jawaban tidak pernah dikirim ke peserta.`}
        actions={
          <Link href="/admin/lomba" className="btn btn-secondary">
            Atur jadwal lomba
          </Link>
        }
      />
      <Flash ok={flash.ok} error={flash.error} />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Sesi ujian</h2>
              <Badge tone={contest.status === "berjalan" ? "success" : "neutral"}>
                {contest.status === "berjalan" ? "Terbuka" : contest.status === "selesai" ? "Ditutup" : "Belum dibuka"}
              </Badge>
            </div>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              {results.filter((r) => r.status === "selesai").length} tim selesai ·{" "}
              {results.filter((r) => r.status === "berjalan").length} sedang mengerjakan
            </p>
          </div>
          <div className="flex gap-2">
            <form action={updateContestAction}>
              <input type="hidden" name="contestId" value={contest.id} />
              <input type="hidden" name="action" value="status" />
              <input type="hidden" name="status" value={contest.status === "berjalan" ? "selesai" : "berjalan"} />
              <button type="submit" className={`btn ${contest.status === "berjalan" ? "btn-secondary" : "btn-primary"}`}>
                {contest.status === "berjalan" ? "Tutup sesi ujian" : "Buka sesi ujian"}
              </button>
            </form>
          </div>
        </div>

        {contest.status === "berjalan" ? (
          <div className="mt-3">
            <Alert tone="success" title="Sesi terbuka">
              Peserta dapat menekan Mulai Mengerjakan. Waktu dihitung server sejak tombol ditekan. Setelah
              menyelesaikan atau menutup sesi, jawaban dinilai otomatis.
            </Alert>
          </div>
        ) : (
          <div className="mt-3">
            <Alert tone="warning" title="Sesi belum dibuka">
              Peserta belum dapat memulai ujian. Buka sesi saat seluruh tim siap.
            </Alert>
          </div>
        )}
      </Card>

      <h2 className="mb-3 text-2xl font-semibold">Hasil ujian</h2>
      <Card className="mb-8 overflow-hidden p-0">
        {results.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: "var(--c-muted)" }}>
            Belum ada tim yang mengerjakan.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                  <th className="px-5 py-3 font-semibold">Tim</th>
                  <th className="px-3 py-3 font-semibold">Kategori</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Terjawab</th>
                  <th className="px-3 py-3 text-right font-semibold">Nilai</th>
                  <th className="px-5 py-3 font-semibold">Dikumpulkan</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.sessionId} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                    <td className="px-5 py-3 font-medium">{row.teamName}</td>
                    <td className="px-3 py-3">{row.category}</td>
                    <td className="px-3 py-3">
                      <Badge tone={row.status === "selesai" ? "success" : "accent"}>
                        {row.status === "selesai" ? "Selesai" : "Mengerjakan"}
                      </Badge>
                    </td>
                    <td className="num px-3 py-3 text-right">
                      {row.answered}/{row.totalQuestions}
                    </td>
                    <td className="num px-3 py-3 text-right font-semibold">{formatScore(row.score)}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: "var(--c-muted)" }}>
                      {formatDate(row.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <h2 className="mb-3 text-2xl font-semibold">Bank soal</h2>
      <QuestionBank contestId={contest.id} questions={questions} />
    </AuthShell>
  );
}
