# Migrasi Frontend Inventory App ke React (Vite SPA) — Design

**Tanggal:** 2026-08-19
**Status:** Approved (brainstorming)
**Penulis:** Claude + user (livou)

## Latar Belakang

Owner LivouGroup mengarahkan semua web divisi diseragamkan ke React supaya
bisa memakai shadcn CLI secara penuh (referensi: affiliate.livougroup.com).
App inventory ini saat ini server-rendered dengan EJS + Express + Supabase
Postgres. Frontend-nya akan dimigrasikan ke React secara bertahap.

Keputusan yang sudah dikunci saat brainstorming:

| Topik | Keputusan |
|---|---|
| Bentuk penggabungan | App tetap berdiri sendiri (URL/deploy sendiri); hanya **stack frontend** yang diseragamkan ke React + shadcn |
| Strategi transisi | **Bertahap, halaman per halaman** — EJS dan React hidup berdampingan |
| Tooling | **Vite + React SPA** (bukan Next.js) — build jadi file statis, di-serve dari Express yang sudah ada |
| Urutan migrasi | **Fondasi dulu**: login + shell layout + dashboard, lalu halaman sisanya |
| Coexistence | **URL tidak berubah, toggle per route** — path yang sudah migrasi serve SPA, yang belum serve EJS |
| Arsitektur | **Express toggle + React Router** (Pendekatan A); bukan iframe, bukan module federation |

## Tujuan & Non-Tujuan

**Tujuan:**
- Memindahkan seluruh lapisan presentasi dari EJS ke React + shadcn/ui tanpa mengubah URL dan tanpa mengubah sistem keamanan (session cookie, CSRF satu-kali-pakai, role gating).
- Tiap tahap migrasi bisa di-rollback dalam satu baris.
- App tetap bisa dipakai user (dan untuk presentasi) selama masa transisi.

**Non-tujuan (YAGNI):**
- Tidak menambah fitur baru selama migrasi — hanya memindahkan yang ada.
- Tidak mengganti backend, database, atau skema Supabase.
- Tidak membangun SSR/Next.js, micro-frontend, atau module federation.
- Tidak menggabungkan backend dengan divisi lain.

## Arsitektur

### Struktur repo

```
inventory-app/
├── index.js            ← + daftar MIGRATED + middleware toggle + serve dist
├── routes/*.js         ← handler EJS lama, tetap jalan sampai halaman selesai migrasi
├── services/*.js       ← BARU: logika query dipindah dari handler ke service
├── views/*.ejs         ← tetap dipakai selama transisi
├── frontend/           ← BARU: Vite + React + TypeScript
│   ├── vite.config.ts  (dev: proxy /api → :3000; build outDir: dist)
│   ├── components.json (shadcn CLI)
│   └── src/            (app, components/ui, lib/api, hooks, pages)
└── public/             ← asset statis lama (lucide, tanstack vendor js, css)
```

### Mekanisme toggle per route

Satu daftar di Express, dipasang **sebelum** semua router halaman:

```js
const MIGRATED = ['/login', '/dashboard', /* ditambah tiap halaman selesai */];

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/assets/')) return next();
  const done = MIGRATED.some(p => req.path === p || req.path.startsWith(p + '/'));
  if (done) return res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'frontend/dist/assets')));
```

Ketentuan:
- **Toggle hanya menjawab GET** — navigasi SPA selalu GET; semua mutasi pergi ke `/api/*` (POST/PUT/DELETE), jadi tidak ada risiko request mutasi ter-serve `index.html`.
- **URL tidak berubah**: `/dashboard` tetap `/dashboard`; hanya siapa yang menjawab yang berbeda. Deep-link aman (satu origin).
- **Rollback** = hapus satu string dari `MIGRATED`; halaman langsung balik ke EJS tanpa rebuild frontend.
- Middleware session, `res.locals` (termasuk `modePresentasi`), dan auto-login berjalan **sebelum** toggle, jadi tetap berlaku untuk halaman React.
- Navigasi React→React = client-side routing; React→EJS (atau sebaliknya) = full page load — wajar selama transisi.
- Halaman yang **belum** migrasi tidak boleh di-reach lewat SPA router; toggle adalah satu-satunya sumber kebenaran.

### Data layer & JSON API

Prinsip: **migrasi halaman = menambah endpoint JSON-nya**. Query SQL tetap di
backend; lapisan presentasi yang pindah.

**Endpoint fondasi (Phase 1):**

| Method | Path | Kegunaan |
|---|---|---|
| GET | `/api/me` | `{ user, modePresentasi, csrfToken }`; 401 bila belum login |
| POST | `/api/login` | login; butuh header `x-csrf-token` |
| GET | `/api/logout` | logout |

**CSRF** — mekanisme yang sudah ada tidak diubah (`middleware/csrf.js`):
1. SPA load → baca `csrfToken` dari `/api/me`.
2. Setiap mutasi (POST/PUT/DELETE) kirim header `x-csrf-token` — sudah didukung `validateToken`.
3. Token sekali-pakai: server rotasi tiap validasi; response mutasi menyertakan `csrfToken` baru supaya client tidak perlu round-trip ekstra.

**Konvensi endpoint per halaman** (dibangun saat halaman itu migrasi, semua
di belakang `isAuthenticated` + role guard yang sudah ada):

