/**
 * Smoke test: papan Kanban Production Fulfillment benar-benar ter-render.
 *
 * Kenapa ini ada padahal cuma pratinjau tanpa database: papan ini dibuat untuk
 * PRESENTASI, dan tidak ada satu pun test lain yang menyentuhnya. `tsc -b`
 * hanya membuktikan tipenya cocok — bukan bahwa kolomnya muncul, kartunya ada,
 * atau angkanya sampai ke layar. Tanpa skrip ini, satu-satunya cara memeriksa
 * adalah membuka browser dan menatap 8 kolom satu per satu.
 *
 * Yang diperiksa:
 *   1. Papan Production  : 8 kolom berwarna, 10 kartu, teks kunci ada
 *   2. Papan White Label : 8 kolom, 8 kartu, dan TIDAK ada kolom "Cutting"
 *                          (white label tidak dipotong — diganti Invoice Logistic)
 *   3. Popup per stage   : isinya BEDA tiap stage, dan stage yang belum punya
 *                          alur benar-benar kosong — bukan diisi tampilan Propose
 *   4. Tabel form        : tombol tambah warna/material ada DI DALAM tabelnya
 *                          sebagai baris terakhir, dengan colSpan selebar
 *                          tabel — bukan tombol terpisah di atasnya. Kain dan
 *                          aksesori satu daftar, jenisnya dipilih per baris,
 *                          dan percabangan jenisnya ikut diperiksa.
 *   5. Angka turunan     : plan qty, jumlah varian, dan badge kekurangan
 *                          dihitung ulang dari data dan dicocokkan
 *   6. Alur pindah stage : approve, kesiapan bahan, dan gate sebelum lanjut
 *                          (label tujuannya mengikuti kolom berikutnya di papan
 *                          masing-masing, bukan dipatok "Cutting")
 *   7. Pemisahan halaman : papan kanban dan tabel 40 kolom benar-benar dua
 *                          halaman berbeda, dan menunya pindah section —
 *                          diperiksa lewat `App` + rutenya, bukan lewat
 *                          komponennya, supaya salah petakan rute ikut ketahuan
 *
 * Pemeriksaan nomor 3, 4, 6, dan 7 yang paling penting untuk perubahan ini.
 * Sebelumnya satu popup dipakai untuk delapan stage; sekarang tiap stage punya
 * daftar pekerjaannya sendiri, dan gate Prepare-lah yang menahan kartu supaya
 * tidak masuk Cutting dengan bahan yang belum dibeli.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-kanban-fulfillment.mjs
 *
 * Aman dijalankan BERSAMAAN dengan dirinya sendiri: konfig, entri, dan direktori
 * keluarnya unik per proses. Sebelumnya tidak — lihat catatan di bawah.
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
// Dirender lewat pipeline Vite, bukan lewat tsx langsung, karena komponen
// kanban memakai `import.meta.env` yang hanya dipahami Vite. Merender dengan
// cara lain akan gagal di situ — dan kegagalan itu tidak ada hubungannya
// dengan papan yang sedang diperiksa.

// Keluaran diletakkan di dalam `frontend/node_modules/.tmp/`, bukan di folder
// temp sistem. Dua alasan: `react-dom` dibiarkan sebagai paket luar oleh Vite,
// jadi Node harus bisa menemukannya dengan menelusuri ke atas dari lokasi
// bundel — dari folder temp sistem itu tidak ketemu. Dan `node_modules/` sudah
// diabaikan git, jadi tidak ada berkas sementara yang ikut ter-commit.
//
// `.tmp` dibuat lebih dulu, tidak diandalkan pada kebetulan. Direktori itu ada
// di mesin ini karena `tsc -b` menulis `tsBuildInfoFile` ke sana (lihat
// `tsconfig.app.json` dkk), tapi itu efek samping yang tidak dijamin: di clone
// bersih atau CI, `tsc -b` belum pernah jalan dan `mkdtempSync` melempar
// ENOENT — seluruh smoke test, satu-satunya verifikasi papan ini, mati sebelum
// merender apa pun. Terbukti dengan memindahkan direktori itu: exit 1 tepat di
// baris ini.
mkdirSync(path.join(frontendDir, 'node_modules', '.tmp'), { recursive: true });
const kerja = mkdtempSync(path.join(frontendDir, 'node_modules', '.tmp', 'smoke-kanban-'));

// Berkas bantuan IKUT unik per proses, bukan nama tetap.
//
// Versi sebelumnya memakai nama tetap (`_smoke-kanban.vite.config.ts`), dan itu
// membuat dua run yang berjalan BERSAMAAN saling menimpa: run kedua menulis
// konfignya ke berkas yang sama, sehingga build pertama menulis bundelnya ke
// direktori milik run kedua. Gejalanya menyesatkan — yang muncul adalah
// "diharapkan 1 bundel, dapat 0", seolah vite-nya rusak, padahal tidak ada yang
// rusak. Sudah kejadian: harness mutasi dijalankan bersamaan dengan subagent
// review yang menjalankan smoke test ini, dan baseline-nya dilaporkan GAGAL
// padahal satu baris kode pun tidak diubah. Dua run bersamaan sekarang aman,
// karena tiap proses punya konfig, entri, dan direktori keluarnya sendiri.
const nama = path.basename(kerja); // smoke-kanban-XXXXXX
const konfig = path.join(frontendDir, `_${nama}.vite.config.ts`);
const masuk = path.join(frontendDir, `_${nama}.entry.tsx`);

// Pembersihan lewat `process.on('exit')`, bukan hanya lewat `finally`.
//
// `process.exit()` menghentikan proses seketika dan TIDAK menjalankan blok
// `finally` — sudah dibuktikan dengan probe. Skrip ini memanggil
// `process.exit(1)` di beberapa tempat (build gagal, jumlah bundel tidak
// sesuai), jadi membersihkan hanya di `finally` menyisakan direktori
// `node_modules/.tmp/smoke-kanban-*` setiap kali ada yang gagal. Sudah
// kejadian: 17 direktori menumpuk tanpa ada yang menyadarinya. Handler `exit`
// dijalankan pada SEMUA jalur keluar, dan `rmSync` sinkron sehingga aman di
// dalamnya.
const bersihkan = () => {
  rmSync(kerja, { recursive: true, force: true });
  for (const f of [konfig, masuk]) rmSync(f, { force: true });
};
process.on('exit', bersihkan);

const entri = `
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import App from './src/App';
import PapanFulfillment from './src/pages/production-fulfillment/PapanFulfillment';
import { IsiPopup, labelSumber } from './src/pages/production-fulfillment/PopupKartu';
import { TabelWarna, TabelBahan, pisahBahan, kodeUnik, isiDariProduk, vendorCocok } from './src/pages/production-fulfillment/FormProduksiBaru';
import { IsiDetailProduk } from './src/pages/register-produk/DetailProduk';
import { PRODUK_REGISTER, barisRegister, cariProduk, namaProduk } from './src/lib/produk';
import { KATEGORI_VENDOR } from './src/lib/opsi';
import {
  KARTU_PRODUCTION, KARTU_WHITELABEL,
  PAPAN_PRODUCTION, PAPAN_WHITELABEL,
  KARTU_BARU, kartuBaru, stageKartu, stageSetelah,
  totalPcs, jumlahVarian, kekurangan, bahanKartu, kunciBahan, ringkasBahan,
} from './src/pages/production-fulfillment/data-kanban';

const stage = (id) => PAPAN_PRODUCTION.find((s) => s.id === id);
const kartuStage = (id) => KARTU_PRODUCTION.find((k) => k.stage === id);
// Stage berikutnya di papan tempat kartu itu berada — di papan White Label,
// kolom setelah Propose adalah Invoice Logistic, bukan Prepare.
const setelah = (papan, id) => papan[papan.findIndex((s) => s.id === id) + 1];

// Aksi kosong: cukup supaya popup merender tombol dan centangnya aktif. Yang
// diperiksa di sini markup-nya, bukan efek sampingnya.
const aksi = { approve: () => {}, tandaiBahan: () => {}, lanjutStage: () => {}, siapKartu: () => [] };

export const produksi = renderToStaticMarkup(
  <PapanFulfillment stages={PAPAN_PRODUCTION} kartu={KARTU_PRODUCTION} sumber="production" />
);
export const whitelabel = renderToStaticMarkup(
  <PapanFulfillment stages={PAPAN_WHITELABEL} kartu={KARTU_WHITELABEL} sumber="whitelabel" />
);

// Popup dirender untuk SETIAP stage, supaya bisa dibuktikan isinya berbeda —
// dan supaya stage yang belum punya alur tidak diam-diam menampilkan BOM.
export const popupPerStage = Object.fromEntries(
  PAPAN_PRODUCTION.map((s) => {
    const k = kartuStage(s.id) ?? KARTU_PRODUCTION[0];
    return [s.id, renderToStaticMarkup(
      <IsiPopup kartu={k} stage={s} stageBerikutnya={setelah(PAPAN_PRODUCTION, s.id)} siapBahan={{}} aksi={aksi} />
    )];
  })
);

// Popup Propose di papan WHITE LABEL. Papannya tidak punya kolom Prepare, jadi
// popupnya tidak boleh menjanjikan pemeriksaan bahan di stage yang tidak ada —
// dan approve-nya harus menuju Invoice Logistic, kolom berikutnya di papan itu.
export const popupProposeWL = renderToStaticMarkup(
  <IsiPopup
    kartu={KARTU_WHITELABEL.find((k) => k.stage === 'propose')}
    stage={PAPAN_WHITELABEL.find((s) => s.id === 'propose')}
    stageBerikutnya={setelah(PAPAN_WHITELABEL, 'propose')}
    adaPrepare={false}
    siapBahan={{}}
    aksi={aksi}
  />
);

export const popupTanpaStage = renderToStaticMarkup(<IsiPopup kartu={KARTU_PRODUCTION[0]} />);

// Label asal usul kartu di bawah judul popup. Tidak bisa diperiksa dari markup
// IsiPopup karena tempatnya di DialogHeader, dan DialogContent memakai
// portal yang tidak ikut ter-render di server — jadi fungsinya yang diperiksa.
export const labelPopup = {
  production: labelSumber('production'),
  whitelabel: labelSumber('whitelabel'),
};

// ===== Halaman utuh, lewat rutenya =====
//
// Dua halaman ini diperiksa lewat App + MemoryRouter, bukan dengan merender
// komponennya langsung. Bedanya penting: yang bisa salah di sini adalah
// PEMETAAN rute — papan dan tabel punya path masing-masing, dan kalau keduanya
// menunjuk path yang sama, sidebar tampak benar sementara salah satu halaman
// tidak bisa dibuka sama sekali. Merender komponennya langsung tidak akan
// pernah menangkap itu.
//
// Sidebar dan breadcrumb ikut ter-render di sini, jadi keduanya bisa diperiksa
// dari markup yang sama — termasuk bahwa menu papan benar-benar pindah ke
// section Progress, bukan cuma ditambahkan di sana.
export const halPapan = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/production-fulfillment']}>
    <App />
  </MemoryRouter>
);
export const halTabel = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/production-fulfillment-table']}>
    <App />
  </MemoryRouter>
);
export const halRegister = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/register-produk']}>
    <App />
  </MemoryRouter>
);

// ===== Register Produk: katalog, daftar POS, dan pengisian otomatis form =====
//
// Yang diperiksa di sini bukan "halamannya terbuka", tapi bahwa angka yang
// tampil di daftar dan angka yang mengisi form produksi BERASAL DARI SUMBER
// YANG SAMA. Dua daftar yang mirip tapi tidak sama adalah kesalahan yang paling
// mudah terjadi di sini — dan akibatnya baru terlihat saat presentasi, ketika
// produk yang baru dipilih di Register tidak mengisi form produksi.

export const katalogProduk = PRODUK_REGISTER.map((p) => ({
  id: p.id,
  nama: p.nama,
  kategori: p.kategori,
  harga: p.harga,
  designCode: p.spesifikasi.designCode,
  jumlahWarna: p.spesifikasi.warna.length,
  jumlahKain: p.spesifikasi.kain.length,
  jumlahAksesori: p.spesifikasi.aksesori.length,
  totalPcs: p.spesifikasi.warna.reduce(
    (s, w) => s + w.pcs.reduce((a, x) => a + x.qty, 0),
    0
  ),
}));

export const barisPos = barisRegister();

// Isi form untuk SETIAP produk, dihitung di dalam bundel supaya yang diperiksa
// benar-benar fungsi yang dipakai formnya.
export const isiForm = PRODUK_REGISTER.map((p) => ({
  id: p.id,
  nama: p.nama,
  ...isiDariProduk(p.spesifikasi),
}));

// Kategori vendor di dua papan: yang cocok harus dapat LABEL-nya (bukan kodenya),
// dan yang tidak ada di daftar papan itu harus kosong — bukan dipaksa masuk.
export const vendorPerPapan = PRODUK_REGISTER.map((p) => ({
  id: p.id,
  kode: p.spesifikasi.kategoriVendor,
  production: vendorCocok(p.spesifikasi.kategoriVendor, KATEGORI_VENDOR.production),
  whitelabel: vendorCocok(p.spesifikasi.kategoriVendor, KATEGORI_VENDOR.white_label),
}));

export const saranNama = namaProduk();
export const cariAda = cariProduk(PRODUK_REGISTER[0].nama)?.id ?? null;
export const cariTidakAda = cariProduk('Produk Yang Tidak Terdaftar') ?? null;
// Sebagian nama pun tidak boleh cocok: pengisian otomatis di tengah pengetikan
// akan menimpa isian yang sudah dikerjakan pengguna.
export const cariSebagian = cariProduk(PRODUK_REGISTER[0].nama.slice(0, 4)) ?? null;

// Katalog dan daftar kategori vendor dioper APA ADANYA ke skrip pemeriksa.
// Menyalin isinya di sana akan membuat pemeriksaan cocok dengan salinannya
// sendiri — lulus walaupun katalognya berubah.
export { PRODUK_REGISTER };
export { KATEGORI_VENDOR };

// Halaman detail dirender terpisah — DialogContent memakai portal, jadi isinya
// tidak ikut ter-render lewat rutenya.
export const detailPerProduk = PRODUK_REGISTER.map((p) => ({
  id: p.id,
  html: renderToStaticMarkup(<IsiDetailProduk produk={p} />),
}));

// ===== Tabel di form "Tambah Produksi" =====
//
// Tabelnya dipisah dari Dialog supaya bisa dirender di sini: DialogContent
// memakai portal, dan portal tidak ikut ter-render di server. Yang diperiksa
// bukan sekadar "tombolnya ada", tapi bahwa tombol tambahnya berada DI DALAM
// tabel sebagai baris terakhir — itu yang diminta pemilik, dan colSpan yang
// tidak cocok dengan jumlah kolom tidak memunculkan error apa pun saat salah.
const warnaContoh = [
  { key: 1, nama: 'Black', kode: 'BLK', pcs: { S: '20', M: '25', L: '20', XL: '' } },
];
const bahanContoh = [
  { key: 1, jenis: 'kain', nama: 'Kain Rayon', perPcs: '1.5', satuan: 'm', tersedia: '120' },
  { key: 2, jenis: 'aksesori', nama: 'Label Brand', perPcs: '1', satuan: 'pcs', tersedia: '500' },
];

export const tabelWarna = renderToStaticMarkup(
  <TabelWarna warna={warnaContoh} setWarna={() => {}} />
);
export const tabelBahan = renderToStaticMarkup(
  <TabelBahan bahan={bahanContoh} setBahan={() => {}} />
);
// Tabel bahan dalam keadaan KOSONG. Baris "Belum ada bahan" juga memakai
// colSpan, jadi ia bisa pincang dengan cara yang sama — dan keadaan kosong
// justru yang paling jarang dilihat saat memeriksa manual.
export const tabelBahanKosong = renderToStaticMarkup(
  <TabelBahan bahan={[]} setBahan={() => {}} />
);

// Percabangan jenis: baris kain harus jadi SpesifikasiKain (per warna), baris
// aksesori jadi SpesifikasiAksesori (satu angka). Salah cabang tidak
// memunculkan error apa pun — di Prepare barisnya cuma muncul "All variations"
// dengan satu stok untuk semua warna, dan angkanya terlihat masuk akal.
const barisWarnaContoh = [
  { nama: 'Black', kode: 'BLK', pcs: [{ ukuran: 'S', qty: 20 }] },
  { nama: 'Ivory', kode: 'IVR', pcs: [{ ukuran: 'S', qty: 20 }] },
];
export const bahanTerpisah = pisahBahan(
  [
    ...bahanContoh,
    // Setengah terisi: tidak boleh ikut jadi baris BOM.
    { key: 3, jenis: 'kain', nama: '', perPcs: '1', satuan: 'm', tersedia: '10' },
    { key: 4, jenis: 'kain', nama: 'Kain Tanpa Qty', perPcs: '', satuan: 'm', tersedia: '10' },
    // Qty 0 bukan qty yang sah — field yang dikosongkan tidak boleh jadi 0.
    { key: 5, jenis: 'aksesori', nama: 'Kancing Nol', perPcs: '0', satuan: 'pcs', tersedia: '10' },
  ],
  barisWarnaContoh
);

// Angka turunan dihitung DI DALAM bundel ini, bukan di skrip pemeriksa —
// supaya yang diperiksa benar-benar fungsi yang dipakai papan, bukan salinan
// logikanya. Kalau rumusnya berubah, pemeriksaan ikut berubah.
export const fakta = KARTU_PRODUCTION.map((k) => ({
  nama: k.productName,
  pcs: totalPcs(k),
  varian: jumlahVarian(k),
  badge: kekurangan(k),
  adaKurang: bahanKartu(k).some((b) => b.status === 'kurang'),
  perPcsKaret: bahanKartu(k).find((b) => b.material === 'Karet Pinggang')?.perPcs ?? null,
  totalKaret: bahanKartu(k).find((b) => b.material === 'Karet Pinggang')?.total ?? null,
}));

export const faktaWL = KARTU_WHITELABEL.map((k) => ({
  nama: k.productName,
  pcs: totalPcs(k),
  varian: jumlahVarian(k),
  badge: kekurangan(k),
  adaKurang: bahanKartu(k).some((b) => b.status === 'kurang'),
}));

// Dipakai skrip pemeriksa di luar bundel, untuk kartu hasil form.
export { bahanKartu };
// Jumlah warna contoh ikut diekspor supaya pemeriksa bisa membandingkan jumlah
// baris per-warna tanpa menyalin datanya — salinan yang bisa berbeda diam-diam.
export { barisWarnaContoh };
// Dipakai skrip pemeriksa di blok Register Produk: baris bahan hasil pengisian
// otomatis harus diuji dengan pemisah yang SAMA seperti form, bukan salinannya.
export { pisahBahan };

// ===== Alur pindah stage =====

const elodie = KARTU_PRODUCTION[0];
const kunciElodie = kunciBahan(elodie);
const sora = KARTU_PRODUCTION.find((k) => k.stage === 'prepare');
const camille = KARTU_WHITELABEL.find((k) => k.stage === 'propose');

export const alur = {
  kunciElodie,
  jumlahBaris: bahanKartu(elodie).length,
  ringkasKosong: ringkasBahan(elodie, {}),
  ringkasSeparuh: ringkasBahan(elodie, { [elodie.id]: kunciElodie.slice(0, 2) }),
  ringkasPenuh: ringkasBahan(elodie, { [elodie.id]: kunciElodie }),
  ringkasSora: sora ? ringkasBahan(sora, {}) : null,

  // Kartu yang sudah pindah: keluar dari daftar bawaan, tujuan diambil dari peta.
  stageDariPeta: stageKartu(elodie.id, KARTU_PRODUCTION, { [elodie.id]: 'cutting' }, PAPAN_PRODUCTION),
  stageBawaan: stageKartu(elodie.id, KARTU_PRODUCTION, {}, PAPAN_PRODUCTION),
  // Kartu yang tidak ada di daftar (hasil form) dan belum punya tujuan.
  stageKartuBaru: stageKartu('b-99', KARTU_PRODUCTION, {}, PAPAN_PRODUCTION),

  // Kartu White Label yang tidak ada di daftar: kolom setelah Propose di papan
  // itu Invoice Logistic, BUKAN Prepare — papan itu tidak punya Prepare.
  stageKartuBaruWL: stageKartu('b-99', KARTU_WHITELABEL, {}, PAPAN_WHITELABEL),
  // Kartu yang sudah di-approve di papan White Label.
  stageApproveWL: stageKartu(camille.id, KARTU_WHITELABEL, { [camille.id]: 'invoice-logistic' }, PAPAN_WHITELABEL),
  // Penjagaan terhadap perpindahan ke kolom yang tidak ada di papan ini —
  // misalnya catatan lama berisi 'prepare' di papan White Label. Kartunya TIDAK
  // boleh lenyap: ia jatuh kembali ke stage-nya sendiri, yang masih sah.
  stageTujuanHantu: stageKartu(camille.id, KARTU_WHITELABEL, { [camille.id]: 'prepare' }, PAPAN_WHITELABEL),
  // Dan kalau stage kartunya SENDIRI yang tidak ada di papan — persis yang
  // terjadi pada kartu White Label ber-stage 'prepare' sebelum Prepare dihapus
  // — kartunya ditaruh di kolom setelah Propose, bukan dibiarkan lenyap.
  stageBawaanHantu: stageKartu(
    'w-hantu',
    [{ ...camille, id: 'w-hantu', stage: 'prepare' }],
    {},
    PAPAN_WHITELABEL
  ),

  // Tujuan approve di kedua papan, diambil dari urutan kolomnya.
  tujuanApproveProduksi: stageSetelah(PAPAN_PRODUCTION, 'propose')?.id ?? null,
  tujuanApproveWL: stageSetelah(PAPAN_WHITELABEL, 'propose')?.id ?? null,
  // Kolom terakhir tidak punya tujuan — dipakai tombol lanjut yang harus mati.
  tujuanSetelahTerakhir: stageSetelah(PAPAN_PRODUCTION, 'finance-validate')?.id ?? null,

  // Kartu dari form untuk KEDUA papan. Akhiran workcode-nya milik papan, bukan
  // ditulis tetap di dalam kartuBaru(): usulan dari papan White Label harus
  // berakhiran _WHLB seperti kartu contoh di sebelahnya.
  kartuFormProduksi: kartuBaru('b-1', KARTU_BARU, 'production'),
  kartuFormWL: kartuBaru('b-2', KARTU_BARU, 'whitelabel'),

  // Stok yang belum dicatat BUKAN stok nol. Baris dengan tersedia kosong tetap
  // ikut (kebutuhannya nyata) tapi TIDAK boleh bertanda merah — kalau dianggap
  // 0, setiap kartu baru langsung tampak kekurangan stok yang tidak pernah
  // diperiksa.
  //
  // Sengaja dilewatkan pisahBahan dengan field tersedia KOSONG, bukan menyusun
  // kartunya langsung. Di situlah bug-nya dulu hidup (angka(b.tersedia) ?? 0),
  // dan kartu yang disusun langsung melewati jalur itu sepenuhnya — pemeriksaan
  // yang dibuat dengan cara itu lulus terus meski bug-nya kembali. Sudah
  // dibuktikan: mutasi yang mengembalikan ?? 0 tidak ketangkap versi pertama.
  //
  // labelTersedia dikosongkan supaya hitungan barisnya tetap dua: dengan label
  // ikut terisi, tiga baris "Label Size" masuk dan jumlahnya berubah tanpa ada
  // hubungannya dengan yang sedang diperiksa.
  bahanTanpaStok: bahanKartu(
    kartuBaru(
      'b-3',
      {
        ...KARTU_BARU,
        labelTersedia: {},
        ...pisahBahan(
          [
            { key: 1, jenis: 'kain', nama: 'Kain Rayon', perPcs: '1.5', satuan: 'm', tersedia: '' },
            { key: 2, jenis: 'aksesori', nama: 'Label Brand', perPcs: '1', satuan: 'pcs', tersedia: '' },
          ],
          KARTU_BARU.warna
        ),
      },
      'production'
    )
  ),

  // Baris dengan stok yang JELAS nol tetap harus bertanda merah — "belum
  // dicatat" hanya berlaku saat angkanya memang tidak ada, bukan pelarian.
  bahanStokNol: bahanKartu(
    kartuBaru(
      'b-4',
      {
        ...KARTU_BARU,
        labelTersedia: {},
        ...pisahBahan(
          [
            { key: 1, jenis: 'aksesori', nama: 'Label Brand', perPcs: '1', satuan: 'pcs', tersedia: '0' },
          ],
          KARTU_BARU.warna
        ),
      },
      'production'
    )
  ),

  // Dua warna yang namanya berbeda tapi berkode sama — persis yang bikin satu
  // warna menimpa warna lain kalau kodenya tidak dijaga. Diperiksa lewat
  // kodeUnik, fungsi yang dipakai simpan() saat menyusun barisWarna.
  kodeBentrok: (() => {
    const dipakai = new Set();
    return {
      pertama: kodeUnik('Black', '', dipakai),
      kedua: kodeUnik('Blackberry', '', dipakai),
      // Nama yang hurufnya sama persis: tidak ada sisa huruf untuk diperpanjang,
      // jadi jalurnya harus jatuh ke nomor urut.
      kembar1: kodeUnik('Red', '', dipakai),
      kembar2: kodeUnik('Red', '', dipakai),
    };
  })(),

  kartuDariForm: kartuBaru('b-1', KARTU_BARU, 'production'),

  // Dua baris kain yang teksnya PERSIS sama — kain utama dan furing dari bahan
  // yang sama adalah hal lazim, dan dulu keduanya berbagi satu kunci sehingga
  // satu centang di Prepare membuka gate untuk keduanya sekaligus.
  //
  // Sengaja lewat kartuBaru + pisahBahan, bukan menyusun barisnya langsung:
  // kuncinya dibentuk di bahanKartu() saat pembacaan, jadi fixture yang
  // menyusun barisnya sendiri tidak melewati jalur yang diperiksa.
  kunciKembar: (() => {
    const kartu = kartuBaru(
      'b-5',
      {
        ...KARTU_BARU,
        labelTersedia: {},
        ...pisahBahan(
          [
            { key: 1, jenis: 'kain', nama: 'Kain Rayon', perPcs: '1.5', satuan: 'm', tersedia: '100' },
            { key: 2, jenis: 'kain', nama: 'Kain Rayon', perPcs: '0.5', satuan: 'm', tersedia: '100' },
          ],
          // Satu warna saja: dengan dua warna, tiap baris kain menyebar per
          // warna dan yang diperiksa jadi empat baris, bukan pasangan kembar.
          [{ nama: 'Black', kode: 'BLK', pcs: [{ ukuran: 'S', qty: 10 }] }]
        ),
      },
      'production'
    );
    const kunci = kunciBahan(kartu);
    return { kunci, unik: [...new Set(kunci)].length };
  })(),
};
`;

// Diisi kalau build bundel gagal. Tidak langsung `process.exit()` di dalam
// catch, supaya keluaran vite yang panjang tercetak setelah semua pesan lain
// selesai — urutannya tetap sama seperti sebelum pembersihan dipindah ke
// handler `exit`. Pembersihannya sendiri sudah dijamin handler itu, jadi tidak
// ada lagi yang bergantung pada `finally`.
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
  build: { ssr: ${JSON.stringify(masuk)}, outDir: ${JSON.stringify(kerja)}, emptyOutDir: true, minify: false, rollupOptions: { output: { format: 'esm', entryFileNames: 'papan.mjs' } } },
});
`,
    'utf8'
  );
  writeFileSync(masuk, entri, 'utf8');

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // `shell: true` diperlukan di Windows: Node menolak menjalankan `.cmd`
  // secara langsung (spawnSync EINVAL).
  execFileSync(npx, ['vite', 'build', '--config', konfig], {
    cwd: frontendDir,
    stdio: 'pipe',
    shell: true,
  });
} catch (e) {
  gagalBangun = e;
}

if (gagalBangun) {
  console.error('\nGAGAL membangun bundel pratinjau papan:');
  // stderr IKUT dicetak, bukan cuma stdout. Vite menulis error transformasinya
  // ke stderr; mengambil stdout saja menampilkan "✓ 60 modules transformed."
  // sebagai kalimat terakhir — dan penyebab sebenarnya hilang sama sekali.
  // Sudah kejadian: mutasi yang seharusnya ketahuan terlihat seperti gagal
  // tanpa alasan, dan beberapa menit habis mencari sebabnya.
  const keluaran = [gagalBangun.stdout, gagalBangun.stderr, gagalBangun.message]
    .filter(Boolean)
    .join('\n');
  console.error(String(keluaran).slice(-3000));
  process.exit(1);
}

// Bundel keluaran Vite berupa ESM. Node menganggap berkas `.js` di luar repo
// sebagai CommonJS, jadi ia diberi akhiran `.mjs` supaya bisa diimpor langsung
// — tanpa itu, impor gagal dengan "Cannot use import statement outside a module".
const berkas = readdirSync(kerja).filter((f) => f.endsWith('.mjs') || f.endsWith('.js'));
if (berkas.length !== 1) {
  console.error(`GAGAL: diharapkan 1 bundel di ${kerja}, dapat ${berkas.length}`);
  process.exit(1);
}
const bundel = path.join(kerja, berkas[0]);
const url = pathToFileURL(bundel).href;

const m = await import(url);

const { produksi, whitelabel, popupPerStage, popupProposeWL, popupTanpaStage, labelPopup, fakta, faktaWL, alur, bahanKartu, tabelWarna, tabelBahan, tabelBahanKosong, bahanTerpisah, barisWarnaContoh, pisahBahan, halPapan, halTabel, halRegister, katalogProduk, barisPos, isiForm, vendorPerPapan, saranNama, cariAda, cariTidakAda, cariSebagian, detailPerProduk, PRODUK_REGISTER, KATEGORI_VENDOR } =
  m;

// ===== 1. Papan Production =====

console.log('\n== Papan Production ==');
const kolomProduksi = (produksi.match(/data-slot="kanban-column"/g) || []).length;
const kartuProduksi = (produksi.match(/data-slot="kartu-fulfillment"/g) || []).length;
kolomProduksi === 8 ? ok('8 kolom') : salah('jumlah kolom', `dapat ${kolomProduksi}, harus 8`);
kartuProduksi === 10 ? ok('10 kartu') : salah('jumlah kartu', `dapat ${kartuProduksi}, harus 10`);

for (const t of [
  'Propose', 'Prepare', 'Cutting', 'Receive', 'Invoice Product',
  'HPP &amp; Price', 'Upload', 'Finance Validate',
]) {
  produksi.includes(t) ? ok(`kolom "${t}"`) : salah(`kolom "${t}"`, 'tidak ditemukan');
}

for (const t of ['Elodie Top', 'PDFF_CSC-TOP-17_B-00_PRDN', 'Batch B-00', '145 PCS', '6 rows']) {
  produksi.includes(t) ? ok(`teks "${t}"`) : salah(`teks "${t}"`, 'tidak ditemukan');
}

// Titik warna tahap: ReUI tidak mewarnai kolomnya sendiri, jadi warna dipasang
// di header tiap kolom. Kalau kelasnya hilang, papan kembali jadi delapan kolom
// kelabu yang sama — dan itu tidak terlihat dari pemeriksaan teks mana pun.
for (const w of ['bg-slate-400', 'bg-amber-500', 'bg-violet-500', 'bg-emerald-500']) {
  produksi.includes(w) ? ok(`titik warna ${w}`) : salah(`titik warna ${w}`, 'tidak ditemukan');
}

// Tombol tambah produksi harus ada di kolom Propose — satu-satunya jalan
// menambah kartu. Tanpa ini, papan cuma bisa dilihat.
produksi.includes('Tambah Produksi')
  ? ok('tombol "Tambah Produksi" ada di papan')
  : salah('tombol "Tambah Produksi"', 'tidak ditemukan');

// Kartu di Prepare menampilkan progres bahan, bukan badge stok.
const adaBadgeSiap = /Bahan \d+\/\d+ siap|Bahan siap semua/.test(produksi);
adaBadgeSiap
  ? ok('kartu di Prepare menampilkan progres kesiapan bahan')
  : salah('badge kesiapan bahan', 'tidak ditemukan di kartu Prepare');

// ===== 2. Papan White Label =====

console.log('\n== Papan White Label ==');
const kolomWl = (whitelabel.match(/data-slot="kanban-column"/g) || []).length;
const kartuWl = (whitelabel.match(/data-slot="kartu-fulfillment"/g) || []).length;
// TUJUH kolom, bukan delapan: papan White Label tidak punya Prepare — usulan
// yang di-approve langsung ke Invoice Logistic.
kolomWl === 7 ? ok('7 kolom') : salah('jumlah kolom WL', `dapat ${kolomWl}, harus 7`);
// Kartunya tetap 8 — tidak ada yang hilang saat Prepare dihapus.
kartuWl === 8 ? ok('8 kartu') : salah('jumlah kartu WL', `dapat ${kartuWl}, harus 8`);
whitelabel.includes('Invoice Logistic')
  ? ok('ada kolom "Invoice Logistic"')
  : salah('kolom "Invoice Logistic"', 'tidak ditemukan');

// White label tidak dipotong di sini — kalau "Cutting" muncul, papannya salah.
!whitelabel.includes('>Cutting<')
  ? ok('tidak ada kolom "Cutting" (benar — diganti Invoice Logistic)')
  : salah('kolom "Cutting" di papan White Label', 'seharusnya tidak ada');

// Prepare juga tidak ada: owner memutuskan usulan white label langsung ke
// Invoice Logistic, tanpa tahap siapkan bahan.
!whitelabel.includes('>Prepare<')
  ? ok('tidak ada kolom "Prepare" (benar — langsung Invoice Logistic)')
  : salah('kolom "Prepare" di papan White Label', 'seharusnya tidak ada');

whitelabel.includes('WHLB')
  ? ok('workcode white label memakai akhiran WHLB')
  : salah('akhiran WHLB', 'tidak ditemukan');

// ===== 3. Popup per stage =====

console.log('\n== Popup per stage ==');
const popupPropose = popupPerStage.propose;
const popupPrepare = popupPerStage.prepare;

// -- Propose: peninjauan usulan + approve
for (const t of [
  'Product &amp; Proposal Information',
  'Color &amp; Size Plan',
  'Material Requirements (BOM)',
  'LVU-TOP-17-BLK-S', 'LVU-TOP-17-IVR-L',
  '6 variation rows', 'Total plan 145 PCS',
  'Label Brand', 'Karet Pinggang', 'Kain Pleats',
  'didaftarkan otomatis',
  'Approve',
]) {
  popupPropose.includes(t) ? ok(`Propose "${t}"`) : salah(`Propose "${t}"`, 'tidak ditemukan');
}

// Propose tidak punya centang kesiapan bahan — itu pekerjaan stage Prepare.
!popupPropose.includes('Material readiness')
  ? ok('Propose tidak menampilkan panel kesiapan bahan')
  : salah('panel kesiapan bahan di Propose', 'seharusnya tidak ada');

// -- Prepare: kesiapan bahan, bukan approve
//
// Label tombolnya TIDAK dipatok "Mulai Cutting": tujuannya diambil dari kolom
// berikutnya di papan ini, jadi di papan Production bunyinya "Lanjut ke
// Cutting". Yang diperiksa adalah bentuk labelnya, bukan satu kalimat tetap —
// kalau dipatok, papan White Label (yang kolom berikutnya Invoice Logistic)
// akan lolos pemeriksaan padahal tombolnya salah.
for (const t of ['Material readiness', 'Lanjut ke Cutting', 'baris siap', 'Label Brand']) {
  popupPrepare.includes(t) ? ok(`Prepare "${t}"`) : salah(`Prepare "${t}"`, 'tidak ditemukan');
}
popupPrepare.includes('data-slot="checkbox"')
  ? ok('Prepare punya kolom centang per baris bahan')
  : salah('centang per baris bahan', 'tidak ditemukan');
!popupPrepare.includes('>Approve<')
  ? ok('Prepare tidak menampilkan tombol Approve')
  : salah('tombol Approve di Prepare', 'seharusnya tidak ada');

// Prepare di papan White Label tidak ada, jadi popup Propose di papan itu tidak
// boleh menampilkan panel kesiapan bahan — itu pekerjaan stage yang tidak ada.
!popupProposeWL.includes('Material readiness')
  ? ok('Propose White Label tidak menampilkan panel kesiapan bahan')
  : salah('panel kesiapan bahan di Propose White Label', 'stage Prepare tidak ada di papan itu');

// Tujuan approve mengikuti kolom berikutnya DI PAPAN ITU. Teks ini satu-satunya
// tempat pemilik melihat ke mana kartunya akan pindah sebelum menekan tombol.
popupProposeWL.includes('memindahkan kartu ke stage Invoice Logistic')
  ? ok('approve di White Label menuju "Invoice Logistic"')
  : salah('tujuan approve White Label', 'tidak menunjuk kolom berikutnya di papan itu');

!popupProposeWL.includes('memindahkan kartu ke stage Prepare')
  ? ok('approve White Label tidak menjanjikan stage "Prepare" yang tidak ada')
  : salah('tujuan approve "Prepare" di White Label', 'papan itu tidak punya Prepare');

!popupProposeWL.includes('dikerjakan di stage Prepare')
  ? ok('Propose White Label tidak menyebut pemeriksaan bahan di Prepare')
  : salah('teks Prepare di Propose White Label', 'stage itu tidak ada di papan ini');

// -- Stage lain: kosong dengan keterangan, BUKAN salinan Propose
const stageKosong = Object.entries(popupPerStage).filter(
  ([id]) => id !== 'propose' && id !== 'prepare'
);
let stageMasihBerisi = 0;
for (const [id, html] of stageKosong) {
  if (!html.includes('Belum ada isi khusus untuk stage ini')) {
    stageMasihBerisi++;
    salah(`stage "${id}"`, 'tidak menampilkan keterangan kosong');
  }
  if (html.includes('Material Requirements (BOM)')) {
    stageMasihBerisi++;
    salah(`stage "${id}"`, 'masih menampilkan tabel BOM seperti di Propose');
  }
}
stageMasihBerisi === 0
  ? ok(`6 stage lain kosong dengan keterangan, bukan salinan Propose`)
  : salah('stage kosong', `${stageMasihBerisi} masalah`);

// Identitas tetap ada di semua stage — tanpa itu popup tidak bisa diketahui
// milik pekerjaan yang mana.
let identitasHilang = 0;
for (const [id, html] of Object.entries(popupPerStage)) {
  if (!html.includes('Product &amp; Proposal Information') || !html.includes('Color &amp; Size Plan')) {
    identitasHilang++;
    salah(`identitas stage "${id}"`, 'blok identitas/rencana tidak ditemukan');
  }
}
identitasHilang === 0
  ? ok('blok identitas + rencana warna/ukuran ada di kedelapan stage')
  : salah('blok identitas', `${identitasHilang} stage tidak lengkap`);

// Tanpa stage, popup tidak boleh menebak — jangan menampilkan isi Propose.
!popupTanpaStage.includes('Material Requirements (BOM)') && popupTanpaStage.includes('Belum ada isi khusus')
  ? ok('popup tanpa stage tidak menebak isi Propose')
  : salah('popup tanpa stage', 'seharusnya menampilkan keterangan kosong');

// Label papan di bawah judul. Kartu White Label yang popupnya berbunyi
// "Production proposal" membuat pemilik mengira ia melihat usulan produksi
// biasa — dan popup inilah yang paling banyak dibaca saat presentasi.
labelPopup.production === 'Production proposal' && labelPopup.whitelabel === 'White Label proposal'
  ? ok('label popup mengikuti papan (Production / White Label)')
  : salah(
      'label popup',
      `Production="${labelPopup.production}", White Label="${labelPopup.whitelabel}"`
    );

// "Kesiapan bahan diperiksa di tabel bawah" hanya boleh muncul di stage yang
// MEMANG punya tabel itu. Enam stage lain isinya dikosongkan, jadi kalimat itu
// menjanjikan sesuatu yang tidak ada tepat di atas panel "Belum ada isi".
const janjiTabelSalah = Object.entries(popupPerStage)
  .filter(([id]) => id !== 'propose' && id !== 'prepare')
  .filter(([, html]) => html.includes('diperiksa di tabel bawah'));
janjiTabelSalah.length === 0
  ? ok('janji "tabel bawah" hanya muncul di stage yang punya tabelnya')
  : salah(
      'janji tabel bawah',
      `muncul di stage ${janjiTabelSalah.map(([id]) => id).join(', ')} yang isinya kosong`
    );

popupPropose.includes('Kesiapan bahan diperiksa di tabel bawah')
  ? ok('Propose tetap menyebut tabel bawah — di sana tabelnya memang ada')
  : salah('keterangan tabel di Propose', 'hilang, padahal BOM-nya ada di bawah');

// ===== 4. Tabel di form "Tambah Produksi" =====
//
// Pemilik minta tombol tambah warna/kain/aksesori TIDAK lagi berdiri sendiri di
// atas tabel, tapi jadi baris yang menyusul ke bawah di dalam tabelnya. Yang
// paling mudah salah di sini adalah `colSpan`: angka yang tidak cocok dengan
// jumlah kolom tidak memunculkan error apa pun — tabelnya hanya tampak pincang,
// dan itu tidak terlihat dari pemeriksaan teks mana pun.

console.log('\n== Tabel form "Tambah Produksi" ==');

/** Baris terakhir sebuah tabel — tempat tombol tambah seharusnya berada. */
function barisTerakhir(html) {
  return html.slice(html.lastIndexOf('<tr'));
}
/** Jumlah kolom di header tabel. */
function jumlahKolom(html) {
  const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
  // `<th[\s>]` — bukan `<th`, karena itu juga cocok dengan `<thead` dan
  // hitungannya jadi kelebihan satu. Pemeriksaan yang salah menghitung lebih
  // buruk daripada tidak ada: ia melaporkan colSpan yang benar sebagai salah.
  return (thead.match(/<th[\s>]/g) || []).length;
}

