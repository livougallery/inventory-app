/**
 * Test negara pada pembelian White Label (tiket 09) — routes/purchase-imports.js.
 *
 * Berbeda dengan test API lain di repo ini: halaman White Label masih
 * SERVER-RENDERED (EJS), jadi tidak ada seam JSON untuk diuji. Yang diuji di
 * sini adalah HTML yang dikembalikan server: apakah dropdown-nya ada, apakah
 * nama negara muncul di daftar dan detail, dan — yang paling penting — apa
 * yang dirender ketika negara tidak ada.
 *
 * Tiket 09 menyebutkan smoke test browser karena halaman ini tidak tercakup
 * automated seam. Membaca HTML-nya lewat seam HTTP menutup sebagian besar
 * celah itu tanpa browser; yang tersisa untuk smoke test manual hanya soal
 * tampilan (posisi dropdown, lebar kolom).
 *
 * Mengikuti pola tests/negaraApi.test.js: mini Express app, MemoryStore
 * session, SID palsu yang sudah ter-auth. Skema `test` di-truncate sebelum
 * tiap test, jadi id selalu mulai dari 1.
 */
const db = require('../db');

const SECRET = 'test-secret-pi-negara';
const SID = 'pi-negara-sid';

// Signed cookie ala cookie-signature: HMAC-SHA256(sid, secret), '=' dibuang.
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', SECRET).update(SID).digest('base64').replace(/=+$/, '');
const AUTH_COOKIE = 'connect.sid=' + encodeURIComponent('s:' + SID + '.' + sig);

