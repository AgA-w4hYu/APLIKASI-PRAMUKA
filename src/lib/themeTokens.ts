import type { CSSProperties } from "react";

export const TOKEN_KEYS = [
  "bg",
  "surface",
  "text",
  "muted",
  "primary",
  "on_primary",
  "accent",
  "border",
  "success",
  "danger",
  "primary_soft",
  "accent_soft",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type Tokens = Record<TokenKey, string>;

export const TOKEN_LABELS: Record<TokenKey, string> = {
  bg: "Latar",
  surface: "Permukaan",
  text: "Teks",
  muted: "Teks sekunder",
  primary: "Warna utama",
  on_primary: "Teks di atas warna utama",
  accent: "Aksen",
  border: "Garis pemisah",
  success: "Sukses",
  danger: "Galat",
  primary_soft: "Latar lembut utama",
  accent_soft: "Latar lembut aksen",
};

const base: Tokens = {
  bg: "#F6F0E6",
  surface: "#FFFDF8",
  text: "#371F17",
  muted: "#6B5B50",
  primary: "#5E3E2E",
  on_primary: "#F6F0E6",
  accent: "#936538",
  border: "#DED3BF",
  success: "#606A46",
  danger: "#8E2F23",
  primary_soft: "#EFE6D8",
  accent_soft: "#F0E4D2",
};

export const THEME_ROLES: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "juri", label: "Juri" },
  { key: "peserta", label: "Peserta" },
  { key: "penegak", label: "Kategori Penegak" },
  { key: "penggalang_putra", label: "Kategori Penggalang Putra" },
  { key: "penggalang_putri", label: "Kategori Penggalang Putri" },
];

export const DEFAULT_THEMES: Record<string, Tokens> = {
  admin: { ...base, primary: "#371F17", accent: "#936538", primary_soft: "#EDE3D3" },
  juri: { ...base, primary: "#403F34", accent: "#606A46", success: "#606A46", primary_soft: "#E8E4D9" },
  peserta: { ...base },
  penegak: { ...base, primary: "#936538", on_primary: "#FFFDF8", accent: "#BDAE8F", primary_soft: "#F2E7D6" },
  penggalang_putra: { ...base, primary: "#5E3E2E", accent: "#BDAE8F" },
  penggalang_putri: {
    ...base,
    primary: "#9A6A58",
    on_primary: "#FFFDF8",
    accent: "#936538",
    primary_soft: "#F3E6DE",
  },
};

export function themeCss(tokens: Tokens): CSSProperties {
  return {
    "--c-bg": tokens.bg,
    "--c-surface": tokens.surface,
    "--c-text": tokens.text,
    "--c-muted": tokens.muted,
    "--c-primary": tokens.primary,
    "--c-on-primary": tokens.on_primary,
    "--c-accent": tokens.accent,
    "--c-border": tokens.border,
    "--c-success": tokens.success,
    "--c-danger": tokens.danger,
    "--c-primary-soft": tokens.primary_soft,
    "--c-accent-soft": tokens.accent_soft,
  } as CSSProperties;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export interface ContrastCheck {
  pair: string;
  ratio: number;
  ok: boolean;
  hint: string;
  fg: string;
  bg: string;
}

export function checkThemeContrast(tokens: Tokens): ContrastCheck[] {
  const pairs: { label: string; fg: string; bg: string; hint: string }[] = [
    { label: "Teks pada latar", fg: tokens.text, bg: tokens.bg, hint: "Gunakan teks gelap di latar terang." },
    { label: "Teks pada permukaan", fg: tokens.text, bg: tokens.surface, hint: "Kartu harus tetap mudah dibaca." },
    { label: "Teks kecil (sekunder)", fg: tokens.muted, bg: tokens.bg, hint: "Teks sekunder dipakai untuk keterangan." },
    { label: "Teks tombol utama", fg: tokens.on_primary, bg: tokens.primary, hint: "Pilih teks terang untuk tombol gelap." },
    { label: "Aksen pada latar", fg: tokens.accent, bg: tokens.bg, hint: "Aksen dipakai untuk sorotan." },
    { label: "Status sukses", fg: tokens.success, bg: tokens.bg, hint: "Status sukses wajib terbaca." },
    { label: "Status galat", fg: tokens.danger, bg: tokens.bg, hint: "Pesan galat wajib jelas terbaca." },
  ];
  return pairs.map((p) => {
    const ratio = contrastRatio(p.fg, p.bg);
    return {
      pair: p.label,
      ratio: Math.round(ratio * 100) / 100,
      ok: ratio >= 4.5,
      hint: p.hint,
      fg: p.fg,
      bg: p.bg,
    };
  });
}