| Halaman | Endpoint |
|---|---|
| Dashboard | `GET /api/dashboard/summary` |
| Vendor | `GET/POST/PUT/DELETE /api/vendors` |
| Produk | `GET/POST/PUT/DELETE /api/products` (+ varian, BOM) |
| Bahan baku | `GET/POST/PUT/DELETE /api/raw-materials` |
| Pembelian bahan | `GET/POST/PUT/DELETE /api/purchase-orders` |
| Produksi (kanban) | `GET/POST/PUT /api/production-batches` (+ perpindahan status) |
| Beli jadi | `GET/POST /api/purchase-imports` |
| HPP | `GET /api/hpp` (+ perhitungan) |
| Validasi finance | `GET/PATCH /api/validation` |
| Cek-data | `GET /api/cek-data/material`, `GET /api/cek-data/pembelian-material` |
| Laporan | `GET /api/reports/stock-card`, `GET /api/reports/monthly-expenses` |
| Currency | `GET/POST/PUT/DELETE /api/currencies` |

**Refactor service:** query SQL yang sekarang inline di handler EJS dipindah ke
modul `services/<domain>.js`. Handler EJS lama dan handler JSON baru memanggil
service yang sama — EJS tidak rusak selama transisi, logika tidak diduplikasi.

**Ketentuan lain:**
- Upload foto nota (multer) tetap di backend; endpoint JSON mengembalikan path file seperti sekarang.
- Format error: JSON `{ error: '...' }` dengan status 4xx/5xx; frontend menampilkan alert shadcn.
- Data numerik dari pg (`numeric`/`money`) dinormalisasi jadi number di service sebelum dikirim, supaya sorting/format di frontend benar.

### Frontend stack

| Bagian | Pilihan | Catatan |
|---|---|---|
| Build | Vite + React + TypeScript | dev server :5173 proxy `/api` → :3000; prod build ke `frontend/dist` |
| Routing | React Router | menangani semua path yang sudah migrasi |
| Data fetching | TanStack Query | cache + refetch data `/api/*`; ada preseden TanStack Table di repo |
| UI | shadcn/ui + Tailwind | `components.json` di `frontend/`; token `--sidebar-*` dari `layout.ejs` dipindah ke Tailwind config |
| Ikon | lucide-react | menggantikan `<i data-lucide>` |
| Layout | sidebar block shadcn-07 | replikasi 1:1 dari `views/layout.ejs` yang sudah dibuat (jadi acuan desain) |

### Mode presentasi

`modePresentasi` (bendera global) dan `AUTO_LOGIN` tetap bekerja persis seperti
sekarang: dievaluasi di middleware sebelum toggle, lalu diekspos ke SPA lewat
`/api/me`. Sidebar React menghormati mode ini (hanya Produksi + Material, tanpa
logout) sama seperti EJS.

## Fase Migrasi

1. **Phase 1 — Fondasi**: scaffold `frontend/` (Vite + shadcn + Tailwind), toggle
   Express, `/api/me` + `/api/login` + `/api/logout`, halaman Login + shell layout
   (sidebar/header). Toggle `['/login']` dulu sebagai bukti konsep end-to-end.
2. **Phase 2 — Dashboard**: service + `GET /api/dashboard/summary`, halaman
   dashboard React, tambah `/dashboard` ke `MIGRATED`.
3. **Phase 3+ — Per halaman** dalam urutan: master data (currency, vendor,
   produk, bahan baku) → transaksi (pembelian bahan, produksi, beli jadi) →
   analisa (HPP) → validasi finance → cek-data → laporan. Tiap halaman:
   buat service + endpoint JSON → buat komponen React → tambah ke `MIGRATED` → uji.
4. **Final — Cleanup**: semua halaman React; hapus `views/`, handler EJS, dan
   dependency yang tidak lagi dipakai; rapikan `MIGRATED` (toggle jadi permanen
   atau dihapus).

## Testing

- Test Jest backend yang ada tetap jalan (mengawal service/query).
- Endpoint JSON baru dites di Jest (request → status & bentuk response).
- Frontend: uji manual per halaman + smoke test toggle (path migrasi → SPA, yang belum → EJS).
- **Anti-regresi CRUD**: tiap halaman diuji create/edit/delete-nya sebelum toggle dinyalakan (pelajaran dari regresi Juli 2026).
- Verifikasi mode presentasi dan role gating di tiap halaman migrasi.

## Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Regresi CRUD saat migrasi (pernah terjadi 3x) | Uji create/edit/delete per halaman sebelum toggle; rollback satu baris |
| Dua sistem (EJS+React) membingungkan selama transisi | Satu daftar `MIGRATED` sebagai satu-satunya sumber kebenaran; dokumentasi di CLAUDE.md |
| Session/CSRF tidak cocok dengan SPA | Mekanisme yang ada sudah mendukung header `x-csrf-token`; satu origin, cookie tetap dikirim |
| Supabase auto-pause saat development | Prosedur restore di Dashboard (sudah terdokumentasi di CLAUDE.md) |
| Scope creep (menambah fitur saat migrasi) | Non-tujuan eksplisit: hanya memindahkan yang ada |

## Open Questions

- Tidak ada blocker. Integrasi dengan divisi lain (sharing design system / token
  CSS bersama) bisa menyusul setelah migrasi selesai — token `--sidebar-*` yang
  dipakai sudah format standar shadcn.
