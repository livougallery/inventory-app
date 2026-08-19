# Design: Migrasi Tampilan ke shadcn/ui (Reskin → React)

Tanggal: 2026-08-19
Status: Approved (brainstorming) — menunggu review spec

## 1. Latar Belakang & Tujuan

- Tampilan app diminta mengikuti shadcn/ui. App saat ini Express + EJS server-rendered
  (35 file `.ejs`, 13 modul), styling Tailwind CDN + CSS custom di `views/layout.ejs`.
- **Tujuan akhir: app ini akan digabung sebagai modul di app React milik divisi lain**
  (stack mereka belum diketahui), sehingga semua harus seragam pakai shadcn.
- Konsekuensi: reskin CSS saja = kerja dua kali. Strategi yang benar adalah migrasi
  frontend ke React + shadcn/ui, dilakukan **inkremental** supaya app tidak pernah down.
- Bonus requirement: owner ingin bisa melihat app lewat link online (hosting),
  tanpa perlu screenshot/rekaman manual.

## 2. Keputusan Kunci

| # | Keputusan | Hasil |
|---|-----------|-------|
| D1 | Strategi migrasi | Inkremental (strangler pattern), bukan big-bang rewrite |
| D2 | Stack frontend baru | React + **Vite** + TanStack Router + shadcn/ui + TanStack Query |
| D3 | Tema | Default shadcn (palet zinc). Nanti tinggal ganti CSS variables kalau token dari divisi lain tersedia |
| D4 | Table | Komponen **Table shadcn** (yang memang dibangun di atas `@tanstack/react-table`). Tidak ada kode bundling esbuild manual lagi — Vite yang handle. Catatan: "pakai shadcn, tidak pakai tanstack" secara harfiah tidak mungkin di ekosistem React; shadcn Table = TanStack + styling shadcn |
| D5 | Hosting | Render free tier (workstream terpisah, bisa jalan paling awal). Detail di §7 |
| D6 | Urutan migrasi modul | Material → auth/login → Vendor → Produk → Bahan Baku → Currencies → PO & Pembelian → Produksi & Kanban → HPP & Laporan → Validasi & Dashboard |
| D7 | Kerja paralel | Modul yang sedang dikembangkan fiturnya oleh user dimigrasi paling akhir; freeze fitur hanya selama modul tsb dalam siklus migrasi F4 |

## 3. Fase

- **F1 — Reskin cepat (EJS):** ganti CSS `layout.ejs` ke design tokens shadcn
  (warna zinc/neutral, radius, font, shadow; komponen btn/badge/card/input/alert/table
  ala shadcn). Tetap EJS + Tailwind CDN. Seluruh 35 halaman langsung "terlihat shadcn"
  dalam 1 sesi. Tidak mengubah struktur/markup selama tidak perlu — untuk meminimalkan
  risiko regresi form (riwayat: 2026-07-07 dan 2026-07-21).
- **F2 — Scaffold frontend:** folder `client/` (React + Vite + TanStack Router + shadcn/ui),
  proxy dev ke Express, auth tetap session cookie Express.
- **F3 — API contract:** route Express terpilih dibungkus endpoint JSON `/api/*`
  (dengan proteksi CSRF yang sama seperti sekarang) tanpa menghapus render EJS.
- **F4 — Migrasi per modul:** 1 modul = 1 siklus penuh:
  inventaris perilaku → build UI React → tes API → verifikasi manual vs checklist →
  swap route → hapus EJS. Lihat §6.
- **F5 — Serah terima:** modul React dikemas agar mudah dipindah ke app divisi lain
  (kontrak komponen/route bersih, tanpa ketergantungan aneh ke backend).

## 4. Arsitektur Teknis

### 4.1 Struktur repo

```
inventory-app/
├── index.js, routes/, middleware/, db.js   ← Express (struktur tidak berubah)
├── views/                                   ← EJS, dihapus bertahap per modul
├── client/                                  ← BARU: frontend React
│   ├── src/
│   │   ├── routes/          ← satu folder per modul (material/, vendors/, ...)
│   │   ├── components/ui/   ← komponen shadcn asli
│   │   └── lib/             ← API client (TanStack Query), utils
│   └── vite.config.js       ← proxy /api & /auth ke Express
└── package.json             ← + script "dev:all" (Express + Vite bareng)
```

### 4.2 Switch EJS → React per modul

Daftar `MIGRATED_MODULES` di `index.js`. Route yang sudah dimigrasi menyajikan
shell SPA React; yang belum tetap render EJS. Swap = perubahan satu baris config,
bukan bongkar route.

### 4.3 Auth & session

- Tidak diubah: session cookie Express + bcrypt. Halaman login dimigrasi paling awal
  ke React tapi backend auth tetap Express.
- Vite dev-server mem-proxy semua request non-aset ke Express → cookie/session
  jalan di dev maupun produksi.
