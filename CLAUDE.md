# Inventory App — Project Context

## Database: Supabase Postgres (cloud)

Sejak 2026-08-07 app ini berjalan di **Supabase hosted Postgres**, bukan SQLite dan bukan
local Postgres. Migrasi dari SQLite sudah di-merge (commit `2cc6194`); folder `data/` (SQLite)
bukan lagi source of truth — hanya sisa migrasi.

- Project ref: `mczvnyqnbtmctuxgoont` (region `ap-southeast-1`)
- Koneksi via env `DATABASE_URL` di `.env` (jangan commit `.env`)
- **Wajib pakai pooler IPv4**: `postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
- **Jangan pakai host direct** `db.<ref>.supabase.co` — IPv6-only, `ENOTFOUND` dari mesin ini
- Password mengandung karakter khusus (`@`) — harus URL-encoded di connection string (`@` → `%40`)

### Gotcha yang sudah pernah kejadian

- **Free-tier auto-pause**: Supabase bisa pause sendiri ("tenant not found"). Kalau app error
  koneksi, cek dulu Dashboard → restore project, sebelum debug hal lain.
- **Backup/restore**: pakai `node tmp/dump-postgres.js` (sudah restore-tested).

## Supabase MCP

Konfigurasi MCP server ada di `.mcp.json` (project scope) — features: docs, account, database,
debugging, development, functions, branching. Butuh approve saat pertama buka session di folder
ini, lalu OAuth login Supabase di browser saat tool pertama dipakai.

## Menjalankan app

- `npm start` → http://localhost:3000/login (root `/` memang "Cannot GET /", itu normal)
- Test: `npm test`

## Konvensi UI

Bagian ini SELF-CONTAINED dengan sengaja. Aturan aslinya dulu hanya hidup di
`~/.claude/CLAUDE.md` (config user-level, tidak ikut repo), jadi agent yang bekerja dari
komputer lain atau clone baru tidak pernah membacanya — dan hasil tampilannya langsung
beda. Jangan kembalikan ke bentuk "lihat file di luar repo".

### Komponen: shadcn/ui + ReUI, jangan tulis sendiri

Saat membuat UI component (button, dialog, form, table, dropdown, dsb.), **selalu** pakai
[shadcn/ui](https://ui.shadcn.com/). Jangan menulis component dari nol.

**Sebelum menulis component sendiri, cek dulu [ReUI](https://reui.io/) lewat MCP `reui`.**
ReUI adalah registry yang kompatibel dengan shadcn dan punya 22 komponen berat yang tidak ada
di shadcn biasa — `data-grid` (tabel dengan sorting/filter/paginasi/virtualisasi), `kanban`,
`filters`, `date-selector`, `tree`, `stepper`, `event-calendar`, `gantt`, dll. Jangan menulis
`<table>` manual atau membuat ulang pola yang sudah disediakan ReUI.

- Komponen generik yang sudah ada di shadcn (Button, Dialog, Select) tetap pakai **shadcn**.
  Yang berat (data grid, kanban, calendar, gantt, stepper, tree) pakai **ReUI**.
- Tambahkan component lewat CLI: `npx shadcn@latest add <component>`, lalu pakai hasil
  generate di `components/ui/` (atau `src/components/ui/`). Sesuaikan tampilan via Tailwind
  classes / CSS variables, **bukan** menulis ulang markup.
- Kalau project belum di-init shadcn, jalankan `npx shadcn@latest init` dulu (butuh Tailwind
  CSS — cek `package.json` sebelum klaim ke user).
- Pengecualian: halaman EJS server-rendered di `views/` dan artifact HTML tunggal tanpa
  React+build. shadcn CLI tidak bisa jalan di situ, jadi pakai CSS inline biasa, tapi tetap
  ikuti pola tampilan shadcn sebagai referensi style.

### Cara pakai ReUI

1. **Cari** — MCP `reui` `search` dengan intent bahasa natural. Hasilnya berisi `install`,
   `previewUrl`, `docsUrl`.
2. **Install** — jalankan perintah yang dikembalikan, mis.
   `npx shadcn@latest add @reui/<name> --yes` (dari dalam `frontend/`).
3. **Baca API-nya** — `get_component(name)` untuk API inline (jangan fetch web), lalu
   `get_examples(name)` untuk contoh komposisi yang sudah jadi.
4. **Adaptasi** — ganti data demo dengan data asli, jangan desain ulang.

Aturan tambahan:

- Selalu sertakan `previewUrl` saat merekomendasikan item ReUI ke user, supaya bisa dilihat
  dulu sebelum dipasang.
- Bedakan base: `frontend/components.json` → `style` (`base-nova` = Base UI, `radix-nova` =
  Radix UI). File hasil install mengikuti base project — jangan diterjemahkan dari ingatan.
- Skill `reui` ada di `.claude/skills/reui/` (salinan untuk agent lain di
  `.agents/skills/reui/`). Aturan desain detailnya ada di `rules/`: `craft.md` (hierarki,
  density, state wajib), `adapting.md` (reuse, jangan redesign), `styling.md` (token
  semantik), `quality.md` (a11y, scroll). **Baca `craft.md` + `adapting.md` sebelum menulis
  UI baru** — di situlah "kayak yang sudah ada" ditentukan.
- Skill `reui` punya command `/mcp__reui__build`, `/mcp__reui__add`, `/mcp__reui__fix`,
  `/mcp__reui__improve`.
- Item gratis (22 komponen + semua contoh `c-*`) bisa dipasang tanpa lisensi. Blok premium
  dan Motion Icons butuh lisensi Pro/Ultimate (`REUI_LICENSE_KEY`).
- `frontend/components.json` sudah punya registry `@reui` dengan `style: "base-nova"`.
  Komponen yang sudah dipasang ada di `frontend/src/components/reui/`.

### MCP `reui`

Server `reui` (`https://mcp.reui.io/api/mcp`, tipe `http`) sekarang terdaftar di `.mcp.json`
project ini, jadi ia ikut `git clone` dan tersedia di mesin mana pun. Saat pertama dipakai di
session baru, Claude Code akan meminta approve, lalu membuka browser untuk "Sign in with
ReUI" (akun gratis dibuat kalau belum ada). Ini perilaku normal, bukan error.

