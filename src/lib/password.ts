import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt with a per-password salt. Lihat README: deviasi dari Argon2id. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const WORDS = [
  "kayu",
  "tali",
  "tenda",
  "api",
  "batu",
  "daun",
  "hutan",
  "sungai",
  "bukit",
  "kompas",
  "peta",
  "simpul",
  "tongkat",
  "bendera",
  "semak",
  "embun",
  "padi",
  "bambu",
  "kelana",
  "jejak",
];

/**
 * Kata sandi awal yang mudah dibaca dan diketik, misalnya `kayu-tali-482`.
 * Tanpa karakter yang mudah tertukar (0/O, 1/l).
 */
export function randomPassword(): string {
  const first = WORDS[randomInt(0, WORDS.length)];
  let second = WORDS[randomInt(0, WORDS.length)];
  if (second === first) second = WORDS[(WORDS.indexOf(first) + 3) % WORDS.length];
  const digits = String(randomInt(234, 788));
  return `${first}-${second}-${digits}`;
}

export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push("Kata sandi minimal 8 karakter.");
  if (!/[a-zA-Z]/.test(password)) problems.push("Kata sandi perlu memuat huruf.");
  if (!/[0-9]/.test(password)) problems.push("Kata sandi perlu memuat angka.");
  return problems;
}