- Session store produksi: `connect-pg-simple` ke Supabase (dependency sudah ada,
  tinggal diaktifkan — saat ini dev pakai connect-sqlite3).

### 4.4 API layer

- Tiap modul yang dimigrasi dapat endpoint `/api/<modul>`: GET list/detail,
  POST create, PUT/PATCH update, DELETE.
- Endpoint dibuat **di samping** render EJS; setelah modul selesai dimigrasi dan
  EJS-nya dihapus, endpoint render EJS-nya ikut dibuang — yang tersisa API bersih.
- Semua endpoint `/api/*` dilindungi auth session + token CSRF (pola yang sama
  dengan form EJS saat ini).

### 4.5 Styling & data fetching

- Tailwind asli (bukan CDN) + design tokens default shadcn (palet zinc) →
  identik dengan hasil reskin F1.
- Tidak ada `@apply` / CSS custom terpisah (pelajaran dari bug 2026-07-13:
  `@apply` tidak jalan dengan Tailwind CDN).
- TanStack Query untuk semua data dari API (cache, loading state, refetch) —
  pola standar app React modern, kompatibel saat digabung ke web divisi lain.

## 5. Aturan Kerja Paralel

- F1–F3 tidak mengganggu halaman mana pun → user bebas lanjut mengerjakan fitur
  (mis. fitur Material yang sedang WIP: dropdown transaksi, upload foto, Production/HPP).
- Saat sebuah modul masuk siklus F4: **freeze fitur** di modul itu sampai migrasi
  selesai; sesudahnya fitur baru dikerjakan langsung di React.
- Modul yang belum antre migrasi tetap bebas dikerjakan kapan saja.
- Modul yang sedang dikembangkan user = modul terakhir dalam urutan migrasi
  (urutan di D6 dapat digeser sesuai kebutuhan ini).

## 6. Testing & Strategi Anti-Regresi

Konteks: app ini sudah 2x kena regresi form saat markup diutak-atik
(2026-07-07, 2026-07-21 — form `action` + escaping). Maka:

**Per modul (F4), siklus wajib:**
1. **Inventaris dulu, baru bongkar** — checklist semua perilaku halaman EJS:
   form & field, tombol aksi (edit/hapus/upload), validasi error, flash message.
   Checklist ini jadi acceptance list.
2. **Tes otomatis di level API** (Jest, infra `npm test` sudah ada):
   CRUD sukses, validasi gagal, akses tanpa login ditolak, request tanpa
   token CSRF ditolak.
3. **Verifikasi manual 1:1 vs checklist** — semua poin tercentang di UI React
   sebelum EJS dihapus. Tidak ada penghapusan EJS tanpa checklist hijau.
4. **Commit kecil per langkah** (reskin / scaffold / API / UI / swap terpisah)
   supaya revert granular — pola sukses migrasi Supabase.

**Untuk reskin (F1):** cek visual per modul (login, dashboard, tabel, form,
modal kanban) + smoke test semua form masih submit.

## 7. Hosting (workstream terpisah)

- **Tujuan:** owner bisa akses app lewat link, tanpa SS/rekaman.
- **Pilihan: Render free tier** — Node.js dari GitHub repo, DB tetap Supabase
  (sudah cloud, tidak perlu DB baru). Estimasi setup ± ½ hari kerja.
- **Batas free tier yang harus dikomunikasikan ke owner:**
  - Sleep setelah ±15 menit idle; request pertama butuh ±1–2 menit untuk bangun.
  - Disk ephemeral → file `uploads/` (foto nota) bisa hilang saat redeploy.
    Solusi: pindahkan storage foto ke **Supabase Storage** (1 GB, project yang sama) —
    item terpisah, bisa dikerjakan sebelum foto jadi masalah.
  - Session store wajib `connect-pg-simple` (lihat §4.3).
- **Bisa dikerjakan paling awal** — tidak menunggu migrasi; owner bahkan bisa
  melihat hasil reskin F1 langsung dari link.
- Upgrade berbayar (±$7/bln, tanpa sleep) hanya kalau owner sudah rutin pakai.

## 8. Out of Scope

- Graphify (github.com/Graphify-Labs/graphify) — bukan komponen/UI framework,
  melainkan CLI analisis codebase (knowledge graph). Tidak relevan untuk migrasi
  tampilan; opsional sebagai alat bantu analisis, tidak dimasukkan plan.
- Rewrite backend / ganti database — Supabase tetap dipakai.
- Integrasi teknis final ke app divisi lain — menunggu info stack mereka.

## 9. Open Questions

1. Stack React web divisi lain (Next.js / Vite / lain) — saat ini diasumsikan
   SPA-agnostic; komponen React murni tetap mudah dipindah ke framework mana pun.
2. Akun Render & akses GitHub repo untuk deploy.
3. Waktu pemindahan foto nota ke Supabase Storage (sebelum deploy stabil / setelah).
4. Kapan user selesai dengan fitur Material yang sedang WIP (menentukan kapan
   siklus F4 modul Material bisa mulai).
