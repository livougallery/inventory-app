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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
import { kolomFilter } from './src/pages/RegisterProduk';
import { PRODUK_REGISTER, kartuRegister, cariProduk, namaProduk } from './src/lib/produk';
import { KATEGORI_VENDOR } from './src/lib/opsi';
import {
  KARTU_PRODUCTION, KARTU_WHITELABEL,
  PAPAN_PRODUCTION, PAPAN_WHITELABEL,
  KARTU_BARU, kartuBaru, stageKartu, stageSetelah,
  totalPcs, jumlahVarian, kekurangan, bahanKartu, kunciBahan, ringkasBahan,
  barisVarian, ringkasCutting, JENIS_BUKTI_CUTTING, JENIS_BUKTI_UPLOAD,
  jenisBuktiTahap,
} from './src/pages/production-fulfillment/data-kanban';
import {
  hppProduksi, hppWhiteLabel, gerbangHpp, cekSumberWorkcode, hargaJual,
  MARGIN_HARGA_JUAL, HARGA_FIFO, presisiFix, barisBiayaKartu, barisShipmentUntuk,
} from './src/pages/production-fulfillment/hpp';
import SeksiHppPrice, { JENIS_BUKTI_HPP } from './src/pages/production-fulfillment/SeksiHppPrice';
import { temuanKartu, labelStageAsal } from './src/pages/production-fulfillment/temuan';
import { barisContoh as barisContohHpp } from './src/pages/HppPratinjau';
import { barisContoh as barisPdffContoh, hppBaris, sellingBaris } from './src/pages/ProductionFulfillment';

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
//
// 'sumber' wajib diteruskan di sini, bukan hanya di 'popupProposeWL': mode HPP
// ditentukan papan, jadi kalau 'popupPerStage' merender stage 'hpp-price'
// tanpa 'sumber', ia hanya pernah menguji satu mode dan mode White Label-nya
// tidak pernah dieksekusi sama sekali — tepat seperti bagian yang paling prone
// salah baca saat presentasi.
// Fungsi render yang dioper ke 'IsiPopup' untuk stage 'hpp-price'. Sama dengan
// yang 'PapanFulfillment' oper, supaya routing yang diuji di sini sama dengan
// yang benar-benar dipakai di papan — bukan versi yang lebih lax yang hanya
// berfungsi di test.
//
// 'aksiLengkap' HARUS punya keempat handler bukti. 'IsiPopup' tidak mengirim
// handler-nya sendiri: ia menukar 'tambahBukti'/'hapusBukti' menjadi
// 'tambahBuktiHpp'/'hapusBuktiHpp' sebelum meneruskannya ke KotakBukti, supaya
// bukti kalkulasi tidak ikut masuk ke store yang dibaca 'ringkasCutting'.
// Kalau sepasang handler HPP tidak ada, objek itu jadi 'undefined' tanpa error
// dan KotakBukti diam-diam tidak bisa menambah bukti.
const aksiLengkap = {
  approve: () => {},
  tandaiBahan: () => {},
  lanjutStage: () => {},
  siapKartu: () => [],
  isiCutting: () => {},
  // 'aksi' (yang dipakai di 'popupPerStage') belum punya keempat handler bukti,
  // dan 'IsiPopup' meneruskan objek ini apa adanya ke KotakBukti.
  tambahBukti: () => {},
  hapusBukti: () => {},
  // Handler store HPP. Wajib ada, bukan opsional: 'IsiPopup' menukar
  // 'tambahBukti'/'hapusBukti' menjadi dua handler ini sebelum meneruskannya,
  // supaya bukti kalkulasi tidak ikut masuk ke store yang dibaca
  // 'ringkasCutting' sebagai syarat keluar dari stage Cutting. Kalau sepasang
  // handler ini tidak ada, objeknya jadi undefined tanpa error sama sekali —
  // KotakBukti lalu diam-diam tidak bisa menambah bukti, dan tidak ada yang
  // gagal karena tidak ada yang diklik.
  tambahBuktiHpp: () => {},
  hapusBuktiHpp: () => {},
  // Sepasang handler store tiga tahap akhir (tiket 5). Alasan sama persis
  // dengan HPP di atas: 'IsiPopup' menukar 'tambahBukti'/'hapusBukti' menjadi
  // dua handler ini, jadi tanpa keduanya di sini, KotakBukti di Invoice
  // Logistic / Invoice Product / Upload diam-diam tidak bisa menambah bukti.
  tambahBuktiTahap: () => {},
  hapusBuktiTahap: () => {},
  // Handler temuan (tiket 3). Sama alasannya: 'SeksiFinanceValidate' memanggil
  // 'aksi.tutupTemuan' saat tombolnya ditekan. Kalau handler-nya tidak ada di
  // sini, tombolnya tetap dirender tapi tidak menutup apa pun — dan test yang
  // cuma memeriksa markup akan hijau.
  tutupTemuan: () => {},
};

const renderHpp = (p) => <SeksiHppPrice {...p} barisHpp={barisContohHpp} />;

export const popupPerStage = Object.fromEntries(
  PAPAN_PRODUCTION.map((s) => {
    const k = kartuStage(s.id) ?? KARTU_PRODUCTION[0];
    return [s.id, renderToStaticMarkup(
      <IsiPopup
        kartu={k}
        stage={s}
        stageBerikutnya={setelah(PAPAN_PRODUCTION, s.id)}
        sumber="production"
        siapBahan={{}}
        aksi={aksiLengkap}
        renderHpp={renderHpp}
      />
    )];
  })
);

// Popup HPP & Price di papan WHITE LABEL — mode kedua, yang punya rumus
// berbeda. Tanpa ini, "dua mode" hanya bisa dibuktikan dari kode, bukan dari
// markup yang benar-benar dirender.
export const popupHppWl = renderToStaticMarkup(
  <IsiPopup
    kartu={KARTU_WHITELABEL.find((k) => k.stage === 'hpp-price')}
    stage={PAPAN_WHITELABEL.find((s) => s.id === 'hpp-price')}
    stageBerikutnya={setelah(PAPAN_WHITELABEL, 'hpp-price')}
    adaPrepare={false}
    sumber="whitelabel"
    siapBahan={{}}
    aksi={aksiLengkap}
    renderHpp={renderHpp}
  />
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
    sumber="whitelabel"
    siapBahan={{}}
    aksi={aksi}
  />
);

// ===== Routing HPP: bukti per kartu, terkunci, tujuan =====
//
// Tiga render di sini menutup tiga jalur yang tidak bisa ditutup oleh render
// hpp-price di atas, karena semuanya kosong di sana.
//
// 1. BUKTI. Semua render lain memakai store bukti kosong, jadi 'buktiHpp[kartu.id]'
//    tidak pernah membaca apa pun — dan salah memberi indeks kartu akan tetap
//    hijau. Di sini store berisi file nyata untuk SATU kartu, dengan kartu lain
//    yang punya file berbeda di store yang sama. Kalau popup ini menampilkan
//    nama file kartu yang lain, berarti ia membaca peta seluruh kartu, bukan satu
//    kartu. Nama filenya sengaja dibuat berbeda supaya tertukar tidak mungkin
//    tidak terlihat.
const kartuHppUntukBukti = KARTU_WHITELABEL.find((k) => k.stage === 'hpp-price');
const kartuLain = KARTU_WHITELABEL.find((k) => k.id !== kartuHppUntukBukti.id);

const buktiPerKartu = {
  [kartuHppUntukBukti.id]: {
    'kalkulasi-hpp': [
      { nama: 'HITUNGAN-HPP-KARTU-INI.pdf', ukuran: 1200, tipe: 'application/pdf', url: 'blob:x' },
    ],
    'kalkulasi-selling-price': [],
  },
  [kartuLain.id]: {
    'kalkulasi-hpp': [
      { nama: 'HITUNGAN-HPP-KARTU-LAIN.pdf', ukuran: 999, tipe: 'application/pdf', url: 'blob:y' },
    ],
  },
};

// Jumlah kartu di store uji, diekspor supaya pemeriksaan di luar bundle punya
// kontrol positif: kalau penyusun store ini diam-diam menghasilkan satu kartu
// saja, 'bukti per kartu' di bawah akan hijau tanpa pernah menguji apa pun.
export const jumlahKartuBukti = Object.keys(buktiPerKartu).length;

// Nama stage tujuan di kedua papan, untuk membuktikan dua label tombol di bawah
// benar-benar berbeda — kalau sama, pemeriksaan labelnya tidak membedakan
// papan mana yang dirender.
export const tujuanHpp = {
  production: setelah(PAPAN_PRODUCTION, 'hpp-price')?.label ?? null,
  whitelabel: setelah(PAPAN_WHITELABEL, 'hpp-price')?.label ?? null,
};

// Daftar id stage kedua papan. Diekspor karena pemeriksaan di luar bundel tidak
// bisa membaca PAPAN_PRODUCTION langsung — ia hidup di dalam modul ini.
// Dipakai tiket 5 untuk membuktikan 'invoice-logistic' HANYA ada di papan
// White Label: kalau ia diam-diam ditambahkan ke papan Production, kolom ke-9
// muncul di sana dan tidak ada pemeriksaan lain yang akan gagal.
export const idStage = {
  produksi: PAPAN_PRODUCTION.map((s) => s.id),
  whitelabel: PAPAN_WHITELABEL.map((s) => s.id),
};

export const popupTanpaStage = renderToStaticMarkup(<IsiPopup kartu={KARTU_PRODUCTION[0]} />);

// ===== SeksiHppPrice: dua mode, dirender langsung =====
//
// Dirender LANGSUNG, bukan lewat 'IsiPopup', supaya pemeriksaan mode dan
// angkanya tidak bergantung pada stage mana yang sudah dirouting. Routing di
// 'IsiPopup' diuji terpisah; kalau keduanya digabung, satu kegagalan routing
// akan menutupi kegagalan angka ATAU sebaliknya, dan yang mana yang rusak tidak
// akan kelihatan.
const kartuHppProd = KARTU_PRODUCTION.find((k) => k.stage === 'hpp-price');
const kartuHppWl = KARTU_WHITELABEL.find((k) => k.stage === 'hpp-price');
const aksiHpp = {
  ...aksi,
  tambahBukti: () => {},
  hapusBukti: () => {},
};

export const seksiHppProd = renderToStaticMarkup(
  <SeksiHppPrice
    kartu={kartuHppProd}
    sumber="production"
    barisHpp={barisContohHpp}
    bukti={{}}
    tujuan={setelah(PAPAN_PRODUCTION, 'hpp-price')}
    aksi={aksiHpp}
  />
);
export const seksiHppWl = renderToStaticMarkup(
  <SeksiHppPrice
    kartu={kartuHppWl}
    sumber="whitelabel"
    barisHpp={barisContohHpp}
    bukti={{}}
    tujuan={setelah(PAPAN_WHITELABEL, 'hpp-price')}
    aksi={aksiHpp}
  />
);

// 1. Popup HPP & Price dengan bukti yang sudah diunggah. Membuktikan 'IsiPopup'
//    meneruskan store bukti KARTU INI, bukan peta seluruh kartu.
export const popupHppWlTerisi = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuHppUntukBukti}
    stage={PAPAN_WHITELABEL.find((s) => s.id === 'hpp-price')}
    stageBerikutnya={setelah(PAPAN_WHITELABEL, 'hpp-price')}
    adaPrepare={false}
    sumber="whitelabel"
    siapBahan={{}}
    aksi={aksiLengkap}
    renderHpp={renderHpp}
    buktiHpp={buktiPerKartu}
  />
);

// 2. Popup HPP & Price yang TIDAK diberi stage tujuan. Bandingannya dengan
//    'popupHppWl' membuktikan 'tujuan' benar-benar diteruskan ke tombol: tanpa
//    itu, keduanya akan punya label yang sama persis dan pemeriksaan labelnya
//    tidak berarti apa-apa.
export const popupHppTanpaTujuan = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuHppWl}
    stage={PAPAN_WHITELABEL.find((s) => s.id === 'hpp-price')}
    adaPrepare={false}
    sumber="whitelabel"
    siapBahan={{}}
    aksi={aksiLengkap}
    renderHpp={renderHpp}
  />
);

// 3. Kartu yang pernah disetujui Cutting — datanya terkunci, jadi management
//    bukti HPP ikut tertutup. 'KotakBukti' menutupnya dengan MELEPAS tombolnya,
//    bukan dengan mematikan, jadi yang hilang di sini adalah tombolnya sendiri
//    beserta teks pengumumannya.
export const popupHppTerkunci = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuHppWl}
    stage={PAPAN_WHITELABEL.find((s) => s.id === 'hpp-price')}
    stageBerikutnya={setelah(PAPAN_WHITELABEL, 'hpp-price')}
    adaPrepare={false}
    sumber="whitelabel"
    siapBahan={{}}
    aksi={aksiLengkap}
    renderHpp={renderHpp}
    sudahDisetujui
  />
);

// Kasus ketiga: kartu White Label yang TIDAK punya baris shipment. Mode White
// Label tanpa baris harus menampilkan alasannya, bukan HPP nol — angka nol akan
// terbaca sebagai "produk ini gratis" dan kartu boleh lanjut ke Upload.
export const seksiHppWlKosong = renderToStaticMarkup(
  <SeksiHppPrice
    kartu={{ ...kartuHppWl, productName: 'Produk Tanpa Shipment' }}
    sumber="whitelabel"
    barisHpp={barisContohHpp}
    bukti={{}}
    tujuan={setelah(PAPAN_WHITELABEL, 'hpp-price')}
    aksi={aksiHpp}
  />
);

// Kasus keempat: nama produk yang cocok dengan DUA baris. Harus ditolak, bukan
// diam-diam memakai yang pertama — kartu yang lain punya HPP yang lebih besar,
// dan menampilkannya dengan tanpa catatan adalah kesalahan yang tidak terlihat.
export const seksiHppWlAmbigu = renderToStaticMarkup(
  <SeksiHppPrice
    kartu={{ ...kartuHppWl, productName: 'Rowe Tee' }}
    sumber="whitelabel"
    barisHpp={barisContohHpp}
    bukti={{}}
    tujuan={setelah(PAPAN_WHITELABEL, 'hpp-price')}
    aksi={aksiHpp}
  />
);

// Angka yang BENAR-BENAR tampil, diekstrak dari markup. Dipakai supaya
// pemeriksaan di bawah membandingkan angka yang sampai ke layar, bukan angka
// hasil hitung ulang di test — kalau test menghitung ulang sendiri, ia bisa
// salah di dua tempat sekaligus dan tetap hijau.
export const renderHppPrice = {
  hppProd: hppProduksi(kartuHppProd, kartuHppProd.detail.ongkosJahit),
  hppWl: hppWhiteLabel(barisContohHpp.find((b) => b.namaProduct === 'Luna Pants')),
  jahitLuna: barisContohHpp.find((b) => b.namaProduct === 'Luna Pants'),
  jenisBukti: JENIS_BUKTI_HPP.map((j) => j.id),
};

// Label asal usul kartu di bawah judul popup. Tidak bisa diperiksa dari markup
// IsiPopup karena tempatnya di DialogHeader, dan DialogContent memakai
// portal yang tidak ikut ter-render di server — jadi fungsinya yang diperiksa.
export const labelPopup = {
  production: labelSumber('production'),
  whitelabel: labelSumber('whitelabel'),
};

// ===== Stage Cutting: pcs hasil potong + dua bukti wajib =====
//
// Angka dan status gerbang dihitung DI DALAM bundel, lewat fungsi yang sama
// dengan yang dipakai popup. Kalau logikanya disalin ke skrip pemeriksa, yang
// teruji adalah salinannya — bukan gerbang yang benar-benar menahan kartu.

const kartuCutting = KARTU_PRODUCTION.find((k) => k.stage === 'cutting');
const varianCutting = barisVarian(kartuCutting);
const kunciCutting = varianCutting.map((v) => v.kunci);
const isiSemuanya = Object.fromEntries(varianCutting.map((v) => [v.kunci, 10]));

// Dua jenis bukti, masing-masing dengan berkasnya sendiri. Keduanya harus ada
// dan tidak saling menggantikan.
//
// Kolom "url" ikut diisi karena popup harus bisa MENAMPILKAN hasil unggahan.
// Kalau kolom ini dihapus dari BerkasBukti, gerbang tetap hijau (ia hanya
// menghitung jenisnya) sementara pratinjaunya hilang total - persis bug yang
// sudah pernah terjadi sekali di fitur ini dan tidak ditangkap tes mana pun.
//
// Catatan: file ini ditulis ke dalam template literal entry Vite, jadi TIDAK
// boleh memakai backtick di dalam komentar - backtick menutup string-nya dan
// seluruh bundel gagal dibuild.
const duaJenisBukti = {
  [kartuCutting.id]: {
    'laporan-potong': [{ nama: 'laporan.pdf', ukuran: 100, tipe: 'application/pdf', url: 'blob:laporan' }],
    'register-cutting': [{ nama: 'register.png', ukuran: 100, tipe: 'image/png', url: 'blob:register' }],
  },
};

const kosongkanSatuVarian = { ...isiSemuanya };
delete kosongkanSatuVarian[kunciCutting[0]];

export const gerbangCutting = {
  jumlahVarian: varianCutting.length,
  totalPlan: totalPcs(kartuCutting),
  jenisBukti: JENIS_BUKTI_CUTTING.map((b) => b.id),
  // Kosong -> tertutup.
  kosong: ringkasCutting(kartuCutting, {}, {}),
  // Pcs penuh, bukti belum ada -> masih tertutup.
  tanpaBukti: ringkasCutting(kartuCutting, { [kartuCutting.id]: isiSemuanya }, {}),
  // Pcs penuh + kedua bukti -> terbuka.
  lengkap: ringkasCutting(kartuCutting, { [kartuCutting.id]: isiSemuanya }, duaJenisBukti),
  // Angka 0 itu keputusan sah (varian memang tidak dipotong), bukan "belum diisi".
  nolDiisi: ringkasCutting(
    kartuCutting,
    { [kartuCutting.id]: Object.fromEntries(varianCutting.map((v) => [v.kunci, 0])) },
    duaJenisBukti
  ),
  // Satu varian belum diisi -> tertutup, walau yang lain penuh.
  satuKosong: ringkasCutting(kartuCutting, { [kartuCutting.id]: kosongkanSatuVarian }, duaJenisBukti),
  // Hanya SATU jenis bukti -> tertutup. Ini yang akan lolos kalau bukti
  // disimpan dalam satu daftar dan tidak dipisah per jenis.
  satuJenis: ringkasCutting(kartuCutting, { [kartuCutting.id]: isiSemuanya }, {
    [kartuCutting.id]: { 'laporan-potong': [{ nama: 'a.pdf', ukuran: 1, tipe: '', url: 'blob:a' }] },
  }),
  // Berkas di jenis yang salah tidak boleh dihitung.
  jenisSalah: ringkasCutting(kartuCutting, { [kartuCutting.id]: isiSemuanya }, {
    [kartuCutting.id]: { 'register-cutting': [{ nama: 'a.pdf', ukuran: 1, tipe: '', url: 'blob:a' }] },
  }),
};

export const totalCuttingContoh = ringkasCutting(
  kartuCutting,
  { [kartuCutting.id]: isiSemuanya },
  duaJenisBukti
).totalPcs;

// Popup Cutting dengan isi terisi, supaya angka di markup bisa dibandingkan
// dengan angka yang dihitung fungsi. Popup KOSONG hanya bisa membuktikan
// bentuknya (ada/tidaknya kolom dan tombol), bukan angkanya.
// 'aksiLengkap' sendiri dideklarasikan di atas, dipakai bersama oleh render
// Cutting dan render HPP & Price.
export const popupCuttingTerisi = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuCutting}
    stage={PAPAN_PRODUCTION.find((s) => s.id === 'cutting')}
    stageBerikutnya={setelah(PAPAN_PRODUCTION, 'cutting')}
    siapBahan={{}}
    cuttingPcs={{ [kartuCutting.id]: isiSemuanya }}
    buktiCutting={duaJenisBukti}
    aksi={aksiLengkap}
  />
);

// ===== Q11: data Cutting terkunci + tombol "Kembalikan ke Cutting" =====
//
// Tiga keadaan yang harus dibedakan, dan membedakannya adalah seluruh isi Q11:
//
//   1. BELUM disetujui  -> boleh edit, panel pengembalian tidak boleh ada sama
//                          sekali (menawarkan pengembalian untuk sesuatu yang
//                          tidak pernah dikunci)
//   2. SUDAH disetujui   -> input pcs mati, tombol hapus bukti hilang, tombol
//                          "Kembalikan ke Cutting" hidup
//   3. SUDAH dikembalikan -> keadaan 2 lagi, PLUS riwayatnya. Setelah dikembalikan
//                          angka pcs boleh diedit lagi, tapi jejaknya tetap ada
//                          supaya selisihnya dengan angka lama tetap terlihat.
//
// Keadaan 3 sengaja diuji lewat popup Receive, bukan popup Cutting: begitu
// dikembalikan, kartu kembali ke stage Cutting, dan seluruh data pun bisa diedit
// lagi. Kalau popuplah yang diuji, jejaknya tidak akan pernah terlihat lagi dari
// tempat yang paling penting untuk-checking-nya.
const jejakCutting = [
  { waktu: '2026-09-24T02:15:00.000Z', alasan: 'Angka dari vendor salah kirim', totalPcs: 140 },
  { waktu: '2026-09-26T08:05:00.000Z', alasan: 'Register cutting belum lengkap', totalPcs: 155 },
];

const stageCutting = PAPAN_PRODUCTION.find((s) => s.id === 'cutting');
const stageReceive = PAPAN_PRODUCTION.find((s) => s.id === 'receive');
const isiCuttingPenuh = { [kartuCutting.id]: isiSemuanya };

// Keadaan 2: Cutting sudah disetujui, tapi belum pernah dikembalikan.
export const popupCuttingTerkunci = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuCutting}
    stage={stageCutting}
    stageBerikutnya={setelah(PAPAN_PRODUCTION, 'cutting')}
    siapBahan={{}}
    cuttingPcs={isiCuttingPenuh}
    buktiCutting={duaJenisBukti}
    sudahDisetujui
    aksi={aksiLengkap}
  />
);

// Keadaan 3: kartu sudah sampai ke Receive, dan pernah dikembalikan sekali.
export const popupReceiveKembali = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuCutting}
    stage={stageReceive}
    stageBerikutnya={setelah(PAPAN_PRODUCTION, 'receive')}
    siapBahan={{}}
    cuttingPcs={isiCuttingPenuh}
    buktiCutting={duaJenisBukti}
    kembalikan={{ [kartuCutting.id]: jejakCutting }}
    sudahDisetujui
    aksi={aksiLengkap}
  />
);

// Keadaan 2b: sudah disetujui, sekali dikembalikan, sekarang di Cutting lagi
// dan angkanya tengah disunting. Data harus bisa diedit lagi, jejak tetap tampil.
export const popupCuttingSetelahKembali = renderToStaticMarkup(
  <IsiPopup
    kartu={kartuCutting}
    stage={stageCutting}
    stageBerikutnya={setelah(PAPAN_PRODUCTION, 'cutting')}
    siapBahan={{}}
    cuttingPcs={isiCuttingPenuh}
    buktiCutting={duaJenisBukti}
    kembalikan={{ [kartuCutting.id]: jejakCutting }}
    aksi={aksiLengkap}
  />
);

// Anti-regresi untuk jebakan turunan-dari-stage. Kartu contoh bawaan sudah
// ber-stage 'receive' tanpa pernah ada approve Cutting untuknya. Kalau
// "terkunci" diturunkan dari stage, semua popup Receive ikut terkunci — termasuk
// data yang sedang didemokan. Yang diperiksa di sini popuplah saat flag-nya
// TIDAK diberi, persis seperti keadaan papan yang tidak pernah menyalakannya.
const kartuReceiveBawaan = KARTU_PRODUCTION.find((k) => k.stage === 'receive');
export const popupReceiveBawaan = kartuReceiveBawaan
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuReceiveBawaan}
        stage={stageReceive}
        stageBerikutnya={setelah(PAPAN_PRODUCTION, 'receive')}
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

