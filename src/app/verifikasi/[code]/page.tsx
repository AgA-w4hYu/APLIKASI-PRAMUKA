import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Badge, Card, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { scoreIdByVerificationCode } from "@/lib/signature";
import { findScoreById, scoreValues, verifyScoreSignature } from "@/lib/services/penilaian";
import { getContest, getTeam, sheetDetail } from "@/lib/services/contests";
import { getDb } from "@/lib/db";
import { categoryLabel, formatDate, formatScore } from "@/lib/constants";

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await pageUser("nilai.semua");
  const { code } = await params;
  const scoreId = scoreIdByVerificationCode(decodeURIComponent(code));
  if (!scoreId) notFound();

  const score = findScoreById(scoreId);
  const contest = getContest(score.contest_id);
  const team = getTeam(score.team_id);
  const check = verifyScoreSignature(scoreId);
  const juri = getDb().prepare("SELECT name, username FROM users WHERE id = ?").get(score.juri_id) as
    | { name: string; username: string }
    | undefined;
  const sheet = score.sheet_id ? sheetDetail(score.sheet_id) : null;
  const values = scoreValues(score);
  const signature = getDb()
    .prepare("SELECT ip, device, device_time FROM signatures WHERE score_id = ?")
    .get(scoreId) as { ip: string | null; device: string | null; device_time: string | null } | undefined;

  return (
    <AuthShell user={user} active="/admin/nilai">
      <PageHeader
        eyebrow="Verifikasi dokumen"
        title={`Kode ${check.code ?? "—"}`}
        description="Halaman ini menghitung ulang hash isi lembar nilai dan membandingkannya dengan hash yang tersimpan saat juri menandatangani."
        actions={
          <Link href="/admin/nilai" className="btn btn-secondary">
            Kembali ke nilai
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              {contest.name} · {categoryLabel(team.category)}
            </p>
            <h2 className="text-2xl font-semibold">{team.name}</h2>
            <p className="num text-sm" style={{ color: "var(--c-muted)" }}>
              {team.npp} · dinilai {juri?.name ?? "—"} ({juri?.username ?? "—"})
            </p>
          </div>
          <Badge tone={check.status === "ok" ? "success" : check.status === "missing" ? "danger" : "danger"}>
            {check.status === "ok" ? "Hash cocok" : check.status === "missing" ? "Tanda tangan tidak ada" : "Hash tidak cocok"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>Total nilai</p>
            <p className="num text-2xl font-semibold">{formatScore(score.total)}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>Revisi</p>
            <p className="num text-2xl font-semibold">r{score.revision}</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>Ditandatangani</p>
            <p className="text-base font-semibold">{formatDate(check.signedAt)}</p>
          </div>
        </div>
        {check.status !== "ok" ? (
          <p role="alert" className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }}>
            Data nilai tidak sama dengan isi yang ditandatangani. Jangan pakai lembar ini sebagai bukti; periksa riwayat
            audit dan hubungi panitia.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="text-lg font-semibold">Rincian yang ditandatangani</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {(sheet?.sections.flatMap((section) => section.items) ?? []).map((item) => (
                <tr key={item.id} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                  <td className="py-2">{item.name}</td>
                  <td className="num py-2 text-right font-semibold">{formatScore(values[String(item.id)] ?? 0)}</td>
                  <td className="num py-2 text-right" style={{ color: "var(--c-muted)" }}>/{item.max_value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Tanda tangan</h2>
          {check.image ? (
            <img src={check.image} alt={`Tanda tangan ${check.juriName ?? "juri"}`} className="mt-2 w-full rounded-lg border bg-white p-1" style={{ borderColor: "var(--c-border)" }} />
          ) : (
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>Tidak ada gambar tanda tangan.</p>
          )}
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>Juri</dt>
              <dd className="font-medium">{check.juriName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>Titik goresan</dt>
              <dd className="num">{check.points}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>Waktu perangkat</dt>
              <dd>{formatDate(signature?.device_time)}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>Alamat IP</dt>
              <dd className="num">{signature?.ip ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>Perangkat</dt>
              <dd className="break-words text-xs">{signature?.device ?? "—"}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </AuthShell>
  );
}
