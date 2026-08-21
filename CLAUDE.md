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
