/**
 * Test JSON API /api/currencies (features/currency/backend/routes.js).
 *
 * Mengikuti pola tests/negaraApi.test.js: mini Express app dengan MemoryStore
 * session + SID palsu yang sudah ter-auth, lalu fetch ke 127.0.0.1. Skema
 * `test` (tests/setup.js) men-truncate semua tabel sebelum tiap test, jadi
 * tiap test menanam datanya sendiri dan id selalu mulai dari 1.
 *
 * Endpoint ini read-only: master currency dikelola lewat halaman admin EJS
 * (/admin/currencies). Yang dibutuhkan halaman React hanyalah daftar untuk
 * mengisi dropdown pada form PO (tiket 06).
 *
 * CATATAN: ini salinan kelima dari harness yang sama (materialsApi, negaraApi,
 * vendorsApi, purchaseOrdersApi, currenciesApi). Ekstraksi ke tests/helpers/
 * sengaja ditunda — lihat daftar "perlu tiket sendiri" di memory.
 */
const db = require('../db');

const SECRET = 'test-secret-currencies';
const SID = 'currencies-sid';

// Signed cookie ala cookie-signature: HMAC-SHA256(sid, secret), '=' dibuang.
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('JSON API /api/currencies', () => {
  const express = require('express');
  const session = require('express-session');
  let app;
  let server;
  let store;

  const call = async (method, path, { auth = true } = {}) => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      redirect: 'manual',
      headers: { ...(auth ? { cookie: AUTH_COOKIE } : {}) },
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* non-JSON */ }
    return { status: r.status, body: json };
  };

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    app.use('/currencies', require('../features/currency/backend/routes'));
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

  // Tiga currency ini persis yang di-seed index.js:230 ke database live.
  const seedCurrencies = async () => {
    await db.query(
      `INSERT INTO currencies (id, kode, nama, simbol, is_active) VALUES
       (1, 'IDR', 'Indonesian Rupiah', 'Rp', 1),
       (2, 'THB', 'Thai Baht', '฿', 1),
       (3, 'CNY', 'Chinese Yuan', '¥', 0)`
    );
  };

  describe('autentikasi', () => {
    test('GET / tanpa session → 401 JSON, bukan redirect', async () => {
      const { status, body } = await call('GET', '/currencies', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });
  });

  describe('GET /', () => {
    test('daftar kosong → ok dengan array kosong', async () => {
      const { status, body } = await call('GET', '/currencies');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true, data: [] });
    });

    test('mengembalikan kode, nama, dan simbol untuk tiap currency', async () => {
      await seedCurrencies();
      const { body } = await call('GET', '/currencies');
      const idr = body.data.find((c) => c.kode === 'IDR');
      expect(idr.nama).toBe('Indonesian Rupiah');
      expect(idr.simbol).toBe('Rp');
    });

    test('hanya currency aktif yang dikembalikan', async () => {
      // CNY ditanam dengan is_active = 0. Currency yang dinonaktifkan tidak
      // boleh bisa dipilih untuk transaksi baru.
      await seedCurrencies();
      const { body } = await call('GET', '/currencies');
      expect(body.data.map((c) => c.kode)).toEqual(['IDR', 'THB']);
      expect(body.data.map((c) => c.kode)).not.toContain('CNY');
    });

    test('terurut berdasarkan kode, bukan id', async () => {
      await seedCurrencies();
      const { body } = await call('GET', '/currencies');
      expect(body.data.map((c) => c.kode)).toEqual(['IDR', 'THB']);
    });

    test('tiap baris membawa id untuk dipakai sebagai nilai dropdown', async () => {
      await seedCurrencies();
      const { body } = await call('GET', '/currencies');
      expect(body.data.every((c) => typeof c.id === 'number')).toBe(true);
    });
  });
});
