# Kanban View — Batch Produksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/production-batches` table view with a 3-column kanban (Rencana / Berjalan / Selesai) showing product photo, name, base SKU, and variant count per card, with a read-only modal listing variants + stock.

**Architecture:** Server-rendered EJS. The index route runs ONE combined SQL query (batch ⨝ product ⨝ primary photo ⨝ first variant ⨝ variant count). Card click opens an in-page modal that lazy-fetches `GET /:id/variants` (JSON) with vanilla JS. No framework, no drag & drop.

**Tech Stack:** Node v24, Express 5, EJS + express-ejs-layouts, `pg` against Supabase Postgres, Jest with isolated `test` schema.

**Spec:** `docs/superpowers/specs/2026-08-13-kanban-produksi-design.md`

## Global Constraints

- **Zero schema change** — no migrations, no new tables/columns.
- **No new dependencies** — endpoint tests use Node 24 global `fetch` + a real Express mini-app (no supertest).
- **Scope lock** — no drag & drop, no filter/search, no edit/delete on card or modal, no changes to any other page/route/form.
- Theme: **light** (abu terang background is already the layout's `bg-gray-100`; cards white). Kanban CSS lives inside `views/production-batches/index.ejs` only — do NOT touch `views/layout.ejs`.
- Card order inside a column: `created_at DESC` (same as the table today). Columns fixed: `planned`→🗓 Rencana (abu), `in_progress`→🔨 Berjalan (amber), `completed`→✅ Selesai (hijau).
- Photo URL pattern: `/uploads/<file_path>` (same as `views/products/show.ejs`). No photo → 👕 placeholder. No variants → badge `👕 0 variasi`.
- `+ Buat Batch` button stays in the page header, admin-only, exactly as today.
- **Known pitfall (regressions 2026-07-17/21):** inside EJS `<script>` blocks NEVER use `${...}` template literals — EJS strips/escapes them. Use string concatenation only. All JS below follows this.
- `COUNT(*)` from `pg` arrives as a **string** — tests must `parseInt()`; views render it as-is.
- Tests run against the `test` schema: global `beforeEach` (tests/setup.js) truncates ALL tables with `RESTART IDENTITY CASCADE` (sequences reset, so explicit `id=1,2,3` inserts are deterministic). Seed with explicit `test.`-prefixed table names.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `routes/production-batches.js` | Modify | Extend index query (foto/sku/jumlah variasi); add `GET /:id/variants` JSON endpoint |
| `views/production-batches/index.ejs` | Rewrite | Kanban board (columns + cards + modal + scoped CSS + vanilla JS) |
| `tests/productionBatches.test.js` | Create | Tests for the kanban query + the variants endpoint |

---

### Task 1: Kanban index query + `/variants` endpoint (TDD)

**Files:**
- Create: `tests/productionBatches.test.js`
- Modify: `routes/production-batches.js` (index handler lines 11-20; new route inserted after the `GET /:id` handler, i.e. after line 64)

**Interfaces:**
- Consumes: `db.query` / `db.one` from `../db`; `isAuthenticated` from `../middleware/auth`; tables `production_batches`, `products`, `vendors`, `product_photos`, `product_variants` (shapes in `db.js` `bootstrapSchema`).
- Produces for Task 2: index route renders `production-batches/index` with `batches[]` where each row has everything it had before (`pb.*`, `nama_produk`, `vendor_nama`) **plus** `foto_path` (TEXT or NULL), `sku_dasar` (TEXT or NULL), `jumlah_variasi` (string count). Endpoint contract: `GET /production-batches/:id/variants` → `200 { batch: { id, nama_batch, nama_produk }, variants: [{ sku, warna, size, stok }] }` (variants sorted `warna, size`) or `404 { ok: false, error: 'Batch tidak ditemukan' }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/productionBatches.test.js`:

```js
const db = require('../db');

// Must stay identical to the SQL in GET / (routes/production-batches.js).
const KANBAN_QUERY = `
  SELECT pb.*, p.nama_produk, v.nama AS vendor_nama,
         ph.file_path AS foto_path,
         pv.sku AS sku_dasar,
         COALESCE(vc.jumlah, 0) AS jumlah_variasi
  FROM production_batches pb
  LEFT JOIN products p ON pb.product_id = p.id
  LEFT JOIN vendors v ON pb.vendor_id = v.id
  LEFT JOIN product_photos ph
    ON ph.id = (SELECT p2.id FROM product_photos p2
                WHERE p2.product_id = pb.product_id
                ORDER BY p2.is_primary DESC, p2.id ASC LIMIT 1)
  LEFT JOIN product_variants pv
    ON pv.id = (SELECT p3.id FROM product_variants p3
                WHERE p3.product_id = pb.product_id
                ORDER BY p3.id ASC LIMIT 1)
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS jumlah FROM product_variants GROUP BY product_id
  ) vc ON vc.product_id = pb.product_id
  ORDER BY pb.created_at DESC
