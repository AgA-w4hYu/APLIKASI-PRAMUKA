"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { requirePermission, revokeAllSessions, MAX_ATTEMPTS } from "@/lib/auth";
import { hashPassword, randomPassword } from "@/lib/password";
import { CATEGORIES } from "@/lib/constants";
import { getContest } from "@/lib/services/contests";

function back(path: string, message: string, ok = true): never {
  redirect(`${path}?${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function normalizeCategory(value: string): string | null {
  const found = CATEGORIES.find((c) => c.key === value || c.label.toLowerCase() === value.toLowerCase());
  return found?.key ?? null;
}

export async function createTeamAction(form: FormData): Promise<void> {
  const admin = await requirePermission("tim.kelola");
  const name = text(form, "name");
  const npp = text(form, "npp").toUpperCase();
  const category = normalizeCategory(text(form, "category"));
  if (!name || !npp || !category) back("/admin/tim", "Nama tim, NPP, dan kategori wajib diisi.", false);

  const db = getDb();
  const exists = db.prepare("SELECT 1 AS ok FROM teams WHERE npp = ?").get(npp);
  if (exists) back("/admin/tim", "NPP tersebut sudah dipakai tim lain.", false);

  const now = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO teams (name, npp, category, school, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, npp, category, "SMK Telkom 1 Medan", now);
  const teamId = Number(info.lastInsertRowid);
  const username = npp.toLowerCase().replace(/[^a-z0-9]/g, "");
  const initial = randomPassword();
  db.prepare(
    `INSERT INTO users (username, name, role, team_id, password_hash, active, must_change_password, created_at)
     VALUES (?, ?, 'peserta', ?, ?, 1, 1, ?)`,
  ).run(username, name, teamId, hashPassword(initial), now);
  appendAudit({ id: admin.id, name: admin.name }, "tim.tambah", "team", teamId, { name, npp });
  revalidatePath("/admin/tim");
  back("/admin/tim", `Tim ${name} dibuat. Akun peserta: ${username} / ${initial}`);
}

export async function importTeamsAction(form: FormData): Promise<void> {
  const admin = await requirePermission("tim.kelola");
  const raw = text(form, "csv");
  if (!raw) back("/admin/tim", "Tempel data terlebih dahulu.", false);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const db = getDb();
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  const insertTeam = db.prepare("INSERT INTO teams (name, npp, category, school, created_at) VALUES (?, ?, ?, ?, ?)");
  const insertUser = db.prepare(
    `INSERT INTO users (username, name, role, team_id, password_hash, active, must_change_password, created_at)
     VALUES (?, ?, 'peserta', ?, ?, 1, 1, ?)`,
  );
  const seen = new Set<string>();
  for (const line of lines) {
    const [name, nppRaw, categoryRaw] = line.split(/[,;\t]/).map((s) => s.trim());
    if (!name || !nppRaw) {
      skipped += 1;
      continue;
    }
    if (/^(nama|name)$/i.test(name)) continue;
    const category = normalizeCategory(categoryRaw ?? "");
    const npp = nppRaw.toUpperCase();
    if (!category || seen.has(npp) || db.prepare("SELECT 1 AS ok FROM teams WHERE npp = ?").get(npp)) {
      skipped += 1;
      continue;
    }
    seen.add(npp);
    const info = insertTeam.run(name, npp, category, "SMK Telkom 1 Medan", now);
    insertUser.run(
      npp.toLowerCase().replace(/[^a-z0-9]/g, ""),
      name,
      Number(info.lastInsertRowid),
      hashPassword("peserta123"),
      now,
    );
    added += 1;
  }
  appendAudit({ id: admin.id, name: admin.name }, "tim.impor", "team", null, { added, skipped });
  revalidatePath("/admin/tim");
  back("/admin/tim", `${added} tim ditambahkan, ${skipped} baris dilewati. Kata sandi awal peserta123.`);
}

export async function resetPasswordAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const userId = Number(text(form, "userId"));
  const manual = text(form, "password");
  const db = getDb();
  const user = db.prepare("SELECT id, username, name FROM users WHERE id = ?").get(userId) as
    | { id: number; username: string; name: string }
    | undefined;
  if (!user) back("/admin/pengguna", "Pengguna tidak ditemukan.", false);
  const initial = manual || randomPassword();
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?",
  ).run(hashPassword(initial), userId);
  // Kata sandi baru mencabut sesi lama agar tidak ada perangkat yang tetap masuk.
  const revoked = revokeAllSessions(userId);
  appendAudit({ id: admin.id, name: admin.name }, "pengguna.reset_sandi", "user", userId, {
    username: user.username,
    revoked,
  });
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Kata sandi ${user.username} diatur ulang: ${initial} — tampil sekali, salin sekarang.`);
}

