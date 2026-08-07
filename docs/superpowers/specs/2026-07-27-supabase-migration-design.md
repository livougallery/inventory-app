# Design: Migrasi Inventory App dari SQLite ke Supabase PostgreSQL

**Tanggal:** 2026-07-27
**Status:** Approved (brainstorm selesai, lanjut writing-plans)
**Skop:** Connect app lokal (Express) ke Supabase PostgreSQL sebagai database produksi. Bukan deploy app, bukan redesign UI.

---

## 1. Konteks & Tujuan

App inventory saat ini berjalan di lokal (Express + EJS) dengan database SQLite (`better-sqlite3`, synchronous). Tujuan: app tetap jalan di lokal (port 3000), tapi seluruh data langsung tersimpan di Supabase PostgreSQL — sehingga data online, backup otomatis, dan dapat diakses dari mana saja.

Driver `pg` sudah terinstall di `package.json` (v8.22) tetapi belum dipakai. Ada script migrasi setengah jadi di `tmp/migrate-to-posters.js` dengan credential hardcode (tidak dipakai, akan diganti).

## 2. Keputusan Desain (dari brainstorm)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Tujuan | App lokal, DB Supabase | Bisa online access + backup otomatis |
| Pendekatan rewrite | **Approach 1: Thin Adapter** | Risiko paling kecil, selesai paling cepat, SQL tetap readable. Repository pattern (Approach 3) jadi Phase 2 setelah stabil. |
| Session | Pindah ke Supabase (`connect-pg-simple`) | Konsisten, semua di Postgres |
| Test | Postgres-only, schema `test` di Supabase | Constraint: `better-sqlite3` tidak bisa transaksi async. Single driver (pg) = adapter cuma handle 1 dialek, transaksi async native. |
| Backend | Single driver `pg` (drop SQLite) | Sesuai constraint di atas |

## 3. Arsitektur Koneksi

```
.env  (DATABASE_URL=postgresql://postgres:<url-encoded-password>@db.<project-ref>.supabase.co:5432/postgres)
  │
  ▼
db.js  ──► pg.Pool  (async, native)
  │
  ├─ db.query(sql, params)              → Promise<{rows, rowCount}>
  ├─ db.one(sql, params)                → Promise<row>   (helper: rows[0])
  ├─ db.run(sql, params)                → Promise<{rowCount, returningId}>  (INSERT ... RETURNING id)
  ├─ db.transaction(async tx => {...})  → BEGIN/COMMIT/ROLLBACK
  └─ helper dialek: db.now() / db.dateTrunc()
```

**Key points:**
- Single driver `pg`, tidak ada cabang SQLite, tidak ada if/else dialek.
- Pool size 10 (Supabase free tier: 60 direct conn, aman), idle timeout 30s.
- Helper `db.one` / `db.run` agar call site ringkas. `db.run` bungkus `RETURNING id` sebagai pengganti `lastInsertRowid`.
- `db.transaction`: `BEGIN` → fn → `COMMIT` (atau `ROLLBACK` jika throw). Pakai satu client dari pool agar atomic.
- `.env` + `dotenv`: credential tidak hardcode. Password `@2` URL-encode jadi `%402`.

## 4. Perubahan Call Site & SQL Dialect

**Pattern before → after:**

```js
// BEFORE (better-sqlite3, sync)
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const items = db.prepare('SELECT * FROM items WHERE id = ?').all(id);
const r = db.prepare('INSERT INTO users (name) VALUES (?)').run(name);
const tx = db.transaction(() => { ...; db.prepare(...).run(...); });
tx();

// AFTER (pg, async)
const user = await db.one('SELECT * FROM users WHERE id = $1', [id]);
const items = (await db.query('SELECT * FROM items WHERE id = $1', [id])).rows;
const r = await db.run('INSERT INTO users (name) VALUES ($1) RETURNING id', [name]);
const r2 = await db.transaction(async (tx) => {
  await tx.query(...);
  await tx.run(...);
});
```

**Perubahan SQL:**

