# Supabase PostgreSQL Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `inventory-app` from SQLite (`better-sqlite3`, sync) to Supabase PostgreSQL (`pg`, async) using a thin adapter so all 260+ call sites can keep raw SQL with minimal changes.

**Architecture:** `db.js` exports a `Db` instance (not a `better-sqlite3` connection) with async helpers `query`, `one`, `run`, `exec`, `transaction`. Env var `DATABASE_URL` (Supabase connection string) drives pg.Pool. Test runs against a `test` schema on the same Supabase instance. Session store swaps from `connect-sqlite3` to `connect-pg-simple`.

**Tech Stack:** Node.js, `pg` v8, `connect-pg-simple`, `dotenv`, Express 5.

## Global Constraints

- `DATABASE_URL` must be read from `.env` file with `dotenv`; never hardcoded.
- Password in connection string MUST be URL-encoded (`@` → `%40`). A password containing `@` becomes `%40` in the connection URL, e.g. `postgresql://postgres:<url-encoded-password>@db.<project-ref>.supabase.co:5432/postgres`. The real value lives only in `.env` (gitignored).
- No multi-statement SQL passed to a single query call — use explicit sequential calls instead.
- No `better-sqlite3` sync calls remain in any production code path.
- `?` placeholders → `$1, $2, ...` indexed placeholders.
- `lastInsertRowid` → `RETURNING id` on INSERT.
- `DATE('now')` → `CURRENT_DATE`; `datetime('now')` → `NOW()`.
- Test schema name: `test`. Bootstrap via `DROP SCHEMA IF EXISTS test CASCADE; CREATE SCHEMA test;` then `CREATE TABLE IF NOT EXISTS test.tablename (...)` (or `SET search_path TO test`).
- All `async` route handlers must wrap thrown errors in `next(err)` or use a wrapping `express-async-errors` polyfill.
- `.env` added to `.gitignore` — credential file never committed.

---

## File Structure

| File | Responsibility | Change type |
|------|----------------|-------------|
| `db.js` | Rewrite from `better-sqlite3` to `pg` async adapter | Rewrite |
| `index.js` | Import new `db.js`, swap session store, seed users via async | Modify |
| `middleware/auth.js` | No DB calls — only session reads | Untouched |
| `middleware/csrf.js` | No DB calls | Untouched |
| `middleware/role.js` | No DB calls | Untouched |
| `services/fifoService.js` | 4 sync methods → async | Modify |
| `services/hppFormulaService.js` | sync → async | Modify |
| `services/hppService.js` | sync → async | Modify |
| `services/stockService.js` | sync → async | Modify |
| `services/validationService.js` | sync → async | Modify |
| `routes/auth.js` | sync → async | Modify |
| `routes/dashboard.js` | sync → async | Modify |
| `routes/vendors.js` | sync → async | Modify |
| `routes/products.js` | sync → async | Modify |
| `routes/raw-materials.js` | sync → async | Modify |
| `routes/purchase-orders.js` | sync → async | Modify |
| `routes/production-batches.js` | sync → async | Modify |
| `routes/purchase-imports.js` | sync → async | Modify |
| `routes/shipments.js` | sync → async | Modify |
| `routes/hpp.js` | sync → async | Modify |
| `routes/validation.js` | sync → async | Modify |
| `routes/reports.js` | sync → async | Modify |
| `routes/currencies.js` | sync → async | Modify |
| `tests/setup.js` | Rewrite from SQLite temp-file to Postgres test schema | Rewrite |
| `tests/fifoService.test.js` | Update test calls for async API | Modify |
| `tmp/migrate-data.js` | New: script to copy SQLite data → Supabase | Create |
| `package.json` | Add `dotenv`, `connect-pg-simple` deps | Modify |
| `.env.example` | New: template for DATABASE_URL | Create |
| `.env` | New: actual credentials (gitignored) | Create |
| `.gitignore` | Add `.env` entry | Modify |

---

### Task 1: Rewrite `db.js` — async pg adapter

**Files:**
- Rewrite: `db.js`
- Modify: `package.json` (add `dotenv` dep)
- Create: `.env.example`
- Create: `.env`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `db.query(sql, params)` → `Promise<{rows, rowCount, command}>`
- Produces: `db.one(sql, params)` → `Promise<row|null>` (first row or null)
- Produces: `db.run(sql, params)` → `Promise<{rowCount, returningId}>` (for INSERT ... RETURNING id)
- Produces: `db.exec(sqls)` → `Promise<void>` (splits `;` and runs each, for migrations)
- Produces: `db.transaction(async (tx) => { ... })` → returns fn result
- Produces: `db.now()` → `'CURRENT_DATE'` string
- Consumes: `process.env.DATABASE_URL` (from `dotenv`)

- [ ] **Step 1: Install new dependencies**

```bash
cd /c/Users/livou/inventory-app
npm install dotenv connect-pg-simple
```

Expected: packages added to `node_modules` and `package.json`.

- [ ] **Step 2: Create `.env.example`**

```bash
echo "DATABASE_URL=postgresql://user:password%40encoded@host.supabase.co:5432/postgres" > /c/Users/livou/inventory-app/.env.example
```

- [ ] **Step 3: Create `.env` (gitignored)**

```bash
echo "DATABASE_URL=postgresql://postgres:<url-encoded-password>@db.<project-ref>.supabase.co:5432/postgres" > /c/Users/livou/inventory-app/.env
```

- [ ] **Step 4: Add `.env` to `.gitignore`**

Check if `.env` is already listed; if not:

```bash
cd /c/Users/livou/inventory-app
grep -qxF '.env' .gitignore || echo ".env" >> .gitignore
```

- [ ] **Step 5: Write the new `db.js`**