/**
 * Satu baris `<tr>` yang memuat teks tertentu.
 *
 * Perlu, karena `colSpan` yang benar bisa muncul di baris LAIN di tabel yang
 * sama. Memeriksa `html.includes('colSpan="6"')` pada seluruh tabel karena itu
 * selalu lolos — termasuk saat baris yang diperiksa colSpan-nya salah. Sudah
 * dibuktikan: mengubah colSpan baris "Belum ada bahan" jadi 3 tidak ketahuan
 * sampai pemeriksaannya dipersempit ke barisnya sendiri.
 */
function barisDengan(html, teks) {
  const i = html.indexOf(teks);
  if (i < 0) return '';
  const mulai = html.lastIndexOf('<tr', i);
  const akhir = html.indexOf('</tr>', i);
  return mulai < 0 || akhir < 0 ? '' : html.slice(mulai, akhir);
}

// -- Tabel warna
const kolomWarna = jumlahKolom(tabelWarna);
barisTerakhir(tabelWarna).includes('Tambah Warna')
  ? ok('"Tambah Warna" adalah baris TERAKHIR di dalam tabel warna')
  : salah('letak "Tambah Warna"', 'bukan baris terakhir tabel');

// Tombolnya harus DI DALAM tabel, bukan di atasnya.
tabelWarna.indexOf('Tambah Warna') < tabelWarna.indexOf('</table>')
  ? ok('"Tambah Warna" ada di dalam <table>, bukan di atasnya')
  : salah('"Tambah Warna"', 'berada di luar tabel');

