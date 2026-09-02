/**
 * Test middleware JSON bersama (middleware/apiAuth.js).
 *
 * Mengikuti pola materialsApi.test.js: mini Express app dengan MemoryStore
 * session + SID palsu, lalu fetch ke 127.0.0.1.
 *
 * Middleware tidak punya route sendiri, jadi diamati lewat endpoint probe
 * yang dipasang di app test — pola yang sama dengan `/__token` di
 * materialsApi.test.js untuk membaca token CSRF. Middleware dipasang ke app
 * dengan cara yang sama persis seperti dipasang di produksi, jadi yang
 * diuji adalah rakitan nyatanya, bukan fungsinya yang dipanggil langsung.
 */
const crypto = require('crypto');

const SECRET = 'test-secret-apimw';
const SID = 'apimw-sid';

const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('Middleware JSON API', () => {
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

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);

    // Probe: middleware tidak bisa di-fetch langsung, jadi diamati lewat
    // route yang memasangnya persis seperti pemasangan produksi.
    const { requireAuth, requireRole } = require('../middleware/apiAuth');
    app.get('/probe/auth', requireAuth, (req, res) => res.json({ ok: true }));
    app.get('/probe/finance', requireAuth, requireRole('finance'), (req, res) => res.json({ ok: true }));
    // requireRole sendirian (tanpa requireAuth di depannya) tetap harus punya
    // kontrak 401 yang sama, termasuk menghormati AUTO_LOGIN.
    app.get('/probe/finance-solo', requireRole('finance'), (req, res) => res.json({ ok: true }));
    app.post('/probe/csrf', require('../middleware/csrf').validateToken, (req, res) => res.json({ ok: true }));
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));

    await new Promise((resolve) => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Session palsu yang sudah ter-auth untuk semua test yang pakai AUTH_COOKIE.
  // Bukan login sungguhan — hanya menanam session ke MemoryStore.
  const seedSession = (role = 'admin') => new Promise((resolve, reject) => {
    store.set(SID, {
      cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: '/' },
      userId: 1,
      role,
    }, (err) => (err ? reject(err) : resolve()));
  });

  describe('requireAuth', () => {
    test('tanpa session → 401 JSON, bukan redirect', async () => {
      const { status, body } = await call('GET', '/probe/auth', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('dengan session → lanjut ke handler', async () => {
      await seedSession();
      const { status, body } = await call('GET', '/probe/auth');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  });

  describe('requireRole', () => {
    test('role tidak termasuk → 403 JSON, bukan render halaman error', async () => {
      await seedSession('admin');
      const { status, body } = await call('GET', '/probe/finance');
      expect(status).toBe(403);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('role sesuai → lanjut ke handler', async () => {
      await seedSession('finance');
      const { status, body } = await call('GET', '/probe/finance');
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true });
    });

    test('tanpa session → 401 JSON, bukan redirect ke /login', async () => {
      const { status, body } = await call('GET', '/probe/finance', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('dipasang sendirian tanpa session → tetap 401 JSON, kontrak sama', async () => {
      const { status, body } = await call('GET', '/probe/finance-solo', { auth: false });
      expect(status).toBe(401);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('dipasang sendirian dengan session → role tetap diperiksa', async () => {
      await seedSession('admin');
      const { status, body } = await call('GET', '/probe/finance-solo');
      expect(status).toBe(403);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });
  });

  describe('validateToken (CSRF)', () => {
    const getToken = async () => {
      const port = server.address().port;
      const r = await fetch(`http://127.0.0.1:${port}/__token`, { headers: { cookie: AUTH_COOKIE } });
      return (await r.json()).t;
    };

    test('token tidak valid → 403 JSON, bukan teks polos', async () => {
      await seedSession();
      const { status, body } = await call('POST', '/probe/csrf', {
        body: {},
        headers: { 'x-csrf-token': 'token-palsu' },
      });
      expect(status).toBe(403);
      expect(body).toEqual({ ok: false, error: expect.any(String) });
    });

    test('token valid → lanjut ke handler', async () => {
      await seedSession();
      const token = await getToken();
      const { status, body } = await call('POST', '/probe/csrf', {
        body: {},
        headers: { 'x-csrf-token': token },
      });
      expect(status).toBe(200);
      expect(body).toEqual({ ok: true });
    });

    test('token hanya dipakai sekali — dipakai ulang → 403', async () => {
      await seedSession();
      const token = await getToken();
      await call('POST', '/probe/csrf', { body: {}, headers: { 'x-csrf-token': token } });
      const { status } = await call('POST', '/probe/csrf', { body: {}, headers: { 'x-csrf-token': token } });
      expect(status).toBe(403);
    });
  });
});
