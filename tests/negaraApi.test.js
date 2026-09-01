/**
 * Test JSON API /api/negara (features/negara/backend/routes.js).
 *
 * Mengikuti pola tests/materialsApi.test.js: mini Express app dengan
 * MemoryStore session + SID palsu yang sudah ter-auth, lalu fetch ke
 * 127.0.0.1. Skema `test` (tests/setup.js) men-truncate semua tabel
 * sebelum tiap test, jadi tiap test menanam datanya sendiri dan id
 * selalu mulai dari 1.
 */
const db = require('../db');

const SECRET = 'test-secret-negara';
const SID = 'negara-sid';

// Signed cookie ala cookie-signature: HMAC-SHA256(sid, secret), '=' dibuang.
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('JSON API /api/negara', () => {
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
    app.use('/negara', require('../features/negara/backend/routes'));
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

  const seedNegara = async (names) => {
    for (const nama of names) {
      await db.query('INSERT INTO negara (nama) VALUES ($1)', [nama]);
    }
  };

  // Baris purchase_imports butuh product_variants (→ products), vendors, users.
  const seedImport = async ({ negaraId = null } = {}) => {
    await db.query(`INSERT INTO users (id, username, password, role) VALUES (1, 'admin', 'x', 'admin')`);
    await db.query(`INSERT INTO vendors (id, nama, tipe) VALUES (1, 'AS Studio', 'import')`);
    await db.query(`INSERT INTO products (id, nama_produk, tipe_produksi) VALUES (1, 'Row Pants', 'beli_jadi')`);
    await db.query(
      `INSERT INTO product_variants (id, product_id, warna, size, sku)
       VALUES (1, 1, 'Hitam', 'M', 'RP-HITAM-M')`
    );
    await db.query(
      `INSERT INTO purchase_imports
         (variant_id, vendor_id, tgl_beli, qty, harga_produk, hpp_per_item, created_by, negara_id)
       VALUES (1, 1, '2026-08-31', 10, 50000, 50000, 1, $1)`,
      [negaraId]
    );
  };

  describe('GET /negara', () => {
    test('tanpa session → 401 JSON', async () => {
      const { status, body } = await call('GET', '/negara', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('daftar kosong → ok dengan array kosong', async () => {
      const { status, body } = await call('GET', '/negara');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('diurutkan alfabetis menurut nama', async () => {
      await seedNegara(['Vietnam', 'China', 'Thailand']);
      const { status, body } = await call('GET', '/negara');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.map((r) => r.nama)).toEqual(['China', 'Thailand', 'Vietnam']);
    });
  });

  describe('POST /negara', () => {
    test('tanpa header CSRF → 403 JSON', async () => {
      const { status, body } = await call('POST', '/negara', { body: { nama: 'China' } });
      expect(status).toBe(403);
      expect(body.ok).toBe(false);
    });

    test('tanpa session → 401 JSON walau token valid', async () => {
      const { status } = await call('POST', '/negara', { body: { nama: 'China' }, auth: false });
      expect(status).toBe(401);
    });

    test('valid → 201 dan baris tersimpan', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/negara', {
        body: { nama: 'China' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBeGreaterThan(0);
      expect(body.data.nama).toBe('China');

      const row = (await db.query('SELECT * FROM negara WHERE nama = $1', ['China'])).rows[0];
      expect(row).toBeDefined();
      expect(Number(row.is_active)).toBe(1);
    });

    test('tanpa nama → 400', async () => {
      const token = await getToken();
      const { status, body } = await call('POST', '/negara', {
        body: {},
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/nama/i);
    });

    test('nama hanya spasi → 400', async () => {
      const token = await getToken();
      const { status } = await call('POST', '/negara', {
        body: { nama: '   ' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(400);
    });

    test('nama sudah ada → 409, bukan 500 dari database', async () => {
      await seedNegara(['China']);
      const token = await getToken();
      const { status, body } = await call('POST', '/negara', {
        body: { nama: 'China' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/sudah ada/i);

      const count = (await db.query('SELECT COUNT(*)::int AS c FROM negara')).rows[0];
      expect(Number(count.c)).toBe(1);
    });

    test('nama beda huruf besar-kecil saja → 409', async () => {
      await seedNegara(['China']);
      const token = await getToken();
      const { status, body } = await call('POST', '/negara', {
        body: { nama: 'CHINA' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);
    });

    test('pre-check lolos tapi unique index menolak → 409, bukan 500', async () => {
      // Pre-check findByName memakai predikat yang sama dengan unique index
      // uq_negara_nama (LOWER(nama)), jadi di jalur normal ia selalu menangkap
      // duplikat lebih dulu. Yang tersisa hanyalah balapan: dua request lolos
      // pre-check bersamaan, lalu salah satu INSERT menabrak index.
      //
      // Balapan itu tidak bisa direproduksi deterministik lewat dua request
      // paralel (keduanya berbagi satu sesi, jadi yang kedua justru kena rotasi
      // CSRF), maka kondisinya direkayasa: pre-check dipaksa menjawab "tidak
      // ada" sementara INSERT tetap jalan betulan ke database. Permintaannya
      // sendiri tetap lewat HTTP.
      // Di-bind: db.query dipanggil lepas dari objeknya, jadi `this` harus
      // diikat ke db supaya `this.pool` di dalam Db#query tetap terbaca.
      const realQuery = db.query.bind(db);
      db.query = async (sql, params) => {
        if (String(sql).includes('SELECT id FROM negara WHERE LOWER(nama)')) {
          return { rows: [], rowCount: 0 };
        }
        return realQuery(sql, params);
      };

      try {
        // Tulis dulu lewat SQL supaya INSERT berikutnya pasti menabrak index.
        await seedNegara(['China']);
        const token = await getToken();
        const { status, body } = await call('POST', '/negara', {
          body: { nama: 'china' },
          headers: { 'x-csrf-token': token },
        });
        expect(status).toBe(409);
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/sudah ada/i);
      } finally {
        db.query = realQuery;
      }

      const count = (await db.query('SELECT COUNT(*)::int AS c FROM negara')).rows[0];
      expect(Number(count.c)).toBe(1);
    });
  });

  describe('PUT /negara/:id', () => {
    test('mengubah nama → 200 dan tersimpan', async () => {
      await seedNegara(['Cina']);
      const token = await getToken();
      const { status, body } = await call('PUT', '/negara/1', {
        body: { nama: 'China' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.nama).toBe('China');

      const row = (await db.query('SELECT nama FROM negara WHERE id = 1')).rows[0];
      expect(row.nama).toBe('China');
    });

    test('id tak dikenal → 404', async () => {
      const token = await getToken();
      const { status, body } = await call('PUT', '/negara/999', {
        body: { nama: 'Hantu' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
      expect(body.ok).toBe(false);
    });

    test('rename ke nama yang sudah dipakai negara lain → 409', async () => {
      await seedNegara(['China', 'Thailand']);
      const token = await getToken();
      const { status, body } = await call('PUT', '/negara/2', {
        body: { nama: 'china' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);

      const row = (await db.query('SELECT nama FROM negara WHERE id = 2')).rows[0];
      expect(row.nama).toBe('Thailand');
    });

    test('rename ke namanya sendiri → 200 (bukan konflik diri sendiri)', async () => {
      await seedNegara(['China']);
      const token = await getToken();
      const { status } = await call('PUT', '/negara/1', {
        body: { nama: 'China' },
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
    });
  });

  describe('DELETE /negara/:id', () => {
    test('negara tak dipakai → terhapus', async () => {
      await seedNegara(['China']);
      const token = await getToken();
      const { status, body } = await call('DELETE', '/negara/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const left = (await db.query('SELECT COUNT(*)::int AS c FROM negara WHERE id = 1')).rows[0];
      expect(Number(left.c)).toBe(0);
    });

    test('id tak dikenal → 404', async () => {
      const token = await getToken();
      const { status } = await call('DELETE', '/negara/999', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(404);
    });

    test('dipakai purchase_imports → ditolak dengan jumlah pemakaian, baris utuh', async () => {
      await seedNegara(['China']);
      await seedImport({ negaraId: 1 });
      const token = await getToken();
      const { status, body } = await call('DELETE', '/negara/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/pembelian/i);
      expect(body.error).toMatch(/1/);

      const still = (await db.query('SELECT COUNT(*)::int AS c FROM negara WHERE id = 1')).rows[0];
      expect(Number(still.c)).toBe(1);
    });

    test('dipakai 2 purchase_imports → pesan menyebut 2', async () => {
      await seedNegara(['China']);
      await seedImport({ negaraId: 1 });
      await db.query(
        `INSERT INTO purchase_imports
           (variant_id, vendor_id, tgl_beli, qty, harga_produk, hpp_per_item, created_by, negara_id)
         VALUES (1, 1, '2026-09-01', 5, 60000, 60000, 1, 1)`
      );
      const token = await getToken();
      const { status, body } = await call('DELETE', '/negara/1', {
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(409);
      expect(body.error).toMatch(/2/);
    });

    test('tanpa header CSRF → 403', async () => {
      await seedNegara(['China']);
      const { status } = await call('DELETE', '/negara/1');
      expect(status).toBe(403);
    });
  });

  describe('purchase_imports.negara_id', () => {
    test('nullable: baris import tanpa negara tersimpan dengan NULL', async () => {
      await seedImport();
      const row = (await db.query('SELECT negara_id FROM purchase_imports WHERE id = 1')).rows[0];
      expect(row.negara_id).toBeNull();
    });

    test('bisa diisi dan dibaca kembali', async () => {
      await seedNegara(['China']);
      await seedImport({ negaraId: 1 });
      const row = (await db.query('SELECT negara_id FROM purchase_imports WHERE id = 1')).rows[0];
      expect(Number(row.negara_id)).toBe(1);
    });
  });
});
