# ABRAKADABRA 9 — Aplikasi Penilaian Lomba Pramuka

Aplikasi penilaian lomba Pramuka untuk **SMK Telkom 1 Medan**. Juri menilai di HP atau tablet,
peserta mengerjakan LCTP di aplikasi, panitia memantau dari dashboard dan merilis hasil ke leaderboard.

Dibangun mengikuti PRD ABRAKADABRA 9 v2.0 dan **Addendum PRD v2.1** (login, penugasan juri, tanda
tangan): palet **Rustic Earthy**, komposisi 60‑30‑10, warna per role dan kategori, form juri yang besar
dan sederhana, serta integritas nilai yang ditegakkan di server.

## Menjalankan

```bash
npm install
npm run dev          # http://localhost:3000
```

Database SQLite dibuat otomatis di `data/abrakadabra9.db` beserta data contoh
(39 tim, 4 lomba, 4 juri, 10 soal LCTP, dan antrean tim). Tidak ada nilai contoh: setiap nilai
terkirim di sistem harus memiliki tanda tangan juri yang sah.

Perintah lain:

```bash
npm run build        # build produksi
npm start            # menjalankan hasil build
npm run typecheck    # pemeriksaan tipe
npm run db:reset     # hapus database lokal, dibuat ulang saat server start
```

## Akun contoh

| Peran | Nama pengguna | Kata sandi |
| --- | --- | --- |
| Admin / panitia | `admin` | `admin123` |
| Juri LKBB | `juri-lkbb-01`, `juri-lkbb-02` | `juri123` |
| Juri Pionering | `juri-pionering-01` | `juri123` |
| Juri Scouting Skill | `juri-scouting-01` | `juri123` |
| Peserta (tiap tim) | NPP tanpa tanda hubung, mis. `png001`, `pgp003`, `pgw002` | `peserta123` |

Satu akun juri terikat pada satu lomba (satu orang yang menjuri dua lomba mendapat dua akun).
Akun peserta dibuat otomatis saat tim ditambahkan. Opsi **wajib ganti kata sandi saat masuk pertama**
tersedia per akun; akun contoh dibiarkan bebas agar demo cepat.

## Alur singkat

1. **Panitia** menyiapkan lomba di *Lomba & Lembar*, menyusun kriteria penilaian, membuat akun juri
   dan menugaskannya ke satu lomba di *Pengguna & Izin*, lalu mengatur urutan tim di *Antrean Tim*.
2. **Juri** masuk, melihat satu **Tim Sekarang** di beranda, menekan *Mulai Menilai*, mengisi nilai
   (isian mulai kosong, draf tersimpan otomatis), **Periksa Kembali**, lalu **Tanda Tangan** dan
   **Kirim Nilai**. Setelah semua juri lomba itu mengirim, juri menekan **Panggil Tim Berikutnya**.
3. **Peserta** melihat jadwal dan, setelah panitia merilis, nilai timnya sendiri per kriteria.
4. **Leaderboard** menampilkan peringkat dan nama tim untuk semua orang, tetapi angka nilai
   hanya terlihat pada baris tim sendiri (admin melihat semua).
5. **Panitia** mengunduh laporan Word/Excel dari menu *Laporan*; lembar nilai memuat tanda tangan,
   kode verifikasi, dan kode QR menuju halaman verifikasi.

## Aturan yang ditegakkan server

- Nilai berstatus `draf → terkirim → dikoreksi/dirilis`. Setelah **terkirim**, juri tidak dapat
  mengubah lewat tampilan maupun API (respons `409`).
- **Antrean menentukan tim.** Server hanya melayani nilai untuk tim yang sedang dipanggil pada lomba
  penugasan juri; mengganti ID tim di alamat atau API ditolak `403`. Juri tidak punya endpoint daftar
  tim maupun daftar lomba, dan `/juri/[contestId]` dialihkan kembali ke beranda.
- **Tanda tangan wajib.** Kirim tanpa tanda tangan ditolak `422`; goresan terlalu pendek ditolak
  `400`. Server menyimpan titik/tekanan/waktu, gambar PNG, hash SHA‑256 isi lembar (identitas tim,
  lomba, juri, versi lembar, butir, penalti, total, waktu) dan hash tanda tangan, IP, serta perangkat.