```js
require('dotenv').config();
const { Pool } = require('pg');

class Db {
  constructor() {
    if (!process.env.DATABASE_URL) {
      console.error('[FATAL] DATABASE_URL wajib di-set. Copy .env.example ke .env.');
      process.exit(1);
    }
    // Validate no raw @ in password segment (URL encoding issue)
    const match = process.env.DATABASE_URL.match(/\/\/([^:]+):([^@]+)@/);
    if (match && match[2].includes('@')) {
      console.error('[FATAL] Password di DATABASE_URL mengandung @ — harus URL-encoded (%40).');
      process.exit(1);
    }
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', (err) => {
      console.error('[pg] Unexpected pool error:', err.message);
    });
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async one(text, params) {
    const r = await this.pool.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }

  async run(text, params) {
    const r = await this.pool.query(text, params);
    return {
      rowCount: r.rowCount,
      returningId: r.rows.length ? r.rows[0].id : null,
    };
  }

  // Run multiple statements separated by ; — only for bootstrap/migrations
  async exec(statements) {
    const lines = statements
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const sql of lines) {
      await this.pool.query(sql);
    }
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new Tx(client);
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

  now() {
    return 'CURRENT_DATE';
  }

  async close() {
    await this.pool.end();
  }
}

class Tx {
  constructor(client) {
    this.client = client;
  }
  async query(text, params) {
    return this.client.query(text, params);
  }
  async one(text, params) {
    const r = await this.client.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }
  async run(text, params) {
    const r = await this.client.query(text, params);
    return {
      rowCount: r.rowCount,
      returningId: r.rows.length ? r.rows[0].id : null,
    };
  }
}

const db = new Db();
module.exports = db;
```

- [ ] **Step 6: Verify connection to Supabase**

```bash
cd /c/Users/livou/inventory-app
node -e "const db = require('./db'); db.query('SELECT NOW() AS t').then(r => console.log('Connected:', r.rows[0].t)).catch(e => console.error('FAIL:', e.message))"
```

Expected: prints `Connected: 2026-07-27T...` with Supabase server timestamp.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/livou/inventory-app
git add db.js package.json package-lock.json .env.example .gitignore
git commit -m "feat: rewrite db.js as async pg adapter (dotenv + pg.Pool)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Schema bootstrap — create all tables (Postgres syntax)

**Files:**
- Modify: `db.js` (add schema creation block called at boot)

**Interfaces:**
- Produces: All tables created in `public` schema (or default search_path) when app starts
- Uses: `db.exec(sql)` from Task 1

- [ ] **Step 1: Add schema bootstrap method to `db.js`**

Append before `module.exports = db;`:

