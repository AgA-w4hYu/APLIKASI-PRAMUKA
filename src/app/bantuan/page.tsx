import Link from "next/link";
import { getSession } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { Card, Icon, PageHeader } from "@/components/ui";

const JURI_STEPS = [
  {
    title: "Masuk dengan akun dari panitia",
    body: "Satu halaman login untuk semua peran. Sistem mengenali peran dari akun Anda dan mengantar ke beranda yang sesuai.",
  },
  {
    title: "Tunggu Tim Sekarang",
    body: "Anda tidak memilih lomba atau tim. Beranda menampilkan satu tim yang dipanggil panitia dari antrean.",
  },
  {
    title: "Isi nilai satu per satu",
    body: "Semua isian mulai kosong. Gunakan tombol − dan + besar atau ketik angkanya; keterangan di sebelahnya menunjukkan dari nilai maksimum.",
  },
  {
    title: "Periksa Kembali",
    body: "Total muncul di bagian bawah. Tombol lanjut hanya aktif setelah seluruh butir terisi.",
  },
  {
    title: "Tanda tangan lalu kirim",
    body: "Tanda tangan di kotak besar memakai jari atau pena layar. Setelah dikirim, nilai terkunci dan tidak dapat Anda ubah.",
  },
  {
    title: "Panggil tim berikutnya",
    body: "Setelah semua juri lomba Anda mengirim nilai, tombol Panggil Tim Berikutnya meminta panitia elektronik memanggil tim selanjutnya.",
  },
  {
    title: "Koneksi terputus?",
    body: "Draf tersimpan di perangkat dan dikirim ulang otomatis saat jaringan kembali. Nilai terkirim tidak hilang karena sesi baru tetap membuka form yang sama.",
  },
];

export default async function HelpPage() {
  const user = await getSession();
  const content = (
    <>
      <PageHeader
        eyebrow="Panduan"
        title="Bantuan"
        description="Langkah singkat untuk juri, peserta, dan panitia. Bisa dibaca di HP sambil bertugas."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-semibold">Untuk juri</h2>
          <ol className="mt-3 space-y-4">
            {JURI_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className="num grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
                  style={{ background: "var(--c-primary-soft)" }}
                >
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-xl font-semibold">Perbesar tulisan</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Tombol <strong>Aa</strong> di kanan atas memperbesar seluruh tulisan dalam tiga tingkat. Pilihan tersimpan
              di perangkat Anda.
            </p>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Satu perangkat, satu sesi</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Akun juri dan peserta hanya boleh aktif di satu perangkat. Bila masuk di perangkat kedua, aplikasi
              menawarkan untuk mengeluarkan sesi lama. Akun terkunci 10 menit setelah 5 percobaan gagal; panitia dapat
              membuka kuncinya.
            </p>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Tanda tangan dan koreksi</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Setiap nilai terkirim membawa tanda tangan dan kode verifikasi. Bila panitia mengoreksi, Anda menerima
              permintaan Tinjau dan Tanda Tangan Koreksi di beranda juri. Selama belum ditandatangani, peringkat memakai
              nilai lama.
            </p>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Untuk peserta</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--c-muted)" }}>
              <li>Beranda tim menampilkan jadwal dan status setiap lomba.</li>
              <li>Nilai tim sendiri terlihat setelah panitia merilis hasil.</li>
              <li>Ujian LCTP dikerjakan di aplikasi dan dinilai otomatis.</li>
              <li>Jangan menutup halaman ujian; waktu tetap berjalan di server.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Butuh panitia?</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
              Hubungi sekretariat lomba di tenda panitia. Untuk masalah akun, sebutkan nama tim dan NPP.
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Link href={user ? "/" : "/login"} className="btn btn-secondary">
          <Icon name="arrow" size={18} /> {user ? "Kembali ke beranda" : "Masuk"}
        </Link>
      </div>
    </>
  );

  if (user) {
    return (
      <AuthShell user={user} active="/bantuan">
        {content}
      </AuthShell>
    );
  }
  return <div className="relative z-10 mx-auto max-w-content px-4 py-10 sm:px-6">{content}</div>;
}