export async function unlockUserAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const userId = Number(text(form, "userId"));
  const db = getDb();
  const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(userId) as
    | { id: number; username: string }
    | undefined;
  if (!user) back("/admin/pengguna", "Pengguna tidak ditemukan.", false);
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(userId);
  appendAudit({ id: admin.id, name: admin.name }, "pengguna.buka_kunci", "user", userId, {
    username: user.username,
    limit: MAX_ATTEMPTS,
  });
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Kunci akun ${user.username} dibuka.`);
}

export async function revokeSessionsAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const userId = Number(text(form, "userId"));
  const db = getDb();
  const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(userId) as
    | { id: number; username: string }
    | undefined;
  if (!user) back("/admin/pengguna", "Pengguna tidak ditemukan.", false);
  const revoked = revokeAllSessions(userId);
  appendAudit({ id: admin.id, name: admin.name }, "pengguna.keluarkan_sesi", "user", userId, {
    username: user.username,
    revoked,
  });
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `${revoked} sesi ${user.username} dikeluarkan.`);
}

export async function toggleUserAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const userId = Number(text(form, "userId"));
  const db = getDb();
  const user = db.prepare("SELECT id, active, username FROM users WHERE id = ?").get(userId) as
    | { id: number; active: number; username: string }
    | undefined;
  if (!user) back("/admin/pengguna", "Pengguna tidak ditemukan.", false);
  if (user.id === admin.id) back("/admin/pengguna", "Anda tidak dapat menonaktifkan akun sendiri.", false);
  db.prepare("UPDATE users SET active = ? WHERE id = ?").run(user.active ? 0 : 1, userId);
  if (user.active) revokeAllSessions(userId);
  appendAudit({ id: admin.id, name: admin.name }, "pengguna.status", "user", userId, { active: !user.active });
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Akun ${user.username} ${user.active ? "dinonaktifkan dan sesinya dikeluarkan" : "diaktifkan"}.`);
}

export async function createUserAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const name = text(form, "name");
  const role = text(form, "role") || "juri";
  const db = getDb();
  if (!name) back("/admin/pengguna", "Nama lengkap wajib diisi.", false);
  if (!db.prepare("SELECT 1 AS ok FROM roles WHERE slug = ?").get(role)) {
    back("/admin/pengguna", "Role tidak dikenal.", false);
  }

  const contestId = Number(text(form, "contestId")) || null;
  const category = normalizeCategory(text(form, "category"));
  const teamId = Number(text(form, "teamId")) || null;
  if (role === "juri" && !contestId) {
    back("/admin/pengguna", "Juri wajib ditugaskan ke satu lomba.", false);
  }
  if (role === "peserta" && !teamId) {
    back("/admin/pengguna", "Akun peserta wajib terhubung ke satu tim.", false);
  }
  let username = text(form, "username").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!username && role === "juri") {
    const contest = getContest(contestId!);
    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'juri' AND username LIKE ?").get(`juri-${contest.slug}-%`) as {
        n: number;
      }
    ).n;
    username = `juri-${contest.slug}-${String(count + 1).padStart(2, "0")}`;
  }
  if (!username && role === "peserta" && teamId) {
    const team = db.prepare("SELECT npp FROM teams WHERE id = ?").get(teamId) as { npp: string } | undefined;
    if (team) username = team.npp.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  if (!username) back("/admin/pengguna", "Nama pengguna wajib diisi.", false);
  if (db.prepare("SELECT 1 AS ok FROM users WHERE username = ?").get(username)) {
    back("/admin/pengguna", "Nama pengguna sudah dipakai.", false);
  }

  const initial = text(form, "password") || randomPassword();
  const mustChange = text(form, "mustChange") === "on" ? 1 : 0;
  const now = new Date().toISOString();
  let userId = 0;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (username, name, role, team_id, password_hash, active, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(username, name, role, teamId, hashPassword(initial), mustChange, now);
    userId = Number(info.lastInsertRowid);
    if (role === "juri" && contestId) {
      db.prepare("INSERT OR IGNORE INTO assignments (juri_id, contest_id, category) VALUES (?, ?, ?)").run(
        userId,
        contestId,
        category,
      );
    }
    appendAudit({ id: admin.id, name: admin.name }, "pengguna.tambah", "user", userId, {
      username,
      role,
      contestId,
      category,
    });
  });
  tx();
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Akun ${username} dibuat. Kata sandi awal: ${initial} — tampil sekali, salin sekarang.`);
}

export async function assignJudgeAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const userId = Number(text(form, "userId"));
  const contestId = Number(text(form, "contestId"));
  const category = normalizeCategory(text(form, "category"));
  const db = getDb();
  const user = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(userId) as
    | { id: number; username: string; role: string }
    | undefined;
  if (!user || user.role !== "juri") back("/admin/pengguna", "Akun juri tidak ditemukan.", false);
  if (!contestId) back("/admin/pengguna", "Pilih lomba untuk penugasan juri.", false);
  if (!getContest(contestId)) back("/admin/pengguna", "Lomba tidak ditemukan.", false);
  db.prepare("DELETE FROM assignments WHERE juri_id = ?").run(userId);
  db.prepare("INSERT INTO assignments (juri_id, contest_id, category) VALUES (?, ?, ?)").run(
    userId,
    contestId,
    category,
  );
  appendAudit({ id: admin.id, name: admin.name }, "juri.tugaskan", "user", userId, {
    username: user.username,
    contestId,
    category,
  });
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Penugasan ${user.username} diperbarui.`);
}