- **Koreksi menunggu tanda tangan ulang.** Admin tidak langsung mengubah peringkat: revisi berstatus
  `menunggu_tanda_tangan`, nilai lama tetap dipakai, dan juri menandatangani lewat *Tinjau dan Tanda
  Tangan Koreksi*. Halaman `/verifikasi/[kode]` menghitung ulang hash dan menandai `Hash tidak cocok`
  bila satu angka diubah langsung di basis data.
- Juri hanya dapat menilai lomba yang ditugaskan (dan kategori bila dibatasi).
- Peserta tidak memiliki izin `nilai.kirim`; percobaan menilai manual ditolak `403`.
- Ujian LCTP memiliki satu sesi per tim, waktu dihitung server, kunci jawaban tidak pernah
  dikirim ke peserta, dan jawaban dinilai otomatis saat selesai/waktu habis.
- Log audit `audit_log` bersifat tambah-saja dan dirantai hash SHA‑256; halaman *Riwayat*
  memverifikasi rantai dan menandai entri yang terputus.
- Sesi login memakai cookie `httpOnly`, `SameSite=Lax`, `Secure` di produksi; login dibatasi
  12 percobaan/menit dan akun terkunci **10 menit** setelah 5 kegagalan. Admin dapat membuka kunci.
  Permintaan yang mengubah data wajib berasal dari origin yang sama (proteksi CSRF).
- **Satu sesi aktif untuk juri dan peserta.** Login kedua ditolak dengan penawaran mengeluarkan
  perangkat pertama; admin boleh punya beberapa sesi dan dapat mengeluarkan sesi akun mana pun.
  Menonaktifkan akun atau mereset kata sandi langsung mencabut semua sesinya.
- Kata sandi lama tidak dapat dilihat admin (hanya hash). Kata sandi baru tampil satu kali setelah
  dibuat/direset. Setiap login, logout, kegagalan masuk, reset, penugasan, dan perubahan antrean
  masuk ke log audit.

## Arsitektur

```
src/lib/                 lapisan domain dan infrastruktur
  db.ts                  koneksi SQLite, skema, data awal
  scoring.ts             perhitungan nilai berbobot + penalti (murni, mudah diuji)
  permissions.ts         katalog izin dan role bawaan
  auth.ts, password.ts   sesi, hash scrypt, pemeriksaan izin, kata sandi mudah dibaca
  queue.ts               antrean tim per lomba/kategori, panggil, lewati, absen, ubah urutan
  signature.ts           validasi goresan, hash isi lembar, kode verifikasi
  audit.ts               rantai hash append-only
  theme.ts/themeTokens   token warna per role, kontras WCAG
  services/              contests, penilaian, lctp, leaderboard, sheets, reports, dashboard
src/app/api/             endpoint tipis: validasi, izin, pemetaan galat
src/app/admin|juri|peserta|leaderboard|bantuan   halaman per peran
src/components/          komponen presentasi dan form interaktif
```

Nilai total dinormalkan ke skala 100: `Σ(nilai × bobot) / Σ(maks × bobot) × 100`, lalu penalti
dikurangkan dan hasilnya dibatasi 0–100. Bila satu tim dinilai beberapa juri, peringkat memakai
**rata-rata** nilai juri tersebut.

Tema disimpan di tabel `theme_tokens` dan diterapkan sebagai variabel CSS, sehingga perubahan warna
tidak memerlukan build ulang. Penyimpanan tema ditolak bila ada pasangan warna di bawah 4.5:1.

## Laporan

`/api/export?format=docx` menghasilkan laporan Word (sampul, ringkasan juara, rekap nilai,
rincian kriteria, **lembar nilai bertanda tangan dengan kode QR verifikasi**, dan blok pengesahan)
dan `format=xlsx` menghasilkan tiga lembar Excel (Rekap Nilai, Rincian Kriteria, Ujian LCTP).
Cakupan dapat dibatasi per lomba dan per kategori. `/admin/pengguna/kartu` menyiapkan kartu akun A4
berisi nama, nama pengguna, alamat aplikasi, dan QR menuju halaman login.