| SQLite | Postgres |
|--------|----------|
| `?` placeholder | `$1, $2, $3` (indexed) |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `DATE('now')` | `CURRENT_DATE` |
| `datetime('now')` | `NOW()` |
| `lastInsertRowid` | `RETURNING id` di INSERT |
| `r.changes` | `r.rowCount` |
| `REAL` | `REAL` (tetap, presisi sama float64) |
| `TEXT NOT NULL DEFAULT ''` | sama (valid di Postgres) |
| `CHECK(...)` inline | bisa tetap dipakai |

Perbedaan dialek minimal — sebagian besar kerjaan adalah async plumbing, bukan diff SQL.

## 5. Strategi Eksekusi (7 milestone)

| # | Milestone | File | Verifikasi |
|---|-----------|------|------------|
| 1 | Infra adapter | `db.js` rewrite, `.env`, `.gitignore`, install `dotenv` | `node -e "require('./db').query('SELECT NOW()')"` connect Supabase |
| 2 | Schema bootstrap | Schema dari `db.js` lama → baru pakai pg syntax (`SERIAL`, `TIMESTAMP`) | `psql` cek tabel, idempotent re-run |
| 3 | Session store | `index.js` ganti `connect-sqlite3` → `connect-pg-simple` | Login + refresh tetap login |
| 4 | Helper migration | `tmp/migrate-data.js` (SQLite → Supabase, connection string URL-encoded) | Bandingkan row count per tabel |
| 5 | Call site refactor — services | Urutan dependency: leaf dulu (`fifoService`, `hppService`, `inventoryService`, dst) | Jest test pass per service |
| 6 | Call site refactor — routes | 13 file route jadi `async`, pattern Section 4 | Manual smoke test per endpoint |
| 7 | Test infra Postgres | `tests/setup.js` → schema `test` di Supabase, truncate tiap run | Full `npm test` pass |

**Catatan risiko:**
- Milestone 5-6 paling rawan (260 call site). Kerja per file, jalankan test setelah tiap service/route, jangan tunggu semua selesai.
- Milestone 4 dapat berjalan paralel dengan 1-3 (baca SQLite, tulis Supabase).
- Rollback plan: `git branch supabase-migration`. `main` tetap SQLite jalan. Kalau macet, `git checkout main`.

## 6. Error Handling & Edge Case

**1. Connection pool:** Pool size 10, idle timeout 30s. `pool.connect()` error → log + retry sekali, lalu throw jelas: `"Tidak bisa connect ke Supabase. Cek DATABASE_URL & koneksi internet."` `process.on('SIGTERM')` → `await pool.end()`.

**2. Transaksi atomicity:** ROLLBACK dijamin di catch walau fn throw di tengah. Nested transaction → SAVEPOINT jika dipakai (akan di-scan; kalau tidak ada, skip — YAGNI).