// colSpan harus selebar tabelnya, kalau tidak barisnya tampak menggantung.
// Diperiksa pada BARIS-nya, bukan pada seluruh tabel: angka yang benar juga
// dipakai baris tambah di tabel yang sama, jadi pemeriksaan tingkat tabel akan
// selalu lolos meski baris ini colSpan-nya salah.
barisDengan(tabelWarna, 'Tambah Warna').includes(`colSpan="${kolomWarna}"`)
  ? ok(`colSpan baris tambah warna = ${kolomWarna} (selebar tabelnya)`)
  : salah('colSpan baris tambah warna', `tidak cocok dengan ${kolomWarna} kolom`);

// Tidak ada tombol tambah yang tersisa di luar tabel.
const sebelumTabelWarna = tabelWarna.slice(0, tabelWarna.indexOf('<table'));
!sebelumTabelWarna.includes('Tambah Warna')
  ? ok('tidak ada tombol tambah yang tertinggal di atas tabel warna')
  : salah('tombol di atas tabel warna', 'masih ada');

// -- Tabel bahan
//
// Pemilik minta kain dan aksesori TIDAK lagi dua daftar dengan dua tombol
// tambah: cukup satu tombol "Tambah Material", jenisnya dipilih di barisnya.
// Jadi yang diperiksa di sini justru sebaliknya dari sebelumnya — bahwa tombol
// "Tambah Kain"/"Tambah Aksesori" benar-benar SUDAH TIDAK ADA.
const kolomBahan = jumlahKolom(tabelBahan);

