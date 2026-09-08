/**
 * Test tiket 11e (Kategori + Jenis) dan 11f (Lokasi).
 *
 * Mengikuti pola materialsApi.test.js: mini Express app dengan MemoryStore
 * session + SID ter-auth, skema `test` di-truncate oleh tests/setup.js.
 *
 * Dua tiket ini menyentuh skema produksi — db.js menjalankan
 * bootstrapSchema() saat boot, jadi perubahan di sini otomatis berlaku di
 * live DB. Karena itu testnya ditulis DULU (merah), sebelum skema diubah.
 */
const db = require('../db');

const SECRET = 'test-secret-kat-lok';
const SID = 'kat-lok-sid';

const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

// Peta nilai yang sudah disepakati owner, 4 September 2026.
// Urutan Aksesoris persis seperti yang owner sebutkan.
const JENIS_AKSESORIS = [
  'hak kait', 'kancing', 'resleting', 'karet', 'label', 'renda', 'kain pelapis',
];

const DUA_LOKASI = ['Gudang (Livou HQ Office)', 'Konveksi'];

describe('Kategori + Jenis (11e) dan Lokasi (11f)', () => {
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

  const getToken = async () => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/__token`, { headers: { cookie: AUTH_COOKIE } });
    return (await r.json()).t;
  };

  // Material dengan kategori (tipe) dan jenis tertentu.
  const seed = (nama, tipe, jenis = null, lokasiId = null) =>
    db.query(
      `INSERT INTO raw_materials (nama, tipe, jenis, lokasi_id, satuan)
       VALUES ($1, $2, $3, $4, 'pcs')`,
      [nama, tipe, jenis, lokasiId]
    );

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    app.use('/materials', require('../features/material/backend/routes'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

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

  // ===== 11e: Kategori + Jenis =====

  describe('11e — Kategori dan Jenis', () => {
    test('tiga nilai kategori diterima CHECK constraint', async () => {
      await seed('Mat Kain', 'kain', 'roll');
      await seed('Mat Aks', 'aksesoris', 'kancing');
      await seed('Mat CMT', 'cmt_cost', null);

      const rows = (await db.query('SELECT tipe, jenis FROM raw_materials ORDER BY id')).rows;
      expect(rows.map((r) => r.tipe)).toEqual(['kain', 'aksesoris', 'cmt_cost']);
    });

    test('nilai kategori lama (kain_roll) ditolak', async () => {
      // Kalau CHECK belum diganti, INSERT ini justru BERHASIL — itulah sinyal
      // merahnya. Nilai lama harus benar-benar tidak bisa masuk lagi.
      await expect(seed('Lama', 'kain_roll', 'roll')).rejects.toThrow();
    });

    test('jenis bisa NULL — Product Fulfillment tidak punya Jenis', async () => {
      await seed('Jahit Konveksi', 'cmt_cost', null);
      const row = (await db.query('SELECT jenis FROM raw_materials WHERE id = 1')).rows[0];
      expect(row.jenis).toBeNull();
    });

    test('ketujuh jenis aksesoris owner diterima, persis dan berurutan', async () => {
      for (let i = 0; i < JENIS_AKSESORIS.length; i++) {
        await seed(`Aks ${i}`, 'aksesoris', JENIS_AKSESORIS[i]);
      }
      const rows = (await db.query('SELECT jenis FROM raw_materials ORDER BY id')).rows;
      expect(rows.map((r) => r.jenis)).toEqual(JENIS_AKSESORIS);
    });

    test('kain hanya menerima roll dan ecer', async () => {
      await seed('Kain Roll', 'kain', 'roll');
      await seed('Kain Ecer', 'kain', 'ecer');
      const rows = (await db.query('SELECT jenis FROM raw_materials ORDER BY id')).rows;
      expect(rows.map((r) => r.jenis)).toEqual(['roll', 'ecer']);
    });

    test('jenis di luar daftar tetap ditolak', async () => {
      // Ini gunanya daftar tetap: mencegah ejaan baru menyusup.
      await expect(seed('Aneh', 'aksesoris', 'baut')).rejects.toThrow();
    });

    test('jenis kain ditolak untuk kategori aksesoris', async () => {
      await expect(seed('Salah', 'aksesoris', 'roll')).rejects.toThrow();
    });

    test('GET /materials mengirim jenis dan jenis_label, NULL tetap null', async () => {
      await seed('Kancing', 'aksesoris', 'kancing');
      await seed('Jahit', 'cmt_cost', null);

      const { body } = await call('GET', '/materials');
      const kancing = body.data.find((r) => r.nama === 'Kancing');
      const jahit = body.data.find((r) => r.nama === 'Jahit');

      expect(kancing.jenis).toBe('kancing');
      expect(kancing.jenis_label).toBe('Kancing');
      // Syarat tiket: NULL tidak boleh tampil sebagai string "null" atau
      // "undefined" di tabel.
      expect(jahit.jenis).toBeNull();
      expect(jahit.jenis_label).toBeNull();
    });

    test('kategori_label mengikuti tiga nama baru', async () => {
      await seed('Kain A', 'kain', 'roll');
      await seed('PF', 'cmt_cost', null);
      const { body } = await call('GET', '/materials');
      expect(body.data.find((r) => r.nama === 'Kain A').kategori_label).toBe('Kain');
      expect(body.data.find((r) => r.nama === 'PF').kategori_label).toBe('Product Fulfillment');
    });
  });

  // ===== 11f: Lokasi =====

  describe('11f — Lokasi Barang', () => {
    test('locations tersedia dengan tepat dua nilai owner', async () => {
      const rows = (await db.query('SELECT nama FROM locations ORDER BY id')).rows;
      expect(rows.map((r) => r.nama)).toEqual(DUA_LOKASI);
    });

    test('lokasi_id nullable — material tanpa lokasi tetap valid', async () => {
      await seed('Tanpa Lokasi', 'kain', 'roll');
      const row = (await db.query('SELECT lokasi_id FROM raw_materials WHERE id = 1')).rows[0];
      expect(row.lokasi_id).toBeNull();
    });

    test('nama lokasi duplikat (beda huruf besar) ditolak', async () => {
      // Alasan lookup table: "gudang" tidak boleh hidup berdampingan dengan
      // "Gudang". Uniqueness-nya case-insensitive.
      await expect(
        db.query(`INSERT INTO locations (nama) VALUES ('gudang (livou hq office)')`)
      ).rejects.toThrow();
    });

    test('GET /materials mengirim lokasi_nama yang diputuskan server-side', async () => {
      const lokasi = (await db.query('SELECT id FROM locations ORDER BY id LIMIT 1')).rows[0];
      await seed('Kain Berlokasi', 'kain', 'roll', lokasi.id);

      const { body } = await call('GET', '/materials');
      const row = body.data.find((r) => r.nama === 'Kain Berlokasi');
      // Syarat tiket: frontend tidak boleh memetakan id → label sendiri.
      expect(row.lokasi_nama).toBe(DUA_LOKASI[0]);
    });

    test('material tanpa lokasi → lokasi_nama null, bukan string "null"', async () => {
      await seed('Kosong', 'kain', 'roll');
      const { body } = await call('GET', '/materials');
      expect(body.data.find((r) => r.nama === 'Kosong').lokasi_nama).toBeNull();
    });

    test('lokasi_id yang tidak ada ditolak FK', async () => {
      await expect(seed('Hantu', 'kain', 'roll', 999999)).rejects.toThrow();
    });

    test('jenis dan lokasi_id bisa disimpan lewat PUT /materials/:id', async () => {
      // EDITABLE_FIELDS harus memuat keduanya, kalau tidak nilai ini diam-diam
      // terbuang — tidak ada error, hanya tidak tersimpan.
      await seed('Kancing', 'aksesoris', null);
      const lokasi = (await db.query('SELECT id FROM locations ORDER BY id LIMIT 1')).rows[0];
      const token = await getToken();

      const { status } = await call('PUT', '/materials/1', {
        body: { jenis: 'kancing', lokasi_id: lokasi.id },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);

      const row = (await db.query('SELECT jenis, lokasi_id FROM raw_materials WHERE id = 1')).rows[0];
      expect(row.jenis).toBe('kancing');
      expect(Number(row.lokasi_id)).toBe(lokasi.id);
    });
  });
});
