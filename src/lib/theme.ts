import { getDb } from "@/lib/db";
import {
  DEFAULT_THEMES,
  THEME_ROLES,
  TOKEN_KEYS,
  type TokenKey,
  type Tokens,
} from "@/lib/themeTokens";

export {
  DEFAULT_THEMES,
  THEME_ROLES,
  TOKEN_KEYS,
  TOKEN_LABELS,
  checkThemeContrast,
  contrastRatio,
  themeCss,
  type TokenKey,
  type Tokens,
} from "@/lib/themeTokens";

export function getTheme(roleKey: string): Tokens {
  const fallback = DEFAULT_THEMES[roleKey] ?? DEFAULT_THEMES.peserta;
  const rows = getDb()
    .prepare("SELECT token, value FROM theme_tokens WHERE role_key = ?")
    .all(roleKey) as { token: string; value: string }[];
  const merged: Tokens = { ...fallback };
  for (const row of rows) {
    if ((TOKEN_KEYS as readonly string[]).includes(row.token)) {
      merged[row.token as TokenKey] = row.value;
    }
  }
  return merged;
}

export function getAllThemes(): Record<string, Tokens> {
  return Object.fromEntries(THEME_ROLES.map((r) => [r.key, getTheme(r.key)]));
}

export function saveTheme(roleKey: string, tokens: Partial<Tokens>): void {
  const db = getDb();
  const now = new Date().toISOString();
  const statement = db.prepare(
    `INSERT INTO theme_tokens (role_key, token, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(role_key, token) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  for (const key of TOKEN_KEYS) {
    const value = tokens[key];
    if (value && /^#[0-9a-fA-F]{6}$/.test(value)) statement.run(roleKey, key, value, now);
  }
}

export function resetTheme(roleKey: string): void {
  getDb().prepare("DELETE FROM theme_tokens WHERE role_key = ?").run(roleKey);
}
