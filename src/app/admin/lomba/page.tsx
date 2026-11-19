import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { Badge, Card, Icon, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getDb } from "@/lib/db";
import { CONTEST_STATUS } from "@/lib/constants";
import { latestSheet, listContests } from "@/lib/services/contests";
import { createContestAction, updateContestAction } from "@/app/admin/actions";

export default async function AdminContestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await pageUser("lomba.ubah");
  const flash = await searchParams;
  const db = getDb();
  const contests = listContests();
  const juriList = db
    .prepare("SELECT id, name, username FROM users WHERE role = 'juri' AND active = 1 ORDER BY name ASC")
    .all() as { id: number; name: string; username: string }[];
  const assignments = db
    .prepare("SELECT a.id, a.contest_id, u.name FROM assignments a JOIN users u ON u.id = a.juri_id")
    .all() as { id: number; contest_id: number; name: string }[];

  return (
    <AuthShell user={user} active="/admin/lomba">
      <PageHeader
        eyebrow="Data lomba"
        title="Lomba, jadwal, dan lembar penilaian"
        description="Lomba dapat ditambah tanpa mengubah kode. Lembar penilaian disusun sendiri oleh panitia."
      />
      <Flash ok={flash.ok} error={flash.error} />

      <div className="space-y-4">
        {contests.map((contest) => {
          const sheet = contest.type === "juri" ? latestSheet(contest.id) : null;
          const contestAssignments = assignments.filter((a) => a.contest_id === contest.id);
          const available = juriList.filter((j) => !contestAssignments.some((a) => a.name === j.name));
          return (
            <Card key={contest.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold">{contest.name}</h2>
                    <Badge tone={contest.status === "berjalan" ? "success" : "neutral"}>
                      {CONTEST_STATUS[contest.status] ?? contest.status}
                    </Badge>
                    {contest.type === "lctp" ? <Badge tone="accent">Dinilai otomatis</Badge> : null}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--c-muted)" }}>
                    {contest.description}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--c-muted)" }}>
                    {contest.team_size} orang per tim · {contest.duration_min} menit
                    {sheet ? ` · lembar versi ${sheet.version} (${sheet.sections.reduce((n, s) => n + s.items.length, 0)} kriteria)` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contest.type === "juri" ? (
                    <Link href={`/admin/lomba/${contest.id}`} className="btn btn-secondary text-sm">
                      <Icon name="score" size={16} /> Lembar penilaian
                    </Link>
                  ) : (
                    <Link href="/admin/lctp" className="btn btn-secondary text-sm">
                      <Icon name="exam" size={16} /> Bank soal
                    </Link>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <form action={updateContestAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="contestId" value={contest.id} />
                  <input type="hidden" name="action" value="status" />
                  <div className="min-w-[160px] flex-1">
                    <label htmlFor={`status-${contest.id}`} className="label">
                      Status lomba
                    </label>
                    <select id={`status-${contest.id}`} name="status" defaultValue={contest.status} className="input">
                      <option value="draft">Belum dimulai</option>
                      <option value="berjalan">Berlangsung</option>
                      <option value="selesai">Selesai</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Simpan
                  </button>
                </form>

                <div>
                  <p className="label">Juri yang ditugaskan</p>
                  <div className="flex flex-wrap gap-2">
                    {contestAssignments.length === 0 ? (
                      <span className="text-sm" style={{ color: "var(--c-muted)" }}>
                        Belum ada juri.
                      </span>
                    ) : (
                      contestAssignments.map((assignment) => (
                        <form key={assignment.id} action={updateContestAction}>
                          <input type="hidden" name="contestId" value={contest.id} />
                          <input type="hidden" name="action" value="unassign" />
                          <input type="hidden" name="assignmentId" value={assignment.id} />
                          <button
                            type="submit"
                            className="badge"
                            title="Klik untuk melepas penugasan"
                            style={{ background: "var(--c-primary-soft)" }}
                          >
                            {assignment.name} ✕
                          </button>
                        </form>
                      ))
                    )}
                  </div>
                  {available.length > 0 ? (
                    <form action={updateContestAction} className="mt-2 flex gap-2">
                      <input type="hidden" name="contestId" value={contest.id} />
                      <input type="hidden" name="action" value="assign" />
                      <select name="juriId" className="input !py-2 text-sm" aria-label="Pilih juri">
                        {available.map((juri) => (
                          <option key={juri.id} value={juri.id}>
                            {juri.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-secondary text-sm">
                        Tugaskan
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <h2 className="text-xl font-semibold">Tambah lomba baru</h2>
        <p className="text-sm" style={{ color: "var(--c-muted)" }}>
          Setelah dibuat, susun lembar penilaian atau bank soal, lalu tugaskan juri.
        </p>
        <form action={createContestAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="new-contest-name" className="label">
              Nama lomba
            </label>
            <input id="new-contest-name" name="name" className="input" required placeholder="Lomba Tali Simpul" />
          </div>
          <div>
            <label htmlFor="new-contest-type" className="label">
              Jenis penilaian
            </label>
            <select id="new-contest-type" name="type" className="input">
              <option value="juri">Dinilai juri</option>
              <option value="lctp">Ujian pilihan ganda</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-contest-size" className="label">
              Anggota per tim
            </label>
            <input id="new-contest-size" name="teamSize" type="number" min={1} defaultValue={3} className="input num" />
          </div>
          <div>
            <label htmlFor="new-contest-duration" className="label">
              Durasi (menit)
            </label>
            <input id="new-contest-duration" name="durationMin" type="number" min={1} defaultValue={15} className="input num" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="new-contest-desc" className="label">
              Keterangan
            </label>
            <input id="new-contest-desc" name="description" className="input" placeholder="Penjelasan singkat lomba" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary w-full">
              <Icon name="plus" size={18} /> Buat lomba
            </button>
          </div>
        </form>
      </Card>
    </AuthShell>
  );
}
