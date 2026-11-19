import type { IconName } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const ADMIN_NAV: (NavItem & { permission?: string })[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", permission: "dashboard.lihat" },
  { href: "/admin/tim", label: "Tim & Akun", icon: "teams", permission: "tim.kelola" },
  { href: "/admin/lomba", label: "Lomba & Lembar", icon: "flag", permission: "lomba.ubah" },
  { href: "/admin/antrean", label: "Antrean Tim", icon: "clock", permission: "lomba.ubah" },
  { href: "/admin/nilai", label: "Nilai & Rilis", icon: "score", permission: "nilai.semua" },
  { href: "/admin/lctp", label: "Bank Soal LCTP", icon: "exam", permission: "soal.ubah" },
  { href: "/admin/tema", label: "Tema", icon: "palette", permission: "tema.ubah" },
  { href: "/admin/laporan", label: "Laporan", icon: "report", permission: "laporan.unduh" },
  { href: "/admin/pengguna", label: "Pengguna & Izin", icon: "users", permission: "pengguna.kelola" },
  { href: "/admin/audit", label: "Riwayat", icon: "history", permission: "audit.lihat" },
];

export function navFor(user: SessionUser): NavItem[] {
  if (user.role === "admin" || can(user, "dashboard.lihat")) {
    const items = ADMIN_NAV.filter((item) => !item.permission || can(user, item.permission));
    if (items.length > 0) return items.map(({ href, label, icon }) => ({ href, label, icon }));
  }
  if (can(user, "nilai.kirim")) {
    return [
      { href: "/juri", label: "Beranda Juri", icon: "flag" },
      { href: "/akun/sandi", label: "Kata Sandi", icon: "shield" },
      { href: "/bantuan", label: "Bantuan", icon: "help" },
    ];
  }
  return [
    { href: "/peserta", label: "Beranda Tim", icon: "dashboard" },
    { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
    { href: "/akun/sandi", label: "Kata Sandi", icon: "shield" },
    { href: "/bantuan", label: "Bantuan", icon: "help" },
  ];
}

export function homeFor(user: SessionUser): string {
  if (user.role === "admin" || can(user, "dashboard.lihat")) return "/admin";
  if (can(user, "nilai.kirim")) return "/juri";
  return "/peserta";
}
