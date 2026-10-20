/**
 * Smoke test: Register Produk — tombol "Tambah Produk" dan formnya.
 *
 * Kenapa ini ada: tombol itu baru dibangun (30 Sep 2026). `tsc -b` hanya
 * membuktikan tipenya cocok; `vite build` hanya membuktikan bundlenya bisa
 * dirakit. Dua-duanya tetap hijau kalau tombolnya diam, atau kalau produk yang
 * disimpan tidak pernah muncul sebagai kartu — persis kelas check yang sudah
 * pernah menimpa halaman ini (25 Sep).
 *
 * Yang diperiksa:
 *   1. Pertukaran posisi : hitungan "4 produk" dan tombol "Tambah Produk" berada
 *                         di baris yang sama, dan baris judul tidak lagi
 *                         membawa tombol
 *   2. Form terbuka      : badan form-nya punya bagian wajib, urutannya benar,
 *                         dan tombol Simpan MATI saat form masih kosong
 *   3. Produk tersimpan  : produk hasil form benar-benar MASUK ke daftar kartu
 *                         dan ikut terhitung di angka "produk" — ini yang
 *                         membuktikan tombolnya tidak diam
 *   4. Kartu benar       : kartu baru punya warna, varian, dan total yang
 *                         dihitung oleh definisi yang sama dengan katalog
 *   5. Gerbang simpan    : produk tanpa warna / tanpa pcs tidak bisa disimpan
 *   6. Batal ≠ Simpan    : tombol Batal tidak memanggil onSimpan
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-register-produk.mjs
 *
 * Tidak butuh server, tidak butuh browser, tidak menyentuh database.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');

const gagal = [];
const ok = (l) => console.log(`  OK   ${l}`);
const salah = (l, d) => {
  gagal.push(l);
  console.log(`  GAGAL ${l} — ${d}`);
};

// ===== Bangun bundel SSR sekali pakai =====
//
// Pola yang sama persis dengan `smoke-material-fulfillment.mjs`. `renderToString`
// biasa tidak bisa dipakai karena komponen memakai `import.meta.env` yang hanya
// dipahami Vite.

mkdirSync(path.join(frontendDir, 'node_modules', '.tmp'), { recursive: true });
const kerja = mkdtempSync(path.join(frontendDir, 'node_modules', '.tmp', 'smoke-rp-'));

const nama = path.basename(kerja);
const konfig = path.join(frontendDir, `_${nama}.vite.config.ts`);
const masuk = path.join(frontendDir, `_${nama}.entry.tsx`);

// Pembersihan lewat `process.on('exit')`: `process.exit()` DILEWATI blok
// `finally`, dan skrip ini memanggilnya di beberapa tempat.
const bersihkan = () => {
  rmSync(kerja, { recursive: true, force: true });
  for (const f of [konfig, masuk]) rmSync(f, { force: true });
};
process.on('exit', bersihkan);

const entri = `
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import App from './src/App';
import RegisterProduk from './src/pages/RegisterProduk';
import { IsiFormProdukBaru, MAKS_PRODUK_BARU } from './src/pages/register-produk/FormProdukBaru';
import { KartuWarna, KartuWarnaEdit, EditKeputusanBom, IsiDetailProduk } from './src/pages/register-produk/DetailProduk';
import { PRODUK_REGISTER, kartuRegister, type ProdukRegister } from './src/lib/produk';
import { produkDariApi } from './src/lib/registerProduk';
import type { WarnaMaster } from './src/lib/warna';

const kosong = () => {};

/* Master warna untuk form. WAJIB diisi sejak form tersambung database:
   kolom product_variants.warna_kode punya foreign key ke tabel warna, jadi form
   yang tidak menerima master tidak bisa dipakai sama sekali -- bukan cuma
   "belum sempat diisi". Warnanya sengaja memakai kode yang sama dengan katalog
   contoh (BLK/OAT) supaya varian yang dihasilkan bisa dibandingkan dengan
   hasil kartuRegister(). */
const WARNA_UJI: WarnaMaster[] = [
  { kode: 'BLK', nama: 'Hitam' },
  { kode: 'OAT', nama: 'Oatmeal' },
];

/* Brand untuk form. Diambil dari produk yang sudah ada, sama seperti halaman
   mengisinya. Dipakai juga oleh fixture identitas di bagian 9. */
const BRAND_UJI = ['Livou', 'Cassca'];

// ===== 1. Pertukaran posisi =====
//
// Halaman utuh, lewat rutenya — bukan komponennya langsung, supaya pemetaan
// rute ikut teruji.
export const halaman = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/register-produk']}>
    <App />
  </MemoryRouter>
);

// Baris yang memuat hitungan DAN tombol. Dicari dari markup hasil render,
// bukan dari sumber: yang perlu dibuktikan adalah apa yang benar-benar sampai
// ke browser, bukan apa yang ditulis di JSX.
//
// PENCARIANNYA TIDAK BOLEH PAKAI "div dengan class tertentu", karena baris
// judul memakai class yang sama persis (flex items-center justify-between
// gap-3) -- dan ketika tombol masih di sana, indexOf menemukan baris judul
// lebih dulu. Jendela karakter yang lebar seperti itu lalu menelan hitungan
// yang berada di baris BERIKUTNYA, dan check "sebaris" hijau karena alasan
// yang salah: keduanya memang tidak sebaris.
//
// Jadi yang diukur adalah KEPEMDEKARAN: dari pargraf hitungan, tombol harus
// ada sebelum div pertama yang menutup barisnya. Kalau tidak, keduanya
// bersaudara di baris yang sama.
const iHitung = halaman.indexOf('<p class="text-xs text-muted-foreground tabular-nums">');
const iTutupBaris = iHitung >= 0 ? halaman.indexOf('</div>', iHitung) : -1;
const iTombol = halaman.indexOf('Tambah Produk</button>');
const iJudul = halaman.indexOf('>Register</h1>');