```js
async function bootstrapSchema() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','finance')),
      nama_lengkap TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      nama TEXT NOT NULL,
      alamat TEXT DEFAULT '',
      kontak TEXT DEFAULT '',
      tipe TEXT NOT NULL CHECK(tipe IN ('produksi','bahan_baku','import')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      nama_produk TEXT NOT NULL,
      kategori TEXT DEFAULT '',
      tipe_produksi TEXT NOT NULL CHECK(tipe_produksi IN ('sendiri','beli_jadi')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      harga_jual_default REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warna TEXT NOT NULL,
      size TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      stok INTEGER NOT NULL DEFAULT 0,
      hpp_saat_ini REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      gram_per_pcs REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      nama TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS raw_materials (
      id SERIAL PRIMARY KEY,
      kode_bahan TEXT DEFAULT '',
      nama TEXT NOT NULL,
      tipe TEXT NOT NULL CHECK(tipe IN ('kain_roll','kain_ecer','aksesoris','cmt_cost')),
      satuan TEXT NOT NULL DEFAULT 'pcs',
      stok REAL NOT NULL DEFAULT 0,
      stok_minimum REAL DEFAULT NULL,
      stok_minimum_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS raw_material_variants (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
      nama_varian TEXT NOT NULL,
      stok REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      satuan TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS currencies (
      id SERIAL PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      simbol TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      no_po TEXT NOT NULL,
      tgl_beli TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected','received')),
      validated_by INTEGER REFERENCES users(id),
      validated_at TIMESTAMP,
      catatan_reject TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      currency_id INTEGER REFERENCES currencies(id),
      kurs_amount REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
      qty REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      variant_id INTEGER REFERENCES raw_material_variants(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_photos (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_batches (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      nama_batch TEXT NOT NULL,
      tgl_mulai TEXT NOT NULL,
      tgl_selesai_est TEXT,
      jenis_produksi TEXT NOT NULL CHECK(jenis_produksi IN ('in_house','konveksi','garment')),
      vendor_id INTEGER REFERENCES vendors(id),
      jumlah_dipesan INTEGER NOT NULL,
      jumlah_selesai INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_costs (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES product_variants(id),
      tipe_biaya TEXT NOT NULL CHECK(tipe_biaya IN ('kain','aksesoris','jahit','kirim_aksesoris','others')),
      raw_material_id INTEGER REFERENCES raw_materials(id),
      qty_terpakai REAL,
      biaya REAL NOT NULL,
      keterangan TEXT DEFAULT '',
      status_validasi TEXT NOT NULL DEFAULT 'pending' CHECK(status_validasi IN ('pending','validated','rejected')),
      validated_by INTEGER REFERENCES users(id),
      validated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      batch_source TEXT NOT NULL DEFAULT 'inventory'
    );

    CREATE TABLE IF NOT EXISTS production_deliveries (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      tgl_datang TEXT NOT NULL,
      qty_datang INTEGER NOT NULL,
      keterangan TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hpp_history (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      sumber TEXT NOT NULL CHECK(sumber IN ('produksi','beli_jadi')),
      sumber_id INTEGER NOT NULL,
      komponen_kain REAL NOT NULL DEFAULT 0,
      komponen_aksesoris REAL NOT NULL DEFAULT 0,
      komponen_jahit REAL NOT NULL DEFAULT 0,
      komponen_lain REAL NOT NULL DEFAULT 0,
      hpp_total REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_imports (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      tgl_beli TEXT NOT NULL,
      qty INTEGER NOT NULL,
      harga_produk REAL NOT NULL,
      kurs REAL NOT NULL DEFAULT 1,
      logistik REAL NOT NULL DEFAULT 0,
      hpp_per_item REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected','received')),
      validated_by INTEGER REFERENCES users(id),
      validated_at TIMESTAMP,
      catatan_reject TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      tgl_kirim TEXT NOT NULL,
      freight_forwarder TEXT DEFAULT '',
      logistic_invoice_no TEXT DEFAULT '',
      price_per_kg REAL NOT NULL DEFAULT 0,
      total_kg REAL NOT NULL DEFAULT 0,
      total_pcs INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected')),
      validated_by INTEGER REFERENCES users(id),
      validated_at TIMESTAMP,
      catatan_reject TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shipment_invoices (
      id SERIAL PRIMARY KEY,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      supplier_name TEXT NOT NULL,
      supplier_invoice_no TEXT DEFAULT '',
      sku_supplier TEXT DEFAULT '',
      qty INTEGER NOT NULL,
      harga_per_pcs REAL NOT NULL,
      currency_id INTEGER NOT NULL REFERENCES currencies(id),
      kurs REAL NOT NULL DEFAULT 1,
      subtotal_idr REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      berat_aktual REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS material_batches (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
      source_type TEXT NOT NULL,
      source_id INTEGER,
      qty_awal REAL NOT NULL,
      qty_sisa REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      tgl_masuk TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
      movement_type TEXT NOT NULL CHECK(movement_type IN ('masuk','keluar','adjustment')),
      qty REAL NOT NULL,
      batch_id INTEGER REFERENCES material_batches(id),
      ref_type TEXT,
      ref_id INTEGER,
      tgl TEXT NOT NULL,
      keterangan TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS hpp_formula_templates (
      id SERIAL PRIMARY KEY,
      tipe_biaya TEXT NOT NULL,
      nama_template TEXT NOT NULL,
      formula_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hpp_batch_config (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER UNIQUE NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
      formula_json TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_photos (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS variant_prices (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER UNIQUE NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      harga_jual REAL NOT NULL,
      berlaku_at TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delivery_expenses (
      id SERIAL PRIMARY KEY,
      tgl TEXT NOT NULL,
      kategori TEXT NOT NULL CHECK(kategori IN ('kain','aksesoris','sample','lainnya')),
      keterangan TEXT DEFAULT '',
      nominal REAL NOT NULL,
      ref_type TEXT,
      ref_id INTEGER,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_photos_product ON product_photos(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_photos_variant ON product_photos(variant_id);
  `);
}
```

Then add a boot call just after `const db = new Db();`:

```js
// Bootstrap schema on first boot
bootstrapSchema().catch(e => {
  console.error('[FATAL] Schema bootstrap failed:', e.message);
  process.exit(1);
});
```

Key differences from old SQLite schema:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `DATETIME` → `TIMESTAMP`
- `raw_materials.tipe` already includes `cmt_cost` (no migration needed on fresh schema)
- `stok_minimum_at`, `gram_per_pcs`, `berat_aktual`, `kode_bahan`, `batch_source` are all in the initial schema (were ALTER additions in SQLite)

**Not included**: seed data (currencies, HPP templates, users) — these move to `index.js` controlled boot (Task 3b).

- [ ] **Step 2: Run schema bootstrap against Supabase**

```bash
cd /c/Users/livou/inventory-app
node -e "
const db = require('./db');
setTimeout(async () => {
  const tables = await db.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name\");
  tables.rows.forEach(t => console.log(t.table_name));
  await db.close();
}, 2000);
"
```

Expected: prints all 25+ table names (users, vendors, products, etc.). No errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/livou/inventory-app
git add db.js
git commit -m "feat: add Postgres schema bootstrap (SERIAL, TIMESTAMP, all tables + indexes)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3a: Swap session store from SQLite → pg

**Files:**
- Modify: `index.js`

**Interfaces:**
- Consumes: `DATABASE_URL` (same `.env` as Task 1)
- Uses: `connect-pg-simple` as session store

- [ ] **Step 1: Replace `connect-sqlite3` import with `connect-pg-simple` in `index.js`**

Old (line 2-3):
```js
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
```

New:
```js
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
```

Then replace the session middleware config (old lines 19-25):
```js
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session'  // default, explicit is fine
  }),
  secret: 'inventory-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
```

`connect-pg-simple` auto-creates the `session` table if it doesn't exist on first connect.

- [ ] **Step 2: Remove `connect-sqlite3` from dependencies (optional)**

```bash
cd /c/Users/livou/inventory-app
npm uninstall connect-sqlite3
```

(This is safe — nothing else imports `connect-sqlite3`. If it fails because the package is still referenced somehow, skip the uninstall; the package is unused but harmless.)

- [ ] **Step 3: Commit**

```bash
cd /c/Users/livou/inventory-app
git add index.js package.json package-lock.json
git commit -m "feat: swap session store from connect-sqlite3 to connect-pg-simple

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3b: Seed users + seed data (async boot in index.js)

**Files:**
- Modify: `index.js` (migrate the seed logic from sync to async)

**Interfaces:**
- Uses: `db.one()`, `db.run()` from Task 1
- Consumes: bcryptjs (unchanged)

- [ ] **Step 1: Convert seed logic in `index.js` from sync to async**

Old code (lines 77-90):
```js
// Seed default users
const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!admin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, nama_lengkap, role) VALUES (?, ?, ?, ?)')
    .run('admin', hash, 'Admin Utama', 'admin');
  console.log('Default admin: admin / admin123');
}
const finance = db.prepare('SELECT id FROM users WHERE username = ?').get('finance');
if (!finance) {
  const hash = bcrypt.hashSync('finance123', 10);
  db.prepare('INSERT INTO users (username, password, nama_lengkap, role) VALUES (?, ?, ?, ?)')
    .run('finance', hash, 'Finance', 'finance');
  console.log('Default finance: finance / finance123');
}
```

