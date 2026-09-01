/**
 * Test JSON API /api/vendors (features/vendor/backend/routes.js).
 *
 * Mengikuti pola tests/negaraApi.test.js dan tests/materialsApi.test.js:
 * mini Express app dengan MemoryStore session + SID palsu yang sudah
 * ter-auth, lalu fetch ke 127.0.0.1. Skema `test` (tests/setup.js)
 * men-truncate semua tabel sebelum tiap test, jadi tiap test menanam
 * datanya sendiri dan id selalu mulai dari 1.
 */
const db = require('../db');

const SECRET = 'test-secret-vendors';
const SID = 'vendors-sid';

// Signed cookie ala cookie-signature: HMAC-SHA256(sid, secret), '=' dibuang.
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('JSON API /api/vendors', () => {
  const express = require('express');
  const session = require('express-session');
  let app;
  let server;
  let store;

  const call = async (method, path, { body, headers, auth = true } = {}) => {
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
    return { status: r.status, body: json };
  };

  // Token CSRF selalu fresh sebelum mutasi (server merotasi token tiap sukses).
  const getToken = async () => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/__token`, { headers: { cookie: AUTH_COOKIE } });
    return (await r.json()).t;
  };

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    // Endpoint khusus test untuk membaca token dari res.locals.
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    app.use('/vendors', require('../features/vendor/backend/routes'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Session palsu yang sudah ter-auth untuk semua test yang pakai AUTH_COOKIE.
  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      store.set(SID, {
        cookie: {
          originalMaxAge: 3600000,
          expires: new Date(Date.now() + 3600000).toISOString(),
          httpOnly: true,
          path: '/',
        },
        userId: 1,
      }, (err) => (err ? reject(err) : resolve()));
    });
  });

  const seedVendors = async (rows) => {
    for (const [nama, tipe] of rows) {
      await db.query('INSERT INTO vendors (nama, tipe) VALUES ($1, $2)', [nama, tipe]);
    }
  };

  // users + products + product_variants dibutuhkan purchase_orders,
  // production_batches, dan purchase_imports.
  const seedBase = async () => {
    await db.query(`INSERT INTO users (id, username, password, role) VALUES (1, 'admin', 'x', 'admin')`);
    await db.query(`INSERT INTO products (id, nama_produk, tipe_produksi) VALUES (1, 'Kaos Polos', 'sendiri')`);
    await db.query(
      `INSERT INTO product_variants (id, product_id, warna, size, sku)
       VALUES (1, 1, 'Hitam', 'M', 'KP-HITAM-M')`
    );
  };

  // Satu PO untuk vendor 1.
  const seedPurchaseOrder = async (vendorId = 1) => {
    await db.query(
      `INSERT INTO purchase_orders (vendor_id, no_po, tgl_beli, created_by, status)
       VALUES ($1, 'PO-001', '2026-08-31', 1, 'pending')`,
      [vendorId]
    );
  };

  // Satu pembelian white label untuk vendor 1.
  const seedPurchaseImport = async (vendorId = 1) => {
    await db.query(
      `INSERT INTO vendors (id, nama, tipe) VALUES ($1, 'Importir', 'import')
       ON CONFLICT (id) DO NOTHING`,
      [vendorId]
    );
    await db.query(
      `INSERT INTO purchase_imports
         (variant_id, vendor_id, tgl_beli, qty, harga_produk, hpp_per_item, created_by)
       VALUES (1, $1, '2026-08-31', 10, 50000, 50000, 1)`,
      [vendorId]
    );
  };

  // Satu batch produksi untuk vendor 1.
  const seedProductionBatch = async (vendorId = 1) => {
    await db.query(
      `INSERT INTO production_batches
         (product_id, nama_batch, tgl_mulai, jenis_produksi, vendor_id, jumlah_dipesan, status)
       VALUES (1, 'Batch-001', '2026-08-31', 'in_house', $1, 100, 'planned')`,
      [vendorId]
    );
  };

  describe('GET /vendors', () => {
    test('tanpa session → 401 JSON', async () => {
      const { status, body } = await call('GET', '/vendors', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('daftar kosong → ok dengan array kosong', async () => {
      const { status, body } = await call('GET', '/vendors');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('diurutkan menurut nama', async () => {
      await seedVendors([['Zeta', 'bahan_baku'], ['Alpha', 'import'], ['Mega', 'produksi']]);
      const { status, body } = await call('GET', '/vendors');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.map((r) => r.nama)).toEqual(['Alpha', 'Mega', 'Zeta']);
    });

    test('tiap baris membawa id, nama, alamat, kontak, tipe', async () => {
      await db.query(
        `INSERT INTO vendors (nama, alamat, kontak, tipe)
         VALUES ('PT Maju', 'Jakarta', '0812', 'bahan_baku')`
      );
      const { status, body } = await call('GET', '/vendors');
      expect(status).toBe(200);
      const row = body.data[0];
      expect(row.id).toBeGreaterThan(0);
      expect(row.nama).toBe('PT Maju');
      expect(row.alamat).toBe('Jakarta');
      expect(row.kontak).toBe('0812');
      expect(row.tipe).toBe('bahan_baku');
    });

    test('filter ?tipe=bahan_baku hanya mengembalikan tipe itu', async () => {
      await seedVendors([['Kain Co', 'bahan_baku'], ['AS Studio', 'import'], ['Jahit Co', 'produksi']]);
      const { status, body } = await call('GET', '/vendors?tipe=bahan_baku');
      expect(status).toBe(200);
      expect(body.data.map((r) => r.nama)).toEqual(['Kain Co']);
    });

    test('filter ?tipe=produksi', async () => {
      await seedVendors([['Kain Co', 'bahan_baku'], ['Jahit Co', 'produksi']]);
      const { body } = await call('GET', '/vendors?tipe=produksi');
      expect(body.data.map((r) => r.nama)).toEqual(['Jahit Co']);
    });

    test('filter ?tipe=import', async () => {
      await seedVendors([['Kain Co', 'bahan_baku'], ['AS Studio', 'import']]);
      const { body } = await call('GET', '/vendors?tipe=import');
      expect(body.data.map((r) => r.nama)).toEqual(['AS Studio']);
    });

    test('tipe tanpa baris → daftar kosong, bukan error', async () => {
      // Kondisi nyata di live DB: 0 vendor produksi.
      await seedVendors([['Kain Co', 'bahan_baku']]);
      const { status, body } = await call('GET', '/vendors?tipe=produksi');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('tipe_label ikut terkirim untuk dipakai halaman React', async () => {
      await seedVendors([['Kain Co', 'bahan_baku'], ['AS Studio', 'import'], ['Jahit Co', 'produksi']]);
      const { body } = await call('GET', '/vendors');
      const label = (nama) => body.data.find((r) => r.nama === nama).tipe_label;
      expect(label('Kain Co')).toBe('Bahan Baku');
      expect(label('Jahit Co')).toBe('Produksi');
      // Nilai kode tetap 'import'; hanya labelnya yang "White Label".
      expect(label('AS Studio')).toBe('White Label');
      expect(body.data.find((r) => r.nama === 'AS Studio').tipe).toBe('import');
    });
  });

  describe('POST /vendors', () => {
    test('tanpa header CSRF → 403 JSON', async () => {
      const { status, body } = await call('POST', '/vendors', {
        body: { nama: 'PT Baru', tipe: 'bahan_baku' },
      });
      expect(status).toBe(403);
      expect(body.ok).toBe(false);
    });

    test('tanpa session → 401 JSON', async () => {
      const { status } = await call('POST', '/vendors', {
        body: { nama: 'PT Baru', tipe: 'bahan_baku' },
        auth: false,
      });
      expect(status).toBe(401);
    });

    test('valid → 201 dan baris tersimpan', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/vendors', {
        body: { nama: 'PT Baru', tipe: 'bahan_baku', alamat: 'Bandung', kontak: '0813' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBeGreaterThan(0);

      const row = (await db.query('SELECT * FROM vendors WHERE nama = $1', ['PT Baru'])).rows[0];
      expect(row.tipe).toBe('bahan_baku');
      expect(row.alamat).toBe('Bandung');
      expect(row.kontak).toBe('0813');
    });

    test('tanpa nama → 400', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/vendors', {
        body: { tipe: 'bahan_baku' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/nama/i);
    });

    test('tanpa tipe → 400', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/vendors', {
        body: { nama: 'PT Baru' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.error).toMatch(/tipe/i);
    });

    test('tipe di luar tiga nilai yang diizinkan → 400, bukan error constraint', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/vendors', {
        body: { nama: 'PT Aneh', tipe: 'dagang' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      // Pesan harus menyebut nilai yang diizinkan, bukan kode error database.
      expect(body.error).toMatch(/bahan_baku/);
      expect(body.error).not.toMatch(/constraint|violates|23514/i);

      const count = (await db.query('SELECT COUNT(*)::int AS c FROM vendors')).rows[0];
      expect(Number(count.c)).toBe(0);
    });

    test('nama hanya spasi → 400', async () => {
      const token = await getToken();
      const { status } = await call('POST', '/vendors', {
        body: { nama: '   ', tipe: 'bahan_baku' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
    });
  });

  describe('PUT /vendors/:id', () => {
    test('memperbarui nama, alamat, kontak, tipe → 200', async () => {
      await seedVendors([['PT Lama', 'bahan_baku']]);
      const token = await getToken();
      const { status, body } = await call('PUT', '/vendors/1', {
        body: { nama: 'PT Baru', alamat: 'Surabaya', kontak: '0814', tipe: 'produksi' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const row = (await db.query('SELECT * FROM vendors WHERE id = 1')).rows[0];
      expect(row.nama).toBe('PT Baru');
      expect(row.alamat).toBe('Surabaya');
      expect(row.kontak).toBe('0814');
      expect(row.tipe).toBe('produksi');
    });

    test('field yang tidak dikirim tidak dikosongkan', async () => {
      await db.query(
        `INSERT INTO vendors (nama, alamat, kontak, tipe)
         VALUES ('PT Utuh', 'Jakarta', '0812', 'bahan_baku')`
      );
      const token = await getToken();
      const { status } = await call('PUT', '/vendors/1', {
        body: { nama: 'PT Ganti Nama' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);

      const row = (await db.query('SELECT * FROM vendors WHERE id = 1')).rows[0];
      expect(row.nama).toBe('PT Ganti Nama');
      expect(row.alamat).toBe('Jakarta');
      expect(row.kontak).toBe('0812');
    });

    test('id tak dikenal → 404', async () => {
      const token = await getToken();
      const { status, body } = await call('PUT', '/vendors/999', {
        body: { nama: 'Hantu' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
      expect(body.ok).toBe(false);
    });

    test('tipe tidak valid → 400 dan baris tidak berubah', async () => {
      await seedVendors([['PT Lama', 'bahan_baku']]);
      const token = await getToken();
      const { status, body } = await call('PUT', '/vendors/1', {
        body: { tipe: 'dagang' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.error).toMatch(/bahan_baku/);

      const row = (await db.query('SELECT tipe FROM vendors WHERE id = 1')).rows[0];
      expect(row.tipe).toBe('bahan_baku');
    });
  });

  describe('DELETE /vendors/:id', () => {
    test('vendor tak dipakai → terhapus', async () => {
      await seedVendors([['PT Sepi', 'bahan_baku']]);
      const token = await getToken();
      const { status, body } = await call('DELETE', '/vendors/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const left = (await db.query('SELECT COUNT(*)::int AS c FROM vendors WHERE id = 1')).rows[0];
      expect(Number(left.c)).toBe(0);
    });

    test('id tak dikenal → 404', async () => {
      const token = await getToken();
      const { status } = await call('DELETE', '/vendors/999', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
    });

    test('dipakai PO → ditolak, pesan menyebut PO', async () => {
      await seedBase();
      await seedVendors([['PT Kepakai', 'bahan_baku']]);
      await seedPurchaseOrder(1);
      const token = await getToken();
      const { status, body } = await call('DELETE', '/vendors/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/PO/i);
      expect(body.error).toMatch(/1/);

      const still = (await db.query('SELECT COUNT(*)::int AS c FROM vendors WHERE id = 1')).rows[0];
      expect(Number(still.c)).toBe(1);
    });

    test('dipakai pembelian white label → ditolak, pesan menyebut white label', async () => {
      await seedBase();
      await seedVendors([['Importir', 'import']]);
      await seedPurchaseImport(1);
      const token = await getToken();
      const { status, body } = await call('DELETE', '/vendors/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.error).toMatch(/white label/i);
    });

    test('dipakai batch produksi → ditolak, pesan menyebut batch produksi', async () => {
      await seedBase();
      await seedVendors([['Jahit Co', 'produksi']]);
      await seedProductionBatch(1);
      const token = await getToken();
      const { status, body } = await call('DELETE', '/vendors/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.error).toMatch(/batch|produksi/i);
    });

    test('dipakai di tiga tempat sekaligus → ketiganya disebut dengan jumlahnya', async () => {
      await seedBase();
      await seedVendors([['PT Serbaguna', 'bahan_baku']]);
      await seedPurchaseOrder(1);
      await seedPurchaseImport(1);
      await seedProductionBatch(1);
      const token = await getToken();
      const { status, body } = await call('DELETE', '/vendors/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.error).toMatch(/1 PO/);
      expect(body.error).toMatch(/1 pembelian white label/);
      expect(body.error).toMatch(/1 batch produksi/);
    });

    test('jumlah lebih dari satu ikut terhitung', async () => {
      await seedBase();
      await seedVendors([['PT Banyak', 'bahan_baku']]);
      await seedPurchaseOrder(1);
      await db.query(
        `INSERT INTO purchase_orders (vendor_id, no_po, tgl_beli, created_by, status)
         VALUES (1, 'PO-002', '2026-09-01', 1, 'validated')`
      );
      const token = await getToken();
      const { status, body } = await call('DELETE', '/vendors/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.error).toMatch(/2 PO/);
    });

    test('tanpa header CSRF → 403', async () => {
      await seedVendors([['PT Sepi', 'bahan_baku']]);
      const { status } = await call('DELETE', '/vendors/1');
      expect(status).toBe(403);
    });
  });
});