barisTerakhir(tabelBahan).includes('Tambah Material')
  ? ok('"Tambah Material" adalah baris TERAKHIR di dalam tabel bahan')
  : salah('letak "Tambah Material"', 'bukan baris terakhir tabel');

tabelBahan.indexOf('Tambah Material') < tabelBahan.indexOf('</table>')
  ? ok('"Tambah Material" ada di dalam <table>, bukan di atasnya')
  : salah('"Tambah Material"', 'berada di luar tabel');

// Satu tombol tambah saja — bukan dua baris tombol seperti sebelumnya.
const barisTambahBahan = (
  tabelBahan.match(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?Tambah Material(?:(?!<\/tr>)[\s\S])*?<\/tr>/g) ||
  []
);
barisTambahBahan.length === 1
  ? ok('tepat satu baris tombol tambah bahan')
  : salah('baris tombol tambah bahan', `dapat ${barisTambahBahan.length} baris, harus 1`);

// Kalau salah satu tombol lama masih tertinggal, daftarnya kembali terbelah.
for (const lama of ['Tambah Kain', 'Tambah Aksesori']) {
  !tabelBahan.includes(lama)
    ? ok(`tombol lama "${lama}" sudah tidak ada`)
    : salah(`tombol lama "${lama}"`, 'masih ada — kain dan aksesori kembali terpisah');
}

