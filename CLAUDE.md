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

Lihat `~/.claude/CLAUDE.md` — UI component baru pakai shadcn/ui (pengecualian: halaman EJS
server-rendered di `views/` pakai CSS inline, style referensi shadcn).

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
