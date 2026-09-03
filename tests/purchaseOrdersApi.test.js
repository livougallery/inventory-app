/**
 * Test JSON API /api/purchase-orders (features/purchase-order/backend/routes.js).
 *
 * Mengikuti pola tests/vendorsApi.test.js: mini Express app dengan MemoryStore
 * session + SID palsu yang sudah ter-auth, lalu fetch ke 127.0.0.1. Skema `test`
 * (tests/setup.js) men-truncate semua tabel sebelum tiap test, jadi tiap test
 * menanam datanya sendiri dan id selalu mulai dari 1.
 *
 * Tiket 05 membuat data bisa DIBACA; tiket 06 menambah create. Semua test
 * create berada di describe 'POST /' dan memakai token CSRF fresh.
 */
const db = require('../db');

const SECRET = 'test-secret-po';
const SID = 'po-sid';

// Signed cookie ala cookie-signature: HMAC-SHA256(sid, secret), '=' dibuang.
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('JSON API /api/purchase-orders', () => {
  const express = require('express');
  const session = require('express-session');
  let app;
  let server;
  let store;

  const call = async (method, path, { headers, body, auth = true } = {}) => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(auth ? { cookie: AUTH_COOKIE } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* non-JSON */ }
    return { status: r.status, body: json, contentType: r.headers.get('content-type') };
  };

  // Token CSRF selalu fresh sebelum mutasi: server merotasi token tiap sukses,
  // jadi memakai token yang sama dua kali akan gagal pada percobaan kedua.
  const getToken = async () => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/__token`, { headers: { cookie: AUTH_COOKIE } });
    return (await r.json()).t;
  };

  // POST dengan token CSRF fresh — jalur normal klien React (lib/api.withCsrf).
  const post = (path, body) =>
    getToken().then((t) =>
      call('POST', path, { body, headers: { 'x-csrf-token': t } })
    );

  // PUT/DELETE dengan token fresh. Dipakai tiket 07 (ubah & hapus PO).
  const mutate = (method, path, body) =>
    getToken().then((t) =>
      call(method, path, { body, headers: { 'x-csrf-token': t } })
    );

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    // Endpoint khusus test untuk membaca token dari res.locals.
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    app.use('/purchase-orders', require('../features/purchase-order/backend/routes'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Session palsu yang sudah ter-auth. Role bisa diganti untuk menguji bahwa
  // pembacaan tidak dibatasi ke admin saja (AC: role non-admin tetap bisa lihat).
  const setSession = (overrides = {}) =>
    new Promise((resolve, reject) => {
      store.set(SID, {
        cookie: {
          originalMaxAge: 3600000,
          expires: new Date(Date.now() + 3600000).toISOString(),
          httpOnly: true,
          path: '/',
        },
        userId: 1,
        username: 'admin',
        role: 'admin',
        ...overrides,
      }, (err) => (err ? reject(err) : resolve()));
    });

  beforeEach(async () => {
    await setSession();
  });

  // ----- Seed helpers -----

  const seedUser = (id, username, role) =>
    db.query(
      `INSERT INTO users (id, username, password, role) VALUES ($1, $2, 'x', $3)`,
      [id, username, role]
    );

  const seedVendor = (id, nama, tipe = 'bahan_baku') =>
    db.query(
      `INSERT INTO vendors (id, nama, tipe) VALUES ($1, $2, $3)`,
      [id, nama, tipe]
    );

  const seedMaterial = (id, nama, satuan) =>
    db.query(
      `INSERT INTO raw_materials (id, nama, tipe, satuan) VALUES ($1, $2, 'kain_roll', $3)`,
      [id, nama, satuan]
    );

  const seedCurrency = (id, kode, nama, simbol) =>
    db.query(
      `INSERT INTO currencies (id, kode, nama, simbol, is_active) VALUES ($1, $2, $3, $4, 1)`,
      [id, kode, nama, simbol]
    );

  const seedVariant = (id, materialId, namaVarian) =>
    db.query(
      `INSERT INTO raw_material_variants (id, raw_material_id, nama_varian, stok, satuan)
       VALUES ($1, $2, $3, 0, 'm')`,
      [id, materialId, namaVarian]
    );

  // Stok awal material, supaya test bisa membedakan "stok bertambah" dari
  // "stok menjadi sekian". Tanpa nilai awal bukan nol, PO dengan qty kecil
  // bisa lolos walau stok tidak pernah disentuh — misalnya kalau stok
  // di-SET alih-alih di-INCREMENT.
  const setStok = (materialId, nilai) =>
    db.query('UPDATE raw_materials SET stok = $1 WHERE id = $2', [nilai, materialId]);

  const stokOf = async (materialId) => {
    const r = await db.query('SELECT stok FROM raw_materials WHERE id = $1', [materialId]);
    return Number(r.rows[0].stok);
  };

  // Status PO, batch, dan pergerakan dibaca sekaligus. STOK TIDAK termasuk:
  // ia dibaca terpisah lewat stokOf(), karena nilainya per-material sedangkan
  // ketiga tabel ini per-PO. Nama lama 'jejakStok' menyesatkan — tidak ada
  // stok di sini.
  //
  // Dipakai untuk menegaskan penolakan tidak menyentuh apa-apa, dan bahwa
  // kegagalan di tengah validasi membatalkan semuanya.
  const jejakValidasi = async (poId) => {
    const po = (await db.query(
      'SELECT status, validated_by, catatan_reject FROM purchase_orders WHERE id = $1', [poId]
    )).rows[0];
    const batches = (await db.query('SELECT * FROM material_batches')).rows;
    const movements = (await db.query('SELECT * FROM stock_movements')).rows;
    return { po, batches, movements };
  };

  // createdAt opsional — dipakai untuk menguji urutan "terbaru dulu" tanpa
  // bergantung pada CURRENT_TIMESTAMP yang bisa identik antar baris.
  const seedPo = async ({
    vendorId = 1,
    noPo = 'PO-001',
    tglBeli = '2026-08-31',
    createdBy = 1,
    status = 'pending',
    createdAt = null,
  } = {}) => {
    const r = await db.query(
      `INSERT INTO purchase_orders (vendor_id, no_po, tgl_beli, created_by, status, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, CURRENT_TIMESTAMP))
       RETURNING id`,
      [vendorId, noPo, tglBeli, createdBy, status, createdAt]
    );
    return r.rows[0].id;
  };

  const seedItem = (poId, { materialId = 1, qty = 5, harga = 1000 } = {}) =>
    db.query(
      `INSERT INTO purchase_order_items (purchase_order_id, raw_material_id, qty, harga_satuan, subtotal)
       VALUES ($1, $2, $3, $4, $5)`,
      [poId, materialId, qty, harga, qty * harga]
    );

  // Basis minimal: satu user admin, satu vendor, satu material.
  const seedBase = async () => {
    await seedUser(1, 'admin', 'admin');
    await seedVendor(1, 'PT Kain Maju');
    await seedMaterial(1, 'Kain A', 'm');
  };

  // ----- Autentikasi -----

  describe('autentikasi', () => {
    test('GET / tanpa session → 401 JSON, bukan redirect', async () => {
      const { status, body } = await call('GET', '/purchase-orders', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('GET /:id tanpa session → 401 JSON', async () => {
      await seedBase();
      const id = await seedPo();
      const { status, body } = await call('GET', `/purchase-orders/${id}`, { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('role non-admin tetap bisa membaca daftar dan detail', async () => {
      // 'finance' dipakai sebagai contoh non-admin karena CHECK users.role
      // hanya mengizinkan 'admin' dan 'finance' (db.js:123).
      await seedBase();
      await seedUser(2, 'sari', 'finance');
      const id = await seedPo({ createdBy: 2 });
      await setSession({ userId: 2, username: 'sari', role: 'finance' });

      const list = await call('GET', '/purchase-orders');
      expect(list.status).toBe(200);
      expect(list.body.ok).toBe(true);
      expect(list.body.data).toHaveLength(1);

      const detail = await call('GET', `/purchase-orders/${id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.ok).toBe(true);
    });
  });

  // ----- GET / (daftar) -----

  describe('GET /', () => {
    test('daftar kosong → ok dengan array kosong', async () => {
      const { status, body } = await call('GET', '/purchase-orders');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('PO terbaru muncul lebih dulu (created_at berbeda)', async () => {
      await seedBase();
      await seedPo({ noPo: 'PO-LAMA', createdAt: '2026-01-01 10:00:00' });
      await seedPo({ noPo: 'PO-BARU', createdAt: '2026-06-01 10:00:00' });

      const { body } = await call('GET', '/purchase-orders');
      expect(body.data.map((r) => r.no_po)).toEqual(['PO-BARU', 'PO-LAMA']);
    });

    test('created_at kembar → id terbesar lebih dulu (bukan urutan acak)', async () => {
      // Kasus nyata: PO 1-3 di live DB punya created_at identik sampai
      // mikrodetik (hasil migrasi). Tanpa tiebreak, Postgres bebas mengembalikan
      // urutan apa pun — terbukti 1,3,2 di data live.
      await seedBase();
      const t = '2026-07-15 06:53:33';
      await seedPo({ noPo: 'PO-A', createdAt: t });
      await seedPo({ noPo: 'PO-B', createdAt: t });
      await seedPo({ noPo: 'PO-C', createdAt: t });

      const { body } = await call('GET', '/purchase-orders');
      expect(body.data.map((r) => r.no_po)).toEqual(['PO-C', 'PO-B', 'PO-A']);
    });

    test('tiap baris membawa no_po, nama vendor, tanggal, status, nama pembuat, total', async () => {
      await seedBase();
      await seedUser(2, 'budi', 'finance');
      await seedVendor(2, 'PT Sutra Jaya');
      const id = await seedPo({ vendorId: 2, noPo: 'PO-777', tglBeli: '2026-05-20', createdBy: 2, status: 'validated' });
      await seedItem(id, { qty: 5, harga: 1000 });

      const { body } = await call('GET', '/purchase-orders');
      const row = body.data[0];
      expect(row.id).toBe(id);
      expect(row.no_po).toBe('PO-777');
      // Nama vendor yang di-join, bukan id mentah.
      expect(row.vendor_nama).toBe('PT Sutra Jaya');
      expect(row.tgl_beli).toBe('2026-05-20');
      expect(row.status).toBe('validated');
      expect(row.creator_name).toBe('budi');
      expect(row.total).toBe(5000);
    });

    test('total dihitung dari jumlah semua baris item', async () => {
      await seedBase();
      const id = await seedPo();
      await seedItem(id, { qty: 5, harga: 1000 });  // 5000
      await seedItem(id, { qty: 3, harga: 1500 });  // 4500

      const { body } = await call('GET', '/purchase-orders');
      expect(body.data[0].total).toBe(9500);
    });

    test('PO tanpa item → total 0, bukan null', async () => {
      await seedBase();
      await seedPo();

      const { body } = await call('GET', '/purchase-orders');
      expect(body.data[0].total).toBe(0);
      expect(body.data[0].total).not.toBeNull();
    });
  });

  // ----- GET /:id (detail) -----

  describe('GET /:id', () => {
    test('id tidak dikenal → 404 JSON, bukan HTML dan bukan redirect', async () => {
      await seedBase();
      const { status, body, contentType } = await call('GET', '/purchase-orders/999');
      expect(status).toBe(404);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
      expect(contentType).toMatch(/application\/json/);
    });

    test('id bukan angka → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status, body } = await call('GET', '/purchase-orders/abc');
      expect(status).toBe(404);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('detail mengembalikan PO beserta semua baris itemnya', async () => {
      await seedBase();
      await seedMaterial(2, 'Kancing B', 'pcs');
      const id = await seedPo({ noPo: 'PO-DETAIL', vendorId: 1 });
      await seedItem(id, { materialId: 1, qty: 5, harga: 1000 });
      await seedItem(id, { materialId: 2, qty: 10, harga: 250 });

      const { status, body } = await call('GET', `/purchase-orders/${id}`);
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.no_po).toBe('PO-DETAIL');
      expect(body.data.vendor_nama).toBe('PT Kain Maju');
      expect(body.data.items).toHaveLength(2);
    });

    test('tiap item membawa nama material dan satuan, selain qty/harga/subtotal', async () => {
      await seedBase();
      const id = await seedPo();
      await seedItem(id, { materialId: 1, qty: 4, harga: 2000 });

      const { body } = await call('GET', `/purchase-orders/${id}`);
      const item = body.data.items[0];
      expect(item.material_nama).toBe('Kain A');
      expect(item.satuan).toBe('m');
      expect(item.qty).toBe(4);
      expect(item.harga_satuan).toBe(2000);
      expect(item.subtotal).toBe(8000);
    });

    test('PO tanpa item → items array kosong', async () => {
      await seedBase();
      const id = await seedPo();

      const { status, body } = await call('GET', `/purchase-orders/${id}`);
      expect(status).toBe(200);
      expect(body.data.items).toEqual([]);
    });

    // Detail mengirim id mentah yang dibutuhkan form ubah (tiket 07). Tanpa
    // ini klien harus menebak vendor dari namanya — akan salah begitu ada dua
    // vendor dengan nama sama.
    test('detail mengirim vendor_id, currency_id, dan kurs_amount untuk form ubah', async () => {
      await seedBase();
      await seedCurrency(2, 'THB', 'Thai Baht', '฿');
      const id = await seedPo({ vendorId: 1 });
      await db.query(
        'UPDATE purchase_orders SET currency_id = $1, kurs_amount = $2 WHERE id = $3',
        [2, 470, id]
      );

      const { body } = await call('GET', `/purchase-orders/${id}`);
      expect(body.data.vendor_id).toBe(1);
      expect(body.data.currency_id).toBe(2);
      expect(Number(body.data.kurs_amount)).toBe(470);
    });

    test('tiap item mengirim raw_material_id dan variant_id untuk form ubah', async () => {
      await seedBase();
      await seedVariant(1, 1, 'Putih');
      const id = await seedPo();
      await seedItem(id, { materialId: 1, qty: 5, harga: 1000 });
      await db.query('UPDATE purchase_order_items SET variant_id = $1', [1]);

      const { body } = await call('GET', `/purchase-orders/${id}`);
      expect(body.data.items[0].raw_material_id).toBe(1);
      expect(body.data.items[0].variant_id).toBe(1);
    });

    test('item tanpa varian → variant_id null, bukan 0 dan bukan undefined', async () => {
      await seedBase();
      const id = await seedPo();
      await seedItem(id, { materialId: 1, qty: 5, harga: 1000 });

      const { body } = await call('GET', `/purchase-orders/${id}`);
      expect(body.data.items[0].variant_id).toBeNull();
    });
  });

  // Payload valid minimal: vendor 1, satu item material 1.
  // Didefinisikan di tingkat ini karena dipakai dua describe: POST / (tiket 06)
  // dan PUT & DELETE /:id (tiket 07) — yang butuh PO pending untuk diubah.
  const payload = (overrides = {}) => ({
    vendor_id: 1,
    no_po: 'PO-BARU-001',
    tgl_beli: '2026-09-02',
    items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000 }],
    ...overrides,
  });

  // ----- POST / (buat PO) -----

  describe('POST /', () => {
    // ----- Autentikasi & CSRF -----

    test('tanpa session → 401 JSON, bukan redirect', async () => {
      await seedBase();
      const port = server.address().port;
      const r = await fetch(`http://127.0.0.1:${port}/purchase-orders`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      expect(r.status).toBe(401);
      const body = await r.json();
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('tanpa header CSRF → 403', async () => {
      await seedBase();
      const { status } = await call('POST', '/purchase-orders', { body: payload() });
      expect(status).toBe(403);
    });

    test('token CSRF yang sudah dipakai → 403 pada percobaan kedua (rotasi)', async () => {
      // Server merotasi token tiap mutasi berhasil. Klien yang menyimpan token
      // akan gagal pada mutasi berikutnya — itulah sebabnya lib/api.withCsrf
      // mengambil token fresh tiap kali.
      await seedBase();
      const token = await getToken();
      const first = await call('POST', '/purchase-orders', {
        body: payload({ no_po: 'PO-1' }),
        headers: { 'x-csrf-token': token },
      });
      expect(first.status).toBe(201);

      const second = await call('POST', '/purchase-orders', {
        body: payload({ no_po: 'PO-2' }),
        headers: { 'x-csrf-token': token },
      });
      expect(second.status).toBe(403);
    });

    // ----- Validasi field wajib -----

    test('tanpa vendor_id → 400', async () => {
      await seedBase();
      const p = payload();
      delete p.vendor_id;
      const { status, body } = await post('/purchase-orders', p);
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
    });

    test('tanpa no_po → 400', async () => {
      await seedBase();
      const p = payload();
      delete p.no_po;
      const { status } = await post('/purchase-orders', p);
      expect(status).toBe(400);
    });

    test('tanpa tgl_beli → 400', async () => {
      await seedBase();
      const p = payload();
      delete p.tgl_beli;
      const { status } = await post('/purchase-orders', p);
      expect(status).toBe(400);
    });

    test('vendor_id yang tidak ada → 400, bukan error FK mentah dari database', async () => {
      await seedBase();
      const { status, body } = await post('/purchase-orders', payload({ vendor_id: 999 }));
      expect(status).toBe(400);
      expect(body.error).toMatch(/vendor/i);
    });

    test('items kosong → 400', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({ items: [] }));
      expect(status).toBe(400);
    });

    test('item tanpa material → 400', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ qty: 5, harga_satuan: 1000 }],
      }));
      expect(status).toBe(400);
    });

    test('item dengan material yang tidak ada → 400', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 999, qty: 5, harga_satuan: 1000 }],
      }));
      expect(status).toBe(400);
    });

    test('qty atau harga yang bukan angka → 400, bukan 500', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 1, qty: 'banyak', harga_satuan: 1000 }],
      }));
      expect(status).toBe(400);
    });

    // Item berbentuk aneh harus 400, bukan 500. `raw.raw_material_id` pada null
    // melempar TypeError — dan karena validateCreatePayload dipanggil di LUAR
    // blok try route, error itu tidak pernah ditangkap menjadi 400 sama sekali.
    test('item berupa null → 400, bukan 500', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({ items: [null] }));
      expect(status).toBe(400);
    });

    // Hanya `null` yang benar-benar menuntut penjaga tipe. Bentuk lain
    // (`items: [1]`, `['teks']`, `[[1,2]]`, `items: 'bukan-array'`) sudah gugur
    // lebih dulu oleh `!Array.isArray` atau oleh Number(undefined) → NaN, jadi
    // test untuk bentuk-bentuk itu akan tetap hijau walau penjaganya dihapus —
    // tidak menguji apa pun. Catatan ini sengaja ditinggalkan supaya tidak ada
    // yang menambah test semacam itu nanti.
    test('items berupa string, bukan array → 400, bukan 500', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({ items: 'bukan-array' }));
      expect(status).toBe(400);
    });

    // ----- Subtotal dihitung server -----

    test('subtotal disimpan hasil hitung server (qty x harga), bukan nilai kiriman klien', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000, subtotal: 999999 }],
      }));
      expect(status).toBe(201);

      const rows = (await db.query('SELECT subtotal FROM purchase_order_items')).rows;
      // Klien mengirim 999999 untuk membuktikan nilainya tidak dipercaya.
      expect(Number(rows[0].subtotal)).toBe(5000);
    });

    test('multi-item: tiap baris tersimpan dengan subtotalnya sendiri', async () => {
      await seedBase();
      await seedMaterial(2, 'Kancing B', 'pcs');
      const { status } = await post('/purchase-orders', payload({
        items: [
          { raw_material_id: 1, qty: 5, harga_satuan: 1000 },  // 5000
          { raw_material_id: 2, qty: 3, harga_satuan: 1500 },  // 4500
        ],
      }));
      expect(status).toBe(201);

      const rows = (await db.query(
        'SELECT raw_material_id, subtotal FROM purchase_order_items ORDER BY id'
      )).rows;
      expect(rows.map((r) => Number(r.subtotal))).toEqual([5000, 4500]);
    });

    test('qty dan harga desimal dihitung presisi (bukan pembulatan integer)', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 1, qty: 2.5, harga_satuan: 1000.5 }],
      }));
      expect(status).toBe(201);

      const row = (await db.query('SELECT subtotal FROM purchase_order_items')).rows[0];
      expect(Number(row.subtotal)).toBeCloseTo(2501.25, 2);
    });

    // ----- Varian -----

    test('varian yang sesuai material → tersimpan', async () => {
      await seedBase();
      await seedVariant(1, 1, 'Putih');
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000, variant_id: 1 }],
      }));
      expect(status).toBe(201);

      const row = (await db.query('SELECT variant_id FROM purchase_order_items')).rows[0];
      expect(row.variant_id).toBe(1);
    });

    test('varian milik material LAIN → 400', async () => {
      await seedBase();
      await seedMaterial(2, 'Kancing B', 'pcs');
      await seedVariant(1, 2, 'Varian Milik Material 2');   // punya material 2

      const { status, body } = await post('/purchase-orders', payload({
        // Item memakai material 1, tapi variannya milik material 2.
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000, variant_id: 1 }],
      }));
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
    });

    test('varian yang tidak ada → 400', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000, variant_id: 999 }],
      }));
      expect(status).toBe(400);
    });

    test('varian dihilangkan → variant_id NULL, bukan 0 dan bukan error', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000 }],
      }));
      expect(status).toBe(201);

      const row = (await db.query('SELECT variant_id FROM purchase_order_items')).rows[0];
      expect(row.variant_id).toBeNull();
    });

    // ----- Currency & kurs -----

    test('kurs dihilangkan → tersimpan 1', async () => {
      await seedBase();
      const { status, body } = await post('/purchase-orders', payload());
      expect(status).toBe(201);
      expect(Number(body.data.kurs_amount)).toBe(1);
    });

    test('kurs dikirim → tersimpan apa adanya', async () => {
      await seedBase();
      const { status, body } = await post('/purchase-orders', payload({ kurs_amount: 15500 }));
      expect(status).toBe(201);
      expect(Number(body.data.kurs_amount)).toBe(15500);
    });

    test('currency dikirim → tersimpan, dan tampil di respons saat dibaca ulang', async () => {
      await seedBase();
      await seedCurrency(2, 'THB', 'Thai Baht', '฿');
      const { status } = await post('/purchase-orders', payload({ currency_id: 2, kurs_amount: 470 }));
      expect(status).toBe(201);

      const row = (await db.query('SELECT currency_id, kurs_amount FROM purchase_orders')).rows[0];
      expect(row.currency_id).toBe(2);
      expect(Number(row.kurs_amount)).toBe(470);
    });

    test('currency dihilangkan → currency_id NULL, bukan 0', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload());
      expect(status).toBe(201);

      const row = (await db.query('SELECT currency_id FROM purchase_orders')).rows[0];
      expect(row.currency_id).toBeNull();
    });

    test('currency_id yang tidak ada → 400, bukan error FK mentah dari database', async () => {
      await seedBase();
      const { status, body } = await post('/purchase-orders', payload({ currency_id: 999 }));
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
    });

    test('currency_id bukan angka → 400, bukan 500', async () => {
      await seedBase();
      const { status } = await post('/purchase-orders', payload({ currency_id: 'abc' }));
      expect(status).toBe(400);
    });

    // ----- Status, pembuat, respons -----

    test('PO baru berstatus pending', async () => {
      await seedBase();
      const { status, body } = await post('/purchase-orders', payload());
      expect(status).toBe(201);
      expect(body.data.status).toBe('pending');
    });

    test('pembuat diambil dari sesi, bukan dari body klien', async () => {
      await seedBase();
      await seedUser(2, 'sari', 'finance');
      const { status, body } = await post('/purchase-orders', payload({ created_by: 999 }));
      expect(status).toBe(201);
      // Sesi userId = 1; klaim created_by=999 diabaikan.
      const row = (await db.query('SELECT created_by FROM purchase_orders')).rows[0];
      expect(row.created_by).toBe(1);
      expect(body.data.created_by).toBe(1);
    });

    test('respons 201 berisi PO yang dibuat, lengkap dengan id', async () => {
      await seedBase();
      const { status, body, contentType } = await post('/purchase-orders', payload());
      expect(status).toBe(201);
      expect(contentType).toMatch(/application\/json/);
      expect(body.ok).toBe(true);
      expect(typeof body.data.id).toBe('number');
      expect(body.data.no_po).toBe('PO-BARU-001');
      expect(body.data.status).toBe('pending');
    });

    test('PO yang dibuat langsung terbaca lagi lewat GET /:id beserta itemnya', async () => {
      await seedBase();
      const { body } = await post('/purchase-orders', payload());
      const id = body.data.id;

      const detail = await call('GET', `/purchase-orders/${id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.no_po).toBe('PO-BARU-001');
      expect(detail.body.data.items).toHaveLength(1);
      expect(detail.body.data.items[0].material_nama).toBe('Kain A');
      expect(Number(detail.body.data.items[0].subtotal)).toBe(5000);
      expect(Number(detail.body.data.total)).toBe(5000);
    });

    test('PO yang dibuat muncul di daftar GET /', async () => {
      await seedBase();
      await post('/purchase-orders', payload({ no_po: 'PO-MUNCUL' }));

      const { body } = await call('GET', '/purchase-orders');
      expect(body.data.map((r) => r.no_po)).toContain('PO-MUNCUL');
    });

    test('vendor dilaporkan lewat nama yang di-join pada respons', async () => {
      await seedBase();
      const { body } = await post('/purchase-orders', payload());
      expect(body.data.vendor_nama).toBe('PT Kain Maju');
    });

    // ----- Kegagalan tidak boleh meninggalkan data setengah jadi -----

    test('item kedua tidak valid → tidak ada PO dan item yang tersimpan sama sekali', async () => {
      // Tanpa transaksi, item pertama akan tersimpan lalu PO gagal di tengah
      // jalan, meninggalkan baris yatim.
      await seedBase();
      await seedMaterial(2, 'Kancing B', 'pcs');
      await post('/purchase-orders', payload({
        items: [
          { raw_material_id: 1, qty: 5, harga_satuan: 1000 },  // valid
          { raw_material_id: 999, qty: 1, harga_satuan: 1 },   // material fiktif
        ],
      }));

      const po = (await db.query('SELECT COUNT(*)::int AS n FROM purchase_orders')).rows[0];
      const items = (await db.query('SELECT COUNT(*)::int AS n FROM purchase_order_items')).rows[0];
      expect(po.n).toBe(0);
      expect(items.n).toBe(0);
    });
  });

  // ----- PUT & DELETE /:id (ubah & hapus PO, tiket 07) -----
  //
  // Inti tiket ini adalah penjaga status: PO yang sudah divalidasi barangnya
  // sudah masuk stok, jadi mengubahnya akan membuat PO dan stok tidak cocok
  // lagi. Karena itu edit dan hapus ditolak dengan 409 untuk SEMUA status
  // selain pending — bukan cuma validated.

  describe('PUT /:id dan DELETE /:id', () => {
    // Payload ubah yang valid: vendor, nomor, tanggal, dan satu item.
    const putPayload = (overrides = {}) => ({
      vendor_id: 1,
      no_po: 'PO-UBAH-001',
      tgl_beli: '2026-09-02',
      items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000 }],
      ...overrides,
    });

    // Buat PO pending lengkap dengan satu item, kembalikan id-nya.
    const seedPendingPo = async (overrides = {}) => {
      await seedBase();
      const { body } = await post('/purchase-orders', payload(overrides));
      return body.data.id;
    };

    // ----- Penjaga status: 409 untuk semua status selain pending -----

    // `received` belum dihasilkan flow mana pun hari ini, tapi tetap diuji —
    // tiket mensyaratkan penjaganya sudah berlaku sebelum flow itu ada.
    for (const status of ['validated', 'received', 'rejected']) {
      test(`ubah PO ${status} → 409, bukan 200`, async () => {
        await seedBase();
        const id = await seedPo({ status });

        const { status: code, body } = await mutate('PUT', `/purchase-orders/${id}`, putPayload());
        expect(code).toBe(409);
        expect(body.ok).toBe(false);
        // Pesannya harus menjelaskan alasannya, bukan sekadar "gagal".
        expect(body.error).toMatch(/tidak bisa diubah/i);
      });

      test(`hapus PO ${status} → 409, bukan 200`, async () => {
        await seedBase();
        const id = await seedPo({ status });

        const { status: code, body } = await mutate('DELETE', `/purchase-orders/${id}`);
        expect(code).toBe(409);
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/tidak bisa dihapus/i);
      });
    }

    // Pesan penolakan harus menjelaskan status yang sebenarnya. Mengatakan
    // "sudah tercatat di stok" untuk PO rejected itu berbohong — penolakan
    // tidak pernah menulis baris stok.
    test('PO rejected ditolak dengan alasan penolakan, bukan klaim stok', async () => {
      await seedBase();
      const id = await seedPo({ status: 'rejected' });

      const { body } = await mutate('DELETE', `/purchase-orders/${id}`);
      expect(body.error).toMatch(/ditolak/i);
      expect(body.error).not.toMatch(/stok/i);
    });

    test('PO validated ditolak dengan alasan stok', async () => {
      await seedBase();
      const id = await seedPo({ status: 'validated' });

      const { body } = await mutate('DELETE', `/purchase-orders/${id}`);
      expect(body.error).toMatch(/stok/i);
    });

    // ----- Jalur sukses pada PO pending -----

    test('ubah PO pending → 200, dan nilainya tersimpan', async () => {
      const id = await seedPendingPo();

      const { status, body } = await mutate('PUT', `/purchase-orders/${id}`, putPayload({
        no_po: 'PO-UBAH-JADI',
        tgl_beli: '2026-09-03',
      }));
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const row = (await db.query(
        'SELECT no_po, tgl_beli FROM purchase_orders WHERE id = $1', [id]
      )).rows[0];
      expect(row.no_po).toBe('PO-UBAH-JADI');
      expect(row.tgl_beli).toBe('2026-09-03');
    });

    test('hapus PO pending → 200, dan barisnya hilang', async () => {
      const id = await seedPendingPo();

      const { status } = await mutate('DELETE', `/purchase-orders/${id}`);
      expect(status).toBe(200);

      const n = (await db.query(
        'SELECT COUNT(*)::int AS n FROM purchase_orders WHERE id = $1', [id]
      )).rows[0];
      expect(n.n).toBe(0);
    });

    test('hapus PO pending ikut menghapus itemnya, tidak ada baris yatim', async () => {
      const id = await seedPendingPo();

      await mutate('DELETE', `/purchase-orders/${id}`);

      const items = (await db.query(
        'SELECT COUNT(*)::int AS n FROM purchase_order_items WHERE purchase_order_id = $1', [id]
      )).rows[0];
      expect(items.n).toBe(0);
    });

    // ----- Item diganti sebagai set -----

    test('item yang dihilangkan dari payload benar-benar terhapus', async () => {
      await seedMaterial(2, 'Kancing B', 'pcs');
      const id = await seedPendingPo({
        items: [
          { raw_material_id: 1, qty: 5, harga_satuan: 1000 },
          { raw_material_id: 2, qty: 3, harga_satuan: 1500 },
        ],
      });

      // Payload baru cuma satu item — item kedua harus hilang.
      await mutate('PUT', `/purchase-orders/${id}`, putPayload({
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000 }],
      }));

      const rows = (await db.query(
        'SELECT raw_material_id FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id', [id]
      )).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].raw_material_id).toBe(1);
    });

    test('menambah item lewat PUT → item baru tersimpan', async () => {
      await seedMaterial(2, 'Kancing B', 'pcs');
      const id = await seedPendingPo();

      await mutate('PUT', `/purchase-orders/${id}`, putPayload({
        items: [
          { raw_material_id: 1, qty: 5, harga_satuan: 1000 },
          { raw_material_id: 2, qty: 2, harga_satuan: 2500 },
        ],
      }));

      const rows = (await db.query(
        'SELECT raw_material_id, subtotal FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id', [id]
      )).rows;
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => Number(r.subtotal))).toEqual([5000, 5000]);
    });

    // ----- Subtotal dihitung server, bukan dari klien -----

    test('subtotal dihitung ulang server saat ubah (kiriman klien diabaikan)', async () => {
      const id = await seedPendingPo();

      await mutate('PUT', `/purchase-orders/${id}`, putPayload({
        items: [{ raw_material_id: 1, qty: 3, harga_satuan: 4500, subtotal: 999999 }],
      }));

      const row = (await db.query(
        'SELECT subtotal FROM purchase_order_items WHERE purchase_order_id = $1', [id]
      )).rows[0];
      // Klien mengirim 999999; yang tersimpan hasil hitungan server.
      expect(Number(row.subtotal)).toBe(13500);
    });

    // ----- Validasi -----

    // Penjaga status harus menang atas validasi payload. Kalau pengguna
    // menyimpan form PO yang sudah divalidasi di tab lain, pesan yang berguna
    // adalah "sudah tercatat di stok" (409), bukan "items wajib diisi" (400).
    test('ubah PO validated dengan payload rusak → 409, bukan 400', async () => {
      await seedBase();
      const id = await seedPo({ status: 'validated' });

      const { status, body } = await mutate('PUT', `/purchase-orders/${id}`, { items: [] });
      expect(status).toBe(409);
      expect(body.error).toMatch(/stok/i);
    });

    test('ubah id yang tidak ada dengan payload rusak → 404, bukan 400', async () => {
      await seedBase();
      const { status } = await mutate('PUT', '/purchase-orders/999', { items: [] });
      expect(status).toBe(404);
    });

    test('ubah dengan items kosong → 400', async () => {
      const id = await seedPendingPo();
      const { status } = await mutate('PUT', `/purchase-orders/${id}`, putPayload({ items: [] }));
      expect(status).toBe(400);
    });

    test('ubah dengan vendor yang tidak ada → 400', async () => {
      const id = await seedPendingPo();
      const { status } = await mutate('PUT', `/purchase-orders/${id}`, putPayload({ vendor_id: 999 }));
      expect(status).toBe(400);
    });

    test('ubah dengan item berupa null → 400, bukan 500', async () => {
      // Penjaga tipe yang sama dengan POST: tanpa itu raw.raw_material_id
      // melempar TypeError yang tidak pernah jadi 400.
      const id = await seedPendingPo();
      const { status } = await mutate('PUT', `/purchase-orders/${id}`, putPayload({ items: [null] }));
      expect(status).toBe(400);
    });

    // ----- 404 -----

    test('ubah id yang tidak ada → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status, body } = await mutate('PUT', '/purchase-orders/999', putPayload());
      expect(status).toBe(404);
      expect(body.ok).toBe(false);
    });

    test('hapus id yang tidak ada → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status } = await mutate('DELETE', '/purchase-orders/999');
      expect(status).toBe(404);
    });

    test('ubah dengan id bukan angka → 404 JSON, bukan 500', async () => {
      // Tanpa validasi id, '/abc' diteruskan ke Postgres dan memicu 22P02.
      await seedBase();
      const { status } = await mutate('PUT', '/purchase-orders/abc', putPayload());
      expect(status).toBe(404);
    });

    test('hapus dengan id bukan angka → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status } = await mutate('DELETE', '/purchase-orders/abc');
      expect(status).toBe(404);
    });

    // Number() meloloskan '1.0', ' 1 ', dan '+1' sebagai id 1. Tanpa regex,
    // satu PO punya beberapa ejaan URL yang semuanya dianggap sah.
    for (const bentuk of ['1.0', ' 1 ', '+1', '1e0', '0x1']) {
      test(`id berbentuk "${bentuk}" → 404, bukan dianggap id 1`, async () => {
        await seedBase();
        await seedPo({ noPo: 'PO-ASLI' });

        const { status } = await call('GET', `/purchase-orders/${encodeURIComponent(bentuk)}`);
        expect(status).toBe(404);
      });
    }

    // ----- Autentikasi & CSRF -----

    // auth:false, bukan mutate() — mutate() selalu mengirim cookie sehingga
    // test "tanpa session" yang memakainya tidak akan pernah menguji apa pun.
    test('ubah tanpa session → 401 JSON, bukan redirect', async () => {
      const id = await seedPendingPo();
      const { status, contentType } = await call('PUT', `/purchase-orders/${id}`, {
        body: putPayload(),
        auth: false,
      });
      expect(status).toBe(401);
      expect(contentType).toMatch(/application\/json/);
    });

    test('hapus tanpa session → 401 JSON, bukan redirect', async () => {
      const id = await seedPendingPo();
      const { status, contentType } = await call('DELETE', `/purchase-orders/${id}`, { auth: false });
      expect(status).toBe(401);
      expect(contentType).toMatch(/application\/json/);
    });

    test('ubah tanpa header CSRF → 403', async () => {
      const id = await seedPendingPo();
      const { status } = await call('PUT', `/purchase-orders/${id}`, { body: putPayload() });
      expect(status).toBe(403);
    });

    test('hapus tanpa header CSRF → 403', async () => {
      const id = await seedPendingPo();
      const { status } = await call('DELETE', `/purchase-orders/${id}`);
      expect(status).toBe(403);
    });

    // ----- Predikat status harus ditegaskan di DML, bukan cuma dibaca dulu -----
    //
    // Race-nya: endpoint membaca status di awal, lalu menulis belakangan. Di
    // antaranya ada beberapa query (validasi payload, cek referensi). Kalau PO
    // divalidasi di jendela itu, penulisan menimpa PO yang barangnya sudah
    // masuk stok — dan penjagaan jadi tidak berguna.
    //
    // Race seperti ini TIDAK bisa diuji deterministik di test integrasi: butuh
    // intersep di tengah jendela yang tidak bisa diatur waktunya dengan pasti.
    // Yang bisa diuji adalah akibatnya yang teramati — bahwa UPDATE pada PO
    // non-pending tidak mengubah baris apa pun. Kalau predikatnya cuma ada di
    // SELECT awal, query ini akan mengubah barisnya.
    test('UPDATE terhadap PO non-pending tidak mengubah baris apa pun', async () => {
      await seedBase();
      const id = await seedPo({ status: 'validated' });

      // Predikat yang sama persis dengan yang dipakai rute PUT.
      const r = await db.query(
        `UPDATE purchase_orders SET no_po = $1 WHERE id = $2 AND status = 'pending'`,
        ['PO-COBA-TIMPA', id]
      );
      expect(r.rowCount).toBe(0);

      const row = (await db.query('SELECT no_po FROM purchase_orders WHERE id = $1', [id])).rows[0];
      expect(row.no_po).not.toBe('PO-COBA-TIMPA');
    });

    test('DELETE terhadap PO non-pending tidak menghapus baris apa pun', async () => {
      await seedBase();
      const id = await seedPo({ status: 'validated' });

      const r = await db.query(
        `DELETE FROM purchase_orders WHERE id = $1 AND status = 'pending'`,
        [id]
      );
      expect(r.rowCount).toBe(0);

      const n = (await db.query(
        'SELECT COUNT(*)::int AS n FROM purchase_orders WHERE id = $1', [id]
      )).rows[0];
      expect(n.n).toBe(1);
    });

    // ----- Kegagalan item tidak boleh merusak PO yang sudah ada -----

    test('ubah dengan item kedua tidak valid → PO lama tetap utuh', async () => {
      const id = await seedPendingPo();

      await mutate('PUT', `/purchase-orders/${id}`, putPayload({
        items: [
          { raw_material_id: 1, qty: 5, harga_satuan: 1000 },
          { raw_material_id: 999, qty: 1, harga_satuan: 1 },
        ],
      }));

      // Transaksi dibatalkan: item PO yang lama tidak boleh hilang atau
      // setengah terganti.
      const rows = (await db.query(
        'SELECT raw_material_id, qty FROM purchase_order_items WHERE purchase_order_id = $1', [id]
      )).rows;
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].qty)).toBe(5);
    });
  });

  // ----- POST /:id/validate & /:id/reject (validasi PO, tiket 08) -----
  //
  // Inti tiket ini: validasi memindahkan barang ke stok. Karena itu test di
  // sini menegaskan EFEK YANG TERAMATI — stok, batch, dan pergerakan dibaca
  // ulang dari database setelah permintaan — bukan sekadar kode respons 200.
  describe('POST /:id/validate dan POST /:id/reject', () => {
    // PO pending dengan dua item yang qty-nya sengaja berbeda, supaya
    // "stok bertambah tepat sejumlah item" tidak bisa lolos dengan menambah
    // qty item pertama saja.
    const seedPendingDenganItem = async (opsi = {}) => {
      await seedBase();
      await seedMaterial(2, 'Kancing B', 'pcs');
      await setStok(1, 10);
      await setStok(2, 0);
      const id = await seedPo(opsi);
      await seedItem(id, { materialId: 1, qty: 5, harga: 1000 });
      await seedItem(id, { materialId: 2, qty: 3, harga: 2500 });
      return id;
    };

    // Sesi finance: satu-satunya role yang boleh memvalidasi (AC tiket).
    const jadiFinance = () => setSession({ userId: 2, username: 'sari', role: 'finance' });

    beforeEach(async () => {
      await seedUser(2, 'sari', 'finance');
      await jadiFinance();
    });

    // ----- Kegagalan lebih dulu: endpoint belum ada -----

    test('validasi PO pending → 200', async () => {
      const id = await seedPendingDenganItem();
      const { status, body } = await mutate('POST', `/purchase-orders/${id}/validate`, {});
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
    });

    // ----- Efek stok: alasan tiket ini ada -----

    test('stok tiap material bertambah tepat sejumlah qty itemnya', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      // Stok awal 10 dan 0; item 5 dan 3.
      expect(await stokOf(1)).toBe(15);
      expect(await stokOf(2)).toBe(3);
    });

    test('satu batch FIFO per item, dengan PO sebagai sumbernya', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      const batches = (await db.query(
        'SELECT raw_material_id, source_type, source_id, qty_awal, qty_sisa FROM material_batches ORDER BY id'
      )).rows;
      expect(batches).toHaveLength(2);
      // source_type 'po' dan source_id = id PO: nilai yang sudah dipakai
      // service lama, bukan karangan baru.
      expect(batches.map((b) => b.source_type)).toEqual(['po', 'po']);
      expect(batches.map((b) => Number(b.source_id))).toEqual([id, id]);
      expect(batches.map((b) => Number(b.raw_material_id))).toEqual([1, 2]);
    });

    test('qty_sisa batch sama dengan qty_awal (batch belum terpakai)', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      const batches = (await db.query(
        'SELECT qty_awal, qty_sisa FROM material_batches ORDER BY id'
      )).rows;
      expect(batches.map((b) => [Number(b.qty_awal), Number(b.qty_sisa)])).toEqual([[5, 5], [3, 3]]);
    });

    test('satu pergerakan stok "masuk" per item, merujuk batchnya', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      const movements = (await db.query(
        `SELECT sm.raw_material_id, sm.movement_type, sm.qty, sm.batch_id, sm.ref_type, sm.ref_id
         FROM stock_movements sm ORDER BY sm.id`
      )).rows;
      expect(movements).toHaveLength(2);
      expect(movements.map((m) => m.movement_type)).toEqual(['masuk', 'masuk']);
      expect(movements.map((m) => Number(m.qty))).toEqual([5, 3]);
      expect(movements.map((m) => Number(m.ref_id))).toEqual([id, id]);
      // batch_id harus merujuk batch yang benar-benar ada, bukan NULL.
      for (const m of movements) {
        expect(m.batch_id).not.toBeNull();
      }
    });

    test('status PO menjadi validated, dan pencatat validasi tersimpan', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      const po = (await db.query(
        'SELECT status, validated_by, validated_at FROM purchase_orders WHERE id = $1', [id]
      )).rows[0];
      expect(po.status).toBe('validated');
      expect(po.validated_by).toBe(2);   // sesi finance
      expect(po.validated_at).not.toBeNull();
    });

    // ----- Validasi ganda: jalur menuju stok ganda -----

    test('validasi dua kali → stok bertambah sekali saja', async () => {
      const id = await seedPendingDenganItem();
      const pertama = await mutate('POST', `/purchase-orders/${id}/validate`, {});
      expect(pertama.status).toBe(200);

      // Token CSRF dirotasi tiap mutasi berhasil, jadi mutate() yang
      // mengambil token fresh tetap dipakai — bukan memakai token lama.
      const kedua = await mutate('POST', `/purchase-orders/${id}/validate`, {});
      expect(kedua.status).toBe(409);

      expect(await stokOf(1)).toBe(15);
      expect(await stokOf(2)).toBe(3);
      const batches = (await db.query('SELECT COUNT(*)::int AS n FROM material_batches')).rows[0];
      expect(batches.n).toBe(2);
    });

    for (const status of ['validated', 'rejected', 'received']) {
      test(`validasi PO ${status} → 409, bukan 200`, async () => {
        await seedBase();
        const id = await seedPo({ status });
        await seedItem(id, { materialId: 1, qty: 5, harga: 1000 });

        const { status: code, body } = await mutate('POST', `/purchase-orders/${id}/validate`, {});
        expect(code).toBe(409);
        expect(body.ok).toBe(false);
        // Pesan harus menjelaskan alasannya — dipakai langsung di UI.
        expect(body.error).toMatch(/tidak bisa divalidasi/i);
      });
    }

    test('validasi PO yang sudah divalidasi tidak menambah stok lagi', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      expect(await stokOf(1)).toBe(15);
      expect(await stokOf(2)).toBe(3);
    });

    // ----- Penolakan: stok tidak boleh tersentuh sama sekali -----

    test('tolak PO pending → 200, status menjadi rejected', async () => {
      const id = await seedPendingDenganItem();
      const { status, body } = await mutate('POST', `/purchase-orders/${id}/reject`, {
        catatan: 'Harga terlalu tinggi',
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const po = (await db.query(
        'SELECT status, catatan_reject FROM purchase_orders WHERE id = $1', [id]
      )).rows[0];
      expect(po.status).toBe('rejected');
      expect(po.catatan_reject).toBe('Harga terlalu tinggi');
    });

    test('penolakan menyimpan alasan, dan alasan itu terbaca lewat GET /:id', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/reject`, { catatan: 'Vendor tidak lengkap' });

      // Alasan ditampilkan ke pembuat PO, jadi harus bisa dibaca ulang.
      const { body } = await call('GET', `/purchase-orders/${id}`);
      expect(body.data.catatan_reject).toBe('Vendor tidak lengkap');
    });

    test('penolakan tidak menyentuh stok, batch, maupun pergerakan', async () => {
      const id = await seedPendingDenganItem();
      const { status } = await mutate('POST', `/purchase-orders/${id}/reject`, { catatan: 'Salah harga' });
      // Wajib ditegaskan dulu. Permintaan yang dijawab 404 (endpoint belum
      // ada) juga tidak akan menyentuh stok — tanpa baris ini test ini akan
      // tetap hijau walau penolakan tidak bekerja sama sekali.
      expect(status).toBe(200);

      const { batches, movements } = await jejakValidasi(id);
      expect(await stokOf(1)).toBe(10);   // tidak berubah dari awal
      expect(await stokOf(2)).toBe(0);
      expect(batches).toHaveLength(0);
      expect(movements).toHaveLength(0);
    });

    test('penolakan mencatat siapa yang menolak', async () => {
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/reject`, { catatan: 'Ditolak' });

      const po = (await db.query(
        'SELECT validated_by FROM purchase_orders WHERE id = $1', [id]
      )).rows[0];
      expect(po.validated_by).toBe(2);
    });

    for (const status of ['validated', 'rejected', 'received']) {
      test(`tolak PO ${status} → 409, bukan 200`, async () => {
        await seedBase();
        const id = await seedPo({ status });

        const { status: code, body } = await mutate('POST', `/purchase-orders/${id}/reject`, {
          catatan: 'x',
        });
        expect(code).toBe(409);
        expect(body.error).toMatch(/tidak bisa ditolak/i);
      });
    }

    // ----- Kegagalan tidak boleh meninggalkan efek setengah jadi -----
    //
    // Diverifikasi dengan memaksa kegagalan di tengah: item kedua dirusak
    // supaya INSERT-nya gagal, lalu keempat tabel dibaca ulang.
    test('gagal di tengah validasi → tidak ada stok, batch, pergerakan, atau perubahan status', async () => {
      const id = await seedPendingDenganItem();

      // Kegagalan diselipkan pada item KEDUA, bukan yang pertama. Kalau
      // kegagalannya di item pertama, tidak ada yang sempat ditulis dan test
      // akan hijau walau transaksi tidak pernah ada. Dengan kegagalan di item
      // kedua, stok item pertama SUDAH terlanjur naik — jadi kalau transaksi
      // dihapus, kenaikan itu akan tertinggal dan test ini merah.
      //
      // Baris item tidak bisa dirusak langsung: FK purchase_order_items
      // menolak raw_material_id fiktif (terbukti — dicoba lebih dulu).
      // Karena itu kegagalannya diselipkan di lapis akses data.
      // `.bind(db)` WAJIB. Implementasi asli membaca `this.pool`, jadi tanpa
      // bind ia melempar "Cannot read properties of undefined (reading
      // 'pool')" — transaksi tak pernah dimulai, dan test ini akan lolos
      // untuk alasan yang salah (tidak ada yang ditulis, jadi tidak ada
      // yang perlu dibatalkan). Kebetulan ini yang pertama kali terjadi
      // saat test ditulis.
      const asli = db.transaction.bind(db);
      const selipkan = jest.spyOn(db, 'transaction').mockImplementation((fn) =>
        asli(async (tx) => {
          const runAsli = tx.run.bind(tx);
          tx.run = (sql, params) => {
            // params[0] material_batches adalah raw_material_id.
            if (/INSERT INTO material_batches/.test(sql) && params?.[0] === 2) {
              throw new Error('Kegagalan yang disengaja pada item kedua');
            }
            return runAsli(sql, params);
          };
          return fn(tx);
        })
      );

      let status;
      try {
        ({ status } = await mutate('POST', `/purchase-orders/${id}/validate`, {}));
      } finally {
        selipkan.mockRestore();
      }
      expect(status).toBe(500);

      const { po, batches, movements } = await jejakValidasi(id);
      // Keadaan setelah rollback: persis seperti sebelum permintaan.
      expect(po.status).toBe('pending');
      expect(po.validated_by).toBeNull();
      expect(batches).toHaveLength(0);
      expect(movements).toHaveLength(0);
      expect(await stokOf(1)).toBe(10);
      expect(await stokOf(2)).toBe(0);
    });

    test('PO tanpa item bisa divalidasi, tanpa menambah apa pun', async () => {
      // Kasus pinggiran yang nyata: PO kosong tidak boleh merusak transaksi.
      await seedBase();
      await setStok(1, 7);
      const id = await seedPo();

      const { status } = await mutate('POST', `/purchase-orders/${id}/validate`, {});
      expect(status).toBe(200);
      expect(await stokOf(1)).toBe(7);
      const po = (await db.query('SELECT status FROM purchase_orders WHERE id = $1', [id])).rows[0];
      expect(po.status).toBe('validated');
    });

    // ----- Role: hanya finance -----
    //
    // requireRole menjawab JSON, bukan me-render error.ejs — itu syarat agar
    // klien React bisa menampilkan pesannya (tiket 01).
    test('admin (bukan finance) → 403 JSON, bukan redirect', async () => {
      const id = await seedPendingDenganItem();
      await setSession({ userId: 1, username: 'admin', role: 'admin' });

      const { status, body, contentType } = await mutate('POST', `/purchase-orders/${id}/validate`, {});
      expect(status).toBe(403);
      expect(contentType).toMatch(/application\/json/);
      expect(body.ok).toBe(false);
      // Status tidak boleh berubah walau permintaan ditolak.
      expect((await jejakValidasi(id)).po.status).toBe('pending');
    });

    test('admin (bukan finance) tidak bisa menolak → 403', async () => {
      const id = await seedPendingDenganItem();
      await setSession({ userId: 1, username: 'admin', role: 'admin' });

      const { status } = await mutate('POST', `/purchase-orders/${id}/reject`, { catatan: 'x' });
      expect(status).toBe(403);
      expect((await jejakValidasi(id)).po.status).toBe('pending');
    });

    // ----- Autentikasi & CSRF -----

    test('validasi tanpa session → 401 JSON', async () => {
      const id = await seedPendingDenganItem();
      const { status, contentType } = await call('POST', `/purchase-orders/${id}/validate`, {
        body: {},
        auth: false,
      });
      expect(status).toBe(401);
      expect(contentType).toMatch(/application\/json/);
    });

    test('tolak tanpa session → 401 JSON', async () => {
      const id = await seedPendingDenganItem();
      const { status } = await call('POST', `/purchase-orders/${id}/reject`, {
        body: { catatan: 'x' },
        auth: false,
      });
      expect(status).toBe(401);
    });

    test('validasi tanpa header CSRF → 403', async () => {
      const id = await seedPendingDenganItem();
      const { status } = await call('POST', `/purchase-orders/${id}/validate`, { body: {} });
      expect(status).toBe(403);
    });

    test('tolak tanpa header CSRF → 403', async () => {
      const id = await seedPendingDenganItem();
      const { status } = await call('POST', `/purchase-orders/${id}/reject`, { body: { catatan: 'x' } });
      expect(status).toBe(403);
    });

    // ----- 404 & id tidak sah -----

    test('validasi id yang tidak ada → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status, body, contentType } = await mutate('POST', '/purchase-orders/999/validate', {});
      expect(status).toBe(404);
      expect(body.ok).toBe(false);
      expect(contentType).toMatch(/application\/json/);
    });

    // Tegasan contentType JSON WAJIB di test 404 ini. Express menjawab 404
    // ber-HTML untuk route yang tidak terdaftar sama sekali, jadi tanpa
    // tegasan itu test akan hijau walau endpointnya belum ditulis — tidak
    // menguji apa pun. Yang diuji: route-nya ADA dan menjawab 404 JSON.
    test('tolak id yang tidak ada → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status, contentType, body } = await mutate('POST', '/purchase-orders/999/reject', { catatan: 'x' });
      expect(status).toBe(404);
      expect(contentType).toMatch(/application\/json/);
      expect(body.ok).toBe(false);
    });

    test('validasi dengan id bukan angka → 404 JSON, bukan 500', async () => {
      // Tanpa parseId, '/abc' diteruskan ke Postgres → 22P02 → 500.
      await seedBase();
      const { status, contentType } = await mutate('POST', '/purchase-orders/abc/validate', {});
      expect(status).toBe(404);
      expect(contentType).toMatch(/application\/json/);
    });

    test('tolak dengan id bukan angka → 404 JSON, bukan 500', async () => {
      await seedBase();
      const { status, contentType } = await mutate('POST', '/purchase-orders/abc/reject', { catatan: 'x' });
      expect(status).toBe(404);
      expect(contentType).toMatch(/application\/json/);
    });

    // ----- Alasan penolakan wajib diisi -----

    test('tolak tanpa catatan → 400', async () => {
      const id = await seedPendingDenganItem();
      const { status, body } = await mutate('POST', `/purchase-orders/${id}/reject`, {});
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
    });

    // 404 harus menang atas 400: kalau alasan divalidasi lebih dulu, body
    // kosong akan menjawab 400 dan klien tak pernah tahu PO-nya tidak ada.
    test('tolak id yang tidak ada TANPA catatan → 404, bukan 400', async () => {
      await seedBase();
      const { status } = await mutate('POST', '/purchase-orders/999/reject', {});
      expect(status).toBe(404);
    });

    test('tolak dengan catatan kosong → 400', async () => {
      // String berisi spasi saja: kalau cuma dicek truthiness, ini lolos
      // dan alasan tersimpan sebagai "   " yang tak bermakna.
      const id = await seedPendingDenganItem();
      const { status } = await mutate('POST', `/purchase-orders/${id}/reject`, { catatan: '   ' });
      expect(status).toBe(400);
    });

    test('catatan bukan string → 400, bukan 500', async () => {
      const id = await seedPendingDenganItem();
      const { status } = await mutate('POST', `/purchase-orders/${id}/reject`, { catatan: 12345 });
      expect(status).toBe(400);
    });

    // ----- Respons -----

    test('respons validasi berisi PO dengan status baru, siap ditampilkan ulang', async () => {
      const id = await seedPendingDenganItem();
      const { body } = await mutate('POST', `/purchase-orders/${id}/validate`, {});
      expect(body.data.status).toBe('validated');
      expect(body.data.status_label).toBe('Tervalidasi');
    });

    test('setelah divalidasi, PO tidak bisa diubah lagi (409)', async () => {
      // Penjaga tiket 07 dan tiket 08 harus sepakat: validasi mengunci PO.
      const id = await seedPendingDenganItem();
      await mutate('POST', `/purchase-orders/${id}/validate`, {});

      const { status } = await mutate('PUT', `/purchase-orders/${id}`, {
        vendor_id: 1,
        no_po: 'PO-COBA-UBAH',
        tgl_beli: '2026-09-02',
        items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000 }],
      });
      expect(status).toBe(409);
    });
  });
});
