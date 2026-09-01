/**
 * Test JSON API /api/purchase-orders (features/purchase-order/backend/routes.js).
 *
 * Mengikuti pola tests/vendorsApi.test.js: mini Express app dengan MemoryStore
 * session + SID palsu yang sudah ter-auth, lalu fetch ke 127.0.0.1. Skema `test`
 * (tests/setup.js) men-truncate semua tabel sebelum tiap test, jadi tiap test
 * menanam datanya sendiri dan id selalu mulai dari 1.
 *
 * Endpoint ini read-only (tiket 05): tiket 06-08 yang menambah create, edit,
 * dan validasi. Karena itu tidak ada test CSRF di sini.
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

  const call = async (method, path, { headers, auth = true } = {}) => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(auth ? { cookie: AUTH_COOKIE } : {}),
        ...headers,
      },
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* non-JSON */ }
    return { status: r.status, body: json, contentType: r.headers.get('content-type') };
  };

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
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
});