`;

describe('kanban index query', () => {
  beforeEach(async () => {
    await db.query(`INSERT INTO test.products (id, nama_produk, tipe_produksi) VALUES
      (1, 'Kaos Polos', 'sendiri'),
      (2, 'Kemeja Batik', 'sendiri'),
      (3, 'Celana Chino', 'sendiri')`);
    // Product 1: 3 variants + 2 photos (primary is id=2).
    await db.query(`INSERT INTO test.product_variants (id, product_id, warna, size, sku, stok) VALUES
      (1, 1, 'Merah', 'M', 'KP-RED-M', 5),
      (2, 1, 'Biru', 'L', 'KP-BLU-L', 7),
      (3, 1, 'Merah', 'S', 'KP-RED-S', 2)`);
    await db.query(`INSERT INTO test.product_photos (id, product_id, file_path, is_primary) VALUES
      (1, 1, 'kaos-a.jpg', 0),
      (2, 1, 'kaos-b.jpg', 1)`);
    // Product 2: 1 variant, 1 photo WITHOUT is_primary (fallback = smallest id).
    await db.query(`INSERT INTO test.product_variants (id, product_id, warna, size, sku, stok) VALUES
      (4, 2, 'Hitam', 'L', 'KB-BLK-L', 9)`);
    await db.query(`INSERT INTO test.product_photos (id, product_id, file_path, is_primary) VALUES
      (3, 2, 'batik-a.jpg', 0)`);
    // Product 3: NO variants, NO photos.
    await db.query(`INSERT INTO test.production_batches (id, product_id, nama_batch, tgl_mulai, jenis_produksi, jumlah_dipesan, status, created_at) VALUES
      (1, 1, 'Batch Kaos 1', '2026-08-01', 'in_house', 10, 'planned', '2026-08-01 10:00:00'),
      (2, 2, 'Batch Batik 1', '2026-08-02', 'konveksi', 20, 'in_progress', '2026-08-02 10:00:00'),
      (3, 3, 'Batch Chino 1', '2026-08-03', 'in_house', 30, 'completed', '2026-08-03 10:00:00')`);
  });

  test('foto utama = is_primary DESC lalu id ASC; sku dasar = varian id terkecil; jumlah variasi benar', async () => {
    const rows = (await db.query(KANBAN_QUERY)).rows;
    expect(rows).toHaveLength(3);
    const kaos = rows.find(r => r.product_id === 1);
    expect(kaos.nama_produk).toBe('Kaos Polos');
    expect(kaos.foto_path).toBe('kaos-b.jpg');   // id=2 is_primary=1 wins over id=1
    expect(kaos.sku_dasar).toBe('KP-RED-M');     // variant id=1
    expect(parseInt(kaos.jumlah_variasi)).toBe(3);
    expect(kaos.status).toBe('planned');
  });

  test('tanpa foto primary: pakai foto id terkecil', async () => {
    const rows = (await db.query(KANBAN_QUERY)).rows;
    const batik = rows.find(r => r.product_id === 2);
    expect(batik.foto_path).toBe('batik-a.jpg');
    expect(batik.sku_dasar).toBe('KB-BLK-L');
    expect(parseInt(batik.jumlah_variasi)).toBe(1);
  });

  test('produk tanpa foto dan tanpa variasi: foto_path null, sku_dasar null, jumlah 0', async () => {
    const rows = (await db.query(KANBAN_QUERY)).rows;
    const chino = rows.find(r => r.product_id === 3);
    expect(chino.foto_path).toBeNull();
    expect(chino.sku_dasar).toBeNull();
    expect(parseInt(chino.jumlah_variasi)).toBe(0);
  });

  test('urutan created_at DESC', async () => {
    const rows = (await db.query(KANBAN_QUERY)).rows;
    expect(rows.map(r => r.id)).toEqual([3, 2, 1]);
  });
});

describe('GET /production-batches/:id/variants', () => {
  const express = require('express');
  const session = require('express-session');
  let app;

  const getJSON = async (path) => {
    const port = app.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: 'manual',
      headers: { cookie: 'connect.sid=s%3Atest-sid.signature' },
    });
    return { status: r.status, body: await r.json() };
  };

  beforeAll(async () => {
    const router = require('../routes/production-batches');
    app = express();
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
    app.use('/production-batches', router);
    await new Promise(resolve => { app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise(resolve => app.close(resolve));
  });

  beforeEach(async () => {
    await db.query(`INSERT INTO test.users (id, username, password, role) VALUES (1, 'admin', 'x', 'admin')`);
    await db.query(`INSERT INTO test.products (id, nama_produk, tipe_produksi) VALUES (1, 'Kaos Polos', 'sendiri')`);
    await db.query(`INSERT INTO test.product_variants (id, product_id, warna, size, sku, stok) VALUES
      (1, 1, 'Merah', 'M', 'KP-RED-M', 5),
      (2, 1, 'Biru', 'L', 'KP-BLU-L', 7),
      (3, 1, 'Merah', 'S', 'KP-RED-S', 2)`);
    await db.query(`INSERT INTO test.production_batches (id, product_id, nama_batch, tgl_mulai, jenis_produksi, jumlah_dipesan) VALUES
      (1, 1, 'Batch Kaos 1', '2026-08-01', 'in_house', 10)`);
    // Fake authenticated session directly in the (truncated) session table.
    await db.query(
      `INSERT INTO test.session (sid, sess, expire) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      ['test-sid', JSON.stringify({
        cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: '/' },
        userId: 1,
      })]
    );
  });

  test('returns batch + variants ordered by warna, size', async () => {
    const { status, body } = await getJSON('/production-batches/1/variants');
    expect(status).toBe(200);
    expect(body.batch).toEqual({ id: 1, nama_batch: 'Batch Kaos 1', nama_produk: 'Kaos Polos' });
    expect(body.variants).toEqual([
      { sku: 'KP-BLU-L', warna: 'Biru', size: 'L', stok: 7 },
      { sku: 'KP-RED-M', warna: 'Merah', size: 'M', stok: 5 },
      { sku: 'KP-RED-S', warna: 'Merah', size: 'S', stok: 2 },
    ]);
  });

  test('batch tidak dikenal → 404 JSON', async () => {
    const { status, body } = await getJSON('/production-batches/999/variants');
    expect(status).toBe(404);
    expect(body).toEqual({ ok: false, error: 'Batch tidak ditemukan' });
  });

  test('tanpa session → redirect /login', async () => {
    const port = app.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/production-batches/1/variants`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/productionBatches.test.js`
Expected: FAIL — index-query tests fail because `foto_path`/`sku_dasar`/`jumlah_variasi` columns don't exist yet in the route's SQL (the tests run `KANBAN_QUERY` directly against the seeded `test` schema, so the four *query* tests actually **PASS** at this point if the SQL is correct; that is fine — the important red tests are the three endpoint tests, which must fail with `Cannot GET /production-batches/1/variants` / 404-from-router). If the query tests already pass, treat them as the green baseline and move on.

- [ ] **Step 3: Implement the route changes**

In `routes/production-batches.js`, replace the `GET /` handler query:

```js
router.get('/', isAuthenticated, async (req, res) => {
  const batches = (await db.query(`
    SELECT pb.*, p.nama_produk, v.nama AS vendor_nama,
           ph.file_path AS foto_path,
           pv.sku AS sku_dasar,
           COALESCE(vc.jumlah, 0) AS jumlah_variasi
    FROM production_batches pb
    LEFT JOIN products p ON pb.product_id = p.id
    LEFT JOIN vendors v ON pb.vendor_id = v.id
    LEFT JOIN product_photos ph
      ON ph.id = (SELECT p2.id FROM product_photos p2
                  WHERE p2.product_id = pb.product_id
                  ORDER BY p2.is_primary DESC, p2.id ASC LIMIT 1)
    LEFT JOIN product_variants pv
      ON pv.id = (SELECT p3.id FROM product_variants p3
                  WHERE p3.product_id = pb.product_id
                  ORDER BY p3.id ASC LIMIT 1)
    LEFT JOIN (
      SELECT product_id, COUNT(*) AS jumlah FROM product_variants GROUP BY product_id
    ) vc ON vc.product_id = pb.product_id
    ORDER BY pb.created_at DESC
  `)).rows;
  res.render('production-batches/index', { title: 'Batch Produksi', batches, error: null });
});
```

Then insert the new endpoint immediately **after** the existing `GET /:id` handler (after line 64's closing `});`):

```js
router.get('/:id/variants', isAuthenticated, async (req, res) => {
  const batch = await db.one(`
    SELECT pb.id, pb.nama_batch, pb.product_id, p.nama_produk
    FROM production_batches pb
    LEFT JOIN products p ON pb.product_id = p.id
    WHERE pb.id = $1
  `, [req.params.id]);
  if (!batch) return res.status(404).json({ ok: false, error: 'Batch tidak ditemukan' });
  const variants = (await db.query(
    'SELECT sku, warna, size, stok FROM product_variants WHERE product_id = $1 ORDER BY warna, size',
    [batch.product_id]
  )).rows;
  res.json({ batch: { id: batch.id, nama_batch: batch.nama_batch, nama_produk: batch.nama_produk }, variants });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/productionBatches.test.js`
Expected: all 7 tests PASS.

Then run the full suite to make sure nothing regressed:

Run: `npx jest`
Expected: all tests PASS (fifoService + productionBatches).

- [ ] **Step 5: Commit**

```bash
git add tests/productionBatches.test.js routes/production-batches.js
git commit -m "feat: query kanban index (foto/sku/jumlah variasi) + endpoint GET /:id/variants"
```

---

### Task 2: Kanban view (`views/production-batches/index.ejs` rewrite)

**Files:**
- Modify (full rewrite): `views/production-batches/index.ejs`

**Interfaces:**
- Consumes: route locals from Task 1 — `{ title, batches, error }`; `batches[]` rows: `id, nama_batch, status, nama_produk, vendor_nama, foto_path, sku_dasar, jumlah_variasi` (+ the rest of `pb.*`). `res.locals.user` (from `index.js`) for the admin check.
- Produces for Task 3/verification: rendered kanban board; modal fetches `/production-batches/<id>/variants` (Task 1 contract).

Notes for the implementer:
- The whole file below is the new content of `views/production-batches/index.ejs` (it renders inside `views/layout.ejs`'s `<main>` via `<%- body %>`; the inline `<style>` and `<script>` ride along in the body — there is no separate script block in the layout, and this is the intended pattern here).
- Plain CSS only — the Tailwind CDN script in the layout is not reliable for new classes (past bug: `@apply` broke on CDN Tailwind). Do not add Tailwind classes to the new markup.
- NO `${...}` inside the `<script>` block — string concatenation only (Global Constraints).

- [ ] **Step 1: Rewrite the view**

Replace the entire content of `views/production-batches/index.ejs` with:

```html
<style>
  .kanban-wrap { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; align-items:start; }
  @media (max-width:768px) { .kanban-wrap { grid-template-columns:1fr; } }
  .kanban-col { background:#eef1f5; border-radius:12px; padding:0.75rem; }
  .kanban-col-header { display:flex; align-items:center; gap:0.5rem; padding:0.25rem 0.5rem 0.75rem; font-weight:700; color:#111827; font-size:0.95rem; }
  .kanban-col-accent { width:4px; min-height:1.25rem; border-radius:2px; }
  .kanban-count { margin-left:auto; background:#fff; color:#374151; border-radius:9999px; padding:0.1rem 0.6rem; font-size:0.75rem; font-weight:600; }
  .kanban-card { display:block; width:100%; background:#fff; border:none; padding:0; margin:0; text-align:left; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); overflow:hidden; cursor:pointer; transition:box-shadow 150ms, transform 150ms; }
  .kanban-card:hover { box-shadow:0 4px 12px rgba(0,0,0,0.15); transform:translateY(-2px); }
  .kanban-card + .kanban-card { margin-top:0.75rem; }
  .kanban-foto { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; background:#f3f4f6; }
  .kanban-foto-placeholder { width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; font-size:3rem; background:#f3f4f6; }
  .kanban-body { padding:0.75rem; }
  .kanban-nama { font-weight:700; font-size:1rem; color:#111827; margin:0 0 0.15rem; }
  .kanban-sku { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:0.72rem; color:#6b7280; }
  .kanban-badge { display:inline-block; margin-top:0.6rem; background:#f3f4f6; color:#374151; border-radius:9999px; padding:0.15rem 0.6rem; font-size:0.75rem; }
  .kanban-empty { color:#9ca3af; font-size:0.85rem; text-align:center; padding:1.5rem 0.5rem; }
  .kb-modal-backdrop { position:fixed; inset:0; background:rgba(17,24,39,0.5); display:none; align-items:center; justify-content:center; z-index:50; padding:1rem; }
  .kb-modal-backdrop.open { display:flex; }
  .kb-modal { background:#fff; border-radius:12px; max-width:34rem; width:100%; max-height:85vh; overflow-y:auto; box-shadow:0 20px 40px rgba(0,0,0,0.25); }
  .kb-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid #f3f4f6; }
  .kb-modal-body { padding:1rem 1.25rem; }
  .kb-modal-table { width:100%; font-size:0.85rem; border-collapse:collapse; }
  .kb-modal-table th { text-align:left; color:#6b7280; font-size:0.7rem; text-transform:uppercase; padding:0.5rem; border-bottom:1px solid #e5e7eb; }
  .kb-modal-table td { padding:0.5rem; border-bottom:1px solid #f3f4f6; color:#374151; }
  .kb-close { background:transparent; border:none; font-size:1.25rem; cursor:pointer; color:#6b7280; line-height:1; }
</style>

<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
  <h1 style="font-size:1.5rem; font-weight:700; color:#111827; margin:0;">Batch Produksi</h1>
  <% if (locals.user && user.role === 'admin') { %>
    <a href="/production-batches/create" style="background:#4f46e5; color:#fff; padding:0.625rem 1rem; border-radius:0.5rem; font-size:0.875rem; text-decoration:none;">+ Buat Batch</a>
  <% } %>
</div>

<div class="kanban-wrap">
  <% const kolom = [
    { status: 'planned',     emoji: '🗓', label: 'Rencana',  accent: '#9ca3af' },
    { status: 'in_progress', emoji: '🔨', label: 'Berjalan', accent: '#f59e0b' },
    { status: 'completed',   emoji: '✅', label: 'Selesai',  accent: '#10b981' },
  ]; %>
  <% kolom.forEach(k => { const daftar = batches.filter(b => b.status === k.status); %>
  <section class="kanban-col">
    <div class="kanban-col-header">
      <span class="kanban-col-accent" style="background:<%= k.accent %>;"></span>
      <span><%= k.emoji %> <%= k.label %></span>
      <span class="kanban-count"><%= daftar.length %></span>
    </div>
    <% if (daftar.length === 0) { %>
      <div class="kanban-empty">Belum ada batch</div>
    <% } %>
    <% daftar.forEach(b => { %>
    <button type="button" class="kanban-card"
            data-batch-id="<%= b.id %>"
            data-sku="<%= b.sku_dasar || '' %>"
            data-variasi="<%= b.jumlah_variasi %>">
      <% if (b.foto_path) { %>
        <img class="kanban-foto" src="/uploads/<%= b.foto_path %>" alt="<%= b.nama_produk %>" loading="lazy">
      <% } else { %>
        <div class="kanban-foto-placeholder">👕</div>
      <% } %>
      <div class="kanban-body">
        <div class="kanban-nama"><%= b.nama_produk %></div>
        <div class="kanban-sku"><%= b.sku_dasar || '—' %></div>
        <div class="kanban-badge">👕 <%= b.jumlah_variasi %> variasi</div>
      </div>
    </button>
    <% }) %>
  </section>
  <% }) %>
</div>

<div class="kb-modal-backdrop" id="kb-backdrop">
  <div class="kb-modal" role="dialog" aria-modal="true" aria-labelledby="kb-title">
    <div class="kb-modal-header">
      <div>
        <div id="kb-title" style="font-weight:700; font-size:1.05rem; color:#111827;"></div>
        <div id="kb-subtitle" style="font-size:0.78rem; color:#6b7280; margin-top:0.15rem;"></div>
      </div>
      <button type="button" class="kb-close" id="kb-close" aria-label="Tutup">✕</button>
    </div>
    <div class="kb-modal-body">
      <div id="kb-loading" style="display:none; text-align:center; color:#6b7280; padding:1rem;">Memuat variasi…</div>
      <div id="kb-error" style="display:none; text-align:center; padding:1rem;">
        <div style="color:#991b1b; margin-bottom:0.5rem;">Gagal memuat variasi.</div>
        <button type="button" id="kb-retry" style="background:#4f46e5; color:#fff; border:none; border-radius:0.5rem; padding:0.4rem 1rem; cursor:pointer;">Coba lagi</button>
      </div>
      <div id="kb-content" style="display:none;">
        <table class="kb-modal-table">
          <thead><tr><th>SKU</th><th>Warna</th><th>Size</th><th style="text-align:right;">Stok</th></tr></thead>
          <tbody id="kb-rows"></tbody>
        </table>
        <div id="kb-empty-msg" style="display:none; color:#9ca3af; text-align:center; padding:1rem;">Belum ada variasi</div>
      </div>
      <div style="margin-top:1rem; text-align:right;">
        <a id="kb-detail-link" href="#" style="color:#4f46e5; font-size:0.85rem; text-decoration:none; font-weight:600;">Buka Detail Batch →</a>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  var backdrop = document.getElementById('kb-backdrop');
  var rowsEl = document.getElementById('kb-rows');
  var loadingEl = document.getElementById('kb-loading');
  var errorEl = document.getElementById('kb-error');
  var contentEl = document.getElementById('kb-content');
  var emptyMsg = document.getElementById('kb-empty-msg');
  var currentBatchId = null;

  function openModal() { backdrop.classList.add('open'); }
  function closeModal() { backdrop.classList.remove('open'); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadVariants(batchId) {
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    contentEl.style.display = 'none';
    fetch('/production-batches/' + batchId + '/variants', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        document.getElementById('kb-title').textContent = data.batch.nama_produk || '';
        document.getElementById('kb-subtitle').textContent = 'Batch: ' + data.batch.nama_batch;
        document.getElementById('kb-detail-link').href = '/production-batches/' + data.batch.id;
        rowsEl.innerHTML = '';
        if (!data.variants.length) {
          emptyMsg.style.display = 'block';
        } else {
          emptyMsg.style.display = 'none';
          data.variants.forEach(function (v) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td style="font-family:ui-monospace,Menlo,monospace;">' + esc(v.sku) + '</td>'
              + '<td>' + esc(v.warna) + '</td>'
              + '<td>' + esc(v.size) + '</td>'
              + '<td style="text-align:right;">' + esc(v.stok) + '</td>';
            rowsEl.appendChild(tr);
          });
        }
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
      })
      .catch(function () {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
      });
  }

  document.querySelectorAll('.kanban-card').forEach(function (card) {
    card.addEventListener('click', function () {
      currentBatchId = card.getAttribute('data-batch-id');
      var sku = card.getAttribute('data-sku');
      var variasi = card.getAttribute('data-variasi');
      document.getElementById('kb-subtitle').textContent =
        (sku || 'Tanpa SKU') + ' · ' + variasi + ' variasi';
      openModal();
      loadVariants(currentBatchId);
    });
  });

  document.getElementById('kb-close').addEventListener('click', closeModal);
  document.getElementById('kb-retry').addEventListener('click', function () {
    if (currentBatchId) loadVariants(currentBatchId);
  });
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
})();
</script>
```

- [ ] **Step 2: Boot and smoke-test manually**

Run: `npm start` (server logs `Server running at http://localhost:3000`).
In a browser: log in (admin), open `/production-batches`. Check:
1. Three columns render (🗓 Rencana / 🔨 Berjalan / ✅ Selesai) with counts; empty columns show "Belum ada batch".
2. Cards show photo (or 👕 placeholder), product name, base SKU, `👕 N variasi` badge.
3. Click a card → modal opens, shows loading → variant table (SKU · Warna · Size · Stok), subtitle `SKU · N variasi`, and "Buka Detail Batch →" links to `/production-batches/<id>`.
4. Close via ✕, backdrop click, and Esc.
5. "+ Buat Batch" button visible for admin; page renders inside the normal layout (sidebar intact).

Kill the server afterwards (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add views/production-batches/index.ejs
git commit -m "feat: tampilan kanban batch produksi (kolom rencana/berjalan/selesai + modal variasi)"
```

---

### Task 3: Final verification

**Files:** none modified (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx jest`
Expected: all tests PASS.

- [ ] **Step 2: Spec cross-check**

Re-read `docs/superpowers/specs/2026-08-13-kanban-produksi-design.md` and verify against the implementation:
- Columns & accents per §3.1; cards per §3.2 (foto/nama/SKU/badge order); modal per §3.3 (loading, error+retry, empty state, detail link, 3 close methods); error handling table §4 covered; only the 3 files from §6 changed (`git diff 28aeadc --stat` shows nothing else).

- [ ] **Step 3: Final manual checklist (user-facing)**

Present to the user: app running, `/production-batches` kanban works end-to-end. If the user confirms, done. (No push/PR unless the user asks.)

---

## Self-Review Notes

- Spec coverage: §2.1 → Task 1 (query + tests); §2.2 → Task 1 (endpoint + tests); §3 → Task 2; §4 → Task 2 markup (placeholder/badge/error/retry) + Task 1 tests (404); §5 → tests in Task 1; §6 → file list matches; §7 maintainability — CSS/markup/JS all in `index.ejs`, no framework ✓.
- Type consistency: `foto_path` / `sku_dasar` / `jumlah_variasi` names identical across Task 1 SQL, Task 1 tests, Task 2 view. Endpoint JSON shape identical across route, tests, and the modal's JS consumer.
- No placeholders left; all code blocks complete.
