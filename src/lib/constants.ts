export const CATEGORIES = [
  { key: "penegak", label: "Penegak", color: "#936538", accent: "#BDAE8F" },
  { key: "penggalang_putra", label: "Penggalang Putra", color: "#5E3E2E", accent: "#BDAE8F" },
  { key: "penggalang_putri", label: "Penggalang Putri", color: "#9A6A58", accent: "#F6F0E6" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function categoryColor(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.color ?? "#5E3E2E";
}

export const PALETTE = [
  { name: "Oak Bark", hex: "#371F17" },
  { name: "Rustic Leather", hex: "#5E3E2E" },
  { name: "Birch Tree", hex: "#F6F0E6" },
  { name: "River Blue", hex: "#5F6D6C" },
  { name: "Cabin Logs", hex: "#936538" },
  { name: "Sandbox", hex: "#BDAE8F" },
  { name: "Evergreen", hex: "#606A46" },
  { name: "Forest Floor", hex: "#403F34" },
  { name: "Bata", hex: "#8E2F23" },
  { name: "Penggalang Putri", hex: "#9A6A58" },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  juri: "Juri",
  peserta: "Peserta",
};

export const SCORE_STATUS = {
  draf: { label: "Draf", tone: "muted" },
  terkirim: { label: "Terkirim", tone: "success" },
  dikoreksi: { label: "Dikoreksi", tone: "accent" },
  dirilis: { label: "Dirilis", tone: "success" },
} as const;

export const CONTEST_STATUS: Record<string, string> = {
  draft: "Belum dimulai",
  berjalan: "Berlangsung",
  selesai: "Selesai",
};

export function contestStatusLabel(status: string): string {
  return CONTEST_STATUS[status] ?? status;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (Math.round(n * 100) / 100).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
