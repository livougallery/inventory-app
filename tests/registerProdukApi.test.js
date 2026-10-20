// Test JSON API register-produk (features/register-produk/backend/routes.js).
//
// Mengikuti pola tests/negaraApi.test.js: mini Express app dengan MemoryStore
// session + SID palsu yang sudah ter-auth, lalu fetch ke 127.0.0.1. Skema
// `test` (tests/setup.js) men-truncate semua tabel sebelum tiap test, jadi
// tiap test menanam datanya sendiri dan id selalu mulai dari 1.
const db = require('../db');

const SECRET = 'test-secret-register-produk';
const SID = 'register-produk-sid';

const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

const BASE = '/api/register-produk';

describe('JSON API /api/register-produk (warna)', () => {
  const express = require('express');
  const session = require('express-session');
  let app, server, store;

  const call = async (method, path, opts = {}) => {
    const { body, headers, auth = true } = opts;
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

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    app.use(BASE, require('../features/register-produk/backend/routes'));
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

  describe('GET /warna', () => {
    test('tanpa session → 401 JSON', async () => {
      const { status, body } = await call('GET', BASE + '/warna', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('daftar kosong → ok dengan array kosong', async () => {
      const { status, body } = await call('GET', BASE + '/warna');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('setelah insert → muncul di daftar', async () => {
      await db.query('INSERT INTO warna (kode, nama) VALUES ($1, $2)', ['BLK', 'Black']);
      const { status, body } = await call('GET', BASE + '/warna');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ kode: 'BLK', nama: 'Black' });
    });
  });

  describe('POST /warna', () => {
    test('tanpa header CSRF → 403 JSON', async () => {
      const { status } = await call('POST', BASE + '/warna', { body: { kode: 'BLK', nama: 'Black' } });
      expect(status).toBe(403);
    });

    test('tanpa session → 401 JSON walau token valid', async () => {
      const token = await getToken();
      const { status } = await call('POST', BASE + '/warna', {
        body: { kode: 'BLK', nama: 'Black' },
        headers: { 'x-csrf-token': token },
        auth: false,
      });
      expect(status).toBe(401);
    });

    test('valid → 201', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', BASE + '/warna', {
        body: { kode: 'SEO', nama: 'Smoked Espresso' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject({ kode: 'SEO', nama: 'Smoked Espresso' });
      expect(body.data).toHaveProperty('created_at');
    });

    test('tanpa kode → 400', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', BASE + '/warna', {
        body: { nama: 'Black' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/kode/i);
    });

    test('tanpa nama → 400', async () => {
      const token = await getToken();
      const { status } = await call('POST', BASE + '/warna', {
        body: { kode: 'BLK' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
    });

    test('kode duplikat → 409', async () => {
      await db.query('INSERT INTO warna (kode, nama) VALUES ($1, $2)', ['BLK', 'Black']);
      const token = await getToken();
      const { status, body } = await call('POST', BASE + '/warna', {
        body: { kode: 'BLK', nama: 'Black 2' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/sudah ada/i);
    });

    test('kode lower auto-uppercased saat disimpan', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', BASE + '/warna', {
        body: { kode: 'blk', nama: 'Black' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(201);
      expect(body.data.kode).toBe('BLK');
    });
  });
});

describe('JSON API /api/register-produk (marketplace)', () => {
  const express = require('express');
  const session = require('express-session');
  let app, server, store;

  const call = async (method, path, opts = {}) => {
    const { body, headers, auth = true } = opts;
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

  const seedProduk = async () => {
    await db.query(`INSERT INTO users (id, username, password, role) VALUES (1, 'admin', 'x', 'admin')`);
    await db.query(`INSERT INTO warna (kode, nama) VALUES ('BLK', 'Black')`);
    await db.query(`INSERT INTO products (id, nama_produk, kategori, design_code, brand, tipe_produksi, harga_jual_default)
                     VALUES (1, 'Rowe Tee', 'T-Shirt', 'LVU-TOP-11', 'Livou', 'sendiri', 149000)`);
    await db.query(`INSERT INTO product_variants (id, product_id, warna, size, sku, stok, warna_kode)
                     VALUES (1, 1, 'Black', 'One Size', 'LVU-TOP-11-BLK', 40, 'BLK')`);
    await db.query(`SELECT setval(pg_get_serial_sequence('product_variants', 'id'), (SELECT MAX(id) FROM product_variants))`);
  };

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    app.use(BASE, require('../features/register-produk/backend/routes'));
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

  describe('GET /products/register', () => {
    test('tanpa session → 401', async () => {
      const { status } = await call('GET', BASE + '/products/register', { auth: false });
      expect(status).toBe(401);
    });

    test('daftar kosong → ok dengan array kosong', async () => {
      const { status, body } = await call('GET', BASE + '/products/register');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('produk tanpa BOM → daftar BOM kosong', async () => {
      await seedProduk();
      const { status, body } = await call('GET', BASE + '/products/register');
      expect(status).toBe(200);
      expect(body.data[0].bom).toEqual([]);
    });

    test('produk dengan varian + marketplace → struktur lengkap', async () => {
      await seedProduk();
      for (const plat of ['shopee', 'tiktok', 'shopify']) {
        await db.query('INSERT INTO product_marketplaces (product_id, platform) VALUES ($1, $2)', [1, plat]);
      }
      const material = (await db.query(
        `INSERT INTO raw_materials (nama, tipe, jenis, satuan)
         VALUES ('Cotton Combed', 'kain', 'roll', 'm') RETURNING id`
      )).rows[0];
      await db.query(
        `INSERT INTO product_bom (variant_id, raw_material_id, qty_per_pcs)
         VALUES (1, $1, 1.25)`,
        [material.id]
      );

      const { status, body } = await call('GET', BASE + '/products/register');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);

      const p = body.data[0];
      expect(p).toMatchObject({
        id: 1,
        nama: 'Rowe Tee',
        design_code: 'LVU-TOP-11',
        brand: 'Livou',
        kategori: 'T-Shirt',
      });
      expect(p.varian).toHaveLength(1);
      expect(p.varian[0]).toMatchObject({
        warna: 'Black',
        warna_kode: 'BLK',
        size: 'One Size',
        sku: 'LVU-TOP-11-BLK',
        stok: 40,
      });
      expect(p.marketplaces).toHaveLength(3);
      expect(p.marketplaces.map(m => m.platform).sort()).toEqual(['shopee', 'shopify', 'tiktok']);
      expect(p.bom).toEqual([
        expect.objectContaining({
          variant_id: 1,
          raw_material_id: expect.any(Number),
          qty_per_pcs: 1.25,
          no_need: false,
          nama: 'Cotton Combed',
          jenis: 'roll',
          satuan: 'm',
          warna: 'Black',
          size: 'One Size',
        }),
      ]);
    });
  });

  describe('POST /products/register', () => {
    test('valid body → 201 + varian + 3 marketplace', async () => {
      // Warna master harus ada dulu — varian punya FK ke warna
      await db.query('INSERT INTO warna (kode, nama) VALUES ($1, $2)', ['BLK', 'Black']);
      const token = await getToken();
      const { status, body } = await call('POST', BASE + '/products/register', {
        body: {
          nama_produk: 'New Hoodie',
          kategori: 'Outer',
          design_code: 'LVU-TOP-22',
          brand: 'Livou',
          tipe_produksi: 'sendiri',
          harga: 249000,
          varian: [
            { warna: 'Black', size: 'M', sku: 'LVU-TOP-22-BLK-M', stok: 10 },
            { warna: 'Black', size: 'L', sku: 'LVU-TOP-22-BLK-L', stok: 15 },
          ],
          warna_kode: { 'Black': 'BLK' },
        },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(201);
      expect(body.ok).toBe(true);
      const p = body.data;
      expect(p.nama).toBe('New Hoodie');
      expect(p.design_code).toBe('LVU-TOP-22');
      expect(p.varian).toHaveLength(2);
      expect(p.varian[0].warna_kode).toBe('BLK');
      expect(p.marketplaces).toHaveLength(3);
      expect(p.marketplaces.every(m => m.terdaftar === false)).toBe(true);

      const dbRow = await db.query('SELECT * FROM products WHERE nama_produk = $1', ['New Hoodie']);
      expect(dbRow.rows).toHaveLength(1);
      const dbVariants = await db.query('SELECT * FROM product_variants WHERE product_id = $1', [dbRow.rows[0].id]);
      expect(dbVariants.rows).toHaveLength(2);
      const dbMp = await db.query('SELECT * FROM product_marketplaces WHERE product_id = $1', [dbRow.rows[0].id]);
      expect(dbMp.rows).toHaveLength(3);
    });

    test('tanpa nama_produk → 400', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', BASE + '/products/register', {
        body: { kategori: 'Outer' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
    });

    test('tanpa header CSRF → 403', async () => {
      const { status } = await call('POST', BASE + '/products/register', {
        body: { nama_produk: 'New' },
      });
      expect(status).toBe(403);
    });

    test('tanpa session → 401', async () => {
      const token = await getToken();
      const { status } = await call('POST', BASE + '/products/register', {
        body: { nama_produk: 'New' },
        headers: { 'x-csrf-token': token },
        auth: false,
      });
      expect(status).toBe(401);
    });
  });

  describe('PUT /products/register/:id', () => {
    test('mengubah design code dan brand produk', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1', {
        body: { design_code: 'LVU-TOP-12', brand: 'Livou Studio' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ id: 1, design_code: 'LVU-TOP-12', brand: 'Livou Studio' });
      const stored = await db.query('SELECT design_code, brand FROM products WHERE id = 1');
      expect(stored.rows[0]).toEqual({ design_code: 'LVU-TOP-12', brand: 'Livou Studio' });
    });

    test('tanpa design_code/brand → 400, pesannya menyebut "SKU Produk"', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1', {
        body: { design_code: '   ', brand: 'Livou' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      // Labelnya diganti "SKU Produk" 19 Okt 2026; pesan ke pengguna ikut.
      expect(body.error).toBe('SKU Produk dan Brand wajib diisi');
    });

    test('mengubah kategori dan tanggal daftar', async () => {
      await seedProduk();
      /* Waktu ditanam eksplisit supaya jam-menitnya bisa diperiksa. `<input
         type="date">` hanya mengirim tanggal; kalau ditulis apa adanya ke
         created_at, jam pendaftaran yang asli jatuh ke 00:00 dan produk
         terlihat didaftarkan tengah malam. */
      await db.query(`UPDATE products SET created_at = '2026-01-15 13:45:30' WHERE id = 1`);
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1', {
        body: {
          design_code: 'LVU-TOP-11',
          brand: 'Livou',
          kategori: 'Outer',
          register_date: '2026-03-02',
        },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ id: 1, kategori: 'Outer' });

      const stored = await db.query('SELECT kategori, created_at FROM products WHERE id = 1');
      expect(stored.rows[0].kategori).toBe('Outer');
      const tgl = new Date(stored.rows[0].created_at);
      expect([tgl.getFullYear(), tgl.getMonth() + 1, tgl.getDate()]).toEqual([2026, 3, 2]);
      // Jam-menit-detiknya milik pendaftaran yang lama, bukan 00:00:00
      expect([tgl.getHours(), tgl.getMinutes(), tgl.getSeconds()]).toEqual([13, 45, 30]);
    });

    test('mengubah nama produk', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1', {
        body: { design_code: 'LVU-TOP-11', brand: 'Livou', nama_produk: '  Rowe Tee Baru  ' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      // Dirapikan server, dan yang dikembalikan adalah nilai yang BENAR-BENAR
      // tersimpan — bukan yang dikirim apa adanya.
      expect(body.data).toMatchObject({ id: 1, nama_produk: 'Rowe Tee Baru' });
      const stored = await db.query('SELECT nama_produk FROM products WHERE id = 1');
      expect(stored.rows[0].nama_produk).toBe('Rowe Tee Baru');
    });

    test('nama_produk kosong → 400, bukan 500 dari constraint NOT NULL', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1', {
        body: { design_code: 'LVU-TOP-11', brand: 'Livou', nama_produk: '   ' },
        headers: { 'x-csrf-token': token },
      });
      // 400 dengan pesan yang menunjuk kolomnya. Tanpa penjagaan ini, string
      // kosong lolos ke UPDATE kolom NOT NULL dan keluar sebagai 500 "Gagal
      // memperbarui identitas produk" — pesan yang menyalahkan seluruh
      // permintaan, bukan kolom yang salah.
      expect(status).toBe(400);
      expect(body.error).toBe('Nama produk wajib diisi');
      const stored = await db.query('SELECT nama_produk FROM products WHERE id = 1');
      expect(stored.rows[0].nama_produk).toBe('Rowe Tee');
    });

    test('tanpa kategori/register_date → kolom lama tidak ikut dikosongkan', async () => {
      await seedProduk();
      await db.query(`UPDATE products SET created_at = '2026-01-15 13:45:30' WHERE id = 1`);
      const token = await getToken();
      // Pemanggil lama hanya mengirim dua kolom; sisanya harus utuh.
      const { status } = await call('PUT', BASE + '/products/register/1', {
        body: { design_code: 'LVU-TOP-12', brand: 'Livou Studio' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      const stored = await db.query('SELECT kategori, created_at, nama_produk FROM products WHERE id = 1');
      expect(stored.rows[0].kategori).toBe('T-Shirt');
      // Nama juga ikut utuh: kalau `nama_produk` ditulis tanpa COALESCE,
      // pemanggil lama yang tidak mengirimnya akan mengosongkan nama produk —
      // pelanggaran NOT NULL yang muncul sebagai 500.
      expect(stored.rows[0].nama_produk).toBe('Rowe Tee');
      const tgl = new Date(stored.rows[0].created_at);
      expect([tgl.getFullYear(), tgl.getMonth() + 1, tgl.getDate()]).toEqual([2026, 1, 15]);
    });

    test('register_date bukan YYYY-MM-DD → 400, tidak ada yang ikut berubah', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1', {
        body: { design_code: 'LVU-TOP-12', brand: 'Livou', register_date: '15/01/2026' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.error).toBe('Tanggal daftar harus berformat YYYY-MM-DD');
      const stored = await db.query('SELECT design_code, brand FROM products WHERE id = 1');
      expect(stored.rows[0]).toEqual({ design_code: 'LVU-TOP-11', brand: 'Livou' });
    });
  });

  describe('PUT /products/register/:id/variants', () => {
    test('mengizinkan mengosongkan seluruh size jika tidak memiliki riwayat', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1/variants', {
        body: { warna_kode: 'BLK', variants: [], hapus_semua: true },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.data).toEqual([]);
      expect((await db.query('SELECT id FROM product_variants WHERE product_id = 1')).rows).toEqual([]);
    });

    test('menolak penghapusan varian yang memiliki riwayat', async () => {
      await seedProduk();
      const batch = (await db.query(
        `INSERT INTO production_batches (product_id, nama_batch, tgl_mulai, jenis_produksi, jumlah_dipesan)
         VALUES (1, 'B-1', '2026-10-16', 'in_house', 1) RETURNING id`
      )).rows[0];
      await db.query(
        `INSERT INTO production_costs (batch_id, variant_id, tipe_biaya, biaya) VALUES ($1, 1, 'others', 10)`,
        [batch.id]
      );
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/1/variants', {
        body: { warna_kode: 'BLK', variants: [], hapus_semua: true },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect((await db.query('SELECT id FROM product_variants WHERE id = 1')).rows).toHaveLength(1);
    });

    test('memindahkan warna tanpa mengganti ID varian', async () => {
      await seedProduk();
      await db.query("INSERT INTO warna (kode, nama) VALUES ('WHT', 'White')");
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1/variants', {
        body: {
          warna_kode: 'BLK',
          warna_kode_baru: 'WHT',
          variants: [{ id: 1, size: 'One Size' }],
        },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.data).toEqual([expect.objectContaining({ id: 1, warna: 'White', warna_kode: 'WHT' })]);
      expect((await db.query('SELECT id FROM product_variants WHERE product_id = 1 AND warna_kode = $1', ['BLK'])).rows).toEqual([]);
    });

    test('menolak pemindahan warna ke warna yang sudah dipakai produk', async () => {
      await seedProduk();
      await db.query("INSERT INTO warna (kode, nama) VALUES ('WHT', 'White')");
      await db.query(`INSERT INTO product_variants (id, product_id, warna, size, sku, stok, warna_kode)
                      VALUES (2, 1, 'White', 'M', 'LVU-TOP-11-WHT-M', 0, 'WHT')`);
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/1/variants', {
        body: {
          warna_kode: 'BLK',
          warna_kode_baru: 'WHT',
          variants: [{ id: 1, size: 'One Size' }],
        },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect((await db.query('SELECT id FROM product_variants WHERE product_id = 1 ORDER BY id')).rows).toHaveLength(2);
    });

    test('menolak size duplikat sebelum menyimpan', async () => {
      await seedProduk();
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/1/variants', {
        body: { warna_kode: 'BLK', variants: [{ id: 1, size: 'M' }, { size: 'M' }] },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
    });

    test('mempertahankan varian yang ada dan menambah size baru', async () => {
      await seedProduk();
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1/variants', {
        body: {
          warna_kode: 'BLK',
          variants: [
            { id: 1, size: 'One Size' },
            { size: 'XL' },
          ],
        },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 1, size: 'One Size', sku: 'LVU-TOP-11-BLK' }),
        expect.objectContaining({ size: 'XL', sku: 'LVU-TOP-11-BLK-XL' }),
      ]));
    });
  });

  describe('PUT /products/register/:id/bom', () => {
    test('menyimpan keputusan bahan dan no-need untuk semua size pada warna itu', async () => {
      await seedProduk();
      await db.query(
        `INSERT INTO product_variants (id, product_id, warna, size, sku, stok, warna_kode)
         VALUES (2, 1, 'Black', 'L', 'LVU-TOP-11-BLK-L', 0, 'BLK')`
      );
      const material = (await db.query(
        `INSERT INTO raw_materials (nama, tipe, jenis, satuan)
         VALUES ('Cotton Combed', 'kain', 'roll', 'm') RETURNING id`
      )).rows[0];
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1/bom', {
        body: {
          warna_kode: 'BLK',
          keputusan: [
            { jenis: 'roll', raw_material_id: material.id, qty_per_pcs: 1.25 },
            { jenis: 'label', no_need: true },
          ],
        },
        headers: { 'x-csrf-token': token },
      });

      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(4);
      expect(body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ size: 'L', raw_material_id: material.id, qty_per_pcs: 1.25, no_need: false }),
        expect.objectContaining({ size: 'L', raw_material_id: null, qty_per_pcs: 0, no_need: true }),
        expect.objectContaining({ size: 'One Size', raw_material_id: material.id, qty_per_pcs: 1.25, no_need: false }),
        expect.objectContaining({ size: 'One Size', raw_material_id: null, qty_per_pcs: 0, no_need: true }),
      ]));
    });

    // Keputusan "no need" tidak punya material, jadi `jenis`-nya TIDAK bisa
    // dibaca lewat join ke `raw_materials` — join-nya kosong untuk baris ini.
    // Kalau jenisnya hilang, barisnya tersimpan tapi tidak terbaca kembali,
    // dan di layar ia terlihat seperti belum pernah disimpan.
    test('keputusan no-need tetap terbaca jenisnya saat daftar dimuat ulang', async () => {
      await seedProduk();
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/1/bom', {
        body: {
          warna_kode: 'BLK',
          keputusan: [{ jenis: 'label', no_need: true }],
        },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);

      const daftar = await call('GET', BASE + '/products/register');
      expect(daftar.status).toBe(200);
      expect(daftar.body.data[0].bom).toEqual([
        expect.objectContaining({
          raw_material_id: null,
          no_need: true,
          jenis: 'label',
        }),
      ]);
    });
  });

  describe('PUT /products/register/:id/marketplace', () => {
    test('update status terdaftar → 200', async () => {
      await seedProduk();
      await db.query('INSERT INTO product_marketplaces (product_id, platform, terdaftar) VALUES (1, $1, FALSE)', ['shopee']);
      const token = await getToken();
      const { status, body } = await call('PUT', BASE + '/products/register/1/marketplace', {
        body: { platform: 'shopee', terdaftar: true },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.platform).toBe('shopee');
      expect(body.data.terdaftar).toBe(true);
    });

    test('id tak dikenal → 404', async () => {
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/999/marketplace', {
        body: { platform: 'shopee', terdaftar: true },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
    });

    test('id bukan angka → 404', async () => {
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/abc/marketplace', {
        body: { platform: 'shopee', terdaftar: true },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
    });

    test('platform tidak valid → 400', async () => {
      await seedProduk();
      const token = await getToken();
      const { status } = await call('PUT', BASE + '/products/register/1/marketplace', {
        body: { platform: 'lazada', terdaftar: true },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
    });
  });
});
