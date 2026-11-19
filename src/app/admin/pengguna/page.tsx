import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/Flash";
import { Badge, Card, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getDb } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { CATEGORIES, categoryLabel, formatDate } from "@/lib/constants";
import { listContests } from "@/lib/services/contests";
import {
  assignJudgeAction,
  createRoleAction,
  createUserAction,
  importJudgesAction,
  resetPasswordAction,
  revokeSessionsAction,
  saveRoleAction,
  toggleUserAction,
  unlockUserAction,
} from "@/app/admin/actions";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; role?: string; q?: string; status?: string }>;
}) {
  const user = await pageUser("pengguna.kelola");
  const flash = await searchParams;
  const db = getDb();
  const search = (flash.q ?? "").trim();
  const roleFilter = flash.role && flash.role !== "semua" ? flash.role : "";
  const statusFilter = flash.status ?? "semua";

  const filters: string[] = [];
  const params: unknown[] = [];
  if (search) {
    filters.push("(u.name LIKE ? OR u.username LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (roleFilter) {
    filters.push("u.role = ?");
    params.push(roleFilter);
  }
  if (statusFilter === "aktif") filters.push("u.active = 1");
  if (statusFilter === "nonaktif") filters.push("u.active = 0");
  if (statusFilter === "terkunci") filters.push("u.locked_until IS NOT NULL AND u.locked_until > datetime('now')");

  const users = db
    .prepare(
      `SELECT u.*, r.name AS role_name, t.name AS team_name, c.name AS contest_name,
              a.category AS judge_category, a.contest_id AS assigned_contest_id,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.ended_at IS NULL AND s.expires_at > ?) AS session_count
       FROM users u
       JOIN roles r ON r.slug = u.role
       LEFT JOIN teams t ON t.id = u.team_id
       LEFT JOIN assignments a ON a.juri_id = u.id
       LEFT JOIN contests c ON c.id = a.contest_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'juri' THEN 1 ELSE 2 END, u.name ASC`,
    )
    .all(new Date().toISOString(), ...params) as {
    id: number;
    username: string;
    name: string;
    role: string;
    role_name: string;
    team_name: string | null;
    contest_name: string | null;
    judge_category: string | null;
    assigned_contest_id: number | null;
    active: number;
    locked_until: string | null;
    failed_attempts: number;
    last_login_at: string | null;
    must_change_password: number;
    session_count: number;
    created_at: string;
  }[];

  const roles = db.prepare("SELECT * FROM roles ORDER BY is_system DESC, name ASC").all() as {
    slug: string;
    name: string;
    permissions: string;
    is_system: number;
  }[];
  const contests = listContests();
  const teams = db.prepare("SELECT id, name, npp, category FROM teams ORDER BY category, name").all() as {
    id: number;
    name: string;
    npp: string;
    category: string;
  }[];
  const activeRole = roles.find((r) => r.slug === flash.role) ?? roles.find((r) => r.slug === "juri") ?? roles[0];
  const activePermissions: string[] = JSON.parse(activeRole?.permissions ?? "[]");

  function lockTone(row: { locked_until: string | null; active: number }) {
    if (!row.active) return { tone: "danger" as const, label: "Nonaktif" };
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      return { tone: "accent" as const, label: "Terkunci" };
    }
    return { tone: "success" as const, label: "Aktif" };
  }

  return (
    <AuthShell user={user} active="/admin/pengguna">
      <PageHeader
        eyebrow="Administrasi"
        title="Akun, penugasan juri, dan izin"
        description="Tidak ada pendaftaran mandiri. Kata sandi lama tidak dapat dilihat panitia; panitia hanya dapat menggantinya."
        actions={
          <Link href={`/admin/pengguna/kartu?role=juri`} className="btn btn-secondary">
            Cetak kartu akun
          </Link>
        }
      />
      <Flash ok={flash.ok} error={flash.error} />

      <Card className="mb-5">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="q" className="label">
              Cari nama atau nama pengguna
            </label>
            <input id="q" name="q" defaultValue={search} className="input" placeholder="Kak Rina" />
          </div>
          <div>
            <label htmlFor="role" className="label">
              Role
            </label>
            <select id="role" name="role" defaultValue={roleFilter || "semua"} className="input">
              <option value="semua">Semua role</option>
              {roles.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="label">
              Status
            </label>
            <select id="status" name="status" defaultValue={statusFilter} className="input">
              <option value="semua">Semua</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
              <option value="terkunci">Terkunci</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            Saring
          </button>
        </form>
      </Card>

      <Card className="mb-5 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5" style={{ borderColor: "var(--c-border)" }}>
          <h2 className="text-xl font-semibold">{users.length} akun</h2>
          <Badge>{users.filter((u) => u.active).length} aktif</Badge>
        </div>
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0" style={{ background: "var(--c-surface)" }}>
              <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                <th className="px-5 py-3 font-semibold">Nama</th>
                <th className="px-3 py-3 font-semibold">Nama pengguna</th>
                <th className="px-3 py-3 font-semibold">Role / penugasan</th>
                <th className="px-3 py-3 font-semibold">Login terakhir</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => {
                const lock = lockTone(item);
                return (
                  <tr key={item.id} className="border-t align-top" style={{ borderColor: "var(--c-border)" }}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                        {item.team_name ?? "—"} · dibuat {formatDate(item.created_at)}
                      </p>
                    </td>
                    <td className="num px-3 py-3">{item.username}</td>
                    <td className="px-3 py-3">
                      <p>{item.role_name}</p>
                      {item.role === "juri" ? (
                        <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                          {item.contest_name ?? "Belum ditugaskan"}
                          {item.judge_category ? ` · ${categoryLabel(item.judge_category)}` : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p>{formatDate(item.last_login_at)}</p>
                      <p style={{ color: "var(--c-muted)" }}>{item.session_count} sesi aktif</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={lock.tone}>{lock.label}</Badge>
                        {item.must_change_password ? <Badge tone="accent">Wajib ganti sandi</Badge> : null}
                        {item.failed_attempts > 0 ? <Badge tone="danger">{item.failed_attempts} gagal</Badge> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        <form action={resetPasswordAction}>
                          <input type="hidden" name="userId" value={item.id} />
                          <button type="submit" className="btn btn-secondary text-xs">
                            Buat sandi baru
                          </button>
                        </form>
                        {item.locked_until ? (
                          <form action={unlockUserAction}>
                            <input type="hidden" name="userId" value={item.id} />
                            <button type="submit" className="btn btn-secondary text-xs">
                              Buka kunci
                            </button>
                          </form>
                        ) : null}
                        {item.session_count > 0 ? (
                          <form action={revokeSessionsAction}>
                            <input type="hidden" name="userId" value={item.id} />
                            <button type="submit" className="btn btn-ghost text-xs">
                              Keluarkan sesi
                            </button>
                          </form>
                        ) : null}
                        {item.id !== user.id ? (
                          <form action={toggleUserAction}>
                            <input type="hidden" name="userId" value={item.id} />
                            <button type="submit" className="btn btn-ghost text-xs">
                              {item.active ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Tambah akun</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
            Juri wajib terikat satu lomba. Peserta wajib terhubung satu tim. Nama pengguna boleh dikosongkan untuk dibuat
            otomatis.
          </p>
          <form action={createUserAction} className="mt-3 space-y-3">
            <div>
              <label htmlFor="new-user-name" className="label">
                Nama lengkap
              </label>
              <input id="new-user-name" name="name" className="input" required placeholder="Kak Sari Lubis" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-user-username" className="label">
                  Nama pengguna (opsional)
                </label>
                <input id="new-user-username" name="username" className="input num" placeholder="juri-lkbb-03" />
              </div>
              <div>
                <label htmlFor="new-user-role" className="label">
                  Role
                </label>
                <select id="new-user-role" name="role" className="input">
                  <option value="juri">Juri</option>
                  <option value="peserta">Peserta</option>
                  <option value="admin">Panitia / Admin</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-user-contest" className="label">
                  Lomba (untuk juri)
                </label>
                <select id="new-user-contest" name="contestId" className="input">
                  <option value="">— tidak ada —</option>
                  {contests.map((contest) => (
                    <option key={contest.id} value={contest.id}>
                      {contest.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-user-category" className="label">
                  Batas kategori juri (opsional)
                </label>
                <select id="new-user-category" name="category" className="input">
                  <option value="">Semua kategori</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="new-user-team" className="label">
                Tim (untuk peserta)
              </label>
              <select id="new-user-team" name="teamId" className="input">
                <option value="">— tidak ada —</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.npp} · {team.name} ({categoryLabel(team.category)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-user-password" className="label">
                Kata sandi awal (opsional)
              </label>
              <input id="new-user-password" name="password" className="input num" placeholder="otomatis bila kosong" />
            </div>
            <label htmlFor="new-user-must" className="flex items-center gap-2 text-sm">
              <input id="new-user-must" type="checkbox" name="mustChange" className="h-4 w-4" />
              Wajib ganti kata sandi saat masuk pertama
            </label>
            <button type="submit" className="btn btn-primary w-full">
              Buat akun
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold">Ubah penugasan juri</h2>
            <form action={assignJudgeAction} className="mt-3 space-y-3">
              <div>
                <label htmlFor="assign-judge" className="label">
                  Juri
                </label>
                <select id="assign-judge" name="userId" className="input" required>
                  {users
                    .filter((item) => item.role === "juri")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.username})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="assign-contest" className="label">
                    Lomba
                  </label>
                  <select id="assign-contest" name="contestId" className="input" required>
                    {contests.map((contest) => (
                      <option key={contest.id} value={contest.id}>
                        {contest.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="assign-category" className="label">
                    Batas kategori
                  </label>
                  <select id="assign-category" name="category" className="input">
                    <option value="">Semua kategori</option>
                    {CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full">
                Simpan penugasan
              </button>
            </form>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Impor juri massal</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Satu juri per baris: <span className="num">Nama, NamaPengguna, Kategori</span>. Nama pengguna dan kata
              sandi awal dibuat otomatis bila kosong. Setiap juri masuk ke lomba yang dipilih.
            </p>
            <form action={importJudgesAction} className="mt-3 space-y-3">
              <select name="contestId" className="input" aria-label="Lomba tujuan impor" required>
                {contests.map((contest) => (
                  <option key={contest.id} value={contest.id}>
                    {contest.name}
                  </option>
                ))}
              </select>
              <textarea name="csv" rows={4} className="input num" placeholder={"Kak Sari,\nKak Budi,\nKak Tono, juri-lkbb-09"} />
              <button type="submit" className="btn btn-primary w-full">
                Impor juri
              </button>
            </form>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Izin per role</h2>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <a
                key={role.slug}
                href={`/admin/pengguna?role=${role.slug}`}
                className="btn text-sm"
                style={
                  activeRole?.slug === role.slug
                    ? { background: "var(--c-primary)", color: "var(--c-on-primary)", minHeight: 44 }
                    : { background: "var(--c-surface)", border: "1px solid var(--c-border)", minHeight: 44 }
                }
              >
                {role.name}
              </a>
            ))}
          </div>
        </div>

        {activeRole ? (
          <form action={saveRoleAction} className="mt-4">
            <input type="hidden" name="slug" value={activeRole.slug} />
            <input type="hidden" name="name" value={activeRole.name} />
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSIONS.map((permission) => (
                <label key={permission.key} className="flex items-start gap-2 rounded-xl border p-2.5 text-sm" style={{ borderColor: "var(--c-border)" }}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission.key}
                    defaultChecked={activePermissions.includes(permission.key)}
                    className="mt-0.5 h-4 w-4"
                    disabled={activeRole.slug === "admin"}
                  />
                  <span>
                    <span className="font-medium">{permission.label}</span>
                    <span className="block text-xs" style={{ color: "var(--c-muted)" }}>
                      {permission.group} · {permission.key}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {activeRole.slug === "admin" ? (
              <p className="mt-3 text-sm" style={{ color: "var(--c-muted)" }}>
                Izin Admin bersifat penuh dan tidak dapat dikurangi.
              </p>
            ) : (
              <button type="submit" className="btn btn-primary mt-4">
                Simpan izin {activeRole.name}
              </button>
            )}
          </form>
        ) : null}
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">Role baru</h2>
        <form action={createRoleAction} className="mt-3 flex flex-wrap gap-2">
          <input name="newRoleName" className="input flex-1" placeholder="Panitia Sekretariat" aria-label="Nama role baru" required />
          <button type="submit" className="btn btn-primary">
            Buat role
          </button>
        </form>
      </Card>
    </AuthShell>
  );
}