## Catatan implementasi

Beberapa keputusan berbeda dari PRD dan perlu diketahui sebelum acara:

- **Basis data memakai SQLite**, bukan PostgreSQL, agar aplikasi dapat dijalankan di satu laptop
  panitia tanpa server tambahan. Skema mudah dipindahkan ke PostgreSQL.
- **Backend memakai Route Handler Next.js (TypeScript)** dengan lapisan service, bukan Rust/Axum.
  Seluruh aturan akses tetap dijalankan di server.
- **Dashboard memakai pembaruan berkala** (setiap 12 detik, dapat dijeda), bukan SSE.
- **Kata sandi memakai scrypt** dari modul `crypto` Node (dengan salt per akun), bukan Argon2id.
  Padanan keamanan untuk instalasi Node tanpa modul native tambahan.
- **PDF belum dibuat di server**; gunakan “Cetak → Simpan sebagai PDF” dari dokumen Word atau dari
  halaman kartu akun. Kartu akun tidak memuat kata sandi karena hanya hash yang disimpan.
- **Kotak tanda tangan dibuat sendiri** dengan Canvas + Pointer Events (titik, tekanan, waktu),
  bukan pustaka `signature_pad`, agar tidak menambah dependensi native dan tetap mendukung HP.
- **Peran juri per lomba** ditampilkan dari penugasan akun (mis. “LKBB”); tidak ada baris role baru
  per lomba di tabel `roles`, sehingga izin tetap satu kumpulan untuk semua juri.
- Peringkat tetap memakai **rata-rata** nilai juri; nilai revisi baru dipakai setelah ditandatangani.
- Mode latihan belum berupa lomba terpisah; panitia dapat membuat lomba tambahan bertanda draft.
- Jumlah juri per lomba dan penggabungan nilainya mengikuti asumsi **rata-rata**.
- Logo sekolah/belum disertakan; ganti `public/icon.svg` dan tambahkan logo pada laporan bila tersedia.

## Pemeriksaan yang sudah dilakukan

- `npm run build` lolos (TypeScript ketat).
- Login admin/juri/peserta, dashboard, daftar tim, form nilai, tema, bank soal, pengguna, audit.
- Kirim nilai → kunci (`409` saat kirim ulang atau ubah draf), juri lomba lain `403`,
  koreksi juri `403`, koreksi admin tanpa alasan `400`, koreksi sah membuat revisi.
- LCTP: 10 jawaban benar → nilai 100, sesi tim lain `403`, muatan soal tanpa kunci jawaban.
- Leaderboard: peserta lain/anonim melihat `•••`, tim sendiri melihat angkanya, admin melihat semua.
- Login: sesi kedua juri ditolak `409` lalu berhasil setelah konfirmasi (sesi lama mati), akun terkunci
  `423` setelah 5 gagal, wajib-ganti-sandi mengalihkan semua halaman ke `/akun/sandi`.
- Antrean: juri hanya dapat membuka tim yang dipanggil (`307` untuk tim/lomba lain), kirim nilai tim
  lain `403`, panggil tim berikutnya ditolak `409` selama juri lain belum mengirim.
- Tanda tangan: kirim tanpa tanda tangan `422`, goresan satu titik `400`, kirim sah menyimpan hash,
  kirim ulang `409`, mode anonim menyembunyikan nama menjadi `Tim #2`.
- Koreksi admin membuat revisi menunggu; setelah juri menandatangani, total berubah dan verifikasi
  tetap `Hash cocok`. Mengubah satu angka langsung di SQLite membuat halaman verifikasi menampilkan
  `Hash tidak cocok` (sudah diuji lalu dikembalikan).
- Ekspor Word dengan tanda tangan + QR berhasil (dokumen OOXML berisi media gambar).
- Ekspor Word (.docx ±14 KB) dan Excel (.xlsx ±44 KB) berhasil; tanpa login `401`.
- Rantai audit utuh setelah seluruh aktivitas di atas.