export async function importJudgesAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const contestId = Number(text(form, "contestId"));
  const raw = text(form, "csv");
  if (!contestId) back("/admin/pengguna", "Pilih lomba tujuan impor juri.", false);
  if (!raw) back("/admin/pengguna", "Tempel data juri terlebih dahulu.", false);
  const contest = getContest(contestId);
  const db = getDb();
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  const credentials: string[] = [];
  const insert = db.prepare(
    `INSERT INTO users (username, name, role, password_hash, active, must_change_password, created_at)
     VALUES (?, ?, 'juri', ?, 1, 1, ?)`,
  );
  const assign = db.prepare("INSERT OR IGNORE INTO assignments (juri_id, contest_id, category) VALUES (?, ?, ?)");
  for (const line of lines) {
    const [name, usernameRaw, categoryRaw] = line.split(/[,;\t]/).map((s) => s.trim());
    if (!name || /^(nama|name)$/i.test(name)) {
      skipped += 1;
      continue;
    }
    let username = (usernameRaw ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!username) {
      const count = (
        db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'juri' AND username LIKE ?").get(`juri-${contest.slug}-%`) as { n: number }
      ).n;
      username = `juri-${contest.slug}-${String(count + 1).padStart(2, "0")}`;
    }
    if (db.prepare("SELECT 1 AS ok FROM users WHERE username = ?").get(username)) {
      skipped += 1;
      continue;
    }
    const initial = randomPassword();
    const info = insert.run(username, name, hashPassword(initial), now);
    assign.run(Number(info.lastInsertRowid), contestId, normalizeCategory(categoryRaw ?? ""));
    credentials.push(`${username} / ${initial}`);
    added += 1;
  }
  appendAudit({ id: admin.id, name: admin.name }, "pengguna.impor_juri", "user", null, {
    contestId,
    added,
    skipped,
  });
  revalidatePath("/admin/pengguna");
  back(
    "/admin/pengguna",
    `${added} akun juri dibuat, ${skipped} dilewati. Kata sandi awal: ${credentials.slice(0, 6).join(" · ") || "—"}`,
  );
}

export async function markCardsPrintedAction(form: FormData): Promise<void> {
  const admin = await requirePermission("pengguna.kelola");
  const role = text(form, "role") || "juri";
  const db = getDb();
  const users = db.prepare("SELECT id FROM users WHERE role = ? AND active = 1").all(role) as { id: number }[];
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO account_cards (user_id, printed_by, printed_at) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    for (const item of users) insert.run(item.id, admin.name, now);
  });
  tx();
  appendAudit({ id: admin.id, name: admin.name }, "kartu.cetak", "account_card", null, {
    role,
    count: users.length,
  });
  revalidatePath("/admin/pengguna/kartu");
  redirect("/admin/pengguna/kartu?role=" + role + "&ok=" + encodeURIComponent("Pencetakan dicatat."));
}

