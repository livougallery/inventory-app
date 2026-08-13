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
  const crypto = require('crypto');
  // Signed cookie the way cookie-signature builds it: HMAC-SHA256(sid, secret), '=' stripped.
  const SECRET = 'test-secret';
  const SID = 'test-sid';
  const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
  const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);
  let app;
  let server;
  let store;

  const getJSON = async (path) => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: 'manual',
      headers: { cookie: AUTH_COOKIE },
    });
    return { status: r.status, body: await r.json() };
  };

  beforeAll(async () => {
    const router = require('../routes/production-batches');
    app = express();
    store = new session.MemoryStore();
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    app.use('/production-batches', router);
    await new Promise(resolve => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
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
    // Fake authenticated session in the MemoryStore used by the mini-app above.
    await new Promise((resolve, reject) => {
      store.set(SID, {
        cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: '/' },
        userId: 1,
      }, err => err ? reject(err) : resolve());
    });
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
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/production-batches/1/variants`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/login');
  });
});