describe('Negara pada pembelian White Label (tiket 09)', () => {
  const express = require('express');
  const session = require('express-session');
  let app;
  let server;
  let store;

  // Halaman EJS di-render ke HTML, jadi selain status dan cookie, teksnya
  // ikut dikembalikan — itulah yang diuji sebagian besar test di bawah.
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
    return { status: r.status, text: await r.text(), headers: r.headers };
  };

  // Token CSRF selalu fresh sebelum mutasi (server merotasi token tiap sukses).
  const getToken = async () => {
    const port = server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/__token`, { headers: { cookie: AUTH_COOKIE } });
    return (await r.json()).t;
  };

  // Mengambil isi <select name="negara_id"> saja.
  //
  // Diperlukan karena halaman edit punya tiga dropdown (produk, vendor,
  // negara) dan semuanya punya opsi terpilih. Memeriksa seluruh halaman
  // akan selalu menemukan opsi terpilih dari dropdown produk — sehingga
  // test "tidak ada negara terpilih" mustahil lolos walau benar.
  // View menandai dropdown negara dengan data-negara untuk keperluan ini.
  const dropdownNegara = (html) => {
    const m = html.match(/<select name="negara_id"[^>]*>([\s\S]*?)<\/select>/);
    return m ? m[1] : '';
  };

  // Kirim form seperti browser: application/x-www-form-urlencoded, bukan JSON.
  // Kalau dikirim sebagai JSON, test akan lolos walau route tidak memasang
  // urlencoded parser — padahal browser tidak pernah mengirim JSON untuk
  // <form> biasa.
  const kirimForm = async (method, path, fields) => {
    const t = await getToken();
    const port = server.address().port;
    const body = new URLSearchParams({ ...fields, _csrf: t });
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        cookie: AUTH_COOKIE,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    return { status: r.status, location: r.headers.get('location'), text: await r.text() };
  };

  beforeAll(async () => {
    app = express();
    store = new session.MemoryStore();
    // express-ejs-layouts WAJIB: index.js menyetel `app.set('layout',
    // 'layout')` dan tiap res.render memakainya. Tanpa ini setiap render
    // gagal 500 — dan errornya tidak pernah terlihat di test, jadi gejalanya
    // tampak seperti "view-nya salah" padahal harness-nya yang kurang.
    const expressLayouts = require('express-ejs-layouts');
    const path = require('path');
    app.set('layout', 'layout');
    app.set('layout extractScripts', true);
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(expressLayouts);
    app.use(express.json());
    // Parser form WAJIB dipasang: halaman EJS mengirim urlencoded.
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: SECRET, resave: false, saveUninitialized: true, store }));

    // HARUS SETELAH express-session: req.session baru terisi setelah
    // middleware session jalan. Dulu ini dipasang sebelum session, jadi
    // req.session selalu undefined dan res.locals.user selalu null —
    // tampak seperti bug view, padahal urutan middleware yang salah.
    //
    // res.locals.user diisi middleware isAuthenticated (middleware/auth.js)
    // di aplikasi nyata; di sini diisi manual karena test memakai session
    // palsu, bukan alur login sungguhan.
    //
    // currentPath juga WAJIB. Awalnya dikira tidak perlu karena layout
    // memakainya di dalam blok `if (locals.user)` — ternyata tidak: baris
    // 218 memakainya di luar blok itu, jadi render gagal dengan
    // "currentPath is not defined".
    app.use((req, res, next) => {
      res.locals.currentPath = req.path;
      // Diisi TANPA syarat. View-view EJS (products/index.ejs,
      // dashboard/index.ejs, purchase-imports/index.ejs) memakai `user.role`
      // tanpa penjaga, jadi `user` harus selalu berupa objek.
      res.locals.user = req.session && req.session.userId
        ? {
            id: req.session.userId,
            role: req.session.role,
            nama_lengkap: req.session.username,
          }
        // Fallback tamu, bukan null: view memanggil user.role tanpa
        // penjaga, dan null akan melempar di baris pertama yang
        // memakainya. 'tamu' bukan nilai yang diizinkan CHECK role,
        // jadi semua pengecekan `=== 'admin'` bernilai salah — persis
        // yang diinginkan untuk permintaan tanpa session.
        : { id: null, role: 'tamu', nama_lengkap: '' };
      next();
    });
    const { generateToken } = require('../middleware/csrf');
    app.use(generateToken);
    app.get('/__token', (req, res) => res.json({ t: res.locals.csrfToken }));
    // method-override: form EJS mengirim PUT lewat _method, seperti index.js.
    const methodOverride = require('method-override');
    app.use(methodOverride('_method'));
    app.use('/purchase-imports', require('../routes/purchase-imports'));
    // Error handler TERAKHIR. Tanpa ini, kegagalan render EJS hanya tampil
    // sebagai 500 tanpa pesan — dan menghabiskan banyak langkah untuk
    // menebak variabel view mana yang kurang. Handler ini mencetak
    // ReferenceError-nya apa adanya.
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      console.error('=== RENDER/ROUTE ERROR ===', err.message);
      res.status(500).send('TEST-ERR: ' + err.message);
    });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const setSession = (overrides = {}) =>
    new Promise((resolve, reject) => {
      store.set(SID, {
        cookie: {
          originalMaxAge: 3600000,
          expires: new Date(Date.now() + 3600000).toISOString(),
          httpOnly: true,
          path: '/',
        },
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

  const seedUser = (id, username, role) =>
    db.query(
      `INSERT INTO users (id, username, password, role) VALUES ($1, $2, 'x', $3)`,
      [id, username, role]
    );

  const seedVendor = (id, nama, tipe = 'import') =>
    db.query(`INSERT INTO vendors (id, nama, tipe) VALUES ($1, $2, $3)`, [id, nama, tipe]);

  // Satu produk `beli_jadi` lengkap dengan satu varian — syarat form create
  // (dropdown produk disaring ke tipe_produksi='beli_jadi').
  const seedProduk = async () => {
    await db.query(
      `INSERT INTO products (id, nama_produk, tipe_produksi) VALUES (1, 'Kaos', 'beli_jadi')`
    );
    await db.query(
      `INSERT INTO product_variants (id, product_id, warna, size, sku)
       VALUES (1, 1, 'Putih', 'M', 'SKU-1')`
    );
  };

  const seedNegara = async (nama) => {
    const r = await db.query('INSERT INTO negara (nama) VALUES ($1) RETURNING id', [nama]);
    return r.rows[0].id;
  };

  // Basis: user admin, vendor import, produk beli_jadi, 3 negara.
  const seedBase = async () => {
    await seedUser(1, 'admin', 'admin');
    await seedVendor(1, 'PT Importir');
    await seedProduk();
  };

  const seedPembelian = async ({ negaraId = null, status = 'pending' } = {}) => {
    const r = await db.query(
      `INSERT INTO purchase_imports
         (variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik,
          hpp_per_item, created_by, negara_id, status)
       VALUES (1, 1, '2026-09-01', 10, 5, 15000, 0, 75000, 1, $1, $2)
       RETURNING id`,
      [negaraId, status]
    );
    return r.rows[0].id;
  };

  const formPembelian = (overrides = {}) => ({
    variant_id: 1,
    vendor_id: 1,
    tgl_beli: '2026-09-01',
    qty: 10,
    harga_produk: 5,
    kurs: 15000,
    logistik: 0,
    ...overrides,
  });

  // ----- Form create: dropdown negara -----

  describe('GET /purchase-imports/create', () => {
    test('memuat dropdown Negara', async () => {
      await seedBase();
      const { status, text } = await call('GET', '/purchase-imports/create');
      expect(status).toBe(200);
      // Nama field-nya persis yang dibaca route saat menyimpan.
      expect(text).toContain('name="negara_id"');
    });

    test('negara ditampilkan urut alfabetis', async () => {
      await seedBase();
      // Di-insert sengaja tidak urut: urutan yang benar harus datang dari
      // ORDER BY di query, bukan dari urutan insert.
      await seedNegara('Thailand');
      await seedNegara('China');
      await seedNegara('Indonesia');

      const { text } = await call('GET', '/purchase-imports/create');
      const urut = [...text.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)]
        .map((m) => m[2]);
      const negara = urut.filter((n) => ['China', 'Indonesia', 'Thailand'].includes(n));
      expect(negara).toEqual(['China', 'Indonesia', 'Thailand']);
    });

    test('negara OPSIONAL: ada pilihan kosong untuk menyimpannya', async () => {
      await seedBase();
      await seedNegara('China');

      const { text } = await call('GET', '/purchase-imports/create');
      // Tanpa opsi bernilai kosong, pengguna tidak pernah bisa tidak memilih
      // negara — padahal AC mensyaratkan negara opsional.
      expect(text).toMatch(/<option value=""[^>]*>\s*(Pilih Negara|—|Tanpa negara)/);
    });

    test('tabel negara kosong → form tetap terbuka, dropdown tanpa isi', async () => {
      await seedBase();
      const { status, text } = await call('GET', '/purchase-imports/create');
      expect(status).toBe(200);
      expect(text).toContain('name="negara_id"');
    });

    test('tanpa session → redirect ke login, bukan 500', async () => {
      const { status, headers } = await call('GET', '/purchase-imports/create', { auth: false });
      expect(status).toBe(302);
      expect(headers.get('location')).toMatch(/\/login/);
    });
  });

  // ----- Menyimpan negara -----

  describe('POST /purchase-imports', () => {
    test('negara yang dipilih tersimpan di purchase_imports.negara_id', async () => {
      await seedBase();
      const id = await seedNegara('China');

      await kirimForm('POST', '/purchase-imports', formPembelian({ negara_id: id }));

      const row = (await db.query('SELECT negara_id FROM purchase_imports')).rows[0];
      expect(row.negara_id).toBe(id);
    });

    test('negara dikosongkan → tersimpan NULL, bukan fallback ke baris pertama', async () => {
      // AC tiket 09: "Omitting the country leaves it NULL; it is never
      // defaulted to a first or fallback row, which would silently invent
      // data." Kalau negara dikosongkan tapi tersimpan sebagai id negara
      // pertama, sistem diam-diam mengarang data asal pembelian.
      await seedBase();
      await seedNegara('China');
      await seedNegara('Thailand');

      await kirimForm('POST', '/purchase-imports', formPembelian({ negara_id: '' }));

      const row = (await db.query('SELECT negara_id FROM purchase_imports')).rows[0];
      expect(row.negara_id).toBeNull();
    });

    test('negara_id tidak dikirim sama sekali → NULL', async () => {
      await seedBase();
      await seedNegara('China');

      await kirimForm('POST', '/purchase-imports', formPembelian());

      const row = (await db.query('SELECT negara_id FROM purchase_imports')).rows[0];
      expect(row.negara_id).toBeNull();
    });

    test('negara_id fiktif → ditolak, tidak ada baris tersimpan', async () => {
      // AC: "validated against the negara table; an unknown country id is
      // rejected with a clear error." Membiarkannya lewat berarti error FK
      // mentah (23503) menjawab 500.
      await seedBase();

      const r = await kirimForm('POST', '/purchase-imports', formPembelian({ negara_id: 999 }));

      const n = (await db.query('SELECT COUNT(*)::int AS n FROM purchase_imports')).rows[0];
      expect(n.n).toBe(0);

      // Tegasan status WAJIB. Tanpa validasi, id 999 diteruskan ke Postgres,
      // INSERT gagal karena FK, dan Express menjawab 500. Kebetulan barisnya
      // juga nol dan pesan error FK-nya mengandung kata "negara"
      // (purchase_imports_negara_id_fkey) — jadi kedua tegasan di atas
      // lolos walau validasi tidak ada sama sekali. Mutan yang menghapus
      // validasi pernah lolos karena ini.
      expect(r.status).toBe(302);
      const pesan = decodeURIComponent(r.location || '');
      // Pesan harus datang dari aplikasi, bukan dari database.
      expect(pesan).toMatch(/error=/i);
      expect(pesan).toMatch(/negara/i);
      expect(pesan).not.toMatch(/fkey|constraint|violates/i);
    });

    test('HPP TIDAK berubah karena ada negara', async () => {
      // Catatan tiket: "The HPP formula is unchanged by this ticket. Country
      // is descriptive metadata and must not enter the HPP calculation."
      await seedBase();
      const id = await seedNegara('China');

      await kirimForm('POST', '/purchase-imports', formPembelian({ negara_id: id }));
      const dengan = (await db.query('SELECT hpp_per_item FROM purchase_imports')).rows[0];

      await db.query('DELETE FROM purchase_imports');
      await kirimForm('POST', '/purchase-imports', formPembelian());
      const tanpa = (await db.query('SELECT hpp_per_item FROM purchase_imports')).rows[0];

      // (harga 5 x kurs 15000) + (logistik 0 / qty 10) = 75000
      expect(Number(dengan.hpp_per_item)).toBe(75000);
      expect(Number(tanpa.hpp_per_item)).toBe(Number(dengan.hpp_per_item));
    });
  });

  // ----- Tampilan: daftar & detail -----

  describe('GET /purchase-imports (daftar)', () => {
    test('nama negara tampil di daftar', async () => {
      await seedBase();
      const id = await seedNegara('China');
      await seedPembelian({ negaraId: id });

      const { status, text } = await call('GET', '/purchase-imports');
      expect(status).toBe(200);
      expect(text).toContain('China');
    });

    test('pembelian TANPA negara tidak menampilkan null/undefined', async () => {
      // AC yang paling penting: "A purchase with no country renders cleanly
      // — an em dash or similar placeholder, never null, never undefined."
      // Dua baris di live DB sama-sama tanpa negara, jadi ini kasus umum,
      // bukan kasus pinggiran.
      await seedBase();
      await seedPembelian({ negaraId: null });

      const { text } = await call('GET', '/purchase-imports');
      // Ambil hanya bagian tabel supaya kata "null" di atribut lain (mis.
      // class CSS) tidak membuat test lolos atau gagal secara menyesatkan.
      const baris = text.slice(text.indexOf('<tbody>'), text.indexOf('</tbody>'));
      expect(baris).not.toMatch(/>null</);
      expect(baris).not.toMatch(/>undefined</);
      expect(baris).toContain('—');
    });
  });

  describe('GET /purchase-imports/:id (detail)', () => {
    test('nama negara tampil di detail', async () => {
      await seedBase();
      const id = await seedNegara('Thailand');
      const pid = await seedPembelian({ negaraId: id });

      const { status, text } = await call('GET', `/purchase-imports/${pid}`);
      expect(status).toBe(200);
      expect(text).toContain('Thailand');
    });

    test('detail tanpa negara → em dash, bukan null', async () => {
      await seedBase();
      const pid = await seedPembelian({ negaraId: null });

      const { text } = await call('GET', `/purchase-imports/${pid}`);
      expect(text).not.toMatch(/>null</);
      expect(text).not.toMatch(/>undefined</);
      // Em dash harus ada TEPAT di baris Negara. Memeriksa `toContain('—')`
      // pada seluruh halaman tidak cukup: em dash juga muncul di elemen
      // lain, jadi mutan yang mengganti `|| '—'` dengan nilai null mentah
      // akan tetap lolos. Dibuktikan: mutan itu pernah lolos.
      const baris = text.match(/Negara:[\s\S]{0,120}/);
      expect(baris).not.toBeNull();
      expect(baris[0]).toContain('—');
      expect(baris[0]).not.toMatch(/null|undefined/);
    });
  });

  // ----- Edit: ubah & kosongkan negara -----

  describe('GET /purchase-imports/:id/edit', () => {
    test('form edit menampilkan negara yang tersimpan sebagai pilihan terpilih', async () => {
      await seedBase();
      const id = await seedNegara('China');
      await seedNegara('Thailand');
      const pid = await seedPembelian({ negaraId: id });

      const { status, text } = await call('GET', `/purchase-imports/${pid}/edit`);
      expect(status).toBe(200);
      // Negara yang tersimpan harus terpilih di dropdown NEGARA, bukan
      // sekadar ada di daftar opsinya.
      expect(dropdownNegara(text)).toContain(`<option value="${id}" selected`);
    });

    test('form edit pada pembelian TANPA negara → tidak ada negara yang terpilih', async () => {
      await seedBase();
      await seedNegara('China');
      const pid = await seedPembelian({ negaraId: null });

      const { text } = await call('GET', `/purchase-imports/${pid}/edit`);
      // Hanya dropdown NEGARA yang diperiksa. Sebelumnya test ini
      // memeriksa semua <option selected> di halaman, dan selalu gagal
      // karena produk serta vendor memang terpilih — itu benar, bukan bug.
      // Pengecekan dipersempit lewat penanda data-negara.
      expect(dropdownNegara(text)).not.toMatch(/<option value="\d+" selected/);
      // Pilihan kosongnya yang terpilih.
      expect(dropdownNegara(text)).toMatch(/<option value="" selected/);
    });

    test('edit id yang tidak ada → 404, bukan 500', async () => {
      await seedBase();
      const { status } = await call('GET', '/purchase-imports/999/edit');
      expect(status).toBe(404);
    });

    // Penjaga di GET, bukan cuma di POST. Dulu hanya POST yang diuji, jadi
    // mutan yang menghapus penjaga GET lolos tanpa ketahuan — padahal
    // membuka form untuk pembelian yang sudah divalidasi seharusnya
    // ditolak lebih dulu, sebelum pengguna mengisi apa pun.
    for (const status of ['validated', 'rejected']) {
      test(`buka form edit pembelian ${status} → dialihkan, bukan form yang terbuka`, async () => {
        await seedBase();
        const pid = await seedPembelian({ status });

        const { status: kode, headers, text } = await call(
          'GET', `/purchase-imports/${pid}/edit`
        );
        expect(kode).toBe(302);
        expect(headers.get('location')).toMatch(/error/i);
        // Form tidak boleh ditampilkan sama sekali.
        expect(text).not.toContain('name="negara_id"');
      });
    }
  });

  describe('POST /purchase-imports/:id/edit (simpan)', () => {
    test('negara bisa diubah lewat edit', async () => {
      await seedBase();
      const china = await seedNegara('China');
      const thai = await seedNegara('Thailand');
      const pid = await seedPembelian({ negaraId: china });

      await kirimForm('POST', `/purchase-imports/${pid}/edit`, formPembelian({ negara_id: thai }));

      const row = (await db.query(
        'SELECT negara_id FROM purchase_imports WHERE id = $1', [pid]
      )).rows[0];
      expect(row.negara_id).toBe(thai);
    });

    test('negara bisa DIKOSONGKAN lewat edit', async () => {
      // AC: "Editing an existing purchase lets the country be changed or
      // cleared." Mengosongkan adalah kasus yang mudah terlewat: form
      // mengirim '' dan route harus menyimpannya sebagai NULL, bukan
      // mengabaikan field-nya.
      await seedBase();
      const china = await seedNegara('China');
      const pid = await seedPembelian({ negaraId: china });

      await kirimForm('POST', `/purchase-imports/${pid}/edit`, formPembelian({ negara_id: '' }));

      const row = (await db.query(
        'SELECT negara_id FROM purchase_imports WHERE id = $1', [pid]
      )).rows[0];
      expect(row.negara_id).toBeNull();
    });

    test('edit negara_id fiktif → ditolak, nilai lama tetap utuh', async () => {
      await seedBase();
      const china = await seedNegara('China');
      const pid = await seedPembelian({ negaraId: china });

      const r = await kirimForm('POST', `/purchase-imports/${pid}/edit`, formPembelian({ negara_id: 999 }));

      const row = (await db.query(
        'SELECT negara_id FROM purchase_imports WHERE id = $1', [pid]
      )).rows[0];
      expect(row.negara_id).toBe(china);
      // Sama seperti create: tanpa tegasan status, pelanggaran FK akan
      // menjawab 500 dan nilai lama memang tidak berubah — test lolos
      // walau validasinya tidak ada.
      expect(r.status).toBe(302);
      expect(decodeURIComponent(r.location || '')).toMatch(/negara/i);
    });

    test('edit pembelian yang sudah divalidasi → ditolak', async () => {
      // Mengikuti penjaga tiket 07: transaksi yang sudah divalidasi tidak
      // boleh diubah. Tanpa ini, HPP yang sudah dihitung bisa divergen dari
      // datanya.
      await seedBase();
      const china = await seedNegara('China');
      const pid = await seedPembelian({ negaraId: china, status: 'validated' });

      const r = await kirimForm('POST', `/purchase-imports/${pid}/edit`, formPembelian({ negara_id: '' }));
      expect(r.status).toBe(302);
      expect(decodeURIComponent(r.location || '')).toMatch(/error/i);

      const row = (await db.query(
        'SELECT negara_id FROM purchase_imports WHERE id = $1', [pid]
      )).rows[0];
      expect(row.negara_id).toBe(china);
    });

    test('edit tanpa session → redirect ke login', async () => {
      await seedBase();
      const pid = await seedPembelian({});
      const { status } = await call('POST', `/purchase-imports/${pid}/edit`, {
        body: {},
        auth: false,
      });
      expect(status).toBe(302);
    });
  });

  // ----- Autentikasi & CSRF -----

  test('POST tanpa session → redirect ke login, tidak ada baris tersimpan', async () => {
    await seedBase();
    await call('POST', '/purchase-imports', { body: {}, auth: false });
    const n = (await db.query('SELECT COUNT(*)::int AS n FROM purchase_imports')).rows[0];
    expect(n.n).toBe(0);
  });

  test('role non-admin tidak bisa membuat pembelian → 403', async () => {
    await seedBase();
    await seedUser(2, 'sari', 'finance');
    await setSession({ userId: 2, username: 'sari', role: 'finance' });

    const { status } = await kirimForm('POST', '/purchase-imports', formPembelian());
    expect(status).toBe(403);
  });

  // Regresi: isAuthenticated dulu hanya mengisi req.user, bukan
  // res.locals.user. View memakai `user` sebagai variabel render, jadi
  // halaman yang hanya dilindungi isAuthenticated (daftar White Label,
  // products, dashboard) menjawab 500 untuk pengguna yang login normal.
  //
  // Ditemukan lewat smoke test terhadap server nyata — harness test
  // mengisi res.locals.user sendiri, jadi celah ini tidak pernah terlihat
  // di test otomatis. Test ini mengujinya lewat middleware yang ASLI,
  // bukan tiruan.
  describe('regresi: res.locals.user dari isAuthenticated', () => {
    test('isAuthenticated mengisi res.locals.user, bukan cuma req.user', async () => {
      const { isAuthenticated } = require('../middleware/auth');
      const req = { session: { userId: 7, username: 'uji', role: 'admin', namaLengkap: 'Uji' }, path: '/x' };
      const res = { locals: {}, redirect: () => {} };

      let lanjut = false;
      await isAuthenticated(req, res, () => { lanjut = true; });

      expect(lanjut).toBe(true);
      expect(req.user).toBeDefined();
      // Yang dipakai view. req.user saja tidak cukup — itulah bug-nya.
      expect(res.locals.user).toBeDefined();
      expect(res.locals.user.role).toBe('admin');
      // currentPath dipakai layout.ejs:218 untuk menandai menu aktif, di
      // LUAR blok `if (locals.user)`. Kalau tidak diisi, layout melempar
      // "currentPath is not defined" dan menjatuhkan seluruh halaman.
      expect(res.locals.currentPath).toBe('/x');
    });

    test('tanpa session → redirect, res.locals.user tidak diisi', async () => {
      const { isAuthenticated } = require('../middleware/auth');
      const req = { session: {}, path: '/x' };
      let dialihkan = false;
      const res = { locals: {}, redirect: () => { dialihkan = true; } };

      let lanjut = false;
      await isAuthenticated(req, res, () => { lanjut = true; });

      expect(dialihkan).toBe(true);
      expect(lanjut).toBe(false);
      expect(res.locals.user).toBeUndefined();
    });
  });
});