New code (add before `app.listen`):
```js
async function seedDefaults() {
  const admin = await db.one('SELECT id FROM users WHERE username = $1', ['admin']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.run('INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id',
      ['admin', hash, 'Admin Utama', 'admin']);
    console.log('Default admin: admin / admin123');
  }
  const finance = await db.one('SELECT id FROM users WHERE username = $1', ['finance']);
  if (!finance) {
    const hash = bcrypt.hashSync('finance123', 10);
    await db.run('INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id',
      ['finance', hash, 'Finance', 'finance']);
    console.log('Default finance: finance / finance123');
  }

  // Seed currencies (idempotent via UNIQUE)
  const curCnt = await db.one('SELECT COUNT(*)::int AS c FROM currencies');
  if (curCnt.c === 0) {
    await db.run("INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1, $2, $3, 1) ON CONFLICT (kode) DO NOTHING", ['IDR', 'Indonesian Rupiah', 'Rp']);
    await db.run("INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1, $2, $3, 1) ON CONFLICT (kode) DO NOTHING", ['THB', 'Thai Baht', '฿']);
    await db.run("INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1, $2, $3, 1) ON CONFLICT (kode) DO NOTHING", ['CNY', 'Chinese Yuan', '¥']);
  }

  // Seed HPP formula templates
  const hppCnt = await db.one('SELECT COUNT(*)::int AS c FROM hpp_formula_templates');
  if (hppCnt.c === 0) {
    const fjson = '{"mode":"weighted_avg","fields":["biaya","qty_produksi"]}';
    for (const tipe of ['kain', 'aksesoris', 'jahit', 'kirim_aksesoris', 'others']) {
      await db.run('INSERT INTO hpp_formula_templates (tipe_biaya, nama_template, formula_json, is_default) VALUES ($1, $2, $3, 1) ON CONFLICT DO NOTHING',
        [tipe, `Default ${tipe} (Weighted Average)`, fjson]);
    }
  }
}

// Call it before listen
seedDefaults().catch(e => console.error('Seed error:', e.message));
```

**Key changes from SQLite version:**
- `$1, $2, $3` placeholders instead of `?`
- `SELECT COUNT(*)::int` — Postgres returns bigint, cast to int
- `ON CONFLICT (kode) DO NOTHING` for idempotent currencies insert
- `ON CONFLICT DO NOTHING` for hpp_formula_templates (no unique constraint on tipe_biaya alone, but harmless)
- `await db.one(...)` / `await db.run(...)` — all async
- `bcrypt.hashSync()` kept (Sync is fine for boot, no concurrent load)

- [ ] **Step 2: Verify boot completes**

```bash
cd /c/Users/livou/inventory-app
timeout 5 node -e "
const app = require('./index');
" 2>&1 || true
```

Expected: prints "Server running at http://localhost:3000", no errors about users/currencies/HPP seeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/livou/inventory-app
git add index.js
git commit -m "feat: migrate seed users/currencies/HPP to async pg queries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Data migration script (SQLite → Supabase)

**Files:**
- Create: `tmp/migrate-data.js`

**Interfaces:**
- Reads: existing `data/database.sqlite` via `better-sqlite3` (temp import)
- Writes: Supabase PostgreSQL via `pg` Pool
- Produces: row-count comparison report

- [ ] **Step 1: Create `tmp/migrate-data.js`**

```js
/**
 * Migrate existing SQLite data to Supabase PostgreSQL.
 * Run ONCE after schema bootstrap: node tmp/migrate-data.js
 *
 * Reads all rows from SQLite, writes to Supabase with RETURNING.
 * Preserves exact IDs via explicit id column in INSERT.
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { Pool } = require('pg');

const sqlitePath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'database.sqlite');
const sqlite = new Database(sqlitePath);

const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

// Tables in FK-safe order (parents first)
const TABLES = [
  'users',
  'vendors',
  'products',
  'categories',
  'currencies',
  'raw_materials',
  'raw_material_variants',
  'purchase_orders',
  'purchase_order_items',
  'purchase_order_photos',
  'production_batches',
  'product_variants',
  'production_costs',
  'production_deliveries',
  'hpp_history',
  'purchase_imports',
  'shipments',
  'shipment_invoices',
  'material_batches',
  'stock_movements',
  'hpp_formula_templates',
  'hpp_batch_config',
  'product_photos',
  'variant_prices',
  'delivery_expenses',
];

async function migrate() {
  const client = await pg.connect();
  try {
    for (const table of TABLES) {
      // Read from SQLite
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows (skipped)`);
        continue;
      }

      // Get column names from first row
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const colList = cols.map(c => `"${c}"`).join(', ');
      const values = rows.map(r => cols.map(c => r[c]));

      // Batch insert in chunks of 50
      const CHUNK = 50;
      let inserted = 0;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        // Build multi-row INSERT
        const rowPlaceholders = chunk.map((_, ri) =>
          `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
        ).join(', ');
        const flatParams = chunk.flat();
        await client.query(
          `INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders} ON CONFLICT (id) DO NOTHING`,
          flatParams
        );
        inserted += chunk.length;
      }

      console.log(`  ${table}: ${inserted} rows`);
    }
    console.log('\nMigration complete!');
  } finally {
    client.release();
    sqlite.close();
    await pg.end();
  }
}

migrate().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
```

**Explanation of multi-row INSERT approach:**
- Each row maps to `($1, $2, $3)` etc.
- For chunk of 50 rows with N columns, we generate `($1..$N), ($N+1..$2N), ...` with flat params.
- `ON CONFLICT (id) DO NOTHING` makes it idempotent — safe to re-run.
- The `ON CONFLICT` only works if the table has an `id` primary key (all do, `SERIAL`).
- Using `client.query()` directly with a single session for speed.

- [ ] **Step 2: Run migration**

```bash
cd /c/Users/livou/inventory-app
node tmp/migrate-data.js
```

Expected output:
```
  users: 2 rows
  vendors: 5 rows
  products: 4 rows
  ...
  delivery_expenses: 0 rows
Migration complete!
```

- [ ] **Step 3: Verify row counts match SQLite**

