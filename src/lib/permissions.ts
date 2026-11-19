export interface PermissionDef {
  key: string;
  label: string;
  group: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: "dashboard.lihat", label: "Melihat dashboard monitoring", group: "Monitoring" },
  { key: "tim.kelola", label: "Mengelola tim dan impor peserta", group: "Data lomba" },
  { key: "lomba.ubah", label: "Mengelola lomba dan jadwal", group: "Data lomba" },
  { key: "lembar.ubah", label: "Mengubah lembar penilaian", group: "Penilaian" },
  { key: "soal.ubah", label: "Mengubah bank soal LCTP", group: "LCTP" },
  { key: "ujian.kelola", label: "Membuka dan menutup sesi ujian", group: "LCTP" },
  { key: "nilai.kirim", label: "Mengisi dan mengirim nilai", group: "Penilaian" },
  { key: "nilai.tugas", label: "Melihat tim pada lomba yang ditugaskan", group: "Penilaian" },
  { key: "nilai.semua", label: "Melihat nilai semua tim", group: "Penilaian" },
  { key: "nilai.koreksi", label: "Mengoreksi nilai yang sudah terkirim", group: "Penilaian" },
  { key: "rilis.ubah", label: "Merilis nilai dan leaderboard", group: "Rilis" },
  { key: "pengguna.kelola", label: "Mengelola pengguna", group: "Administrasi" },
  { key: "peran.kelola", label: "Mengelola role dan izin", group: "Administrasi" },
  { key: "tema.ubah", label: "Mengubah tema warna", group: "Administrasi" },
  { key: "laporan.unduh", label: "Mengunduh laporan", group: "Laporan" },
  { key: "audit.lihat", label: "Melihat riwayat perubahan", group: "Administrasi" },
  { key: "nilai.sendiri", label: "Melihat nilai tim sendiri", group: "Peserta" },
  { key: "ujian.kerjakan", label: "Mengerjakan ujian LCTP", group: "Peserta" },
];

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLES: { slug: string; name: string; permissions: string[]; isSystem: boolean }[] = [
  { slug: "admin", name: "Admin", permissions: ALL_PERMISSIONS, isSystem: true },
  {
    slug: "juri",
    name: "Juri",
    permissions: ["nilai.kirim", "nilai.tugas", "nilai.sendiri", "laporan.unduh"],
    isSystem: true,
  },
  {
    slug: "peserta",
    name: "Peserta",
    permissions: ["nilai.sendiri", "ujian.kerjakan"],
    isSystem: true,
  },
];

export function permissionLabel(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}