barisDengan(tabelBahan, 'Tambah Material').includes(`colSpan="${kolomBahan}"`)
  ? ok(`colSpan baris tambah bahan = ${kolomBahan} (selebar tabelnya)`)
  : salah('colSpan baris tambah bahan', `tidak cocok dengan ${kolomBahan} kolom`);

// Keadaan kosong: pesannya harus muncul, dan colSpan-nya selebar tabel juga.
// Baris "Belum ada bahan" mudah tertinggal saat jumlah kolom berubah, karena
// ia tidak terlihat pada data contoh yang selalu terisi.
tabelBahanKosong.includes('Belum ada bahan')
  ? ok('tabel bahan kosong menampilkan keterangan, bukan tabel tanpa baris')
  : salah('keterangan bahan kosong', 'tidak ditemukan');

barisDengan(tabelBahanKosong, 'Belum ada bahan').includes(
  `colSpan="${jumlahKolom(tabelBahanKosong)}"`
)
  ? ok(`colSpan baris "Belum ada bahan" = ${jumlahKolom(tabelBahanKosong)} (selebar tabelnya)`)
  : salah('colSpan baris kosong', 'tidak cocok dengan jumlah kolomnya');

// Tombol tambah tetap ada saat kosong — kalau ikut hilang, tabel kosong jadi
// jalan buntu tanpa cara mengisinya.
tabelBahanKosong.includes('Tambah Material')
  ? ok('tombol "Tambah Material" tetap ada saat tabel kosong')
  : salah('tombol tambah saat kosong', 'hilang — tabel kosong jadi jalan buntu');

// Kolom jenis harus ada di barisnya, bukan cuma di header.
tabelBahan.includes('Jenis bahan')
  ? ok('tiap baris bahan punya pemilih jenis')
  : salah('pemilih jenis per baris', 'tidak ditemukan');

// Nilai mentah tidak boleh tampil: base-ui menampilkan `kain` apa adanya kalau
// SelectValue tidak memakai function child, dan itu huruf kecil semua.
tabelBahan.includes('>Kain<') && tabelBahan.includes('>Aksesori<')
  ? ok('jenis ditampilkan sebagai label ("Kain"/"Aksesori"), bukan nilai mentah')
  : salah('label jenis bahan', 'nilai mentahnya yang tampil, bukan labelnya');

// Baris yang sudah ada tetap di ATAS baris tambah — kalau terbalik, baris baru
// menyelip di atas data lama dan urutannya jadi sulit dibaca.
tabelWarna.indexOf('aria-label="Nama warna"') < tabelWarna.indexOf('Tambah Warna')
  ? ok('baris data warna tetap di atas baris tambah')
  : salah('urutan baris warna', 'baris tambah mendahului baris data');

tabelBahan.indexOf('aria-label="Nama bahan"') < tabelBahan.indexOf('Tambah Material')
  ? ok('baris data bahan tetap di atas baris tambah')
  : salah('urutan baris bahan', 'baris tambah mendahului baris data');

// -- Percabangan jenis bahan
//
// Yang paling penting di bagian ini: baris kain TIDAK boleh jadi aksesori.
// Salah cabang tidak memunculkan error apa pun — di Prepare barisnya cuma
// muncul "All variations" dengan satu stok untuk semua warna.
const { kain: kainHasil, aksesori: aksHasil } = bahanTerpisah;

kainHasil.length === 1 && kainHasil[0].nama === 'Kain Rayon'
  ? ok('baris kain jadi kain, bukan aksesori')
  : salah('pemisahan kain', `${kainHasil.length} kain: ${kainHasil.map((k) => k.nama).join(', ')}`);

aksHasil.length === 1 && aksHasil[0].nama === 'Label Brand'
  ? ok('baris aksesori jadi aksesori, bukan kain')
  : salah('pemisahan aksesori', `${aksHasil.length} aksesori`);

// Kain harus punya angka PER WARNA — itu bedanya dengan aksesori, dan alasan
// kedua daftar ini tidak boleh disamakan begitu saja.
const perWarnaKain = kainHasil[0]?.perWarna ?? {};
Object.keys(perWarnaKain).length === barisWarnaContoh.length
  ? ok(`kain dihitung per warna (${Object.keys(perWarnaKain).length} warna)`)
  : salah(
      'kain per warna',
      `dapat ${Object.keys(perWarnaKain).length} warna, harus ${barisWarnaContoh.length}`
    );

aksHasil[0]?.berlaku === 'All variations'
  ? ok('aksesori berlaku untuk semua varian')
  : salah('cakupan aksesori', `dapat "${aksHasil[0]?.berlaku}"`);

// Baris setengah terisi dilewati, bukan dianggap nol.
kainHasil.length === 1 && aksHasil.length === 1
  ? ok('baris tanpa nama / tanpa qty tidak ikut jadi baris BOM')
  : salah(
      'baris setengah terisi',
      `${kainHasil.length} kain + ${aksHasil.length} aksesori, harus 1 + 1`
    );

// ===== 5. Angka turunan =====

console.log('\n== Angka turunan (dihitung ulang dari data) ==');

// Angka yang sudah disebut owner di mockup — kalau ini bergeser, mockup dan
// papan tidak lagi sejalan. Allure Dress ada di papan White Label, bukan
// Production, jadi daftarnya dipisah.
const patokanProduksi = [
  ['Elodie Top', 145, 6],
  ['Rhea Top', 210, 6],
  ['Sora Top', 145, 6],
  ['Noir Pants', 360, 8],
  ['Midi Dress', 120, 5],
  ['Aluna Top', 180, 7],
];

const patokanWL = [['Allure Dress', 180, 7]];

for (const [nama, pcsHarus, varianHarus] of [...patokanProduksi, ...patokanWL]) {
  const k = fakta.find((x) => x.nama === nama) ?? faktaWL.find((x) => x.nama === nama);
  if (!k) {
    salah(`kartu "${nama}"`, 'tidak ada di data');
    continue;
  }
  k.pcs === pcsHarus
    ? ok(`${nama}: ${k.pcs} pcs`)
    : salah(`${nama} plan qty`, `dapat ${k.pcs}, harus ${pcsHarus}`);
  k.varian === varianHarus
    ? ok(`${nama}: ${k.varian} baris varian`)
    : salah(`${nama} jumlah varian`, `dapat ${k.varian}, harus ${varianHarus}`);
}

// Badge harus cocok dengan isi BOM: bertanda "Ready" berarti tidak ada satu pun
// baris bahan yang kurang. Ini yang mencegah kartu bertanda hijau padahal
// bahannya belum cukup. Diperiksa untuk KEDUA papan — papan White Label sempat
// salah karena stoknya kurang semua, dan itu lolos dari pemeriksaan manual.
let tidakKonsisten = 0;
for (const k of [...fakta, ...faktaWL]) {
  if (k.adaKurang !== (k.badge !== null)) {
    tidakKonsisten++;
    salah(`badge "${k.nama}"`, `BOM kurang=${k.adaKurang} tapi badge=${k.badge}`);
  }
}
tidakKonsisten === 0
  ? ok(`badge cocok dengan BOM untuk ${fakta.length + faktaWL.length} kartu (dua papan)`)
  : salah('konsistensi badge', `${tidakKonsisten} kartu tidak cocok`);

// Kekurangan yang ditampilkan harus yang TERBESAR, bukan yang pertama.
const badgeElodie = fakta.find((k) => k.nama === 'Elodie Top')?.badge;
badgeElodie === 'Short 19.28 m'
  ? ok('badge Elodie Top = kekurangan terbesar (19.28 m), bukan yang pertama')
  : salah('badge Elodie Top', `dapat "${badgeElodie}", harus "Short 19.28 m"`);

// "Qty / Pcs" harus angka yang benar-benar dipakai menghitung — bukan yang
// sudah dibulatkan. Kalau 0.756 tampil sebagai 0.76, pembaca yang mengalikan
// sendiri akan dapat angka berbeda dari kolom Total Need.
const karet = fakta.find((k) => k.nama === 'Elodie Top');
karet?.perPcsKaret === '0.756 m'
  ? ok('kolom "Qty / Pcs" menampilkan 0.756 m (angka yang dipakai menghitung)')
  : salah('presisi Qty / Pcs', `dapat "${karet?.perPcsKaret}", harus "0.756 m"`);
karet?.totalKaret === '109.62 m'
  ? ok('Total Need Karet Pinggang = 109.62 m (145 x 0.756)')
  : salah('Total Need Karet Pinggang', `dapat "${karet?.totalKaret}", harus "109.62 m"`);

// ===== 6. Alur pindah stage =====

console.log('\n== Alur pindah stage ==');

// Kunci baris harus stabil dan unik — kalau dua baris punya kunci sama,
// mencentang satu ikut mencentang yang lain.
const unik = new Set(alur.kunciElodie);
unik.size === alur.kunciElodie.length
  ? ok(`kunci ${alur.kunciElodie.length} baris bahan unik`)
  : salah('kunci bahan', `${alur.kunciElodie.length} baris tapi cuma ${unik.size} kunci unik`);

// Kunci harus melekat pada ISINYA, bukan nomor baris: kalau urutan BOM berubah,
// penanda yang sudah dicentang tidak boleh menempel ke baris lain.
const kainPleats = alur.kunciElodie.find((k) => k.startsWith('Kain Pleats|Black|Color Black'));
kainPleats === 'Kain Pleats|Black|Color Black'
  ? ok('kunci baris memuat material, varian, dan cakupannya')
  : salah('bentuk kunci baris', `dapat "${kainPleats}"`);