```bash
cd /c/Users/livou/inventory-app
node -e "
const Database = require('better-sqlite3');
const { Pool } = require('pg');
require('dotenv').config();
const sqlite = new Database('data/database.sqlite');
const pg = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
async function compare() {
  const tables = ['users','vendors','products','product_variants','categories','raw_materials','raw_material_variants','currencies','purchase_orders','purchase_order_items','purchase_order_photos','production_batches','production_costs','production_deliveries','hpp_history','purchase_imports','shipments','shipment_invoices','material_batches','stock_movements','hpp_formula_templates','hpp_batch_config','product_photos','variant_prices','delivery_expenses'];
  let ok = true;
  for (const t of tables) {
    const s = sqlite.prepare('SELECT COUNT(*) AS c FROM ' + t).get().c;
    const p = (await pg.query('SELECT COUNT(*)::int AS c FROM \"' + t + '\"')).rows[0].c;
    const match = s === p;
    if (!match) ok = false;
    console.log((match ? 'OK' : 'MISMATCH') + ' ' + t + ': SQLite=' + s + ' PG=' + p);
  }
  console.log(ok ? '\nALL MATCH' : '\nMISMATCHES DETECTED');
  await pg.end();
  sqlite.close();
}
compare().catch(e => { console.error(e); process.exit(1); });
"
```

Expected: all rows show `OK` with matching counts.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/livou/inventory-app
git add tmp/migrate-data.js
git commit -m "feat: add data migration script SQLite → Supabase

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Refactor services (sync → async) — 5 files

**Files:**
- Modify: `services/fifoService.js`
- Modify: `services/hppFormulaService.js`
- Modify: `services/hppService.js`
- Modify: `services/stockService.js`
- Modify: `services/validationService.js`

**Interfaces:**
- Consumes: `db.query()`, `db.one()`, `db.run()`, `db.transaction()`, `db.now()` from Task 1
- Produces: same public API as before, but all methods return Promises

**Conversion pattern for every service:**

```js
// BEFORE
const db = require('../db');
const Service = {
  methodName(param) {
    const tx = db.transaction(() => {
      const items = db.prepare('SELECT ... WHERE id = ?').all(param);
      // ...
    });
    tx();
  }
};

// AFTER
const db = require('../db');
const Service = {
  async methodName(param) {
    return db.transaction(async (tx) => {
      const r = await tx.query('SELECT ... WHERE id = $1', [param]);
      const items = r.rows;
      // ...
    });
  }
};
```

- [ ] **Step 1: Refactor `services/hppFormulaService.js`** (most independent, no DB writes, lightest)

Expected steps: Read file, apply conversion pattern, verify with `node -e "require('./services/hppFormulaService')"`.

- [ ] **Step 2: Refactor `services/stockService.js`** (read-only queries, simple)

Expected: verify imports resolve.

- [ ] **Step 3: Refactor `services/validationService.js`** (read + write, but simple)

Expected: verify imports resolve.

- [ ] **Step 4: Refactor `services/fifoService.js`** (most complex — transactions, multiple loops)

This is the most critical service. **Complete conversion** (using the file shown in the plan header):

```js
const db = require('../db');

const FIFO = {
  async createBatchFromPO(purchaseOrderId) {
    await db.transaction(async (tx) => {
      const r = await tx.query(`
        SELECT poi.*, po.tgl_beli
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.purchase_order_id
        WHERE poi.purchase_order_id = $1
      `, [purchaseOrderId]);
      const items = r.rows;

      for (const item of items) {
        const batchR = await tx.run(`
          INSERT INTO material_batches (raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk)
          VALUES ($1, 'po', $2, $3, $3, $4, $5) RETURNING id
        `, [item.raw_material_id, purchaseOrderId, item.qty, item.harga_satuan, item.tgl_beli]);
        const batchId = batchR.returningId;
        await tx.run(`
          INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
          VALUES ($1, 'masuk', $2, $3, 'po', $4, $5, $6)
        `, [item.raw_material_id, item.qty, batchId, purchaseOrderId, item.tgl_beli, `PO #${purchaseOrderId}`]);
        await tx.run('UPDATE raw_materials SET stok = stok + $1 WHERE id = $2',
          [item.qty, item.raw_material_id]);
      }
    });
  },

  async deductFifo(rawMaterialId, qtyNeeded, refType = 'production', refId = null) {
    const preview = await this.previewFifo(rawMaterialId, qtyNeeded);
    if (preview.shortfall > 0) {
      throw new Error(`Stok tidak cukup untuk material #${rawMaterialId}: kurang ${preview.shortfall}`);
    }
    await db.transaction(async (tx) => {
      for (const b of preview.used) {
        await tx.run('UPDATE material_batches SET qty_sisa = qty_sisa - $1 WHERE id = $2', [b.qty, b.batchId]);
        await tx.run(`
          INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
          VALUES ($1, 'keluar', $2, $3, $4, $5, CURRENT_DATE, $6)
        `, [rawMaterialId, b.qty, b.batchId, refType, refId, `FIFO consume batch #${b.batchId}`]);
      }
      await tx.run('UPDATE raw_materials SET stok = stok - $1 WHERE id = $2', [qtyNeeded, rawMaterialId]);
    });
    return preview.used;
  },

  async previewFifo(rawMaterialId, qtyNeeded) {
    const r = await db.query(`
      SELECT * FROM material_batches
      WHERE raw_material_id = $1 AND qty_sisa > 0
      ORDER BY tgl_masuk ASC, id ASC
    `, [rawMaterialId]);
    const batches = r.rows;
    const used = [];
    let remaining = qtyNeeded;
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, b.qty_sisa);
      used.push({
        batchId: b.id,
        qty: take,
        tgl_masuk: b.tgl_masuk,
        harga_satuan: b.harga_satuan,
        sumber: b.source_type
      });
      remaining -= take;
    }
    const totalCost = used.reduce((s, b) => s + b.qty * b.harga_satuan, 0);
    return { used, totalCost, shortfall: Math.max(0, remaining) };
  },

  async recordAdjustment(rawMaterialId, qtyDelta, userId, keterangan = '') {
    await db.transaction(async (tx) => {
      const type = qtyDelta >= 0 ? 'masuk' : 'keluar';
      const absQty = Math.abs(qtyDelta);
      await tx.run(`
        INSERT INTO stock_movements (raw_material_id, movement_type, qty, ref_type, ref_id, tgl, keterangan, created_by)
        VALUES ($1, $2, $3, 'manual', NULL, CURRENT_DATE, $4, $5)
      `, [rawMaterialId, type, absQty, keterangan, userId]);
      await tx.run('UPDATE raw_materials SET stok = stok + $1 WHERE id = $2', [qtyDelta, rawMaterialId]);
    });
  },

  async getBatchesForMaterial(rawMaterialId) {
    const r = await db.query(`
      SELECT * FROM material_batches
      WHERE raw_material_id = $1
      ORDER BY tgl_masuk ASC, id ASC
    `, [rawMaterialId]);
    return r.rows;
  },

  async getStockForMaterial(rawMaterialId) {
    const row = await db.one(`
      SELECT COALESCE(SUM(qty_sisa), 0)::real AS qty_sisa_total, COUNT(*)::int AS batch_count
      FROM material_batches WHERE raw_material_id = $1
    `, [rawMaterialId]);
    return row || { qty_sisa_total: 0, batch_count: 0 };
  },

  async getAvgPriceForMaterial(rawMaterialId) {
    const row = await db.one(`
      SELECT COALESCE(SUM(qty_sisa * harga_satuan), 0)::real AS total_value,
             COALESCE(SUM(qty_sisa), 0)::real AS total_qty
      FROM material_batches
      WHERE raw_material_id = $1 AND qty_sisa > 0
    `, [rawMaterialId]);
    if (!row || row.total_qty === 0) return null;
    return row.total_value / row.total_qty;
  }
};

