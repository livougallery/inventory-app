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
import { IsiFormProdukBaru, MAKS_PRODUK_BARU, buangPenanda } from './src/pages/register-produk/FormProdukBaru';
import { PRODUK_REGISTER, kartuRegister, type ProdukRegister } from './src/lib/produk';

const kosong = () => {};

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
const iJudul = halaman.indexOf('>Register Produk</h1>');

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
  <IsiFormProdukBaru onSimpan={kosong} onTutup={kosong} sudahAda={0} />
);

// Section "Warna & ukuran" diganti jadi dua bagian terpisah: "Product
// attributes" (warna & ukuran sebagai nilai yang bisa ditambah) dan
// "Detail varian" (tabel yang auto-generate semua kombinasi warna x ukuran).
const BAGIAN = ['Identitas produk', 'Keterangan produksi', 'Product attributes', 'Detail varian'];
export const posisiBagian = BAGIAN.map((t) => ({ t, i: formKosong.indexOf(t) }));

// Tombol Simpan harus MATI saat form masih kosong.
const semuaTombol = formKosong.match(/<button\\b[^>]*>[\\s\\S]*?<\\/button>/g) ?? [];
const tombolSimpan = semuaTombol.filter((t) => t.includes('Simpan Produk'));
export const gerbangSimpan = {
  ada: tombolSimpan.length,
  mati: tombolSimpan.length > 0 && tombolSimpan.every((t) => t.includes('disabled=""')),
  // Form yang sudah penuh batas: tombol harus mati juga, dan alasannya tampil.
  batasMati: (() => {
    const penuh = renderToStaticMarkup(
      <IsiFormProdukBaru onSimpan={kosong} onTutup={kosong} sudahAda={MAKS_PRODUK_BARU} />
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


export const denganBaru = renderToStaticMarkup(<RegisterProduk produkAwal={[PRODUK_UJI]} />);
export const tanpaBaru = renderToStaticMarkup(<RegisterProduk />);

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

/* Bentuk tabel varian di form yang dirender.
   Dua hal yang TIDAK boleh lolos diam: kolom kode harus berupa <input> yang
   bisa diketik (bukan teks mati), dan aksi hapus harus berupa ikon (bukan
   teks "Hapus"). Keduanya pernah lolos seluruh suite karena tidak ada check
   yang benar-benar mengetest markup-nya. */
export const tabelVarian = (() => {
  const i = formKosong.indexOf('Detail varian');
  const k = formKosong.indexOf('Kode varian');
  return {
    // Cuma string kosong: belum ada error fatal, tapi juga belum yakin.
    panjangBagian: formKosong.length - i,
    adaTabel: k > i,
    // <input> di dalam sel kode: harus ada, dan harus punya aria-label yang
    // menyebut pasangan warna+ukuran -- tanpa itu tidak ada yang menautkan
    // input ke baris yang benar untuk pembaca layar.
    jumlahInputKode: (formKosong.match(/aria-label="Kode varian [^"]*"/g) || []).length,
    // Kolom stok rencana harus benar-benar hilang, bukan disembunyikan.
    adaKolomRencana: formKosong.includes('Rencana'),
    // Aksi hapus: ikon atau teks? Yang dicegat ADALAH IKONNYA, bukan
    // aria-label -- aria-label ada di tombolnya baik ia ikon maupun teks, jadi
    // mutasi yang mengganti <Trash2/> dengan <span>Hapus</span> akan lolos
    // kalau yang dicari cuma aria-label.
    ikonHapus: (formKosong.match(/aria-label="Hapus varian [^"]*"[^>]*>\\s*<svg/g) || []).length,
    adaTeksHapus: /<button[^>]*>\\s*Hapus\\s*<\\/button>/.test(formKosong),
  };
})();

/* Membersihkan penanda "dihapus" ketika nilai atributnya dihapus.

   Fungsi ini murni dan TIDAK pernah muncul di markup hasil render, jadi tanpa
   penjaga di sini ia bisa jadi tak tested sama sekali -- persis kelas check
   yang terbukti lolos|hijau di incident sebelumnya. Dipanggil langsung dari
   sini supaya yang diperiksa benar-benar implementasi yang dipakai form. */
export const buangPenandaUji = (() => {
  const awal = new Set(['Hitam|S', 'Hitam|M', 'Navy|S', 'Navy|M']);
  const setelahWarna = buangPenanda(awal, 'Hitam', 'warna');
  const setelahUkuran = buangPenanda(awal, 'M', 'ukuran');
  return {
    // Set asal tidak boleh ikut berubah: func-nya menyalin, dan kalau tidak,
    // state React yang lain ikut hilang isinya diam-diam.
    asalUtuh: awal.size === 4 && awal.has('Hitam|S'),
    // Menghapus warna membuang SEMUA ukurannya, bukan cuma satu.
    sisaWarna: [...setelahWarna].sort().join(','),
    sisaUkuran: [...setelahUkuran].sort().join(','),
    // Nilai yang tidak ada di penanda tidak mengarang apa pun.
    takAda: [...buangPenanda(awal, 'Merah', 'warna')].sort().join(','),
    // Set kosong harus tetap kosong, bukan jadi null.
    dariKosong: buangPenanda(new Set(), 'Hitam', 'warna').size,
  };
})();

export { MAKS_PRODUK_BARU, PRODUK_UJI };
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

// Penjaga: sumber bundel di dalam template literal TIDAK BOLEH memuat backtick.
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
  formKosong, posisiBagian, gerbangSimpan, bantahTombol, batalVsSimpan,
  denganBaru, tanpaBaru, daftar, kartu, tanpaArgumen, kodeKustom, tabelVarian,
  buangPenandaUji,
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

console.log('\n== Form Tambah Produk ==');

const bagianHilang = posisiBagian.filter((b) => b.i < 0).map((b) => b.t);
const urutanBenar = posisiBagian.every((b, i) => i === 0 || posisiBagian[i - 1].i < b.i);
bagianHilang.length === 0
  ? ok('tiga bagian wajib ada di form')
  : salah('bagian form', `tidak ditemukan: ${bagianHilang.join(', ')}`);
urutanBenar
  ? ok('urutannya: Identitas -> Produksi -> Warna & ukuran')
  : salah('urutan bagian form', posisiBagian.map((b) => `${b.t}=${b.i}`).join(', '));

// Field yang harus ada sebagai isian. Nama produk, design code, harga, vendor.
const ADA_PLACEHOLDER = (t) => formKosong.includes(`placeholder="${t}"`);
const placeholderWajib = {
  nama: ADA_PLACEHOLDER('mis. Oversized Hoodie Kereta'),
  design: ADA_PLACEHOLDER('mis. LVU-TOP-11'),
  harga: ADA_PLACEHOLDER('mis. 149000'),
};
Object.values(placeholderWajib).every(Boolean)
  ? ok('field isian ada: Nama, Design Code, Harga')
  : salah(
      'field isian',
      `hilang: ${Object.entries(placeholderWajib)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .join(', ')}`
    );

// Label yang harus tampil, supaya field tidak cuma ada sebagai kotak kosong.
// "Warna & ukuran" tidak lagi jadi satu label -- dipisah jadi dua baris
// atribut ("Colour" dan "Size") di bawah heading "Product attributes".
for (const t of ['Kategori', 'Brand', 'Batch', 'Kategori Vendor', 'Vendor / CMT', 'Colour', 'Size', 'Kode varian']) {
  formKosong.includes(t) ? ok(`label "${t.replace('&amp;', '&')}"`) : salah(`label "${t}"`, 'tidak ditemukan');
}

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

// ===== 3 & 4. Produk dari form masuk daftar =====

console.log('\n== Produk dari form ==');

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

// ===== 7. Bentuk tabel varian di form =====

console.log('\n== Bentuk tabel varian ==');

tabelVarian.adaTabel
  ? ok('tabel varian ada di section "Detail varian"')
  : salah('tabel varian', 'tidak ditemukan setelah heading');

tabelVarian.jumlahInputKode === 1
  ? ok('kode varian berupa input yang bisa diketik (bukan teks mati)')
  : salah('input kode varian', `dapat ${tabelVarian.jumlahInputKode}, harusnya 1 (form awal: 1 warna x 1 ukuran)`);

tabelVarian.adaKolomRencana
  ? salah('kolom Rencana', 'masih ada — kolom ini butuh stok riil, bukan rencana')
  : ok('kolom "Rencana (pcs)" benar-benar dihapus');

tabelVarian.ikonHapus === 1 && !tabelVarian.adaTeksHapus
  ? ok('aksi hapus berupa ikon, bukan teks "Hapus"')
  : salah(
      'aksi hapus',
      `ikon svg di tombol hapus: ${tabelVarian.ikonHapus}; ada teks "Hapus": ${tabelVarian.adaTeksHapus}`
    );

// ===== 8. Membersihkan penanda hapus saat atributnya dihapus =====

console.log('\n== Membersihkan penanda hapus ==');

buangPenandaUji.asalUtuh
  ? ok('Set asal tidak ikut berubah (fungsi menyalin)')
  : salah('Set asal', 'isinya berubah oleh pemanggilan yang seharusnya menyalin');

buangPenandaUji.sisaWarna === 'Navy|M,Navy|S'
  ? ok('hapus warna membuang penanda semua ukurannya')
  : salah(
      'hapus warna',
      `sisa "${buangPenandaUji.sisaWarna}", harusnya hanya pasangan Navy`
    );

buangPenandaUji.sisaUkuran === 'Hitam|S,Navy|S'
  ? ok('hapus ukuran membuang penanda semua warnanya')
  : salah(
      'hapus ukuran',
      `sisa "${buangPenandaUji.sisaUkuran}", harusnya hanya pasangan ukuran S`
    );

buangPenandaUji.takAda === 'Hitam|M,Hitam|S,Navy|M,Navy|S'
  ? ok('nilai yang tidak ada tidak mengarang penanda baru')
  : salah('nilai tak dikenal', `penanda berubah jadi "${buangPenandaUji.takAda}"`);

buangPenandaUji.dariKosong === 0
  ? ok('penanda kosong tetap kosong, tidak jadi null')
  : salah('penanda kosong', `jadi ${buangPenandaUji.dariKosong} entri`);

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log('LULUS — posisi tombol, form, dan produk dari form konsisten.');
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
