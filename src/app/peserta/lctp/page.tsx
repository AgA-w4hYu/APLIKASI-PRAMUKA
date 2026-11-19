import { AuthShell } from "@/components/AuthShell";
import { LctpExam, type ExamData } from "@/components/LctpExam";
import { Alert, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getTeam, listContests } from "@/lib/services/contests";
import { currentExam } from "@/lib/services/lctp";
import { getDb } from "@/lib/db";

export default async function PesertaExamPage() {
  const user = await pageUser("ujian.kerjakan");
  if (!user.teamId) {
    return (
      <AuthShell user={user} active="/peserta">
        <Alert tone="danger" title="Akun belum terhubung ke tim">
          Hubungi panitia untuk menghubungkan akun ini dengan tim Anda.
        </Alert>
      </AuthShell>
    );
  }

  const team = getTeam(user.teamId);
  const contest = listContests().find((c) => c.type === "lctp");
  if (!contest) {
    return (
      <AuthShell user={user} active="/peserta" teamName={team.name}>
        <PageHeader title="Ujian LCTP" />
        <Alert tone="info" title="Belum ada ujian">
          Panitia belum menyiapkan ujian LCTP.
        </Alert>
      </AuthShell>
    );
  }

  const questionCount = (
    getDb().prepare("SELECT COUNT(*) AS n FROM questions WHERE contest_id = ?").get(contest.id) as { n: number }
  ).n;
  const exam = currentExam(user, contest.id) as ExamData | null;

  return (
    <AuthShell user={user} active="/peserta" teamName={team.name}>
      <PageHeader
        eyebrow="LCTP"
        title={exam ? "Lembar ujian" : "Persiapan ujian"}
        description={
          contest.status === "berjalan"
            ? "Sesi ujian sedang dibuka."
            : "Tombol mulai aktif setelah panitia membuka sesi ujian."
        }
      />
      {exam ? (
        <LctpExam
          contestId={contest.id}
          contestName={contest.name}
          teamName={team.name}
          teamSize={contest.team_size}
          durationMin={contest.duration_min}
          questionCount={questionCount}
          initialExam={exam}
        />
      ) : contest.status !== "berjalan" ? (
        <Alert tone="warning" title="Sesi ujian belum dibuka">
          Tunggu aba-aba panitia. Halaman ini dapat dimuat ulang saat sesi dibuka.
        </Alert>
      ) : questionCount === 0 ? (
        <Alert tone="warning" title="Soal belum tersedia">
          Panitia belum memasukkan soal. Hubungi panitia.
        </Alert>
      ) : (
        <LctpExam
          contestId={contest.id}
          contestName={contest.name}
          teamName={team.name}
          teamSize={contest.team_size}
          durationMin={contest.duration_min}
          questionCount={questionCount}
          initialExam={null}
        />
      )}
    </AuthShell>
  );
}
