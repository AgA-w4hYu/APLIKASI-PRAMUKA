import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { Card, PageHeader, Badge, Icon } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getDb } from "@/lib/db";
import { CATEGORIES, categoryLabel } from "@/lib/constants";
import { createTeamAction, importTeamsAction } from "@/app/admin/actions";

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await pageUser("tim.kelola");
  const flash = await searchParams;
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT t.*, u.username, u.id AS user_id, u.active FROM teams t
       LEFT JOIN users u ON u.team_id = t.id ORDER BY t.category ASC, t.name ASC`,
    )
    .all() as {
    id: number;
    name: string;
    npp: string;
    category: string;
    username: string | null;
    active: number | null;
  }[];
  const scored = db.prepare("SELECT COUNT(DISTINCT team_id) AS n FROM scores WHERE status != 'draf'").get() as {
    n: number;
  };

  return (
    <AuthShell user={user} active="/admin/tim">
      <PageHeader
        eyebrow="Data lomba"
        title="Tim dan akun peserta"
        description="Satu NPP sama dengan satu tim. Setiap tim mendapat satu akun peserta."
      />
      <Flash ok={flash.ok} error={flash.error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5" style={{ borderColor: "var(--c-border)" }}>
            <div>
              <h2 className="text-xl font-semibold">{teams.length} tim terdaftar</h2>
              <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                {scored.n} tim sudah memiliki nilai terkirim
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Badge key={c.key}>
                  {c.label}: {teams.filter((t) => t.category === c.key).length}
                </Badge>
              ))}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "var(--c-surface)" }}>
                <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                  <th className="px-5 py-3 font-semibold">Tim</th>
                  <th className="px-3 py-3 font-semibold">NPP</th>
                  <th className="px-3 py-3 font-semibold">Kategori</th>
                  <th className="px-5 py-3 font-semibold">Akun</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                    <td className="px-5 py-3 font-medium">{team.name}</td>
                    <td className="num px-3 py-3">{team.npp}</td>
                    <td className="px-3 py-3" style={{ color: "var(--c-muted)" }}>
                      {categoryLabel(team.category)}
                    </td>
                    <td className="num px-5 py-3">
                      {team.username ? (
                        <span className="flex items-center gap-2">
                          {team.username}
                          {team.active ? null : <Badge tone="danger">nonaktif</Badge>}
                        </span>
                      ) : (
                        <span style={{ color: "var(--c-danger)" }}>belum ada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold">Tambah satu tim</h2>
            <form action={createTeamAction} className="mt-3 space-y-3">
              <div>
                <label htmlFor="team-name" className="label">
                  Nama tim
                </label>
                <input id="team-name" name="name" className="input" required placeholder="Tim Garuda" />
              </div>
              <div>
                <label htmlFor="team-npp" className="label">
                  NPP
                </label>
                <input id="team-npp" name="npp" className="input num" required placeholder="PNG-016" />
              </div>
              <div>
                <label htmlFor="team-category" className="label">
                  Kategori
                </label>
                <select id="team-category" name="category" className="input" required>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-full">
                <Icon name="plus" size={18} /> Tambah tim dan akun
              </button>
            </form>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Impor banyak tim</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Satu baris satu tim: <span className="num">Nama, NPP, kategori</span>. Kategori memakai nama seperti
              &quot;penegak&quot; atau &quot;Penggalang Putra&quot;. Kata sandi awal setiap akun:{" "}
              <span className="num">peserta123</span>.
            </p>
            <form action={importTeamsAction} className="mt-3 space-y-3">
              <textarea
                name="csv"
                rows={5}
                className="input num text-sm"
                placeholder={"Tim Merpati, PNG-016, penegak\nTim Arjuna, PGP-013, penggalang_putra"}
                required
              />
              <button type="submit" className="btn btn-secondary w-full">
                Impor dari teks CSV
              </button>
            </form>
          </Card>
        </div>
      </div>
    </AuthShell>
  );
}
