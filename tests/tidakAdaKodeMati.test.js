/**
 * Test pengaman: kode mati material tidak boleh kembali (tiket 10).
 *
 * Test ini tidak menguji fitur — ia menguji KETIADAAN sesuatu. Sengaja
 * dibuat karena kerusakan yang dicegahnya tidak terlihat di test lain:
 * `features/material/backend/controllers.js` tidak pernah dipanggil siapa
 * pun, jadi menghapusnya tidak akan membuat satu pun test gagal. Sebaliknya,
 * kalau file itu (atau tabel ciptaannya) muncul lagi, juga tidak ada test
 * yang akan berteriak.
 *
 * Bahayanya nyata dan sudah pernah terjadi: file itu terbaca seperti
 * business-logic layer fitur material, tapi menanyai tabel dan kolom yang
 * TIDAK ADA di skema mana pun — `material_purchases`,
 * `material_purchase_items`, `raw_materials.kode_material`,
 * `raw_materials.nama_material`, `raw_materials.harga_beli_rata_rata`.
 * Agen yang disuruh "tambah pembelian material" akan masuk perangkap itu.
 *
 * Catatan: test ini membaca berkas dari disk dan mencari teks di seluruh
 * `features/`, `routes/`, `services/`, `views/`, `frontend/src`, `tests/`,
 * dan `middleware/`. Dokumentasi di `docs/` sengaja TIDAK diperiksa — arsip
 * perencanaan lama memang menceritakan sejarahnya, dan itu tidak apa-apa.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Direktori berisi kode yang betul-betul dijalankan. `docs/` ditinggalkan
// dengan sengaja (lihat catatan di atas).
const DIREKTORI_KODE = [
  'features', 'routes', 'services', 'views', 'frontend/src',
  'tests', 'middleware', 'public', 'scripts',
];

// Ekstensi yang bisa berisi referensi. Tidak termasuk .png/.jpg dan
// sejenisnya, supaya tidak membaca berkas biner sebagai teks.
const EKSTENSI = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.ejs', '.json', '.md', '.html', '.css',
]);

// Mengumpulkan semua berkas kode rekursif. node_modules tidak ikut: ia
// berisi jutaan baris dan tidak pernah menyebut nama internal kita.
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

const BERKAS_KODE = DIREKTORI_KODE.flatMap((d) => kumpulkanBerkas(path.join(ROOT, d)));

// Diri sendiri dikeluarkan dari pemeriksaan. Test ini MEMANG harus
// menyebutkan nama-nama yang dilarangnya (daftar PENEMUAN di bawah), kalau
// tidak ia tidak bisa menjelaskan apa yang dicari. Tanpa pengecualian ini
// test akan selalu gagal terhadap dirinya sendiri — cacat yang langsung
// terlihat pada kali pertama ia dijalankan.
const BERKAS_SENDIRI = path.relative(ROOT, __filename);

// README fitur juga dikeluarkan dari pemeriksaan teks: ia sengaja
// MENCANTUMKAN nama-nama terlarang untuk menjelaskan bahwa nama-nama itu
// tidak pernah ada. Menyebutnya dalam konteks "jangan pakai ini" justru
// mencegah kebingungan yang sama terulang.
const BERKAS_PENJELASAN = path.join('features', 'material', 'README.md');

const perluDiperiksa = (berkas) => {
  const rel = path.relative(ROOT, berkas);
  return rel !== BERKAS_SENDIRI && rel !== BERKAS_PENJELASAN;
};

describe('Kode mati material tidak boleh ada (tiket 10)', () => {
  // Tabel dan kolom ciptaan controllers.js yang tidak pernah dibuat
  // skemanya. Diverifikasi terhadap database nyata: kelimanya TIDAK ADA.
  const PENEMUAN = [
    'material_purchases',
    'material_purchase_items',
    'kode_material',
    'harga_beli_rata_rata',
    'nama_material',
  ];

  test('berkas kode ditemukan (penjaga: kalau ini nol, test di bawah tidak menguji apa-apa)', () => {
    // Tanpa penjaga ini, kesalahan pada DIREKTORI_KODE akan membuat semua
    // test di bawah lolos karena tidak ada berkas yang diperiksa.
    expect(BERKAS_KODE.length).toBeGreaterThan(20);
  });

  for (const nama of PENEMUAN) {
    test(`tidak ada referensi ke "${nama}" di kode`, () => {
      const pelanggar = [];
      for (const f of BERKAS_KODE.filter(perluDiperiksa)) {
        const isi = fs.readFileSync(f, 'utf8');
        if (isi.includes(nama)) {
          pelanggar.push(path.relative(ROOT, f));
        }
      }
      expect(pelanggar).toEqual([]);
    });
  }

  test('tidak ada features/*/backend/controllers.js — routes.js yang dipakai', () => {
    // Pola repo: tiap fitur punya backend/routes.js dan TIDAK punya
    // controllers.js. controllers.js material adalah satu-satunya yang
    // pernah ada, dan itu pun tidak pernah di-require.
    const ketemu = [];
    const fitur = path.join(ROOT, 'features');
    for (const entri of fs.readdirSync(fitur, { withFileTypes: true })) {
      if (!entri.isDirectory()) continue;
      const kandidat = path.join(fitur, entri.name, 'backend', 'controllers.js');
      if (fs.existsSync(kandidat)) ketemu.push(path.relative(ROOT, kandidat));
    }
    expect(ketemu).toEqual([]);
  });

  test('MaterialController tidak direferensikan di mana pun', () => {
    // Nama kelas di dalam berkas yang dihapus. Kalau ini muncul lagi,
    // berarti ada yang mulai memakai ulang kode mati itu.
    const pelanggar = [];
    for (const f of BERKAS_KODE.filter(perluDiperiksa)) {
      if (/MaterialController/.test(fs.readFileSync(f, 'utf8'))) {
        pelanggar.push(path.relative(ROOT, f));
      }
    }
    expect(pelanggar).toEqual([]);
  });

  test('README fitur material tidak menyajikan controllers.js sebagai kode yang hidup', () => {
    // README BOLEH menyebut `controllers.js` — malah sebaiknya, supaya
    // pembaca tahu mengapa ia tidak ada. Yang dilarang: menyajikannya
    // sebagai lapisan bisnis yang masih dipakai.
    //
    // Dua pengecekan yang dulunya dipakai (`expect(isi).not.toMatch(
    // /controllers\.js/)`) terbukti salah: ia melarang README menjelaskan
    // sejarahnya sendiri, padahal justru penjelasan itu yang mencegah
    // file mati muncul kembali.
    const readme = path.join(ROOT, 'features', 'material', 'README.md');
    if (!fs.existsSync(readme)) return;   // README-nya pun sudah tiada
    const isi = fs.readFileSync(readme, 'utf8');

    // Tidak boleh ada lagi di struktur folder yang diklaim ada.
    const struktur = isi.slice(isi.indexOf('## Struktur Folder'));
    const strukturSampai = struktur.slice(0, struktur.indexOf('##') + 2);
    expect(strukturSampai).not.toMatch(/controllers\.js/);

    // Penyebutan yang ada harus berupa penjelasan bahwa ia sudah dihapus,
    // bukan dokumentasi cara memakainya.
    for (const baris of isi.split('\n')) {
      if (!/controllers\.js/.test(baris)) continue;
      expect(baris.toLowerCase()).toMatch(
        /dihapus|tidak ada|pernah|jangan|dead|tidak pernah/
      );
    }
  });

  // ===== Verifikasi label: KONFIRMASI, JANGAN TULIS ULANG =====
  //
  // Spesifikasi memutuskan: sub-kategori material adalah Fabric,
  // Accessories, Product Fulfillment; Delivery DIKECUALIKAN karena ia tipe
  // biaya, bukan jenis barang; Sample Design ditangguhkan.
  //
  // Tiket 10 mensyaratkan bagian ini diverifikasi, dan kalau sudah benar
  // maka TIDAK BOLEH diubah. Membuat peta label kedua akan membuat
  // keduanya bisa drift. Jadi test di bawah mengunci isi peta yang ada.
  describe('label tipe material sesuai spesifikasi', () => {
    // Diambil dari berkasnya, bukan ditulis ulang di sini — kalau test
    // mendefinisikan ulang labelnya, ia akan lolos walau sumbernya berubah.
    const ambilTipeLabel = () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'features', 'material', 'backend', 'routes.js'),
        'utf8'
      );
      const m = src.match(/const TIPE_LABEL = \{([\s\S]*?)\};/);
      if (!m) return null;
      const peta = {};
      for (const baris of m[1].matchAll(/(\w+):\s*'([^']*)'/g)) {
        peta[baris[1]] = baris[2];
      }
      return peta;
    };

    test('peta label punya TEPAT empat nilai yang disyaratkan spesifikasi', () => {
      const peta = ambilTipeLabel();
      expect(peta).not.toBeNull();
      expect(Object.keys(peta).sort()).toEqual(
        ['aksesoris', 'cmt_cost', 'kain_ecer', 'kain_roll']
      );
    });

    test('cmt_cost dilabeli "Product Fulfillment"', () => {
      expect(ambilTipeLabel().cmt_cost).toBe('Product Fulfillment');
    });

    test('TIDAK ada tipe material untuk Delivery', () => {
      // Delivery adalah tipe BIAYA (kirim_aksesoris pada production_costs),
      // bukan jenis barang. Menambahkannya ke sini akan membuatnya bisa
      // dipilih sebagai material.
      const peta = ambilTipeLabel();
      const kunci = Object.keys(peta).join(' ').toLowerCase();
      expect(kunci).not.toMatch(/kirim|delivery|pengiriman/);
    });

    test('TIDAK ada tipe material untuk Sample Design', () => {
      // Spesifikasi menangguhkannya. Kalau nanti ditambahkan, test ini
      // sengaja akan gagal — itu saat yang tepat untuk mendiskusikannya,
      // bukan menambahkannya diam-diam.
      const peta = ambilTipeLabel();
      const nilai = Object.values(peta).join(' ').toLowerCase();
      expect(nilai).not.toMatch(/sample|design|desain/);
      expect(Object.keys(peta).join(' ').toLowerCase()).not.toMatch(/sample|design|desain/);
    });

    // Regresi: dulu views/reports/stock-card.ejs merangkai labelnya sendiri
    // dan melabeli kain_ecer sebagai "Ecer", sementara API mengirim
    // "Kain (Ecer)". views/raw-materials/* memakai dua ejaan lain lagi.
    // Menulis ulang label di view itulah yang membuat mereka drift.
    test('TIPE_LABEL diekspor supaya view tidak perlu menulis label sendiri', () => {
      // eslint-disable-next-line global-require
      const rute = require('../features/material/backend/routes');
      expect(rute.TIPE_LABEL).toBeDefined();
      expect(rute.TIPE_LABEL.kain_ecer).toBe('Kain (Ecer)');
    });

    test('modul yang merender material memakai TIPE_LABEL, bukan string sendiri', () => {
      // routes/reports.js mengimpor peta label dari fitur material. Kalau
      // ia kembali menulis labelnya sendiri, baris require ini akan hilang.
      const src = fs.readFileSync(
        path.join(ROOT, 'routes', 'reports.js'),
        'utf8'
      );
      expect(src).toMatch(/TIPE_LABEL/);
      expect(src).toMatch(/features\/material\/backend\/routes/);
    });

    test('view EJS yang HIDUP tidak merangkai label tipe sendiri', () => {
      // Hanya view yang rutenya masih ter-mount yang diperiksa: view mati
      // (raw-materials/*) tidak bisa drift karena tidak pernah dirender.
      //
      // Daftar view hidup diperiksa secara terpisah oleh test
      // smoke-halaman-ejs.js; di sini cukup yang memakai tipe material.
      const hidup = ['views/reports/stock-card.ejs'];
      for (const rel of hidup) {
        const f = path.join(ROOT, rel);
        if (!fs.existsSync(f)) continue;
        const isi = fs.readFileSync(f, 'utf8');
        // Rangkaian ternary per-tipe adalah pola lama yang dilarang.
        expect(isi).not.toMatch(/tipe === 'kain_roll'/);
        expect(isi).not.toMatch(/tipe === 'kain_ecer'/);
      }
    });
  });
});