// Jumlah entri jejak yang benar-benar sampai ke markup, plus pcs yang tertulis
// di tiap entri. Diambil dari teks render, bukan dari state yang dipasang di
// atas — kalau PanelKembalikan tidak merender daftarnya, keduanya nol padahal
// pemeriksaan lain di blok ini tetap hijau.
export const jejakTerlihat = {
  jumlah: (popupReceiveKembali.match(/pcs saat itu/g) || []).length,
  alasan: jejakCutting.map((j) => popupReceiveKembali.includes(j.alasan)),
  // Urutannya harus terbalik: entri terbaru di atas.
  urutan: popupReceiveKembali.indexOf(jejakCutting[1].alasan) <
    popupReceiveKembali.indexOf(jejakCutting[0].alasan),
  totalSaatDikembalikan: jejakCutting.map((j) => j.totalPcs + ' pcs saat itu'),
};

// Konfirmasi: panel pengembalian hanya hidup setelah tombol ditekan, dan
// tombol konfirmasinya MATI selama alasan kosong. "Alasan" adalah salah satu
// dari tiga hal yang owner pilih untuk dicatat, jadi mengizinkan konfirmasi
// tanpa isi berarti jejaknya tidak menjalankan gunanya.
export const popupTanpaAlasan = popupCuttingTerkunci;

// ===== Tiket 5: tiga tahap akhir (Invoice Logistic / Invoice Product / Upload) =====
//
// Semuanya dirender lewat 'IsiPopup', bukan lewat seksinya langsung, karena
// yang paling mudah salah di tiket ini adalah ROUTING-nya: tiga cabang baru
// ditambahkan di antara cabang lama, dan kalau salah satunya tidak pernah
// aktif, seksinya tidak akan pernah muncul di popup sungguhan — sementara
// pemeriksaan yang merender seksinya langsung tetap hijau semua.
//
// 'invoice-logistic' HANYA ada di papan White Label. Karena itu popupnya
// dirender dengan kartu White Label, dan keberadaannya di papan Production
// diperiksa terpisah sebagai kontrol negatif: kalau stage itu diam-diam
// ditambahkan ke PAPAN_PRODUCTION, kolom ke-9 muncul dan tidak ada yang gagal.
const kartuInvLogistic = KARTU_WHITELABEL.find((k) => k.stage === 'invoice-logistic');
const kartuInvProduct = KARTU_WHITELABEL.find((k) => k.stage === 'invoice-product');
const kartuUpload = KARTU_WHITELABEL.find((k) => k.stage === 'upload');

export const popupInvLogistic = kartuInvLogistic
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuInvLogistic}
        stage={PAPAN_WHITELABEL.find((s) => s.id === 'invoice-logistic')}
        stageBerikutnya={setelah(PAPAN_WHITELABEL, 'invoice-logistic')}
        adaPrepare={false}
        sumber="whitelabel"
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

export const popupInvProduct = kartuInvProduct
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuInvProduct}
        stage={PAPAN_WHITELABEL.find((s) => s.id === 'invoice-product')}
        stageBerikutnya={setelah(PAPAN_WHITELABEL, 'invoice-product')}
        adaPrepare={false}
        sumber="whitelabel"
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

export const popupUpload = kartuUpload
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuUpload}
        stage={PAPAN_WHITELABEL.find((s) => s.id === 'upload')}
        stageBerikutnya={setelah(PAPAN_WHITELABEL, 'upload')}
        adaPrepare={false}
        sumber="whitelabel"
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

// -- Dua jalur Invoice Product, dua field bukti yang BERBEDA.
//
// Kartu yang sama dirender dua kali, sekali per jalur. Yang dibandingkan
// adalah jenis bukti yang muncul: 'livou_transfer' meminta
// 'proofPaymentProduct', 'reimbursement' meminta 'proofReimburse'. Keduanya
// TIDAK PERNAH boleh tampil bersamaan — kotak yang salah membuat orang
// mengunggah berkas ke tempat yang salah tanpa ada yang menahannya.
//
// Nama kartunya sengaja dibedakan supaya pemeriksaan "bukan yang lain" tidak
// bisa hijau karena kebetulan tidak ada teks apa pun.
const kartuFlowLivou = kartuInvProduct
  ? {
      ...kartuInvProduct,
      productName: 'Kartu Uji Livou Transfer',
      tahapAkhir: { flowTransaction: 'livou_transfer' },
    }
  : null;
const kartuFlowReimburse = kartuInvProduct
  ? {
      ...kartuInvProduct,
      productName: 'Kartu Uji Reimbursement',
      tahapAkhir: { flowTransaction: 'reimbursement' },
    }
  : null;

export const popupInvProductLivou = kartuFlowLivou
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuFlowLivou}
        stage={PAPAN_WHITELABEL.find((s) => s.id === 'invoice-product')}
        stageBerikutnya={setelah(PAPAN_WHITELABEL, 'invoice-product')}
        adaPrepare={false}
        sumber="whitelabel"
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

export const popupInvProductReimburse = kartuFlowReimburse
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuFlowReimburse}
        stage={PAPAN_WHITELABEL.find((s) => s.id === 'invoice-product')}
        stageBerikutnya={setelah(PAPAN_WHITELABEL, 'invoice-product')}
        adaPrepare={false}
        sumber="whitelabel"
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

// Jenis bukti per jalur, dihitung DI DALAM bundel lewat fungsi yang dipakai
// popup. Kalau daftar jalurnya disalin ke skrip pemeriksa, yang teruji adalah
// salinannya — dan salah salin berarti pemeriksaan tetap hijau sementara
// popup menampilkan kotak yang salah.
export const buktiPerJalur = {
  livouTransfer: jenisBuktiTahap('invoice-product', 'livou_transfer').map((j) => j.id),
  reimbursement: jenisBuktiTahap('invoice-product', 'reimbursement').map((j) => j.id),
  // Tanpa jalur dipilih: yang dituntut baru invoice-nya. Ini yang membuktikan
  // popup tidak menebak jalur saat masih kosong.
  tanpaJalur: jenisBuktiTahap('invoice-product', undefined).map((j) => j.id),
  // Jenis bukti dua tahap lain, untuk kontrol bahwa daftarnya memang berbeda.
  invLogistic: jenisBuktiTahap('invoice-logistic').map((j) => j.id),
  upload: jenisBuktiTahap('upload').map((j) => j.id),
};

// Jumlah pcs plan kartu Upload, diambil dari fungsi yang sama dengan yang
// dipakai seluruh papan. Popup menampilkannya sebagai PEMBANDING ("98 dari
// 160 pcs"), dan angka itu harus angka yang sama dengan kartu di papan.
export const rencanaUpload = kartuUpload ? totalPcs(kartuUpload) : null;

// -- 0 vs kosong pada Jumlah Upload POS.
//
// Owner mengoreksi: 'jumlahUploadPos' adalah JUMLAH PCS, bukan hitungan daftar
// berkas. Dan angka 0 adalah pernyataan yang sah ("belum ada yang masuk POS"),
// yang justru dilaporkan sebagai temuan di Finance Validate — jadi 0 harus
// dihitung SUDAH DIISI, bukan sama dengan kotak yang masih kosong.
//
// Dibuktikan dari teks kekurangannya: kartu ber-nilai 0 tidak boleh menuntut
// 'Jumlah upload POS' lagi. Kalau 0 disamakan dengan kosong, baris itu muncul
// di daftar "Belum lengkap:" dan pemilik tidak akan pernah bisa menyelesaikan
// kartu yang isinya memang 0.
const kartuUploadNol = kartuUpload
  ? { ...kartuUpload, tahapAkhir: { jumlahUploadPos: 0 } }
  : null;

export const popupUploadNol = kartuUploadNol
  ? renderToStaticMarkup(
      <IsiPopup
        kartu={kartuUploadNol}
        stage={PAPAN_WHITELABEL.find((s) => s.id === 'upload')}
        stageBerikutnya={setelah(PAPAN_WHITELABEL, 'upload')}
        adaPrepare={false}
        sumber="whitelabel"
        siapBahan={{}}
        aksi={aksiLengkap}
      />
    )
  : '';

// -- Terkunci: aturan owner "terkunci total, tanpa pengecualian".
//
// Kartu yang sudah LEWAT tahapnya tidak boleh punya input hidup maupun
// management bukti. Dipakai prop 'sudahLewat' yang berisi tahap itu sendiri, dan
// pembandingnya adalah popup yang SAMA DATANYA tanpa prop itu — supaya yang
// terbukti bukan "markupnya berubah", melainkan "yang hilang memang tombol dan
// inputnya, sementara isinya tetap terlihat".
//
// Berkas bukti SENGAJA diisi di kedua render. Tanpa berkas, tombol hapus tidak
// akan pernah dirender bahkan pada popup yang TIDAK terkunci — jadi
// pemeriksaan "tombol hapus hilang saat terkunci" akan hijau tanpa menguji
// apa pun, persis kelas kesalahan yang sudah pernah lolos di repo ini.
const kartuInvLogisticBerisi = kartuInvLogistic
  ? {
      ...kartuInvLogistic,
      tahapAkhir: { kodeShipmentLivou: 'SH-CN-2609-002', dateInvoiceLogistic: '2026-09-02' },
    }
  : null;

const buktiLogisticUntukKunci = kartuInvLogisticBerisi
  ? {
      [kartuInvLogisticBerisi.id]: {
        invoiceLogistic: [
          {
            nama: 'NOTA-LOGISTIK-TERKUNCI.pdf',
            ukuran: 2048,
            tipe: 'application/pdf',
            url: 'blob:nota',
          },
        ],
      },
    }
  : {};

const renderInvLogistic = (kartu, sudahLewat) =>
  kartu
    ? renderToStaticMarkup(
        <IsiPopup
          kartu={kartu}
          stage={PAPAN_WHITELABEL.find((s) => s.id === 'invoice-logistic')}
          stageBerikutnya={setelah(PAPAN_WHITELABEL, 'invoice-logistic')}
          adaPrepare={false}
          sumber="whitelabel"
          siapBahan={{}}
          aksi={aksiLengkap}
          sudahLewat={sudahLewat}
          buktiTahap={buktiLogisticUntukKunci}
        />
      )
    : '';

export const popupInvLogisticBerisi = renderInvLogistic(kartuInvLogisticBerisi, undefined);
export const popupInvLogisticTerkunci = renderInvLogistic(kartuInvLogisticBerisi, [
  'invoice-logistic',
]);

// Nama berkasnya diekspor supaya pemeriksaan di luar bisa menuntut berkas yang
// SAMA terlihat di kedua keadaan — mengunci berarti tidak bisa diubah, bukan
// tidak bisa dilihat.
export const namaBerkasLogistic = 'NOTA-LOGISTIK-TERKUNCI.pdf';

// ===== Tiket 3: Finance Validate — daftar temuan =====
//
// Yang diuji di blok ini: temuanKartu() menghitung temuan yang BENAR dari
// data, dan popup Finance Validate benar-benar memakainya lewat IsiPopup.
// Dua-duanya harus ada: fungsi yang benar tapi tidak tersambung ke popup tidak
// akan pernah terlihat pemilik, dan popup yang tersambung ke fungsi yang salah
// menampilkan daftar kosong yang terlihat meyakinkan.
//
// Kartu p-10 (Rowe Tee, Production) dan w-08 (Zara Dress, White Label) dipakai
// karena keduanya memang sudah duduk di stage 'finance-validate' di data contoh
// — dan keduanya punya kelengkapan yang berbeda, jadi daftar temuannya tidak
// bisa tertukar.

const kartuFinProd = KARTU_PRODUCTION.find((k) => k.stage === 'finance-validate');
const kartuFinWl = KARTU_WHITELABEL.find((k) => k.stage === 'finance-validate');

// Kartu bersih: semua yang diperiksa sudah beres. Dipakai sebagai pembanding
// "0 temuan" — tanpa pembanding ini, pemeriksaan "kartu rusak punya temuan"
// tidak membuktikan apa pun soal ketelitiannya.
const kartuFinBersih = kartuFinProd
  ? {
      ...kartuFinProd,
      // Ongkos jahit diisi supaya tidak ada temuan "ongkos jahit belum diisi".
      detail: { ...kartuFinProd.detail, ongkosJahit: { perPcs: 15000 } },
      // undefined = belum diisi, dan itu BUKAN temuan. Angka 0 yang jadi
      // temuan — lihat pemeriksaan 0-vs-kosong di bawah.
      tahapAkhir: { jumlahUploadPos: undefined },
    }
  : null;

// Bukti lengkap, DIPISAH PER STORE seperti PapanFulfillment menyimpannya:
// Cutting di store cutting, kalkulasi HPP di store HPP, tiga tahap akhir di
// store tahap. Gabungannya dipakai untuk menguji temuanKartu(); yang per
// store dipakai untuk membuktikan popup benar-benar MENGGABUNGKAN ketiganya.
// Kalau popup cuma membaca satu store, kartu bersih akan kelihatan punya
// temuan — dan itu yang membuat pemeriksaan "0 temuan" di popup bermakna.
//
// Id jenisnya diambil dari daftar yang sama dengan yang dipakai
// temuanKartu(), bukan disalin — kalau daftarnya berubah, fixture ini ikut
// berubah dan pemeriksaan "bersih = 0" tetap menguji hal yang benar.
const berkasContoh = (id) => [
  { nama: 'BUKTI-' + id + '.pdf', ukuran: 1024, tipe: 'application/pdf', url: 'blob:x' },
];
const buktiPerStore = (jenis) => Object.fromEntries(jenis.map((j) => [j.id, berkasContoh(j.id)]));

const buktiCuttingProd = buktiPerStore(JENIS_BUKTI_CUTTING);
const buktiHppProd = buktiPerStore(JENIS_BUKTI_HPP);
const buktiTahapProd = buktiPerStore([
  ...jenisBuktiTahap('invoice-product', undefined),
  ...JENIS_BUKTI_UPLOAD,
]);
const buktiLengkapProd = { ...buktiCuttingProd, ...buktiHppProd, ...buktiTahapProd };

export const temuan = {
  // Kartu bersih, bukti lengkap -> tidak ada temuan sama sekali.
  bersih: kartuFinBersih
    ? temuanKartu(kartuFinBersih, { sumber: 'production', bukti: buktiLengkapProd })
    : null,
  // Kartu yang sama tanpa bukti apa pun -> yang muncul HANYA temuan bukti.
  // Dipakai untuk membuktikan temuan bukti dihitung dari daftar wajib, bukan
  // dari daftar kosong.
  tanpaBukti: kartuFinBersih ? temuanKartu(kartuFinBersih, { sumber: 'production' }) : null,
  // Kartu contoh Production apa adanya — kondisi yang dilihat pemilik saat
  // presentasi. p-10 punya ongkos jahit, jadi yang muncul temuan bukti saja.
  apaAdanya: kartuFinProd ? temuanKartu(kartuFinProd, { sumber: 'production' }) : null,
  // Kartu contoh White Label apa adanya — tanpa baris shipment (Zara Dress
  // tidak ada di barisContohHpp), jadi penjaga "HPP di bawah biaya beli" tidak
  // bisa dievaluasi di sini; yang muncul temuan bukti.
  apaAdanyaWl: kartuFinWl ? temuanKartu(kartuFinWl, { sumber: 'whitelabel' }) : null,

  // -- Sengaja dirusak, satu per satu. Tiap kerusakan harus memunculkan temuan
  //    dengan id yang tepat, dan HANYA temuan itu yang bertambah.
  ongkosJahitHilang: kartuFinProd
    ? temuanKartu(
        { ...kartuFinProd, detail: { ...kartuFinProd.detail, ongkosJahit: undefined } },
        { sumber: 'production', bukti: buktiLengkapProd }
      )
    : null,
  uploadNol: kartuFinProd
    ? temuanKartu(
        { ...kartuFinProd, tahapAkhir: { ...kartuFinProd.tahapAkhir, jumlahUploadPos: 0 } },
        { sumber: 'production', bukti: buktiLengkapProd }
      )
    : null,
  uploadTerisi: kartuFinProd
    ? temuanKartu(
        { ...kartuFinProd, tahapAkhir: { ...kartuFinProd.tahapAkhir, jumlahUploadPos: 80 } },
        { sumber: 'production', bukti: buktiLengkapProd }
      )
    : null,
  // undefined = belum diisi, dan itu BUKAN temuan. Kartu contoh yang belum
  // pernah melewati Upload tidak boleh dituduh "belum masuk POS" hanya karena
  // kotaknya kosong — aturan ini tertulis di DataTahapAkhir.jumlahUploadPos.
  //
  // Dirender dari sini, bukan disusun di skrip pemeriksa: temuanKartu() dan
  // buktiLengkapProd hidup di dalam bundel, dan skrip pemeriksa tidak bisa
  // memanggilnya langsung.
  uploadUndefined: kartuFinProd
    ? temuanKartu(
        { ...kartuFinProd, tahapAkhir: { ...kartuFinProd.tahapAkhir, jumlahUploadPos: undefined } },
        { sumber: 'production', bukti: buktiLengkapProd }
      )
    : null,
  receiveSisa: kartuFinProd
    ? temuanKartu(kartuFinProd, {
        sumber: 'production',
        bukti: buktiLengkapProd,
        terima: [
          // Varian pertama kurang 2 pcs, varian kedua lengkap.
          { varian: 'Black S', plan: 35, sudahDatang: 33, masukStok: 0 },
          { varian: 'Black M', plan: 45, sudahDatang: 45, masukStok: 0 },
        ],
      })
    : null,
  receiveLengkap: kartuFinProd
    ? temuanKartu(kartuFinProd, {
        sumber: 'production',
        bukti: buktiLengkapProd,
        terima: [{ varian: 'Black S', plan: 35, sudahDatang: 33, masukStok: 2 }],
      })
    : null,

  // Penjaga HPP White Label di bawah biaya beli.
  //
  // Baris ini sengaja dirusak di ANGKA ONGKOS KIRIMNYA: actualIdrPaidLogistic
  // negatif. Itu satu-satunya cara temuan ini bisa muncul — rumus HPP WL adalah
  // biayaBeli + biayaKirim, dan dengan ongkos kirim yang tidak negatif
  // hasilnya MUSTAHIL lebih rendah dari biaya beli. Jadi bukan test yang lemah:
  // yang diuji di sini adalah data yang memang salah, jenis salah yang dulu
  // lolos ke tabel pratinjau (78.000 padahal 152.133) tanpa ada pemeriksaan
  // yang menangkapnya.
  //
  // Angkanya: 9.000.000 ÷ 120 = 75.000 biaya beli; −600.000 ÷ 120 = −5.000
  // ongkos kirim; HPP = 70.000 < 75.000. Temuan harus muncul.
  hppBawahBeli: kartuFinWl
    ? temuanKartu(kartuFinWl, {
        sumber: 'whitelabel',
        bukti: buktiLengkapProd,
        barisHpp: [
          {
            namaProduct: kartuFinWl.productName,
            actualIdrPaidProduct: 9000000,
            actualIdrPaidLogistic: -600000,
            totalPcs: 120,
            codeShipment: 'SH-CN-2609-009',
            currency: 'CNY',
            kurs: 2200,
            namaSupplier: 'Haining Silk Co',
          },
        ],
      })
    : null,

  // Kontrol untuk penjaga yang sama: baris yang WAJAR — ongkos kirim positif —
  // tidak boleh memunculkan temuan itu. Tanpa pembanding ini, penjaga yang
  // selalu menyala akan hijau di pemeriksaan di atas.
  hppWajar: kartuFinWl
    ? temuanKartu(kartuFinWl, {
        sumber: 'whitelabel',
        bukti: buktiLengkapProd,
        barisHpp: [
          {
            namaProduct: kartuFinWl.productName,
            actualIdrPaidProduct: 9000000,
            actualIdrPaidLogistic: 600000,
            totalPcs: 120,
            codeShipment: 'SH-CN-2609-009',
            currency: 'CNY',
            kurs: 2200,
            namaSupplier: 'Haining Silk Co',
          },
        ],
      })
    : null,

  // Urutan daftar: yang harus DIPUTUSKAN lebih dulu daripada yang harus
  // DIUNGGAH. Kartu ini sengaja punya tiga jenis sekaligus — satu temuan
  // receive, satu temuan upload, dan tujuh temuan bukti — supaya urutannya
  // benar-benar bercampur dan bisa diperiksa. Fixture lain di atas selalu
  // hanya punya satu jenis, jadi urutannya tidak bisa diuji dari mereka.
  campur: kartuFinProd
    ? temuanKartu(
        { ...kartuFinProd, tahapAkhir: { ...kartuFinProd.tahapAkhir, jumlahUploadPos: 0 } },
        {
          sumber: 'production',
          terima: [{ varian: 'Black S', plan: 35, sudahDatang: 33, masukStok: 0 }],
        }
      )
    : null,

  // -- Tertutup: id yang ditutup berubah status, TAPI tetap ada di daftar.
  //    Ini keputusan pemilik — riwayat, bukan penghapusan.
  //
  //    Satu id yang tidak ada di daftar ikut ditutup, dengan sengaja: menutup
  //    temuan yang tidak pernah ada TIDAK BOLEH memunculkan temuan hantu.
  //    Kalau temuan disimpan sebagai salinan, id asing itu akan muncul sebagai
  //    baris kosong; karena temuan DIHITUNG, id asing tidak menghasilkan apa
  //    pun.
  tertutupSebagian: kartuFinProd
    ? temuanKartu(kartuFinProd, {
        sumber: 'production',
        ditutup: ['cutting:laporan-potong', 'temuan-yang-tidak-pernah-ada'],
      })
    : null,

  // Label stage asal, supaya "ke mana harus melihat" bisa diperiksa.
  labelStage: {
    cutting: labelStageAsal('cutting'),
    receive: labelStageAsal('receive'),
    hpp: labelStageAsal('hpp-price'),
    upload: labelStageAsal('upload'),
    invoiceLogistic: labelStageAsal('invoice-logistic'),
  },
};

// Popup Finance Validate, dua-duanya lewat IsiPopup — supaya routing-nya ikut
// teruji, bukan cuma fungsinya.
const renderFinance = (kartu, sumber, papan, ekstra = {}) =>
  kartu
    ? renderToStaticMarkup(
        <IsiPopup
          kartu={kartu}
          stage={papan.find((s) => s.id === 'finance-validate')}
          stageBerikutnya={setelah(papan, 'finance-validate')}
          adaPrepare={sumber === 'production'}
          sumber={sumber}
          siapBahan={{}}
          aksi={aksiLengkap}
          {...ekstra}
        />
      )
    : '';

export const popupFinanceProd = renderFinance(kartuFinProd, 'production', PAPAN_PRODUCTION);
export const popupFinanceWl = renderFinance(kartuFinWl, 'whitelabel', PAPAN_WHITELABEL);
// Kartu bersih dengan bukti lengkap, TAPI DIPISAH ke tiga store seperti
// PapanFulfillment menyimpannya — bukan tiga salinan dari satu peta. Itu
// disengaja: kalau popup hanya membaca salah satu store, dua store lain
// terlihat kosong dan popupnya berhenti berkata "tidak ada temuan". Jadi
// pemeriksaan "bersih = 0 temuan" di popup sekaligus membuktikan ketiganya
// benar-benar digabung, bukan cuma salah satunya.
export const popupFinanceBersih = renderFinance(kartuFinBersih, 'production', PAPAN_PRODUCTION, {
  buktiCutting: { [kartuFinBersih?.id ?? 'x']: buktiCuttingProd },
  buktiHpp: { [kartuFinBersih?.id ?? 'x']: buktiHppProd },
  buktiTahap: { [kartuFinBersih?.id ?? 'x']: buktiTahapProd },
});
// Semua temuan p-10 ditutup: daftarnya harus tetap tampil, tombolnya hidup.
export const popupFinanceTertutup = renderFinance(kartuFinProd, 'production', PAPAN_PRODUCTION, {
  temuanTertutup: [
    'cutting:laporan-potong',
    'cutting:register-cutting',
    'invoice-product:invoiceProduct',
    'hpp-price:kalkulasi-hpp',
    'hpp-price:kalkulasi-selling-price',
    'upload:proofUploadEcommerce',
    'upload:uploadPos',
  ],
});
// Dua render untuk membuktikan terima dan barisHpp benar-benar DITERUSKAN
// dari papan lewat IsiPopup sampai ke daftar temuan. Tanpa keduanya, dua sumber
// temuan itu hanya terbukti benar sebagai fungsi, tidak terbukti pernah
// tersambung ke layar.
export const popupFinanceTerima = renderFinance(kartuFinProd, 'production', PAPAN_PRODUCTION, {
  terima: [{ varian: 'Black S', plan: 35, sudahDatang: 33, masukStok: 0 }],
});
export const popupFinanceWlBawahBeli = kartuFinWl
  ? renderFinance(kartuFinWl, 'whitelabel', PAPAN_WHITELABEL, {
      barisHpp: [
        {
          namaProduct: kartuFinWl.productName,
          actualIdrPaidProduct: 9000000,
          actualIdrPaidLogistic: -600000,
          totalPcs: 120,
          codeShipment: 'SH-CN-2609-009',
          currency: 'CNY',
          kurs: 2200,
          namaSupplier: 'Haining Silk Co',
        },
      ],
    })
  : '';