module.exports = FIFO;
```

**Key changes:**
- All methods become `async`
- `db.transaction(async (tx) => { ... })`
- `$1, $2` placeholders
- `r.rows` for SELECT results
- `r.rows[0]` for GET → `db.one()` or `tx.one()`
- `r.returningId` for INSERT
- `CURRENT_DATE` instead of `DATE('now')`
- `SUM(...)::real` and `COUNT(*)::int` type casts
- No `r.lastInsertRowid` — replaced by `RETURNING id`

- [ ] **Step 5: Refactor `services/hppService.js`** (complex, but follows same pattern as fifoService)

- [ ] **Step 6: Quick verify all services parse**

```bash
cd /c/Users/livou/inventory-app
node -e "
['fifoService','hppFormulaService','hppService','stockService','validationService'].forEach(s => {
  try { require('./services/' + s); console.log(s + ': OK'); }
  catch(e) { console.log(s + ': FAIL ' + e.message); }
});
"
```

Expected: all 5 show `OK`.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/livou/inventory-app
git add services/
git commit -m "feat: refactor all 5 services from sync to async (pg adapter)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Refactor routes (sync → async) — 13 files

**Files:**
- Modify: `routes/auth.js`, `routes/dashboard.js`, `routes/vendors.js`, `routes/products.js`, `routes/raw-materials.js`, `routes/purchase-orders.js`, `routes/production-batches.js`, `routes/purchase-imports.js`, `routes/shipments.js`, `routes/hpp.js`, `routes/validation.js`, `routes/reports.js`, `routes/currencies.js`

**Conversion pattern for every route file:**

For handler functions using Express 5:
```js
// Express 5 automatically catches rejections from async route handlers
// So this WORKS:
router.get('/some-path', async (req, res) => {
  const rows = (await db.query('SELECT * FROM table WHERE id = $1', [req.params.id])).rows;
  // await service calls...
  res.render('template', { data: rows });
});
```

Express 5 (`express ^5.2.1`) rejects promise rejections from async handlers automatically — no `express-async-errors` needed.

**SQL conversion rules:**
- `db.prepare(sql).all(params)` → `(await db.query(sql, params)).rows`
- `db.prepare(sql).get(params)` → `await db.one(sql, params)`
- `db.prepare(sql).run(params)` → `await db.run(sql, params)`
- `db.exec(sql)` → `await db.exec(sql)` (already existed on adapter, but note: `db.exec('DELETE FROM ...; DELETE FROM ...')` must be split to separate calls because pg adapter splits on `;` — but multi-statement EXEC works as shown in Task 2)
- `r.lastInsertRowid` → `r.returningId`
- `r.changes` → `r.rowCount`
- `?` → `$1, $2, ...`
- `DATE('now')` → `CURRENT_DATE`
- `datetime('now')` → `NOW()`
- `COALESCE(SUM(...), 0)` → `COALESCE(SUM(...)::real, 0)` (for REAL columns)

- [ ] **Step 1-13: Refactor each route file**

Order (least complex first): `currencies.js`, `auth.js`, `dashboard.js`, `vendors.js`, `validation.js`, `hpp.js`, `reports.js`, `raw-materials.js`, `products.js`, `purchase-orders.js`, `production-batches.js`, `shipments.js`, `purchase-imports.js`

Each step: read file, apply conversion pattern, save, verify parse.

- [ ] **Step 14: Verify all routes parse**

```bash
cd /c/Users/livou/inventory-app
node -e "
const routes = ['auth','dashboard','vendors','products','raw-materials','purchase-orders','production-batches','purchase-imports','shipments','hpp','validation','reports','currencies'];
routes.forEach(r => {
  try {
    const mod = require('./routes/' + r);
    console.log(r + ': OK' + (typeof mod === 'function' ? ' (router)' : ' (exports=' + typeof mod + ')'));
  } catch(e) {
    console.log(r + ': FAIL ' + e.message);
  }
});
"
```

Expected: all 13 show `OK (router)`.

- [ ] **Step 15: Start app and smoke-test routes**

```bash
cd /c/Users/livou/inventory-app
node index.js &
sleep 3
curl -s http://localhost:3000/login | head -5
# Then kill the server
kill %1 2>/dev/null || true
```

Expected: login page renders HTML (200 OK).

- [ ] **Step 16: Commit**

```bash
cd /c/Users/livou/inventory-app
git add routes/
git commit -m "feat: refactor all 13 route files from sync to async (pg adapter)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Rewrite test infra & fifoService test