export async function createContestAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const name = text(form, "name");
  const type = text(form, "type") === "lctp" ? "lctp" : "juri";
  const teamSize = Number(text(form, "teamSize") || 3);
  const duration = Number(text(form, "durationMin") || 10);
  if (!name) back("/admin/lomba", "Nama lomba wajib diisi.", false);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `lomba-${Date.now()}`;
  const db = getDb();
  if (db.prepare("SELECT 1 AS ok FROM contests WHERE slug = ?").get(slug)) {
    back("/admin/lomba", "Lomba dengan nama serupa sudah ada.", false);
  }
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM contests").get() as { n: number }).n;
  const info = db
    .prepare(
      `INSERT INTO contests (name, slug, type, team_size, duration_min, description, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
    .run(name, slug, type, teamSize, duration, text(form, "description"), maxOrder + 1, new Date().toISOString());
  appendAudit({ id: admin.id, name: admin.name }, "lomba.tambah", "contest", Number(info.lastInsertRowid), { name, type });
  revalidatePath("/admin/lomba");
  back("/admin/lomba", `Lomba ${name} dibuat. Siapkan lembar penilaian atau bank soal.`);
}

export async function updateContestAction(form: FormData): Promise<void> {
  const admin = await requirePermission("lomba.ubah");
  const contestId = Number(text(form, "contestId"));
  const action = text(form, "action");
  const db = getDb();
  const contest = db.prepare("SELECT * FROM contests WHERE id = ?").get(contestId) as
    | { id: number; name: string; status: string; show_leaderboard: number }
    | undefined;
  if (!contest) back("/admin/lomba", "Lomba tidak ditemukan.", false);

  if (action === "status") {
    const status = text(form, "status");
    if (!["draft", "berjalan", "selesai"].includes(status)) back("/admin/lomba", "Status tidak dikenal.", false);
    db.prepare("UPDATE contests SET status = ? WHERE id = ?").run(status, contestId);
    appendAudit({ id: admin.id, name: admin.name }, "lomba.status", "contest", contestId, { status });
    revalidatePath("/admin/lomba");
    back("/admin/lomba", `Status ${contest.name} diubah menjadi ${status}.`);
  }
  if (action === "leaderboard") {
    db.prepare("UPDATE contests SET show_leaderboard = ? WHERE id = ?").run(contest.show_leaderboard ? 0 : 1, contestId);
    appendAudit({ id: admin.id, name: admin.name }, "lomba.leaderboard", "contest", contestId, {
      show: !contest.show_leaderboard,
    });
    revalidatePath("/admin/lomba");
    back("/admin/lomba", "Pengaturan tampilan leaderboard diperbarui.");
  }
  if (action === "assign") {
    const juriId = Number(text(form, "juriId"));
    if (!juriId) back("/admin/lomba", "Pilih juri terlebih dahulu.", false);
    db.prepare("INSERT OR IGNORE INTO assignments (juri_id, contest_id) VALUES (?, ?)").run(juriId, contestId);
    appendAudit({ id: admin.id, name: admin.name }, "lomba.tugaskan", "contest", contestId, { juriId });
    revalidatePath("/admin/lomba");
    back("/admin/lomba", "Juri ditugaskan.");
  }
  if (action === "unassign") {
    const assignmentId = Number(text(form, "assignmentId"));
    db.prepare("DELETE FROM assignments WHERE id = ? AND contest_id = ?").run(assignmentId, contestId);
    appendAudit({ id: admin.id, name: admin.name }, "lomba.lepas_tugas", "contest", contestId, { assignmentId });
    revalidatePath("/admin/lomba");
    back("/admin/lomba", "Penugasan juri dilepas.");
  }
  back("/admin/lomba", "Tindakan tidak dikenal.", false);
}

export async function saveRoleAction(form: FormData): Promise<void> {
  const admin = await requirePermission("peran.kelola");
  const slug = text(form, "slug");
  const name = text(form, "name") || slug;
  const permissions = form.getAll("permissions").map(String);
  const db = getDb();
  const existing = db.prepare("SELECT * FROM roles WHERE slug = ?").get(slug) as
    | { slug: string; is_system: number; permissions: string }
    | undefined;
  if (existing) {
    if (slug === "admin") back("/admin/pengguna", "Izin Admin tidak boleh dikurangi.", false);
    db.prepare("UPDATE roles SET name = ?, permissions = ? WHERE slug = ?").run(
      name,
      JSON.stringify(permissions),
      slug,
    );
  } else {
    db.prepare("INSERT INTO roles (slug, name, permissions, is_system) VALUES (?, ?, ?, 0)").run(
      slug,
      name,
      JSON.stringify(permissions),
    );
  }
  appendAudit({ id: admin.id, name: admin.name }, "peran.ubah", "role", slug, { permissions });
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Role ${name} disimpan.`);
}

export async function createRoleAction(form: FormData): Promise<void> {
  await requirePermission("peran.kelola");
  const name = text(form, "newRoleName");
  if (!name) back("/admin/pengguna", "Nama role baru wajib diisi.", false);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const db = getDb();
  if (db.prepare("SELECT 1 AS ok FROM roles WHERE slug = ?").get(slug)) {
    back("/admin/pengguna", "Role itu sudah ada.", false);
  }
  db.prepare("INSERT INTO roles (slug, name, permissions, is_system) VALUES (?, ?, '[]', 0)").run(slug, name);
  revalidatePath("/admin/pengguna");
  back("/admin/pengguna", `Role ${name} dibuat. Atur izinnya di bawah.`);
}
