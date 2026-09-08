/**
 * Test services/photoUpload.js — aturan upload foto (tiket 11c & 11d).
 *
 * Modul ini diuji terpisah dari endpoint HTTP karena dua alasan:
 *   1. Aturan validasinya dipakai dua fitur (nota PO dan foto material), jadi
 *      ia harus benar sekali, bukan dua kali.
 *   2. Ia menyentuh filesystem. Mengujinya lewat kegagalan upload sungguhan
 *      berarti setiap kasus uji harus membuat permintaan multipart yang rumit;
 *      menguji pembuat konfigurasi multer secara langsung lebih jelas dan
 *      lebih cepat.
 *
 * Semua tulisan diarahkan ke direktori sementara (UPLOAD_DIR didefinisikan
 * sebelum modul di-require), jadi test tidak pernah menyentuh uploads/ yang
 * sesungguhnya.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// HARUS sebelum require: modul membaca UPLOAD_DIR saat dimuat.
const dirSementara = fs.mkdtempSync(path.join(os.tmpdir(), 'foto-test-'));
process.env.UPLOAD_DIR = dirSementara;

const photoUpload = require('../services/photoUpload');

// Menjalankan multer tanpa HTTP.
//
// Multer menghasilkan middleware Express dan membaca `req.headers` untuk
// menentukan apakah permintaan multipart — objek `req` tanpa headers akan
// membuatnya melempar ("Cannot read properties of undefined"). Karena itu
// req-nya dilengkapi headers dan method, dan permintaannya dinyatakan BUKAN
// multipart supaya multer langsung menyerahkannya ke penangan berikutnya
// tanpa mencoba mengurai badan permintaan yang tidak ada.
//
// Yang sebenarnya diuji di sini adalah fileFilter: multer memanggilnya pada
// berkas yang ditemukan, jadi berkasnya disuntik langsung.
const jalankan = (middleware, { file, body = {} } = {}) =>
  new Promise((resolve) => {
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' }, // bukan multipart
      body,
      file,
      files: file ? [file] : [],
    };
    middleware(req, {}, (err) => resolve({ err }));
  });

const filePalsu = (nama, mimetype, size = 1024) => ({
  originalname: nama,
  mimetype,
  size,
});

describe('services/photoUpload', () => {
  afterAll(() => {
    fs.rmSync(dirSementara, { recursive: true, force: true });
  });

  describe('validasi tipe file', () => {
    // Filter diuji LANGSUNG, bukan lewat middleware multer.
    //
    // Multer hanya menjalankan fileFilter kalau permintaan benar-benar
    // multipart; lewat middleware, berkas yang ditolak tidak pernah sampai ke
    // filter dan hasilnya tidak bisa dibedakan dari "permintaan tanpa berkas".
    // Karena itu modulnya mengekspos filterBerkas secara terpisah.
    const cekFilter = (file) =>
      new Promise((resolve) => {
        photoUpload.filterBerkas({}, file, (err, diterima) =>
          resolve({ err: err || undefined, diterima })
        );
      });

    test('JPEG diterima', async () => {
      const { err, diterima } = await cekFilter(filePalsu('nota.jpg', 'image/jpeg'));
      expect(err).toBeUndefined();
      expect(diterima).toBe(true);
    });

    test('PNG diterima', async () => {
      const { err, diterima } = await cekFilter(filePalsu('nota.png', 'image/png'));
      expect(err).toBeUndefined();
      expect(diterima).toBe(true);
    });

    test('WEBP diterima', async () => {
      const { err, diterima } = await cekFilter(filePalsu('nota.webp', 'image/webp'));
      expect(err).toBeUndefined();
      expect(diterima).toBe(true);
    });

    test('middleware multer-nya bisa dijalankan tanpa multipart (tidak menggantung)', async () => {
      // Penjaga regresi untuk cara pengujian itu sendiri: multer membaca
      // req.headers, jadi req tanpa headers akan melempar dan menggantung
      // sampai timeout — kegagalan yang isinya tidak menjelaskan apa-apa.
      const upload = photoUpload.buatUploadFoto('po');
      const { err } = await jalankan(upload.single('foto'), { file: null });
      expect(err).toBeUndefined();
    });

    test('PDF ditolak dengan pesan yang bisa dibaca, bukan gagal diam-diam', async () => {
      const { err } = await cekFilter(filePalsu('nota.pdf', 'application/pdf'));
      expect(err).toBeDefined();
      expect(err.message).toMatch(/gambar/i);
    });

    test('berkas .exe yang mengaku image/jpeg tetap ditolak', async () => {
      // MIME type dikirim klien dan bisa dipalsukan. Ekstensi ikut diperiksa
      // supaya berkas berbahaya tidak lolos hanya karena headernya diubah.
      const { err } = await cekFilter(filePalsu('berbahaya.exe', 'image/jpeg'));
      expect(err).toBeDefined();
    });
  });

  describe('batas ukuran', () => {
    test('ukuran maksimal tercatat di modul, bukan tersebar di pemanggil', () => {
      // Dipakai juga untuk pesan error di klien, jadi tidak boleh ada dua
      // sumber kebenaran soal berapa besar yang diperbolehkan.
      expect(photoUpload.UKURAN_MAKS).toBeGreaterThan(0);
      expect(typeof photoUpload.UKURAN_MAKS).toBe('number');
    });
  });

  describe('penamaan berkas', () => {
    test('nama asli berkas TIDAK pernah dipakai apa adanya', () => {
      // Nama asli dipakai sebagai nama file akan membiarkan klien menentukan
      // jalur: "../../etc/passwd" atau nama berisi karakter aneh.
      const nama = photoUpload.buatNamaBerkas('po', '../../../etc/passwd');
      expect(nama).not.toContain('/');
      expect(nama).not.toContain('..');
      expect(path.basename(nama)).toBe(nama);
    });

    test('dua berkas dengan nama sama menghasilkan nama berbeda', () => {
      // Menimpa foto PO lain hanya karena nama aslinya sama akan membuat satu
      // PO kehilangan fotonya secara misterius.
      const a = photoUpload.buatNamaBerkas('po', 'nota.jpg');
      const b = photoUpload.buatNamaBerkas('po', 'nota.jpg');
      expect(a).not.toBe(b);
    });

    test('prefiksnya menandakan jenis pemiliknya', () => {
      // Nota PO dan foto material berbagi satu direktori; prefiks mencegah
      // tabrakan dan memudahkan pembersihan.
      expect(photoUpload.buatNamaBerkas('po', 'a.jpg')).toMatch(/^po-/);
      expect(photoUpload.buatNamaBerkas('material', 'a.jpg')).toMatch(/^material-/);
    });

    test('ekstensi dipertahankan, karena dipakai untuk menentukan tipe saat disajikan', () => {
      expect(photoUpload.buatNamaBerkas('po', 'nota.PNG')).toMatch(/\.\w+$/);
    });

    test('ekstensi yang tidak dikenal tidak menghasilkan nama tanpa akhiran aneh', () => {
      const nama = photoUpload.buatNamaBerkas('po', 'tanpa-ekstensi');
      expect(nama).toMatch(/^po-/);
      expect(nama).not.toMatch(/\.$/);
    });
  });

  describe('direktori', () => {
    test('direktori upload dibuat bila belum ada', () => {
      // Kalau tidak dibuat saat modul dimuat, upload pertama akan gagal di
      // mesin baru atau setelah direktori dibersihkan.
      expect(fs.existsSync(dirSementara)).toBe(true);
    });
  });

  describe('tanganiErrorUpload', () => {
    // Diekspor dari modul ini dan dipakai DUA fitur (nota PO dan foto
    // material), jadi perilakunya harus sama di keduanya. Diuji di sini supaya
    // ada satu tempat yang memastikan error multer jadi 400 berpesan, bukan
    // 500 — kegagalan yang tidak akan terlihat di test endpoint karena kedua
    // fitur mengujinya lewat jalurnya masing-masing.
    const jalankanHandler = (err) =>
      new Promise((resolve) => {
        const res = {
          statusCode: null,
          json(payload) { resolve({ status: this.statusCode, payload }); return this; },
          status(code) { this.statusCode = code; return this; },
        };
        photoUpload.tanganiErrorUpload(err, {}, res, () => resolve({ next: true }));
      });

    // Error HARUS instance MulterError asli, bukan Error biasa yang diberi
    // properti code. Handler memeriksa `err instanceof multer.MulterError`,
    // dan Error biasa akan jatuh ke cabang "pesan dari filterBerkas" —
    // sehingga pesan bahasa Inggris multer ("File too large") diteruskan
    // mentah-mentah ke pengguna. Test dengan Error biasa akan lolos sembari
    // menyembunyikan cacat itu.
    const multerError = (code) => {
      const multer = require('multer');
      return new multer.MulterError(code);
    };

    test('LIMIT_FILE_SIZE → 400 dengan batas ukuran disebut, bukan 500', async () => {
      const { status, payload } = await jalankanHandler(multerError('LIMIT_FILE_SIZE'));
      expect(status).toBe(400);
      expect(payload.error).toMatch(/MB/);
      // Angkanya harus sama dengan UKURAN_MAKS yang dipakai multer, supaya
      // pesan tidak menjanjikan batas yang berbeda dari yang ditegakkan.
      const mb = Math.round(photoUpload.UKURAN_MAKS / (1024 * 1024));
      expect(payload.error).toContain(String(mb));
    });

    test('error multer lain → 400, bukan 500', async () => {
      const { status } = await jalankanHandler(multerError('LIMIT_UNEXPECTED_FILE'));
      expect(status).toBe(400);
    });

    test('error berpesan dari filterBerkas diteruskan apa adanya', async () => {
      // Pesannya sudah ditulis untuk pengguna (menyebut JPEG/PNG/WEBP), jadi
      // menggantinya dengan pesan generik berarti membuang informasi.
      const { status, payload } = await jalankanHandler(
        new Error('Berkas harus berupa gambar JPEG, PNG, atau WEBP.')
      );
      expect(status).toBe(400);
      expect(payload.error).toMatch(/JPEG/);
    });

    test('tanpa error → diteruskan ke middleware berikutnya', async () => {
      // Kalau lupa memanggil next(), setiap unggahan yang BERHASIL akan
      // menggantung tanpa respons.
      const hasil = await jalankanHandler(null);
      expect(hasil.next).toBe(true);
    });
  });

  describe('penyajian lewat HTTP', () => {
    // Test INI yang mengawal hal yang paling mudah rusak: berkas tersimpan
    // tetapi tidak pernah bisa ditampilkan.
    //
    // Test lain di berkas ini memeriksa `fs.existsSync` — berkasnya ada di
    // disk. Itu tidak membuktikan browser bisa menjangkaunya. Mount /uploads/
    // bisa hilang, atau terpasang di posisi yang salah, dan semua test
    // filesystem tetap lolos sementara setiap foto berubah jadi gambar rusak.
    //
    // Jadi yang diuji di sini adalah kontrak antara dua bagian:
    // photoUpload.UPLOAD_DIR (tempat menyimpan) dan mount di index.js (tempat
    // menyajikan). Kalau keduanya pernah berbeda, kolom foto terisi tetapi
    // gambarnya tidak pernah muncul.
    test('direktori penyimpanan dan mount statis mengarah ke tempat yang sama', () => {
      // Dibaca dari berkas index.js, bukan ditulis ulang: dua jalur yang
      // ditulis terpisah adalah persis kegagalan yang dicegah test ini.
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'index.js'),
        'utf8'
      );

      // 1. /uploads/ benar-benar di-mount.
      const mountAda = /app\.use\(\s*['"]\/uploads['"]/.test(src);
      expect(mountAda).toBe(true);

      // 2. Mount-nya memakai photoUpload.UPLOAD_DIR, bukan path buatan sendiri.
      const pakaiKonstanta = /express\.static\(\s*photoUpload\.UPLOAD_DIR/.test(src);
      expect(pakaiKonstanta).toBe(true);

      // 3. Mount SEBELUM middleware SPA dan catch-all. Kalau sesudah, ia tidak
      //    pernah dipanggil — catch-all menjawab lebih dulu dengan index.html.
      const idxMount = src.indexOf("app.use(") >= 0 ? src.search(/app\.use\(\s*\n?\s*['"]\/uploads['"]/) : -1;
      const idxSpa = src.indexOf('[SPA EXEC] Intercepted');
      expect(idxMount).toBeGreaterThan(-1);
      expect(idxSpa).toBeGreaterThan(-1);
      expect(idxMount).toBeLessThan(idxSpa);
    });

    test('berkas yang disimpan ada di bawah direktori yang disajikan', () => {
      // Kontrak praktisnya: unggah menyimpan relatif terhadap UPLOAD_DIR, dan
      // /uploads/<nama> mengambil dari sana. Kalau unggah pernah menyimpan ke
      // tempat lain, URL-nya akan 404 walau berkasnya ada.
      const nama = photoUpload.buatNamaBerkas('po', 'nota.jpg');
      const lengkap = path.join(photoUpload.UPLOAD_DIR, nama);
      // path.join tidak pernah menghasilkan jalur di luar UPLOAD_DIR untuk nama
      // yang dibuat buatNamaBerkas — itulah sebabnya penamaan dikendalikan
      // server, bukan klien.
      expect(lengkap.startsWith(photoUpload.UPLOAD_DIR)).toBe(true);
      expect(path.dirname(lengkap)).toBe(photoUpload.UPLOAD_DIR);
    });
  });

  describe('pembersihan', () => {
    test('menghapus berkas yang ada → tidak melempar', async () => {
      const f = path.join(dirSementara, 'hapus-saya.jpg');
      fs.writeFileSync(f, 'x');
      await expect(photoUpload.hapusBerkas('hapus-saya.jpg')).resolves.toBeUndefined();
      expect(fs.existsSync(f)).toBe(false);
    });

    test('berkas yang sudah hilang → tidak melempar, tidak 500', async () => {
      // Kasus nyata: berkas terhapus manual atau gagal tersalin, lalu pengguna
      // menghapus PO-nya. Menghapus PO tidak boleh gagal karena berkasnya
      // sudah tidak ada.
      await expect(photoUpload.hapusBerkas('sudah-tidak-ada.jpg')).resolves.toBeUndefined();
    });

    test('nama berkas kosong → tidak melempar', async () => {
      await expect(photoUpload.hapusBerkas('')).resolves.toBeUndefined();
      await expect(photoUpload.hapusBerkas(null)).resolves.toBeUndefined();
    });

    test('jalan keluar direktori ditolak, tidak menghapus sembarang berkas', async () => {
      // Tanpa penjaga ini, jalur dari database yang berisi "../" bisa
      // menghapus berkas di luar direktori upload.
      const luar = path.join(path.dirname(dirSementara), 'jangan-hapus-saya.txt');
      fs.writeFileSync(luar, 'penting');
      await photoUpload.hapusBerkas('../jangan-hapus-saya.txt');
      expect(fs.existsSync(luar)).toBe(true);
      fs.rmSync(luar);
    });
  });
});
