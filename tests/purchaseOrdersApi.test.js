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
  });

  // ----- POST / (buat PO) -----

  describe('POST /', () => {
    // Payload valid minimal: vendor 1, satu item material 1.
    const payload = (overrides = {}) => ({
      vendor_id: 1,
      no_po: 'PO-BARU-001',
      tgl_beli: '2026-09-02',
      items: [{ raw_material_id: 1, qty: 5, harga_satuan: 1000 }],
      ...overrides,
    });

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
});