// Penutup baris JUDUL, dihitung dengan menghitung tag div -- bukan dengan
// mengambil </div> pertama sesudah <h1>.
//
// Dua-duanya salah untuk alasan berlawanan:
//   - </div> pertama sesudah <h1> underestimated saat tombol masih di baris
//     judul, karena baris itu membungkus judulnya dengan satu div dalam.
//     Batasnya jadi jatuh sebelum tombol, dan check "tidak ada di baris
//     judul" hijau padahal tombolnya ada di sana.
//   - batas sampai baris hitungan (yang dipakai versi sebelumnya) melewati
//     baris judul PLUS baris hitungan, jadi tombol yang sudah benar-benar
//     pindah ke baris hitungan tetap terbaca "masih di baris judul".
//
// Yang benar: mulai dari tag pembuka baris judul, hitung </div> yang
// pertama kali menutupnya.
const iBarisJudul = iJudul > 0 ? halaman.lastIndexOf('<div class="mb-4', iJudul) : -1;
const tutupBarisJudul = (() => {
  if (iBarisJudul < 0) return -1;
  // Regex dibuat dari string: entry ini hidup di dalam template literal
  // skrip ini, jadi backslash di dalam regex literal akan dimakan outer
  // template sebelum sampai ke vite.
  const re = new RegExp('<div|</div>', 'g');
  re.lastIndex = iBarisJudul;
  // Mulai dari 0, BUKAN 1: tag pembuka di iBarisJudul ikut dihitung oleh
  // perulangan di bawah. Kalau dimulai dari 1, tag itu dihitung dua kali dan
  // yang dicari jadi </div> kedua -- batas meleset satu baris.
  let depth = 0;
  let m;
  while ((m = re.exec(halaman)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
})();

export const posisi = {
  iHitung,
  iTutupBaris,
  iTombol,
  iJudul,
  iBarisJudul,
  tutupBarisJudul,
  // Tombol benar-benar SAUDARA dari hitungan: masih di dalam baris yang sama.
  tombolSatuanDenganHitungan:
    iHitung > 0 && iTombol > iHitung && (iTutupBaris < 0 || iTombol < iTutupBaris),
  // Hitungan di kiri, tombol di kanan.
  hitunganSebelumTombol: iHitung > 0 && iTombol > iHitung,
  // Baris judul: TIDAK boleh lagi membawa tombol.
  tombolDiBarisJudul:
    iBarisJudul >= 0 &&
    tutupBarisJudul > iBarisJudul &&
    halaman.slice(iBarisJudul, tutupBarisJudul).includes('Tambah Produk'),
  jumlahTombol: (halaman.match(/Tambah Produk/g) || []).length,
};

// Kontra-pembuktian: pengukuran "saudara" di atas harus benar-benar membedakan
// dua baris dari satu baris. Tanpa ini, check "hitungan & tombol sebaris"
// hijau juga kalau pengukurannya tidak pernah membaca apa pun.
const ECUDA = '<p class="text-xs text-muted-foreground tabular-nums">4 produk</p>';
const SAUDARA = (html) => {
  const i = html.indexOf(ECUDA);
  const t = html.indexOf('Tambah Produk</button>');
  const tutup = html.indexOf('</div>', i);
  return i > 0 && t > i && (tutup < 0 || t < tutup);
};
export const bantahHelper = {
  satuBaris: SAUDARA('<div class="flex">' + ECUDA + '<button>Tambah Produk</button></div>'),
  // Dua baris terpisah: hitungan ditutup dulu, tombolnya jauh setelahnya.
  duaBaris: !SAUDARA(
    '<div class="flex">' + ECUDA + '</div><div class="flex"><button>Tambah Produk</button></div>'
  ),
};

// ===== 2 & 5. Form: isi dan gerbang simpan =====

// Yang dirender adalah IsiFormProdukBaru, BUKAN FormProdukBaru. FormProdukBaru
// membungkus isinya dengan Dialog Base UI yang dirender lewat portal, dan
// portal TIDAK ikut muncul di renderToStaticMarkup -- hasilnya div kosong, dan
// semua pemeriksaan isi form akan hijau tanpa pernah melihat apa pun.
export const formKosong = renderToStaticMarkup(
  <IsiFormProdukBaru brands={BRAND_UJI} onSimpan={kosong} onTutup={kosong} sudahAda={0} />
);

/* Form yang TIDAK menerima satu pun brand.

   Bukan kasus teoretis: brand diambil dari produk yang sudah ada, jadi database
   yang masih kosong tidak punya brand untuk ditawarkan — dan itu justru keadaan
   saat produk PERTAMA didaftarkan. Kalau kotaknya tetap dirender sebagai pilihan
   kosong, formnya buntu tanpa satu pun kalimat yang menjelaskan kenapa. Yang
   diperiksa di bawah: kotaknya jatuh ke isian bebas, memakai brand bawaan. */
export const formTanpaBrand = renderToStaticMarkup(
  <IsiFormProdukBaru brands={[]} onSimpan={kosong} onTutup={kosong} sudahAda={0} />
);

/* Tidak ada lagi daftar "bagian" form.

   Form ini dulu terbagi empat bagian berjudul (Identitas / Keterangan produksi
   / Product attributes / Detail varian), dan urutannya diuji dari daftar itu.
   Sekarang isinya enam isian satu kolom tanpa judul bagian: yang perlu diuji
   adalah urutan ISIannya, dan itu diukur di "isianForm" lewat aria-label
   masing-masing -- bukan lewat judul bagian yang sudah tidak ada. */

// Tombol Simpan harus MATI saat form masih kosong.
const semuaTombol = formKosong.match(/<button\\b[^>]*>[\\s\\S]*?<\\/button>/g) ?? [];
const tombolSimpan = semuaTombol.filter((t) => t.includes('Simpan Produk'));
export const gerbangSimpan = {
  ada: tombolSimpan.length,
  mati: tombolSimpan.length > 0 && tombolSimpan.every((t) => t.includes('disabled=""')),
  // Form yang sudah penuh batas: tombol harus mati juga, dan alasannya tampil.
  batasMati: (() => {
    const penuh = renderToStaticMarkup(
      <IsiFormProdukBaru brands={BRAND_UJI} onSimpan={kosong} onTutup={kosong} sudahAda={MAKS_PRODUK_BARU} />
    );
    const t = (penuh.match(/<button\\b[^>]*>[\\s\\S]*?<\\/button>/g) ?? []).filter((x) =>
      x.includes('Simpan Produk')
    );
    return {
      jumlah: t.length,
      mati: t.length > 0 && t.every((x) => x.includes('disabled=""')),
      pesanBatas: penuh.includes('Batas'),
    };
  })(),
};

// Kontra-pembuktian helper tombol: membedakan hidup dan mati.
export const bantahTombol = {
  mati: (h) => {
    const t = (h.match(/<button\\b[^>]*>[\\s\\S]*?<\\/button>/g) ?? []).filter((x) =>
      x.includes('Simpan Produk')
    );
    return t.length > 0 && t.every((x) => x.includes('disabled=""'));
  },
};

// ===== 6. Batal tidak boleh menyimpan =====
//
// Dua teksnya berdekatan, jadi yang diperiksa bukan hanya "ada Batal" tapi
// tag tombolnya: kalau Batal memakai onSimpan, isinya tetap sama persis dan
// tidak ada test lain yang bisa membedakannya.
export const batalVsSimpan = {
  adaBatal: formKosong.includes('Batal'),
  tagBatal: (() => {
    const t = semuaTombol.find((x) => x.includes('Batal'));
    return t ?? null;
  })(),
};

// ===== 3 & 4. Produk dari form benar-benar masuk daftar =====
//
// WAJIB lewat HALAMAN UTUH dengan produkAwal, bukan memanggil kartuRegister
// langsung: kalau katalog dikembalikan ke PRODUK_REGISTER saja, kartuRegister
// masih benar dan test ini tetap hijau sementara tombolnya kembali diam.
const PRODUK_UJI: ProdukRegister = {
  id: 'PRD-BARU-1',
  nama: 'Oversized Hoodie Kereta',
  brand: 'Livou',
  registerDate: '2026-09-30',
  kategori: 'Outer',
  foto: null,
  harga: 249000,
  spesifikasi: {
    designCode: 'LVU-TOP-11',
    kategori: 'Outer',
    batch: 'B-05',
    kategoriVendor: 'konveksi',
    namaVendor: 'Konveksi Sejahtera',
    warna: [
      { nama: 'Hitam', kode: 'HTP', pcs: [{ ukuran: 'M', qty: 20 }, { ukuran: 'L', qty: 30 }] },
      { nama: 'Navy', kode: 'NVY', pcs: [{ ukuran: 'M', qty: 15 }] },
    ],
    kain: [],
    aksesori: [],
  },
};

/**
 * Produk yang kodenya diketik orang, bukan diturunkan.
 *
 * Ada karena owners meminta kolom kode di form bisa disunting: rumus kode
 * variasi belum dibuat. Kalau kartuRegister masih selalu menurunkan
 * kodeVarian dari designCode + kode warna + ukuran, hasil ketikan itu hilang
 * tanpa pesan -- kartu tetap tampil, kodenya cuma kembali ke bawaan.
 */
const PRODUK_KODE_KUSTOM: ProdukRegister = {
  ...PRODUK_UJI,
  id: 'PRD-BARU-2',
  nama: 'Crewneck Kaos',
  spesifikasi: {
    ...PRODUK_UJI.spesifikasi,
    designCode: 'LVU-TOP-22',
    warna: [
      {
        nama: 'Hitam',
        kode: 'HTP',
        pcs: [
          { ukuran: 'M', qty: 10, kode: 'HITAM-M-V2' },
          { ukuran: 'L', qty: 10 },
        ],
      },
    ],
  },
};


/* Halaman dengan katalog yang SUDAH termuat, versus halaman dengan katalog itu
   ditambah satu produk baru.

   Katalognya dikirim lewat prop produkAwal karena itulah seam-nya: halaman
   mengambil produk dari /api/register-produk/products/register, dan di
   renderToStaticMarkup fetch tidak pernah selesai. Tanpa produkAwal, halaman
   merender KEADAAN MEMUAT -- nol kartu -- dan seluruh pemeriksaan "produk baru
   menambah satu kartu" jadi hijau karena 1 - 0 = 1, padahal katalognya sendiri
   tidak pernah terender sama sekali. */
export const tanpaBaru = renderToStaticMarkup(<RegisterProduk produkAwal={PRODUK_REGISTER} />);
export const denganBaru = renderToStaticMarkup(
  <RegisterProduk produkAwal={[PRODUK_UJI, ...PRODUK_REGISTER]} />
);

/* Halaman sebelum datanya sampai: satu-satunya keadaan yang benar-benar terjadi
   di renderToStaticMarkup tanpa produkAwal.

   Yang dijaga: layar ini TIDAK BOLEH berbunyi "Belum ada produk yang terdaftar".
   Kalimat itu menyalahkan gudang yang belum sempat dibaca -- dan justru itulah
   yang muncul kalau keadaan memuat diperiksa setelah daftar kosong. */
export const saatMemuat = renderToStaticMarkup(<RegisterProduk />);

const kartuDi = (html) => (html.match(/data-slot="card"/g) || []).length;

// Angka "produk" di bawah toolbar. Dibaca dari markup, tahan simpul komentar
// React, dan dikunci ke pola "N produk" supaya tidak tertangkap kata "produk"
// lain di halaman.
const angkaProduk = (html) => {
  const bersih = html.replace(/<!--[\\s\\S]*?-->/g, '');
  const m = /(\\d+)\\s*(?:<!---->\\s*)?produk/.exec(bersih);
  return m ? Number(m[1]) : null;
};

export const daftar = {
  kartuDengan: kartuDi(denganBaru),
  kartuTanpa: kartuDi(tanpaBaru),
  produkDengan: angkaProduk(denganBaru),
  produkTanpa: angkaProduk(tanpaBaru),
  namaTerlihat: denganBaru.includes(PRODUK_UJI.nama),
  // KARTU TIDAK LAGI merender harga (permintaan pemilik, 15 Okt 2026). Yang
  // sekarang tampil di kartu: nama, kategori, KODE DESAIN, tiga baris
  // marketplace, dan jumlah warna/varian. Harga dan angka stoknya pindah ke
  // dialog detail.
  //
  // Jadi hargaTerlihat sengaja diukur sebagai HARUS TIDAK ADA — bukan
  // dihapus dari test. Kalau cuma dihapus, harga yang diam-diam kembali ke
  // kartu tidak akan ketahuan oleh apa pun.
  hargaTidakTerlihat: !denganBaru.includes('249'),
  // Kode desain justru kebalikannya: dulu TIDAK ada di kartu (ada di dialog
  // detail saja), sekarang menempel di kaki foto. Diukur sebagai SELISIH
  // jumlah kemunculan, bukan includes().
  //
  // includes() di sini akan hijau tanpa menguji apa pun: produk uji memakai
  // designCode yang SAMA dengan produk pertama katalog (LVU-TOP-11), jadi
  // stringnya sudah ada di halaman walau kartu barunya tidak dirender sama
  // sekali. Yang membuktikan ada kartu baru adalah jumlahnya bertambah satu.
  kodeDengan: (denganBaru.match(new RegExp(PRODUK_UJI.spesifikasi.designCode, 'g')) || [])
    .length,
  kodeTanpa: (tanpaBaru.match(new RegExp(PRODUK_UJI.spesifikasi.designCode, 'g')) || [])
    .length,
  kategoriTerlihat: denganBaru.includes(PRODUK_UJI.kategori),
  // Baris marketplace. Ketiganya harus ada untuk SETIAP produk, termasuk yang
  // belum terdaftar — justru itu yang dicari di kartu ini.
  pasarTerlihat: ['Shopee', 'TikTok', 'Shopify'].every((p) => denganBaru.includes(p)),
  statusTerlihat:
    denganBaru.includes('Registered') && denganBaru.includes('Not registered'),
  // Produk uji (PRD-BARU-1) tidak punya entri di peta PASAR, jadi KETIGA
  // barisnya harus terbaca "Not registered".
  //
  // Diukur sebagai SELISIH terhadap render tanpa produk baru, bukan sebagai
  // jumlah mutlak: katalog contohnya sendiri sudah punya baris "Not registered"
  // (PRD-02 hanya Shopee, PRD-04 hanya TikTok), jadi angka mutlak berapa pun
  // tidak membuktikan apa pun tentang produk yang baru ditambahkan.
  statusBelumDengan: (denganBaru.match(/Not registered/g) || []).length,
  statusBelumTanpa: (tanpaBaru.match(/Not registered/g) || []).length,
};

/* Keadaan sebelum data sampai.

   Diperiksa sebagai PASANGAN: "Memuat produk…" ada, DAN kalimat daftar kosong
   tidak ada. Yang kedua yang penting -- halaman yang salah urut tetap
   menampilkan pemuatnya sesaat sebelum menuduh gudangnya kosong, jadi check
   yang cuma mencari "Memuat produk" akan hijau untuk dua-duanya.

   Cabang daftar-kosong TIDAK bisa diuji di sini: keadaan memuat mulai dari
   true, dan renderToStaticMarkup tidak menjalankan efek yang bisa
   mengubahnya. Ia diuji di browser (smoke-tab-warna.mjs) tempat pemuatannya
   benar-benar selesai. */
export const keadaanAwal = {
  adaPemuat: saatMemuat.includes('Memuat produk'),
  // Halaman yang memuat TIDAK boleh mengaku daftarnya kosong.
  bukanKosong: !saatMemuat.includes('Belum ada produk yang terdaftar'),
};

// Kartu hasil form, diperiksa lewat FUNGSI ASLI yang dipakai halaman.
const kartuBaru = kartuRegister([PRODUK_UJI])[0];
const kartuBawaan = kartuRegister(PRODUK_REGISTER)[0];
export const kartu = {
  jumlahWarna: kartuBaru?.jumlahWarna ?? null,
  jumlahVarian: kartuBaru?.jumlahVarian ?? null,
  warna: kartuBaru?.warnaRingkas.map((w) => w.warna) ?? [],
  size: kartuBaru?.warnaRingkas.map((w) => w.size) ?? [],
  // Varian yang stoknya belum pernah dicatat harus tetap ada, dengan angka nol.
  varianAda: kartuBaru?.varian.length ?? 0,
  totalJual: kartuBaru?.totalJual ?? null,
  totalStok: kartuBaru?.totalStok ?? null,
  nilaiSisa: kartuBaru?.nilaiSisa ?? null,
  kodeVarian: kartuBaru?.varian.map((v) => v.kodeVarian) ?? [],
  // Bawaan tidak boleh berubah karena ada parameter baru. Dibandingkan ke
  // produk PERTAMA di katalog, bukan ke nama yang ditulis ulang di sini: nama
  // katalog boleh diganti nanti, dan check yang mengulang string-nya sendiri
  // akan hijau atau merah tanpa menguji kartu yang sebenarnya.
  bawaanNama: kartuBawaan?.nama ?? null,
  bawaanSama: kartuBawaan?.nama === PRODUK_REGISTER[0].nama,
  bawaanJumlah: kartuRegister(PRODUK_REGISTER).length,
  bawaanVarian: kartuBawaan?.jumlahVarian ?? null,
};

// Parameter opsional: tanpa argumen harus persis sama seperti sebelumnya.
export const tanpaArgumen = {
  jumlah: kartuRegister().length,
  samaDenganEksplisit: JSON.stringify(kartuRegister()) === JSON.stringify(kartuRegister(PRODUK_REGISTER)),
};

/* Kode yang diketik orang harus dipakai apa adanya; varian tanpa kode kustom
   tetap diturunkan. Dicegat di sini, bukan di skrip luar, supaya perbandingannya
   terjadi terhadap objek kartu yang sama seperti yang dipakai halaman. */
export const kodeKustom = (() => {
  const v = kartuRegister([PRODUK_KODE_KUSTOM])[0]?.varian ?? [];
  return {
    jumlah: v.length,
    kodeM: v.find((x) => x.size === 'M')?.kodeVarian ?? null,
    kodeL: v.find((x) => x.size === 'L')?.kodeVarian ?? null,
    stokM: v.find((x) => x.size === 'M')?.stokMasuk ?? null,
    stokL: v.find((x) => x.size === 'L')?.stokJual ?? null,
  };
})();

/* Enam isian form "Tambah Produk", persis yang diminta pemilik (19 Okt 2026):
   nama, brand, foto, kategori, kode SKU, tanggal. Diukur dari MARKUP hasil
   render, bukan dari sumbernya — yang perlu dibuktikan adalah apa yang sampai
   ke browser.

   Urutannya ikut diukur karena itu bagian dari permintaan: mockupnya menyusun
   kolomnya begitu. Urutan yang tertukar tetap "enam isian yang ada semua", tapi
   bukan yang diminta. */
export const isianForm = (() => {
  /* tagDengan — versi lokal dari helper bernama sama di harness luar. Ia
     diduplikasi, bukan diimpor: blok di dalam bundel ini tidak bisa melihat
     apa pun dari harness luar. Yang WAJIB sama cuma kelakuannya. */
  const tagDengan = (html, label) => {
    const i = html.indexOf('aria-label="' + label + '"');
    if (i < 0) return null;
    const awal = html.lastIndexOf('<', i);
    const akhir = html.indexOf('>', i);
    return awal >= 0 && akhir > awal ? html.slice(awal, akhir + 1) : null;
  };

  /* Isi kotak Select, dibaca dari simpul "select-value"-nya.

     Ini satu-satunya isi Select yang sampai ke "renderToStaticMarkup": daftar
     pilihannya dirender lewat portal, dan portal tidak ikut muncul di render
     statis. Jadi check yang mencari nama opsi di markup TIDAK BISA hijau di
     seam ini — yang bisa diperiksa adalah nilai yang sedang tampil di
     kotaknya. */
  const isiSelect = (html, label) => {
    const i = html.indexOf('aria-label="' + label + '"');
    if (i < 0) return null;
    const j = html.indexOf('data-slot="select-value"', i);
    if (j < 0) return null;
    const k = html.indexOf('>', j);
    const akhir = html.indexOf('<', k);
    return k >= 0 && akhir > k ? html.slice(k + 1, akhir) : null;
  };

  const UA = (label) => formKosong.indexOf('aria-label="' + label + '"');
  const URUTAN = [
    'Nama Produk',
    'Brand',
    'Foto',
    'Kategori',
    'Kode SKU / Design Code',
    'Date Registered',
  ];
  const posisi = URUTAN.map((label) => ({ label, i: UA(label) }));
  const tagTanggal = tagDengan(formKosong, 'Date Registered');
  const tagBrand = tagDengan(formKosong, 'Brand');

  /* Brand HANYA berisi satu nama, dan nama itu bukan brand bawaannya.

     Diukur begitu karena daftar opsinya tidak sampai ke seam ini (portal).
     Yang tersisa dan justru lebih tajam: kalau kotaknya mengambil nilai dari
     daftar yang diberikan, brand satu-satunya itu yang tampil. Kalau nilainya
     dikarang sendiri, yang tampil "Livou" — brand bawaan yang tidak ada di
     daftar mana pun di render ini. */
  const hanyaCassca = renderToStaticMarkup(
    <IsiFormProdukBaru brands={['Cassca']} onSimpan={kosong} onTutup={kosong} sudahAda={0} />
  );

  return {
    posisi,
    adaSemua: posisi.every((p) => p.i >= 0),
    urutBenar: posisi.every((p, i) => i === 0 || (posisi[i - 1].i >= 0 && posisi[i - 1].i < p.i)),
    // Foto harus benar-benar <input type="file">, bukan kotak teks yang
    // kebetulan berlabel "Foto".
    adaPemilihBerkas: (tagDengan(formKosong, 'Foto') ?? '').includes('type="file"'),
    // Tanggalnya TIDAK boleh bisa diketik: readOnly DAN disabled. Keduanya
    // menutup jalan yang berbeda (mengetik vs. memfokuskan lalu mengubah).
    tanggalTerkunci:
      (tagTanggal ?? '').includes('readOnly') && (tagTanggal ?? '').includes('disabled'),
    // Brand berupa PILIHAN saat daftarnya ada isinya — combobox, bukan isian
    // teks. Inilah yang membedakannya dari versi lama yang menerima ketikan
    // bebas dan karenanya bercabang jadi banyak ejaan.
    brandPilihan: (tagBrand ?? '').includes('role="combobox"'),
    brandDariDaftar: isiSelect(hanyaCassca, 'Brand') === 'Cassca',
    // ...dan jadi isian bebas saat belum ada satu pun brand untuk ditawarkan.
    // Tanpa cabang ini, produk PERTAMA tidak akan pernah bisa didaftarkan.
    brandBebasSaatKosong:
      formTanpaBrand.includes('aria-label="Brand"') &&
      !(tagDengan(formTanpaBrand, 'Brand') ?? '').includes('role="combobox"'),
    // Yang TIDAK boleh ada lagi: sisa-sisa form lama.
    adaHarga: formKosong.includes('Harga Jual'),
    adaBatch: formKosong.includes('>Batch<'),
    adaVendor: formKosong.includes('Vendor / CMT'),
    adaAtribut: formKosong.includes('Product attributes'),
    adaTabelVarian: formKosong.includes('Detail varian') || formKosong.includes('Kode varian'),

    /* Tiga keterangan yang dibuang 19 Oktober 2026 atas permintaan pemilik.

       Diukur pada form yang MASIH KOSONG, dan itu bagian yang membuat check
       ini berarti: ketiganya dulu muncul justru saat form belum disentuh —
       kotak kuning tiga baris ("Nama produk wajib diisi", "Kategori wajib
       dipilih", "Design code wajib diisi") yang terbaca sebagai kesalahan
       padahal cuma keadaan awal.

       Dihitung sebagai daftar, bukan satu "bersih", supaya yang kembali ke
       markup bisa disebut namanya — dan supaya menambah kembali salah satunya
       tidak lolos hanya karena dua yang lain masih hilang. */
    keteranganTersisa: [
      ['petunjuk foto ("Boleh dikosongkan...")', formKosong.includes('Boleh dikosongkan')],
      ['hitungan sesi ("...produk lagi di sesi ini")', formKosong.includes('produk lagi di sesi ini')],
      ['teguran wajib isi', formKosong.includes('Nama produk wajib diisi')],
      ['teguran kategori', formKosong.includes('Kategori wajib dipilih')],
      ['teguran design code', formKosong.includes('Design code wajib diisi')],
    ].filter(([, ada]) => ada),
  };
})();

/* Foto produk yang diunggah benar-benar terbaca kembali di halaman.

   Ini yang menutup rantai "Tambah Produk -> Foto": formnya mengunggah berkasnya
   setelah produk tersimpan, server menyimpannya di tabel "product_photos", dan
   GET /products/register mengirim "foto_path" — tapi sampai 19 Okt 2026
   "produkDariApi()" membuang kolom itu dan menulis "foto: null" apa pun isinya,
   jadi foto yang berhasil diunggah TIDAK PERNAH tampil di kartu maupun dialog.
   Tidak ada satu pun check yang menangkapnya: yang diuji cuma bentuk formnya.

   Diperiksa lewat fungsi pemetaan aslinya, bukan dengan merender halaman —
   produk dari API tidak sampai ke "renderToStaticMarkup" (fetch tidak pernah
   selesai di sana), jadi merender halaman hanya akan menguji katalog contoh. */
export const fotoProduk = (() => {
  const baris = {
    id: 7,
    nama: 'Hoodie Uji',
    kategori: 'Outer',
    tipe_produksi: 'sendiri',
    design_code: 'LVU-TOP-11',
    brand: 'Livou',
    harga: 0,
    created_at: '2026-10-19T03:00:00.000Z',
    varian: [],
    marketplaces: [],
    bom: [],
  };
  const denganFoto = produkDariApi({ ...baris, foto_path: 'foto-uji-123.jpg' });
  const tanpaFoto = produkDariApi({ ...baris, foto_path: null });
  return {
    // URL yang bisa langsung dipakai sebagai src, bukan nama berkas telanjang.
    src: denganFoto.foto,
    // Tanpa foto: null, bukan string kosong. Halaman membedakan keduanya
    // (penanda "belum ada foto" vs. gambar yang gagal dimuat).
    kosong: tanpaFoto.foto,
    // Tanggal pendaftaran tetap terbaca dari created_at.
    tanggal: denganFoto.registerDate,
  };
})();

/* Apakah form tanpa master warna menolak untuk dipakai.

   TIDAK DIPAKAI LAGI sejak formnya jadi enam field: warna tidak lagi dipilih di
   sini, jadi master warna yang kosong tidak lagi membuat formnya buntu. Yang
   menggantikannya adalah "isianForm.brandBebasSaatKosong" — daftar brand yang
   kosong memang keadaan produk pertama, jadi di sana yang benar bukan menolak,
   melainkan pindah ke isian bebas. */
export const gerbangMaster = {
  // Membuktikan alasan itu MEMANG yang menahan tombolnya, bukan sekadar
  // kebetulan searah: formKosong punya warna, jadi ia tidak memuat kalimat itu.
  formBerisiTidak: !formKosong.includes('Master warna belum termuat'),
  tidakDipakaiLagi: !formTanpaBrand.includes('Master warna belum termuat'),
};

/* Check "buangPenanda" DIHAPUS, bukan dinonaktifkan.

   Dulu ada di sini karena form ini punya baris atribut warna/ukuran, dan
   menghapus sebuah nilai harus ikut membuang penanda "varian ini dicoret".
   Sejak formnya jadi enam field, atributnya pindah ke halaman detail produk —
   fungsinya sudah tidak ada lagi di FormProdukBaru, jadi tidak ada yang bisa
   diuji. Menggantinya dengan nilai tetap yang selalu benar justru lebih buruk
   daripada dihapus: check yang tidak mungkin merah adalah check yang berpura-pura
   memeriksa sesuatu. */

export { MAKS_PRODUK_BARU, PRODUK_UJI };

// ===== 9. Detail produk: identitas langsung bisa diketik =====
//
// Permintaan pemilik (19 Okt 2026): identitas jangan lagi di balik tombol
// "Edit identitas" — kotaknya langsung bisa diketik.
//
// Yang diperiksa BUKAN ketiadaan tombolnya, melainkan bahwa nilai identitasnya
// benar-benar sampai ke markup sebagai <input> yang memuat nilainya. Check
// "tombol Edit identitas tidak ada" saja akan hijau untuk dialog yang
// identitasnya hilang sama sekali — dan itu memang risiko nyata di sini, karena
// nilai kosong juga menghasilkan markup tanpa tombol.
const detailUji = PRODUK_UJI;
const materialUji = [
  {
    id: 7,
    kode_bahan: 'BND-01',
    nama: 'Benang Jahit',
    tipe: 'aksesoris',
    jenis: 'label',
    satuan: 'roll',
    variants: [{ id: 1, nama_varian: 'Hitam', stok: 12, satuan: 'roll' }],
  },
  {
    id: 9,
    kode_bahan: 'LBL-02',
    nama: 'Label Brand Livou',
    tipe: 'aksesoris',
    jenis: 'label',
    satuan: 'pcs',
    variants: [],
  },
];

const warnaUji = detailUji.spesifikasi.warna[0];

// Judul tiap kotak bahan di markup. Dipakai untuk MEMOTONG wilayah satu kotak:
// check "kotaknya tidak menawarkan pilih bahan lagi" hanya sah kalau diukur
// pada potongan milik kotak itu sendiri — kotak kain lain memang selalu
// berbunyi "Pilih bahan" selama kainnya belum diputuskan.
const JUDUL_CHIP = 'text-[15px] font-bold">';

/**
 * Tag pembuka elemen yang punya aria-label tertentu, UTUH.
 *
 * Dipakai kalau yang diperiksa atribut selain isinya (mis. type="date" atau
 * readOnly). Diukur sepotong tag, bukan dengan pola berurutan seperti
 * aria-label yang diikuti [^>]* lalu nama atributnya: React mencetak atribut
 * dengan urutan yang TIDAK bisa diprediksi dari JSX-nya, jadi pola berurutan
 * lolos atau gagal tergantung urutan cetak — bukan tergantung benar-salahnya
 * kode.
 */
const tagDengan = (html, label) => {
  const i = html.indexOf('aria-label="' + label + '"');
  if (i < 0) return null;
  const awal = html.lastIndexOf('<', i);
  const akhir = html.indexOf('>', i);
  return awal >= 0 && akhir > awal ? html.slice(awal, akhir + 1) : null;
};

/** Nilai atribut value dari isian yang punya aria-label tertentu. */
const nilaiIsian = (html, label) => {
  const re = new RegExp('aria-label="' + label + '"[^>]*value="([^"]*)"');
  const m = re.exec(html);
  if (m) return m[1];
  // React menaruh value SEBELUM aria-label kalau urutannya begitu di JSX.
  const re2 = new RegExp('value="([^"]*)"[^>]*aria-label="' + label + '"');
  const m2 = re2.exec(html);
  return m2 ? m2[1] : null;
};

/**
 * Isi kotak Select yang punya aria-label tertentu.
 *
 * Brand di panel kiri BUKAN lagi <input> sejak 19 Okt 2026 — ia pilihan.
 * Jadi nilai yang harus dibaca adalah isi simpul "select-value"-nya, bukan
 * atribut "value". Kalau dibaca dengan "nilaiIsian", hasilnya null dan
 * check-nya merah walaupun kotaknya benar-benar menampilkan brandnya.
 */
const isiSelect = (html, label) => {
  const i = html.indexOf('aria-label="' + label + '"');
  if (i < 0) return null;
  const j = html.indexOf('data-slot="select-value"', i);
  if (j < 0) return null;
  const k = html.indexOf('>', j);
  const akhir = html.indexOf('<', k);
  return k >= 0 && akhir > k ? html.slice(k + 1, akhir) : null;
};

export const identitas = (() => {
  const isi = renderToStaticMarkup(
    <IsiDetailProduk
      produk={detailUji}
      kartu={kartuRegister([detailUji])[0]}
      warnaMaster={WARNA_UJI}
      materials={materialUji}
      brands={BRAND_UJI}
      onSimpanBom={kosong}
      onSimpanVarian={kosong}
      onSimpanIdentitas={kosong}
      onGantiFoto={kosong}
    />
  );
  return {
    // Markup mentahnya ikut diekspor: fixture di bawahnya (fotoKlik) mengukur
    // tag lain di render yang SAMA, dan merender ulang hanya untuk itu berarti
    // dua render yang bisa berbeda diam-diam.
    isi,
    nama: isi.includes('Nama Produk'),
    /* Nama dibaca sebagai ISIAN sejak 19 Okt 2026, sama seperti SKU dan Brand.

       Dulu ia teks mati di <dd>, dan check ini membacanya dari sana. Sekarang
       nilainya ada di atribut value kotaknya, jadi pembacanya pindah ke
       "nilaiIsian" — kalau dibiarkan membaca <dd>, yang didapat adalah isi
       elemen berikutnya dan check-nya merah walaupun kotaknya benar-benar
       menampilkan namanya.

       Sengaja TIDAK diukur lewat <dd> lagi: baris ini tidak punya <dd> teks
       sama sekali sekarang, dan mengukurnya dari sana berarti mengukur elemen
       yang kebetulan berdekatan. */
    namaNilai: nilaiIsian(isi, 'Nama Produk'),
    designCode: nilaiIsian(isi, 'SKU Produk'),
    // Brand dan Kategori dibaca dari kotak pilihannya, bukan dari atribut
    // value: keduanya Select (permintaan pemilik — brand jangan diketik bebas,
    // ambil dari brand produk yang sudah ada).
    brand: isiSelect(isi, 'Brand'),
    // Kategori dan Registered dulunya teks mati; sejak 19 Okt 2026 keduanya
    // isian yang bisa disunting seperti SKU dan Brand.
    adaIsianKategori: isi.includes('aria-label="Kategori"'),
    kategori: isiSelect(isi, 'Kategori'),
    adaIsianRegistered: isi.includes('aria-label="Registered"'),
    registered: nilaiIsian(isi, 'Registered'),
    registeredTipeTanggal: (() => {
      const tag = tagDengan(isi, 'Registered');
      return tag ? /type="date"/.test(tag) : false;
    })(),
    // Nama produk tidak lagi berdiri sebagai <h3> terpisah di atas tabel.
    // Dicari sebagai substring, bukan pola regex: di dalam template literal
    // bundel, garis miring penutup tag mengakhiri regex-nya lebih awal.
    adaJudulNamaLuarTabel: isi.replace(/\s/g, '').includes('>MeeraSweater</h3>'),
    // Nama berupa ISIAN, bukan teks mati. Diukur dari tag-nya, bukan dari
    // adanya kata "Nama Produk" di markup — kata itu juga muncul di label.
    adaIsianNama: (tagDengan(isi, 'Nama Produk') ?? '').startsWith('<input'),
    // Tombol mode harus benar-benar hilang, tapi itu diperiksa SETELAH nilai
    // di atas terbukti ada — supaya "tombolnya hilang" tidak bisa hijau
    // bersamaan dengan "isiannya juga hilang".
    adaTombolEdit: isi.includes('Edit identitas'),
    // Tombol Simpan hanya muncul saat ada perubahan; render pertama tidak ada
    // yang berubah, jadi ia memang belum boleh muncul.
    adaSimpan: isi.includes('>Simpan<'),
  };
})();

/**
 * Bingkai foto di panel kiri harus bisa DIKLIK, dan itu berarti <button>.
 *
 * Dulu bingkainya <div> polos: tidak bisa difokus papan tik dan tidak bisa
 * ditekan pembaca layar, jadi menambahkan onClick saja akan lolos dari mata
 * tapi tidak dari orang yang memakai papan tik.
 *
 * Diukur pada tag elemen yang membawa aria-label="Foto produk" — bukan pada
 * kata "Ganti Foto" di markup, karena menunya dirender lewat portal dan TIDAK
 * ikut muncul di render statis. Yang bisa dipastikan di seam ini cuma bahwa
 * pemicunya ada dan bentuknya benar.
 */
export const fotoKlik = (() => {
  const tag = tagDengan(identitas.isi, 'Foto produk');
  return {
    tag,
    ada: tag !== null,
    tombol: tag ? tag.startsWith('<button') : false,
  };
})();

/**
 * Produk yang kategorinya TIDAK ada di daftar "KATEGORI_PRODUK".
 *
 * Bukan karangan: 'Atasan' dan 'Top' itu kategori dua dari tiga produk yang
 * benar-benar ada di database (lihat tmp/_probe-brand.mjs). Yang diperiksa:
 * kategori produk itu tetap terbaca di kotaknya, bukan tergantikan pilihan
 * pertama daftar.
 */
export const identitasKategoriAsing = (() => {
  const asing = {
    ...detailUji,
    kategori: 'Atasan',
    spesifikasi: { ...detailUji.spesifikasi, kategori: 'Atasan' },
  };
  const isi = renderToStaticMarkup(
    <IsiDetailProduk
      produk={asing}
      kartu={kartuRegister([asing])[0]}
      warnaMaster={WARNA_UJI}
      materials={materialUji}
      brands={BRAND_UJI}
      onSimpanBom={kosong}
      onSimpanVarian={kosong}
      onSimpanIdentitas={kosong}
      onGantiFoto={kosong}
    />
  );
  return { kategori: isiSelect(isi, 'Kategori') };
})();

/**
 * Produk dengan brand kosong — keadaan ketiga produk di database.
 *
 * Daftar brand di sini cuma brand baku, sama seperti yang dikirim halaman
 * ("BRAND_PRODUK"). Yang diperiksa: kotaknya tidak kosong melompong.
 */
export const brandKosong = (() => {
  const polos = { ...detailUji, brand: '' };
  const isi = renderToStaticMarkup(
    <IsiDetailProduk
      produk={polos}
      kartu={kartuRegister([polos])[0]}
      warnaMaster={WARNA_UJI}
      materials={materialUji}
      brands={['LIVOU', 'CASSCA']}
      onSimpanBom={kosong}
      onSimpanVarian={kosong}
      onSimpanIdentitas={kosong}
      onGantiFoto={kosong}
    />
  );
  return { adaPemilih: isi.includes('aria-label="Brand"') };
})();

// ===== 10. Chip bahan memakai label kategorinya, bukan nama material =====
//
// Permintaan pemilik (19 Okt 2026): begitu materialnya dipilih, jangan ganti
// judul kotaknya jadi nama material — pilihan variasinya tidak menjelaskan
// kategori bahannya, jadi kotaknya jadi tidak jelas menjawab apa.
export const chipBahan = (() => {
  const produk = {
    ...detailUji,
    bom: [
      {
        id: 1,
        variant_id: 1,
        raw_material_id: 9,
        qty_per_pcs: 2,
        no_need: false,
        nama: 'Label Brand Livou',
        tipe: 'aksesoris',
        jenis: 'label',
        satuan: 'pcs',
        warna: 'Hitam',
        warna_kode: warnaUji.kode,
        size: 'M',
      },
    ],
  };
  const html = renderToStaticMarkup(
    <KartuWarna
      produk={produk}
      warna={warnaUji}
      materials={materialUji}
      sedangSimpan={false}
      sedangEdit={null}
      onMulaiEdit={kosong}
      onBatalEdit={kosong}
      onMulaiEditVarian={kosong}
      onSimpanBom={kosong}
      onHapus={kosong}
    />
  );
  // Kotak "label" yang SUDAH diputuskan. Judulnya harus "Label" (nama
  // kategorinya); nama materialnya boleh ikut di baris kedua.
  //
  // Dicari sebagai STRING, bukan regex literal: baris-baris ini hidup di dalam
  // template literal skrip, dan backslash di regex literal akan dimakan outer
  // template sebelum sampai ke vite.
  return {
    html,
    adaLabelKategori: html.includes(JUDUL_CHIP + 'Label<'),
    judulGantiJadiNamaMaterial: html.includes(JUDUL_CHIP + 'Label Brand Livou'),
    adaNamaMaterial: html.includes('Label Brand Livou'),
    adaKebutuhan: html.includes('2 pcs'),
  };
})();

// ===== 11. Keputusan "No need" yang tersimpan terbaca kembali =====
//
// Inti keluhan pemilik: "pilih tidak diperlukan, disimpan, tapi tampil kosong
// seperti tidak tersave". Baris no-need tidak menunjuk material, jadi jenis-nya
// datang dari kolom baris itu sendiri (lihat db.js) — kalau API mengembalikan
// jenis kosong untuk baris itu, kotaknya tidak cocok dengan kategori mana pun
// dan terbaca "Pilih bahan" lagi.
export const noNeed = (() => {
  const produk = {
    ...detailUji,
    bom: [
      {
        id: 2,
        variant_id: 1,
        raw_material_id: null,
        qty_per_pcs: 0,
        no_need: true,
        nama: null,
        tipe: null,
        jenis: 'label',
        satuan: null,
        warna: 'Hitam',
        warna_kode: warnaUji.kode,
        size: 'M',
      },
    ],
  };
  const html = renderToStaticMarkup(
    <KartuWarna
      produk={produk}
      warna={warnaUji}
      materials={materialUji}
      sedangSimpan={false}
      sedangEdit={null}
      onMulaiEdit={kosong}
      onBatalEdit={kosong}
      onMulaiEditVarian={kosong}
      onSimpanBom={kosong}
      onHapus={kosong}
    />
  );
  // Potong wilayah kotak "Label" saja.
  //
  // Tidak boleh mencari "Pilih bahan" di seluruh HTML: kotak kain ("Roll")
  // memang selalu menawarkan pilih bahan selama kainnya belum diputuskan, dan
  // itu benar. Yang dikeluhkan pemilik adalah kotak yang SUDAH diputuskan
  // no-need kembali kosong — jadi ukurannya harus potongan kotak itu sendiri.
  const iAwal = html.indexOf(JUDUL_CHIP + 'Label');
  const iAkhir = iAwal >= 0 ? html.indexOf(JUDUL_CHIP, iAwal + 1) : -1;
  const kotakLabel = iAwal >= 0 ? html.slice(iAwal, iAkhir > 0 ? iAkhir : undefined) : '';

  return {
    teks: html,
    potongan: kotakLabel,
    // Penjaga potongan: kalau kartu "Label"-nya hilang sama sekali, potongannya
    // kosong dan SEMUA check di bawah jadi hijau palsu (string kosong tidak
    // memuat "Pilih bahan"). Check ini yang membuat kegagalan itu terbaca
    // sebagai kegagalan.
    potonganAda: kotakLabel.length > 0,
    // Judul kotak tetap kategorinya, dengan penanda no-need di sebelahnya.
    adaNoNeed: kotakLabel.includes('Label · No need'),
    adaTidakDiperlukan: kotakLabel.includes('Tidak diperlukan'),
    // Yang TIDAK boleh muncul: kotaknya kembali menawarkan pilih bahan.
    kembaliJadiPilihBahan: kotakLabel.includes('Pilih bahan'),
  };
})();

// ===== 13. Kotak "no need" pindah ke urutan paling belakang =====
//
// Permintaan pemilik (20 Okt 2026): "kalau pilih materialnya no need di sini
// jadi urutan paling belakang aja, jadi cuman perlu lihat material yang memang
// dipakai".
//
// Yang diukur POSISI di markup, bukan sekadar kehadiran: urutannya harus
// berubah dari urutan bakunya, dan kotak no-need harus sesudah semua kotak
// yang dipakai.
export const URUT_NO_NEED = (() => {
  const warnaKode = warnaUji.kode;
  const baris = (jenis, isi) => ({
    id: 1,
    variant_id: 1,
    raw_material_id: null,
    qty_per_pcs: 0,
    nama: null,
    tipe: null,
    satuan: null,
    warna: warnaUji.nama,
    warna_kode: warnaKode,
    size: 'M',
    ...isi,
    jenis,
  });
  const produk = {
    ...detailUji,
    bom: [
      // Roll dipakai, ecer "no need", label dipakai.
      baris('roll', { id: 11, raw_material_id: 5, qty_per_pcs: 1.6, no_need: false, nama: 'Cotton Combed 30s', satuan: 'm' }),
      baris('ecer', { id: 12, raw_material_id: null, qty_per_pcs: 0, no_need: true }),
      baris('label', { id: 13, raw_material_id: 9, qty_per_pcs: 1, no_need: false, nama: 'Label Brand Livou', satuan: 'pcs' }),
    ],
  };
  const html = renderToStaticMarkup(
    <KartuWarna
      produk={produk}
      warna={warnaUji}
      materials={materialUji}
      sedangSimpan={false}
      sedangEdit={null}
      onMulaiEdit={kosong}
      onBatalEdit={kosong}
      onMulaiEditVarian={kosong}
      onSimpanBom={kosong}
      onHapus={kosong}
    />
  );
  const posisi = (label) => html.indexOf(JUDUL_CHIP + label);
  return {
    html,
    noNeed: posisi('Ecer'),
    dipakai: [posisi('Roll'), posisi('Label')],
    // Penjaga: kalau kotaknya tidak ada, indexOf mengembalikan -1 dan semua
    // perbandingan di bawah jadi benar tanpa menguji apa pun.
    semuaAda: posisi('Roll') >= 0 && posisi('Ecer') >= 0 && posisi('Label') >= 0,
  };
})();

// ===== 14. Kartu Add varian sudah membawa daftar bahan =====
//
// Permintaan pemilik (20 Okt 2026): "saat add new variasi harusnya tetap muncul
// materialnya, jadi ga perlu tunggu di simpan dulu".
//
// Diperiksa dalam DUA keadaan, karena keduanya harus benar: sebelum warna
// dipilih (yang muncul arahan, bukan kotak kosong) dan sesudahnya (yang muncul
// baris bahan beserta keputusan lamanya).
export const BAHAN_ADD = (() => {
  const html = renderToStaticMarkup(
    <KartuWarnaEdit
      warnaMaster={WARNA_UJI}
      warnaAwal={null}
      materials={materialUji}
      onBatal={kosong}
      onSimpan={kosong}
    />
  );
  // Warna sudah terpilih: warnaAwal diisi supaya dropdown langsung berisi,
  // dan keputusan lamanya ikut terbaca sebagai jawaban.
  const htmlTerisi = renderToStaticMarkup(
    <KartuWarnaEdit
      warnaMaster={WARNA_UJI}
      warnaAwal={warnaUji}
      materials={materialUji}
      produk={{
        ...detailUji,
        bom: [
          {
            id: 21,
            variant_id: 1,
            raw_material_id: 9,
            qty_per_pcs: 3,
            no_need: false,
            nama: 'Label Brand Livou',
            tipe: 'aksesoris',
            jenis: 'label',
            satuan: 'pcs',
            warna: warnaUji.nama,
            warna_kode: warnaUji.kode,
            size: warnaUji.pcs[0]?.ukuran ?? 'M',
          },
        ],
      }}
      onBatal={kosong}
      onSimpan={kosong}
    />
  );
  return {
    html,
    htmlTerisi,
    adaArahan: html.includes('Pilih warna dulu'),
    // Diukur pada kartu yang warnanya SUDAH dipilih, bukan yang kosong: di
    // keadaan kosong bagian Bahan memang sengaja tidak dirender (lihat
    // alasannya di komentar KartuWarnaEdit), jadi mengukurnya di sana akan
    // selalu merah — atau, kalau dicocokkan longgar ("Bahan"), selalu hijau
    // karena kalimat penutupnya juga memuat kata itu.
    adaJudulBahan: htmlTerisi.includes('>' + 'Bahan' + '<'),
    adaKeputusanLama: htmlTerisi.includes('Label Brand Livou'),
    // Nama kategori tetap jadi judul barisnya, sama seperti di kartu warna.
    adaBarisLabel: htmlTerisi.includes('>Label<'),
    adaPeringatanSimpan: htmlTerisi.includes('disimpan bersama variannya'),
  };
})();

// ===== 15. Edit bahan terbuka KECIL di kartu yang sama =====
//
// Permintaan pemilik (20 Okt 2026): "saat edit material jangan kebuka besar kyk
// gini, cukup yang kayak kebuka kecil aja di kartu material yg sama gitu jadi
// masih terlihat variasi dan material lainnya juga ga perlu kyk halaman baru".
//
// Sebelumnya, begitu satu kotak diedit, SELURUH kartu diganti form seukuran
// halaman — warna, size, dan kotak bahan lain ikut hilang dari layar. Yang
// diperiksa di sini: dengan satu kotak sedang diedit, isi kartu lainnya HARUS
// masih ada di markup.
export const EDIT_KECIL = (() => {
  const produk = {
    ...detailUji,
    bom: [
      {
        id: 31, variant_id: 1, raw_material_id: 5, qty_per_pcs: 1.6, no_need: false,
        nama: 'Cotton Combed 30s', tipe: 'fabric', jenis: 'roll', satuan: 'm',
        warna: warnaUji.nama, warna_kode: warnaUji.kode, size: 'M',
      },
      {
        id: 32, variant_id: 1, raw_material_id: 9, qty_per_pcs: 1, no_need: false,
        nama: 'Label Brand Livou', tipe: 'aksesoris', jenis: 'label', satuan: 'pcs',
        warna: warnaUji.nama, warna_kode: warnaUji.kode, size: 'M',
      },
    ],
  };
  const html = renderToStaticMarkup(
    <KartuWarna
      produk={produk}
      warna={warnaUji}
      materials={materialUji}
      sedangSimpan={false}
      sedangEdit="label"
      onMulaiEdit={kosong}
      onBatalEdit={kosong}
      onMulaiEditVarian={kosong}
      onSimpanBom={kosong}
      onHapus={kosong}
    />
  );
  // Kartu yang SAMA tanpa satu kotak pun sedang diedit — pembandingnya.
  const htmlDiam = renderToStaticMarkup(
    <KartuWarna
      produk={produk}
      warna={warnaUji}
      materials={materialUji}
      sedangSimpan={false}
      sedangEdit={null}
      onMulaiEdit={kosong}
      onBatalEdit={kosong}
      onMulaiEditVarian={kosong}
      onSimpanBom={kosong}
      onHapus={kosong}
    />
  );
  // Judul form seukuran halaman. Dulu, begitu satu kotak diedit, SELURUH kartu
  // diganti form ini ("Edit Label" + tombol × "Batal edit BOM"), jadi warna,
  // size, dan kotak lain hilang dari layar — persis yang dikeluhkan pemilik.
  //
  // Yang bisa dibuktikan di markup HANYA sisi "tidak diganti": popover-nya
  // sendiri dirender lewat portal dan baru dipasang di efek klien, jadi isinya
  // memang tidak pernah sampai ke renderToStaticMarkup (aria-expanded pada
  // tombolnya pun selalu "false" saat SSR). Karena itu htmlDiam dipakai
  // sebagai pembanding: kalau kartu yang sedang diedit dirender PERSIS sama
  // dengan yang tidak, berarti tidak ada yang menggantikannya.
  return {
    html,
    htmlDiam,
    // Kartu TIDAK diganti: nama warnanya masih terbaca.
    adaNamaWarna: html.includes(warnaUji.nama),
    // Size-nya masih terbaca semua.
    adaSize: warnaUji.pcs.every((p) => html.includes('>' + p.ukuran + '<')),
    // Kotak lain (Roll) dan kotak yang sedang diedit (Label) sama-sama ada —
    // yang diedit tidak diganti form, yang lain tidak ikut hilang.
    adaKotakRoll: html.includes(JUDUL_CHIP + 'Roll'),
    adaKotakLabel: html.includes(JUDUL_CHIP + 'Label'),
    // Judul form halaman besar tidak boleh muncul di dalam kartu.
    adaFormHalaman:
      html.includes('>Edit ' + 'Label<') || html.includes('Batal edit BOM'),
    // Kotaknya tetap menyebut keputusan yang tersimpan, bukan berubah jadi form.
    adaKeputusanLabel: html.includes('Label Brand Livou'),
    // Inti keluhannya: kartu yang sedang diedit harus dirender sama dengan
    // kartu yang diam. Kalau form halaman besar kembali, markupnya berbeda.
    samaDenganDiam: html === htmlDiam,
  };
})();

// ===== 12. Kotak terpilih menampilkan nama material, bukan id mentah =====
//
// Keluhan pemilik: "saat dipilih malah yang muncul angka 1, 2, 3, 4 kayak id
// doang, belum ke-render". Base UI mencetak NILAI item apa adanya kalau
// SelectValue tidak diberi fungsi child.
export const pilihanMaterial = (() => {
  const html = renderToStaticMarkup(
    <EditKeputusanBom
      jenis="label"
      initial={{ jenis: 'label', raw_material_id: 9, qty_per_pcs: 2, no_need: false }}
      materials={materialUji}
      busy={false}
      onCancel={kosong}
      onSave={kosong}
    />
  );
  // Material yang id-nya sudah tidak ada di master (mis. baris BOM lama yang
  // bahannya dihapus). Base UI mencetak nilai item apa adanya kalau SelectValue
  // tidak diberi fungsi child — jadi tanpa penjagaan itu, kotaknya berubah
  // menjadi "999". Ini bentuk paling telanjang dari keluhan "muncul angka".
  const htmlIdAsing = renderToStaticMarkup(
    <EditKeputusanBom
      jenis="label"
      initial={{ jenis: 'label', raw_material_id: 999, qty_per_pcs: 2, no_need: false }}
      materials={materialUji}
      busy={false}
      onCancel={kosong}
      onSave={kosong}
    />
  );
  const isiKotak = (h) => {
    const re = new RegExp('<span[^>]*data-slot="select-value"[^>]*>([^<]*)</span>');
    const m = re.exec(h);
    return m ? m[1] : null;
  };
  return {
    html,
    isiKotak: isiKotak(html),
    isiKotakIdAsing: isiKotak(htmlIdAsing),
    // Material terpilih harus terbaca lengkap di kotaknya.
    adaNamaTerpilih: html.includes('LBL-02 · Label Brand Livou · pcs'),
    // Id mentah tidak boleh jadi isi kotaknya. Ditulis sebagai string RegExp,
    // bukan regex literal: baris ini hidup di dalam template literal skrip, dan
    // backslash pada regex literal dimakan outer template.
    idMentah: new RegExp('<span[^>]*data-slot="select-value"[^>]*>9</span>').test(html),
    // Id asing pun tidak boleh bocor ke kotaknya.
    idAsingBocor: new RegExp('<span[^>]*data-slot="select-value"[^>]*>999</span>').test(htmlIdAsing),
  };
})();
`;

let gagalBangun = null;

try {
  writeFileSync(
    konfig,
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(${JSON.stringify(frontendDir)}, 'src') }, dedupe: ['react', 'react-dom'] },
  build: { ssr: ${JSON.stringify(masuk)}, outDir: ${JSON.stringify(kerja)}, emptyOutDir: true, minify: false, rollupOptions: { output: { format: 'esm', entryFileNames: 'rp.mjs' } } },
});
`,
    'utf8'
  );
  writeFileSync(masuk, entri, 'utf8');

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['vite', 'build', '--config', konfig], {
    cwd: frontendDir,
    stdio: 'pipe',
    shell: true,
  });
} catch (e) {
  gagalBangun = e;
}