// Baris kembar harus tetap dapat kunci masing-masing.
//
// Pemeriksaan di atas memakai kartu Elodie, yang kebetulan TIDAK punya baris
// bernama sama — jadi ia lulus walau kuncinya kembali bertabrakan, dan itulah
// bug aslinya: dua baris kain bernama sama (kain utama + furing) berbagi satu
// kunci, sehingga satu centang di Prepare menandai keduanya dan gate-nya
// terbuka sebelum bahannya benar-benar diperiksa. Kartu di bawah sengaja punya
// dua baris yang teksnya persis sama.
alur.kunciKembar.unik === alur.kunciKembar.kunci.length
  ? ok(`dua baris bahan berteks sama tetap dapat kunci berbeda (${alur.kunciKembar.unik} kunci)`)
  : salah(
      'kunci bahan kembar',
      `${alur.kunciKembar.kunci.length} baris tapi cuma ${alur.kunciKembar.unik} kunci: ${alur.kunciKembar.kunci.join(' , ')}`
    );

// Gate: belum dicentang -> belum lengkap; separuh -> belum lengkap;
// semua dicentang -> lengkap.
alur.ringkasKosong.lengkap === false && alur.ringkasKosong.siap === 0
  ? ok('belum ada centang -> belum lengkap')
  : salah('ringkasan kosong', `siap=${alur.ringkasKosong.siap} lengkap=${alur.ringkasKosong.lengkap}`);

alur.ringkasSeparuh.lengkap === false && alur.ringkasSeparuh.siap === 2
  ? ok('2 dari ' + alur.ringkasSeparuh.total + ' baris -> belum lengkap (tombol masih mati)')
  : salah('ringkasan separuh', `siap=${alur.ringkasSeparuh.siap} lengkap=${alur.ringkasSeparuh.lengkap}`);

alur.ringkasPenuh.lengkap === true && alur.ringkasPenuh.siap === alur.ringkasPenuh.total
  ? ok(`semua ${alur.ringkasPenuh.total} baris dicentang -> lengkap (tombol hidup)`)
  : salah('ringkasan penuh', `siap=${alur.ringkasPenuh.siap} lengkap=${alur.ringkasPenuh.lengkap}`);

// Baris yang stoknya kurang TETAP boleh dicentang. Kalau tidak, kartu yang
// bahannya belum cukup tidak akan pernah bisa masuk Cutting — justru kartu
// yang paling perlu dibelikan bahannya.
const karetElodie = alur.kunciElodie.find((k) => k.startsWith('Karet Pinggang'));
karetElodie
  ? ok('baris yang stoknya kurang tetap punya kunci (boleh dicentang)')
  : salah('baris kurang', 'tidak punya kunci — gate-nya jadi mustahil dipenuhi');

// Kartu yang belum disentuh tetap di stage bawaannya.
alur.stageBawaan === 'propose'
  ? ok('kartu yang belum dipindah tetap di Propose')
  : salah('stage bawaan', `dapat "${alur.stageBawaan}"`);

// Kartu yang sudah di-approve: pindahnya menang atas stage bawaan.
alur.stageDariPeta === 'cutting'
  ? ok('peta perpindahan menang atas stage bawaan kartu')
  : salah('peta perpindahan', `dapat "${alur.stageDariPeta}"`);

// Kartu hasil form belum ada di daftar — ditaruh di kolom setelah Propose di
// papan ITU, bukan di 'prepare' yang ditulis tetap.
alur.stageKartuBaru === 'prepare'
  ? ok('kartu yang tidak ada di daftar default-nya Prepare (papan Production)')
  : salah('stage kartu baru', `dapat "${alur.stageKartuBaru}"`);

// Papan White Label tidak punya Prepare. Kartu yang tidak ada di daftar di
// papan itu harus mendarat di Invoice Logistic — kalau tidak, ia lenyap dari
// papan tanpa error apa pun.
alur.stageKartuBaruWL === 'invoice-logistic'
  ? ok('kartu baru di papan White Label mendarat di Invoice Logistic, bukan Prepare')
  : salah('stage kartu baru WL', `dapat "${alur.stageKartuBaruWL}"`);

alur.stageApproveWL === 'invoice-logistic'
  ? ok('approve di papan White Label memindahkan kartu ke Invoice Logistic')
  : salah('approve White Label', `dapat "${alur.stageApproveWL}"`);

// Penjagaan terhadap perpindahan ke kolom yang tidak ada di papan ini:
// misalnya catatan lama berisi 'prepare' di papan White Label. Kartu TIDAK
// boleh lenyap — ia jatuh kembali ke stage-nya sendiri yang masih sah.
alur.stageTujuanHantu === 'propose'
  ? ok('perpindahan ke kolom yang tidak ada di papan diabaikan, kartu tetap tampil')
  : salah('tujuan hantu', `dapat "${alur.stageTujuanHantu}", harus "propose"`);

// Dan kalau stage kartunya SENDIRI tidak ada di papan — persis yang terjadi
// pada kartu White Label ber-stage 'prepare' saat Prepare dihapus — kartunya
// ditaruh di kolom setelah Propose, bukan dibiarkan lenyap dari papan.
alur.stageBawaanHantu === 'invoice-logistic'
  ? ok('kartu ber-stage tak dikenal di papan itu tidak lenyap')
  : salah('stage bawaan hantu', `dapat "${alur.stageBawaanHantu}", harus "invoice-logistic"`);

// Tujuan approve diambil dari urutan kolom tiap papan.
alur.tujuanApproveProduksi === 'prepare' && alur.tujuanApproveWL === 'invoice-logistic'
  ? ok('tujuan approve mengikuti kolom berikutnya di papan masing-masing')
  : salah(
      'tujuan approve',
      `Production="${alur.tujuanApproveProduksi}", White Label="${alur.tujuanApproveWL}"`
    );

// Kolom terakhir tidak punya tujuan — tombol lanjut di sana harus mati, bukan
// memindahkan kartu ke kolom yang tidak ada.
alur.tujuanSetelahTerakhir === null
  ? ok('kolom terakhir tidak punya tujuan lanjut')
  : salah('tujuan kolom terakhir', `dapat "${alur.tujuanSetelahTerakhir}"`);

// Kartu dari form lahir di Propose (belum disetujui) dengan workcode berpola.
alur.kartuDariForm.stage === 'propose'
  ? ok('kartu dari form "Tambah Produksi" lahir di Propose')
  : salah('stage kartu form', `dapat "${alur.kartuDariForm.stage}", harus "propose"`);
alur.kartuDariForm.workcode === 'PDFF_CSC-DRS-31_B-04_PRDN'
  ? ok('workcode kartu baru mengikuti pola kartu contoh')
  : salah('workcode kartu baru', `dapat "${alur.kartuDariForm.workcode}"`);

// Akhiran workcode milik PAPAN, bukan ditulis tetap di dalam `kartuBaru()`.
// Kalau ditulis tetap, usulan dari papan White Label berakhiran `_PRDN` dan
// langsung terlihat berbeda dari delapan kartu contoh di sebelahnya — di layar
// yang justru paling diperhatikan owner.
alur.kartuFormWL.workcode === 'PDFF_CSC-DRS-31_B-04_WHLB'
  ? ok('workcode kartu baru di papan White Label berakhiran _WHLB')
  : salah('workcode kartu White Label', `dapat "${alur.kartuFormWL.workcode}"`);

// Stok yang belum dicatat TIDAK boleh jadi merah. Diperiksa pada baris kain
// (satu angka menular ke SEMUA warna lewat `perWarna`) DAN pada aksesori.
//
// Tiga baris, bukan dua: `KARTU_BARU.warna` berisi dua warna, dan satu baris
// kain menjadi satu baris BOM PER WARNA — itulah sebabnya stok kain yang salah
// menular ke seluruh warna sekaligus.
const tanpaStokKurang = alur.bahanTanpaStok.filter((b) => b.status === 'kurang');
tanpaStokKurang.length === 0 && alur.bahanTanpaStok.length === 3
  ? ok('stok yang belum dicatat tidak dianggap kurang (2 warna kain + aksesori)')
  : salah(
      'stok belum dicatat',
      tanpaStokKurang.length
        ? `${tanpaStokKurang.length} baris ditandai kurang: ${tanpaStokKurang.map((b) => b.material).join(', ')}`
        : `dapat ${alur.bahanTanpaStok.length} baris, harus 3 — barisnya tidak boleh ikut hilang`
    );

alur.bahanTanpaStok.every((b) => b.fifo === 'Belum dicatat')
  ? ok('kolom FIFO Sum menulis "Belum dicatat", bukan "0"')
  : salah(
      'kolom FIFO stok kosong',
      `dapat "${alur.bahanTanpaStok.map((b) => b.fifo).join('", "')}"`
    );

// Dan sebaliknya: stok yang JELAS nol tetap merah. "Belum dicatat" harus jadi
// pembeda yang nyata, bukan cara menyembunyikan kekurangan.
alur.bahanStokNol.length === 1 && alur.bahanStokNol[0].status === 'kurang'
  ? ok('stok yang benar-benar 0 tetap ditandai kurang')
  : salah('stok nol', 'baris dengan tersedia: 0 tidak ditandai kurang');

// Dua warna berbeda tidak boleh mendapat kode yang sama: kode itu KUNCI
// `perWarna`, jadi kode kembar membuat satu warna menimpa warna lain — jumlah
// baris BOM di papan diam-diam berkurang, tanpa error di mana pun.
const kode = alur.kodeBentrok;
kode.pertama === 'BLA' && kode.kedua !== 'BLA' && kode.kedua.startsWith('BLA')
  ? ok(`kode warna kembar diperpanjang dari namanya ("${kode.pertama}" lalu "${kode.kedua}")`)
  : salah('kode warna kembar', `dapat "${kode.pertama}" dan "${kode.kedua}"`);

kode.kembar1 !== kode.kembar2
  ? ok(`nama yang hurufnya habis tetap dapat kode berbeda ("${kode.kembar1}" dan "${kode.kembar2}")`)
  : salah('kode untuk nama identik', `keduanya dapat "${kode.kembar1}"`);

// Label yang belum dicatat dilewati, bukan dianggap nol. Kalau dianggap nol,
// kartu baru — yang memang belum punya catatan label — selalu bertanda merah.
const kartuFormKurang = bahanKartu(alur.kartuDariForm).filter((b) => b.status === 'kurang');
kartuFormKurang.length === 1 && kartuFormKurang[0].material === 'Karet Pinggang'
  ? ok('kartu baru: hanya baris yang benar-benar kurang yang ditandai')
  : salah(
      'kartu baru',
      `dapat ${kartuFormKurang.length} baris kurang: ${kartuFormKurang.map((b) => b.material).join(', ')}`
    );

// ===== 7. Pemisahan halaman: papan vs tabel =====
//
// Papan kanban dipindah keluar dari halaman tabel 40 kolom, dan menunya
// dipindah dari section "Master Data" ke section baru "Progress". Yang
// diperiksa di sini bukan tampilan papannya — itu sudah diperiksa di bagian 1
// — melainkan bahwa PEMISAHANNYA benar-benar terjadi di kedua arah:
//
//   - halaman papan TIDAK lagi membawa tabel 40 kolom
//   - halaman tabel TIDAK lagi membawa papan
//   - tidak ada satu pun dari keduanya yang memuat keduanya (kalau iya,
//     keduanya cuma salinan halaman lama di dua URL)
//
// Cara memeriksanya sengaja lewat `App` + rute, bukan lewat komponennya: yang
// paling mudah salah di perubahan seperti ini adalah pemetaan rute — dan salah
// petakan rute tidak memunculkan error apa pun, hanya satu halaman yang tidak
// bisa dibuka.

console.log('\n== Pemisahan halaman: papan vs tabel ==');

