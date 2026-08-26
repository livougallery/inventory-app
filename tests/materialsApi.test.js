/**
 * Test JSON API /api/materials (features/material/backend/routes.js).
 *
 * Mengikuti pola productionBatches.test.js: mini Express app dengan
 * MemoryStore session + SID palsu yang sudah ter-auth, lalu fetch ke
 * 127.0.0.1. Skema `test` (tests/setup.js) men-truncate semua tabel
 * sebelum tiap test, jadi tiap test menanam datanya sendiri dan id
 * selalu mulai dari 1.
 */
const db = require('../db');

const SECRET = 'test-secret-materials';
const SID = 'materials-sid';

// Signed cookie ala cookie-signature: HMAC-SHA256(sid, secret), '=' dibuang.
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('JSON API /api/materials', () => {
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
    app.use('/materials', require('../features/material/backend/routes'));
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

  // Material standar untuk test join/read.
  const seedMaterial = async () => {
    await db.query(
      `INSERT INTO raw_materials (kode_bahan, nama, tipe, satuan, stok, stok_minimum)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['KB-001', 'Kain Cotton', 'kain_roll', 'Roll', 10, 5]
    );
    // Dua batch pembelian: harga_terakhir harus ambil yang termuda.
    await db.query(
      `INSERT INTO material_batches (raw_material_id, source_type, qty_awal, qty_sisa, harga_satuan, tgl_masuk)
       VALUES (1, 'po', 50, 20, 20000, '2026-08-01'), (1, 'po', 30, 30, 25000, '2026-08-10')`
    );
    await db.query(
      `INSERT INTO raw_material_variants (raw_material_id, nama_varian, stok)
       VALUES (1, 'Putih', 6), (1, 'Hitam', 4)`
    );
    await db.query(
      `INSERT INTO raw_material_photos (raw_material_id, file_path)
       VALUES (1, 'lama.jpg'), (1, 'terbaru.jpg')`
    );
  };

  describe('GET /materials', () => {
    test('tanpa session → 401 JSON', async () => {
      const { status, body } = await call('GET', '/materials', { auth: false });
      expect(status).toBe(401);
      expect(body.ok).toBe(false);
    });

    test('mengembalikan baris dengan hasil join: harga_terakhir, varian_list, foto_path, tipe_label', async () => {
      await seedMaterial();
      const { status, body } = await call('GET', '/materials');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      const row = body.data[0];
      expect(row.kode_bahan).toBe('KB-001');
      expect(row.nama).toBe('Kain Cotton');
      expect(row.tipe_label).toBe('Fabric Roll');   // map label kain_roll
      expect(Number(row.harga_terakhir)).toBe(25000); // batch tgl 08-10, bukan 08-01
      expect(row.varian_list).toContain('Putih');
      expect(row.varian_list).toContain('Hitam');
      expect(row.foto_path).toBe('terbaru.jpg');     // foto id terbesar
    });

    test('material tanpa pembelian/varian/foto → nilai join kosong, tetap muncul', async () => {
      await db.query(
        `INSERT INTO raw_materials (kode_bahan, nama, tipe, satuan, stok)
         VALUES ('KB-002', 'Benang Merah', 'aksesoris', 'PCS', 0)`
      );
      const { status, body } = await call('GET', '/materials');
      expect(status).toBe(200);
      const row = body.data.find((r) => r.kode_bahan === 'KB-002');
      expect(row.harga_terakhir).toBeNull();
      expect(row.varian_list).toBe('');
      expect(row.foto_path).toBe('');
      expect(row.tipe_label).toBe('Aksesoris');
    });
  });

  describe('POST /materials', () => {
    test('tanpa header CSRF → 403', async () => {
      const { status } = await call('POST', '/materials', {
        body: { kode_bahan: 'KB-003', nama: 'Resleting', tipe: 'aksesoris', satuan: 'PCS' },
      });
      expect(status).toBe(403);
    });

    test('valid → 201 dan baris tersimpan', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/materials', {
        body: { kode_bahan: 'KB-003', nama: 'Resleting', tipe: 'aksesoris', satuan: 'PCS', stok_minimum: 100 },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBeGreaterThan(0);

      const rows = (await db.query('SELECT * FROM raw_materials WHERE kode_bahan = $1', ['KB-003'])).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].nama).toBe('Resleting');
      expect(Number(rows[0].stok_minimum)).toBe(100);
    });

    test('field stok ikut dikirim pun diabaikan (stok hanya dari pembelian)', async () => {
      const token = await getToken();
      await call('POST', '/materials', {
        body: { kode_bahan: 'KB-004', nama: 'Kain Spam', tipe: 'kain_roll', satuan: 'Roll', stok: 999 },
        headers: { 'x-csrf-token': token },
      });
      const row = (await db.query('SELECT stok FROM raw_materials WHERE kode_bahan = $1', ['KB-004'])).rows[0];
      expect(Number(row.stok)).not.toBe(999);
    });

    test('tanpa nama → 400', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/materials', {
        body: { kode_bahan: 'KB-005', tipe: 'aksesoris', satuan: 'PCS' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  describe('PUT /materials/:id', () => {
    test('memperbarui field deskriptif, stok tidak tersentuh', async () => {
      await seedMaterial(); // stok = 10
      const token = await getToken();
      const { status, body } = await call('PUT', '/materials/1', {
        body: { kode_bahan: 'KB-001X', nama: 'Kain Cotton Update', tipe: 'kain_ecer', satuan: 'Yard', stok_minimum: 8, stok: 999 },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const row = (await db.query('SELECT * FROM raw_materials WHERE id = 1')).rows[0];
      expect(row.nama).toBe('Kain Cotton Update');
      expect(row.kode_bahan).toBe('KB-001X');
      expect(row.tipe).toBe('kain_ecer');
      expect(Number(row.stok_minimum)).toBe(8);
      expect(Number(row.stok)).toBe(10); // stok TIDAK berubah
    });

    test('id tak dikenal → 404', async () => {
      const token = await getToken();
      const { status } = await call('PUT', '/materials/999', {
        body: { nama: 'Hantu' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
    });
  });

  describe('DELETE /materials/:id', () => {
    test('tanpa riwayat pembelian → terhapus beserta varian/foto (cascade)', async () => {
      // Material bersih tanpa batch pembelian (seedMaterial selalu punya batch).
      await db.query(
        `INSERT INTO raw_materials (kode_bahan, nama, tipe, satuan, stok)
         VALUES ('KB-BERSIH', 'Kain Bersih', 'kain_roll', 'Roll', 3)`
      );
      await db.query(
        `INSERT INTO raw_material_variants (raw_material_id, nama_varian, stok)
         VALUES ((SELECT id FROM raw_materials WHERE kode_bahan='KB-BERSIH'), 'Putih', 3)`
      );
      const cleanId = (await db.query("SELECT id FROM raw_materials WHERE kode_bahan='KB-BERSIH'")).rows[0].id;
      const token = await getToken();
      const { status, body } = await call('DELETE', `/materials/${cleanId}`, {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const left = (await db.query(
        `SELECT
           (SELECT COUNT(*) FROM raw_materials WHERE id = $1) AS rm,
           (SELECT COUNT(*) FROM raw_material_variants WHERE raw_material_id = $1) AS rv`,
        [cleanId]
      )).rows[0];
      expect(Number(left.rm)).toBe(0);
      expect(Number(left.rv)).toBe(0);
    });

    test('punya riwayat batch pembelian → ditolak dengan pesan jelas, baris utuh', async () => {
      await seedMaterial();
      // Material 1 sudah punya 2 material_batches dari seedMaterial.
      const token = await getToken();
      const { status, body } = await call('DELETE', '/materials/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/pembelian/i);

      const still = (await db.query('SELECT COUNT(*) AS n FROM raw_materials WHERE id = 1')).rows[0];
      expect(Number(still.n)).toBe(1);
    });
  });
});