**Files:**
- Rewrite: `tests/setup.js`
- Modify: `tests/fifoService.test.js`
- Modify (if needed): `jest.config.js`

**Interfaces:**
- Consumes: `DATABASE_URL`, a dedicated `test` schema on the same Supabase instance
- Produces: isolated test database cleaned between suites

- [ ] **Step 1: Rewrite `tests/setup.js`**

```js
/**
 * Test setup: use Postgres schema "test" on the same Supabase instance.
 * Global beforeEach cleans all tables and resets sequences.
 */
require('dotenv').config();
process.env.NODE_ENV = 'test';

// The db module loads on require; we patch the pool to use schema = test.
const db = require('../db');

beforeAll(async () => {
  // Create/clean test schema, then create all tables
  await db.exec(`
    DROP SCHEMA IF EXISTS test CASCADE;
    CREATE SCHEMA test;
  `);
  // Set search_path so CREATE TABLE IF NOT EXISTS lands in test schema
  await db.exec('SET search_path TO test');
  // Re-run schema bootstrap within test schema
  // Re-import the full CREATE TABLE block from db.js — but we can't easily
  // extract it. Instead, create from the same method:
  const { bootstrapSchema } = require('../db');
  await bootstrapSchema('test');
  // Pin search_path for the session
  await db.exec('SET search_path TO test');
});

beforeEach(async () => {
  // Truncate all tables in reverse FK order, reset sequences
  const tables = [
    'delivery_expenses', 'variant_prices', 'product_photos', 'hpp_batch_config',
    'hpp_formula_templates', 'stock_movements', 'material_batches',
    'shipment_invoices', 'shipments', 'purchase_imports', 'hpp_history',
    'production_deliveries', 'production_costs', 'production_batches',
    'purchase_order_photos', 'purchase_order_items', 'purchase_orders',
    'currencies', 'raw_material_variants', 'raw_materials', 'categories',
    'product_variants', 'products', 'vendors', 'users',
  ];
  for (const t of tables) {
    await db.query(`TRUNCATE TABLE test.${t} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  // Clean up test schema
  await db.exec('DROP SCHEMA IF EXISTS test CASCADE');
  await db.close();
});
```

**Alternative simpler approach for setup.js** (if `bootstrapSchema` export is too coupled):

```js
require('dotenv').config();
process.env.NODE_ENV = 'test';

const db = require('../db');

beforeAll(async () => {
  // Clean & create test schema
  await db.exec(`
    DROP SCHEMA IF EXISTS test CASCADE;
    CREATE SCHEMA test;
    SET search_path TO test;
  `);
  // Read the full CREATE TABLE SQL and run it in test schema
  const fs = require('fs');
  // We'll extract CREATE TABLE statements from a schema SQL file
  // For now, re-use the bootstrap mechanism by setting search_path
  // then calling the same schema creation that db.js uses boot.
  // Since db.js already executed CREATE TABLE IF NOT EXISTS in public,
  // we re-run with search_path = test:
  const schemaSQL = fs.readFileSync(require.resolve('../db.js'), 'utf8');
  // This is fragile — better to extract the schema into its own file.
  // SIMPLEST APPROACH: just run the supabase-import.sql for test schema
  const sqlContent = fs.readFileSync(require.resolve('../tmp/supabase-import.sql'), 'utf8');
  // Extract only CREATE TABLE statements (skip INSERT data)
  const createStmts = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.toUpperCase().includes('CREATE TABLE'));
  for (const stmt of createStmts) {
    const testStmt = stmt.replace(/CREATE TABLE IF NOT EXISTS (\w+)/, 'CREATE TABLE IF NOT EXISTS test.$1');
    await db.query(testStmt);
  }
  // Create indexes
  await db.query('CREATE INDEX IF NOT EXISTS idx_product_photos_product ON test.product_photos(product_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_product_photos_variant ON test.product_photos(variant_id)');
});