// Penjaga: backtick yang di-escape (`\`) di dalam sumber bundel tetap menjadi
// backtick di string hasilnya, dan itu menutup template literal-nya.
//
// HANYA backtick ter-escape yang bisa ditangkap di sini. Backtick TELANJANG
// menutup template literal sebelum Node sempat menjalankan berkas ini, jadi
// yang terjadi adalah SyntaxError di baris itu — bukan pesan di bawah. Dua kali
// tertimpa: tulis nama identifier dalam tanda kutip di dalam komentar, jangan
// pakai backtick.
if ((entri.match(/`/g) ?? []).length > 0) {
  console.error(
    'GAGAL: sumber bundel (const entri) memuat backtick, yang menutup template literal-nya.'
  );
  process.exit(1);
}

if (gagalBangun) {
  console.error('\nGAGAL membangun bundel pratinjau Register Produk:');
  // stderr IKUT dicetak — hanya stdout akan menampilkan kalimat terakhir
  // "N modules transformed" dan penyebab sebenarnya hilang.
  const keluaran = [gagalBangun.stdout, gagalBangun.stderr, gagalBangun.message]
    .filter(Boolean)
    .join('\n');
  console.error(String(keluaran).slice(-3000));
  process.exit(1);
}

const berkas = readdirSync(kerja).filter((f) => f.endsWith('.mjs') || f.endsWith('.js'));
if (berkas.length !== 1) {
  console.error(`GAGAL: diharapkan 1 bundel di ${kerja}, dapat ${berkas.length}`);
  process.exit(1);
}
const m = await import(pathToFileURL(path.join(kerja, berkas[0])).href);

const {
  halaman, posisi, bantahHelper,
  formKosong, gerbangSimpan, bantahTombol, batalVsSimpan,
  denganBaru, tanpaBaru, daftar, kartu, tanpaArgumen, kodeKustom,
  gerbangMaster, keadaanAwal, identitas, chipBahan, noNeed,
  pilihanMaterial, isianForm, fotoProduk, fotoKlik,
  identitasKategoriAsing, brandKosong,
  URUT_NO_NEED, BAHAN_ADD, EDIT_KECIL,
  MAKS_PRODUK_BARU, PRODUK_UJI,
} = m;

// ===== 1. Pertukaran posisi =====

console.log('\n== Posisi tombol ==');

posisi.iHitung >= 0 && posisi.iTombol > 0
  ? ok('hitungan "produk" dan tombol "Tambah Produk" keduanya ada di halaman')
  : salah(
      'hitungan + tombol',
      `hitungan=${posisi.iHitung} tombol=${posisi.iTombol}; keduanya harus ada`
    );

posisi.tombolSatuanDenganHitungan
  ? ok('hitungan dan tombol benar-benar SAUDARA di satu baris')
  : salah(
      'hitungan & tombol sebaris',
      `hitungan=${posisi.iHitung} tutupBaris=${posisi.iTutupBaris} tombol=${posisi.iTombol}; tombol harus SEBELUM penutup baris hitungan`
    );

posisi.hitunganSebelumTombol
  ? ok('hitungan di kiri, tombol di kanan (benar — tukar posisi yang diminta)')
  : salah(
      'urutan dalam baris',
      'hitungan harus sebelum tombol di markup (kiri-kanan)'
    );

posisi.iBarisJudul >= 0 && posisi.tutupBarisJudul > posisi.iBarisJudul
  ? ok('baris judul terukur dan bisa diperiksa')
  : salah(
      'ukur baris judul',
      `barisJudul=${posisi.iBarisJudul} tutupBarisJudul=${posisi.tutupBarisJudul}; batas baris judul tidak ketemu, jadi check di bawah tidak menguji apa pun`
    );

!posisi.tombolDiBarisJudul
  ? ok('baris judul sudah tidak lagi membawa tombol')
  : salah('tombol di baris judul', 'tombol masih ada di baris judul — belum ditukar');

posisi.jumlahTombol === 1
  ? ok('tombol "Tambah Produk" ada tepat sekali di halaman')
  : salah(
      'jumlah kemunculan tombol',
      `ditemukan ${posisi.jumlahTombol} kali; harus 1`
    );

bantahHelper.satuBaris && bantahHelper.duaBaris
  ? ok('ukur "sebaris" benar-benar membedakan satu baris dari dua baris')
  : salah('helper segmen', 'tidak membedakan satu baris dari dua baris — check di atas bisa hijau tanpa menguji apa pun');

// ===== 2. Form =====

console.log('\n== Form Tambah Produk (enam isian) ==');

isianForm.adaSemua
  ? ok('keenam isian ada: Nama, Brand, Foto, Kategori, Kode SKU, Date Registered')
  : salah(
      'isian form',
      `tidak ditemukan: ${isianForm.posisi
        .filter((p) => p.i < 0)
        .map((p) => p.label)
        .join(', ')}`
    );

isianForm.urutBenar
  ? ok('urutannya persis mockup: Nama → Brand → Foto → Kategori → Kode SKU → Date Registered')
  : salah(
      'urutan isian',
      isianForm.posisi.map((p) => `${p.label}=${p.i}`).join(', ')
    );

isianForm.adaPemilihBerkas
  ? ok('Foto berupa pemilih berkas asli (input type="file")')
  : salah('pemilih berkas', 'tidak ada <input type="file"> untuk field Foto');

isianForm.tanggalTerkunci
  ? ok('Date Registered terkunci (readOnly + disabled) — tanggalnya dari server')
  : salah(
      'date registered',
      'kotak tanggalnya masih bisa diubah — tanggal itu diisi database (created_at), bukan formnya'
    );

isianForm.brandPilihan
  ? ok('Brand berupa pilihan dari brand produk yang sudah ada (Livou, Cassca)')
  : salah('pilihan brand', 'brand produk yang ada tidak muncul sebagai pilihan');

isianForm.brandBebasSaatKosong
  ? ok('belum ada brand sama sekali: kotaknya jadi isian bebas, formnya tidak buntu')
  : salah(
      'brand saat daftar kosong',
      'kotak brand kosong tanpa isian bebas — produk PERTAMA tidak akan pernah bisa didaftarkan'
    );

// Form lama tidak boleh meninggalkan sisa. Masing-masing diukur sendiri, bukan
// digabung jadi satu "bersih", supaya yang kembali ke markup bisa disebut
// namanya.
const sisaFormLama = [
  ['Harga Jual', isianForm.adaHarga],
  ['Batch', isianForm.adaBatch],
  ['Vendor / CMT', isianForm.adaVendor],
  ['Product attributes', isianForm.adaAtribut],
  ['Detail varian / Kode varian', isianForm.adaTabelVarian],
].filter(([, ada]) => ada);

sisaFormLama.length === 0
  ? ok('field lama (harga, batch, vendor, warna/ukuran, tabel varian) sudah tidak ada')
  : salah(
      'sisa form lama',
      `masih ada: ${sisaFormLama.map(([nama]) => nama).join(', ')}`
    );

// Keterangan yang dibuang 19 Oktober 2026. Form yang masih kosong tidak boleh
// lagi membawa kalimat petunjuk maupun teguran wajib-isi — tanda bintang di
// label dan tombol Simpan yang mati sudah mengatakan hal yang sama.
isianForm.keteranganTersisa.length === 0
  ? ok('keterangan lama (petunjuk foto, hitungan sesi, teguran wajib isi) sudah tidak ada')
  : salah(
      'keterangan lama',
      `masih ada: ${isianForm.keteranganTersisa.map(([nama]) => nama).join(', ')}`
    );

// Label yang harus tampil, supaya isian tidak cuma ada sebagai kotak tanpa
// keterangan apa yang harus diisi.
for (const t of ['Nama Produk', 'Brand', 'Foto', 'Kategori', 'Date Registered']) {
  formKosong.includes(t) ? ok(`label "${t}"`) : salah(`label "${t}"`, 'tidak ditemukan');
}

// ===== Foto produk terbaca kembali =====
//
// Rantai yang dijaga: unggahan foto di form -> product_photos -> foto_path di
// GET /products/register -> ProdukRegister.foto. Mata rantai terakhirnya putus
// sampai 19 Okt 2026 (dipetakan sebagai `foto: null` tetap), dan putusnya tidak
// ketahuan siapa pun karena formnya sendiri tetap terlihat benar.

console.log('\n== Foto produk ==');

fotoProduk.src === '/uploads/foto-uji-123.jpg'
  ? ok(`foto yang diunggah terbaca sebagai URL: "${fotoProduk.src}"`)
  : salah(
      'foto produk',
      `dapat ${JSON.stringify(fotoProduk.src)}, harusnya "/uploads/foto-uji-123.jpg" — nama berkas dari server harus jadi URL, bukan dibuang`
    );

fotoProduk.kosong === null
  ? ok('produk tanpa foto tetap null (bukan string kosong)')
  : salah('foto kosong', `dapat ${JSON.stringify(fotoProduk.kosong)}, harusnya null`);

// ===== 5. Gerbang simpan =====

console.log('\n== Gerbang simpan ==');

gerbangSimpan.ada === 1
  ? ok('tombol "Simpan Produk" ada tepat sekali')
  : salah('tombol Simpan', `ditemukan ${gerbangSimpan.ada} kali; harus 1`);

gerbangSimpan.mati
  ? ok('tombol Simpan MATI saat form masih kosong (wajib isi nama, kategori, design, warna)')
  : salah('gerbang simpan', 'tombol tidak disabled padahal form masih kosong');

gerbangSimpan.batasMati.mati && gerbangSimpan.batasMati.pesanBatas
  ? ok(`form berhenti menerima produk baru setelah ${MAKS_PRODUK_BARU} per sesi`)
  : salah(
      'batas per sesi',
      `mati=${gerbangSimpan.batasMati.mati} pesan=${gerbangSimpan.batasMati.pesanBatas}`
    );

bantahTombol.mati('<button disabled="">Simpan Produk</button>') &&
  !bantahTombol.mati('<button>Simpan Produk</button>') &&
  !bantahTombol.mati('<button disabled="">Batal</button>')
  ? ok('helper gerbang membedakan hidup/mati dan milik-tombol-yang-benar')
  : salah('helper gerbang', 'tidak membedakan kondisi yang seharusnya dibedakan');

// ===== 6. Batal bukan Simpan =====

console.log('\n== Batal vs Simpan ==');
batalVsSimpan.adaBatal
  ? ok('tombol "Batal" ada')
  : salah('tombol Batal', 'tidak ditemukan');

// Dua tombol harus benar-benar dua elemen terpisah. Kalau "Batal" dihapus dan
// sisanya "Simpan Produk", penyusunan string tetap memuat kata Batal --
// makanya yang diperiksa adalah tag <button> yang memuatnya.
batalVsSimpan.tagBatal && /^<button\b[^>]*>/.test(batalVsSimpan.tagBatal)
  ? ok('Batal adalah tombol tersendiri, bukan bagian dari tombol Simpan')
  : salah('tag tombol Batal', 'tidak ditemukan');

// ===== 5b. Daftar brand kosong: form tetap bisa dipakai =====
//
// Dulu bagian ini memeriksa master WARNA yang kosong. Warna tidak lagi dipilih
// di form ini, jadi buntu itu tidak mungkin lagi dari sini. Yang tersisa dan
// masih nyata: brand, yang diambil dari produk yang sudah ada — dan saat produk
// pertama didaftarkan, daftarnya memang kosong.
if (gerbangMaster.tidakDipakaiLagi) {
  ok('kalimat "Master warna belum termuat" tidak lagi relevan di form ini');
} else {
  salah(
      'alasan master warna',
      'kalimat itu masih muncul, padahal form ini tidak lagi memilih warna'
    );
}

// ===== 3 & 4. Produk dari form masuk daftar =====

console.log('\n== Produk dari form ==');

// Keadaan sebelum data sampai. Diletakkan di sini, bukan di bagian form,
// karena yang diperiksa adalah BADAN halaman -- bukan dialognya.
keadaanAwal.adaPemuat
  ? ok('halaman menampilkan "Memuat produk…" sebelum datanya sampai')
  : salah('pemuat', 'kalimat pemuatan tidak ditemukan di halaman yang belum termuat');

keadaanAwal.bukanKosong
  ? ok('halaman yang sedang memuat TIDAK mengaku daftarnya kosong')
  : salah(
      'urutan keadaan',
      'halaman memuat menampilkan kalimat daftar-kosong — pemuatan yang belum selesai terbaca sebagai gudang yang belum pernah diisi'
    );

const selisihKartu = daftar.kartuDengan - daftar.kartuTanpa;
selisihKartu === 1
  ? ok(`produk dari form muncul sebagai kartu (${daftar.kartuTanpa} -> ${daftar.kartuDengan})`)
  : salah(
      'kartu dari form',
      `dengan=${daftar.kartuDengan} tanpa=${daftar.kartuTanpa}; selisih harus 1`
    );

// Angka "N produk" harus IKUT bertambah. Kalau tidak, halaman menampilkan kartu
// tambahan sambil tetap menulis "4 produk" -- dan orangnya percaya hitungannya.
daftar.produkDengan === daftar.produkTanpa + 1
  ? ok(`hitungan produk ikut bertambah (${daftar.produkTanpa} -> ${daftar.produkDengan})`)
  : salah(
      'hitungan produk',
      `dengan=${daftar.produkDengan} tanpa=${daftar.produkTanpa}; harus naik 1`
    );

daftar.namaTerlihat
  ? ok(`nama produk baru tampil di kartu: "${PRODUK_UJI.nama}"`)
  : salah('nama produk baru', `"${PRODUK_UJI.nama}" tidak ditemukan di halaman`);

// Kode desain muncul satu kali lebih banyak setelah produk baru ditambahkan.
// Dihitung sebagai selisih karena produk uji memakai designCode yang sama
// dengan produk pertama katalog — lihat catatan di `daftar.kodeDengan`.
const selisihKode = daftar.kodeDengan - daftar.kodeTanpa;
selisihKode === 1 && daftar.kategoriTerlihat
  ? ok(`kode desain dan kategori tampil di kartu baru (kode naik ${selisihKode})`)
  : salah(
      'isi kartu baru',
      `kode ${daftar.kodeTanpa} -> ${daftar.kodeDengan} (harus naik 1); kategori=${daftar.kategoriTerlihat}`
    );

// Harga TIDAK boleh kembali ke kartu. Diukur sebagai ketiadaan, bukan dihapus
// dari test: harga yang diam-diam muncul lagi di kartu tidak akan ketahuan oleh
// check mana pun kalau assertion-nya cuma dibuang.
daftar.hargaTidakTerlihat
  ? ok('harga tidak lagi tampil di kartu (pindah ke dialog detail)')
  : salah('harga di kartu', 'harga muncul lagi di kartu');

// ===== Baris marketplace =====

console.log('\n== Marketplace di kartu ==');

daftar.pasarTerlihat
  ? ok('ketiga marketplace tampil di kartu (Shopee, TikTok, Shopify)')
  : salah('baris marketplace', 'ada platform yang tidak muncul di kartu');

daftar.statusTerlihat
  ? ok('status "Registered" dan "Not registered" keduanya tampil')
  : salah(
      'status marketplace',
      `registered=${daftar.statusTerlihat}; salah satu status tidak dirender`
    );

// Produk uji tidak ada di peta PASAR, jadi ketiga barisnya harus "Not
// registered" — tepat 3 lebih banyak daripada render tanpa produk itu. Kalau
// produk baru malah ikut mewarisi status produk contoh, selisihnya bukan 3.
const selisihBelum = daftar.statusBelumDengan - daftar.statusBelumTanpa;
selisihBelum === 3
  ? ok(`produk baru tampil "Not registered" di ketiga platform (naik ${selisihBelum})`)
  : salah(
      'status produk baru',
      `tanpa=${daftar.statusBelumTanpa} dengan=${daftar.statusBelumDengan}; selisih harus 3`
    );

// Bentuk kartunya, dihitung oleh definisi yang sama dengan katalog.
kartu.jumlahWarna === 2
  ? ok(`2 warna terbaca (${kartu.warna.join(', ')})`)
  : salah('jumlah warna', `dapat ${kartu.jumlahWarna}, harus 2`);

kartu.jumlahVarian === 3
  ? ok('3 varian terbaca (2 Hitam + 1 Navy)')
  : salah('jumlah varian', `dapat ${kartu.jumlahVarian}, harus 3`);

kartu.size[0] === 'M, L' && kartu.size[1] === 'M'
  ? ok(`ukuran per warna benar (${kartu.size.join(' / ')})`)
  : salah('ukuran per warna', `dapat ${JSON.stringify(kartu.size)}`);

kartu.kodeVarian.includes('LVU-TOP-11-HTP-M') && kartu.kodeVarian.includes('LVU-TOP-11-NVY-M')
  ? ok('kode varian memakai design code + kode warna katalog')
  : salah('kode varian', `dapat ${kartu.kodeVarian.join(', ')}`);

// Produk baru belum punya stok: variannya harus tetap ADA dengan angka nol,
// bukan hilang. Kalau hilang, produk yang baru didaftarkan terlihat tidak punya
// varian sama sekali.
kartu.varianAda === 3
  ? ok('varian tanpa stok tetap dihitung, dengan angka nol')
  : salah('varian tanpa stok', `dapat ${kartu.varianAda}, harus 3`);

kartu.totalJual === 0 && kartu.totalStok === 0 && kartu.nilaiSisa === 0
  ? ok('total stok & nilai sisa 0 untuk produk yang belum masuk gudang')
  : salah(
      'total kartu baru',
      `totalJual=${kartu.totalJual} totalStok=${kartu.totalStok} nilaiSisa=${kartu.nilaiSisa}; harus 0`
    );

// Parameter baru tidak boleh merusak katalog.
kartu.bawaanJumlah === 4
  ? ok('katalog bawaan tetap 4 produk setelah parameter ditambahkan')
  : salah('katalog bawaan', `dapat ${kartu.bawaanJumlah}, harus 4`);

kartu.bawaanSama
  ? ok(`produk bawaan pertama tetap sama (${kartu.bawaanNama})`)
  : salah('produk bawaan', `nama pertama = "${kartu.bawaanNama ?? '(tidak terbaca)'}"`);

tanpaArgumen.samaDenganEksplisit && tanpaArgumen.jumlah === 4
  ? ok('kartuRegister() tanpa argumen sama persis dengan pemanggilan eksplisit')
  : salah(
      'kartuRegister tanpa argumen',
      `jumlah=${tanpaArgumen.jumlah} sama=${tanpaArgumen.samaDenganEksplisit}`
    );

// ===== 6. Kode varian yang diketik orang =====

console.log('\n== Kode varian kustom ==');

kodeKustom.kodeM === 'HITAM-M-V2'
  ? ok('kode yang diketik user dipakai apa adanya')
  : salah('kode kustom', `dapat "${kodeKustom.kodeM}", harusnya "HITAM-M-V2"`);

kodeKustom.kodeL === 'LVU-TOP-22-HTP-L'
  ? ok('varian tanpa kode kustom tetap diturunkan seperti biasa')
  : salah('kode bawaan', `dapat "${kodeKustom.kodeL}", harusnya "LVU-TOP-22-HTP-L"`);

kodeKustom.jumlah === 2
  ? ok('kode kustom tidak menambah/menghapus varian')
  : salah('jumlah varian', `dapat ${kodeKustom.jumlah}, harusnya 2`);

kodeKustom.stokM === 0 && kodeKustom.stokL === 0
  ? ok('varian berkode kustom tetap berstok nol (belum ada barang)')
  : salah('stok varian kustom', 'tidak boleh terisi');

// ===== 9. Identitas langsung bisa diketik =====

console.log('\n== Identitas produk ==');

// Harness luar memakai PRODUK_UJI (yang diekspor bundel), bukan `detailUji` —
// nama itu hidup di dalam bundel dan tidak pernah sampai ke sini.

identitas.nama
  ? ok('nama produk masuk ke tabel Identitas sebagai baris')
  : salah('baris Nama Produk', 'tidak ada di daftar Identitas');

identitas.namaNilai === PRODUK_UJI.nama
  ? ok(`nama produk terbaca di barisnya: "${identitas.namaNilai}"`)
  : salah(
      'nilai Nama Produk',
      `dapat ${JSON.stringify(identitas.namaNilai)}, harusnya ${JSON.stringify(PRODUK_UJI.nama)}`
    );

!identitas.adaJudulNamaLuarTabel
  ? ok('judul nama di luar tabel sudah tidak ada')
  : salah('judul nama di luar tabel', 'masih ada — nama akan terbaca dua kali');

// Nama jadi isian yang bisa disunting, 19 Okt 2026.
identitas.adaIsianNama
  ? ok('Nama Produk jadi isian yang bisa disunting')
  : salah('isian Nama Produk', 'masih teks mati — pemilik minta nama bisa diklik lalu disunting');

// Bingkai foto harus <button>, bukan <div> ber-onClick: div tidak bisa
// difokus papan tik dan tidak bisa ditekan pembaca layar.
fotoKlik.ada
  ? fotoKlik.tombol
    ? ok('bingkai foto bisa diklik (elemen <button>, bukan <div>)')
    : salah('bingkai foto', `tag-nya ${JSON.stringify(fotoKlik.tag)} — harus <button> supaya bisa dipakai papan tik`)
  : salah('bingkai foto', 'tidak ditemukan elemen ber-aria-label "Foto produk"');

identitas.designCode === PRODUK_UJI.spesifikasi.designCode
  ? ok(`SKU Produk terisi langsung sebagai isian: "${identitas.designCode}"`)
  : salah(
      'isian SKU Produk',
      `dapat ${JSON.stringify(identitas.designCode)}, harusnya "${PRODUK_UJI.spesifikasi.designCode}" — nilai identitas harus terbaca sebagai <input> berisi nilainya`
    );

identitas.brand === PRODUK_UJI.brand
  ? ok(`Brand terisi langsung sebagai isian: "${identitas.brand}"`)
  : salah(
      'isian Brand',
      `dapat ${JSON.stringify(identitas.brand)}, harusnya "${PRODUK_UJI.brand}"`
    );

// Kategori dan Registered: teks mati sampai 19 Okt 2026, sekarang isian.
identitas.adaIsianKategori
  ? ok('Kategori jadi isian yang bisa disunting')
  : salah('isian Kategori', 'masih teks mati — pemilik minta bisa disunting seperti SKU dan Brand');

identitas.kategori === PRODUK_UJI.kategori
  ? ok(`Kategori terisi langsung sebagai isian: "${identitas.kategori}"`)
  : salah(
      'isian Kategori',
      `dapat ${JSON.stringify(identitas.kategori)}, harusnya "${PRODUK_UJI.kategori}"`
    );

identitas.adaIsianRegistered
  ? ok('Registered jadi isian yang bisa disunting')
  : salah('isian Registered', 'masih teks mati — pemilik minta bisa disunting seperti SKU dan Brand');

identitas.registered === PRODUK_UJI.registerDate
  ? ok(`Registered terisi langsung sebagai isian: "${identitas.registered}"`)
  : salah(
      'isian Registered',
      `dapat ${JSON.stringify(identitas.registered)}, harusnya "${PRODUK_UJI.registerDate}"`
    );

identitas.registeredTipeTanggal
  ? ok('Registered memakai pemilih tanggal (type="date"), bukan kotak teks bebas')
  : salah('tipe isian Registered', 'bukan type="date" — tanggal yang diketik tangan gampang salah bentuk');

// Kategori asing: 'Atasan' itu kategori produk nyata di database, dan namanya
// tidak ada di KATEGORI_PRODUK. Kalau kotaknya mengabaikannya, membuka produk
// lama lalu menekan Simpan akan mengubah kategorinya jadi 'T-Shirt'.
identitasKategoriAsing.kategori === 'Atasan'
  ? ok('kategori di luar daftar baku tetap terbaca di kotaknya ("Atasan")')
  : salah(
      'kategori asing',
      `dapat ${JSON.stringify(identitasKategoriAsing.kategori)}, harusnya "Atasan" — kategori produk tidak boleh diganti diam-diam oleh daftar baku`
    );

// Brand kosong: keadaan ketiga produk di database saat keluhannya masuk.
// Daftar brand-nya cuma brand baku, jadi kalau kotaknya hilang berarti brand
// baku memang tidak pernah sampai ke dropdown.
brandKosong.adaPemilih
  ? ok('produk ber-brand kosong tetap punya kotak Brand (dropdown tidak hilang)')
  : salah('kotak Brand produk ber-brand kosong', 'hilang — dropdown brand kosong melompong adalah keluhan pemilik');

!identitas.adaTombolEdit
  ? ok('tombol "Edit identitas" sudah tidak ada')
  : salah('tombol Edit identitas', 'masih ada — identitas seharusnya langsung bisa diketik');

// Render pertama belum ada perubahan, jadi tombol Simpan belum perlu muncul.
!identitas.adaSimpan
  ? ok('tombol Simpan belum muncul saat belum ada yang diubah')
  : salah('tombol Simpan', 'muncul padahal tidak ada perubahan untuk disimpan');

// ===== 10 & 11. Chip bahan =====

console.log('\n== Chip bahan ==');

chipBahan.adaLabelKategori
  ? ok('judul kotak tetap nama kategorinya ("Label"), bukan nama material terpilih')
  : salah(
      'judul kotak bahan',
      `kategoriLabel=${chipBahan.adaLabelKategori} judulJadiNamaMaterial=${chipBahan.judulGantiJadiNamaMaterial}; judul harus nama kategori bahannya`
    );

chipBahan.adaNamaMaterial
  ? ok('nama material yang dipilih tetap terbaca, di baris bawahnya')
  : salah('nama material', 'nama material yang dipilih hilang dari kotaknya');

chipBahan.adaKebutuhan
  ? ok('kebutuhan per pcs ikut terbaca di kotak ("2 pcs")')
  : salah('kebutuhan', 'angka kebutuhan per pcs tidak ada di kotaknya');

noNeed.potonganAda
  ? ok('kotak "Label" benar-benar ada di markup, jadi check di bawah menguji sesuatu')
  : salah(
      'potongan kotak kosong',
      'kartu "Label" tidak ketemu di markup — check no-need di bawah akan hijau palsu karena string kosong tidak memuat "Pilih bahan"'
    );

noNeed.adaNoNeed
  ? ok('keputusan "no need" yang tersimpan terbaca kembali sebagai "Label · No need"')
  : salah(
      'no need tersimpan',
      `adaNoNeed=${noNeed.adaNoNeed} adaTidakDiperlukan=${noNeed.adaTidakDiperlukan}; kotaknya harus membaca keputusan yang tersimpan`
    );

!noNeed.kembaliJadiPilihBahan
  ? ok('kotak yang sudah diputuskan no-need TIDAK kembali menawarkan "Pilih bahan"')
  : salah(
      'no need kembali kosong',
      'kotaknya membaca "Pilih bahan" padahal keputusannya tersimpan — ini gejala yang dilaporkan pemilik'
    );

// ===== 12. Kotak terpilih menampilkan nama material =====

console.log('\n== Pilihan material ==');

pilihanMaterial.adaNamaTerpilih
  ? ok('material terpilih terbaca lengkap di kotaknya (kode · nama · satuan)')
  : salah(
      'kotak material terpilih',
      'kotaknya tidak memuat kalimat lengkap materialnya — kemungkinan masih mencetak id mentah'
    );

!pilihanMaterial.idMentah
  ? ok('kotak terpilih TIDAK menampilkan id material mentah ("9")')
  : salah('id mentah', 'kotak terpilih berisi id materialnya saja — inilah keluhan "muncul angka 1, 2, 3, 4"');

// Material yang sudah tidak ada di master: yang benar adalah kotak kosong,
// bukan id-nya dicetak. Ini bentuk paling telanjang dari keluhan yang sama,
// dan satu-satunya yang bisa merah tanpa bergantung pada portal Base UI —
// daftar pilihan memang dirender lewat portal, yang tidak ikut
// renderToStaticMarkup, jadi isinya tidak pernah sampai ke seam ini.
!pilihanMaterial.idAsingBocor
  ? ok('material yang tak ada di master tidak mencetak id-nya ("999") di kotak')
  : salah(
      'id material bocor',
      `kotak terisi ${JSON.stringify(pilihanMaterial.isiKotakIdAsing)} — nilai yang tidak cocok material mana pun harus tampil kosong, bukan id mentah`
    );

// ===== 13. Kotak "no need" di urutan paling belakang =====

console.log('\n== Urutan kotak bahan ==');

URUT_NO_NEED.semuaAda
  ? ok('ketiga kotak (Roll, Ecer, Label) benar-benar ada di markup')
  : salah(
      'kotak tidak lengkap',
      'salah satu kotak uji tidak ada, jadi check urutan di bawah tidak menguji apa pun'
    );

URUT_NO_NEED.noNeed > URUT_NO_NEED.dipakai[0] && URUT_NO_NEED.noNeed > URUT_NO_NEED.dipakai[1]
  ? ok('kotak "no need" (Ecer) berada SESUDAH kotak yang dipakai')
  : salah(
      'urutan no-need',
      'posisi ecer=' +
        URUT_NO_NEED.noNeed +
        ', roll/label=' +
        URUT_NO_NEED.dipakai.join('/') +
        '; bahan yang tidak dipakai harus paling belakang'
    );

URUT_NO_NEED.dipakai[0] >= 0 && URUT_NO_NEED.dipakai[1] > URUT_NO_NEED.dipakai[0]
  ? ok('kotak yang dipakai tetap mengikuti urutan baku (Roll lalu Label)')
  : salah(
      'urutan baku',
      'posisi roll/label=' +
        URUT_NO_NEED.dipakai.join('/') +
        '; urutan di antara yang dipakai tidak boleh berubah'
    );

// ===== 14. Bahan sudah muncul saat Add varian =====

console.log('\n== Bahan di kartu Add varian ==');

BAHAN_ADD.adaArahan
  ? ok('sebelum warna dipilih, kartu Add meminta warna dulu (bukan kotak kosong)')
  : salah('arahan warna', 'kartu Add tidak memberi tahu bahwa warna harus dipilih lebih dulu');

BAHAN_ADD.adaJudulBahan
  ? ok('kartu Add sudah punya bagian Bahan, tanpa perlu Simpan dulu')
  : salah('slot bahan', 'kartu Add tidak punya bagian Bahan sama sekali');

BAHAN_ADD.adaKeputusanLama
  ? ok('bahan yang sudah tersimpan terbaca kembali di kartu edit ("Label Brand Livou")')
  : salah(
      'keputusan lama',
      'baris Label kosong padahal produk sudah punya keputusan label — kartu edit tidak memuat produk.bom'
    );

BAHAN_ADD.adaBarisLabel
  ? ok('baris bahan memakai nama kategorinya sebagai judul ("Label")')
  : salah('judul baris', 'nama kategori tidak muncul sebagai judul baris bahan');

BAHAN_ADD.adaPeringatanSimpan
  ? ok('kartu Add menjelaskan bahannya ikut tersimpan saat Simpan ditekan')
  : salah('penjelasan simpan', 'tidak ada keterangan kapan bahan disimpan');

// ===== 15. Edit bahan terbuka kecil, kartu tidak diganti =====

console.log('\n== Edit bahan di kartu yang sama ==');

EDIT_KECIL.adaNamaWarna && EDIT_KECIL.adaSize
  ? ok('warna dan size tetap terlihat saat satu bahan sedang diedit')
  : salah(
      'kartu tertutup form',
      `adaNamaWarna=${EDIT_KECIL.adaNamaWarna} adaSize=${EDIT_KECIL.adaSize}; mengedit satu bahan tidak boleh menghilangkan isi kartu lainnya`
    );

EDIT_KECIL.adaKotakRoll && EDIT_KECIL.adaKotakLabel
  ? ok('kotak bahan lain tetap tampil, termasuk kotak yang sedang diedit')
  : salah(
      'kotak bahan hilang',
      `adaKotakRoll=${EDIT_KECIL.adaKotakRoll} adaKotakLabel=${EDIT_KECIL.adaKotakLabel}; kedua kotaknya harus tetap dirender`
    );

!EDIT_KECIL.adaFormHalaman
  ? ok('form edit seukuran halaman tidak mengambil alih kartu')
  : salah(
      'form halaman besar',
      'judul "Edit Label" / tombol "Batal edit BOM" muncul di dalam kartu — inilah blok besar yang dikeluhkan pemilik'
    );

EDIT_KECIL.samaDenganDiam
  ? ok('kartu yang sedang diedit dirender sama persis dengan kartu yang diam')
  : salah(
      'kartu berubah',
      'markup kartu berubah saat satu bahan diedit — ada isi kartu yang dipindahkan atau diganti'
    );

EDIT_KECIL.adaKeputusanLabel
  ? ok('kotak yang diedit tetap menyebut keputusan tersimpannya')
  : salah(
      'keputusan hilang',
      'nama material yang sudah diputuskan hilang dari kotaknya saat popover terbuka'
    );

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log('LULUS — posisi tombol, form, dan produk dari form konsisten.');
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
