import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { hashPassword } from "@/lib/password";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { computeScore, type ScoreItem } from "@/lib/scoring";

const DB_PATH = process.env.AB9_DB ?? path.join(process.cwd(), "data", "abrakadabra9.db");

const globalForDb = globalThis as unknown as { __ab9db?: Database.Database };

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  npp TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  school TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES roles(slug),
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device TEXT,
  ip TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'juri',
  team_size INTEGER NOT NULL DEFAULT 3,
  duration_min INTEGER NOT NULL DEFAULT 10,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  show_leaderboard INTEGER NOT NULL DEFAULT 1,
  anonymous INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  juri_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  category TEXT,
  UNIQUE(juri_id, contest_id)
);

CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sheet_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sheet_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES sheet_sections(id) ON DELETE CASCADE,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hint TEXT,
  max_value REAL NOT NULL DEFAULT 10,
  weight REAL NOT NULL DEFAULT 1,
  input_type TEXT NOT NULL DEFAULT 'angka',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  sheet_id INTEGER REFERENCES sheets(id) ON DELETE SET NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  juri_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draf',
  total REAL NOT NULL DEFAULT 0,
  breakdown TEXT NOT NULL DEFAULT '{}',
  penalties TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  pending_revision_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  UNIQUE(sheet_id, team_id, juri_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_lctp ON scores(contest_id, team_id) WHERE juri_id IS NULL;

CREATE TABLE IF NOT EXISTS score_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  old_total REAL NOT NULL,
  new_total REAL NOT NULL,
  old_breakdown TEXT NOT NULL,
  new_breakdown TEXT NOT NULL,
  reason TEXT NOT NULL,
  penalties TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'diterapkan',
  signed_at TEXT,
  admin_id INTEGER,
  admin_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS correction_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  juri_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'menunggu',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  image_url TEXT,
  options TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  score REAL NOT NULL DEFAULT 10,
  difficulty TEXT NOT NULL DEFAULT 'sedang',
  package_name TEXT NOT NULL DEFAULT 'Paket A',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL DEFAULT 'berjalan',
  score REAL,
  question_order TEXT NOT NULL,
  option_order TEXT NOT NULL DEFAULT '{}',
  UNIQUE(contest_id, team_id)
);

CREATE TABLE IF NOT EXISTS exam_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  chosen INTEGER NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL,
  UNIQUE(session_id, question_id)
);

CREATE TABLE IF NOT EXISTS releases (
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  released_at TEXT NOT NULL,
  released_by TEXT,
  PRIMARY KEY (contest_id, category)
);