// Penanda khas masing-masing tampilan. Dipilih yang benar-benar hanya ada di
// satu tempat: `data-slot="kanban-column"` cuma lahir dari papan, dan
// "Workcode PDFF" cuma jadi header kolom di tabel 40 kolom itu.
const penandaPapan = 'data-slot="kanban-column"';
const penandaTabel = 'Workcode PDFF';

const papanPunyaPapan = halPapan.includes(penandaPapan);
const papanPunyaTabel = halPapan.includes(penandaTabel);
const tabelPunyaTabel = halTabel.includes(penandaTabel);
const tabelPunyaPapan = halTabel.includes(penandaPapan);

papanPunyaPapan
  ? ok('halaman papan memuat papannya')
  : salah('halaman papan', 'kolom kanban tidak ter-render di rutenya');

!papanPunyaTabel
  ? ok('halaman papan TIDAK memuat tabel 40 kolom')
  : salah('tabel di halaman papan', 'masih ada — pemisahannya belum terjadi');

tabelPunyaTabel
  ? ok('halaman tabel memuat tabelnya')
  : salah('halaman tabel', 'kolom tabel tidak ter-render di rutenya');

!tabelPunyaPapan
  ? ok('halaman tabel TIDAK memuat papan kanban')
  : salah('papan di halaman tabel', 'masih ada — pemisahannya belum terjadi');

// Dua halaman berbeda, bukan satu halaman yang dirender dua kali.
//
// Dibandingkan ISI HALAMANNYA, bukan markup utuh. Markup utuh selalu berbeda
// antar rute — sidebar dan breadcrumb ikut ter-render di keduanya, dan keduanya
// berubah mengikuti path — jadi membandingkan yang utuh akan lulus walaupun
// isi halamannya identik. Sudah kejadian: mutasi yang menunjuk kedua rute ke
// komponen yang sama tidak membuat pemeriksaan ini gagal. Pemeriksaan yang lulus
// tanpa mengukur apa pun lebih buruk daripada tidak ada, karena ia memberi
// keyakinan palsu pada tepat perubahan yang paling mudah salah.
const isiHalaman = (html) => {
  const mulai = html.indexOf('<main');
  const akhir = html.lastIndexOf('</main>');
  return mulai >= 0 && akhir > mulai ? html.slice(mulai, akhir) : '';
};
const isiPapan = isiHalaman(halPapan);
const isiTabel = isiHalaman(halTabel);

isiPapan && isiTabel && isiPapan !== isiTabel
  ? ok('kedua rute menghasilkan halaman yang berbeda')
  : salah(
      'dua rute',
      isiPapan && isiTabel
        ? 'isi halamannya identik — kemungkinan keduanya menunjuk halaman yang sama'
        : 'wilayah <main> tidak ditemukan di salah satu halaman'
    );

// Saklar "Kanban / Tabel" ikut hilang bersama pemisahannya. Kalau tertinggal,
// ia jadi tombol yang tidak memindahkan apa pun di halaman papan (tampilannya
// sudah kanban) dan tombol yang tidak memindahkan apa pun di halaman tabel.
//
// Yang diperiksa LABEL tombolnya, bukan `aria-pressed`: saklar Production /
// White Label di halaman papan memang memakai `aria-pressed` dan harus tetap
// ada — memeriksa atributnya akan menuduh yang salah.
for (const [nama, html] of [
  ['papan', halPapan],
  ['tabel', halTabel],
]) {
  !html.includes('>Kanban<') && !html.includes('>Tabel<')
    ? ok(`halaman ${nama} tidak lagi punya saklar Kanban/Tabel`)
    : salah(`saklar Kanban/Tabel di halaman ${nama}`, 'masih ada');
}

// Saklar papan (Production / White Label) harus TETAP ada di halaman papan —
// itu satu-satunya cara membuka papan White Label sekarang.
halPapan.includes('>White Label<')
  ? ok('halaman papan masih punya saklar Production / White Label')
  : salah('saklar sumber papan', 'hilang — papan White Label jadi tidak bisa dibuka');

// Banner menyebut bentuk yang benar. Papan tidak punya "urutan kolom dan lebar
// tabel" untuk dinilai, jadi kalimat tabel di sana menyesatkan.
halPapan.includes('Papan Production Fulfillment')
  ? ok('banner di halaman papan menyebut "Papan", bukan "Tabel"')
  : salah('banner halaman papan', 'masih menyebut tabel');

halTabel.includes('Tabel Production Fulfillment')
  ? ok('banner di halaman tabel menyebut "Tabel"')
  : salah('banner halaman tabel', 'tidak menyebut tabel');

// -- Menu sidebar: papan pindah section, tabel tidak ikut pindah
//
// Dipersempit ke wilayah <nav> sidebar dan ke breadcrumb, bukan mencari di
// seluruh halaman. Sudah dibuktikan perlu: kata "Progress" juga muncul di
// breadcrumb, jadi pemeriksaan tingkat halaman lulus walau judul section di
// sidebar hilang — persis pemeriksaan yang tidak memeriksa apa pun.
//
// Kalau pemotongannya gagal, `nav`/`crumbs` jadi string kosong dan SEMUA
// pemeriksaan di bawah gagal. Itu memang yang diinginkan: lebih baik berisik
// daripada lulus karena tidak menemukan apa-apa.
const nav = halPapan.slice(halPapan.indexOf('<nav'), halPapan.indexOf('</nav>'));
const crumbs = halPapan.slice(
  halPapan.indexOf('data-slot="breadcrumb-list"'),
  halPapan.indexOf('</ol>')
);

const judulProgress = nav.indexOf('Progress');
const judulMaster = nav.indexOf('Master Data');

judulProgress > 0
  ? ok('sidebar punya section "Progress"')
  : salah('section Progress', 'tidak ditemukan di sidebar');

judulProgress > judulMaster && judulMaster > 0
  ? ok('section Progress berada setelah Master Data')
  : salah('urutan section', 'Progress muncul sebelum Master Data atau tidak ada');

// Menu papan: path-nya yang menandai, bukan labelnya (label kedua menu sama).
const menuPapan = '/modul/production-fulfillment"';
const menuTabel = '/modul/production-fulfillment-table"';
const posisiPapan = nav.indexOf(menuPapan);
const posisiTabel = nav.indexOf(menuTabel);

// `judulProgress > 0` diulang di tiap syarat, bukan dicek sekali di atas.
// Tanpa itu, judul section yang hilang membuat indexOf mengembalikan -1 dan
// `posisiPapan > judulProgress` jadi benar untuk alasan yang salah — pemeriksaan
// yang lulus justru saat yang diperiksanya tidak ada.
judulProgress > 0 && posisiPapan > judulProgress
  ? ok('menu papan berada di section Progress')
  : salah('menu papan', 'tidak berada setelah judul section Progress');

judulProgress > 0 && posisiTabel > 0 && posisiTabel < judulProgress
  ? ok('menu tabel tetap di Master Data, tidak ikut pindah')
  : salah('menu tabel', 'ikut pindah ke Progress atau hilang dari sidebar');

// Dua entri sidebar untuk halaman yang berbeda — kalau salah satu path tertulis
// keliru, salah satu menu akan membuka halaman yang sama dengan yang lain.
posisiPapan > 0 && posisiTabel > 0
  ? ok('kedua menu punya path berbeda (papan dan tabel)')
  : salah('path menu', `papan=${posisiPapan}, tabel=${posisiTabel}`);

// Breadcrumb mengikuti `section` pada item menu — sumber yang BERBEDA dari
// judul section di sidebar. Kalau keduanya tidak lagi sejalan, breadcrumb
// menyebut induk yang tidak ada di sidebar, dan itu terbaca sebagai "saya
// sedang di mana".
crumbs.includes('Progress')
  ? ok('breadcrumb halaman papan menyebut section-nya')
  : salah('breadcrumb papan', 'tidak menyebut Progress');

// Urutan breadcrumb: induk dulu, baru halamannya.
const crumbProgress = crumbs.indexOf('Progress');
const crumbHalaman = crumbs.indexOf('Production Fulfillment');
crumbProgress >= 0 && crumbHalaman > crumbProgress
  ? ok('breadcrumb menaruh section sebelum nama halaman')
  : salah('urutan breadcrumb', `Progress=${crumbProgress}, halaman=${crumbHalaman}`);

// ===== Register Produk =====

console.log('\n== Register Produk: section, daftar POS, dan pengisian otomatis ==');

// -- Section REGISTER di sidebar, di antara Master Data dan Progress
//
// Dipersempit ke wilayah <nav>, sama seperti pemeriksaan section di atas:
// kata "Register" juga muncul di banner halaman dan di judul produk, jadi
// mencari di seluruh halaman akan lulus walau sectionnya tidak ada.
const navRegister = halRegister.slice(
  halRegister.indexOf('<nav'),
  halRegister.indexOf('</nav>')
);
const posisiRegister = navRegister.indexOf('Register');
const posisiMasterR = navRegister.indexOf('Master Data');
const posisiProgressR = navRegister.indexOf('Progress');
const posisiMenuRegister = navRegister.indexOf('/modul/register-produk"');

posisiRegister > 0
  ? ok('sidebar punya section "Register"')
  : salah('section Register', 'tidak ditemukan di sidebar');

// Urutannya Master Data → Register → Progress, sesuai permintaan owner.
// Ketiganya diperiksa sekaligus: satu perbandingan saja akan lulus walaupun
// section ketiga hilang, karena `-1` membuat perbandingan apa pun jadi benar.
posisiMasterR > 0 && posisiRegister > posisiMasterR && posisiProgressR > posisiRegister
  ? ok('section Register berada di antara Master Data dan Progress')
  : salah(
      'urutan section',
      `Master Data=${posisiMasterR}, Register=${posisiRegister}, Progress=${posisiProgressR}`
    );

posisiMenuRegister > posisiRegister && posisiRegister > 0
  ? ok('menu Register Produk berada di section Register')
  : salah('menu Register Produk', 'tidak berada setelah judul section Register');

// -- Halaman Register benar-benar halaman Register, bukan halaman lain
const isiRegister = (() => {
  const mulai = halRegister.indexOf('<main');
  const akhir = halRegister.lastIndexOf('</main>');
  return mulai >= 0 && akhir > mulai ? halRegister.slice(mulai, akhir) : '';
})();

isiRegister.includes('Register Produk') && isiRegister.includes('Total stock')
  ? ok('halaman Register memuat daftar produknya')
  : salah('halaman Register', 'tabelnya tidak ter-render di rutenya');

!isiRegister.includes('Production Fulfillment') && isiRegister.length > 0
  ? ok('halaman Register bukan halaman lain')
  : salah('isi halaman Register', 'memuat isi halaman lain');

// Tab "Products" ADA, tab "Variant" TIDAK — owner memilih satu tab saja.
isiRegister.includes('>Products<')
  ? ok('halaman Register punya tab Products')
  : salah('tab Products', 'tidak ada di halaman Register');

!isiRegister.includes('>Variant<')
  ? ok('halaman Register TIDAK punya tab Variant')
  : salah('tab Variant', 'ikut dipasang padahal owner memilih Products saja');

// -- Daftar POS: satu baris per varian, dan angkanya konsisten
//
// Jumlah baris dihitung dari katalognya, bukan ditulis tetap di sini: angka
// tetap akan terus "benar" walaupun produknya ditambah, dan justru saat
// menambah produk itulah pemeriksaan ini paling berguna.
const jumlahVarianKatalog = katalogProduk.reduce(
  (s, p) =>
    s +
    PRODUK_REGISTER.find((x) => x.id === p.id).spesifikasi.warna.reduce(
      (a, w) => a + w.pcs.length,
      0
    ),
  0
);