```js
async transaction(fn) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    const tx = wrap(client);
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

**3. Env validation:** `DATABASE_URL` unset saat boot → throw `"[FATAL] DATABASE_URL wajib di-set. Copy .env.example ke .env."` + exit. Tidak silent fallback. Validasi raw `@` di password → error jelas.

**4. Error mapping Supabase → app:** Helper `db.mapError(e)` bungkus jadi `DbError` kode aplikasi:
- `23505` unique → "Data sudah ada (kode/sku duplikat)"
- `23503` FK → "Referensi tidak ditemukan"
- `23502` not null → "Field wajib diisi"

Route catch & flash message. Ini perbaikan bonus — sebelumnya SQLite error string raw.

**5. Edge case spesifik:**
- **FIFO batch loop** (`fifoService`): tiap iterasi insert/update. Kalau satu gagal di tengah → ROLLBACK balikin semua. Async `for...of` dengan `await` tiap step.
- **HPP calculation** (`hppService`): `REAL` tetap `REAL` (float64), presisi identik SQLite, tidak ada surprise rounding.
- **Session expiry:** `connect-pg-simple` butuh tabel `session`, auto-create di boot.

## 7. Testing & Go-Live

**Test infra (Postgres schema `test`):**
- `tests/setup.js` → connect Supabase, `DROP SCHEMA IF EXISTS test CASCADE; CREATE SCHEMA test;`, bootstrap tabel di schema itu.
- Tiap test `beforeEach`: `TRUNCATE` tabel (urutan dependency-aware), `SET search_path TO test`.
- Seed fixture (users, vendors, products) di `beforeEach`.
- Konfigurasi jest tetap, hanya setup yang diganti. Assertion test tidak berubah.

**Go-live checklist (urutan eksekusi di akhir):**
```
□ .env ada, DATABASE_URL URL-encoded benar (password @ → %40)
□ node -e "require('./db').query('SELECT NOW()')" → return timestamp Supabase
□ npm test → semua suite pass
□ npm start → app jalan tanpa error boot
□ Login admin → success, session persist setelah refresh
□ CRUD vendor → create + edit + delete success
□ Buat PO → add items → validate → stok bahan naik (FIFO batch created)
□ Buat production batch → add costs → validate → HPP terhitung
□ Bandingkan data: row count per tabel SQLite vs Supabase sama
□ Git commit di branch supabase-migration, main tetap SQLite
□ Push & merge ke main setelah smoke test 1-2 hari gak ada keluhan
```

**Rollback plan:** `git checkout main` → kembali ke SQLite <1 menit. Data Supabase tetap utuh.

## 8. Hubungan Antar Tabel (data model reference)

```
users ──┬─ validated_by → (purchase_orders, production_costs, purchase_imports, shipments)
        ├─ created_by  → (purchase_orders, purchase_imports, shipments, delivery_expenses, stock_movements, hpp_batch_config)
        ├─ validated_by → (production_costs, variant_prices)
        └─ updated_by  → (hpp_batch_config, variant_prices)

vendors ─┬─ purchase_orders
         ├─ production_batches (vendor_id) → optional, untuk konveksi
         └─ purchase_imports

products ─┬─ product_variants (CASCADE)
          ├─ production_batches
          └─ product_photos (CASCADE)

product_variants ─┬─ hpp_history
                  ├─ production_deliveries (CASCADE)
                  ├─ purchase_imports
                  ├─ production_costs (optional)
                  ├─ product_photos (CASCADE)
                  ├─ variant_prices (CASCADE)
                  └─ shipment_invoices

raw_materials ─┬─ raw_material_variants (CASCADE)
               ├─ purchase_order_items
               ├─ production_costs (optional)
               ├─ material_batches
               └─ stock_movements

material_batches ─── stock_movements

purchase_orders ─┬─ purchase_order_items (CASCADE)
                 ├─ purchase_order_photos (CASCADE)
                 └─ currency_id → currencies (optional)

production_batches ─┬─ production_costs (CASCADE)
                    ├─ production_deliveries (CASCADE)
                    └─ hpp_batch_config (CASCADE)

shipments ─── shipment_invoices (CASCADE)

purchase_imports ─── hpp_history (via sumber_id)

currencies ─┬─ purchase_orders (optional)
            └─ shipment_invoices
```

## 9. Out of Scope

- Deploy app ke platform (Vercel/Railway/Render) — app tetap lokal.
- Redesign UI — Approach 1 tidak mengikat apapun ke arsitektur tertentu (tidak ada ORM, tidak ada repository pattern baru). UI redesign bebas dilakukan kapan saja; data tetap lewat adapter yang sama. Phase 2 (repository pattern) terpisah setelah go-live stabil.
- Migration tool (Knex/Prisma) — tidak dipakai; schema bootstrap tetap inline `CREATE TABLE IF NOT EXISTS` seperti pola lama, hanya pg syntax.

## 10. Phase 2 (di luar skop sekarang)

Setelah go-live stabil 1-2 minggu, pelan-pelan refactor service → repository pattern per service. Masing-masing PR kecil, test pass. Target akhir: route panggil `vendorRepo.findById(id)`, bukan `db.query` langsung.