CREATE TABLE IF NOT EXISTS theme_tokens (
  role_key TEXT NOT NULL,
  token TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (role_key, token)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'menunggu',
  called_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(contest_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_contest ON team_queue(contest_id, position);

CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id INTEGER NOT NULL UNIQUE REFERENCES scores(id) ON DELETE CASCADE,
  strokes TEXT NOT NULL,
  image TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  signed_at TEXT NOT NULL,
  device_time TEXT,
  ip TEXT,
  device TEXT,
  verification_code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS account_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  printed_by TEXT NOT NULL,
  printed_at TEXT NOT NULL
);
`;

/** Kolom yang ditambahkan setelah versi pertama; ALTER hanya dijalankan sekali. */
const MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "users", column: "last_login_at", ddl: "ALTER TABLE users ADD COLUMN last_login_at TEXT" },
  { table: "users", column: "deleted_at", ddl: "ALTER TABLE users ADD COLUMN deleted_at TEXT" },
  { table: "sessions", column: "device", ddl: "ALTER TABLE sessions ADD COLUMN device TEXT" },
  { table: "sessions", column: "ip", ddl: "ALTER TABLE sessions ADD COLUMN ip TEXT" },
  { table: "sessions", column: "ended_at", ddl: "ALTER TABLE sessions ADD COLUMN ended_at TEXT" },
  { table: "assignments", column: "category", ddl: "ALTER TABLE assignments ADD COLUMN category TEXT" },
  { table: "contests", column: "anonymous", ddl: "ALTER TABLE contests ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0" },
  { table: "scores", column: "pending_revision_id", ddl: "ALTER TABLE scores ADD COLUMN pending_revision_id INTEGER" },
  { table: "score_revisions", column: "penalties", ddl: "ALTER TABLE score_revisions ADD COLUMN penalties TEXT NOT NULL DEFAULT '[]'" },
  { table: "score_revisions", column: "status", ddl: "ALTER TABLE score_revisions ADD COLUMN status TEXT NOT NULL DEFAULT 'diterapkan'" },
  { table: "score_revisions", column: "signed_at", ddl: "ALTER TABLE score_revisions ADD COLUMN signed_at TEXT" },
];

function migrate(db: Database.Database): void {
  for (const item of MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${item.table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === item.column)) {
      db.exec(item.ddl);
    }
  }
}

const TEAM_NAMES: Record<string, string[]> = {
  penegak: [
    "Garuda", "Rajawali", "Elang", "Cendrawasih", "Merpati",
    "Kenari", "Parkit", "Nuri", "Kakaktua", "Pelatuk",
    "Bangau", "Camar", "Alap-alap", "Sikatan", "Maleo",
  ],
  penggalang_putra: [
    "Arjuna", "Bima", "Sadewa", "Nakula", "Yudistira", "Gatotkaca",
    "Abimanyu", "Irawan", "Setyaki", "Antareja", "Anoman", "Kresna",
  ],
  penggalang_putri: [
    "Srikandi", "Drupadi", "Kunti", "Gandari", "Rukmini", "Sinta",
    "Larasati", "Banowati", "Mustika", "Prameswari", "Adinda", "Kusuma",
  ],
};

const NPP_PREFIX: Record<string, string> = {
  penegak: "PNG",
  penggalang_putra: "PGP",
  penggalang_putri: "PGW",
};

interface SeedSheetItem {
  name: string;
  hint: string;
  max: number;
  type?: string;
}

const SEED_SHEETS: {
  contest: string;
  sections: { name: string; items: SeedSheetItem[] }[];
  penalties: { name: string; value: number }[];
}[] = [
  {
    contest: "lkbb",
    sections: [
      {
        name: "Gerakan Dasar",
        items: [
          { name: "Sikap sempurna", hint: "Badan tegap, tumit rapat, pandangan lurus.", max: 10 },
          { name: "Hadap kanan dan kiri", hint: "Hitungan tegas, tidak goyah.", max: 10 },
          { name: "Jalan di tempat", hint: "Angkat kaki seragam, ketukan sama.", max: 15 },
          { name: "Langkah tegap", hint: "Panjang langkah dan ayunan tangan konsisten.", max: 15 },
        ],
      },
      {
        name: "Formasi dan Kekompakan",
        items: [
          { name: "Variasi formasi", hint: "Perpindahan formasi rapi dan tidak bertabrakan.", max: 15 },
          { name: "Kekompakan", hint: "Gerakan serempak dari awal sampai akhir.", max: 15 },
        ],
      },
      {
        name: "Penampilan",
        items: [
          { name: "Atribut dan kerapian", hint: "Seragam, tanda pengenal, dan sepatu lengkap.", max: 10 },
          { name: "Semangat dan ekspresi", hint: "Suara komando jelas, semangat terjaga.", max: 10 },
        ],
      },
    ],
    penalties: [
      { name: "Terlambat masuk lapangan", value: 5 },
      { name: "Atribut tidak lengkap", value: 5 },
    ],
  },
  {
    contest: "pionering",
    sections: [
      {
        name: "Perencanaan",
        items: [
          { name: "Rancangan dan gambar kerja", hint: "Sketsa jelas, ukuran masuk akal.", max: 15 },
          { name: "Pembagian tugas", hint: "Semua anggota punya peran.", max: 10 },
        ],
      },
      {
        name: "Konstruksi",
        items: [
          { name: "Ketepatan simpul dan ikatan", hint: "Simpul pangkal, jangkar, dan palang benar.", max: 30 },
          { name: "Kekuatan dan stabilitas", hint: "Bangunan kokoh saat diuji goyang.", max: 25 },
        ],
      },
      {
        name: "Presentasi",
        items: [
          { name: "Kreativitas dan fungsi", hint: "Bentuk menarik dan bisa dipakai.", max: 10 },
          { name: "Kerja sama dan kebersihan", hint: "Area kerja bersih setelah selesai.", max: 10 },
        ],
      },
    ],
    penalties: [
      { name: "Melebihi waktu", value: 10 },
      { name: "Alat tidak dikembalikan", value: 5 },
    ],
  },
  {
    contest: "scouting-skill",
    sections: [
      {
        name: "Sandi dan Isyarat",
        items: [
          { name: "Sandi rumput", hint: "Membaca dan menulis sandi dengan tepat.", max: 20 },
          { name: "Semaphore", hint: "Isyarat huruf jelas dan cepat.", max: 25 },
          { name: "Morse", hint: "Titik dan garis tepat, tempo teratur.", max: 25 },
        ],
      },
      {
        name: "Ketepatan dan Kecepatan",
        items: [
          { name: "Ketepatan terjemahan", hint: "Pesan akhir sesuai isi asli.", max: 20 },
          { name: "Waktu penyelesaian", hint: "Selesai dalam batas waktu.", max: 10 },
        ],
      },
    ],
    penalties: [{ name: "Melebihi batas waktu", value: 5 }],
  },
];

const SEED_QUESTIONS: { text: string; options: string[]; answer: number; score: number; difficulty: string }[] = [
  {
    text: "Siapa yang dikenal sebagai Bapak Pramuka Dunia?",
    options: ["Robert Baden-Powell", "William Boyce", "Olave Baden-Powell", "Ernest Thompson Seton"],
    answer: 0,
    score: 10,
    difficulty: "mudah",
  },
  {
    text: "Tingkatan Pramuka Penggalang secara berurutan adalah ...",
    options: ["Ramu, Rakit, Terap", "Siaga, Penggalang, Penegak", "Rakit, Ramu, Terap", "Ramu, Terap, Rakit"],
    answer: 0,
    score: 10,
    difficulty: "mudah",
  },
  {
    text: "Jumlah titik pada isyarat Morse huruf S adalah ...",
    options: ["Tiga", "Dua", "Empat", "Satu"],
    answer: 0,
    score: 10,
    difficulty: "sedang",
  },
  {
    text: "Simpul yang dipakai untuk mengikat tongkat agar tidak mudah lepas adalah ...",
    options: ["Simpul pangkal", "Simpul mati", "Simpul hidup", "Simpul tarik"],
    answer: 0,
    score: 10,
    difficulty: "sedang",
  },
  {
    text: "Warna dasar syal (setangan leher) Pramuka Penggalang adalah ...",
    options: ["Merah", "Biru", "Hijau", "Coklat"],
    answer: 0,
    score: 10,
    difficulty: "mudah",
  },
  {
    text: "Satuan terkecil dalam golongan Pramuka Penggalang disebut ...",
    options: ["Regu", "Sangga", "Barung", "Perindukan"],
    answer: 0,
    score: 10,
    difficulty: "sedang",
  },
  {
    text: "Lambang gerakan Pramuka adalah ...",
    options: ["Tunas kelapa", "Bintang segi lima", "Kompas", "Padi dan kapas"],
    answer: 0,
    score: 10,
    difficulty: "mudah",
  },
  {
    text: "Isyarat semaphore menggunakan alat bantu berupa ...",
    options: ["Dua bendera", "Satu tongkat", "Peluit", "Tambur"],
    answer: 0,
    score: 10,
    difficulty: "mudah",
  },
  {
    text: "Kode kehormatan Pramuka Penegak disebut ...",
    options: ["Tri Satya dan Dasa Darma", "Dwi Darma", "Dwi Satya", "Trisatya saja"],
    answer: 0,
    score: 10,
    difficulty: "sedang",
  },
  {
    text: "Morse untuk huruf SOS adalah ...",
    options: ["... --- ...", "--- ... ---", "... ... ...", "--- --- ---"],
    answer: 0,
    score: 10,
    difficulty: "sulit",
  },
];

function seed(db: Database.Database): void {
  const now = new Date().toISOString();
  const roleInsert = db.prepare(
    "INSERT OR IGNORE INTO roles (slug, name, permissions, is_system) VALUES (?, ?, ?, ?)",
  );
  for (const role of DEFAULT_ROLES) {
    roleInsert.run(role.slug, role.name, JSON.stringify(role.permissions), role.isSystem ? 1 : 0);
  }

  const settingInsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  settingInsert.run("event_name", "ABRAKADABRA 9");
  settingInsert.run("event_venue", "Bumi Perkemahan SMK Telkom 1 Medan");
  settingInsert.run("event_year", String(new Date().getFullYear()));
  settingInsert.run("school", "SMK Telkom 1 Medan");

  const alreadySeeded = db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number };
  if (alreadySeeded.n > 0) return;

  const teamIds: Record<string, number[]> = { penegak: [], penggalang_putra: [], penggalang_putri: [] };
  const teamInsert = db.prepare(
    "INSERT INTO teams (name, npp, category, school, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const userInsert = db.prepare(
    `INSERT INTO users (username, name, role, team_id, password_hash, active, must_change_password, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
  );

  for (const [category, names] of Object.entries(TEAM_NAMES)) {
    names.forEach((name, index) => {
      const seq = String(index + 1).padStart(3, "0");
      const npp = `${NPP_PREFIX[category]}-${seq}`;
      const info = teamInsert.run(`Tim ${name}`, npp, category, "SMK Telkom 1 Medan", now);
      const teamId = Number(info.lastInsertRowid);
      teamIds[category].push(teamId);
      userInsert.run(
        npp.toLowerCase().replace("-", ""),
        `Tim ${name}`,
        "peserta",
        teamId,
        hashPassword("peserta123"),
        now,
      );
    });
  }

  const adminId = Number(
    userInsert.run("admin", "Panitia ABRAKADABRA 9", "admin", null, hashPassword("admin123"), now)
      .lastInsertRowid,
  );
  // Satu akun juri terikat pada satu lomba, sesuai Addendum PRD v2.1 bagian 5.1.
  const juriSeed = [
    { username: "juri-lkbb-01", name: "Kak Rina Sitorus", contest: "lkbb" },
    { username: "juri-lkbb-02", name: "Kak Andi Harahap", contest: "lkbb" },
    { username: "juri-pionering-01", name: "Kak Dedi Pratama", contest: "pionering" },
    { username: "juri-scouting-01", name: "Kak Maya Lubis", contest: "scouting-skill" },
  ];
  const juriIds: Record<string, number> = {};
  for (const j of juriSeed) {
    juriIds[j.username] = Number(
      userInsert.run(j.username, j.name, "juri", null, hashPassword("juri123"), now).lastInsertRowid,
    );
  }

  const contestInsert = db.prepare(
    `INSERT INTO contests (name, slug, type, team_size, duration_min, description, status, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const contests: { id: number; slug: string; type: string }[] = [];
  const contestSeed = [
    {
      name: "LKBB",
      slug: "lkbb",
      type: "juri",
      teamSize: 7,
      duration: 10,
      description: "Latihan Keterampilan Baris Berbaris. 7 orang per tim, 10 menit per penampilan.",
      status: "berjalan",
      sort: 1,
    },
    {
      name: "Pionering",
      slug: "pionering",
      type: "juri",
      teamSize: 5,
      duration: 45,
      description: "Membuat model bangunan darurat dari tongkat dan tali. 5 orang per tim, 45 menit.",
      status: "draft",
      sort: 2,
    },
    {
      name: "LCTP",
      slug: "lctp",
      type: "lctp",
      teamSize: 2,
      duration: 30,
      description: "Lomba Cerdas Tangkas Pramuka. Pilihan ganda di aplikasi, dinilai otomatis.",
      status: "draft",
      sort: 3,
    },
    {
      name: "Scouting Skill",
      slug: "scouting-skill",
      type: "juri",
      teamSize: 3,
      duration: 25,
      description: "Sandi rumput, semaphore, dan morse. 3 orang per tim.",
      status: "draft",
      sort: 4,
    },
  ];
  for (const c of contestSeed) {
    const info = contestInsert.run(
      c.name,
      c.slug,
      c.type,
      c.teamSize,
      c.duration,
      c.description,
      c.status,
      c.sort,
      now,
    );
    contests.push({ id: Number(info.lastInsertRowid), slug: c.slug, type: c.type });
  }

  const assignmentInsert = db.prepare("INSERT OR IGNORE INTO assignments (juri_id, contest_id) VALUES (?, ?)");
  for (const j of juriSeed) {
    const contest = contests.find((c) => c.slug === j.contest);
    if (contest) assignmentInsert.run(juriIds[j.username], contest.id);
  }

  // Antrean awal: urutan tampil ditentukan panitia, bukan dipilih juri.
  const queueInsert = db.prepare(
    "INSERT OR IGNORE INTO team_queue (contest_id, team_id, position, status, called_at, created_at) VALUES (?, ?, ?, 'menunggu', NULL, ?)",
  );
  const allTeams = db
    .prepare("SELECT id FROM teams ORDER BY CASE category WHEN 'penegak' THEN 0 WHEN 'penggalang_putra' THEN 1 ELSE 2 END, name ASC")
    .all() as { id: number }[];
  for (const contest of contests) {
    if (contest.type !== "juri") continue;
    allTeams.forEach((team, index) => queueInsert.run(contest.id, team.id, index + 1, now));
    if (contest.slug === "lkbb") {
      db.prepare(
        "UPDATE team_queue SET status = 'dipanggil', called_at = ? WHERE contest_id = ? AND position = 1",
      ).run(now, contest.id);
    }
  }

  const sheetInsert = db.prepare("INSERT INTO sheets (contest_id, version, locked, created_at) VALUES (?, 1, 1, ?)");
  const sectionInsert = db.prepare(
    "INSERT INTO sheet_sections (sheet_id, name, sort_order) VALUES (?, ?, ?)",
  );
  const itemInsert = db.prepare(
    `INSERT INTO sheet_items (section_id, sheet_id, name, hint, max_value, weight, input_type, sort_order)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const penaltyInsert = db.prepare("INSERT INTO penalties (sheet_id, name, value, sort_order) VALUES (?, ?, ?, ?)");
  const sheetByContest: Record<string, number> = {};

  for (const def of SEED_SHEETS) {
    const contest = contests.find((c) => c.slug === def.contest);
    if (!contest) continue;
    const sheetId = Number(sheetInsert.run(contest.id, now).lastInsertRowid);
    sheetByContest[def.contest] = sheetId;
    def.sections.forEach((section, sIndex) => {
      const sectionId = Number(sectionInsert.run(sheetId, section.name, sIndex).lastInsertRowid);
      section.items.forEach((item, iIndex) => {
        itemInsert.run(sectionId, sheetId, item.name, item.hint, item.max, item.type ?? "angka", iIndex);
      });
    });
    def.penalties.forEach((p, pIndex) => penaltyInsert.run(sheetId, p.name, p.value, pIndex));
  }

  const lctp = contests.find((c) => c.slug === "lctp");
  if (lctp) {
    const questionInsert = db.prepare(
      `INSERT INTO questions (contest_id, text, options, answer_index, score, difficulty, package_name, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 'Paket A', ?)`,
    );
    SEED_QUESTIONS.forEach((q, index) => {
      questionInsert.run(lctp.id, q.text, JSON.stringify(q.options), q.answer, q.score, q.difficulty, index);
    });
  }

  // Akun contoh tidak dipaksa ganti kata sandi; opsi ini tetap tersedia per akun.
  db.prepare("UPDATE users SET must_change_password = 0").run();

  // Tidak ada nilai contoh: setiap nilai terkirim yang ada di sistem harus
  // memiliki tanda tangan juri yang sah (Addendum bagian 7 dan 11).
  void adminId;
  void sheetByContest;
  void teamIds;
}

export function getDb(): Database.Database {
  if (globalForDb.__ab9db) return globalForDb.__ab9db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  seed(db);
  globalForDb.__ab9db = db;
  return db;
}

export function getSetting(key: string, fallback = ""): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}