Kalau `.mcp.json` tidak terbaca atau server-nya tidak muncul, daftarkan manual:

```bash
claude mcp add --transport http reui https://mcp.reui.io/api/mcp
```

Tanpa MCP-nya, skill `reui` masih terbaca sebagai dokumen, tetapi `search`/`get_component`
tidak tersedia — pakai fallback `npx shadcn@latest search @reui -q "..."` lalu `add`.

### Alur wajib untuk UI baru: prototype dulu

Untuk **komponen UI baru** atau **perubahan besar** pada UI yang ada: jangan langsung tulis
kode produksi. Panggil skill `prototype`, lalu **berhenti dan tunggu user memilih** satu
varian sebelum integrasi ke produksi.

Skill-nya ada di `.claude/skills/prototype/` (salinan untuk agent lain di
`.agents/skills/prototype/`), jadi ikut `git clone` — tidak perlu install ulang. Skill ini
`disable-model-invocation: true`, artinya agent **tidak bisa memanggilnya sendiri**; kamu
harus mengetik `/prototype` (atau memintanya dengan bahasa biasa seperti "bikin prototype
dulu"). Kalau ragu apakah sesuatu perlu prototype, tanyakan.

Isinya dua file dan keduanya penting:

- `SKILL.md` — alurnya: scope → recon (token, personality, konteks) → pilih 3 arah yang
  benar-benar berbeda → bangun picker → verifikasi → tunggu pilihan → promote.
- `PICKER.md` — markup dan CSS picker yang harus **disalin verbatim**. Tampilan picker
  bukan keputusan desain, jadi jangan di-restyle dengan token project.

Aturannya: setiap varian harus berbeda pada **sumbu yang bisa disebut** (layout, density,
personality, motion, model interaksi) — bukan sekadar beda warna aksen. Varian harus
berfungsi penuh dengan data realistis, bukan lorem ipsum atau tombol mati. Penjelajahan
tidak menyentuh kode produksi; integrasi hanya untuk varian yang dipilih, lalu surface
prototype dihapus.

**Kecualikan** (langsung saja): perbaikan bug pada komponen yang sudah ada; penyesuaian
sepele (typo, warna, spacing, teks); menambah field/baris dengan pola yang sudah jelas;
perubahan yang sudah ada precedent-nya di halaman lain.

Setelah varian dipilih, tulis kode produksinya mengikuti standar animasi: `ease-out` (bukan
`ease-in`), durasi < 300ms, `scale(0.97)` saat press, `transform-origin` untuk popover,
dan hormati `prefers-reduced-motion`.

### Standar tampilan yang sudah terbukti dipakai di repo ini

Empat aturan yang paling menentukan hasilnya — semuanya dari `rules/craft.md`:

- **Reuse, jangan redesign.** Ubah data, copy, dan props; pertahankan struktur dan styling
  yang dikirim komponen ReUI. Kalau diff-mu lebih banyak menyentuh `className`/JSX daripada
  data/props, kamu over-customizing — balik ke reuse.
- **State wajib lengkap, bukan cuma happy path.** Empty state yang punya maksud (pesan
  singkat + aksi utama), loading berupa skeleton yang mengikuti layout asli (bukan spinner
  di tengah), error inline yang bisa di-retry dengan `role="status"`/`aria-live`.
- **Density operasional, bukan marketing.** Jarak judul ke deskripsinya rapat (`gap-0.5`,
  `space-y-1`), lebih kecil daripada jarak antar-section. Jangan memberi padding ala landing
  page pada permukaan operasional.
- **Hierarki satu titik fokus.** Satu metrik/tugas dominan per kartu, labelnya kedua,
  detail pendukung ketiga. Border dan surface dipakai untuk membentuk 2-3 pita informasi,
  bukan meratakan semuanya ke bobot yang sama.

### Animasi & gerak

- `transition-colors` untuk hover; `duration-200` +
  `ease-[cubic-bezier(0.22,1,0.36,1)]` untuk reveal.
- **Jangan** `transition-all`. Maksimal satu animasi masuk per view. Jangan pakai stagger
  pada baris tabel atau daftar 20+ item.
- Hanya animasikan `transform` dan `opacity`.

### Kelengkapan sebelum menyatakan UI selesai

- `npx tsc -b` dari `frontend/` bersih, dan `npx oxlint` tidak menambah temuan baru.
- Periksa `rules/quality.md`: tanpa `dangerouslySetInnerHTML`, `rel="noopener noreferrer"`
  pada `target="_blank"`, `aria-label` untuk tombol ikon, `type="button"` untuk tombol
  non-submit, focus ring terlihat, dialog menahan fokus dan tertutup dengan `Escape`.
- Scroll: rantai `min-h-0` dari parent yang punya tinggi sampai container yang
  `overflow-auto`. **Jangan menebak `max-h`.**

## Agent skills

### Issue tracker

Isu dan spec hidup sebagai file markdown lokal di `.scratch/` (bukan GitHub Issues, karena repo
ini publik). Lihat `docs/agents/issue-tracker.md`.

### Triage labels

Pakai lima role kanonikal (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`) sebagai baris `Status:` di tiap file isu. Lihat `docs/agents/triage-labels.md`.

### Domain docs

Single-context: satu `CONTEXT.md` di root plus `docs/adr/`. Lihat `docs/agents/domain.md`.

## Alur kerja skill: grill-with-docs → spec → tickets → implement

Untuk pekerjaan yang belum jelas (fitur baru, migrasi, refactor besar), ikuti satu alur utama.
Jangan loncat dari "idea masih kabur" langsung ke coding.

```
1. grill-with-docs  wawancara: tajamkan ide, catat glossary + ADR
                    (isi: grilling + domain-modeling)
2. to-spec          rangkum hasil wawancara jadi spec, publish ke .scratch/
3. to-tickets       pecah spec jadi tiket kecil, lengkap dengan blocking edges
4. implement        kerjakan tiket: /tdd dulu, lalu /code-review, lalu commit
```

### Siapa yang men-trigger tiap node

| Node | Trigger | Catatan |
| --- | --- | --- |
| `/grill-with-docs` | manual | Berisi `grilling` + `domain-modeling`. Begitu di-trigger, saya jalankan keduanya. |
| `/to-spec` | manual | Dikunci `disable-model-invocation`. Saya tidak bisa memanggilnya. |
| `/to-tickets` | manual | Dikunci `disable-model-invocation`. |
| `/implement` | manual | Dikunci `disable-model-invocation`. |
| `/tdd` | **otomatis** | Saya jalankan di dalam `implement`, di seam yang sudah disepakati di spec. |
| `/code-review` | **otomatis** | Saya jalankan setelah tiket selesai, sebelum commit. |

Keempat node manual itu dikunci oleh plugin, bukan oleh konfigurasi kita: saya tidak bisa
memanggilnya, dan tidak boleh meniru isinya dengan cara lain. Jadi alur ini **tidak bisa
berjalan penuh tanpa trigger** dari pengguna.

Pengecualian untuk node 1: `grilling` dan `domain-modeling` (isi `/grill-with-docs`) berdua
**bisa saya panggil sendiri**. Jadi kalau pengguna minta wawancara dengan bahasa biasa
("gali idenya", "grill rencana ini"), saya mulai tanpa menunggu slash command.

### Kewajiban saya di tiap transisi

Begitu satu node selesai, saya **tidak boleh berhenti diam**. Saya harus langsung menyebutkan
perintah persis untuk node berikutnya, misalnya:

> Wawancara selesai. Jalankan `/mattpocock-skills:to-spec` untuk merangkumnya jadi spec.

Begitu pengguna menjalankannya, saya lanjut tanpa diminta lagi. Pola yang sama berlaku untuk
`to-spec` → `to-tickets` → `implement`. Tujuannya: pengguna hanya perlu satu trigger per stage,
bukan mengingat seluruh alur.

### Aturan turunan

- **Jangan langsung coding** kalau permintaan masih kabur. Mulai dari `/grill-with-docs`.
- **Wajib TDD.** Di dalam `implement`, pakai `/tdd` di seam yang sudah disepakati pada langkah
  2 dari `to-spec`. Jangan menulis implementasi dulu baru test.
- **Wajib code review sebelum commit.** `/code-review` jalan otomatis setelah tiket selesai.
  Dua axis yang dipakai: Standards dan Spec.
- **Commit hanya setelah review bersih**, ke branch saat ini.
- Skill lain yang juga dikunci manual (untuk referensi): `/triage`, `/wayfinder`,
  `/improve-codebase-architecture`, `/setup-matt-pocock-skills`, `/ask-matt`.