// ===== HPP: dua mode, dua rumus =====
//
// Angka dihitung DI DALAM bundel lewat fungsi yang dipakai halaman, bukan
// disalin ke skrip pemeriksa. Kalau rumusnya ditulis ulang di sini, yang
// teruji adalah salinannya.
//
// Pengujian memakai NILAI PERSIS, bukan "berubah". Alasannya sudah pernah
// menyakitkan: pemeriksaan yang hanya.assert bahwa angka bergerak tetap hijau
// kalau rumusnya salah arah — ia hanya membuktikan ada yang bereaksi.

const kartuSK = KARTU_PRODUCTION.find((k) => k.id === 'p-08');
const ongkos15 = { perPcs: 15000 };
const ongkosJahitDari = (k) => k.detail.ongkosJahit;
// Argumen kedua itu ongkos jahit itu sendiri, jadi "tanpa" berarti
// undefined — bukan objek yang membungkusnya, yang justru dianggap ada.
const tanpaOngkos = undefined;

// HPP White Label, dari baris shipment yang sebenarnya dipakai halaman.
export { barisContohHpp };
export { hppWhiteLabel, hppProduksi, hargaJual, MARGIN_HARGA_JUAL, barisBiayaKartu };
export const hppWL = barisContohHpp.map((b) => ({
  id: b.id,
  shipment: b.codeShipment,
  pcs: b.pcs,
  totalPcs: b.totalPcs,
  ...hppWhiteLabel(b),
}));

// SATU fungsi untuk data nyata DAN untuk kontrol yang sengaja dirusak. Ini
// sengaja tidak ditulis ulang terpisah untuk kontrol: kalau predsikatnya
// diduplikasi, mutasi pada predsikat yang asli tidak akan ikut menyentuh
// kontrol — kontrol tetap hijau dan pemeriksaan yang sebenarnya sudah mati
// lolos. Dengan satu fungsi, hidup dan mati keduanya ikut.
// Kriterianya: HPP wajib ada, dan tidak boleh di bawah biaya beli (ongkos kirim
// selalu positif, jadi HPP pasti lebih besar).
export const wlTidakLengkap = (rows) =>
  rows.filter((b) => b.hpp === null || b.hpp < b.biayaBeli).map((b) => b.id);

// HPP Produksi untuk kartu Vera Skirt (130 pcs) — kartu yang benar-benar ada di
// papan, dengan dan tanpa ongkos jahit.
export const hppProd = {
  dengan: hppProduksi(kartuSK, ongkos15),
  tanpa: hppProduksi(kartuSK, tanpaOngkos),
};

// Livia Blouse: 96 pcs. Dipilih karena pembagiannya TIDAK bulat, jadi kartu ini
// yang membuktikan presisi dua desimal tidak hilang. Kalau HPP di sini ikut
// Math.round, angkanya jadi 111.809 dan presisinya hilang diam-diam.
const kartuLB = KARTU_PRODUCTION.find((k) => k.id === 'p-07');
export const hppPresisi = hppProduksi(kartuLB, ongkos15);
export const jumlahPcsLB = totalPcs(kartuLB);

// HPP semua kartu Production, untuk pemeriksaan menyeluruh.
export const hppSemua = [...KARTU_PRODUCTION].map((k) => ({
  id: k.id,
  nama: k.productName,
  pcs: totalPcs(k),
  hpp: hppProduksi(k, ongkosJahitDari(k)).hpp,
  // HPP kartu yang sama TANPA ongkos jahit. Harus null.
  tanpaJahit: hppProduksi(k, tanpaOngkos).hpp,
  // Nama kartu yang HPP-nya tidak bisa dihitung, kalau ada.
  namaTertahan: hppProduksi(k, tanpaOngkos).hpp !== null ? k.productName : null,
}));

// Kartu yang HPP-nya punya lebih dari dua desimal — tanda nilai yang lewat
// aritmetika tanpa dibulatkan di setiap langkah.
//
// FP adalah fungsi pembulatan MILIK MODUL ini, bukan salinan lokal dan bukan
// Math.round. Pembedaan itulah inti tesnya: kalau implementasi berhenti
// membulatkan dan di sini pakai salinan Math.round, maka angka seperti
// 108508.005 terbulat jadi 108508 pada salinan tapi 108508.01 pada fungsi
// asli — dan kartu yang tadinya tertangkap jadi lolos. Jadi mutasi pada
// pembulatan implementasinya terlihat di sini, padahal pemeriksaan di bawah
// sendiri tidak pernah memanggil fungsi itu.
const FP = presisiFix;
export const kartuDesimalBerlebih = (rows) =>
  rows.filter((r) => r.hpp !== null && FP(r.hpp) !== r.hpp).map((r) => r.nama);

// Gerbang untuk kartu yang sama, di kedua papan. Papan White Label tidak punya
// Prepare maupun Cutting; kartu SK dipaksa ke sana supaya terlihat bahwa
// gerbang mengikuti PAPAN, bukan isi kartu.
export const gerbangHppKartu = {
  production: gerbangHpp(kartuSK, 'production', ongkos15),
  productionTanpaJahit: gerbangHpp(kartuSK, 'production', tanpaOngkos),
  // Kartu Production dipaksa ke papan White Label: mode harus ikut papan.
  wlDipaksaDariProd: gerbangHpp(kartuSK, 'whitelabel', ongkos15, {
    actualIdrPaidProduct: 8880000, actualIdrPaidLogistic: 248000, totalPcs: 60,
  }),
  // Kartu White Label dipaksa ke papan Production: ongkos jahit tidak ada, jadi
  // gerbang HARUS menutup walau workcode-nya WHLB.
  wlDipaksaDariWL: gerbangHpp(KARTU_WHITELABEL[0], 'production', tanpaOngkos),
};

// Pengecek workcode untuk semua kartu di kedua papan.
export const cekWorkcode = [
  ...KARTU_PRODUCTION.map((k) => ({ id: k.id, papan: 'production', ...cekSumberWorkcode(k, 'production') })),
  ...KARTU_WHITELABEL.map((k) => ({ id: k.id, papan: 'whitelabel', ...cekSumberWorkcode(k, 'whitelabel') })),
];

// HPP + harga jual pada tabel pratinjau Production Fulfillment, yang tadinya
// berisi angka literal.
export const hppTabel = barisPdffContoh.map((r) => ({
  id: r.id,
  workcode: r.workcodePdff,
  sumber: r.sourceProduction,
  hpp: hppBaris(r),
  selling: sellingBaris(r),
}));

// Nilai pembanding yang TIDAK boleh ikut berubah: angka HPP lama yang sengaja
// dibuang. Disimpan supaya test bisa membuktikan kolom ini benar-benar berasal
// dari rumus, bukan dari angka yang kebetulan cocok.
export const angkaLama = { hppRowe: 78000, hppMidi: 132000, jualRowe: 189000, jualMidi: 299000 };

export const fp = presisiFix;
export const petaHarga = HARGA_FIFO;
export const margin = MARGIN_HARGA_JUAL;
export const hargaDari = hargaJual;
export { cekSumberWorkcode };

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

// ===== HPP baru: angka yang benar-benar TAMPIL =====
//
// Semua pemeriksaan HPPWL di bawah ini memeriksa angka yang DIKEMBALIKAN fungsi.
// Itu belum menjawab pertanyaan yang paling penting: apakah angkanya sampai ke
// layar, sudah diformat sebagai rupiah, dan tidak lagi menampilkan 78.000.
//
// Jadi halamannya ikut dirender, dan teks yang benar-benar keluar diuji. Kalau
// kolomnya masih membaca field literal, atau format angkanya salah, assertion
// ini yang menangkapnya — bukan pemeriksaan aritmetikanya.
export const halHpp = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/hpp-baru']}>
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

export const kartuDaftar = kartuRegister();

