/**
 * Pengaman untuk fitur "tambah dari dalam form" (dropdown creatable).
 *
 * Yang diuji BUKAN komponen React-nya, melainkan asumsi yang dipakai
 * komponen itu saat memanggil API — karena kalau asumsinya salah, form
 * menampilkan error dan pengguna hanya melihat "gagal menambah" tanpa
 * tahu kenapa.
 *
 * Dua hal yang dipastikan di sini:
 *   1. POST /api/vendors menerima payload { nama, tipe } persis seperti
 *      yang dikirim CreatableSelect untuk field bertipe `fixed`.
 *   2. POST /api/materials menerima payload { nama, tipe, satuan } — ketiga
 *      field ini wajib di server (400 kalau kurang), jadi komponen wajib
 *      mengirim semuanya.
 *
 * Pola mengikuti tests/vendorsApi.test.js: mini Express app + MemoryStore
 * session + cookie palsu yang sudah ter-auth.
 */
const db = require('../db');

const SECRET = 'test-secret-creatable';
const SID = 'creatable-sid';

const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('API yang dipakai dropdown creatable', () => {
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

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    app.use(express.json());
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    // Rute dipasang di awal yang sama dengan index.js supaya path-nya identik.
    app.use('/vendors', require('../features/vendor/backend/routes'));
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

  it('membuat vendor dari field fixed (tipe dikirim tanpa ditampilkan)', async () => {
    const t = await getToken();
    const res = await call('POST', '/vendors', {
      body: { tipe: 'bahan_baku', nama: 'Vendor Ketikan Langsung' },
      headers: { 'x-csrf-token': t },
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.nama).toBe('Vendor Ketikan Langsung');
    expect(res.body.data.tipe).toBe('bahan_baku');

    // Harus benar-benar tersimpan, bukan cuma balasan 201.
    const tersimpan = await db.one(
      'SELECT nama, tipe FROM vendors WHERE nama = $1',
      ['Vendor Ketikan Langsung']
    );
    expect(tersimpan.tipe).toBe('bahan_baku');
  });

  it('membuat material dengan tipe dan satuan', async () => {
    const t = await getToken();
    const res = await call('POST', '/materials', {
      body: { tipe: 'kain', satuan: 'yard', nama: 'Kain Katun Baru' },
      headers: { 'x-csrf-token': t },
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.nama).toBe('Kain Katun Baru');
    expect(res.body.data.tipe).toBe('kain');
    expect(res.body.data.satuan).toBe('yard');
  });

  it('menolak material tanpa satuan — alasan komponen wajib mengirimnya', async () => {
    const t = await getToken();
    const res = await call('POST', '/materials', {
      body: { tipe: 'kain', nama: 'Tanpa Satuan' },
      headers: { 'x-csrf-token': t },
    });

    // Menjadi bukti kenapa `satuan` tidak boleh opsional di form.
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