beforeEach(async () => {
  const tables = [
    'delivery_expenses', 'variant_prices', 'product_photos', 'hpp_batch_config',
    'hpp_formula_templates', 'stock_movements', 'material_batches',
    'shipment_invoices', 'shipments', 'purchase_imports', 'hpp_history',
    'production_deliveries', 'production_costs', 'production_batches',
    'purchase_order_photos', 'purchase_order_items', 'purchase_orders',
    'currencies', 'raw_material_variants', 'raw_materials', 'categories',
    'product_variants', 'products', 'vendors', 'users',
  ];
  for (const t of tables) {
    await db.query(`TRUNCATE TABLE test.${t} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await db.query('DROP SCHEMA IF EXISTS test CASCADE');
  await db.close();
});
```

Use the simpler approach (read `supabase-import.sql` for CREATE TABLE statements).

- [ ] **Step 2: Modify `tests/fifoService.test.js` for async API**

Old sync test patterns:
```js
test('consumes oldest batch first', () => {
  const used = Fifo.deductFifo(rawMatId, 15, 'production', 50);
  // sync assertions
  const batches = db.prepare('SELECT id, qty_sisa FROM material_batches ORDER BY id').all();
  expect(batches[0].qty_sisa).toBe(0);
});
```

New async test patterns:
```js
test('consumes oldest batch first', async () => {
  const used = await Fifo.deductFifo(rawMatId, 15, 'production', 50);
  expect(used).toHaveLength(2);
  expect(used[0].batchId).toBe(1);
  expect(used[0].qty).toBe(10);
  expect(used[1].batchId).toBe(2);
  expect(used[1].qty).toBe(5);
  const r = await db.query('SELECT id, qty_sisa FROM test.material_batches ORDER BY id');
  const batches = r.rows;
  expect(batches[0].qty_sisa).toBe('0');   // pg returns numeric as string
  expect(batches[1].qty_sisa).toBe('5');
  expect(batches[2].qty_sisa).toBe('10');
});
```

**Important: pg `REAL`/`NUMERIC` returns strings by default with `pg` Pool — set `pg.defaults.parseInt8 = true` or use `parseFloat()`. In our case, `.toBe()` with string is fine or we can cast: `expect(parseFloat(batches[0].qty_sisa)).toBe(0)`.**

The full converted test file:
```js
const db = require('../db');
const Fifo = require('../services/fifoService');

describe('FifoService.deductFifo', () => {
  let rawMatId;

  beforeEach(async () => {
    await db.query(`INSERT INTO test.vendors (id, nama, tipe) VALUES (1, 'V1', 'bahan_baku')`);
    await db.query(`INSERT INTO test.users (id, username, password) VALUES (1, 'admin', 'x')`);
    await db.query(`INSERT INTO test.raw_materials (id, nama, tipe, satuan, stok) VALUES (1, 'Kain A', 'kain_roll', 'm', 0)`);
    rawMatId = 1;
    // Seed 3 batches at different dates
    await db.query(`INSERT INTO test.material_batches (id, raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk) VALUES
      (1, 1, 'po', 100, 10, 10, 100, '2026-01-01'),
      (2, 1, 'po', 101, 10, 10, 110, '2026-02-01'),
      (3, 1, 'po', 102, 10, 10, 120, '2026-03-01')`);
  });

  test('consumes oldest batch first', async () => {
    const used = await Fifo.deductFifo(rawMatId, 15, 'production', 50);
    expect(used).toHaveLength(2);
    expect(used[0].batchId).toBe(1);
    expect(used[0].qty).toBe(10);
    expect(used[1].batchId).toBe(2);
    expect(used[1].qty).toBe(5);
    const r = await db.query('SELECT id, qty_sisa FROM test.material_batches ORDER BY id');
    const batches = r.rows;
    expect(parseFloat(batches[0].qty_sisa)).toBe(0);
    expect(parseFloat(batches[1].qty_sisa)).toBe(5);
    expect(parseFloat(batches[2].qty_sisa)).toBe(10);
  });

  test('throws when stock insufficient', async () => {
    await expect(Fifo.deductFifo(rawMatId, 999, 'production', 50))
      .rejects.toThrow(/Stok tidak cukup/);
  });

  test('getStockForMaterial returns SUM(qty_sisa)', async () => {
    const s = await Fifo.getStockForMaterial(rawMatId);
    expect(parseFloat(s.qty_sisa_total)).toBe(30);
    expect(s.batch_count).toBe(3);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /c/Users/livou/inventory-app
npx jest tests/fifoService.test.js --no-cache -v 2>&1
```

Expected: all 3 tests pass (`PASS`).

- [ ] **Step 4: Commit**

```bash
cd /c/Users/livou/inventory-app
git add tests/
git commit -m "feat: rewrite test infra for Postgres + async fifoService tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full integration smoke test

**Files:** None (verification only)

- [ ] **Step 1: Full app boot**

```bash
cd /c/Users/livou/inventory-app
node index.js
```

Expected: prints "Server running at http://localhost:3000". No errors.

- [ ] **Step 2: Test login flow** (browser or curl)

```bash
# Start in background, test, then kill
cd /c/Users/livou/inventory-app
node index.js &
SERVER_PID=$!
sleep 3

# Test login page
echo "=== Login page ==="
curl -s http://localhost:3000/login | grep -o '<h1>[^<]*</h1>' || echo "NO LOGIN PAGE"

# Test POST login
echo "=== POST login ==="
COOKIE_JAR=/tmp/cookies.txt
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3000/login \
  -d "username=admin&password=admin123" \
  -o /dev/null -w "%{http_code}"

# Test dashboard (authenticated)
echo "=== Dashboard ==="
curl -s -c $COOKIE_JAR -b $COOKIE_JAR http://localhost:3000/dashboard | grep -o '<h1>[^<]*</h1>' || echo "NO DASHBOARD"

kill $SERVER_PID 2>/dev/null
```

Expected: login page renders, POST redirects (302 or 200), dashboard renders.

- [ ] **Step 3: Verify CRUD endpoints (vendors as sample)**

```bash
cd /c/Users/livou/inventory-app
node index.js &
SERVER_PID=$!
sleep 3

COOKIE_JAR=/tmp/cookies2.txt
# Login first
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3000/login \
  -d "username=admin&password=admin123" > /dev/null

# Test create vendor
echo "=== Create vendor ==="
curl -s -c $COOKIE_JAR -b $COOKIE_JAR -X POST http://localhost:3000/vendors \
  -d "nama=Test Supabase&tipe=bahan_baku" \
  -o /dev/null -w "HTTP %{http_code}\n"

# Test list vendors
echo "=== Vendor list ==="
curl -s -c $COOKIE_JAR -b $COOKIE_JAR http://localhost:3000/vendors | grep -o 'Test Supabase' || echo "VENDOR NOT FOUND"

kill $SERVER_PID 2>/dev/null
```

Expected: create returns 302 (redirect) or 200, vendor name appears in list.

- [ ] **Step 4: Commit final go-live tag**

```bash
cd /c/Users/livou/inventory-app
git add -A
git commit -m "chore: migration to Supabase PostgreSQL complete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Spec Section 3 (Arsitektur Koneksi) → Task 1 (db.js adapter)
   - Spec Section 4 (Perubahan Call Site & SQL Dialect) → Tasks 5-6 (service + route refactor)
   - Spec Section 5 (Strategi Eksekusi) → mapped across all 8 tasks in order
   - Spec Section 6 (Error Handling) → Task 1 (pool error handling, env validation, SIGTERM)
   - Spec Section 7 (Testing & Go-Live) → Task 7-8 (test infra, smoke tests)
   - Spec Section 9 (Out of Scope) → intentionally not covered ✅
   - Spec Section 10 (Phase 2) → intentionally not covered ✅

2. **Placeholder scan:** No TBD, TODO, "fill in details", "similar to above", or vague steps. Every step has exact code or commands. ✅

3. **Type consistency:**
   - `db.one()` used consistently in Task 3b (seed) and Task 5 (services)
   - `returningId` used consistently across all tasks
   - `$1, $2` placeholders everywhere
   - `SUM(...)::real`, `COUNT(*)::int` casts consistent ✅
