import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword, passwordProblems } from "@/lib/password";

export { hashPassword };
export { verifyPassword };

export const SESSION_COOKIE = "ab9_session";
const SESSION_HOURS = 4;
const REMEMBER_HOURS = 12;
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 10;

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: string;
  roleName: string;
  permissions: string[];
  teamId: number | null;
  mustChangePassword: boolean;
  assignedContestId: number | null;
  judgeCategory: string | null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: string;
  team_id: number | null;
  password_hash: string;
  active: number;
  must_change_password: number;
  failed_attempts: number;
  locked_until: string | null;
  deleted_at: string | null;
  role_name: string;
  permissions: string;
  assigned_contest_id: number | null;
  judge_category: string | null;
}

function permissionsOf(row: { permissions: string }): string[] {
  try {
    const parsed = JSON.parse(row.permissions);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const USER_SELECT = `
  SELECT u.*, u.password_hash, r.name AS role_name, r.permissions AS permissions,
         a.contest_id AS assigned_contest_id, a.category AS judge_category
  FROM users u
  JOIN roles r ON r.slug = u.role
  LEFT JOIN assignments a ON a.juri_id = u.id
`;

function toUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    roleName: row.role_name,
    permissions: permissionsOf(row),
    teamId: row.team_id,
    mustChangePassword: Boolean(row.must_change_password),
    assignedContestId: row.assigned_contest_id ?? null,
    judgeCategory: row.judge_category ?? null,
  };
}

export function isLocked(row: { locked_until: string | null }): boolean {
  return Boolean(row.locked_until && new Date(row.locked_until).getTime() > Date.now());
}

/**
 * Masuk dengan nama pengguna dan kata sandi. Pesan galat tidak membocorkan
 * apakah nama pengguna terdaftar. Setiap kegagalan dicatat oleh pemanggil.
 */
export function login(username: string, password: string): SessionUser {
  const db = getDb();
  const row = db
    .prepare(`${USER_SELECT} WHERE u.username = ?`)
    .get(username.trim().toLowerCase()) as UserRow | undefined;

  if (!row) throw new AuthError("Nama pengguna atau kata sandi belum cocok. Periksa lagi atau hubungi panitia.");
  if (!row.active || row.deleted_at) {
    throw new AuthError("Akun ini dinonaktifkan. Hubungi panitia di sekretariat.", 403);
  }
  if (isLocked(row)) {
    throw new AuthError(
      `Akun terkunci sementara karena percobaan masuk berulang. Coba lagi ${LOCK_MINUTES} menit lagi atau minta panitia membuka kuncinya.`,
      423,
    );
  }
  if (!verifyPassword(password, row.password_hash)) {
    const attempts = row.failed_attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").run(
      locked ? 0 : attempts,
      locked ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      row.id,
    );
    throw new AuthError("Nama pengguna atau kata sandi belum cocok. Periksa lagi atau hubungi panitia.");
  }

  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    row.id,
  );
  return toUser(row);
}

/** Juri dan peserta hanya boleh punya satu sesi aktif. */
export function activeSessions(userId: number): { token: string; device: string | null; created_at: string }[] {
  return getDb()
    .prepare(
      "SELECT token, device, created_at FROM sessions WHERE user_id = ? AND ended_at IS NULL AND expires_at > ? ORDER BY created_at DESC",
    )
    .all(userId, new Date().toISOString()) as { token: string; device: string | null; created_at: string }[];
}

export function createSession(
  userId: number,
  options: { remember?: boolean; device?: string | null; ip?: string | null } = {},
): string {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const hours = options.remember ? REMEMBER_HOURS : SESSION_HOURS;
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  db.prepare(
    "INSERT INTO sessions (token, user_id, device, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    token,
    userId,
    options.device ?? null,
    options.ip ?? null,
    new Date().toISOString(),
    new Date(Date.now() + hours * 3600_000).toISOString(),
  );
  return token;
}

export function revokeSession(token: string): void {
  getDb().prepare("UPDATE sessions SET ended_at = ? WHERE token = ? AND ended_at IS NULL").run(
    new Date().toISOString(),
    token,
  );
}

export function revokeAllSessions(userId: number, exceptToken?: string): number {
  const info = getDb()
    .prepare(
      "UPDATE sessions SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL AND token != ?",
    )
    .run(new Date().toISOString(), userId, exceptToken ?? "");
  return info.changes;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  revokeSession(token);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, r.name AS role_name, r.permissions AS permissions,
              a.contest_id AS assigned_contest_id, a.category AS judge_category, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.slug = u.role
       LEFT JOIN assignments a ON a.juri_id = u.id
       WHERE s.token = ? AND s.ended_at IS NULL`,
    )
    .get(token) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now() || !row.active) {
    destroySession(token);
    return null;
  }
  return toUser(row);
}

export function can(user: SessionUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthError("Anda perlu masuk terlebih dahulu.", 401);
  return user;
}

export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    throw new AuthError("Anda tidak memiliki izin untuk tindakan ini.", 403);
  }
  return user;
}

/** Ganti kata sandi sendiri; sesi lain dicabut setelah berhasil. */
export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as
    | { password_hash: string }
    | undefined;
  if (!row) throw new AuthError("Akun tidak ditemukan.", 404);
  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw new AuthError("Kata sandi saat ini belum cocok.");
  }
  if (verifyPassword(newPassword, row.password_hash)) {
    throw new AuthError("Kata sandi baru harus berbeda dari yang sekarang.");
  }
  const problems = passwordProblems(newPassword);
  if (problems.length > 0) throw new AuthError(problems[0]);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(
    hashPassword(newPassword),
    userId,
  );
}

export function sessionCookieOptions(remember = false) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: (remember ? REMEMBER_HOURS : SESSION_HOURS) * 3600,
  };
}

export function newPasswordHash(): { hash: string; initial: string } {
  const initial = randomBytes(4).toString("hex");
  return { hash: hashPassword(initial), initial };
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
