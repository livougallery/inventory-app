/**
 * Test endpoint foto nota PO (tiket 11c).
 *
 * Terpisah dari tests/purchaseOrdersApi.test.js karena butuh dua hal yang
 * tidak diperlukan test API biasa: direktori upload sementara, dan
 * multipart/form-data. Mencampurnya ke berkas itu berarti setiap test PO ikut
 * menanggung penyiapan filesystem yang tidak dipakainya.
 *
 * UPLOAD_DIR di-set ke direktori sementara SEBELUM modul apa pun di-require,
 * jadi test tidak pernah menulis ke uploads/ yang sesungguhnya.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dirSementara = fs.mkdtempSync(path.join(os.tmpdir(), 'po-foto-test-'));
process.env.UPLOAD_DIR = dirSementara;

const db = require('../db');
const photoUpload = require('../services/photoUpload');

const SECRET = 'test-secret-foto';
const SID = 'foto-sid';

const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('Foto nota PO (tiket 11c)', () => {
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

  // Unggah multipart. Token CSRF di header, bukan di form — server memeriksanya
  // sebelum multer membaca badan permintaan.
  const unggah = async (path, { nama = 'nota.jpg', tipe = 'image/jpeg', isi = 'isi-berkas' } = {}, { auth = true } = {}) => {
    const headers = {};
    if (auth) headers.cookie = AUTH_COOKIE;
    const t = await getToken();
    headers['x-csrf-token'] = t;

    const fd = new FormData();
    fd.append('foto', new Blob([isi], { type: tipe }), nama);

    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers,
      body: fd,
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, body: json };
  };

  const call = async (method, p, { auth = true } = {}) => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      redirect: 'manual',
      headers: auth ? { cookie: AUTH_COOKIE } : {},
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
    app.use('/purchase-orders', require('../features/purchase-order/backend/routes'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const setSession = (overrides = {}) =>
    new Promise((resolve, reject) => {
      store.set(SID, {
        cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: '/' },
        userId: 1,
        username: 'admin',
        role: 'admin',
        ...overrides,
      }, (err) => (err ? reject(err) : resolve()));
    });

  beforeEach(async () => {
    await setSession();
  });

  // ----- Seed helpers -----

  const seedBase = async () => {
    await db.query(`INSERT INTO users (id, username, password, role) VALUES (1, 'admin', 'x', 'admin')`);
    await db.query(`INSERT INTO vendors (id, nama, tipe) VALUES (1, 'PT Kain Maju', 'bahan_baku')`);
    await db.query(`INSERT INTO raw_materials (id, nama, tipe, satuan) VALUES (1, 'Kain A', 'kain', 'm')`);
  };

  const seedPo = async (status = 'pending') => {
    const r = await db.query(
      `INSERT INTO purchase_orders (vendor_id, no_po, tgl_beli, status, created_by)
       VALUES (1, 'PO-FOTO', '2026-09-04', $1, 1) RETURNING id`,
      [status]
    );
    return r.rows[0].id;
  };

  const fotonya = async (poId) => {
    const r = await db.query('SELECT * FROM purchase_order_photos WHERE purchase_order_id = $1', [poId]);
    return r.rows;
  };

  // Hapus foto: butuh token CSRF fresh, seperti semua mutasi lain.
  const hapusFoto = async (id) => {
    const t = await getToken();
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/purchase-orders/${id}/foto`, {
      method: 'DELETE',
      redirect: 'manual',
      headers: { cookie: AUTH_COOKIE, 'x-csrf-token': t },
    });
    let json = null;
    try { json = await r.json(); } catch (e) { /* bukan JSON */ }
    return { status: r.status, body: json };
  };

  // ----- Unggah -----

  test('unggah foto → 200, tersimpan di database, dan berkasnya ada di disk', async () => {
    await seedBase();
    const id = await seedPo();

    const { status, body } = await unggah(`/purchase-orders/${id}/foto`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const baris = await fotonya(id);
    expect(baris).toHaveLength(1);
    expect(baris[0].file_path).toBeTruthy();
    // Berkasnya benar-benar ada — bukan cuma baris database yang tercatat.
    expect(fs.existsSync(path.join(dirSementara, baris[0].file_path))).toBe(true);
  });

  test('unggah kedua kalinya MENGGANTI foto lama, bukan menambah baris', async () => {
    // Keputusan 11c: satu foto per PO. Menambah baris akan membuat kolom
    // daftar tidak tahu mana yang harus ditampilkan.
    await seedBase();
    const id = await seedPo();

    await unggah(`/purchase-orders/${id}/foto`, { nama: 'satu.jpg' });
    const pertama = (await fotonya(id))[0];

    await unggah(`/purchase-orders/${id}/foto`, { nama: 'dua.jpg' });
    const semua = await fotonya(id);

    expect(semua).toHaveLength(1);
    expect(semua[0].file_path).not.toBe(pertama.file_path);
  });

  test('foto lama IKUT DIHAPUS dari disk, bukan jadi berkas yatim', async () => {
    // Tanpa ini, setiap ganti foto meninggalkan berkas tak terpakai, dan
    // disk pelan-pelan penuh oleh berkas yang tidak direferensikan siapa pun.
    await seedBase();
    const id = await seedPo();

    await unggah(`/purchase-orders/${id}/foto`, { nama: 'satu.jpg' });
    const lama = (await fotonya(id))[0].file_path;

    await unggah(`/purchase-orders/${id}/foto`, { nama: 'dua.jpg' });

    expect(fs.existsSync(path.join(dirSementara, lama))).toBe(false);
  });

  test('berkas bukan gambar → 400 dengan pesan, bukan gagal diam-diam', async () => {
    await seedBase();
    const id = await seedPo();

    const { status, body } = await unggah(`/purchase-orders/${id}/foto`, {
      nama: 'nota.pdf',
      tipe: 'application/pdf',
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/gambar/i);
    // Tidak ada baris tersimpan untuk unggahan yang ditolak.
    expect(await fotonya(id)).toHaveLength(0);
  });

  test('PO yang tidak ada → 404, bukan 500', async () => {
    await seedBase();
    const { status } = await unggah('/purchase-orders/999/foto');
    expect(status).toBe(404);
  });

  test('PO yang tidak ada → berkas tidak tertinggal di disk', async () => {
    // multer menulis berkas SEBELUM penanganan route berjalan, jadi pengecekan
    // id saja tidak cukup — berkasnya sudah telanjur ada. Tanpa pembersihan
    // ini, setiap unggahan ke id yang salah meninggalkan berkas yatim.
    await seedBase();
    const sebelum = fs.readdirSync(dirSementara).length;
    await unggah('/purchase-orders/999/foto');
    expect(fs.readdirSync(dirSementara).length).toBe(sebelum);
  });

  test('berkas kelewat besar → 400 dengan batas yang disebut, bukan 500', async () => {
    // Kesalahan pengguna, bukan kegagalan server. Tanpa penanganan khusus,
    // multer melempar dan Express menjawab 500 — tercatat sebagai insiden
    // padahal pengguna cuma perlu tahu ukurannya kebesaran.
    await seedBase();
    const id = await seedPo();

    const { status, body } = await unggah(`/purchase-orders/${id}/foto`, {
      // Lebih besar dari batas, tetapi tidak sampai menghabiskan memori:
      // multer memotongnya begitu melewati batas.
      isi: 'x'.repeat(photoUpload.UKURAN_MAKS + 1024),
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/MB/);
    expect(await fotonya(id)).toHaveLength(0);
  });

  test('tanpa berkas dikirim → 400, bukan 500 dan bukan baris kosong tersimpan', async () => {
    await seedBase();
    const id = await seedPo();

    const t = await getToken();
    const port = server.address().port;
    const fd = new FormData(); // tanpa field 'foto'
    const r = await fetch(`http://127.0.0.1:${port}/purchase-orders/${id}/foto`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: AUTH_COOKIE, 'x-csrf-token': t },
      body: fd,
    });

    expect(r.status).toBe(400);
    expect(await fotonya(id)).toHaveLength(0);
  });

  test('tanpa session → 401', async () => {
    await seedBase();
    const id = await seedPo();
    const { status } = await unggah(`/purchase-orders/${id}/foto`, {}, { auth: false });
    expect(status).toBe(401);
  });

  // ----- Baca -----

  test('foto ikut terkirim di daftar dan di detail', async () => {
    await seedBase();
    const id = await seedPo();
    await unggah(`/purchase-orders/${id}/foto`);
    const tersimpan = (await fotonya(id))[0].file_path;

    const list = await call('GET', '/purchase-orders');
    expect(list.body.data[0].foto_path).toBe(tersimpan);

    const detail = await call('GET', `/purchase-orders/${id}`);
    expect(detail.body.data.foto_path).toBe(tersimpan);
  });

  test('PO tanpa foto → foto_path null, bukan undefined dan bukan string kosong', async () => {
    // Keadaan normal hari ini: semua 11 PO tidak punya foto. Kolomnya harus
    // jujur mengatakan "tidak ada", supaya frontend bisa membedakannya dari
    // "sedang dimuat".
    await seedBase();
    await seedPo();

    const list = await call('GET', '/purchase-orders');
    expect(list.body.data[0].foto_path).toBeNull();
  });

  // ----- Hapus -----

  test('hapus foto → 200, baris hilang, berkas ikut terhapus', async () => {
    await seedBase();
    const id = await seedPo();
    await unggah(`/purchase-orders/${id}/foto`);
    const berkas = (await fotonya(id))[0].file_path;

    const { status } = await hapusFoto(id);
    expect(status).toBe(200);
    expect(await fotonya(id)).toHaveLength(0);
    expect(fs.existsSync(path.join(dirSementara, berkas))).toBe(false);
  });

  test('hapus foto yang sudah tidak ada → tidak 500', async () => {
    // Menghapus dua kali, atau menghapus setelah berkas hilang dari disk,
    // tidak boleh menghasilkan error yang tidak bisa dijelaskan.
    await seedBase();
    const id = await seedPo();

    const pertama = await hapusFoto(id);
    expect(pertama.status).toBe(200);

    const kedua = await hapusFoto(id);
    expect(kedua.status).toBe(200);
  });

  test('hapus foto PO yang tidak ada → 404', async () => {
    await seedBase();
    const { status } = await hapusFoto(999);
    expect(status).toBe(404);
  });

  test('hapus PO pending ikut menghapus BERKAS fotonya, bukan cuma barisnya', async () => {
    // Yang diuji di sini adalah BERKASNYA, bukan cuma barisnya.
    //
    // Versi test ini sebelumnya cuma memeriksa baris database dan dengan itu
    // lolos walau berkasnya tertinggal — cacat yang sama dengan komentar di
    // routes/products.js yang mengklaim ON DELETE CASCADE mengurus foto.
    // Cascade hanya mengurus baris; berkas di disk tidak pernah.
    await seedBase();
    const id = await seedPo();
    await unggah(`/purchase-orders/${id}/foto`);
    const berkas = (await fotonya(id))[0].file_path;
    expect(fs.existsSync(path.join(dirSementara, berkas))).toBe(true);

    const t = await getToken();
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/purchase-orders/${id}`, {
      method: 'DELETE',
      redirect: 'manual',
      headers: { cookie: AUTH_COOKIE, 'x-csrf-token': t },
    });
    expect(r.status).toBe(200);

    expect(await fotonya(id)).toHaveLength(0);
    expect(fs.existsSync(path.join(dirSementara, berkas))).toBe(false);
  });

  test('PO yang GAGAL dihapus karena status berubah → fotonya tidak hilang', async () => {
    // Berkas dihapus setelah DELETE berhasil, bukan sebelumnya. Kalau
    // dibersihkan lebih dulu, PO yang gagal dihapus (409 karena statusnya
    // sudah bukan pending) akan kehilangan fotonya sia-sia.
    await seedBase();
    const id = await seedPo('validated');
    await unggah(`/purchase-orders/${id}/foto`);
    const berkas = (await fotonya(id))[0].file_path;

    const t = await getToken();
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/purchase-orders/${id}`, {
      method: 'DELETE',
      redirect: 'manual',
      headers: { cookie: AUTH_COOKIE, 'x-csrf-token': t },
    });
    expect(r.status).toBe(409);

    expect(fs.existsSync(path.join(dirSementara, berkas))).toBe(true);
  });

  afterAll(() => {
    fs.rmSync(dirSementara, { recursive: true, force: true });
  });

  // photoUpload diimpor supaya test ini gagal lebih awal kalau modulnya
  // berubah nama — kegagalan "Cannot find module" jauh lebih jelas daripada
  // kegagalan yang muncul sebagai 500 dari endpoint.
  test('modul upload tersedia', () => {
    expect(photoUpload.buatUploadFoto).toBeInstanceOf(Function);
  });
});