barisPos.length === jumlahVarianKatalog
  ? ok(`daftar POS punya satu baris per varian (${barisPos.length} baris)`)
  : salah('jumlah baris POS', `dapat ${barisPos.length}, harus ${jumlahVarianKatalog}`);

// Total stok = masuk + menunggu, dan nilai sisa = total × harga. Diperiksa di
// SEMUA baris, bukan satu contoh: rumus yang benar di satu baris bisa salah di
// baris lain kalau ada cabang yang berbeda.
const stokSalah = barisPos.filter((b) => b.totalStok !== b.stokMasuk + b.menunggu);
const nilaiSalah = barisPos.filter((b) => b.nilaiSisa !== b.totalStok * b.harga);

stokSalah.length === 0
  ? ok('total stok tiap baris = stock in + waiting for')
  : salah('total stok', `${stokSalah.length} baris tidak cocok: ${stokSalah[0]?.id}`);

nilaiSalah.length === 0
  ? ok('nilai sisa tiap baris = total stok x harga')
  : salah('nilai sisa', `${nilaiSalah.length} baris tidak cocok: ${nilaiSalah[0]?.id}`);

// Stok jual tidak pernah melebihi total — kalau melebihi, ada stok yang
// terhitung dua kali.
const jualLebih = barisPos.filter((b) => b.stokJual > b.totalStok);
jualLebih.length === 0
  ? ok('stok jual tidak melebihi total stok')
  : salah('stok jual', `${jualLebih.length} baris melebihi total: ${jualLebih[0]?.id}`);

// Kode varian harus unik: dua baris berkode sama membuat satu baris menimpa
// yang lain begitu daftarnya di-key oleh kode.
const kodeUnikVarian = new Set(barisPos.map((b) => b.kodeVarian));
kodeUnikVarian.size === barisPos.length
  ? ok('kode varian unik di seluruh daftar')
  : salah('kode varian', `${barisPos.length} baris tapi cuma ${kodeUnikVarian.size} kode unik`);

// -- Pengisian otomatis form produksi
//
// Inilah inti permintaannya: memilih produk mengisi seluruh form. Yang
// diperiksa bukan "fungsinya mengembalikan sesuatu", tapi bahwa ISINYA cocok
// dengan katalognya — jumlah warna, qty per ukuran, dan daftar bahannya.
const formSalahWarna = isiForm.filter((f) => {
  const p = PRODUK_REGISTER.find((x) => x.id === f.id);
  return f.warna.length !== p.spesifikasi.warna.length;
});

formSalahWarna.length === 0
  ? ok('pengisian otomatis menyalin semua warna produk')
  : salah('warna terisi', `${formSalahWarna.length} produk jumlah warnanya tidak cocok`);

// Qty per ukuran: angka yang ada di katalog harus muncul di form, dan ukuran
// yang tidak direncanakan harus KOSONG — bukan "0". Field berisi "0" terbaca
// sebagai rencana nol pcs, padahal ukuran itu memang tidak dibuat.
const qtySalah = [];
for (const f of isiForm) {
  const p = PRODUK_REGISTER.find((x) => x.id === f.id);
  for (const w of p.spesifikasi.warna) {
    const baris = f.warna.find((x) => x.kode === w.kode);
    if (!baris) {
      qtySalah.push(`${f.nama}/${w.kode} hilang`);
      continue;
    }
    for (const ukuran of ['S', 'M', 'L', 'XL']) {
      const asli = w.pcs.find((x) => x.ukuran === ukuran)?.qty ?? 0;
      const terisi = baris.pcs[ukuran] ?? '';
      const harus = asli > 0 ? String(asli) : '';
      if (terisi !== harus) qtySalah.push(`${f.nama}/${w.kode}/${ukuran}: "${terisi}" != "${harus}"`);
    }
  }
}

qtySalah.length === 0
  ? ok('qty per ukuran tersalin apa adanya, ukuran kosong tetap kosong')
  : salah('qty terisi', qtySalah.slice(0, 3).join('; '));

// Bahan: kain dan aksesori ikut terisi, dengan jenisnya masing-masing.
const bahanSalah = isiForm.filter((f) => {
  const p = PRODUK_REGISTER.find((x) => x.id === f.id);
  const kain = f.bahan.filter((b) => b.jenis === 'kain').length;
  const aksesori = f.bahan.filter((b) => b.jenis === 'aksesori').length;
  return kain !== p.spesifikasi.kain.length || aksesori !== p.spesifikasi.aksesori.length;
});

bahanSalah.length === 0
  ? ok('pengisian otomatis menyalin bahan beserta jenisnya')
  : salah('bahan terisi', `${bahanSalah.length} produk bahannya tidak cocok`);

// Baris bahan yang terisi harus benar-benar lolos jadi baris BOM. Form
// mengabaikan baris tanpa nama atau tanpa qty, jadi pengisian otomatis yang
// menghasilkan angka tidak sah akan terlihat "terisi" di layar tapi kosong di
// kartunya — tanpa error apa pun.
const bahanJadiBom = isiForm.map((f) => {
  const p = PRODUK_REGISTER.find((x) => x.id === f.id);
  const barisWarna = p.spesifikasi.warna.map((w) => ({
    nama: w.nama,
    kode: w.kode,
    pcs: w.pcs,
  }));
  const { kain, aksesori } = pisahBahan(f.bahan, barisWarna);
  return { id: f.id, kain: kain.length, aksesori: aksesori.length };
});

const bahanHilang = bahanJadiBom.filter((b) => {
  const p = PRODUK_REGISTER.find((x) => x.id === b.id);
  return b.kain !== p.spesifikasi.kain.length || b.aksesori !== p.spesifikasi.aksesori.length;
});

bahanHilang.length === 0
  ? ok('bahan hasil pengisian otomatis lolos jadi baris BOM')
  : salah(
      'bahan jadi BOM',
      `${bahanHilang.length} produk kehilangan baris bahan saat dipisah`
    );

// -- Kategori vendor: cocok di papan yang tepat, kosong di papan yang lain
//
// Nilai yang dikembalikan harus LABEL ("Konveksi"), bukan kode ("konveksi"):
// dropdownnya menyimpan label, jadi kode yang dikembalikan membuat dropdown
// tampak kosong walaupun fungsinya "bekerja".
const produksiSalah = vendorPerPapan.filter(
  (v) => v.production !== (KATEGORI_VENDOR.production.find((o) => o.value === v.kode)?.label ?? '')
);

produksiSalah.length === 0
  ? ok('kategori vendor terisi labelnya di papan Production')
  : salah(
      'kategori vendor Production',
      `${produksiSalah[0]?.kode} -> "${produksiSalah[0]?.production}"`
    );

// Katalog Register berisi produk produksi; di papan White Label daftarnya
// berbeda, jadi TIDAK boleh ada yang terisi — nilai di luar pilihan akan
// tampil di dropdown seolah sah.
const wlTerisi = vendorPerPapan.filter((v) => v.whitelabel !== '');
wlTerisi.length === 0
  ? ok('kategori vendor produksi TIDAK dipaksa masuk ke papan White Label')
  : salah('kategori vendor White Label', `terisi "${wlTerisi[0]?.whitelabel}" padahal tidak ada di daftarnya`);

// -- Pencarian produk untuk pengisian otomatis
saranNama.length === PRODUK_REGISTER.length
  ? ok('saran nama produk berisi seluruh katalog')
  : salah('saran nama', `${saranNama.length} nama untuk ${PRODUK_REGISTER.length} produk`);

cariAda === PRODUK_REGISTER[0].id
  ? ok('nama produk yang terdaftar ditemukan')
  : salah('cari produk', `dapat "${cariAda}"`);

cariTidakAda === null
  ? ok('nama yang tidak terdaftar tidak memicu pengisian otomatis')
  : salah('cari produk asing', 'ditemukan padahal tidak ada di katalog');

// Sebagian nama pun tidak boleh cocok: pengisian di tengah pengetikan menimpa
// isian yang sudah dikerjakan pengguna.
cariSebagian === null
  ? ok('nama sebagian tidak memicu pengisian otomatis')
  : salah('cari sebagian', `"${PRODUK_REGISTER[0].nama.slice(0, 4)}" ikut cocok`);

// -- Detail produk
const detailKosong = detailPerProduk.filter((d) => d.html.length < 500);
detailKosong.length === 0
  ? ok('detail tiap produk ter-render berisi')
  : salah('detail produk', `${detailKosong.length} detail kosong: ${detailKosong[0]?.id}`);

// Isi detail harus memuat angka yang sama dengan katalognya — kalau tidak,
// yang dibaca owner di dialognya bukan data yang sama dengan yang di daftar.
//
// Yang dibandingkan KODE DESAINnya, bukan namanya: nama produk dirender di
// DialogTitle, di luar badan dialog, dan `DialogContent` memakai portal —
// portal tidak ikut ter-render di server, jadi judulnya memang tidak ada di
// markup yang diperiksa di sini. Kode desain ada DI DALAM badan dialog dan
// tetap unik per produk, jadi ia menandai "detail ini milik produk yang mana"
// sama tegasnya.
const detailSalah = detailPerProduk
  .map((d) => {
    const p = PRODUK_REGISTER.find((x) => x.id === d.id);
    const total = p.spesifikasi.warna.reduce(
      (s, w) => s + w.pcs.reduce((a, x) => a + x.qty, 0),
      0
    );
    const kurang = [];
    if (!d.html.includes(p.spesifikasi.designCode)) kurang.push(`kode ${p.spesifikasi.designCode}`);
    // Frasa utuhnya, bukan angkanya saja: angka telanjang seperti "80" cocok
    // juga di dalam "480", jadi pemeriksaan itu bisa lulus pada detail produk
    // yang salah. `renderToStaticMarkup` tidak menyisipkan penanda komentar di
    // antara teks dan nilainya, jadi frasanya utuh di markup.
    if (!d.html.includes(`total ${total} PCS`)) kurang.push(`total ${total} PCS`);
    return { id: d.id, kurang };
  })
  .filter((d) => d.kurang.length > 0);

detailSalah.length === 0
  ? ok('detail produk memuat kode desain dan total pcs yang benar')
  : salah(
      'isi detail',
      detailSalah.map((d) => `${d.id} tanpa ${d.kurang.join(' & ')}`).join('; ')
    );

// Detail harus menampilkan SELURUH warna dan bahan produknya, bukan sebagian.
const detailTidakLengkap = detailPerProduk.filter((d) => {
  const p = PRODUK_REGISTER.find((x) => x.id === d.id);
  return (
    !p.spesifikasi.warna.every((w) => d.html.includes(w.nama)) ||
    !p.spesifikasi.kain.every((k) => d.html.includes(k.nama)) ||
    !p.spesifikasi.aksesori.every((a) => d.html.includes(a.nama))
  );
});

detailTidakLengkap.length === 0
  ? ok('detail produk memuat semua warna dan bahannya')
  : salah('kelengkapan detail', `${detailTidakLengkap.length} detail tidak lengkap`);

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log(
    'LULUS — papan, popup per stage, tabel form, angka turunan, dan alur pindah stage konsisten.'
  );
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