// Kolom filter Register — dipakai halaman ini untuk membangun submenu Filter,
// jadi diuji langsung: yang salah di sini tidak akan terlihat di markup,
// karena isi menu hanya dirender setelah menu dibuka.
export const kolomFilterRegister = kolomFilter(kartuDaftar);

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
//
// DUA versi dirender, dan itu disengaja. Yang tanpa kartu memeriksa isi dialog
// dari katalog saja — dipakai oleh pemeriksaan yang sudah ada. Yang dengan
// kartu memeriksa jalur yang BENAR-BENAR dipakai aplikasi: kartu daftar sudah
// tidak lagi memuat baris per warna (permintaan pemilik, demi kepadatan di
// lima kolom), jadi kalau kartu tidak diteruskan, rincian itu hilang dari
// produk tanpa ada yang mengatakannya.
//
// Catatan: baris-baris di dalam blok ini berada di dalam template literal
// entri di atas, jadi backtick di komentar akan menutup string-nya lebih dulu.
export const detailPerProduk = PRODUK_REGISTER.map((p) => ({
  id: p.id,
  html: renderToStaticMarkup(<IsiDetailProduk produk={p} />),
  htmlKartu: renderToStaticMarkup(
    <IsiDetailProduk produk={p} kartu={kartuDaftar.find((k) => k.id === p.id)} />
  ),
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

// Penjaga: TIDAK BOLEH ada backtick di dalam blok template entri di atas.
//
// Seluruh blok itu satu template literal, jadi satu backtick di dalamnya —
// biasanya di komentar yang menulis nama variabel dengan gaya markdown —
// menutup string-nya lebih awal. Gejalanya BUKAN pesan yang menunjuk ke sini,
// melainkan SyntaxError di baris yang jauh di bawah ("Unexpected identifier"),
// dan beberapa menit terbuang mencari kode yang sebenarnya tidak salah.
// Sudah kejadian dua kali saat tiket 5 dikerjakan.
//
// Penjaganya membaca BERKAS SUMBERNYA, bukan nilai `entri` yang sudah jadi.
// Kalau backtick-nya ada, berkas ini gagal di-parse Node sebelum satu baris pun
// di sini berjalan — jadi memeriksa `entri` tidak akan pernah sempat dilakukan.
// Yang bisa diperiksa adalah teks sumbernya, dan itu memang yang salah.
{
  const sumberIni = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const baris = sumberIni.split('\n');
  const awal = baris.findIndex((b) => b.startsWith('const entri = `'));
  // Penutupnya dicari sebagai baris yang isinya HANYA backtick dan titik koma,
  // karena backtick yang tersasar justru muncul di tengah komentar.
  const akhir = baris.findIndex((b, i) => i > awal && /^`;\s*$/.test(b));
  const dalamBlok = awal >= 0 && akhir > awal ? baris.slice(awal + 1, akhir) : [];
  const barisBacktick = dalamBlok
    .map((b, i) => (b.includes('`') ? `baris ${awal + 2 + i}: ${b.trim().slice(0, 70)}` : null))
    .filter(Boolean);
  if (awal < 0 || akhir < 0) {
    console.error('GAGAL: blok template entri tidak ditemukan — penjaga backtick tidak bisa jalan.');
    process.exit(1);
  }
  if (barisBacktick.length) {
    console.error(
      `GAGAL: ada ${barisBacktick.length} backtick di dalam blok template entri.\n` +
        'Blok itu satu template literal — backtick di komentar menutupnya lebih awal dan\n' +
        'menghasilkan SyntaxError di baris yang sama sekali salah. Ganti dengan kutip tunggal.\n' +
        barisBacktick.map((b) => '  ' + b).join('\n')
    );
    process.exit(1);
  }
}

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

const { produksi, whitelabel, popupPerStage, popupProposeWL, popupHppWl, popupHppWlTerisi, popupHppTerkunci, popupTanpaStage, jumlahKartuBukti, tujuanHpp, popupHppTanpaTujuan, labelPopup, fakta, faktaWL, alur, cekSumberWorkcode, bahanKartu, tabelWarna, tabelBahan, tabelBahanKosong, bahanTerpisah, barisWarnaContoh, pisahBahan, halPapan, halTabel, halRegister, halHpp, barisContohHpp, katalogProduk, kartuDaftar, kolomFilterRegister, isiForm, vendorPerPapan, saranNama, cariAda, cariTidakAda, cariSebagian, detailPerProduk, PRODUK_REGISTER, KATEGORI_VENDOR, gerbangCutting, totalCuttingContoh, popupCuttingTerisi, popupCuttingTerkunci, popupReceiveKembali, popupCuttingSetelahKembali, popupReceiveBawaan, jejakTerlihat, popupTanpaAlasan, hppWL, hppProd, hppPresisi, jumlahPcsLB, hppSemua, gerbangHppKartu, cekWorkcode, hppTabel, angkaLama, fp, petaHarga, margin, hargaDari, wlTidakLengkap, kartuDesimalBerlebih, renderHppPrice, seksiHppWl, seksiHppProd, seksiHppWlKosong, seksiHppWlAmbigu, hppWhiteLabel, hppProduksi, hargaJual, MARGIN_HARGA_JUAL, barisBiayaKartu, popupInvLogistic, popupInvProduct, popupUpload, popupInvProductLivou, popupInvProductReimburse, buktiPerJalur, popupInvLogisticTerkunci, popupInvLogisticBerisi, popupUploadNol, rencanaUpload, namaBerkasLogistic, idStage, temuan, popupFinanceProd, popupFinanceWl, popupFinanceBersih, popupFinanceTertutup, popupFinanceTerima, popupFinanceWlBawahBeli } =
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

// LETAK tombol, bukan hanya keberadaannya. Owner 28 September 2026: tombolnya
// di ATAS kartu, tepat di bawah judul kolom — bukan di bawah deretan kartu,
// tempat ia ikut ter-scroll dan hilang ke bawah layar begitu kolomnya panjang.
//
// Yang dibandingkan adalah POSISI di markup: indeks "Tambah Produksi" harus
// lebih KECIL dari indeks kartu pertama. Kalau hanya `includes`, tombolnya
// bisa ditarik kembali ke bawah papan dan check ini tetap hijau.
//
// `data-slot="kartu-fulfillment"` dipakai sebagai penanda kartu karena itu
// atribut yang benar-benar ada di markup — bukan kelas Tailwind, yang bisa
// ditimpa utilitas lain kapan saja.
const iTombol = produksi.indexOf('Tambah Produksi');
const iKartuPertama = produksi.indexOf('data-slot="kartu-fulfillment"');
iTombol > 0 && iKartuPertama > 0 && iTombol < iKartuPertama
  ? ok('tombol "Tambah Produksi" di ATAS kartu (owner 28 Sep)')
  : salah(
      'letak tombol "Tambah Produksi"',
      `tombol=${iTombol} kartuPertama=${iKartuPertama}; tombol harus di atas kartu`
    );

// Kontra-pembuktian: helper posisi benar-benar membedakan urutan, di atas
// markup yang sama. Kalau `indexOf` di atas tidak pernah dihitung, check ini
// hijau tanpa menguji apa pun.
const posisiKartu = (html) => html.indexOf('data-slot="kartu-fulfillment"');
const posisiKartuKedua = (html) =>
  html.indexOf('data-slot="kartu-fulfillment"', posisiKartu(html) + 1);

posisiKartuKedua(produksi) > posisiKartu(produksi) &&
  produksi.indexOf('Tambah Produksi') < posisiKartu(produksi)
  ? ok('urutan tombol → kartu → kartu benar-benar dibaca dari markup')
  : salah('bantah-urutan', 'helper posisi tidak membedakan urutan');

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

// -- Cutting: pcs hasil potong + dua bukti wajib
//
// Yang diperiksa di sini BUKAN sekadar "ada kotak upload". Yang menentukan
// kartu boleh lanjut ke Receive adalah gerbangnya, dan gerbang bisa salah
// dengan tiga cara yang berbeda — masing-masing punya pemeriksaan sendiri:
//   1. varian diabaikan, bukti yang dianggap cukup
//   2. hanya satu jenis bukti yang dihitung
//   3. angka 0 disamakan dengan kotak kosong, sehingga varian yang memang
//      tidak dipotong membuat gerbang tidak akan PERNAH terbuka
console.log('\n== Stage Cutting ==');

const popupCutting = popupPerStage.cutting;

popupCutting.includes('Cutting Pcs')
  ? ok('kolom "Cutting Pcs" ada di stage Cutting')
  : salah('kolom Cutting Pcs', 'tidak ditemukan');
!popupCutting.includes('Plan Qty')
  ? ok('kolom "Plan Qty" tidak tampil di stage Cutting')
  : salah('Plan Qty di Cutting', 'rencana masih tampil; yang dipakai adalah hasil potong');
for (const t of ['Laporan Potong Kain', 'Register Cutting PDFF', 'Bukti Cutting']) {
  popupCutting.includes(t) ? ok(`bukti "${t}"`) : salah(`bukti "${t}"`, 'tidak ditemukan');
}
popupCutting.includes('Lanjut ke Receive')
  ? ok('tombol lanjut menuju Receive, kolom berikutnya di papan Production')
  : salah('tombol lanjut Cutting', 'tidak menunjuk kolom berikutnya di papan ini');
// Gerbang harus benar-benar MENUTUP: sebelum syarat terpenuhi, atribut
// disabled harus ada. Popup yang sudah terisi di bawah diperiksa terpisah.
//
// PENCARIANNYA `disabled=""`, BUKAN kata "disabled" polos. Alasannya halus:
// `buttonVariants` selalu memuat kelas
// `disabled:pointer-events-none disabled:opacity-50`, jadi kata "disabled"
// muncul di markup SETIAP button apakah ia disabled atau tidak. Versi pertama
// pemeriksaan ini mencari kata polos, dan karena itu HANYA akan pernah gagal -
// ia tidak membedakan tombol yang hidup dari yang mati sama sekali.
// Atribut yang benar di markup base-ui adalah `disabled=""` (dan `data-disabled=""`).
const tombolMati = (html) => html.includes('disabled=""');
tombolMati(popupCutting)
  ? ok('tombol lanjut mati sebelum syarat terpenuhi')
  : salah('gerbang Cutting', 'tombol tidak disabled padahal syarat belum terpenuhi');
!tombolMati(popupCuttingTerisi)
  ? ok('tombol lanjut hidup setelah pcs + kedua bukti lengkap')
  : salah('gerbang Cutting', 'masih disabled padahal syarat sudah terpenuhi');

// Kolom Share dihapus dari SEMUA stage, jadi yang diperiksa bukan hanya popup
// Cutting. Loop di sini sengaja melaporkan stage mana yang masih memilikinya.
const adaShare = Object.entries(popupPerStage).filter(([, h]) => h.includes('>Share<'));
adaShare.length === 0
  ? ok('kolom Share hilang di semua stage')
  : salah('kolom Share', `masih ada di stage: ${adaShare.map(([id]) => id).join(', ')}`);
!popupPerStage.receive.includes('Cutting Pcs')
  ? ok('kolom Cutting tidak bocor ke stage lain')
  : salah('kolom Cutting bocor', 'stage Receive menampilkan kolom Cutting Pcs');
popupPerStage.receive.includes('Plan Qty')
  ? ok('stage lain tetap menampilkan Plan Qty')
  : salah('Plan Qty di stage lain', 'hilang dari stage yang bukan Cutting');

// Angka di markup harus berasal dari fungsi yang sama, bukan hitung ulang di
// sini. Kalau popup salah menghitung, angka ini tidak akan cocok.
popupCuttingTerisi.includes(`Total cutting ${totalCuttingContoh} PCS`)
  ? ok(`Total cutting = ${totalCuttingContoh} PCS di markup`)
  : salah('angka Total cutting', `tidak menemukan "Total cutting ${totalCuttingContoh} PCS"`);
!popupCuttingTerisi.includes('Total plan')
  ? ok('popup Cutting tidak menulis "Total plan"')
  : salah('Total plan di Cutting', 'rencana total masih tertulis di stage Cutting');

// Pratinjau bukti. Tanpa ini, daftar nama berkas lolos sebagai "bukti terkumpul"
// padahal owner tidak pernah bisa melihat apa yang ia unggah — dan untuk foto
// register, isi fotonya justru satu-satunya yang perlu diperiksa.
// Dicari sebagai `src="..."`, bukan sekadar "blob:register": tautan buka di
// bawah juga memuat URL yang sama persis, jadi pencarian tanpa atribut akan
// tetap hijau walau pratinjau gambarnya dihapus - persis yang terjadi saat
// mutasi M2 dicoba.
popupCuttingTerisi.includes('src="blob:register"')
  ? ok('pratinjau gambar memakai object URL')
  : salah('pratinjau gambar', 'src tidak ada; yang tampil bukan berkasnya');
popupCuttingTerisi.includes('<img')
  ? ok('bukti gambar punya pratinjau')
  : salah('pratinjau gambar', 'tidak ada elemen <img> di daftar bukti');
// PDF (dan berkas gambar) harus bisa dibuka. Tombolnya dirender sebagai <a>
// dengan href sungguhan, jadi tautannya benar-benar ada di markup - kalau
// masih onClick, renderToStaticMarkup tidak akan menulis apa pun dan berkas
// jadi mustahil dibaca tanpa cara lain membukanya.
popupCuttingTerisi.includes('href="blob:laporan"')
  ? ok('berkas punya tautan untuk dibuka di tab baru')
  : salah('tautan buka berkas', 'tidak ada href; berkas tidak bisa dibaca dari popup');

const g = gerbangCutting;
g.jumlahVarian > 0
  ? ok(`gerbang menghitung ${g.jumlahVarian} varian`)
  : salah('jumlah varian', 'nol varian; gerbang tidak bisa menguji apa pun');
!g.kosong.lengkap
  ? ok('gerbang tertutup saat kosong')
  : salah('gerbang kosong', 'terbuka padahal tidak ada isian');
!g.tanpaBukti.lengkap
  ? ok('gerbang tertutup walau pcs penuh, bukti belum ada')
  : salah('gerbang tanpa bukti', 'terbuka tanpa bukti');
g.lengkap.lengkap
  ? ok('gerbang terbuka: pcs penuh + kedua bukti')
  : salah('gerbang lengkap', 'tertutup padahal syarat terpenuhi');
g.nolDiisi.lengkap
  ? ok('angka 0 dianggap sah (varian memang tidak dipotong)')
  : salah('angka 0', 'disamakan dengan kotak kosong; gerbang tidak akan pernah terbuka');
g.nolDiisi.totalPcs === 0
  ? ok('total pcs 0, bukan tertukar dengan kosong')
  : salah('total pcs 0', `dapat ${g.nolDiisi.totalPcs}`);
!g.satuKosong.lengkap
  ? ok('satu varian belum diisi -> gerbang tertutup')
  : salah('satu varian kosong', 'terbuka padahal satu varian belum diisi');
!g.satuJenis.lengkap
  ? ok('satu jenis bukti saja tidak cukup')
  : salah('satu jenis bukti', 'terbuka dengan satu jenis');
!g.jenisSalah.lengkap
  ? ok('berkas di jenis yang salah tidak dihitung sebagai bukti')
  : salah('bukti jenis salah', 'terhitung sebagai bukti sah');
g.jenisBukti.length === 2
  ? ok('dua jenis bukti wajib')
  : salah('jumlah jenis bukti', `dapat ${g.jenisBukti.length}, harus 2`);
g.totalPlan !== totalCuttingContoh
  ? ok(`angka cutting (${totalCuttingContoh}) berbeda dari plan (${g.totalPlan}), jadi tidak tertukar`)
  : salah('angka tertukar', 'angka cutting sama dengan plan — plan mungkin masih bocor ke Cutting');

// -- Q11: data Cutting terkunci setelah disetujui, dan bisa dibuka lagi lewat
//    tombol "Kembalikan ke Cutting" yang meninggalkan jejak.
//
// Yang diperiksa di sini bukan "ada tombolnya" — hampir semua fitur punya
// tombol. Yang menentukan adalah batasannya: angka yang sudah dibaca Receive
// tidak boleh bisa berubah diam-diam, dan setiap perubahan HARUS meninggalkan
// catatan. Q1 tidak mencatat siapa yang menyetujui, jadi catatan inilah satu-
// satunya bukti bahwa angkanya pernah disentuh.
console.log('\n== Q11: data Cutting terkunci + jejak pengembalian ==');

// -- Keadaan 1: belum disetujui -> panel pengembalian tidak boleh ada.
//
// Dicek dari popup Cutting yang TERISI (sudah ada pcs + kedua bukti, tapi belum
// pernah disetujui). Kalau panelnya muncul di sini, ia menawarkan jalan
// mengunci data yang belum pernah dikunci — dan tombolnya akan aktif untuk
// kartu mana pun yang kebetulan punya stage 'receive'.
!popupCuttingTerisi.includes('Data Cutting terkunci')
  ? ok('panel pengembalian tidak muncul sebelum Cutting disetujui')
  : salah(
      'panel pengembalian',
      'muncul di popup yang BELUM disetujui — ada jalan mengunci data yang belum pernah disetujui'
    );

// Tombol pengembalian pun tidak boleh ada di keadaan itu. Dipisah dari panel
// karena keduanya bisa hilang dengan cara berbeda: panel hilang tapi tombolnya
// akan lolos pemeriksaan di atas.
!popupCuttingTerisi.includes('Kembalikan ke Cutting')
  ? ok('tombol "Kembalikan ke Cutting" tidak ada sebelum disetujui')
  : salah('tombol Kembalikan', 'ada di popup yang belum disetujui');

// -- Keadaan 2: sudah disetujui -> input mati, bukti tidak bisa dihapus, tombol
//    Kembalikan hidup.
//
// PENCARIAN disable tetap `disabled=""`, bukan kata "disabled" polos, sama
// seperti gerbang di atas: `buttonVariants` selalu memuat kelas
// `disabled:opacity-50`, jadi kata itu ada di markup setiap button.
const inputMati = (html) => /<input[^>]*disabled=""/.test(html);

popupCuttingTerkunci.includes('Data Cutting terkunci')
  ? ok('panel data terkunci muncul setelah Cutting disetujui')
  : salah('panel data terkunci', 'tidak muncul padahal kartu sudah disetujui');
popupCuttingTerkunci.includes('Kembalikan ke Cutting')
  ? ok('tombol "Kembalikan ke Cutting" ada setelah disetujui')
  : salah('tombol Kembalikan', 'hilang pada kartu yang sudah disetujui');

inputMati(popupCuttingTerkunci)
  ? ok('input Cutting Pcs mati setelah disetujui')
  : salah('input pcs', 'masih bisa diisi padahal data sudah disetujui');
!inputMati(popupCuttingTerisi)
  ? ok('input Cutting Pcs hidup sebelum disetujui')
  : salah('input pcs', 'mati sejak awal — data tidak akan pernah bisa diisi');

// Bukti: tidak bisa ditambah DAN tidak bisa dihapus. Berkas yang sudah ada
// tetap harus terlihat — mengunci berarti tidak bisa diubah, bukan tidak
// bisa dilihat. Kalau berkasnya ikut hilang, jejak yang justru sedang
// dipelihara justru hilang bersamanya.
!popupCuttingTerkunci.includes('aria-label="Hapus ')
  ? ok('tombol hapus bukti hilang setelah disetujui')
  : salah('hapus bukti', 'masih ada pada kartu yang sudah disetujui');
!popupCuttingTerkunci.includes('Tambah berkas lain') && !popupCuttingTerkunci.includes('>Unggah<')
  ? ok('tombol unggah bukti hilang setelah disetujui')
  : salah('unggah bukti', 'masih ada pada kartu yang sudah disetujui');
popupCuttingTerkunci.includes('blob:laporan') && popupCuttingTerkunci.includes('blob:register')
  ? ok('berkas yang sudah ada tetap terlihat setelah dikunci')
  : salah('berkas terkunci', 'berkas ikut hilang dari daftar — jejak yang dipelihara justru lenyap');

// Tombol Lanjut harus HILANG, bukan cuma mati. Doisinya tidak nol: kartu
// yang terkunci sudah ada di stage berikutnya, jadi tombol yang masih ada di
// sini menjalankan perpindahan yang sama untuk kedua kalinya. Yang diperiksa
// seluruh markup popup terkunci: "Lanjut ke <stage>" juga muncul di kalimat
// keterangan SeksiCutting, jadi hanya teks yang tidak ada di tempat lain
// yang boleh jadi bukti.
!popupCuttingTerkunci.includes('Lanjut ke')
  ? ok('tombol Lanjut hilang setelah disetujui')
  : salah(
      'tombol Lanjut terkunci',
      'masih ada — menjalankan perpindahan yang sama untuk kedua kalinya'
    );

// -- Keadaan 3: dikembalikan -> angka bisa diedit lagi, jejak tetap ada.
!inputMati(popupCuttingSetelahKembali)
  ? ok('setelah dikembalikan, input pcs bisa diedit lagi')
  : salah('input setelah dikembalikan', 'tetap mati — data tidak bisa diperbaiki tanpa jalan lain');
popupCuttingSetelahKembali.includes('Riwayat dikembalikan')
  ? ok('jejak tetap tampil setelah dikembalikan')
  : salah('jejak', 'hilang begitu kartu kembali ke Cutting');

// -- Jejak: dua entri, keduanya tampil, urutannya terbalik (terbaru di atas).
jejakTerlihat.jumlah === 2
  ? ok(`jejak punya 2 entri yang tampil (${jejakTerlihat.jumlah})`)
  : salah('jumlah entri jejak', `dapat ${jejakTerlihat.jumlah}, harus 2`);
jejakTerlihat.alasan.every(Boolean)
  ? ok('kedua alasan tertulis lengkap di markup')
  : salah('alasan jejak', `hilang: ${jejakTerlihat.alasan.map((a, i) => (a ? '' : `#${i}`)).filter(Boolean).join(', ')}`);
jejakTerlihat.totalSaatDikembalikan.every((t) => popupReceiveKembali.includes(t))
  ? ok('total pcs saat dikembalikan tercatat di tiap entri')
  : salah(
      'pcs saat dikembalikan',
      `tidak ditemukan: ${jejakTerlihat.totalSaatDikembalikan.filter((t) => !popupReceiveKembali.includes(t)).join(', ')}`
    );
jejakTerlihat.urutan
  ? ok('riwayat diurutkan terbaru di atas')
  : salah('urutan riwayat', 'entri terbaru tidak di atas');

// Tanggal harus benar-benar ditulis, bukan hanya pcs-nya. Kalau formatWaktu
// gagal, yang tersisa cuma "140 pcs saat itu" — catatan yang tidak pernah
// memberitahu KAPAN angkanya berubah.
const adaTanggal = /pcs saat itu/.test(popupReceiveKembali) &&
  /<time|\d{1,2}\s+(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}/.test(
    popupReceiveKembali
  );
adaTanggal
  ? ok('tanggal pengembalian ikut tertulis')
  : salah('tanggal jejak', 'tidak ada tanggal di riwayat — hanya pcs-nya');

// -- Panel konfirmasi: hanya bisa dicapai lewat tombolnya.
//
// Isi panel konfirmasi (kolom alasan + tombol "Ya, Kembalikan") TIDAK bisa
// diperiksa di sini, dan itu bukan kelemahan skrip ini: panel itu dirender
// dari state `konfirmasi`, yang di server selalu `false` karena belum ada
// yang mengeklik. Memeriksa markup-nya akan selalu gagal, padahal fungsinya
// benar.
//
// Yang bisa diperiksa adalah batasnya: panel tidak boleh terbuka sendiri tanpa
// tombol yang ditekan, dan angka yang akan dicatat harus terlihat lebih dulu di
// ringkasan — supaya orang tahu sedang mengunci berapa pcs sebelum menekan
// tombol yang membukanya.
!popupCuttingTerkunci.includes('Alasan mengembalikan ke Cutting')
  ? ok('panel konfirmasi belum terbuka sebelum tombol ditekan')
  : salah('panel konfirmasi', 'terbuka tanpa ada yang menekan tombolnya');
const ringkasTercetak = popupCuttingTerkunci.includes('total ' + gerbangCutting.lengkap.totalPcs + ' pcs');
ringkasTercetak
  ? ok('ringkasan menampilkan total pcs yang akan tercatat')
  : salah(
      'ringkasan panel',
      'total pcs yang akan dicatat tidak tertulis di panel pengembalian'
    );

// -- Anti-regresi: kartu contoh yang stage-nya 'receive' TIDAK boleh terkunci.
//
// Ini jebakan yang paling mudah dikembalikan diam-diam. Kartu contoh bawaan
// sudah `stage: 'receive'` tanpa pernah ada approve Cutting, jadi "terkunci"
// yang diturunkan dari stage akan membekukan data yang justru sedang
// didemokan — dan tanpa tombol Kembalikan, karena tidak ada jejaknya.
popupReceiveBawaan.length > 0 && !popupReceiveBawaan.includes('Data Cutting terkunci')
  ? ok('kartu contoh di stage receive tidak ikut terkunci (tidak pernah dis Cutting)')
  : salah(
      'kartu receive bawaan',
      'terkunci padahal tidak pernah ada approve Cutting untuknya — data contoh membeku'
    );
//-cek yang sama harus berlaku untuk popup Cutting: tanpa flag, tidak terkunci.
!popupCuttingTerisi.includes('Data Cutting terkunci') && !inputMati(popupCuttingTerisi)
  ? ok('popup Cutting tanpa flag disetujui tetap bisa diedit')
  : salah('popup Cutting tanpa flag', 'terkunci tanpa disetujui');

// -- Stage lain: kosong dengan keterangan, BUKAN salinan Propose
//
// Cutting TIDAK termasuk di sini lagi. Stage itu sekarang punya isi sendiri
// (daftar pekerjaan cutting: pcs per varian + dua bukti unggah), jadi
// menyertakannya di daftar "stage yang harus kosong" hanya menanyakan sesuatu
// yang sudah tidak berlaku. HPP & Price dikecualikan dengan alasan sama: sejak
// tiket 4 stage itu punya isi sendiri di kedua papan. Dan sejak tiket 5,
// 'invoice-product' + 'upload' ikut punya isi sendiri — lihat blok tiket 5.
// Tiket 3 menambahkan 'finance-validate' ke daftar yang punya isi: stage itu
// sekarang menampilkan daftar temuan.
//
// Daftar pengecualiannya ditulis sebagai daftar, bukan dirangkai dengan `&&`
// di dalam filter: yang tersisa setelah semua tiket selesai tinggal 'receive'
// — satu-satunya stage yang alurnya memang belum diputuskan.
const stagePunyaIsi = [
  'propose',
  'prepare',
  'cutting',
  'hpp-price',
  'invoice-product',
  'upload',
  'finance-validate',
];
const stageKosong = Object.entries(popupPerStage).filter(([id]) => !stagePunyaIsi.includes(id));
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
  ? ok(`${stageKosong.length} stage lain kosong dengan keterangan, bukan salinan Propose`)
  : salah('stage kosong', `${stageMasihBerisi} masalah`);

// Daftar pengecualian di atas hanya berguna kalau isinya benar: kalau SEMUA
// stage ikut dikecualikan, loop-nya tidak berjalan sekali pun dan pemeriksaan
// di atas hijau tanpa memeriksa apa pun. Karena itu sisa daftarnya diperiksa.
const sisaStageKosong = stageKosong.map(([id]) => id).join(',');
sisaStageKosong === 'receive'
  ? ok('kontrol: tinggal satu stage yang masih kosong (receive)')
  : salah('kontrol daftar stage kosong', `dapat "${sisaStageKosong}"`);

// Cutting sekarang punya isi, jadi TIDAK boleh menampilkan keterangan kosong.
// Dicek terpisah karena ia satu-satunya stage yang boleh begitu, dan
// pemeriksaan umum di atas sudah tidak menyentuhnya.
popupPerStage.cutting.includes('Belum ada isi khusus')
  ? salah('stage cutting', 'sudah punya daftar pekerjaan, tapi masih menampilkan keterangan kosong')
  : ok('stage Cutting punya isi sendiri, bukan lagi kosong');

// Hal yang sama untuk 'finance-validate' sejak tiket 3: daftar temuan adalah
// isinya, jadi keterangan kosong TIDAK boleh lagi muncul di sana. Dipisah dari
// pemeriksaan Cutting supaya kegagalannya menunjuk stage yang benar.
popupPerStage['finance-validate'].includes('Belum ada isi khusus')
  ? salah(
      'stage finance-validate',
      'sudah punya daftar temuan, tapi masih menampilkan keterangan kosong'
    )
  : ok('stage Finance Validate punya isi sendiri, bukan lagi kosong');

// Identitas tetap ada di semua stage — tanpa itu popup tidak bisa diketahui
// milik pekerjaan yang mana. Judul tabel warna/ukuran di Cutting sengaja TIDAK
// memakai kata "Plan": yang ditampilkan di sana hasil potong, bukan rencana.
let identitasHilang = 0;
for (const [id, html] of Object.entries(popupPerStage)) {
  const adaJudul = html.includes('Color &amp; Size Plan') || html.includes('Color &amp; Size<');
  if (!html.includes('Product &amp; Proposal Information') || !adaJudul) {
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

console.log('\n== Register Produk: section, daftar kartu, dan pengisian otomatis ==');

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

isiRegister.includes('Register Produk') && isiRegister.includes('Total Stock')
  ? ok('halaman Register memuat daftar produknya')
  : salah('halaman Register', 'kartu produknya tidak ter-render di rutenya');

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

// Filter harus ada, sama seperti Master Data Product. Isi menunya tidak bisa
// diperiksa dari markup: `DropdownMenuContent` dirender lewat portal dan baru
// muncul setelah menu dibuka, jadi `renderToStaticMarkup` tidak pernah
// melihatnya. Yang diuji di sini adalah tombolnya (pasti ada di markup) dan
// sumber opsi filternya (diuji terpisah lewat `kolomFilter` di bawah).
isiRegister.includes('>Filter<')
  ? ok('halaman Register punya tombol Filter')
  : salah('tombol Filter', 'tidak ada di halaman Register');

// Opsi filter harus CUKUP untuk menyaring daftar, dan tidak boleh berlebihan.
// Yang paling rawan salah di sini adalah warna: kalau diambil dari `varian`,
// filter akan menawarkan "Hitam" berkali-kali — satu kali per ukuran — dan
// setiap opsi yang sama itu cuma membingungkan saat dicentang.
const kolomFilter = kolomFilterRegister;
const namaKolom = kolomFilter.map((c) => c.key);
const kolomFilterKurang = ['kategori', 'brand', 'warna'].filter((k) => !namaKolom.includes(k));

kolomFilterKurang.length === 0
  ? ok('filter Register punya kategori, brand, dan warna')
  : salah('kolom filter', `tidak ada: ${kolomFilterKurang.join(', ')}`);

// Setiap opsi harus benar-benar muncul pada minimal satu kartu, kalau tidak
// ada kotak centang yang mencentang apa pun dan daftar tidak pernah berubah.
const opsiYatim = kolomFilter.flatMap((c) =>
  c.options.filter((o) => !kartuDaftar.some((k) => {
    const nilai = c.get(k);
    return (Array.isArray(nilai) ? nilai : [nilai]).includes(o);
  })).map((o) => `${c.key}=${o}`)
);

opsiYatim.length === 0
  ? ok('setiap opsi filter cocok dengan minimal satu kartu')
  : salah('opsi filter', `${opsiYatim.length} opsi tidak cocok kartu mana pun: ${opsiYatim[0]}`);

// Warna harus dipakai SATU KALI per produk. Kalau satu kartu punya "Hitam"
// dua kali di daftar warnanya, itu berarti ringkasan diambil dari `varian`
// (satu baris per ukuran), bukan dari warna — dan submenu filter akan
// menampilkan "Hitam" dua kali untuk satu hal yang sama.
const kolomFilterWarna = kolomFilter.find((c) => c.key === 'warna');
const warnaGanda = kolomFilterWarna
  ? kartuDaftar.flatMap((k) => {
      const warnaKartu = kolomFilterWarna.get(k);
      return warnaKartu.filter((w, i) => warnaKartu.indexOf(w) !== i);
    })
  : [];

warnaGanda.length === 0
  ? ok('opsi warna tidak berulang dari ukuran yang berbeda')
  : salah('opsi warna', `${warnaGanda.length} warna muncul lebih dari sekali: ${warnaGanda[0]}`);

// -- Daftar Register: satu KARTU per produk, dan angkanya konsisten
//
// Jumlah kartu dihitung dari katalognya, bukan ditulis tetap di sini: angka
// tetap akan terus "benar" walaupun produknya ditambah, dan justru saat
// menambah produk itulah pemeriksaan ini paling berguna.
//
// Yang diperiksa justru kebalikannya dari dulu: dulu satu produk memakan
// beberapa baris, pemilik menolak ("masa 1 row buat 1 variasi"). Satu kartu per
// produk + semua varian MENYATU di dalamnya — bukan dipecah jadi kartu
// terpisah — adalah bentuk yang diminta.
const jumlahProdukKatalog = katalogProduk.length;

kartuDaftar.length === jumlahProdukKatalog
  ? ok(`daftar Register punya satu kartu per produk (${kartuDaftar.length} kartu)`)
  : salah('jumlah kartu', `dapat ${kartuDaftar.length}, harus ${jumlahProdukKatalog}`);

// Varian ikut di dalam kartu, bukan jadi kartu sendiri: dijumlahkan seluruhnya
// untuk tiap produk dan dibandingkan dengan jumlah varian di katalognya.
const varianSalah = kartuDaftar.filter((k) => {
  const katalog = PRODUK_REGISTER.find((x) => x.id === k.id);
  return k.varian.length !== katalog.spesifikasi.warna.reduce((a, w) => a + w.pcs.length, 0);
});

varianSalah.length === 0
  ? ok('setiap kartu memuat seluruh variannya (warna × ukuran)')
  : salah('varian per kartu', `${varianSalah.length} kartu tidak cocok: ${varianSalah[0]?.id}`);

// Ringkasan PER WARNA adalah yang benar-benar dirender di kartu. Varian di
// atas tidak hilang — ia masih ada untuk dialog detail dan pencarian, dan
// pemeriksa di atas menjaganya tetap utuh.
//
// Yang diperiksa di sini: jumlah warna, jumlah ukuran per warna, dan angka
// stoknya. Kalau ringkasan ini dihitung ulang dari sumber yang berbeda
// daripada `varian`, dua tingkat ringkasan bisa berbeda dan yang tidak terbaca:
// yang salah ada di kartu, yang benar ada di dialog detail.
const warnaRingkasSalah = kartuDaftar.filter((k) => {
  // 1. Jumlah baris warna = jumlah warna berbeda di produk.
  if (k.warnaRingkas.length !== new Set(k.varian.map((v) => v.kodeWarna)).size)
    return true;
  // 2. Setiap warna harus menjumlahkan stok varian-variannya sendiri.
  return k.warnaRingkas.some((w) => {
    const miliknya = k.varian.filter((v) => v.kodeWarna === w.kodeWarna);
    if (miliknya.length !== w.jumlahSize) return true;
    if (miliknya.reduce((s, v) => s + v.stokJual, 0) !== w.stokJual) return true;
    if (miliknya.reduce((s, v) => s + v.stokMasuk + v.stokMenunggu, 0) !== w.stokTotal)
      return true;
    return false;
  });
});

warnaRingkasSalah.length === 0
  ? ok('ringkasan per warna menjumlahkan variannya dengan benar')
  : salah(
      'ringkasan warna',
      `${warnaRingkasSalah.length} kartu tidak cocok: ${warnaRingkasSalah[0]?.id}`
    );

// Warna yang tampil di kartu harus PERSIS satu per warna, bukan satu per
// varian: produk dua warna tetap dua baris, berapa pun jumlah ukurannya.
const jumlahBarisSalah = kartuDaftar.filter(
  (k) => k.warnaRingkas.length !== PRODUK_REGISTER.find((p) => p.id === k.id)?.spesifikasi.warna.length
);

jumlahBarisSalah.length === 0
  ? ok('setiap kartu hanya punya satu baris per warna')
  : salah(
      'baris per warna',
      `${jumlahBarisSalah.length} kartu tidak cocok: ${jumlahBarisSalah[0]?.id}`
    );

// Kolom "Waiting for" DIHAPUS dari tampilan (permintaan pemilik), tapi barang
// yang menunggu tidak boleh hilang dari hitungan — kalau dibuang dari rumus,
// "Total Stock" jadi lebih kecil daripada isi gudang yang sebenarnya.
const totalSalah = kartuDaftar.filter((k) => {
  const jumlahMenunggu = k.varian.reduce((s, v) => s + v.stokMenunggu, 0);
  return k.totalStok !== k.totalMasuk + jumlahMenunggu;
});

totalSalah.length === 0
  ? ok('total stok tiap kartu tetap menghitung barang yang menunggu')
  : salah('total stok', `${totalSalah.length} kartu tidak cocok: ${totalSalah[0]?.id}`);

// Nilai sisa = total × harga. Diperiksa di SEMUA kartu, bukan satu contoh:
// rumus yang benar di satu kartu bisa salah di kartu lain.
const nilaiSalah = kartuDaftar.filter((k) => k.nilaiSisa !== k.totalStok * k.harga);

// "Bisa jual" per varian harus menjumlah menjadi total yang sama. Kalau tidak,
// kartu menampilkan dua angka yang sama-sama disebut "total" tapi berbeda isi.
const jualSalah = kartuDaftar.filter(
  (k) => k.totalJual !== k.varian.reduce((s, v) => s + v.stokJual, 0)
);

jualSalah.length === 0
  ? ok('total "bisa jual" tiap kartu = jumlah stok jual seluruh varian')
  : salah('total bisa jual', `${jualSalah.length} kartu tidak cocok: ${jualSalah[0]?.id}`);


// Baris warna dijumlah tepat ke angka "bisa jual". Baris warnanya sendiri sudah
// PINDAH ke dialog detail (permintaan pemilik), tapi angkanya tetap muncul di
// kartu — jadi di dua tempat pembaca harus bisa merekonsiliasi sendiri.
const rekonsiliasiSalah = kartuDaftar.filter(
  (k) => k.warnaRingkas.reduce((s, w) => s + w.stokJual, 0) !== k.totalJual
);

rekonsiliasiSalah.length === 0
  ? ok(`baris warna menjumlah tepat ke angka "bisa jual" (${kartuDaftar.length} kartu)`)
  : salah(
      'rekonsiliasi kartu',
      `${rekonsiliasiSalah.length} kartu tidak cocok: ${rekonsiliasiSalah[0]?.id}`
    );

// Angka itu juga harus benar-benar TAMPIL di markup. Data yang sudah benar
// tetapi tidak dirender adalah bug yang sama efeknya: pembaca tetap tidak
// punya jalan untuk merekonsiliasi, hanya saja sekarang tidak ada yang bisa
// mengatakannya.
//
// Angka dan labelnya kini elemen terpisah (kaki kartu selebar ~205px tidak
// memuat keduanya dalam satu baris), jadi yang diperiksa adalah keberadaan tiap
// bagiannya, bukan string hasil menyambung keduanya. Dua label itu tidak boleh
// dipertukarkan: "bisa jual" menjumlah stok yang boleh langsung dijual,
// "Total Stock" adalah isi gudang seluruhnya termasuk yang terikat pesanan.
const kakiLengkap = kartuDaftar.every(
  (k) =>
    halRegister.includes('>bisa jual<') &&
    halRegister.includes('>Total Stock<') &&
    halRegister.includes(`>${k.totalJual}<`) &&
    halRegister.includes(`>${k.totalStok}<`)
);

kakiLengkap
  ? ok('kaki kartu menampilkan kedua angka, masing-masing dengan labelnya')
  : salah(
      'kaki kartu',
      'salah satu dari dua angka tidak ada di markup, jadi tidak ada yang bisa merekonsiliasi'
    );

// Baris per warna PINDAH ke dialog detail, bukan hilang. Pemindahan seperti ini
// bisa gagal dengan cara paling bodoh — kartu dibersihkan, `kartu` tidak
// diteruskan ke dialog — dan akibatnya satu informasi produk hilang tanpa satu
// pun pemeriksa yang gagal. Maka diperiksa di kedua arah.
const kartuMasihAdaWarna = kartuDaftar.filter((k) =>
  k.warnaRingkas.some((w) => halRegister.includes(`>${w.stokJual}<`) && halRegister.includes(w.warna))
);

kartuMasihAdaWarna.length === 0
  ? ok('kartu tidak lagi memuat baris per warna (kepadatan lima kolom tercapai)')
  : salah(
      'baris warna di kartu',
      `${kartuMasihAdaWarna.length} kartu masih menampilkannya: ${kartuMasihAdaWarna[0]?.id}`
    );

// Dan yang dipindah itu harus benar-benar ADA di tujuan. `htmlKartu` yang dipakai
// di sini adalah render dengan `kartu` diteruskan — jalur yang dipakai aplikasi
// sungguhan. Kalau yang kurang baru ketahuan di sini, rinciannya hilang tanpa
// yang mengatakannya.
const detailKurangWarna = detailPerProduk.filter((d) => {
  const k = kartuDaftar.find((x) => x.id === d.id);
  if (!k) return true;
  return !k.warnaRingkas.every(
    (w) =>
      d.htmlKartu.includes(w.warna) &&
      d.htmlKartu.includes(w.size) &&
      d.htmlKartu.includes(`>${w.stokJual}<`) &&
      d.htmlKartu.includes(`>${w.stokTotal}<`)
  );
});

detailKurangWarna.length === 0
  ? ok('dialog detail memuat baris stok per warna yang dipindah dari kartu')
  : salah(
      'baris warna di dialog detail',
      `${detailKurangWarna.length} produk tidak lengkap: ${detailKurangWarna[0]?.id}`
    );

// Terakhir: dua total ikut. Baris warna tanpa totals di bawahnya membuat
// pembaca menjumlah sendiri di kepala — persis pekerjaan yang dipindahkan ke
// dialog supaya tidak perlu dilakukan.
const detailKurangTotal = detailPerProduk.filter((d) => {
  const k = kartuDaftar.find((x) => x.id === d.id);
  if (!k) return true;
  return (
    !d.htmlKartu.includes('>Bisa Jual<') ||
    !d.htmlKartu.includes('>Total Stock<') ||
    !d.htmlKartu.includes(`>${k.totalJual} pcs<`) ||
    !d.htmlKartu.includes(`>${k.totalStok} pcs<`)
  );
});

detailKurangTotal.length === 0
  ? ok('dialog detail memuat kedua total, jadi baris warnanya bisa langsung dijumlah')
  : salah(
      'total di dialog detail',
      `${detailKurangTotal.length} produk tidak cocok: ${detailKurangTotal[0]?.id}`
    );
nilaiSalah.length === 0
  ? ok('nilai sisa tiap kartu = total stok x harga')
  : salah('nilai sisa', `${nilaiSalah.length} kartu tidak cocok: ${nilaiSalah[0]?.id}`);

// Stok jual tidak pernah melebihi total — kalau melebihi, ada stok yang
// terhitung dua kali.
const jualLebih = kartuDaftar.filter(
  (k) => k.varian.some((v) => v.stokJual > v.stokMasuk + v.stokMenunggu)
);
jualLebih.length === 0
  ? ok('stok jual tiap varian tidak melebihi stoknya')
  : salah('stok jual', `${jualLebih.length} kartu melebihi total: ${jualLebih[0]?.id}`);

// Kode varian harus unik DI DALAM satu kartu: dua varian berkode sama membuat
// React menimpa satu dengan yang lain saat me-render daftarnya.
const kodeGanda = kartuDaftar.filter(
  (k) => new Set(k.varian.map((v) => v.kodeVarian)).size !== k.varian.length
);
kodeGanda.length === 0
  ? ok('kode varian unik di dalam tiap kartu')
  : salah('kode varian', `${kodeGanda.length} kartu punya kode ganda: ${kodeGanda[0]?.id}`);

// Unik di dalam kartu saja belum cukup: kode varian tersusun dari designCode
// produk, jadi dua produk yang memakai designCode sama akan menerbitkan kode
// varian yang sama persis. Dua kartu berbeda yang memuat kode sama bertabrakan
// diam-diam saat isinya diekspor atau dicari sebagai satu daftar.
const semuaKode = kartuDaftar.flatMap((k) => k.varian.map((v) => v.kodeVarian));
const kodeGandaLintas = [...new Set(semuaKode.filter((c, i) => semuaKode.indexOf(c) !== i))];
kodeGandaLintas.length === 0
  ? ok('kode varian unik di SELURUH daftar, bukan cuma di dalam tiap kartu')
  : salah(
      'kode varian lintas kartu',
      `${kodeGandaLintas.length} kode dipakai lebih dari sekali: ${kodeGandaLintas[0]}`
    );


// Kolom "Waiting for" benar-benar tidak tampil di halaman.
!isiRegister.includes('Waiting for')
  ? ok('kolom Waiting for tidak ada di halaman Register')
  : salah('kolom Waiting for', 'masih tampil di halaman Register');

// Halaman Register bukan tabel — itu yang diminta: bentuknya kartu produk ala
// etalase, bukan tabel yang mirip Master Data.
!isiRegister.includes('<table') && (isiRegister.match(/data-slot="card"/g) || []).length > 0
  ? ok('halaman Register memakai kartu, bukan tabel')
  : salah('bentuk halaman Register', 'bukan kartu / masih ada <table>');

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

// ===== 6. HPP: dua mode, dua rumus =====

console.log('\n== HPP White Label (beli + kirim) ==');

// ANCHOR. Baris 3 (THB) wajib 152.133,33. Nilai lamanya 78.000 — setengah
// harga belinya sendiri, jadi secara fisik tidak mungkin terjadi. Kalau test ini
// menghasilkan angka lain, rumusnya salah.
const wl3 = hppWL.find((b) => b.id === 3);
wl3.hpp === 152133.33
  ? ok('baris 3 (THB) = 152.133,33')
  : salah('baris 3 (THB)', `dapat ${wl3.hpp}, harus 152133.33`);

// Rinciannya, supaya kegagalan bisa dipersempit: bagian mana yang salah.
wl3.biayaBeli === 148000
  ? ok('  biaya beli = 148.000')
  : salah('biaya beli baris 3', `dapat ${wl3.biayaBeli}, harus 148000`);
wl3.biayaKirim === 4133.33
  ? ok('  biaya kirim = 4.133,33')
  : salah('biaya kirim baris 3', `dapat ${wl3.biayaKirim}, harus 4133.33`);

// Tidak ada baris pun yang boleh HPP-nya di bawah biaya beli. Ini yang membuat
// angka lama kelihatan salah tanpa perlu tahu whence asalnya.
const wlDiBawahBeli = hppWL.filter((b) => b.hpp < b.biayaBeli);
wlDiBawahBeli.length === 0
  ? ok('tidak ada HPP di bawah biaya beli')
  : salah('HPP di bawah biaya beli', `baris ${wlDiBawahBeli.map((b) => b.id).join(', ')}`);

// Baris 1 dan 2 satu shipment yang sama, jadi HPP-nya WAJIB sama. Kalau rumus
// menjumlahkan baris per shipment, keduanya jadi berbeda dan ongkos kirim
// terhitung dua kali.
const wl1 = hppWL.find((b) => b.id === 1);
const wl2 = hppWL.find((b) => b.id === 2);
wl1.hpp === 122500 ? ok('baris 1 = 122.500') : salah('baris 1', `dapat ${wl1.hpp}, harus 122500`);
wl2.hpp === 122500 ? ok('baris 2 = 122.500') : salah('baris 2', `dapat ${wl2.hpp}, harus 122500`);
wl1.hpp === wl2.hpp
  ? ok('baris 1 dan 2 (satu shipment) HPP-nya sama')
  : salah('HPP satu shipment', `${wl1.hpp} vs ${wl2.hpp}`);

const wl4 = hppWL.find((b) => b.id === 4);
wl4.hpp === 61950 ? ok('baris 4 (IDR) = 61.950') : salah('baris 4', `dapat ${wl4.hpp}, harus 61950`);

console.log('\n== HPP Produksi (bahan + ongkos jahit) ==');

// Vera Skirt: 130 pcs. Total biaya dan HPP dihitung dari baris bahan yang
// benar-benar punya harga FIFO.
hppProd.dengan.hpp === 108508
  ? ok('Vera Skirt = 108.508/pcs')
  : salah('HPP Vera Skirt', `dapat ${hppProd.dengan.hpp}, harus 108508`);
hppProd.dengan.totalBiaya === 14106040
  ? ok('  total biaya = 14.106.040')
  : salah('total biaya Vera Skirt', `dapat ${hppProd.dengan.totalBiaya}, harus 14106040`);
hppProd.dengan.jumlahPcsJadi === 130
  ? ok('  pembagi = 130 pcs')
  : salah('jumlahPcsJadi', `dapat ${hppProd.dengan.jumlahPcsJadi}, harus 130`);

// HPP HARUS persis hasil bagi, bukan pembulatan yang kebetulan cocok.
const bagiUlang = fp(hppProd.dengan.totalBiaya / hppProd.dengan.jumlahPcsJadi);
bagiUlang === hppProd.dengan.hpp
  ? ok('  HPP = totalBiaya ÷ 130, bukan angka lain')
  : salah('konsistensi bagi', `${hppProd.dengan.hpp} vs ${bagiUlang}`);

// Tanpa ongkos jahit: HPP TIDAK dihitung. Bukan 0.
hppProd.tanpa.hpp === null
  ? ok('tanpa ongkos jahit, HPP = null (bukan 0)')
  : salah('HPP tanpa ongkos jahit', `dapat ${hppProd.tanpa.hpp}, harus null`);
hppProd.tanpa.tanpaOngkosJahit === true
  ? ok('  ditandai tanpa ongkos jahit')
  : salah('penanda ongkos jahit', 'tidak ditandai');
// Baris bahan tetap ada dan tetap punya harga — yang hilang cuma HPP-nya.
hppProd.tanpa.baris.length === hppProd.dengan.baris.length - 1
  ? ok('  baris bahan tetap dihitung, hanya baris jahit yang hilang')
  : salah('jumlah baris', `${hppProd.tanpa.baris.length} vs ${hppProd.dengan.baris.length - 1}`);


// Presisi dua desimal. Livia Blouse (96 pcs) dipilih karena pembaginya tidak
// membagi rata: 10.733.640 / 96 = 111.808,75 tepat. Kalau HPP dibulatkan ke
// integer, hasilnya 111.809 dan angka koma dua desimalnya hilang.
hppPresisi.hpp === 111808.75
  ? ok('Livia Blouse = 111.808,75 (bukan 111.809)')
  : salah('presisi HPP', `dapat ${hppPresisi.hpp}, harus 111808.75`);
jumlahPcsLB === 96
  ? ok('  pembagi = 96 pcs')
  : salah('pembagi Livia Blouse', `dapat ${jumlahPcsLB}, harus 96`);

// HPP harus selalu punya maksimal dua desimal, di SEMUA kartu - bukan cuma
// yang sengaja dipilih. Kartu yang pembaginya bulat tidak bisa membuktikan apa
// pun, jadi pemeriksaan menyeluruh ini yang menutup celahnya.
const desimalBerlebih = kartuDesimalBerlebih(hppSemua);
desimalBerlebih.length === 0
  ? ok('tidak ada HPP dengan lebih dari 2 desimal di ' + hppSemua.length + ' kartu')
  : salah('desimal berlebih', desimalBerlebih.join(', '));

// KONTROL POSITIF untuk pemeriksaan di atas, dan crucially lewat fungsi yang
// SAMA dengan yang dipakai data asli — bukan predsikat yang ditulis ulang di
// sini. Kalau predsikatnya diduplikasi, mutasi pada yang asli tidak menyentuh
// kontrol, kontrol tetap hijau, dan pemeriksaan yang sudah mati ikut hijau.
//
// Sifat yang diuji: pembulatan ke dua desimal. Yang TERTANGKAP adalah angka
// yang desimalnya lebih dari dua — 111808.754. Angka satu desimal (108508.5)
// dan angka yang sudah bulat harus LOLOS: HPP 111.809 hanya kurang presisi,
// tidak salah, dan presisi sudah dijaga pemeriksaan Livia Blouse di atas.
const desimalPalsu = kartuDesimalBerlebih([
  { nama: '111808.754', hpp: 111808.754 },
  { nama: '108508.5', hpp: 108508.5 },
  { nama: '112868.31', hpp: 112868.31 },
]);
desimalPalsu.length === 1 && desimalPalsu[0] === '111808.754'
  ? ok('kontrol: hanya angka 3 desimal yang tertangkap, 1 desimal lolos')
  : salah('kontrol positif desimal', 'deteksi ' + JSON.stringify(desimalPalsu) + ', harus ["111808.754"]');
hppSemua.length === 10
  ? ok('10 kartu Production dihitung semuanya')
  : salah('jumlah kartu dihitung', `dapat ${hppSemua.length}, harus 10`);

// Tanpa ongkos jahit, HPP HARUS null di setiap kartu - bukan hanya di satu.
const semuaTertahan = hppSemua.filter((r) => r.tanpaJahit !== null);
semuaTertahan.length === 0
  ? ok('tanpa ongkos jahit, HPP null di semua ' + hppSemua.length + ' kartu')
  : salah('HPP tanpa jahit', semuaTertahan.map((r) => r.nama).join(', '));
console.log('\n== Gerbang ongkos jahit ==');

gerbangHppKartu.productionTanpaJahit.bolehLanjut === false
  ? ok('Production tanpa ongkos jahit: kartu tertahan')
  : salah('gerbang ongkos jahit', 'kartu boleh lanjut tanpa ongkos jahit');
gerbangHppKartu.productionTanpaJahit.hpp === null
  ? ok('  HPP yang ditampilkan = null')
  : salah('HPP gerbang', `dapat ${gerbangHppKartu.productionTanpaJahit.hpp}`);
gerbangHppKartu.productionTanpaJahit.alasan
  ? ok('  ada alasan yang tampil di tombol')
  : salah('alasan gerbang', 'tidak ada alasan untuk kartu yang tertahan');
gerbangHppKartu.production.bolehLanjut === true && gerbangHppKartu.production.hpp === 108508
  ? ok('Production dengan ongkos jahit: boleh lanjut, HPP 108.508')
  : salah('gerbang lengkap', JSON.stringify(gerbangHppKartu.production));

console.log('\n== Mode ikut papan, bukan workcode ==');

// Kartu Production dipaksa ke papan White Label: HPP harus berubah ke rumus WL.
gerbangHppKartu.wlDipaksaDariProd.hpp === 152133.33
  ? ok('kartu Production di papan White Label -> HPP White Label')
  : salah('mode ikut papan', `dapat ${gerbangHppKartu.wlDipaksaDariProd.hpp}, harus 152133.33`);

// Kartu White Label dipaksa ke papan Production tanpa ongkos jahit: gerbang
// HARUS menutup, walau workcode-nya WHLB.
gerbangHppKartu.wlDipaksaDariWL.bolehLanjut === false
  ? ok('kartu White Label di papan Production tanpa jahit: tertahan')
  : salah('gerbang lintas papan', 'kartu lolos tanpa ongkos jahit');
gerbangHppKartu.wlDipaksaDariWL.peringatan
  ? ok('  workcode WHLB di papan Production diberi peringatan')
  : salah('peringatan lintas papan', 'tidak ada peringatan');

console.log('\n== Pengecek workcode ==');

const cekSalah = cekWorkcode.filter((c) => !c.cocok);
cekSalah.length === 0
  ? ok('semua workcode cocok dengan papannya')
  : salah(
      'workcode vs papan',
      cekSalah.map((c) => `${c.id}(${c.suffix} di papan ${c.papan})`).join(', ')
    );
cekWorkcode.every((c) => c.peringatan === null)
  ? ok('tidak ada peringatan yang muncul untuk data yang benar')
  : salah('peringatan palsu', 'muncul peringatan pada workcode yang cocok');

// Bila dikacaukan, pengecek HARUS tetap memakai papan dan hanya memberi
// peringatan.
const kacau = cekSumberWorkcode({ workcode: 'PDFF_CSC-SKT-14_B-01_WHLB' }, 'production');
kacau.cocok === false && kacau.peringatan && kacau.peringatan.includes('WHLB')
  ? ok('workcode WHLB di papan Production -> peringatan, bukan mode ganti')
  : salah('pengecak workcode', JSON.stringify(kacau));
const kosongSuffix = cekSumberWorkcode({ workcode: 'PDFF_CSC-SKT-14_B-01' }, 'production');
kosongSuffix.cocok === false
  ? ok('workcode tanpa suffix -> dianggap tidak cocok')
  : salah('suffix kosong', 'lolos dianggap cocok');

console.log('\n== HPP di tabel Production Fulfillment ==');

// Kolom HPP/Selling Price tidak lagi angka literal. Baris WL (Midi Dress)
// sekarang harus menghasilkan HPP White Label, bukan 132.000 yang tertulis dulu.
const tabelWL = hppTabel.find((r) => r.sumber === 'white_label');
tabelWL.hpp === 122500
  ? ok('baris White Label di tabel = 122.500 (HLM 132.000)')
  : salah('HPP tabel White Label', `dapat ${tabelWL.hpp}, harus 122500`);
tabelWL.selling === fp(122500 * margin)
  ? ok('  harga jual = HPP × margin global')
  : salah('harga jual tabel', `dapat ${tabelWL.selling}, harus ${fp(122500 * margin)}`);

// Baris Production (Rowe Tee) dihitung dari kartu papan, bukan dari 78.000.
const tabelProd = hppTabel.find((r) => r.sumber === 'production');
tabelProd.hpp !== angkaLama.hppRowe
  ? ok(`baris Production di tabel bukan angka lama (${angkaLama.hppRowe}) -> ${tabelProd.hpp}`)
  : salah('HPP tabel Production', `masih angka lama ${angkaLama.hppRowe}`);
typeof tabelProd.hpp === 'number' && tabelProd.hpp > 0
  ? ok('  dan hasilnya angka positif, bukan null')
  : salah('HPP tabel Production', `dapat ${tabelProd.hpp}`);

// Harga jual = HPP × margin global, untuk kedua mode. Margin global satu
// angka untuk semua produk — bukan per produk.
const semuaJualBenar = hppTabel.every(
  (r) => r.hpp !== null && r.selling === fp(r.hpp * margin)
);
semuaJualBenar
  ? ok('semua harga jual = HPP × margin global yang sama')
  : salah('margin global', 'harga jual tidak seragam');
margin === 2.4 ? ok('margin global = 2,4') : salah('margin global', `dapat ${margin}`);

// Tidak boleh ada satu pun baris yang HPP-nya lebih kecil dari harga jual.
const jualDiBawahHpp = hppTabel.filter((r) => r.hpp !== null && r.selling < r.hpp);
jualDiBawahHpp.length === 0
  ? ok('tidak ada harga jual di bawah HPP')
  : salah('harga jual di bawah HPP', `${jualDiBawahHpp.length} baris`);

console.log('\n== Kebersihan data HPP ==');

// every() di sini tidak punya filter: yang diperiksa memang SETIAP baris.
// Jumlah barisnya ikut diperiksa, supaya `every` yang somehow tidak pernah dipanggil
// tidak bisa lolos sebagai "semua benar".
//
// Jumlahnya 5, bukan 4, sejak tiket 4. Baris kelima (Luna Pants) ditambahkan
// supaya mode White Label di stage hpp-price punya data: kartu WL tidak punya
// field `kodeShipmentLivou`, jadi `namaProduct` satu-satunya kunci join yang ada
// di kartu dan di tabel shipment. Tanpa baris itu, mode itu tidak pernah punya
// apa pun untuk ditampilkan dan HPP-nya tidak pernah dihitung.
hppWL.length === 5
  ? ok('5 baris White Label diperiksa')
  : salah('jumlah baris WL', `dapat ${hppWL.length}, harus 5`);

// Baris Luna Pants harus ADA dan NAMANYA persis itu.
//
// Pemeriksaan jumlah di atas tidak cukup, dan itu sudah dibuktikan: mengganti
// `namaProduct` baris itu menjadi "Luna Pants (hapus)" tetap menyisakan 5 baris,
// jadi pemeriksaannya hijau — padahal join WL yang utama justru kehilangan
// kuncinya. Join itu membaca `namaProduct`, jadi baris ini adalah hal yang
// mengikat seluruh mode White Label, dan harus diuji sebagai anchor,
// bukan disimpulkan dari jumlahnya.
const anchorLuna = barisContohHpp.find((b) => b.namaProduct === 'Luna Pants');
const anchorLunaAda =
  anchorLuna !== undefined &&
  anchorLuna.actualIdrPaidProduct === 5200000 &&
  anchorLuna.totalPcs === 40;
anchorLunaAda
  ? ok('baris anchor Luna Pants ada persis (kunci join mode White Label)')
  : salah(
      'anchor baris Luna Pants',
      `ditemukan=${anchorLuna !== undefined}, nama yang tersedia=${barisContohHpp
        .map((b) => b.namaProduct)
        .join(', ')}`
    );
// Dua bentuk, karena `every` saja tidak bisa membuktikan bahwa filter-nya
// bekerja. Dua-duanya diperiksa lewat `wlTidakLengkap` yang SAMA: data yang
// benar-benar dihitung, dan kontrol yang sengaja dirusak. Kalau kontrolnya
// tidak tertangkap, berarti filter di atas tidak sedang apa-apa juga. Kalau
// predsikatnya ditulis ulang terpisah untuk kontrol, mutasi pada yang asli
// tidak akan menyentuh kontrol — dan pemeriksaan yang sudah mati ikut hijau.
const wlRusak = wlTidakLengkap([...hppWL, { id: 99, hpp: 1000, biayaBeli: 118125 }]);
wlRusak.length === 1 && wlRusak[0] === 99
  ? ok('kontrol: baris WL yang dirusak tertangkap')
  : salah('kontrol positif WL', 'terdeteksi ' + JSON.stringify(wlRusak) + ', harus [99]');
const wlTidakLengkapAsli = wlTidakLengkap(hppWL);
wlTidakLengkapAsli.length === 0
  ? ok('setiap baris punya HPP di atas atau sama dengan biaya beli')
  : salah('baris WL tidak lengkap', 'baris id ' + wlTidakLengkapAsli.join(', ') + ' tanpa HPP atau di bawah biaya beli');

// ===== HPP yang benar-benar tampil di layar =====
//
// Semua yang di atas memeriksa angka yang DIKEMBALIKAN fungsi. Pertanyaan yang
// belum terjawab: apakah angkanya sampai di layar, sudah diformat sebagai
// rupiah, dan angka lama 78.000 benar-benar hilang dari halaman.
//
// Diperiksa terhadap HTML hasil render, bukan terhadap nilai fungsi — karena
// di situlah bug "hijau di kode, salah di layar" bisa muncul.
console.log('\n== HPP yang tampil di halaman ==');

// Isi sel pada kolom berlabel `labelHeader`, untuk setiap baris tabel.
//
// Dipakai sebagai cara menguji "kolom ini berisi X" tanpa menebak posisi kolom
// di HTML — urutan kolom bisa berubah kapan saja, dan assertion yang bergantung
// pada posisi akan salah tanpa memberi tahu. Baris header dibaca dari tabel
// yang sama, jadi kalau kolomnya dihapus, hasilnya kosong dan assertion
// positif di bawah yang akan menangkapnya.
const potongSelHpp = (html) => {
  const th = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim()
  );
  const idx = th.findIndex((x) => x.includes('HPP Final/pcs'));
  if (idx === -1) return [];
  const baris = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, '').trim()))
    .filter((c) => c.length > idx);
  return baris.map((c) => c[idx]);
};

const teksHalaman = halHpp.replace(/<[^>]+>/g, '|');

// Angka 152.133,33 dibulatkan ke 152.133 saat diformat — sesuai yang ditulis di
// kontrak: "pastikan HPP tampil 152.133 untuk baris THB itu".
const tampilAnchor = /(^|\|)152\.133(\D|$)/.test(teksHalaman) || halHpp.includes('152.133');
tampilAnchor
  ? ok('baris THB tampil 152.133 di halaman')
  : salah('anchor tidak tampil', '152.133 tidak ditemukan di HTML halaman HPP');

// Angka lama harus hilang dari KOLOM HPP — bukan dari seluruh halaman.
//
// "78.000" memang sah muncul di halaman ini: itu `actualIdrPaidLogistic` baris
// 4 (ongkos kirim IDR 78.000), bukan HPP. Jadi yang diperiksa adalah baris
// tablenya, bukan seluruh dokumen — kalau tidak, assertion ini akan salah
//culus dan tetap hijau setelah HPP-nya benar.
// Dipakai `barisContoh` baris 4 sebagai patokan: kalau suatu saat angka
// ongkos kirimnya berubah, assertion ini ikut adaptsi.
const barisKe4 = barisContohHpp.find((b) => b.id === 4);
const ongkosKirimSah = barisKe4.actualIdrPaidLogistic === 78000;

// Yang dicari: 78.000 muncul DI DALAM sel HPP, yaitu sesudah label
// "HPP Final/pcs" di header dan sebelum sel berikutnya pada baris yang sama.
const selHppBaris4 = potongSelHpp(halHpp);
const hppBaris4Sah = selHppBaris4.every((s) => !s.includes('78.000'));
ongkosKirimSah && hppBaris4Sah
  ? ok('angka lama 78.000 tidak muncul di kolom HPP')
  : salah(
      'angka lama masih tampil di kolom HPP',
      'ongkos kirim sah=' + ongkosKirimSah + ', sel HPP baris bermasalah=' + JSON.stringify(selHppBaris4)
    );

// KONTROL POSITIF: kalau halaman ini ternyata kosong atau tidak punya kolom
// HPP sama sekali, semua pemeriksaan "tidak muncul angka lama" di atas akan
// hijau karena tidak ada apa pun yang salah. Halaman harus benar-benar punya
// isi.
const halamanAdaIsi = halHpp.includes('HPP Final/pcs');
halamanAdaIsi
  ? ok('kolom HPP Final/pcs benar-benar ada di halaman')
  : salah('kolom HPP tidak ada', 'label "HPP Final/pcs" tidak ditemukan — pemeriksaan di atas tidak berarti apa-apa');

// ===== Stage HPP & Price: dua mode, angka persis =====

console.log('\n== Stage HPP & Price ==');

// -- Anchors
//
// Angka di bawah adalah hasil hitung yang SEHARUSNYA muncul. Hitungannya
// ditulis di sini, bukan diambil dari kode yang sedang diuji — kalau test
// mengambil angkanya dari `hppProduksi()`, ia akan menguji fungsi terhadap
// dirinya sendiri, dan mutasi pada fungsi itu tidak akan pernah terlihat.
//
//   Production (Vera Skirt, p-08) : ongkos jahit ada, jadi HPP terhitung.
//   White Label (Luna Pants, w-06): 5.200.000/40 + 78.000/40 = 130.000 + 1.950.
//
// Angka Production diambil dari perhitungan nyata supaya nilainya pasti benar;
// nilainya sendiri DICEK ULANG di sini lewat `hppProduksi` yang sudah diuji
// di bagian sebelumnya, jadi kalau ada yang salah, salah di dua tempat dan
// ketahuan.

const luna = barisContohHpp.find((b) => b.namaProduct === 'Luna Pants');
const HPP_LUNA_TEPATI = 131950;
const JUAL_LUNA_TEPATI = 316680; // 131.950 × 2,4

const hppLunaSebenarnya = hppWhiteLabel(luna).hpp;
const hppLunaBenar = hppLunaSebenarnya === HPP_LUNA_TEPATI;
hppLunaBenar
  ? ok('HPP Luna Pants = 131.950 (bukan field literal)')
  : salah('anchor HPP Luna Pants', `dapat ${hppLunaSebenarnya}, harus ${HPP_LUNA_TEPATI}`);

const jualLunaSebenarnya = hargaJual(hppLunaSebenarnya);
const jualLunaBenar = jualLunaSebenarnya === JUAL_LUNA_TEPATI;
jualLunaBenar
  ? ok('harga jual Luna Pants = 316.680 (HPP × margin global)')
  : salah('anchor harga jual Luna', `dapat ${jualLunaSebenarnya}, harus ${JUAL_LUNA_TEPATI}`);

// KONTROL POSITIF untuk yang di atas: kalau `hppWhiteLabel` mengembalikan 0 atau
// NaN, `===` akan tetap gagal — tapi kalau barisnya `find` mengembalikan
// `undefined`, pemanggilnya akan melempar, bukan menghasilkan angka apa pun. Jadi
// dicek eksplisit bahwa barisnya benar-benar ketemu.
const lunaDitemukan = luna !== undefined;
lunaDitemukan
  ? ok('baris shipment Luna Pants ditemukan di tabel HPP')
  : salah('baris Luna Pants', 'tidak ditemukan — semua angka HPP di bawah tidak berarti apa-apa');

// -- Mode Production
const prodAdaTabel = seksiHppProd.includes('Harga FIFO');
const prodPunyaJahit = seksiHppProd.includes('Ongkos jahit');
// Baris cmt_cost harus TERPISAH dari tabel bahan, bukan jadi baris terakhir di
// antaranya. Kalau ditambahkan sebagai baris biasa, ia akan tercampur dengan
// kain dan pemeriksa ini tidak bisa membedakannya.
const jahitTerpisah = !/<td[^>]*>Ongkos Jahit Konveksi<\/td>/.test(seksiHppProd);
prodAdaTabel && prodPunyaJahit && jahitTerpisah
  ? ok('mode Production: tabel bahan + blok ongkos jahit terpisah')
  : salah(
      'mode Production',
      `tabel bahan=${prodAdaTabel}, blok jahit=${prodPunyaJahit}, jahit terpisah=${jahitTerpisah}`
    );

// Harga jual harus TERHITUNG, bukan input. Yang diperiksa adalah KETERANGAN
// YANG BERDEKATAN dengan angkanya, bukan keberadaan kata "margin global" di
// mana saja pada halaman.
//
// Versi pertama pemeriksaan ini cuma `includes('margin global')` — dan itu
// selalu hijau: kata itu juga muncul di keterangan kotak bukti selling-price,
// jadi menghapus baris yang menampilkan margin di sebelah harga jual tidak
// mengubah apa pun yang diukur. Pola yang dipakai di bawah mengapit baris itu
// dengan penanda yang hanya ada di sana.
const penandaMargin = [
  'HPP ×',
  String(MARGIN_HARGA_JUAL).replace('.', ','),
  '(margin global)',
].join(' ');

// Longgar sedikit: 'renderToStaticMarkup' bisa menyisipkan spasi di sekitar
// ekspresi, jadi yang diuji adalah urutan ketiga pecahan itu, bukan string
// yang dirakit persis.
const jualTerhitung = new RegExp(
  'HPP\\s*×[^<]*' +
    String(MARGIN_HARGA_JUAL).replace('.', ',') +
    '[^<]*margin global'
).test(seksiHppProd);
jualTerhitung
  ? ok('harga jual ditampilkan sebagai hasil hitung (bukan input)')
  : salah(
      'harga jual',
      `pola "${penandaMargin}" tidak muncul di sebelah angka harga jual`
    );

// Kontrol negatif: kata "margin global" ADA di markup ini — di keterangan kotak
// bukti selling-price — tapi TANPA angka margin dan tanpa tanda kali. Kalau pola
// di atas ikut cocok di situ, ia hanya sedang mencocokkan kata itu, bukan
// membuktikan bahwa harga jualnya hasil hitung.
const adaKataTanpaAngka = seksiHppProd.includes('margin global');
const polaButuhAngka =
  adaKataTanpaAngka &&
  !/margin global[^<]*\*/.test(seksiHppProd) &&
  !new RegExp('margin global[^<]*' + String(MARGIN_HARGA_JUAL).replace('.', ',')).test(
    seksiHppProd
  );
polaButuhAngka
  ? ok('kontrol: pola margin menuntut ANGKA margin, bukan cuma katanya')
  : salah(
      'kontrol pola margin',
      'kata "margin global" muncul tanpa angka, jadi pola tidak membuktikan apa pun'
    );

// -- Mode White Label
//
// "Kurs" di sini berarti blok yang neklar menampilkan label dan NILAINYA,
// bukan sekadar kata "kurs" yang muncul. Label tanpa angka tidak berguna: yang
// perlu dicek orang adalah berapa, bukan bahwa ada.
const wlKursLabel = /Kurs\s*IDR/.test(seksiHppWl);
const wlKursNilai = /1 IDR = Rp[\s\S]{0,3}1/.test(seksiHppWl);
wlKursLabel && wlKursNilai
  ? ok('mode White Label: kurs tampil menonjol dengan nilainya')
  : salah('kurs WL', `label=${wlKursLabel}, nilai=${wlKursNilai}`);

const wlBeli = seksiHppWl.includes('Biaya beli');
const wlKirim = seksiHppWl.includes('Biaya kirim');
wlBeli && wlKirim
  ? ok('mode White Label: beli dan kirim ditampilkan terpisah')
  : salah('WL komponen', `beli=${wlBeli}, kirim=${wlKirim}`);

// -- Angka PERSIS yang sampai ke markup
//
// Markup berisi angka yang sudah diformat `Intl` id-ID. Perhatikan: hasilnya
// `Rp 131.950` — dengan SPASI TIDAK TERPUTUS, bukan `Rp131.950`. Assertion yang
// mengetik ulang string-nya sendiri akan gagal pada format yang sebenarnya
// benar, jadi polanya di sini longgar pada pemisah dan ketat pada angkanya.
const adaRupiah = (html, angka) =>
  new RegExp('Rp[\\s\\u00a0]*' + angka.replace(/\./g, '\\.') + '(?![0-9])').test(html);

const wlTepat = adaRupiah(seksiHppWl, '131.950');
wlTepat
  ? ok('HPP 131.950 benar-benar muncul di markup mode White Label')
  : salah('HPP WL di markup', 'Rp 131.950 tidak ditemukan — angka yang tampil bukan yang dihitung');

const jualTepat = adaRupiah(seksiHppWl, '316.680');
jualTepat
  ? ok('harga jual 316.680 muncul di markup')
  : salah('harga jual di markup', 'Rp 316.680 tidak ditemukan');

// KONTROL POSITIF untuk `adaRupiah`: kalau polanya terlalu longgar (misalnya
// hanya cocok dengan digit mana pun), kedua assertion di atas akan hijau karena
// alasan angka yang salah. Angka yang TIDAK boleh ada diperiksa dengan fungsi
// yang SAMA.
const kontrolAngka = adaRupiah(seksiHppWl, '999.999');
kontrolAngka === false
  ? ok('pencocokan rupiah tidak asal cocok (kontrol 999.999 ditolak)')
  : salah('adaRupiah terlalu longgar', 'Rp 999.999 ikut cocok');

// KONTROL POSITIF: angka HPP dan harga jual harus DIBEDAKAN. Kalau keduanya
// sengaja disamakan, assertion di atas akan tetap hijau — dan harga jual yang
// sama dengan HPP berarti margin tidak pernah diterapkan, yang justru kesalahan
// yang paling mahal untuk kalau ini salah.
const duaAngkaBerbeda = HPP_LUNA_TEPATI !== JUAL_LUNA_TEPATI && MARGIN_HARGA_JUAL !== 1;
duaAngkaBerbeda
  ? ok('margin global diterapkan (harga jual ≠ HPP)')
  : salah('margin', `margin=${MARGIN_HARGA_JUAL}, HPP=${HPP_LUNA_TEPATI}`);

// -- Mode White Label tanpa baris shipment
//
// Harus MENOLAK, bukan menampilkan 0. Nol akan terbaca sebagai "gratis" dan
// kartu boleh lanjut ke Upload dengan angka itu.
const kosongMenolak = seksiHppWlKosong.includes('Belum ada baris shipment');
const kosongTanpaAngka = !adaRupiah(seksiHppWlKosong, '0');
kosongMenolak && kosongTanpaAngka
  ? ok('WL tanpa baris shipment: menolak dengan alasan, bukan HPP nol')
  : salah('WL tanpa baris', `menolak=${kosongMenolak}, tanpa angka nol=${kosongTanpaAngka}`);

// -- Nama produk ambigu
const ambiguDitolak = seksiHppWlAmbigu.includes('lebih dari satu baris shipment');
// 148.500 = HPP baris 3 (THB). Kalau join ambigu diam-diam memakai baris
// pertama, angka inilah yang akan muncul di layar — jadi tidak adanya angka itu
// bukti bahwa penolakan benar-benar terjadi, bukan hanya teks unfortunately.
const ambiguTanpaAngka = !adaRupiah(seksiHppWlAmbigu, '148.500');
ambiguDitolak && ambiguTanpaAngka
  ? ok('WL ambigu: menolak, tidak diam-diam memakai baris pertama')
  : salah('WL ambigu', `ditolak=${ambiguDitolak}, tanpa angka=${ambiguTanpaAngka}`);

// -- Dua bukti, dengan id yang sama dengan nama kolom di ProductionFulfillment
const buktiIds = renderHppPrice.jenisBukti;
const duaBukti =
  buktiIds.length === 2 &&
  buktiIds[0] === 'kalkulasi-hpp' &&
  buktiIds[1] === 'kalkulasi-selling-price';
duaBukti
  ? ok('dua jenis bukti: kalkulasi-hpp + kalkulasi-selling-price')
  : salah('jenis bukti HPP', JSON.stringify(buktiIds));

const kotakBuktiTerlihat =
  seksiHppProd.includes('Bukti Kalkulasi HPP') &&
  seksiHppProd.includes('Bukti Kalkulasi Selling Price');
kotakBuktiTerlihat
  ? ok('kedua kotak bukti tampil di stage HPP')
  : salah('kotak bukti HPP', 'salah satu atau keduanya tidak dirender');

// -- Bukti tidak menahan kartu
//
// Tanpa ini, assertion "tombol lanjut" tidak berarti apa-apa: stage yang
// menampilkan tombol aktif pun belum tentu bisa ditekan lewat.
//
// Dicek dari ATRIBUT `disabled`, bukan dari kata "disabled" di markup. Class
// Button dari Base UI memuat `disabled:pointer-events-none` dan
// `disabled:opacity-50` di setiap instance — jadi pencarian teks akan selalu
// menemukan "disabled" pada tombol yang justru AKTIF. Versi assertion yang
// salah itu hijau-atau-merah tanpa ada kaitan sama sekali dengan state tombol.
const tombolLanjut = (
  seksiHppWl.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?Lanjut ke(?:(?!<\/button>)[\s\S])*?<\/button>/) || [
    '',
  ]
)[0];
const tombolAda = tombolLanjut !== '';
const tombolNonaktif = /\sdisabled(\s|=|>|\/)/.test(tombolLanjut);
tombolAda && !tombolNonaktif
  ? ok('WL dengan baris shipment: tombol lanjut aktif (bukti tidak menahan)')
  : salah('tombol lanjut WL', `ditemukan=${tombolAda}, punya atribut disabled=${tombolNonaktif}`);

// KONTROL POSITIF untuk cara membaca atribut itu: dirakit dari potongan markup
// yang benar-benar ada di halaman ini, supaya pola yang sama diuji terhadap
// kedua keadaan. Tanpa ini, pola `disabled` yang terlalu longgar (misalnya
// mencocokkan kata itu di dalam class) tidak akan pernah ketahuan.
const tombolDisabledAsli = '<button type="button" disabled class="x">Lanjut ke Upload</button>';
const polaTangkapNonaktif = /\sdisabled(\s|=|>|\/)/;
const kontrolNonaktif = polaTangkapNonaktif.test(tombolDisabledAsli);
const kontrolAktif = polaTangkapNonaktif.test('<button type="button" class="disabled:opacity-50">Lanjut ke Upload</button>');
kontrolNonaktif && !kontrolAktif
  ? ok('pembacaan atribut disabled membedakan aktif dan nonaktif')
  : salah(
      'pola atribut disabled',
      `nonaktif tertangkap=${kontrolNonaktif}, aktif salah tertangkap=${kontrolAktif}`
    );

// -- Routing di IsiPopup
//
// Semua pemeriksaan angka HPP di atas merender 'SeksiHppPrice' LANGSUNG. Kalau
// routing di 'IsiPopup' mati — 'bisaHpp' salah, atau 'renderHpp' tidak
// diteruskan — semua 17 pemeriksaan itu tetap hijau, karena tidak satu pun
// melewati 'IsiPopup'. Seksi jadi tidak akan pernah muncul di popup sungguhan
// dan tidak ada yang gagal.
//
// Yang diperiksa di sini adalah markup popup yang sudah dirender lewat
// 'IsiPopup', bukan komponennya.
const popupHppProd = popupPerStage['hpp-price'];
const teksBelumAda = 'Belum ada isi khusus';

// Angka Production diambil dari 'renderHppPrice.hppProd' — hasil 'hppProduksi()'
// untuk kartu Production di stage ini, bukan konstanta yang diketik di test.
// Versi pertama pemeriksaan ini memakai 131.950, itu angka White Label, dan
// gagal: kartu Production punya BOM sendiri. Menyalin angka dari mode lain
// persis seperti yang salah di sini.
const rupiahProd = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(renderHppPrice.hppProd.hpp);

const routingProduction =
  typeof popupHppProd === 'string' &&
  popupHppProd.includes('HPP &amp; Price') &&
  adaRupiah(popupHppProd, rupiahProd.replace(/^Rp[\s ]*/, ''));
routingProduction
  ? ok('routing: stage hpp-price di popup Production menampilkan HPP')
  : salah(
      'routing HPP Production',
      `popup ada=${popupHppProd !== undefined}, teks HPP=${popupHppProd?.includes(
        'HPP &amp; Price'
      )}, angka ${rupiahProd}=${popupHppProd ? adaRupiah(popupHppProd, rupiahProd) : 'n/a'}`
    );

// Mode White Label di popup-nya sendiri. Yang diperiksa adalah tabel + kurs
// milik WL, bukan angkanya: kalau routing WL diam-diam memakai mode
// Production, angka HPP tetap muncul dan pemeriksaan ini akan tetap hijau.
const routingWl =
  popupHppWl.includes('Kurs') &&
  popupHppWl.includes('Biaya kirim') &&
  adaRupiah(popupHppWl, '131.950');
routingWl
  ? ok('routing: stage hpp-price di popup White Label memakai mode WL')
  : salah('routing HPP WL', 'kurs/biaya kirim tidak ada di popup White Label');

// Kontrol: 'hpp-price' harus TIDAK jatuh ke 'SeksiBelumAda'. Kalau iya, yang
// hijau di atas cuma karena popup itu sebenarnya kosong — dan markup yang
// 'Belum ada isi khusus' memuat sama sekali tidak ada bagian HPP-nya.
const bukanFallback = !popupHppProd.includes(teksBelumAda) && !popupHppWl.includes(teksBelumAda);
bukanFallback
  ? ok('routing: hpp-price tidak jatuh ke "Belum ada isi khusus"')
  : salah('routing hpp-price fallback', 'popup hpp-price menampilkan teks stage kosong');

// Sebaliknya, stage yang memang belum punya alur HARUS tetap falling through.
// Tanpa ini, perbaikan di atas bisa lulus dengan membiarkan SEMUA stage
// menampilkan 'SeksiBelumAda' di samping isi yang benar.
//
// Setelah tiket 3, tinggal 'receive' yang menjadi bukti bahwa fallback-nya
// hidup — 'finance-validate' sudah punya seksi sendiri, dan pemeriksaannya ada
// di blok tiket 3 di bawah.
const stageLainMasihKosong = popupPerStage['receive']?.includes(teksBelumAda) === true;
stageLainMasihKosong
  ? ok('routing: stage tanpa alur tetap menampilkan "Belum ada isi khusus"')
  : salah('routing stage kosong', 'receive tidak lagi menampilkan teks stage kosong');

// Dan tiga stage yang sudah punya seksi TIDAK BOLEH lagi menampilkannya.
// Diperiksa terpisah dari yang di atas: kalau digabung jadi satu syarat,
// jawabannya cuma "ada yang berubah" — bukan "yang berubah memang yang ini".
// 'invoice-logistic' tidak ada di papan Production, jadi ia diperiksa lewat
// popup White Label di blok tiket 5.
const stageBaruTidakKosong =
  popupPerStage['invoice-product']?.includes(teksBelumAda) === false &&
  popupPerStage['upload']?.includes(teksBelumAda) === false;
stageBaruTidakKosong
  ? ok('routing: invoice-product & upload tidak lagi jatuh ke "Belum ada isi khusus"')
  : salah(
      'routing stage tiket 5',
      `invoice-product=${popupPerStage['invoice-product']?.includes(teksBelumAda)}, upload=${popupPerStage['upload']?.includes(teksBelumAda)} — keduanya harus false`
    );

// Kontrol positif untuk routing-nya sendiri: teks 'Belum ada isi khusus' benar
// ada di markup Asli pada tahap ini (dari stage yang memang belum punya alur),
// jadi pola yang dipakai di atas bukan sekadar tidak cocok pada apa pun.
const polaFallbackSering = popupPerStage['receive']?.split(teksBelumAda).length - 1;
const fallbackDitemukan = polaFallbackSering === 1;
fallbackDitemukan
  ? ok('kontrol: pola teks fallback benar-benar cocok pada stage kosong')
  : salah('kontrol fallback', `kemunculan=${polaFallbackSering}, harusnya tepat 1`);

// -- Bukti dibaca dari kartu yang benar
//
// Store bukti di sini sengaja punya file untuk DUA kartu, dengan nama berbeda.
// Kalau 'IsiPopup' meneruskan peta seluruh kartu (bukan `buktiHpp[kartu.id]`),
// popup ini akan menampilkan file kartu yang salah — dan karena nama filenya
// berbeda, itu tidak mungkin lolos tanpa terlihat.
const buktiMilikSendiri = popupHppWlTerisi.includes('HITUNGAN-HPP-KARTU-INI.pdf');
const bukanBuktiKartuLain = !popupHppWlTerisi.includes('HITUNGAN-HPP-KARTU-LAIN.pdf');
buktiMilikSendiri && bukanBuktiKartuLain
  ? ok('routing: bukti HPP diambil dari kartu yang dibuka, bukan peta semua kartu')
  : salah(
      'bukti per kartu',
      `file sendiri tampil=${buktiMilikSendiri}, file kartu lain ikut tampil=${!bukanBuktiKartuLain}`
    );

// Kontrol positif: kedua nama file itu benar-benar ada di store yang dioper.
// Tanpa ini, pemeriksaan di atas bisa hijau karena nama filenya tidak pernah
// dirender — mis. karena KotakBukti gagal memuat berkasnya.
const kontrolNamaFile = jumlahKartuBukti === 2;
kontrolNamaFile
  ? ok('kontrol: store bukti uji punya dua kartu dengan nama file berbeda')
  : salah('kontrol store bukti', 'penyusun store bukti uji tidak menghasilkan dua kartu');

// Bukti HPP sudah ada untuk 'kalkulasi-hpp' tapi belum untuk
// 'kalkulasi-selling-price'. Status di bawah kotak harus menyebut yang kedua —
// kalau hanya yang pertama, statusnya dilaporkan benar padahal separuh belum ada.
const statusMenyebutSelling = popupHppWlTerisi.includes('Bukti Kalkulasi Selling Price');
statusMenyebutSelling
  ? ok('routing: status kelengkapan menyebut jenis bukti yang masih kosong')
  : salah('status bukti', 'jenis bukti yang kosong tidak disebut di status');

// -- Terkunci menutup management bukti
//
// `IsiPopup` meneruskan `sudahDisetujui` sebagai `terkunci`. Kalau tidak,
// kartu yang datanya sudah dibekukan masih bisa ditambah atau dihapus buktinya.
//
// Yang diuji adalah MEKANISMENYA, yaitu penghapusan tombol — bukan atribut
// `disabled`. Versi pertama pemeriksaan ini menghitung tombol nonaktif dan
// gagal: `KotakBukti` (seperti `SeksiCutting`) tidak mematikan tombolnya, tapi
// MELHAPUS-nya, supaya tidak ada tombol mati yang kelihatan bisa diklik lalu
// tidak terjadi apa-apa. Teks pengumumannya juga jadi bagian pemeriksaan:
// menyetir ke teks yang salah hanya menjatuhkan fungsi ini di UI.
const teksTerkunci = 'Bukti ini sudah tercatat dan tidak bisa diubah';
const terkunciMenutupUnggah = popupHppTerkunci.includes(teksTerkunci);
const terkunciTanpaHapus = !popupHppTerkunci.includes('aria-label="Hapus ');
const terkunciTanpaUnggah = !popupHppTerkunci.includes('>Unggah<');
terkunciMenutupUnggah && terkunciTanpaHapus && terkunciTanpaUnggah
  ? ok('routing: kartu terkunci menutup management bukti HPP')
  : salah(
      'terkunci HPP',
      `pengumuman=${terkunciMenutupUnggah}, tombol hapus=${terkunciTanpaHapus}, tombol unggah=${terkunciTanpaUnggah}`
    );

// Kontrol negatif: popup yang TIDAK terkunci harus tetap punya management bukti.
// Tanpa ini, pemeriksaan di atas bisa hijau karena `KotakBukti` tidak pernah
// merender tombolnya sama sekali di kedua keadaan.
const tidakTerkunciPunyaKelolaan =
  popupHppWl.includes('>Unggah<') && !popupHppWl.includes(teksTerkunci);
tidakTerkunciPunyaKelolaan
  ? ok('kontrol: popup tidak terkunci tetap punya tombol unggah bukti')
  : salah(
      'kontrol terkunci',
      'popup tidak terkunci kehilangan tombol unggah, atau menampilkan teks terkunci'
    );

// -- Label tombol lanjut menyebut stage tujuan
//
// `tujuan` diteruskan ke `SeksiHppPrice` untuk mengetik label tombolnya. Kalau
// tidak diteruskan, tombolnya berbunyi "Lanjut ke stage berikutnya" — kalimat
// yang benar secara tata bahasa dan tidak berguna sama sekali, karena orang
// yang membaca popup tidak bisa tahu kartunya akan pindah ke mana.
//
// Versi pertama pemeriksaan ini membandingkan label kedua papan dan mengira
// keduanya berbeda. Kenyataannya sama: di Production maupun White Label,
// tahap setelah HPP & Price adalah Upload. Jadi perbandingan antar papan tidak
// bisa jadi pembeda di sini — yang bisa adalah membandingkan popup yang PUNYA
// tujuan dengan popup yang tidak punya sama sekali.
const tanpaTujuan = popupHppTanpaTujuan;
const labelTujuan = 'Lanjut ke Upload';
const adaLabelTujuan = popupHppWl.includes(labelTujuan);
const tanpaPakaiCadangan = tanpaTujuan.includes('Lanjut ke stage berikutnya');
adaLabelTujuan && tanpaPakaiCadangan
  ? ok('routing: tombol lanjut menyebut stage tujuan, bukan "stage berikutnya"')
  : salah(
      'label tujuan HPP',
      `punya label tujuan=${adaLabelTujuan}, tanpa tujuan pakai kalimat cadangan=${tanpaPakaiCadangan}`
    );

// Kontrol: kedua papan memang menuju stage yang sama, jadi label di atas
// benar untuk keduanya — bukan cuma kebetulan cocok untuk satu papan.
const tujuanDuaPapanSama =
  tujuanHpp.production === 'Upload' && tujuanHpp.whitelabel === 'Upload';
tujuanDuaPapanSama
  ? ok('kontrol: tujuan kedua papan memang sama (Upload)')
  : salah(
      'kontrol tujuan papan',
      `tujuan production=${tujuanHpp.production}, WL=${tujuanHpp.whitelabel}`
    );

// ===== Tiket 5: tiga tahap akhir =====

console.log('\n== Tiket 5: Invoice Logistic / Invoice Product / Upload ==');

// -- Invoice Logistic: HANYA di papan White Label.
//
// Dua sisi diperiksa, dan keduanya perlu. Sisi pertama: papannya memang tidak
// punya kolom itu. Sisi kedua: popupnya memang bisa merender seksinya.
// Kalau hanya sisi pertama yang diperiksa, seksi yang tidak pernah bisa dibuka
// tetap lolos — dan sebaliknya, seksi yang benar tapi kolomnya salah taruh
// membuat kartu White Label kehilangan tempat mendarat.
const prodTanpaInvLogistic = !idStage.produksi.includes('invoice-logistic');
const wlPunyaInvLogistic = idStage.whitelabel.includes('invoice-logistic');
prodTanpaInvLogistic && wlPunyaInvLogistic
  ? ok('papan: invoice-logistic hanya ada di White Label')
  : salah(
      'papan invoice-logistic',
      `Production punya=${!prodTanpaInvLogistic}, White Label punya=${wlPunyaInvLogistic}`
    );

// Dan kolomnya benar-benar muncul di papan yang dirender, bukan cuma di data.
// Dihitung dari markup, sama seperti jumlah kolom di pemeriksaan papan.
const kolomInvLogistic = (whitelabel.match(/data-slot="kanban-column"/g) || []).length;
// 7 kolom: Propose, Invoice Logistic, Receive, Invoice Product, HPP, Upload, Finance.
kolomInvLogistic === 7
  ? ok('papan White Label tetap 7 kolom setelah tiket 5')
  : salah('jumlah kolom WL', `dapat ${kolomInvLogistic}, harus tetap 7`);
!produksi.includes('>Invoice Logistic<')
  ? ok('papan Production TIDAK punya kolom "Invoice Logistic"')
  : salah('kolom Invoice Logistic di Production', 'muncul — seharusnya hanya di White Label');

// Kontrol positif untuk pola di atas: header kolom yang SAMA harus tertangkap
// di papan White Label. Tanpa ini, pola '>Invoice Logistic<' bisa saja tidak
// cocok dengan markup header mana pun — dan "tidak ada di Production" jadi
// benar untuk alasan yang salah, yaitu karena polanya memang tidak pernah
// cocok. Sudah kejadian di repo ini: pemeriksaan yang hijau karena polanya
// salah, bukan karena datanya benar.
whitelabel.includes('>Invoice Logistic<')
  ? ok('kontrol: pola header kolom benar-benar cocok di papan White Label')
  : salah(
      'kontrol pola header',
      '">Invoice Logistic<" tidak cocok bahkan di papan yang punya kolom itu — pola header salah'
    );

// -- Isi ketiga seksi benar-benar ter-render, bukan fallback.
const seksiKosong = 'Belum ada isi khusus';
const invLogisticTampil =
  popupInvLogistic.includes('Invoice Logistic') && !popupInvLogistic.includes(seksiKosong);
invLogisticTampil
  ? ok('popup: stage invoice-logistic menampilkan seksinya')
  : salah('seksi invoice-logistic', 'tidak tampil atau jatuh ke fallback');

const invProductTampil =
  popupInvProduct.includes('Invoice Product') && !popupInvProduct.includes(seksiKosong);
invProductTampil
  ? ok('popup: stage invoice-product menampilkan seksinya')
  : salah('seksi invoice-product', 'tidak tampil atau jatuh ke fallback');

const uploadTampil = popupUpload.includes('Upload') && !popupUpload.includes(seksiKosong);
uploadTampil
  ? ok('popup: stage upload menampilkan seksinya')
  : salah('seksi upload', 'tidak tampil atau jatuh ke fallback');

// Kontrol negatif: ketiga seksi itu tidak boleh saling tertukar. Kalau routing
// salah pasang (mis. 'upload' merender SeksiInvoiceProduct), pemeriksaan di
// atas tetap hijau karena teksnya mirip. Yang membedakan adalah judul
// seksinya, dan judul itu harus muncul di popup yang BENAR.
const judulTertukar =
  popupInvLogistic.includes('Bukti Invoice Product') ||
  popupInvProduct.includes('Bukti Invoice Logistic') ||
  popupUpload.includes('Bukti Invoice');
judulTertukar
  ? salah('routing tiket 5', 'sebuah popup menampilkan kotak bukti milik tahap lain')
  : ok('routing: tiap tahap menampilkan kotak buktinya sendiri');

// -- Dua jalur Invoice Product: field bukti BERBEDA, tidak pernah bersamaan.
//
// Yang dibandingkan adalah KEDUA arah sekaligus. Memeriksa satu arah saja
// (mis. "yang muncul memang proofPaymentProduct") tetap hijau kalau popupnya
// menampilkan KEDUA kotak — dan justru itu yang dilarang owner.
const livouPunyaSendiri = popupInvProductLivou.includes('Bukti Pembayaran Product');
const livouTanpaReimburse = !popupInvProductLivou.includes('Bukti Reimburse');
const reimbursePunyaSendiri = popupInvProductReimburse.includes('Bukti Reimburse');
const reimburseTanpaLivou = !popupInvProductReimburse.includes('Bukti Pembayaran Product');

livouPunyaSendiri && livouTanpaReimburse
  ? ok('jalur livou_transfer: kotak Bukti Pembayaran Product')
  : salah(
      'jalur livou_transfer',
      `kotak pembayaran=${livouPunyaSendiri}, kotak reimburse ikut muncul=${!livouTanpaReimburse}`
    );
reimbursePunyaSendiri && reimburseTanpaLivou
  ? ok('jalur reimbursement: kotak Bukti Reimburse')
  : salah(
      'jalur reimbursement',
      `kotak reimburse=${reimbursePunyaSendiri}, kotak pembayaran ikut muncul=${!reimburseTanpaLivou}`
    );

// Dan yang lebih penting: jalur yang BELUM dipilih tidak boleh meminta
// keduanya. Kartu yang belum tahu jalurnya akan menuntut berkas yang mungkin
// bukan miliknya, dan pemiliknya mencari file yang tidak pernah ada.
const tanpaJalurPunyaDua =
  popupInvProduct.includes('Bukti Pembayaran Product') ||
  popupInvProduct.includes('Bukti Reimburse');
!tanpaJalurPunyaDua
  ? ok('jalur belum dipilih: tidak menuntut bukti jalur mana pun')
  : salah('jalur kosong', 'kotak bukti jalur muncul padahal jalurnya belum dipilih');

// Id jenis buktinya diperiksa langsung, bukan cuma judulnya. Judul bisa sama
// sementara id-nya salah, dan id itulah yang menentukan berkasnya disimpan di
// tempat yang benar.
const idLivouBenar =
  buktiPerJalur.livouTransfer.length === 2 &&
  buktiPerJalur.livouTransfer.includes('invoiceProduct') &&
  buktiPerJalur.livouTransfer.includes('proofPaymentProduct') &&
  !buktiPerJalur.livouTransfer.includes('proofReimburse');
const idReimburseBenar =
  buktiPerJalur.reimbursement.length === 2 &&
  buktiPerJalur.reimbursement.includes('invoiceProduct') &&
  buktiPerJalur.reimbursement.includes('proofReimburse') &&
  !buktiPerJalur.reimbursement.includes('proofPaymentProduct');
idLivouBenar && idReimburseBenar
  ? ok('id jenis bukti kedua jalur benar dan tidak saling silang')
  : salah(
      'id bukti per jalur',
      `livou=${JSON.stringify(buktiPerJalur.livouTransfer)}, reimburse=${JSON.stringify(buktiPerJalur.reimbursement)}`
    );

// Tanpa jalur: HANYA invoice-nya. Ini pembeda antara "belum tahu" dan
// "dianggap transfer" — yang kedua menuntut bukti pembayaran tanpa dasar.
const idTanpaJalurBenar =
  buktiPerJalur.tanpaJalur.length === 1 && buktiPerJalur.tanpaJalur[0] === 'invoiceProduct';
idTanpaJalurBenar
  ? ok('tanpa jalur: hanya bukti invoice yang dituntut')
  : salah('id bukti tanpa jalur', JSON.stringify(buktiPerJalur.tanpaJalur));

// Kontrol: kelima daftar itu memang berbeda-beda. Kalau `jenisBuktiTahap`
// mengembalikan daftar yang sama untuk semua tahap, seluruh pemeriksaan di
// atas bisa hijau sekaligus tanpa satu pun tahap punya kotaknya sendiri.
const daftarUnik = new Set([
  buktiPerJalur.livouTransfer.join(','),
  buktiPerJalur.reimbursement.join(','),
  buktiPerJalur.invLogistic.join(','),
  buktiPerJalur.upload.join(','),
]).size;
daftarUnik === 4
  ? ok('kontrol: empat daftar jenis bukti memang berbeda semua')
  : salah('kontrol jenis bukti', `hanya ${daftarUnik} daftar yang unik dari 4`);

// -- Upload: angka itu JUMLAH PCS, bukan hitungan berkas.
//
// Owner mengoreksi dugaan awal: 'jumlahUploadPos' adalah jumlah pcs yang sudah
// masuk POS. Karena itu ia harus jadi KOTAK ANGKA, bukan kotak unggah berkas.
// Dibedakan dari markup: input angka punya `type="number"`, input berkas
// `type="file"`.
const inputAngkaUpload = /<input[^>]*type="number"[^>]*aria-label="Jumlah upload POS"/.test(
  popupUpload
) || /<input[^>]*aria-label="Jumlah upload POS"[^>]*type="number"/.test(popupUpload);
inputAngkaUpload
  ? ok('upload: Jumlah Upload POS dirender sebagai input angka')
  : salah('input jumlah upload POS', 'bukan input angka — kalau kotak berkas, artinya salah dibaca');

// Label-nya harus menyebut satuan pcs. Tanpa itu, "98" bisa dibaca sebagai
// jumlah berkas, dan itu persis kesalahpahaman yang dikoreksi owner.
popupUpload.includes('Jumlah Upload POS (pcs)')
  ? ok('upload: label menyebut satuan (pcs)')
  : salah('label jumlah upload POS', 'tidak menyebut pcs');

// Angka rencana dipakai sebagai PEMBANDING di layar. Diperiksa dari angka yang
// dihitung fungsi papan, bukan angka yang diketik di test.
const rencanaTercetak =
  rencanaUpload !== null && popupUpload.includes(`${rencanaUpload} pcs`);
rencanaTercetak
  ? ok(`upload: plan ${rencanaUpload} pcs ditampilkan sebagai pembanding`)
  : salah(
      'pembanding plan upload',
      `rencana=${rencanaUpload}, ada di markup=${popupUpload.includes(`${rencanaUpload} pcs`)}`
    );

// Kontrol positif: 'type="number"' benar-benar ada di markup ini, jadi pola di
// atas bukan sekadar tidak cocok pada apa pun. Kotak bukti Upload memakai
// input file, dan itu memang TIDAK boleh tertangkap pola angka.
const adaInputFileUpload = /<input[^>]*type="file"/.test(popupUpload);
adaInputFileUpload && inputAngkaUpload
  ? ok('kontrol: popup upload memang punya input angka DAN input berkas')
  : salah(
      'kontrol input upload',
      `angka=${inputAngkaUpload}, berkas=${adaInputFileUpload} — keduanya harus ada`
    );

// -- 0 vs kosong.
//
// Kartu ber-nilai 0 sudah "terisi". Kalau 0 disamakan dengan kosong, kartu
// yang isinya memang nol tidak akan pernah bisa diselesaikan — dan angka 0 itu
// justru pernyataan yang dilaporkan di Finance Validate.
const nolTidakDituntut = !popupUploadNol.includes('Belum lengkap: Jumlah upload POS');
// Angkanya benar-benar sampai ke layar. Dicari sebagai NILAI INPUT
// (`value="0"`), bukan teks "0 pcs": kartu ini plan-nya ratusan pcs, jadi
// "160 pcs" di baris pembanding memuat "0 pcs" sebagai potongan — dan
// pemeriksaan yang mencari potongan akan hijau tanpa angka 0 pernah tampil.
const nolTampil = /<input[^>]*aria-label="Jumlah upload POS"[^>]*value="0"/.test(popupUploadNol);
nolTidakDituntut && nolTampil
  ? ok('upload: angka 0 dihitung terisi dan tampil sebagai nilai input "0"')
  : salah(
      'upload nol',
      `tidak dituntut lagi=${nolTidakDituntut}, nilai 0 tampil di input=${nolTampil}`
    );

// Kontrol positif untuk cara baca itu: popup Upload TANPA nilai tidak boleh
// punya `value="0"`. Tanpa pembanding ini, pola di atas bisa cocok karena
// kebetulan ada di markup mana pun.
const kosongTanpaNilaiNol = !/<input[^>]*aria-label="Jumlah upload POS"[^>]*value="0"/.test(
  popupUpload
);
kosongTanpaNilaiNol
  ? ok('kontrol: kartu tanpa jumlah upload tidak menampilkan nilai 0')
  : salah('kontrol nilai 0', 'kartu kosong ikut menampilkan value="0"');

// -- Terkunci total (aturan owner, tanpa pengecualian).
//
// Kartu yang sudah lewat tahapnya: input mati, tombol hapus bukti hilang,
// tombol unggah hilang, tombol Lanjut hilang — TAPI isinya tetap terlihat.
// Mengunci berarti tidak bisa diubah, bukan tidak bisa dilihat.
const adaInputKodeTerkunci = /aria-label="Kode shipment Livou"/.test(popupInvLogisticTerkunci);
const adaUnggahTerkunci = popupInvLogisticTerkunci.includes('>Unggah<');
const adaHapusTerkunci = popupInvLogisticTerkunci.includes('aria-label="Hapus ');
const adaLanjutTerkunci = popupInvLogisticTerkunci.includes('Lanjut ke');
const terkunciTutupSemua =
  !adaInputKodeTerkunci && !adaUnggahTerkunci && !adaHapusTerkunci && !adaLanjutTerkunci;
terkunciTutupSemua
  ? ok('terkunci: input, unggah, hapus, dan tombol Lanjut semuanya hilang')
  : salah(
      'terkunci tiket 5',
      `input=${adaInputKodeTerkunci}, unggah=${adaUnggahTerkunci}, hapus=${adaHapusTerkunci}, lanjut=${adaLanjutTerkunci}`
    );

// Isinya tetap terbaca — nilai kolom DAN berkas yang sudah diunggah. Tanpa ini,
// "terkunci" bisa dicapai dengan menghapus seluruh seksi, dan jejaknya hilang
// bersama kuncinya.
const isiTerkunciTerlihat =
  popupInvLogisticTerkunci.includes('SH-CN-2609-002') &&
  popupInvLogisticTerkunci.includes('2026-09-02') &&
  popupInvLogisticTerkunci.includes(namaBerkasLogistic);
isiTerkunciTerlihat
  ? ok('terkunci: nilai kolom dan berkas yang tersimpan tetap terlihat')
  : salah(
      'isi terkunci',
      'nilai/berkas hilang — mengunci seharusnya menyembunyikan input, bukan datanya'
    );

// Kontrol positif: popup yang SAMA DATANYA tanpa `sudahLewat` harus punya
// input, tombol unggah, DAN tombol hapus. Tombol hapus ikut diperiksa karena
// itulah yang paling mudah hilang tanpa disadari: berkasnya harus benar-benar
// ada dulu, dan itu yang dijamin fixture ini.
const adaInputKodeTerbuka = /aria-label="Kode shipment Livou"/.test(popupInvLogisticBerisi);
const adaUnggahTerbuka = popupInvLogisticBerisi.includes('>Unggah<');
const adaHapusTerbuka = popupInvLogisticBerisi.includes('aria-label="Hapus ');
adaInputKodeTerbuka && adaUnggahTerbuka && adaHapusTerbuka
  ? ok('kontrol: tanpa sudahLewat, input + unggah + hapus semuanya hidup')
  : salah(
      'kontrol terkunci tiket 5',
      `input=${adaInputKodeTerbuka}, unggah=${adaUnggahTerbuka}, hapus=${adaHapusTerbuka}`
    );

// Teks pengumuman terkunci ikut muncul, supaya orang yang membuka popupnya
// tahu kenapa tidak ada yang bisa diklik — bukan menyangka popupnya rusak.
popupInvLogisticTerkunci.includes('tidak bisa diubah lagi')
  ? ok('terkunci: ada keterangan kenapa tidak bisa diubah')
  : salah('keterangan terkunci', 'tidak ada penjelasan di popup yang terkunci');

// -- Gerbang: tombol Lanjut mati selama isian belum lengkap.
//
// Diperiksa dari ATRIBUT `disabled`, bukan kata "disabled" di markup — class
// Button Base UI selalu memuat `disabled:opacity-50`, jadi pencarian teks
// selalu menemukan kata itu pada tombol yang justru AKTIF. Cara bacanya sama
// dengan pemeriksaan tombol HPP di atas.
const tombolLanjutDari = (html) => {
  const cocok = html.match(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Lanjut ke(?:(?!<\/button>)[\s\S])*?<\/button>/
  );
  return cocok ? cocok[0] : '';
};
const tombolMatiTiket5 = (html) => /\sdisabled(\s|=|>|\/)/.test(tombolLanjutDari(html));

// Kartu kosong: semuanya belum diisi -> tombol harus mati.
const invLogisticKosongMati = tombolMatiTiket5(popupInvLogistic);
const invProductKosongMati = tombolMatiTiket5(popupInvProduct);
const uploadKosongMati = tombolMatiTiket5(popupUpload);
invLogisticKosongMati && invProductKosongMati && uploadKosongMati
  ? ok('gerbang: ketiga tombol Lanjut mati selama isian belum lengkap')
  : salah(
      'gerbang tiket 5',
      `invoice-logistic=${invLogisticKosongMati}, invoice-product=${invProductKosongMati}, upload=${uploadKosongMati}`
    );

// Dan tombolnya benar-benar ADA di ketiga popup itu — kalau tidak ada,
// pemeriksaan "mati" di atas hijau tanpa memeriksa apa pun.
const tombolAdaTiket5 =
  tombolLanjutDari(popupInvLogistic) !== '' &&
  tombolLanjutDari(popupInvProduct) !== '' &&
  tombolLanjutDari(popupUpload) !== '';
tombolAdaTiket5
  ? ok('kontrol: tombol Lanjut memang ada di ketiga popup')
  : salah('tombol lanjut tiket 5', 'tombolnya tidak dirender sama sekali');

// Yang belum lengkap harus disebut NAMANYA, bukan cuma "belum lengkap".
// Pemilik yang membaca popup harus tahu apa lagi yang kurang.
//
// Yang dibandingkan adalah KALIMAT LENGKAPNYA, bukan nama potongannya. Nama
// potongan seperti 'Flow transaksi' juga muncul sebagai `aria-label` pada
// input-nya — jadi pemeriksaan yang mencari potongan akan hijau walaupun
// daftar kekurangannya hilang sama sekali. Kalimat lengkap dengan urutannya
// hanya bisa terbentuk dari daftar yang benar-benar dihitung.
const kurangInvLogistic =
  'Belum lengkap: Kode shipment, Tanggal invoice logistic, Bukti Invoice Logistic, Bukti Pembayaran Logistic.';
const kurangInvProduct =
  'Belum lengkap: Kode shipment, Tanggal invoice product, Flow transaksi, Bukti Invoice Product.';
const kurangUpload = 'Belum lengkap: Jumlah upload POS, Proof Upload Ecommerce, Upload POS.';
const menyebutKekurangan =
  popupInvLogistic.includes(kurangInvLogistic) &&
  popupInvProduct.includes(kurangInvProduct) &&
  popupUpload.includes(kurangUpload);
menyebutKekurangan
  ? ok('gerbang: daftar kekurangan ditulis lengkap dengan urutannya')
  : salah(
      'daftar kekurangan tiket 5',
      [
        !popupInvLogistic.includes(kurangInvLogistic) && 'invoice-logistic',
        !popupInvProduct.includes(kurangInvProduct) && 'invoice-product',
        !popupUpload.includes(kurangUpload) && 'upload',
      ]
        .filter(Boolean)
        .join(', ') + ' — kalimat "Belum lengkap" tidak sesuai'
    );

// Kontrol positif untuk cara baca itu: kalimat yang sama harus BENAR-BENAR
// berbeda saat satu isian sudah diisi. Kalau pola di atas cocok pada apa pun,
// pemeriksaan di atas tidak membedakan keadaan.
const kurangSetelahKodeDiisi = popupInvLogisticBerisi.includes('Belum lengkap: Kode shipment');
!kurangSetelahKodeDiisi && popupInvLogisticBerisi.includes('Belum lengkap:')
  ? ok('kontrol: kode shipment yang sudah diisi hilang dari daftar kekurangan')
  : salah(
      'kontrol daftar kekurangan',
      'isian yang sudah diisi tetap muncul di daftar kekurangan'
    );

// -- Label tujuan: ketiga tombol menyebut kolom berikutnya di PAPAN ITU.
//
// Di papan White Label, setelah Invoice Logistic adalah Receive — bukan
// Cutting seperti di Production. Label yang dipatok "Cutting" akan menyesatkan
// justru di papan yang paling banyak dibaca saat presentasi.
const labelDariSeksi = (html, teks) => html.includes(teks);
const tujuanInvLogisticBenar = labelDariSeksi(popupInvLogistic, 'Lanjut ke Receive');
const tujuanUploadBenar = labelDariSeksi(popupUpload, 'Lanjut ke Finance Validate');
tujuanInvLogisticBenar && tujuanUploadBenar
  ? ok('gerbang: label tujuan mengikuti kolom berikutnya di papan WL')
  : salah(
      'label tujuan tiket 5',
      `invoice-logistic->Receive=${tujuanInvLogisticBenar}, upload->Finance Validate=${tujuanUploadBenar}`
    );

// Kontrol: label itu memang milik tahapnya sendiri, bukan satu label yang
// ditempel ke semua tahap. Dicek dari arah sebaliknya — label tujuan Upload
// TIDAK boleh muncul di popup Invoice Logistic, dan sebaliknya.
const labelTidakTersilang =
  !popupInvLogistic.includes('Lanjut ke Finance Validate') &&
  !popupUpload.includes('Lanjut ke Receive');
labelTidakTersilang
  ? ok('kontrol: label tujuan tidak tersilang antar tahap')
  : salah('kontrol label tujuan', 'label tahap lain muncul di popup yang salah');

// ===== Tiket 3: Finance Validate — daftar temuan =====

console.log('\n== Tiket 3: Finance Validate — daftar temuan ==');

// -- Fungsi `temuanKartu()`: kartu bersih vs kartu yang sengaja dirusak.
//
// Dua arah diperiksa, dan keduanya perlu. Kalau hanya "kartu rusak punya
// temuan" yang diperiksa, fungsi yang mengembalikan SEMUA kemungkinan temuan
// untuk setiap kartu akan hijau — dan di layar itu berarti setiap kartu
// tertahan oleh temuan yang tidak pernah terjadi. Sebaliknya, fungsi yang
// selalu mengembalikan daftar kosong hijau di pemeriksaan "bersih".
const idTemuan = (daftar) => (daftar ?? []).map((t) => t.id);
const temuanBersih = temuan.bersih ?? [];
const temuanTanpaBukti = temuan.tanpaBukti ?? [];

temuanBersih.length === 0
  ? ok('temuan: kartu bersih menghasilkan 0 temuan')
  : salah('temuan kartu bersih', `dapat ${JSON.stringify(idTemuan(temuanBersih))}`);

// Kontrol positif untuk fungsi yang sama: kartu itu, tanpa bukti apa pun,
// HARUS menghasilkan temuan. Tanpa ini, "0 temuan" di atas bisa benar karena
// fungsinya memang tidak pernah menghasilkan apa-apa.
temuanTanpaBukti.length > 0
  ? ok('kontrol: kartu bersih tanpa bukti menghasilkan temuan')
  : salah('kontrol temuan', 'kartu tanpa bukti apa pun tidak menghasilkan temuan');

// -- Setiap sumber temuan diuji dengan kerusakan yang disengaja.

// 1. Ongkos jahit hilang -> tepat satu temuan, dari stage hpp-price.
const idOngkos = idTemuan(temuan.ongkosJahitHilang);
idOngkos.length === 1 && idOngkos[0] === 'hpp-price:ongkos-jahit'
  ? ok('temuan: ongkos jahit yang hilang jadi temuan "ongkos jahit belum diisi"')
  : salah('temuan ongkos jahit', `dapat ${JSON.stringify(idOngkos)}`);

// Dan kartu yang SAMA dengan ongkos jahit terisi tidak punya temuan itu —
// pembandingnya kartu bersih, yang memang punya ongkos jahit.
!idTemuan(temuanBersih).includes('hpp-price:ongkos-jahit')
  ? ok('kontrol: kartu ber-ongkos jahit tidak punya temuan itu')
  : salah('kontrol ongkos jahit', 'temuan ongkos jahit muncul padahal ongkos jahit ada');

// 2. `jumlahUploadPos` = 0 -> temuan "belum ada yang diunggah ke POS".
const idUploadNol = idTemuan(temuan.uploadNol);
idUploadNol.includes('upload:jumlah-pos')
  ? ok('temuan: jumlahUploadPos = 0 jadi temuan "belum ada yang diunggah ke POS"')
  : salah('temuan upload nol', `dapat ${JSON.stringify(idUploadNol)}`);

// 2b. Angka yang sama tapi bukan 0 -> TIDAK ada temuan. Ini pembeda 0 vs
// "sudah diisi" yang dikoreksi owner: 0 adalah pernyataan sah, 80 bukan
// temuan. Tanpa pembanding ini, pemeriksaan di atas juga hijau kalau fungsi
// menuduh setiap kartu yang punya angka upload.
!idTemuan(temuan.uploadTerisi).includes('upload:jumlah-pos')
  ? ok('kontrol: jumlahUploadPos = 80 tidak jadi temuan')
  : salah('kontrol upload terisi', 'upload 80 pcs tetap dituduh belum masuk POS');

// 2c. `undefined` BUKAN 0 -> tidak ada temuan. Aturan ini tertulis di
// `DataTahapAkhir.jumlahUploadPos`; kartu contoh yang belum pernah melewati
// Upload tidak boleh dituduh "belum masuk POS" hanya karena kotaknya kosong.
// Fixture-nya dihitung di dalam bundel — `temuanKartu` tidak ada di sini.
const idUploadUndefined = idTemuan(temuan.uploadUndefined);
!idUploadUndefined.includes('upload:jumlah-pos')
  ? ok('kontrol: jumlahUploadPos kosong (undefined) bukan temuan')
  : salah('kontrol upload undefined', `dapat ${JSON.stringify(idUploadUndefined)}`);

// 3. Receive: Sisa > 0 -> satu temuan per varian yang kurang, dengan angkanya.
const idReceive = idTemuan(temuan.receiveSisa);
idReceive.includes('receive:Black S') && !idReceive.includes('receive:Black M')
  ? ok('temuan: varian yang Sisa-nya > 0 jadi temuan, yang lengkap tidak')
  : salah('temuan receive', `dapat ${JSON.stringify(idReceive)}`);

// Angkanya harus benar, bukan cuma temunya ada. "berapa" itu permintaan
// eksplisit pemilik: 35 − (33 + 0) = 2 pcs.
const detailReceive = (temuan.receiveSisa ?? []).find((t) => t.id === 'receive:Black S');
const angkaReceiveBenar = (detailReceive?.detail ?? '').includes('Sisa 2 pcs');
angkaReceiveBenar
  ? ok('temuan: detail receive menulis selisihnya (Sisa 2 pcs)')
  : salah('detail receive', `dapat "${detailReceive?.detail ?? '(tidak ada)'}"`);

// 3b. Sisa = 0 -> tidak ada temuan. Rumusnya Plan − (Sudah Datang + Masuk
// Stok): 35 − (33 + 2) = 0, jadi varian ini LENGKAP walaupun belum semua
// datang langsung — yang reject sudah dihitung masuk stok.
!idTemuan(temuan.receiveLengkap).includes('receive:Black S')
  ? ok('kontrol: varian yang Masuk Stok-nya menutup selisih tidak jadi temuan')
  : salah('kontrol receive lengkap', 'varian yang sudah lengkap tetap dituduh kurang');

// 3c. Tanpa data penerimaan sama sekali -> tidak ada temuan receive. Hari ini
// memang begitu keadaannya (stage Receive belum punya model data), dan kartu
// contoh tidak boleh dituduh "barang belum lengkap" karena datanya belum ada.
const idReceiveTanpaData = idTemuan(temuan.apaAdanya);
!idReceiveTanpaData.some((id) => id.startsWith('receive:'))
  ? ok('kontrol: tanpa data penerimaan, tidak ada temuan receive')
  : salah('kontrol receive tanpa data', `dapat ${JSON.stringify(idReceiveTanpaData)}`);

// 4. Penjaga HPP White Label di bawah biaya beli.
//
// Dua arah: baris yang dirusak (ongkos kirim negatif) memunculkan temuan, dan
// baris yang wajar tidak. Tanpa arah kedua, penjaga yang selalu menyala hijau
// di sini — dan di layar itu berarti setiap kartu White Label tertahan oleh
// temuan yang tidak pernah terjadi.
const idHppBawahBeli = idTemuan(temuan.hppBawahBeli);
idHppBawahBeli.includes('hpp-price:hpp-bawah-beli')
  ? ok('temuan: HPP di bawah biaya beli tertangkap penjaganya')
  : salah('temuan HPP bawah beli', `dapat ${JSON.stringify(idHppBawahBeli)}`);

const idHppWajar = idTemuan(temuan.hppWajar);
!idHppWajar.includes('hpp-price:hpp-bawah-beli')
  ? ok('kontrol: HPP yang wajar (ongkos kirim positif) tidak jadi temuan')
  : salah('kontrol HPP wajar', `dapat ${JSON.stringify(idHppWajar)}`);

// 5. Bukti wajib yang kosong -> satu temuan per jenis, dan HANYA jenis yang
// wajib untuk papan itu. Papan Production tidak punya Invoice Logistic, jadi
// menuntutnya di sana adalah temuan yang tidak bisa ditutup siapa pun.
const idTanpaBukti = idTemuan(temuanTanpaBukti);
const wajibProd = ['cutting:laporan-potong', 'cutting:register-cutting', 'hpp-price:kalkulasi-hpp', 'hpp-price:kalkulasi-selling-price', 'upload:proofUploadEcommerce', 'upload:uploadPos', 'invoice-product:invoiceProduct'];
const kurangWajibProd = wajibProd.filter((id) => !idTanpaBukti.includes(id));
const adaInvLogisticProd = idTanpaBukti.some((id) => id.startsWith('invoice-logistic:'));
kurangWajibProd.length === 0 && !adaInvLogisticProd
  ? ok('temuan: bukti wajib yang kosong lengkap, tanpa bukti stage yang tidak dilalui')
  : salah(
      'temuan bukti',
      `kurang=${JSON.stringify(kurangWajibProd)}, invoice-logistic ikut dituntut=${adaInvLogisticProd}`
    );

// Dan papan White Label menuntut yang sebaliknya: Invoice Logistic WAJIB,
// Cutting TIDAK. Tanpa ini, "tanpa invoice-logistic" di atas juga hijau kalau
// daftar wajibnya kebetulan kosong.
const idTanpaBuktiWl = idTemuan(temuan.apaAdanyaWl);
const wlMenuntutInvLogistic = idTanpaBuktiWl.includes('invoice-logistic:invoiceLogistic');
const wlTidakMenuntutCutting = !idTanpaBuktiWl.some((id) => id.startsWith('cutting:'));
wlMenuntutInvLogistic && wlTidakMenuntutCutting
  ? ok('kontrol: papan White Label menuntut Invoice Logistic, bukan Cutting')
  : salah(
      'kontrol bukti WL',
      `menuntut invoice-logistic=${wlMenuntutInvLogistic}, menuntut cutting=${!wlTidakMenuntutCutting}`
    );

// Pemeriksaan yang HANYA berlaku per papan juga tidak boleh bocor: kartu White
// Label tidak punya ongkos jahit sama sekali (jahitnya di pihak supplier), jadi
// menuntutnya di sana adalah temuan yang mustahil ditutup.
const wlTidakDituntutOngkosJahit = !idTanpaBuktiWl.includes('hpp-price:ongkos-jahit');
wlTidakDituntutOngkosJahit
  ? ok('kontrol: papan White Label tidak dituntut ongkos jahit')
  : salah('kontrol ongkos jahit WL', 'kartu White Label dituduh belum mengisi ongkos jahit');

// 5b. Urutan daftar: yang harus DIPUTUSKAN (receive, upload) di atas, yang
// harus DIUNGGAH (bukti) di bawah. Fixture `campur` punya ketiganya sekaligus,
// jadi urutannya benar-benar bercampur — fixture lain selalu cuma punya satu
// jenis, dan urutannya tidak akan terlihat dari mereka. Tanpa pemeriksaan ini,
// urutan di `temuanKartu()` cuma niat yang tidak dijaga siapa pun.
const idCampur = idTemuan(temuan.campur);
const posisiReceive = idCampur.indexOf('receive:Black S');
const posisiUpload = idCampur.indexOf('upload:jumlah-pos');
const posisiBuktiPertama = idCampur.findIndex((id) => id.startsWith('cutting:'));
const urutanBenar =
  posisiReceive !== -1 &&
  posisiUpload !== -1 &&
  posisiBuktiPertama !== -1 &&
  posisiReceive < posisiUpload &&
  posisiUpload < posisiBuktiPertama;
urutanBenar
  ? ok('urutan: temuan receive/upload mendahului temuan bukti')
  : salah('urutan temuan', JSON.stringify(idCampur));

// 6. Temuan tertutup: statusnya berubah, TAPI barisnya tetap ada.
const idTertutup = idTemuan(temuan.tertutupSebagian);
const statusTertutup = (temuan.tertutupSebagian ?? []).find((t) => t.id === 'cutting:laporan-potong');
idTertutup.includes('cutting:laporan-potong') && statusTertutup?.status === 'tertutup'
  ? ok('temuan tertutup: tetap ada di daftar, statusnya berubah')
  : salah(
      'temuan tertutup',
      `ada=${idTertutup.includes('cutting:laporan-potong')}, status=${statusTertutup?.status}`
    );

// Dan id yang tidak pernah jadi temuan tidak memunculkan baris hantu. Ini yang
// membedakan temuan DIHITUNG dari temuan yang disimpan sebagai salinan.
!idTertutup.includes('temuan-yang-tidak-pernah-ada')
  ? ok('kontrol: id tertutup yang asing tidak memunculkan temuan hantu')
  : salah('temuan hantu', 'id asing memunculkan baris temuan');

// -- Routing: popup Finance Validate memakai seksi baru, bukan fallback.
//
// Ini yang paling mudah salah: `temuanKartu()` bisa benar semua, tapi kalau
// cabangnya tidak pernah aktif, popupnya tetap menampilkan "Belum ada isi
// khusus" dan tidak ada satu pun pemeriksaan fungsi di atas yang gagal.
const teksJudulFinance = 'Finance Validate';
const popupFinIsi = popupPerStage['finance-validate'] ?? '';
const pakaiSeksiFinance =
  popupFinIsi.includes(teksJudulFinance) && !popupFinIsi.includes(teksBelumAda);
pakaiSeksiFinance
  ? ok('routing: stage finance-validate memakai seksi temuan, bukan SeksiBelumAda')
  : salah(
      'routing finance-validate',
      `judul ada=${popupFinIsi.includes(teksJudulFinance)}, fallback ada=${popupFinIsi.includes(
        teksBelumAda
      )}`
    );

// Daftar temuan benar-benar tercetak di popup — p-10 punya bukti kosong, jadi
// setidaknya satu baris harus muncul. Diperiksa lewat `data-temuan`, penanda
// yang sama yang dibaca pemeriksaan status di bawah.
const jumlahBarisTemuan = (popupFinIsi.match(/data-temuan="/g) || []).length;
jumlahBarisTemuan > 0
  ? ok(`daftar: popup finance-validate menampilkan ${jumlahBarisTemuan} baris temuan`)
  : salah('daftar temuan di popup', 'tidak ada baris temuan yang dirender');

// Kartu bersih -> popupnya menyatakan tidak ada temuan, dan tombolnya hidup.
const popupFinBersihIsi = popupFinanceBersih;
const bersihTulisKosong = popupFinBersihIsi.includes('Tidak ada temuan');
const bersihTidakAdaBaris = !popupFinBersihIsi.includes('data-temuan="');
bersihTulisKosong && bersihTidakAdaBaris
  ? ok('daftar: kartu bersih menampilkan "Tidak ada temuan" tanpa baris temuan')
  : salah(
      'daftar kartu bersih',
      `teks kosong=${bersihTulisKosong}, baris temuan=${!bersihTidakAdaBaris}`
    );

// -- Gerbang: tombol lanjut mati selama masih ada temuan terbuka.
//
// Tombolnya di sini berbunyi "Selesaikan validasi", bukan "Lanjut ke ...":
// Finance Validate adalah kolom TERAKHIR di kedua papan, jadi tidak ada stage
// berikutnya yang bisa disebut namanya. Pembaca yang mencari tombolnya lewat
// `tombolLanjutDari()` di atas tidak akan menemukan apa pun — dan itu bukan
// tombol yang hilang, itu nama yang berbeda. Karena itu ada pembaca sendiri.
const tombolSelesaiDari = (html) => {
  const cocok = html.match(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Selesaikan validasi(?:(?!<\/button>)[\s\S])*?<\/button>/
  );
  return cocok ? cocok[0] : '';
};
const tombolFinanceTerbuka = tombolSelesaiDari(popupFinIsi);
const tombolFinanceTertutup = tombolSelesaiDari(popupFinanceTertutup);
const tombolFinanceBersih = tombolSelesaiDari(popupFinBersihIsi);
const matiTerbuka = /\sdisabled(\s|=|>|\/)/.test(tombolFinanceTerbuka);
const matiTertutup = /\sdisabled(\s|=|>|\/)/.test(tombolFinanceTertutup);
const matiBersih = /\sdisabled(\s|=|>|\/)/.test(tombolFinanceBersih);

tombolFinanceTerbuka !== '' && matiTerbuka
  ? ok('gerbang: tombol lanjut mati selama temuan masih terbuka')
  : salah('gerbang finance terbuka', `tombol ada=${tombolFinanceTerbuka !== ''}, mati=${matiTerbuka}`);

// Kontrol dua arah: kartu bersih DAN kartu yang temuannya sudah ditutup
// dua-duanya harus HIDUP. Kalau tombolnya selalu mati, pemeriksaan di atas
// hijau tanpa membuktikan apa pun.
tombolFinanceBersih !== '' && !matiBersih && tombolFinanceTertutup !== '' && !matiTertutup
  ? ok('kontrol: tombol lanjut hidup saat tidak ada temuan terbuka')
  : salah(
      'kontrol gerbang finance',
      `bersih: ada=${tombolFinanceBersih !== ''} mati=${matiBersih}; tertutup: ada=${tombolFinanceTertutup !== ''} mati=${matiTertutup}`
    );

// -- Riwayat: temuan yang sudah ditutup tetap terlihat, dengan statusnya.
//
// Dua sisi: jumlah barisnya TIDAK berkurang (riwayat, bukan penghapusan), dan
// baris yang ditutup benar-benar berubah statusnya. Kalau hanya jumlahnya yang
// diperiksa, daftar yang menampilkan semuanya sebagai "terbuka" akan lolos.
const jumlahBarisTerbuka = (popupFinIsi.match(/data-temuan="/g) || []).length;
const barisTerbuka = (popupFinIsi.match(/data-status="terbuka"/g) || []).length;
const barisTertutup = (popupFinIsi.match(/data-status="tertutup"/g) || []).length;
const barisTertutupSetelah = (popupFinanceTertutup.match(/data-status="tertutup"/g) || []).length;
const jumlahBarisTertutupPopup = (popupFinanceTertutup.match(/data-temuan="/g) || []).length;
barisTerbuka > 0 && barisTertutup === 0
  ? ok('riwayat: kartu yang belum ditangani hanya punya temuan berstatus terbuka')
  : salah('status temuan awal', `terbuka=${barisTerbuka}, tertutup=${barisTertutup}`);

// Jumlah barisnya SAMA dengan sebelum ditutup — itu yang membuktikan temuannya
// tidak dihapus — tapi seluruhnya sudah berstatus tertutup. Dua-duanya
// diperlukan: jumlah yang sama saja hijau kalau statusnya tidak pernah
// berubah, dan status tertutup saja hijau kalau daftarnya justru menyusut.
jumlahBarisTertutupPopup === jumlahBarisTerbuka && barisTertutupSetelah === jumlahBarisTerbuka
  ? ok('riwayat: temuan yang ditutup tetap tampil, statusnya berubah jadi tertutup')
  : salah(
      'riwayat temuan tertutup',
      `sebelum=${jumlahBarisTerbuka} baris, sesudah=${jumlahBarisTertutupPopup} baris, tertutup=${barisTertutupSetelah}`
    );

// Label stage asal temuan ikut ditampilkan — "ke mana harus melihat untuk
// membetulkannya" tidak bisa dijawab tanpa itu.
const labelStageBenar =
  temuan.labelStage.cutting === 'Cutting' &&
  temuan.labelStage.receive === 'Receive' &&
  temuan.labelStage.hpp === 'HPP & Price' &&
  temuan.labelStage.upload === 'Upload' &&
  temuan.labelStage.invoiceLogistic === 'Invoice Logistic';
labelStageBenar
  ? ok('label: stage asal temuan memakai nama kolom papannya')
  : salah('label stage asal', JSON.stringify(temuan.labelStage));

// Dan labelnya benar-benar tercetak di baris temuan popup, bukan cuma benar di
// fungsi. 'HPP &amp; Price' dipakai sebagai penanda karena ia HANYA muncul dari
// badge stage asal — nama itu tidak ada di blok identitas maupun teks status,
// jadi kecocokannya tidak bisa datang dari kebetulan. (`&` di-escape React.)
popupFinIsi.includes('HPP &amp; Price')
  ? ok('label: stage asal tercetak di baris temuan popup')
  : salah('label stage di popup', 'nama stage asal tidak muncul di popup');

// Papan White Label: popupnya memakai kartu w-08, yang TIDAK punya baris
// shipment. Yang harus terbukti di sini adalah routing-nya memakai papan yang
// benar — kalau seksi Finance memakai daftar bukti Production, kartu WL akan
// dituntut bukti Cutting yang tidak pernah dilaluinya.
const popupFinWlIsi = popupFinanceWl;
const wlTidakMenuntutCuttingDiPopup = !popupFinWlIsi.includes('Laporan Potong Kain');
wlTidakMenuntutCuttingDiPopup
  ? ok('routing: popup finance-validate White Label tidak menuntut bukti Cutting')
  : salah('routing finance WL', 'kartu White Label dituntut bukti Cutting');

// -- `terima` dan `barisHpp` benar-benar DITERUSKAN sampai ke layar.
//
// Fungsi `temuanKartu()` sudah terbukti benar di atas, tapi itu belum berarti
// pemanggilnya mengoper datanya: papan yang lupa meneruskan `terima` membuat
// temuan Receive tidak pernah muncul, dan tidak satu pun pemeriksaan fungsi
// akan gagal. Dua pemeriksaan di bawah menguji SAMBUNGAN itu — popup yang
// dioper data, bukan fungsinya.
const popupFinTerimaIsi = popupFinanceTerima;
const terimaSampaiKePopup =
  popupFinTerimaIsi.includes('data-temuan="receive:Black S"') &&
  popupFinTerimaIsi.includes('Sisa 2 pcs');
terimaSampaiKePopup
  ? ok('sambungan: data penerimaan yang dioper ke popup jadi baris temuan Receive')
  : salah(
      'sambungan terima',
      `baris ada=${popupFinTerimaIsi.includes('data-temuan="receive:Black S"')}, selisih ada=${popupFinTerimaIsi.includes(
        'Sisa 2 pcs'
      )}`
    );

const popupFinWlBawahBeliIsi = popupFinanceWlBawahBeli;
const barisHppSampaiKePopup =
  popupFinWlBawahBeliIsi.includes('data-temuan="hpp-price:hpp-bawah-beli"') &&
  popupFinWlBawahBeliIsi.includes('lebih rendah dari biaya beli');
barisHppSampaiKePopup
  ? ok('sambungan: baris shipment yang dioper ke popup jadi temuan HPP di bawah biaya beli')
  : salah(
      'sambungan barisHpp',
      `baris ada=${popupFinWlBawahBeliIsi.includes('data-temuan="hpp-price:hpp-bawah-beli"')}, detail ada=${popupFinWlBawahBeliIsi.includes(
        'lebih rendah dari biaya beli'
      )}`
    );

// Kontrol arah sebaliknya untuk sambungan yang sama: kartu WL yang sama tanpa
// barisHpp tidak boleh punya temuan itu. Tanpa ini, popup yang selalu
// menampilkan temuan HPP (mis. karena datanya di-hardcode) akan hijau.
const wlTanpaBarisHppBersih = !popupFinWlIsi.includes('data-temuan="hpp-price:hpp-bawah-beli"');
wlTanpaBarisHppBersih
  ? ok('kontrol: kartu White Label tanpa baris shipment tidak punya temuan itu')
  : salah('kontrol barisHpp', 'temuan HPP muncul padahal tidak ada baris shipment yang dioper');

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
