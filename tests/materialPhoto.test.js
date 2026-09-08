/**
 * Test foto material (tiket 11d) dan pembersihan berkas saat material dihapus.
 *
 * Terpisah dari tests/materialsApi.test.js karena butuh direktori upload
 * sementara dan multipart/form-data — sama seperti tests/purchaseOrderPhoto.test.js.
 *
 * UPLOAD_DIR di-set sebelum modul di-require, jadi test tidak pernah menulis
 * ke uploads/ yang sesungguhnya.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dirSementara = fs.mkdtempSync(path.join(os.tmpdir(), 'material-foto-test-'));
process.env.UPLOAD_DIR = dirSementara;

const db = require('../db');

const SECRET = 'test-secret-material-foto';
const SID = 'material-foto-sid';

const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('Foto material (tiket 11d)', () => {
  const express = require('express');
  const session = require('express-session');
  let app;
  let server;
  let store;

  const getToken = async () => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/__token`, { headers: { cookie: AUTH_COOKIE } });
    return (await r.json()).t;
  };

  const unggah = async (p, { nama = 'foto.jpg', tipe = 'image/jpeg', isi = 'isi-berkas' } = {}, { auth = true } = {}) => {
    const headers = {};
    if (auth) headers.cookie = AUTH_COOKIE;
    const t = await getToken();
    headers['x-csrf-token'] = t;

    const fd = new FormData();
    fd.append('foto', new Blob([isi], { type: tipe }), nama);

    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method: 'POST', redirect: 'manual', headers, body: fd,
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, body: json };
  };

  const call = async (method, p, { auth = true } = {}) => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method, redirect: 'manual', headers: auth ? { cookie: AUTH_COOKIE } : {},
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, body: json };
  };

  const hapusFoto = async (id) => {
    const t = await getToken();
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/materials/${id}/foto`, {
      method: 'DELETE', redirect: 'manual',
      headers: { cookie: AUTH_COOKIE, 'x-csrf-token': t },
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, body: json };
  };

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

  const setSession = (overrides = {}) =>
    new Promise((resolve, reject) => {
      store.set(SID, {
        cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: '/' },
        userId: 1, username: 'admin', role: 'admin', ...overrides,
      }, (err) => (err ? reject(err) : resolve()));
    });

  beforeEach(async () => { await setSession(); });

  const seedMaterial = async () => {
    const r = await db.query(
      `INSERT INTO raw_materials (nama, tipe, satuan) VALUES ('Kain A', 'kain', 'm') RETURNING id`
    );
    return r.rows[0].id;
  };

  const fotonya = async (id) => {
    const r = await db.query('SELECT * FROM raw_material_photos WHERE raw_material_id = $1', [id]);
    return r.rows;
  };

  test('unggah foto → 200, tersimpan, dan berkasnya ada di disk', async () => {
    const id = await seedMaterial();
    const { status, body } = await unggah(`/materials/${id}/foto`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const baris = await fotonya(id);
    expect(baris).toHaveLength(1);
    expect(fs.existsSync(path.join(dirSementara, baris[0].file_path))).toBe(true);
  });

  test('unggah kedua kalinya mengganti foto lama', async () => {
    // Sama seperti PO: satu foto utama per material.
    const id = await seedMaterial();
    await unggah(`/materials/${id}/foto`, { nama: 'satu.jpg' });
    const lama = (await fotonya(id))[0];
    await unggah(`/materials/${id}/foto`, { nama: 'dua.jpg' });

    const semua = await fotonya(id);
    expect(semua).toHaveLength(1);
    expect(semua[0].file_path).not.toBe(lama.file_path);
    expect(fs.existsSync(path.join(dirSementara, lama.file_path))).toBe(false);
  });

  test('berkas bukan gambar → 400 dengan pesan', async () => {
    const id = await seedMaterial();
    const { status, body } = await unggah(`/materials/${id}/foto`, {
      nama: 'x.pdf', tipe: 'application/pdf',
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/gambar/i);
    expect(await fotonya(id)).toHaveLength(0);
  });

  test('material yang tidak ada → 404, dan berkas tidak tertinggal', async () => {
    const sebelum = fs.readdirSync(dirSementara).length;
    const { status } = await unggah('/materials/999/foto');
    expect(status).toBe(404);
    expect(fs.readdirSync(dirSementara).length).toBe(sebelum);
  });

  test('foto ikut terkirim di GET /api/materials', async () => {
    const id = await seedMaterial();
    await unggah(`/materials/${id}/foto`);
    const tersimpan = (await fotonya(id))[0].file_path;

    const { body } = await call('GET', '/materials');
    const baris = body.data.find((m) => m.id === id);
    expect(baris.foto_path).toBe(tersimpan);
  });

  test('material tanpa foto → foto_path string kosong, bukan null dan bukan undefined', async () => {
    // Sengaja beda dari PO: endpoint material SUDAH mengirim '' sejak sebelum
    // tiket ini (routes.js menormalkan dengan `|| ''`), dan mengubahnya jadi
    // null akan merusak klien yang sudah ada. Dicatat di sini supaya
    // perbedaan itu disengaja, bukan kebetulan.
    await seedMaterial();
    const { body } = await call('GET', '/materials');
    expect(body.data[0].foto_path).toBe('');
  });

  test('hapus foto → 200, baris hilang, berkas ikut terhapus', async () => {
    const id = await seedMaterial();
    await unggah(`/materials/${id}/foto`);
    const berkas = (await fotonya(id))[0].file_path;

    const { status } = await hapusFoto(id);
    expect(status).toBe(200);
    expect(await fotonya(id)).toHaveLength(0);
    expect(fs.existsSync(path.join(dirSementara, berkas))).toBe(false);
  });

  test('hapus material ikut menghapus BERKAS fotonya, bukan cuma barisnya', async () => {
    // Inti tiket 11d. FK memang bercascade untuk barisnya, tetapi berkas di
    // disk tidak ikut — tanpa penanganan, setiap material yang dihapus
    // meninggalkan berkas yatim yang tidak direferensikan siapa pun.
    const id = await seedMaterial();
    await unggah(`/materials/${id}/foto`);
    const berkas = (await fotonya(id))[0].file_path;

    const t = await getToken();
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/materials/${id}`, {
      method: 'DELETE', redirect: 'manual',
      headers: { cookie: AUTH_COOKIE, 'x-csrf-token': t },
    });
    expect(r.status).toBe(200);

    expect(await fotonya(id)).toHaveLength(0);
    expect(fs.existsSync(path.join(dirSementara, berkas))).toBe(false);
  });

  afterAll(() => {
    fs.rmSync(dirSementara, { recursive: true, force: true });
  });
});
