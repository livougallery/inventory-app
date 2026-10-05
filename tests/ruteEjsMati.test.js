/**
 * Test pengaman: rute & view EJS yang tidak ter-mount tidak boleh kembali
 * (tiket 02).
 *
 * Test ini menguji KETIADAAN, sama seperti `tidakAdaKodeMati.test.js`.
 * Yang membuatnya perlu ada: menghapus `routes/products.js` & friends tidak
 * membuat satu pun test lain merah. Tidak ada yang berteriak kalau file itu
 * dibalik — dan justru itulah bahayanya, karena file itu terbaca seperti fitur
 * yang berfungsi. Agen yang disuruh "tambah edit produk" akan mulai dari kode
 * yang tidak pernah dipanggil server.
 *
 * Polanya PATH-QUALIFIED, bukan nama telanjang.
 *
 * Kenapa bukan `purchase-orders` polos: nama itu substring dari
 * `features/purchase-order/backend/routes.js`, yang ter-mount di `index.js:121`
 * dan hidup penuh — termuat `/api/purchase-orders` plus 138 sebutan di test.
 * Pola telanjang akan menuduhnya. Kalau lalu kita mengecualikannya agar hijau,
 * satu-satunya cara hijaunya lolos karena alasan yang salah.
 * Jadi polanya persis seperti path yang dihapus: `routes/purchase-orders.js`,
 * `views/purchase-orders/`.
 *
 * Pengecualian yang disengaja:
 * - `frontend/src` tetap diperiksa untuk bentuk path (`views/<x>/`,
 *   `routes/<x>.js`), tapi TIDAK untuk URL telanjang seperti
 *   `/production-batches` — `App.tsx` dan `Shell.tsx` masih menautkan URL itu,
 *   dan itu BENAR: rutenya hidup lewat React, bukan lewat EJS. Yang mati
 *   adalah view EJS-nya, bukan URL-nya.
 * - `docs/` tidak diperiksa — arsip perencanaan lama sah menyimpan
 *  sejarahnya. `SPA-ROUTING-FIX-*.md` di root juga arsip, dan ada di luar
 *  DIREKTORI_KODE.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Direktori berisi kode yang benar-benar dijalankan. `docs/` ditinggalkan
// dengan sengaja (lihat catatan di atas).
const DIREKTORI_KODE = [
  'features', 'routes', 'services', 'views', 'frontend/src',
  'tests', 'middleware', 'public', 'scripts',
];

// Berkas DI ROOT juga wajib diperiksa, bukan cuma subdirektori di atas.
// `index.js` adalah satu-satunya tempat mount ditambahkan, jadi berkas yang
// paling perlu diawasi justru yang paling mudah terlewat kalau hanya
// subdirektori yang dipindai. Bukti nyata, bukan fear spekulatif:
// `index.js:227` masih menyimpan
// `// app.use('/dashboard', require('./routes/dashboard'))` -- rujukan ke
// berkas yang dihapus tiket ini.
const BERKAS_ROOT = ['index.js', 'db.js'];

const EKSTENSI = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.ejs', '.json', '.md', '.html', '.css',
]);

function kumpulkanBerkas(dir, hasil = []) {
  if (!fs.existsSync(dir)) return hasil;
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entri.name === 'node_modules' || entri.name === '.git') continue;
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) {
      kumpulkanBerkas(penuh, hasil);
    } else if (EKSTENSI.has(path.extname(entri.name))) {
      hasil.push(penuh);
    }
  }
  return hasil;
}

const BERKAS_KODE = [
  ...DIREKTORI_KODE.flatMap((d) => kumpulkanBerkas(path.join(ROOT, d))),
  ...BERKAS_ROOT.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
];

// Path yang harus tidak ada lagi di disk. Bukan route-nya saja: view-nya ikut,
// karena `res.render()` baru meledak (500) saat halaman benar-benar dibuka —
// dan tidak ada yang membuka halaman yang rutenya sudah dihapus.
const PATH_HILANG = [
  'routes/products.js',
  'routes/vendors.js',
  'routes/purchase-orders.js',
  'routes/raw-materials.js',
  'routes/hpp.js',
  'routes/production-batches.js',
  'routes/dashboard.js',
  'services/hppFormulaService.js',
  'public/cek-data.css',
  'public/cek-data.js',
  'views/products',
  'views/vendors',
  'views/purchase-orders',
  'views/raw-materials',
  'views/hpp',
  'views/production-batches',
  'views/cek-data',
  'views/dashboard',
];

// Bentuk path yang dihapus. Path-qualified dengan sengaja — lihat catatan atas.
//
// WAJIB menyertakan bentuk TANPA ekstensi, karena itulah bentuk yang dipakai
// kode nyata. Bukti historis dari `git show a5df514:index.js`:
//
//   app.use('/products', require('./routes/products'));
//   app.use('/production-batches', require('./routes/production-batches'));
//
// Pola yang hanya mengenali `routes/products.js` akan lolos untuk semua
// require() di atas -- semua akan hijau, padahal suntingan itu persis yang
// paling harus ditangkap. Karena itu kedua bentuk (dengan dan tanpa
// ekstensi) diperiksa, dan keduanya harus tetap bisa membedakan nama yang
// dihapus dari nama yang hidup seperti `features/purchase-order/`.
const POLA_TERLARANG = [
  // require/mount, tanpa ekstensi: `require('./routes/products')`
  /routes\/(products|vendors|purchase-orders|raw-materials|hpp|production-batches|dashboard|cek-data)(?=['"`\s,)])/,
  // require/mount, dengan ekstensi: `require('./routes/products.js')`
  /routes\/(products|vendors|purchase-orders|raw-materials|hpp|production-batches|dashboard|cek-data)\.js/,
  /services\/hppFormulaService/,
  /hpp-preview/,
  // res.render('products/index') dan jalur view/ yang ditulis lengkap.
  /render\(['"`](products|vendors|purchase-orders|raw-materials|hpp|production-batches|cek-data|dashboard)\//,
  /views\/(products|vendors|purchase-orders|raw-materials|hpp|production-batches|cek-data|dashboard)\//,
  /['"`]\/?cek-data\.(css|js)/,
];

// Diri sendiri dikeluarkan: test ini memang harus menyebut nama yang dilarang,
// kalau tidak ia tidak bisa menjelaskan apa yang dicari.
const BERKAS_SENDIRI = path.relative(ROOT, __filename);

// README fitur dikeluarkan: ia sengaja MENCANTUMKAN nama terlarang untuk
// menjelaskan bahwa nama itu tidak pernah ada lagi. Menyebutnya dalam konteks
// "jangan pakai ini" justru mencegah kebinguan yang sama terulang. Pola yang
// sama sudah dipakai `tidakAdaKodeMati.test.js`.
const BERKAS_PENJELASAN = [path.join('features', 'material', 'README.md')];

// `tidakAdaKodeMati.test.js` menyebut `views/raw-materials/*` di komentar untuk
// menjelaskan kenapa view yang mati tidak bisa drift. Ia tidak menguji kode
// mati, jadi daftar PENEMUAN-nya sendiri harus bebas dari pola di sini.
const BERKAS_TERKAIT = [path.join('tests', 'tidakAdaKodeMati.test.js')];

const perluDiperiksa = (berkas) => {
  const rel = path.relative(ROOT, berkas);
  return rel !== BERKAS_SENDIRI
    && !BERKAS_PENJELASAN.includes(rel)
    && !BERKAS_TERKAIT.includes(rel);
};

describe('Rute & view EJS mati tidak boleh kembali (tiket 02)', () => {
  test('berkas kode ditemukan (penjaga: kalau ini nol, test di bawah tidak menguji apa-apa)', () => {
    // Per-y-direktori, bukan satu angka global. Ambang global terlalu longgar:
    // kehilangan seluruh `views/` masih menyisakan lebih dari 20 berkas, jadi
    // test tetap hijau padahal separuh target yang dijaga hilang dari cakupan.
    // `index.js` diperiksa lewat BERKAS_ROOT karena ada di root, bukan di
    // subdirektori mana pun -- dan justru dia berkas yang paling perlu diawasi.
    for (const d of DIREKTORI_KODE) {
      const jumlah = kumpulkanBerkas(path.join(ROOT, d)).length;
      expect(jumlah).toBeGreaterThan(0);
    }
    expect(BERKAS_ROOT.every((f) => BERKAS_KODE.includes(path.join(ROOT, f)))).toBe(true);
    expect(BERKAS_KODE.length).toBeGreaterThan(20);
  });

  test('route & view yang dihapus tidak ada lagi di disk', () => {
    const masihAda = PATH_HILANG.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
    expect(masihAda).toEqual([]);
  });

  test('tidak ada referensi ke path yang dihapus', () => {
    const salah = [];
    for (const f of BERKAS_KODE.filter(perluDiperiksa)) {
      const isi = fs.readFileSync(f, 'utf8');
      const kena = POLA_TERLARANG.filter((p) => p.test(isi));
      if (kena.length > 0) {
        salah.push(path.relative(ROOT, f) + ' :: ' + kena.map(String).join(' '));
      }
    }
    expect(salah).toEqual([]);
  });

  test('test productionBatches.test.js ikut terhapus', () => {
    // Berkas ini require('../routes/production-batches') secara langsung.
    // Kalau route-nya dihapus tapi test-nya dibiarkan, suite gagal dengan
    // "Cannot find module" — bukan pesan yang menjelaskan kenapa.
    expect(fs.existsSync(path.join(ROOT, 'tests', 'productionBatches.test.js'))).toBe(false);
  });
});
