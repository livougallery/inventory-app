/**
 * Smoke test: papan Material Fulfillment benar-benar ter-render.
 *
 * Kenapa ini ada: halaman ini dibuat untuk PRESENTASI dan belum ada satu pun
 * test lain yang menyentuhnya. `tsc -b` hanya membuktikan tipenya cocok — bukan
 * bahwa kolomnya muncul, kartunya ada, atau angkanya sampai ke layar.
 *
 * Yang diperiksa:
 *   1. Papan        : 5 kolom, kartu ada, dan TIDAK ada kolom "Dikirim"
 *                     (owner menghapus tahap itu)
 *   2. Vendor       : satu kartu = satu vendor, dan kartu-kartu contoh memakai
 *                     vendor BERBEDA-BEDA. Ini inti seluruh halaman — kalau
 *                     datanya semuanya satu vendor, presentasi justru
 *                     membuktikan hal yang salah.
 *   3. Popup        : urutannya mengikuti permintaan owner (Informasi Pembelian
 *                     -> Workcode -> Item Material -> Dokumen), Kategori dan
 *                     Jenis ada DI ATAS, dan dua bagian yang dihapus tidak
 *                     muncul (Pembayaran, Penerimaan & FIFO)
 *   4. Gerbang      : "Tangkan Selesai" MATI sebelum semua material dicentang,
 *                     hidup setelahnya
 *   5. Workcode     : 1 baris = 1 workcode (bukan multi-select)
 *   6. Kategori     : Product Fulfillment tidak punya Jenis
 *   7. Rute + menu  : halaman bisa dibuka lewat rutenya, dan menunya ada di
 *                     section Progress — diperiksa lewat `App` + MemoryRouter,
 *                     bukan lewat komponennya, supaya salah petakan rute ikut
 *                     ketahuan
 *   8. Form PO baru : ketiga bagiannya ada dan berurutan, Vendor berupa Select
 *                     (bukan teks bebas), dan kontrol milik tahap lain tidak
 *                     ikut terbawa
 *   9. Kartu form   : kartu hasil form benar-benar MASUK ke daftar gabungan —
 *                     check anti-regresi untuk akar bug tombol "Pembelian
 *                     Material" yang diam karena `semua` hanya diturunkan dari
 *                     KARTU_PO
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-material-fulfillment.mjs
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
// Pola yang sama persis dengan `smoke-kanban-fulfillment.mjs`, termasuk
// alasan di balik tiap keputusan. Struktur ini sudah terbukti di repo:
// renderToString biasa tidak bisa dipakai karena komponen memakai
// `import.meta.env` yang hanya dipahami Vite.

mkdirSync(path.join(frontendDir, 'node_modules', '.tmp'), { recursive: true });
const kerja = mkdtempSync(path.join(frontendDir, 'node_modules', '.tmp', 'smoke-mf-'));

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
import { labelStage, gabungKartu } from './src/pages/MaterialFulfillment';
import MaterialFulfillment from './src/pages/MaterialFulfillment';
import PapanPo from './src/pages/material-fulfillment/PapanPo';
import { IsiPopup, judulPopup, barisKosong } from './src/pages/material-fulfillment/PopupPo';
import { IsiFormPoBaru, judulFormPo } from './src/pages/material-fulfillment/FormPoBaru';
import {
  KARTU_PO, PAPAN_PO, KATEGORI, kartuBaru,
  jenisUntuk, kunciItem, ringkasDatang, subtotal, total, stageKartu, stageSetelah,
  bisaEdit, bisaTandaiDatang, bisaUnggah,
} from './src/pages/material-fulfillment/data-po';

// Aksi kosong: yang diperiksa di sini markup-nya, bukan efek sampingnya.
const aksi = {
  buka: () => {}, tutup: () => {}, buat: () => {}, tandaiDatang: () => {},
  lanjutStage: () => {}, selesaikan: () => {}, simpan: () => {},
};
const state = { pindah: {}, datang: {}, sunting: {}, terbukaId: null };

export const papan = renderToStaticMarkup(
  <PapanPo stages={PAPAN_PO} kartu={KARTU_PO} state={state} aksi={aksi} />
);

// Popup dirender untuk SETIAP stage, supaya bisa dibuktikan isinya berbeda dan
// tombol "Tarkan Selesai" hanya muncul di stage yang memang bisa menutup kartu.
//
// Yang dirender adalah IsiPopup, BUKAN PopupPo. PopupPo membungkus isi
// popup dengan Dialog Base UI yang isinya dirender lewat portal, dan portal
// TIDAK ikut ter-render di renderToStaticMarkup -- hasilnya cuma div kosong.
// Kalau wrapper-nya yang dirender, setiap pemeriksaan isi popup (urutan
// bagian, kolom harga, gerbang tombol) akan GAGAL bukan karena kodenya salah,
// tapi karena tidak ada yang bisa dilihat. Itu persis kelas check yang hijau
// tanpa menguji apa pun.
export const popupPerStage = Object.fromEntries(
  PAPAN_PO.map((s) => {
    const k = KARTU_PO.find((x) => x.stage === s.id) ?? KARTU_PO[0];
    return [s.id, renderToStaticMarkup(
      <IsiPopup
        kartu={k}
        stage={s}
        stageBerikutnya={PAPAN_PO[PAPAN_PO.findIndex((x) => x.id === s.id) + 1]}
        onstageDatang={{}}
        aksi={aksi}
      />
    )];
  })
);

// Popup yang SEMUA material-nya sudah dicentang, di stage Diterima: di situ
// tombol "Tarkan Selesai" harus hidup. Perbandingan dengan yang kosong di
// bawah inilah yang membuktikan gerbangnya benar-benar menutup, bukan cuma
// tombolnya kebetulan terlihat.
const kDiterima = KARTU_PO.find((k) => k.stage === 'diterima') ?? KARTU_PO[0];
const semuaKunci = kDiterima.items.map(kunciItem);
export const popupDiterimaLengkap = renderToStaticMarkup(
  <IsiPopup
    kartu={kDiterima}
    stage={PAPAN_PO.find((s) => s.id === 'diterima')}
    stageBerikutnya={PAPAN_PO.find((s) => s.id === 'selesai')}
    onstageDatang={{ [kDiterima.id]: semuaKunci }}
    aksi={aksi}
  />
);

// Kartu yang belum pindah harus tetap di stage-nya, dan yang sudah dipindah
// harus pindah — ini yang membuat papan dan tabel "Daftar PO" bisa hidup dari
// satu sumber.
export const stageBawaan = KARTU_PO.map((k) => stageKartu(k.id, KARTU_PO, {}, PAPAN_PO));
export const stageDipindah = stageKartu(KARTU_PO[0].id, KARTU_PO, { [KARTU_PO[0].id]: 'diterima' }, PAPAN_PO);
export const stageKartuBaru = stageKartu('po-99', KARTU_PO, {}, PAPAN_PO);
export const tujuanSetelah = PAPAN_PO.map((s) => stageSetelah(PAPAN_PO, s.id)?.id ?? null);

// ===== Halaman utuh, lewat rutenya =====
//
// Diperiksa lewat App + MemoryRouter, bukan komponennya langsung: yang paling
// mudah salah di sini adalah PEMETAAN RUTE dan entri menunya.
export const halaman = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/material-fulfillment']}>
    <App />
  </MemoryRouter>
);

// ===== Fakta dihitung DI DALAM bundel =====
//
// Angka turunan dihitung di sini, bukan di skrip pemeriksa — kalau logikanya
// disalin ke skrip, yang teruji adalah salinannya, bukan fungsi yang dipakai
// kartu dan tabelnya.
export const vendorPerKartu = KARTU_PO.map((k) => k.vendor);
export const vendorUnik = [...new Set(vendorPerKartu)].length;
export const totalPerKartu = KARTU_PO.map((k) => ({ id: k.id, total: total(k) }));
export const subtotalBukti = KARTU_PO.map((k) => ({
  id: k.id,
  hitung: total(k),
  asli: subtotal(k.items),
}));

// Gerbang "semua material datang", diuji di KARTU NYATA dan di kondisi
// buatan — ini yang menahan tombol Tarkan Selesai.
const kUji = KARTU_PO.find((k) => k.items.length >= 2) ?? KARTU_PO[0];
const kunciUji = kUji.items.map(kunciItem);
export const gerbang = {
  kartuId: kUji.id,
  jumlahBaris: kUji.items.length,
  kosong: ringkasDatang(kUji.id, kUji.items, {}),
  separuh: ringkasDatang(kUji.id, kUji.items, { [kUji.id]: kunciUji.slice(0, 1) }),
  penuh: ringkasDatang(kUji.id, kUji.items, { [kUji.id]: kunciUji }),
  // Kartu tanpa satu pun baris: TIDAK boleh dihitung "lengkap" hanya karena
  // 0 dari 0 sudah sama. Kalau iya, tombol Tarkan Selesai hidup untuk PO
  // yang belum diisi apa pun.
};
const kKosong = { ...KARTU_PO[0], id: 'po-kosong', items: [] };
export const gerbangKosong = ringkasDatang(kKosong.id, kKosong.items, { [kKosong.id]: [] });

// Workcode: satu baris per workcode, bukan satu baris berisi daftar.
export const jumlahWorkcode = KARTU_PO.map((k) => k.workcodes.length);
export const adaWorkcodeGanda = KARTU_PO.filter((k) => new Set(k.workcodes).size !== k.workcodes.length);

// Kunci baris harus unik dalam satu PO: dua baris dengan kunci sama membuat
// satu centang menandai keduanya, jadi gerbang terbuka sebelum waktunya.
export const kunciGanda = KARTU_PO.filter(
  (k) => new Set(k.items.map(kunciItem)).size !== k.items.length
).map((k) => k.id);

// Kategori Product Fulfillment tidak punya jenis sama sekali.
export const jenisPerKategori = Object.fromEntries(
  KATEGORI.map((k) => [k.value, jenisUntuk(k.value)])
);
export const labelKategori = Object.fromEntries(KATEGORI.map((k) => [k.value, k.label]));

// Fungsi hak isi per tahap, dipanggil langsung di dalam bundel. Yang diuji di
// sini FUNGSI yang dipakai popup, bukan salinannya di skrip pemeriksa — kalau
// logikanya ditulis ulang di skrip, yang teruji adalah salinannya.
export const hakIsi = PAPAN_PO.map((s) => ({
  id: s.id,
  edit: bisaEdit(s.id),
  datang: bisaTandaiDatang(s.id),
  unggah: bisaUnggah(s.id),
}));

// Label stage di tab "Daftar PO" — dihitung dengan FUNGSI ASLI dari
// komponennya, bukan salinannya.
//
// Kenapa tidak lewat "halaman.includes(...)": Tabs hanya merender panel yang
// aktif, dan defaultnya "papan" — isi "Daftar PO" tidak pernah masuk
// renderToStaticMarkup sama sekali. Dan kenapa bukan menulis ulang
// ekspresinya di sini: versi itu hijau walaupun komponennya masih
// "Diajukan", karena yang diperiksa adalah salinannya sendiri (mutasi 7,
// 28 Sep). Sekarang labelStage diimpor dari MaterialFulfillment.tsx.
//
// CATATAN: blok ini berada di dalam template literal (sumber bundel yang
// ditulis ke berkas sementara). Backtick di komentar akan menutup literalnya
// lebih dulu dan membuat SyntaxError — pakai kutip biasa.
//
// PENTING untuk membaca check di bawah: cabang fallback labelStage TIDAK
// pernah bisa diuji lewat stage asing. stageKartu() selalu mengembalikan id
// yang ada di papan (kalau tidak, ia mengembalikan stages[0].id), jadi find()
// di labelStage selalu berhasil dan operator "??-"-nya tidak pernah
// dieksekusi. Mutasi 8 membuktikan: mengembalikan fallback ke "Diajukan" tetap
// hijau di sini. Fallback itu hanya bisa terjangkau kalau "stages" sendiri
// kosong — saat itu labelStage mengembalikan "-". Yang bisa diuji sekarang:
// labelStage berlaku untuk semua kartu, dan ia memakai label papan, bukan nama
// karangan.
export const labelStageTabel = KARTU_PO.map((k) => labelStage(k.id, KARTU_PO, {}, PAPAN_PO));

// Papan kosong: satu-satunya cara benar-benar mencapai cabang fallback.
export const labelStageTanpaPapan = labelStage('po-01', KARTU_PO, {}, []);

// ===== Form "Pembelian Material Baru" =====
//
// Yang dirender adalah IsiFormPoBaru, bukan FormPoBaru. FormPoBaru membungkus
// isinya dengan Dialog Base UI yang dirender lewat portal, dan portal tidak
// ikut muncul di renderToStaticMarkup -- hasilnya cuma div kosong, dan semua
// pemeriksaan isi form akan hijau tanpa pernah melihat apa pun. Pola yang sama
// dengan IsiPopup di atas.
const aksiKosong = () => {};
export const formBaru = renderToStaticMarkup(
  <IsiFormPoBaru onSimpan={aksiKosong} sudahAda={false} />
);

// Tiga bagian wajib, diurutkan. Sama seperti popup: PO baru disusun dengan
// urutan yang sama, supaya yang sudah paham popup tidak perlu belajar lagi.
const BAGIAN_FORM = ['Informasi Pembelian', 'Workcode', 'Item Material'];
export const posisiBagianForm = BAGIAN_FORM.map((t) => ({ t, i: formBaru.indexOf(t) }));

// Field yang JANGAN ada di form. Kolom "Datang" hanya hidup di Received, dan
// PO yang baru dibuat belum pernah sampai sana; tombol "Tandai Selesai"
// hidup di popup, bukan di form -- kartu majulah lewat popup.
export const munculDiForm = ['sudah datang', 'Tandai Selesai', 'Foto Invoice Material'].filter((t) =>
  formBaru.includes(t)
);

// Field yang harus ada sebagai isian bebas: No. PO, PIC, Tgl PO, Catatan, dan
// input workcode. Vendor TIDAK termasuk daftar ini -- ia harus Select, dan itu
// diperiksa terpisah di bawah.
const INPUT_FORM = ['baru-nopo', 'baru-tgl', 'baru-pic', 'baru-catatan'];
export const fieldForm = Object.fromEntries(
  INPUT_FORM.map((name) => [name, new RegExp('<input(?=[^>]*id="' + name + '")[^>]*>').test(formBaru)])
);

// Judul form, dipisah dari Dialog supaya bisa diperiksa (pola judulPopup).
export const judulForm = judulFormPo();

// ===== Kartu hasil form =====
//
// kartuBaru() dipakai untuk membuat kartu dari form. Dua sifat yang diperiksa:
// kartu itu lahir di Proposed dan ia MEMBAWA item yang diisi di form.
const dataForm = {
  kategori: 'kain',
  jenis: 'Roll',
  noPo: 'PO-2026-0009',
  vendor: 'PT Sinar Abadi',
  tglPo: '28 Sep 2026',
  pic: 'Rina Wijaya',
  inisial: 'RW',
  catatan: 'PO pertama dari form',
  workcodes: ['PDFF_CSC-TOP-17_B-00_PRDN'],
  // Baris yang sudah DIISI, bukan baris kosong. Yang diuji di sini adalah
  // "baris material yang diketik user ikut terbawa" — kalau fixture-nya
  // baris kosong, check ini hanya membuktikan bahwa array-nya ada, dan
  // items kosong yang salah pun akan lolos.
  items: [barisKosong({ materialId: 7, kode: 'MT-RAYON-BLK', nama: 'Rayon Black', varian: 'Roll', qty: 40, harga: 27500 })],
  fotoNota: null,
  buktiBayar: null,
};
export const kartuDariForm = kartuBaru('po-baru-1', dataForm);

// Nilai yang harus muncul kembali di kartu hasil, diekspor supaya skrip
// pemeriksa membandingkannya dengan angka yang sama — bukan menulis ulang
// string-nya di dua tempat lalu membandingkan dua ketik yang sama.
export const NAMA_ITEM_UJI = dataForm.items[0].nama;
export const QTY_ITEM_UJI = dataForm.items[0].qty;
export const NO_PO_UJI = dataForm.noPo;

// ===== Halaman utuh dengan kartu dari form =====
//
// WAJIB, bukan sekadar gabungKartu dipanggil langsung. Dua mutasi (12 dan 13,
// 28 Sep) membuktikannya:
//
//   - mutasi 12: semua dikembalikan ke KARTU_PO saja
//   - mutasi 13: papan meneruskan KARTU_PO, bukan semua
//
// Dua-duanya tetap HIJAU kalau yang diperiksa hanya gabungKartu(...) —
// fungsinya memang masih benar, yang rusak adalah PEMAKAIANNYA di halaman.
// Satu-duanya mengembalikan halaman ke keadaan tepat sebelum tombol
// "Pembelian Material" hidup, tanpa satu pun test yang berubah warna.
//
// Jadi yang di sini benar-benar halaman MaterialFulfillment, dengan satu
// kartu hasil form disuntikkan lewat prop kartuAwal. Smoke test repo ini
// tidak punya DOM (tidak ada jsdom di package.json), jadi tidak bisa mengklik
// tombolnya — tapi "kartu ada atau tidak di papan" sudah bisa dibuktikan dari
// markup, dan itulah yang hilang tadi.
export const halamanDenganKartu = renderToStaticMarkup(
  <MaterialFulfillment kartuAwal={[kartuDariForm]} />
);
export const halamanKosong = renderToStaticMarkup(<MaterialFulfillment />);

const kartuDiPapan = (html) => (html.match(/data-slot="kartu-po"/g) || []).length;

// Penghitung di header halaman. Tiga jebakan yang sudah menimpa pola ini satu
// per satu (28 Sep), semuanya karena polanya terlalu rapuh untuk hasil render
// React:
//
//   1. JSX memecah teks menjadi beberapa ekspresi dan React menyisipkan simpul
//      komentar ("<!---->") di antaranya. Jadi "5 tahap • 9 PO" di markup
//      sebenarnya "5<!----> tahap …" — pola yang mengira spasi polos di antara
//      angka dan kata akan gagal diam-diam.
//   2. Kata "tahap" juga muncul di banner pratinjau, jauh sebelum header.
//   3. Angka "N PO" bisa muncul lebih dulu di tempat lain pada halaman.
//
// Dua yang pertama diselesaikan dengan membersihkan semua simpul komentar
// sebelum pencarian. Yang ketiga tidak bisa diselesaikan dengan mengunci ke
// kata "tahap" — kata itu muncul DUA kali, dan yang pertama ada di banner
// pratinjau ("…antar tahap bisa dinilai dulu…"). Yang kedua adalah headernya.
//
// Jadi kuncinya justru sisi yang unik: pola "N tahap … N PO". Angka "tahap"
// hanya muncul di header; kemunculan "tahap" yang lain tidak diikuti angka dan
// "PO" dalam 200 karakter.
const headerBersih = halamanDenganKartu.replace(/<!--[\\s\\S]*?-->/g, '');
const mHeader = /(\\d+)\\s*tahap(.{1,30}?)(\\d+)\\s*PO/.exec(headerBersih);

export const papanDenganKartuBaru = {
  kartu: kartuDiPapan(halamanDenganKartu),
  kartuTanpaBaru: kartuDiPapan(halamanKosong),
  // No. PO hasil form harus benar-benar TERLIHAT, bukan cuma ada di markup
  // sebagai atribut yang tidak pernah dirender ke layar.
  nomorPoTerlihat: halamanDenganKartu.includes(dataForm.noPo),
  jumlahTahap: mHeader?.[1] ?? null,
  angkaHeader: mHeader?.[3] ?? null,
  cuplikanHeader: mHeader ? mHeader[0].slice(0, 44) : '(tidak ditemukan)',
};

// Tahap kartu baru, dihitung dengan FUNGSI ASLI dari data-po.ts.
export const tahapKartuDariForm = stageKartu('po-baru-1', [kartuDariForm], {}, PAPAN_PO);

// ===== gabungKartu: akar bug "tombol Pembelian Material diam" =====
//
// Akar bug "tombol Pembelian Material diam": semua dulu hanya diturunkan dari
// KARTU_PO, sehingga kartu hasil form tidak punya tempat muncul. Papan
// meneruskan KARTU_PO langsung, jadi meskipun semua sudah punya kartu baru,
// papan tetap tidak menampilkannya -- dua tempat, satu sumber.
//
// Diuji lewat FUNGSI ASLI yang dipakai komponen, bukan ungkapan yang ditulis
// ulang di sini. Versi yang ditulis ulang hijau walaupun kodenya masih salah;
// persis jebakan yang sudah pernah kejadian di labelStage (mutasi 7, 28 Sep).
const kartuBaruSatu = [kartuDariForm];
const digabung = gabungKartu(KARTU_PO, kartuBaruSatu, {});
export const gabungan = {
  total: digabung.length,
  baruHadir: digabung.some((k) => k.id === 'po-baru-1'),
  isiKartuBaru: digabung.find((k) => k.id === 'po-baru-1')?.items.length ?? 0,
  // Isi baris ikut terbawa, bukan cuma jumlah barisnya. Kalau hanya panjang
  // array yang diperiksa, kartu yang membawa baris kosong — atau baris dengan
  // nama material yang salah — tetap lolos.
  namaItem: digabung.find((k) => k.id === 'po-baru-1')?.items[0]?.nama ?? null,
  qtyItem: digabung.find((k) => k.id === 'po-baru-1')?.items[0]?.qty ?? null,
  bawaanUtuh: KARTU_PO.every((k) => digabung.some((d) => d.id === k.id && d === k)),
  // Tanpa kartu baru, hasilnya persis data contoh bawaan.
  tanpaBaru: gabungKartu(KARTU_PO, [], {}).length,
  // Suntingan popup menang atas kartu aslinya.
  disunting: gabungKartu(KARTU_PO, [], { [KARTU_PO[0].id]: { ...KARTU_PO[0], vendor: 'SUNting' } })
    .find((k) => k.id === KARTU_PO[0].id)?.vendor,
};

export { KARTU_PO, PAPAN_PO, KATEGORI, judulPopup };
`;

// Diisi kalau build bundel gagal. Tidak langsung `process.exit()` di dalam
// catch, supaya keluaran vite yang panjang tercetak setelah semua pesan lain
// selesai.
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
  build: { ssr: ${JSON.stringify(masuk)}, outDir: ${JSON.stringify(kerja)}, emptyOutDir: true, minify: false, rollupOptions: { output: { format: 'esm', entryFileNames: 'mf.mjs' } } },
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

// Penjaga: sumber bundel di dalam template literal TIDAK BOLEH memuat
// backtick, karena backtick menutup literalnya lebih dulu dan hasilnya
// SyntaxError yang tidak menunjuk ke baris yang salah. Backtick di dalam
// sumber bundel karena itu selalu ditulis sebagai kutip biasa.
//
// Hapus penjaga ini hanya kalau `entri` sudah berubah dari template literal
// menjadi file terpisah — selama belum, kegagalan di bawah ini muncul
// berulang kali tanpa penjelasan (28 Sep).
if ((entri.match(/`/g) ?? []).length > 0) {
  console.error(
    'GAGAL: sumber bundel (const entri) memuat backtick, yang menutup template literal-nya.'
  );
  process.exit(1);
}

if (gagalBangun) {
  console.error('\nGAGAL membangun bundel pratinjau Material Fulfillment:');
  // stderr IKUT dicetak. Vite menulis error transformasinya ke stderr; hanya
  // stdout akan menampilkan "✓ N modules transformed." sebagai kalimat
  // terakhir — dan penyebab sebenarnya hilang sama sekali.
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
const url = pathToFileURL(path.join(kerja, berkas[0])).href;
const m = await import(url);

const {
  papan, popupPerStage, popupDiterimaLengkap, halaman,
  vendorPerKartu, vendorUnik, totalPerKartu, subtotalBukti, gerbang, gerbangKosong,
  jumlahWorkcode, adaWorkcodeGanda, kunciGanda, jenisPerKategori, labelKategori,
  stageBawaan, stageDipindah, stageKartuBaru, tujuanSetelah, stageKartu,
  hakIsi, labelStageTabel, labelStageTanpaPapan,
  formBaru, posisiBagianForm, munculDiForm, fieldForm, judulForm,
  kartuDariForm, tahapKartuDariForm, gabungan, NAMA_ITEM_UJI, QTY_ITEM_UJI, NO_PO_UJI,
  papanDenganKartuBaru,
  KARTU_PO, PAPAN_PO, judulPopup,
} = m;

// ===== 1. Papan =====

console.log('\n== Papan ==');
const kolom = (papan.match(/data-slot="kanban-column"/g) || []).length;
const kartu = (papan.match(/data-slot="kartu-po"/g) || []).length;

kolom === 5 ? ok('5 kolom') : salah('jumlah kolom', `dapat ${kolom}, harus 5`);
kartu === KARTU_PO.length
  ? ok(`${kartu} kartu`)
  : salah('jumlah kartu', `dapat ${kartu}, harus ${KARTU_PO.length}`);

// Owner menghapus tahap "Dikirim". Kalau kolom itu masih ada, papan
// menjanjikan tahap yang tidak lagi dipakai di mana pun.
!papan.includes('>Dikirim<') && !papan.includes('>Shipped<')
  ? ok('tidak ada kolom Dikirim/Shipped (benar — owner menghapusnya)')
  : salah('kolom Dikirim/Shipped', 'masih ada di papan');

// Nama kolom berbahasa Inggris sejak 28 September, mengikuti papan Production
// Fulfillment (Propose, Prepare, Cutting, ...): satu orang membaca kedua papan
// bergantian, dan "Diajukan" di sini bersebelahan dengan "Propose" di sana.
//
// `id` di dalam data TETAP berbahasa Indonesia — ia yang jadi kunci state
// `pindah` dan sudah tersimpan. Yang diuji di sini label yang tampil.
for (const t of ['Proposed', 'Approved', 'Ordered', 'Received', 'Completed']) {
  papan.includes(t) ? ok(`kolom "${t}"`) : salah(`kolom "${t}"`, 'tidak ditemukan');
}

// Label lama harus benar-benar hilang, bukan cuma ditinggalkan berdampingan.
//
// diperiksa di PAPAN dan di NILAI kolom tabel "Daftar PO". Yang kedua tidak
// bisa lewat `halaman.includes(...)` — `Tabs` hanya merender panel aktif
// (default "papan"), jadi isi tabel itu tidak pernah masuk markup. Yang boleh
// diperiksa di situ cuma nilainya, bukan tampilannya.
const LABEL_LAMA = ['Diajukan', 'Disetujui', 'Dipesan', 'Diterima', 'Selesai'];
const lamaDiPapan = LABEL_LAMA.filter((t) => papan.includes(t));
lamaDiPapan.length === 0
  ? ok('label lama berbahasa Indonesia tidak lagi muncul di papan')
  : salah('label lama papan', `masih tampil: ${lamaDiPapan.join(', ')}`);

const lamaDiTabel = [...new Set(labelStageTabel.filter((t) => LABEL_LAMA.includes(t)))];
lamaDiTabel.length === 0
  ? ok('label lama juga hilang dari kolom stage di tab "Daftar PO"')
  : salah('label lama di Daftar PO', `masih tampil: ${lamaDiTabel.join(', ')}`);

// Setiap kartu harus dapat label berbahasa Inggris dari papan, dan tidak ada
// satu pun yang jatuh ke nama karangan. Check ini menangkap label yang hilang
// dari PAPAN_PO — termasuk yang ditambahkan belakangan.
const labelPapan = PAPAN_PO.map((s) => s.label);
const labelaneh = labelStageTabel.filter((t) => !labelPapan.includes(t));
labelaneh.length === 0
  ? ok('setiap baris Daftar PO memakai label yang benar-benar ada di papan')
  : salah('label Daftar PO', `tidak dikenal: ${[...new Set(labelaneh)].join(', ')}`);

// Papan kosong — cabang fallback satu-satunya yang bisa dijangkau. Yang
// diperiksa NILAI TEPATNYA ("-"), bukan sekadar "bukan Bahasa Indonesia":
// mutasi 10 memakai "Kosong" dan check yang cuma menolak kata Indonesia hijau
// saja memastikannya (28 Sep).
labelStageTanpaPapan === '-'
  ? ok('labelStage mengembalikan "-" saat papan kosong')
  : salah('labelStage tanpa papan', `mengembalikan "${labelStageTanpaPapan}", harus "-"`);

// Tombol "Pembelian Material" hanya boleh ada di kolom Proposed. Kalau ikut
// muncul di kolom lain, orang bisa membuat PO langsung di Received — dan kartu
// itu akan datang dengan `stage: 'diajukan'` yang bertabrakan dengan kolomnya.
const hitungTombolPM = (html) => (html.match(/Pembelian Material/g) ?? []).length;
hitungTombolPM(papan) === 1
  ? ok('tombol "Pembelian Material" ada tepat sekali di papan')
  : salah(
      'tombol "Pembelian Material"',
      `ditemukan ${hitungTombolPM(papan)} kali; harus 1 (hanya di kolom Proposed)`
    );

// LETAK tombol, bukan hanya keberadaannya. Owner 28 September 2026: di ATAS
// kartu, tepat di bawah judul kolom — bukan di bawah deretan kartu, tempat ia
// ikut ter-scroll dan hilang ke bawah layar begitu kolomnya panjang.
//
// Yang dibandingkan POSISI di markup, bukan `includes`: tombolnya bisa ditarik
// kembali ke bawah papan dan check `includes` tetap hijau.
//
// `data-slot="kartu-po"` dipakai sebagai penanda kartu karena itu atribut yang
// benar-benar ada di markup — bukan kelas Tailwind, yang bisa ditimpa utilitas.
const iTombolPM = papan.indexOf('Pembelian Material');
const iKartuPM = papan.indexOf('data-slot="kartu-po"');
iTombolPM > 0 && iKartuPM > 0 && iTombolPM < iKartuPM
  ? ok('tombol "Pembelian Material" di ATAS kartu')
  : salah(
      'letak tombol "Pembelian Material"',
      `tombol=${iTombolPM} kartuPertama=${iKartuPM}; tombol harus di atas kartu`
    );

// Kontra-pembuktian: helper posisi benar-benar membedakan urutan, di atas
// markup yang sama. Kalau `indexOf` di atas tidak pernah dihitung, check ini
// hijau tanpa menguji apa pun.
const posisiKartuPM = (html) => html.indexOf('data-slot="kartu-po"');
const posisiKartuPMKedua = (html) => html.indexOf('data-slot="kartu-po"', posisiKartuPM(html) + 1);
posisiKartuPMKedua(papan) > posisiKartuPM(papan) &&
  papan.indexOf('Pembelian Material') < posisiKartuPM(papan)
  ? ok('urutan tombol → kartu → kartu benar-benar dibaca dari markup')
  : salah('bantah-urutan', 'helper posisi tidak membedakan urutan');

// Titik warna tahap: ReUI tidak mewarnai kolomnya sendiri, jadi warna dipasang
// di header tiap kolom. Kalau kelasnya hilang, papan kembali jadi lima kolom
// kelabu yang sama.
for (const w of ['bg-slate-400', 'bg-amber-500', 'bg-violet-500', 'bg-blue-500', 'bg-emerald-500']) {
  papan.includes(w) ? ok(`titik warna ${w}`) : salah(`titik warna ${w}`, 'tidak ditemukan');
}

// ===== 2. Vendor: inti halaman =====

console.log('\n== Vendor ==');

// Kartu board menampilkan vendor-nya. Tanpa ini, satu kartu satu vendor hanya
// jadi aturan di data yang tidak pernah terlihat.
const vendorDiPapan = vendorPerKartu.filter((v) => papan.includes(v)).length;
vendorDiPapan === KARTU_PO.length
  ? ok(`semua ${vendorDiPapan} vendor tampil di kartu`)
  : salah('vendor di kartu', `hanya ${vendorDiPapan} dari ${KARTU_PO.length} yang tampil`);

// INI inti halaman: belum pernah ada satu supplier yang menjual dua kategori
// aksesoris. Kalau data contoh memakai satu vendor berulang, presentasi justru
// membuktikan hal yang tidak pernah terjadi.
vendorUnik === KARTU_PO.length
  ? ok(`tiap kartu punya vendor sendiri (${vendorUnik} vendor berbeda)`)
  : salah(
      'vendor berulang',
      `hanya ${vendorUnik} vendor untuk ${KARTU_PO.length} kartu — data contoh harus satu kartu satu vendor`
    );

// Kode material harus ikut ter-display supaya tidak ambigu.
const adaKode = KARTU_PO.some((k) => papan.includes(k.noPo));
adaKode ? ok('nomor PO tampil di kartu') : salah('nomor PO', 'tidak ditemukan di kartu');

// ===== 3. Popup =====

console.log('\n== Popup ==');

const popupDiajukan = popupPerStage.diajukan;

// Judul popup hidup di dalam Dialog, yang portal-nya tidak ter-render di server.
// Yang bisa diperiksa di sini adalah judulPopup-nya secara terpisah, supaya
// perubahan format nomor PO tidak lolos tanpa ada yang menyadarinya.
const kartuDiajukan = KARTU_PO.find((x) => x.stage === 'diajukan') ?? KARTU_PO[0];
const judulDiajukan = judulPopup(kartuDiajukan);
judulDiajukan.includes(kartuDiajukan.noPo) && judulDiajukan.includes(kartuDiajukan.vendor)
  ? ok('judul popup memuat no PO dan vendor')
  : salah('judul popup', judulDiajukan);

// Urutan bagian mengikuti permintaan owner. Diperiksa lewat POSISI, bukan
// hanya kehadirannya.
//
// TIGA bagian, bukan empat: sejak 28 September bagian "Dokumen" TIDAK tampil
// di tahap Proposed dan Approved (belum ada invoice untuk diunggah), jadi ia
// ikut hilang dari daftar ini. Kehilangannya dicek sebagai syarat di blok
// "Hak isi per tahap" di bawah; daftar ini hanya soal URUTAN bagian yang
// selalu ada.
const urut = ['Informasi Pembelian', 'Workcode', 'Item Material']
  .map((t) => ({ t, i: popupDiajukan.indexOf(t) }));
const salahUrut = urut.filter((x) => x.i < 0);
const posisiBenar = urut.every((x, i) => i === 0 || urut[i - 1].i < x.i);

salahUrut.length === 0
  ? ok('tiga bagian wajib ada di popup')
  : salah('bagian popup', `tidak ditemukan: ${salahUrut.map((x) => x.t).join(', ')}`);
posisiBenar
  ? ok('urutannya: Informasi Pembelian -> Workcode -> Item Material')
  : salah(
      'urutan bagian popup',
      urut.map((x) => `${x.t}=${x.i}`).join(', ')
    );

// Kategori dan Jenis di ATAS — di blok Informasi Pembelian, bukan per baris
// item. Keputusan owner: satu PO satu kategori, jadi mengulangnya per baris
// berarti nilai yang sama ditulis beberapa kali dan bisa berbeda di baris
// keempat. Yang diperiksa: posisi labelnya SEBELUM tabel item.
const posisiKategori = popupDiajukan.indexOf('Kategori');
const posisiJenis = popupDiajukan.indexOf('Jenis');
const posisiItem = popupDiajukan.indexOf('Item Material');
posisiKategori > 0 && posisiJenis > posisiKategori && posisiItem > posisiJenis
  ? ok('Kategori dan Jenis ada di atas, sebelum tabel Item Material')
  : salah(
      'letak Kategori/Jenis',
      `Kategori=${posisiKategori}, Jenis=${posisiJenis}, Item Material=${posisiItem}`
    );

// Dua bagian yang owner HAPUS tidak boleh muncul kembali.
//
// Dicheck di SEMUA tahap, bukan hanya di `diajukan`. Penyaringan per tahap di
// bawah membuat beberapa bagian hilang secara sah di tahap tertentu, dan
// pencarian di satu tahap saja akan lolos untuk alasan yang salah — bagian
// yang benar-benar dihapus owner tetap tidak boleh ada di mana pun.
//
// PENCARIANNYA PUNYA BATASAN, bukan `includes` polos. "Bukti Pembayaran" yang
// owner pertahankan itu mengandung kata "Pembayaran" sebagai substring, jadi
// `!popup.includes('Pembayaran')` akan MEMBALIK kesimpulan yang benar: bagian
// yang dihapus ia yang lolos, dan slot yang harus bertahan ia yang dituduh.
for (const [teks, alasan] of [
  ['Penerimaan', 'owner menghapus bagian Penerimaan & FIFO'],
  ['FIFO', 'FIFO punya kerjanya sendiri di stage Receive papan Production'],
]) {
  const munculDi = PAPAN_PO.filter((s) => popupPerStage[s.id].includes(teks)).map((s) => s.id);
  munculDi.length === 0
    ? ok(`bagian "${teks}" tidak ada di tahap mana pun (benar — ${alasan})`)
    : salah(`bagian "${teks}"`, `masih ada di tahap: ${munculDi.join(', ')}`);
}

// "Pembayaran & Dokumen" sebagai JUDUL BAGIAN tidak boleh muncul. Yang boleh
// tetap ada hanya "Bukti Pembayaran" sebagai slot display di dalam "Dokumen".
//
// PENCARIANNYA PADA TAG JUDULNYA, bukan `includes` di seluruh popup. Kata
// "Pembayaran & Dokumen" memang masih muncul sebagai kalimat penjelasan di
// dalam teks bagian Dokumen ("Section ini dulunya …"), jadi pencarian bebas akan
// merah selama penjelasan itu ada — dan begitu teks penjelasan dihapus, check
// jadi hijau tanpa ada judul yang benar-benar kembali. Yang benar: kumpulkan
// semua judul bagian (semua `<p class="… uppercase">`), lalu pastikan tidak ada
// yang namanya Pembayaran.
const semuaJudul = (html) =>
  (html.match(/<p[^>]*uppercase[^>]*>([\s\S]*?)<\/p>/g) ?? []).map((t) =>
    t.replace(/<[^>]*>/g, '').trim()
  );

const judulGd = PAPAN_PO.filter((s) =>
  semuaJudul(popupPerStage[s.id]).some((j) => /Pembayaran/i.test(j))
).map((s) => s.id);
judulGd.length === 0
  ? ok('tidak ada bagian bernama "Pembayaran …" (benar — tersisa hanya "Dokumen")')
  : salah('judul bagian Pembayaran', `masih ada di: ${judulGd.join(', ')}`);

// Kontra-pembuktian: helper judul benar-benar membaca isi heading. Kalau
// regex-nya tidak pernah cocok, check di atas hijau tanpa menguji apa pun.
//
// Perhatikan: helper sengaja TIDAK mendekode entitas HTML. Yang dibutuhkan di
// sini hanya "tidak ada heading bernama Pembayaran" — dan mendecode `&amp;`
// tidak menambah apa pun untuk jawaban itu.
semuaJudul('<p class="text-xs uppercase">Dokumen</p>').join(',') === 'Dokumen' &&
  /Pembayaran/.test(semuaJudul('<p class="x uppercase">Pembayaran &amp; Dokumen</p>')[0]) &&
  semuaJudul('<p class="x lowercase">Pembayaran &amp; Dokumen</p>').length === 0
  ? ok('helper semuaJudul membaca heading dan mengabaikan yang bukan heading')
  : salah('helper semuaJudul', 'tidak membedakan heading dari teks biasa');

// Kolom foto di Item Material — permintaan eksplisit owner: "di Item material
// tambahin kolom buat foto materialnya".
popupDiajukan.includes('Foto')
  ? ok('kolom foto ada di Item Material')
  : salah('kolom foto material', 'tidak ditemukan');

// Harga, Total, dan Subtotal WAJIB ada (keputusan owner 25 September). Yang
// diperiksa di `diajukan` — di tahap read-only kolomnya tetap ada sebagai teks.
for (const t of ['Harga', 'Total', 'Subtotal']) {
  popupDiajukan.includes(t)
    ? ok(`kolom "${t}" ada`)
    : salah(`kolom "${t}"`, 'tidak ditemukan - owner menetapkan harga/total/subtotal wajib ada');
}

// ===== 4. Hak isi per tahap (keputusan owner 28 September 2026) =====

console.log('\n== Hak isi per tahap ==');

// TIGA aturan dengan DUA bentuk yang harus sama, bukan satu.
//
// Bentuk pertama: `STAGE_BOLEH_*` di `data-po.ts` — daftar id tahap yang
// disebut biasanya, yang jadi sumber kebenaran dan dibaca popup. Bentuk kedua:
// `HAK` di bawah, hasil MENYUSUN ULANG aturan yang sama dalam bentuk
// "tahap mana yang boleh".
//
// Kenapa keduanya ditulis, dan kenapa harus sama: kalau hanya `STAGE_BOLEH_*`
// yang diuji, check itu hanya mengulang apa yang sudah ditulis di data — ia
// hijau kapan pun data itu masih konsisten dengan dirinya sendiri, termasuk
// kalau daftarnya salah semua. Kalau hanya `HAK` yang diuji, aturan di
// `data-po.ts` bisa berubah dan tidak ada yang memeriksa. Dua bentuk yang saling
// menguji itulah yang membuat perubahan di satu sisi terlihat sebagai merah di
// sisi lain.
//
// Perhatikan bahwa "dokumen" TIDAK termasuk di sini. Bagian Dokumen tidak punya
// fungsi hak-nya sendiri — yang menentukan boleh_tampilnya section adalah
// `bisaUnggah`, jadi bentuk kedua untuk aturan itu diuji lewat MARKUP di bawah,
// bukan lewat daftar yang lain.

const HAK_TAMPIL = {
  edit: ['diajukan', 'disetujui', 'dipesan'],
  datang: ['diterima'],
};

// --- Bentuk fungsi: STAGE_BOLEH_* vs HAK_TAMPIL ---
for (const [nama, wajib] of Object.entries(HAK_TAMPIL)) {
  const salahId = hakIsi.filter((h) => h[nama] !== wajib.includes(h.id)).map((h) => h.id);
  salahId.length === 0
    ? ok(`fungsi hak "${nama}" benar untuk kelima tahap`)
    : salah(`fungsi hak "${nama}"`, `salah di tahap: ${salahId.join(', ')}`);
}

// --- Aturan 1: kolom "Datang" hanya di Received ---
//
// Yang diperiksa: `aria-label` checkbox yang MEMBAWA kata "sudah datang".
// Bukan teks header "Datang" — kata itu muncul di mana-mana (label tabel,
// badge ringkasan, teks petunjuk), jadi `includes('Datang')` akan selalu hijau
// dan tidak menguji apa pun.
const adaKolomDatang = (html) => html.includes('sudah datang');
const datangDi = PAPAN_PO.filter((s) => adaKolomDatang(popupPerStage[s.id])).map((s) => s.id);
datangDi.length === 1 && datangDi[0] === 'diterima'
  ? ok('kolom centang "Datang" hanya ada di tahap Received')
  : salah('kolom "Datang"', `muncul di tahap: ${datangDi.join(', ') || '(tidak ada)'}`);

// Badge ringkasan ("Material datang 1/2") TETAP tampil di semua tahap —
// owner meminta kolom CENTANG hilang, bukan informasinya. Badge itu bacaan,
// bukan kontrol, dan di tahap Completed justru satu-satunya tempat angka
// kedatangan masih terlihat. Yang diperiksa di sini hanya bahwa ia tidak
// berubah jadi checkbox: sudah dipastikan oleh check di atas.

// --- Aturan 2: Dokumen tidak ada di Proposed/Approved, ada di Ordered/Received/Completed ---
// Daftar tahap yang diharapkan di sini terpisah dari HAK_TAMPIL, karena bentuk
// kedua untuk aturan ini memang tidak ada di data-po.ts.
const DOKUMEN_MUNCUL = ['dipesan', 'diterima', 'selesai'];

const adaSlotInvoice = (html) => html.includes('Foto Invoice Material');
const dokumenDi = PAPAN_PO.filter((s) => adaSlotInvoice(popupPerStage[s.id])).map((s) => s.id);
const dokumenBenar =
  DOKUMEN_MUNCUL.every((id) => dokumenDi.includes(id)) && dokumenDi.length === DOKUMEN_MUNCUL.length;
dokumenBenar
  ? ok('bagian Dokumen hanya di tahap: Ordered, Received, Completed')
  : salah('bagian Dokumen', `muncul di: ${dokumenDi.join(', ')}; seharusnya: ${HAK_TAMPIL.dokumen.join(', ')}`);

// Judgment slot "Bukti Pembayaran" ikut hilang bersama bagiannya, bukan hanya
// "Foto Invoice Material" yang hilang. Kalau hanya satu slot yang disembunyikan,
// bagian Dokumen masih tampil dengan setengah isinya.
for (const id of ['diajukan', 'disetujui']) {
  popupPerStage[id].includes('Bukti Pembayaran')
    ? salah(`slot "Bukti Pembayaran" di ${id}`, 'masih tampil padahal bagian Dokumen tidak ada')
    : ok(`tidak ada slot "Bukti Pembayaran" di tahap ${id} (ikut hilang bersama bagiannya)`);
}

// --- Aturan 3: upload hanya di Ordered, display di Received/Completed ---
const adaTombolUpload = (html) => html.includes('Pilih Foto');
const uploadDi = PAPAN_PO.filter((s) => adaTombolUpload(popupPerStage[s.id])).map((s) => s.id);
uploadDi.length === 1 && uploadDi[0] === 'dipesan'
  ? ok('tombol "Pilih Foto" hanya di tahap Ordered (Received/Completed hanya tampil)')
  : salah('tombol upload', `ada di tahap: ${uploadDi.join(', ') || '(tidak ada)'}`);

// Received dan Completed harus tetap MEMBUKA bagian Dokumen meski tombolnya
// hilang — kalau tidak, filter "tombol upload" di atas akan hijau karena
// bagiannya ikut hilang, bukan karena tombolnya yang hilang.
for (const id of ['diterima', 'selesai']) {
  adaSlotInvoice(popupPerStage[id]) && !adaTombolUpload(popupPerStage[id])
    ? ok(`tahap ${id}: foto invoice tampil tapi tidak bisa diunggah`)
    : salah(
        `dokumen di ${id}`,
        !adaSlotInvoice(popupPerStage[id])
          ? 'bagian Dokumen ikut hilang — seharusnya tetap tampil'
          : 'tombol Pilih Foto masih ada di tahap yang tidak boleh mengunggah'
      );
}

// --- Aturan 4: edit hanya di Proposed/Approved/Ordered ---
//
// `disabled=""` pada Input — bukan `includes('disabled')` polos, karena
// `buttonVariants` selalu memuat kelas `disabled:opacity-50` sehingga kata itu
// muncul di markup SETIAP elemen, hidup atau mati.
//
// Dan bukan sekadar "ada satu input mati" — itu hijau begitu empat input lain
// masih mati, sehingga `disabled` yang hilang dari satu field lolos (mutasi 6,
// diuji 28 Sep). Yang diperiksa per FIELD: field yang punya `id` harus hidup
// persis di tahap yang boleh edit, dan mati di tahap lain. Input tanpa pengenal
// tidak bisa ditunjuk satu per satu, jadi field tanpa `id` sengaja tak masuk
// daftar ini.
const ADA_ID = (html, name) => new RegExp(`<input(?=[^>]*\\bid="${name}")[^>]*>`).test(html);
const inputMati = (html, name) =>
  new RegExp(`<input(?=[^>]*\\bid="${name}")[^>]*\\bdisabled=""`).test(html);

const FIELD_INFO = ['po-nopo', 'po-vendor', 'po-tgl', 'po-pic', 'po-catatan'];
const fieldGagal = [];
for (const id of PAPAN_PO.map((s) => s.id)) {
  const html = popupPerStage[id];
  for (const name of FIELD_INFO) {
    // Harusnya: hidup di tahap yang boleh edit, mati di tahap read-only.
    // Perbandingannya terhadap `!bolehEdit`, bukan `bolehEdit` — kalau
    // terbalik, check ini membiaskan semua field yang sebenarnya sudah benar
    // dan, lebih buruk, TIDAK menandai field yang mati di tahap read-only
    // (deadline bug yang baru ketahuan saat mutasi 6, 28 Sep).
    const harusMati = !HAK_TAMPIL.edit.includes(id);
    if (!ADA_ID(html, name)) fieldGagal.push(`${id}:${name} hilang`);
    else if (inputMati(html, name) !== harusMati)
      fieldGagal.push(`${id}:${name} ${inputMati(html, name) ? 'mati' : 'hidup'}`);
  }
}
fieldGagal.length === 0
  ? ok('tiap field Informasi Pembelian hidup/mati ikut tahapnya (bukan "ada satu saja")')
  : salah('cakupan field read-only', fieldGagal.join(', '));

const adaInputMati = (html) => /<input[^>]*disabled=""/.test(html);
const editDi = PAPAN_PO.filter((s) => !adaInputMati(popupPerStage[s.id])).map((s) => s.id);
const editBenar =
  HAK_TAMPIL.edit.every((id) => editDi.includes(id)) && editDi.length === HAK_TAMPIL.edit.length;
editBenar
  ? ok('Informasi Pembelian + Item Material bisa diedit hanya di: Proposed, Approved, Ordered')
  : salah('hak edit', `dapat diedit di: ${editDi.join(', ')}; seharusnya: ${HAK_TAMPIL.edit.join(', ')}`);

// Di tahap read-only tidak boleh ada tombol Simpan maupun baris tambah.
for (const id of ['diterima', 'selesai']) {
  !popupPerStage[id].includes('Simpan')
    ? ok(`tidak ada tombol Simpan di tahap ${id} (benar — sudah read-only)`)
    : salah(`tombol Simpan di ${id}`, 'masih ada padahal tahap ini read-only');
  !popupPerStage[id].includes('Tambah Material')
    ? ok(`tidak ada baris tambah material di tahap ${id}`)
    : salah(`baris tambah di ${id}`, 'masih ada padahal tahap ini read-only');
  !popupPerStage[id].includes('Tambah Workcode')
    ? ok(`tidak ada baris tambah workcode di tahap ${id}`)
    : salah(`baris tambah workcode di ${id}`, 'masih ada padahal tahap ini read-only');
}

// Tombol hapus baris (icon Trash2) tidak boleh ada di tahap read-only. Kalau
// masih ada, penghapusan tetap bisa jalan walau Input-nya mati.
for (const id of ['diterima', 'selesai']) {
  !popupPerStage[id].includes('Hapus baris')
    ? ok(`tidak ada tombol hapus baris di tahap ${id}`)
    : salah(`hapus baris di ${id}`, 'masih ada');
  !popupPerStage[id].includes('Hapus workcode')
    ? ok(`tidak ada tombol hapus workcode di tahap ${id}`)
    : salah(`hapus workcode di ${id}`, 'masih ada');
}

// Di tahap read-only, Input yang sudah disabled tidak boleh bisa diisi ulang.
// `onChange` di server render → string kosong di markup, jadi yang bisa
// diperiksa adalah `value="..."` yang masih ada (Input controlled).
for (const id of ['diterima', 'selesai']) {
  const inputValue = /<input[^>]*value="([^"]*)"/.exec(popupPerStage[id]);
  inputValue && inputValue[1].length > 0
    ? ok(`nilai Input masih terbaca di tahap ${id} (read-only, bukan disembunyikan)`)
    : salah(`nilai Input di ${id}`, 'tidak ada — field read-only harus tetap menampilkan isinya');
}

// ===== 5. Gerbang "Tandai Selesai" =====

console.log('\n== Gerbang selesai ==');

// PENCARIANNYA `disabled=""` DI DALAM TAG BUTTON, bukan kata "disabled" polos
// di seluruh popup.
//
// Dua alasan, keduanya sudah pernah menggigit:
//   1. `buttonVariants` selalu memuat kelas `disabled:opacity-50`, jadi kata
//      "disabled" ada di markup SETIAP button, hidup atau mati.
//   2. Sejak 28 September popup di Received/Completed punya banyak
//      `<Input disabled>` untuk bagian yang read-only. `html.includes('disabled=""')`
//      yang dulu benar sekarang salah baca: ia menemukan Input pertama, bukan
//      tombol Selesai — dan tombol yang benar-benar hidup dilaporkan mati.
const tagTombol = (html) => html.match(/<button\b[^>]*>/g) ?? [];
const tombolMati = (html) => tagTombol(html).some((t) => t.includes('disabled=""'));

// Tombol Selesai dicari berdasarkan TEKSNYA, bukan "ada button disabled
// di tempat lain" — yang harus dipastikan adalah kondisi yang tepat.
const tombolSelesaiMati = (html) => {
  const semua = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const milikSelesai = semua.filter((t) => t.includes('Tandai Selesai'));
  return milikSelesai.length > 0 && milikSelesai.every((t) => t.includes('disabled=""'));
};

const popupDiterima = popupPerStage.diterima;
popupDiterima.includes('Tandai Selesai')
  ? ok('popup di stage Diterima punya tombol menutup kartu')
  : salah('tombol menutup kartu', 'tidak ditemukan di stage Diterima');

tombolSelesaiMati(popupDiterima)
  ? ok('tombol Selesai mati saat belum ada material yang dicentang')
  : salah(
      'gerbang selesai',
      'tombol tidak disabled di stage Diterima padahal belum ada centang'
    );

!tombolSelesaiMati(popupDiterimaLengkap)
  ? ok('tombol Selesai hidup setelah semua material dicentang')
  : salah(
      'gerbang selesai',
      'masih disabled padahal semua material sudah dicentang'
    );

// Kontra-pembuktian: helper-nya benar-benar membedakan, bukan selalu true
// atau selalu false. Tanpa ini, `!tombolSelesaiMati(...)` di atas hijau juga
// kalau helper-nya tidak pernah membaca apa pun.
tombolSelesaiMati('<button disabled="">Tandai Selesai</button>') &&
  !tombolSelesaiMati('<button>Tandai Selesai</button>') &&
  !tombolSelesaiMati('<button disabled="">Lanjut ke Received</button>')
  ? ok('tombolSelesaiMati membedakan hidup/mati dan milik-tombol-yang-benar')
  : salah('helper tombolSelesaiMati', 'tidak membedakan kondisi yang seharusnya dibedakan');

// Gerbang dihitung dari FUNGSINYA, bukan dari markup — kalau logikanya
// disalin ke skrip pemeriksa, yang teruji adalah salinannya.
gerbang.jumlahBaris >= 2
  ? ok(`gerbang diuji dengan kartu ber-${gerbang.jumlahBaris} material`)
  : salah('fixture gerbang', `hanya ${gerbang.jumlahBaris} baris; gerbang tidak bisa menguji apa pun`);

!gerbang.kosong.lengkap && gerbang.kosong.sudah === 0
  ? ok('gerbang tertutup saat kosong')
  : salah('gerbang kosong', `sudah=${gerbang.kosong.sudah} lengkap=${gerbang.kosong.lengkap}`);

!gerbang.separuh.lengkap && gerbang.separuh.sudah === 1
  ? ok(`1 dari ${gerbang.jumlahBaris} material -> belum lengkap`)
  : salah(
      'gerbang separuh',
      `sudah=${gerbang.separuh.sudah} lengkap=${gerbang.separuh.lengkap}`
    );

gerbang.penuh.lengkap && gerbang.penuh.sudah === gerbang.penuh.totalBaris
  ? ok(`semua ${gerbang.penuh.totalBaris} material dicentang -> lengkap`)
  : salah(
      'gerbang penuh',
      `sudah=${gerbang.penuh.sudah}/${gerbang.penuh.totalBaris} lengkap=${gerbang.penuh.lengkap}`
    );

// 0 dari 0 bukan "semua sudah datang". Kalau dihitung lengkap, setiap PO
// baru yang belum diisi baris itemnya bisa langsung ditutup.
!gerbangKosong.lengkap
  ? ok('PO tanpa baris material TIDAK dihitung "semua material datang"')
  : salah(
      'gerbang PO kosong',
      'lengkap padahal tidak ada material sama sekali — tombol Selesai akan hidup untuk PO kosong'
    );

// ===== 5. Workcode =====

console.log('\n== Workcode ==');

// Satu baris per workcode, bukan multi-select: 1 row buat 1 workcode.
jumlahWorkcode.every((n) => n > 0)
  ? ok(`tiap kartu punya workcode (${Math.min(...jumlahWorkcode)}-${Math.max(...jumlahWorkcode)} per kartu)`)
  : salah('workcode', `ada kartu tanpa workcode: ${jumlahWorkcode.join(', ')}`);

adaWorkcodeGanda.length === 0
  ? ok('tidak ada workcode kembar di dalam satu kartu')
  : salah('workcode kembar', `${adaWorkcodeGanda.length} kartu: ${adaWorkcodeGanda.map((k) => k.id).join(', ')}`);

// Kunci baris material harus unik dalam satu PO. Dua baris dengan kunci sama
// membuat satu centang menandai keduanya — persis bug yang pernah terjadi di
// papan production (dua baris kain bernama sama berbagi satu kunci).
kunciGanda.length === 0
  ? ok('kunci baris material unik di setiap kartu')
  : salah('kunci baris', `${kunciGanda.length} kartu punya baris berekunci sama: ${kunciGanda.join(', ')}`);

// ===== 6. Kategori & jenis =====

console.log('\n== Kategori & jenis ==');

jenisPerKategori.kain?.length > 0
  ? ok(`Kain punya jenis (${jenisPerKategori.kain.join(', ')})`)
  : salah('jenis kain', 'kosong — kategori Kain harus punya jenis');

jenisPerKategori.aksesoris?.length > 0
  ? ok(`Aksesoris punya jenis (${jenisPerKategori.aksesoris.length} jenis)`)
  : salah('jenis aksesoris', 'kosong — kategori Aksesoris harus punya jenis');

// Product Fulfillment tidak punya jenis sama sekali (keputusan owner).
jenisPerKategori.cmt_cost?.length === 0
  ? ok('Product Fulfillment tidak punya jenis (benar — owner menetapkan begitu)')
  : salah(
      'jenis Product Fulfillment',
      `punya ${jenisPerKategori.cmt_cost?.join(', ')} — kategori ini tidak punya jenis`
    );

// ===== 7. Rute, menu, dan kartu =====

console.log('\n== Rute & menu ==');

halaman.includes('Material Fulfillment')
  ? ok('halaman terbuka lewat rutenya')
  : salah('rute halaman', 'halaman tidak ter-render di /modul/material-fulfillment');

halaman.includes('data-slot="kanban-column"')
  ? ok('halaman memuat papannya')
  : salah('papan di halaman', 'kolom kanban tidak ter-render di rutenya');

// Menu harus ada di section Progress, di samping menu Production Fulfillment.
// Dua-duanya sama-sama papan kanban, jadi yang membedakan cuma labelnya —
// kalau entri yang kedua hilang, halamannya hanya bisa dibuka lewat URL.
const nav = halaman.slice(halaman.indexOf('<nav'), halaman.indexOf('</nav>'));
const posisiJudul = nav.indexOf('Progress');
const posisiMenu = nav.indexOf('/modul/material-fulfillment"');
const posisiMenuProduksi = nav.indexOf('/modul/production-fulfillment"');

posisiJudul > 0
  ? ok('sidebar punya section "Progress"')
  : salah('section Progress', 'tidak ditemukan di sidebar');

posisiMenu > posisiJudul && posisiJudul > 0
  ? ok('menu Material Fulfillment berada di section Progress')
  : salah(
      'menu Material Fulfillment',
      `menu=${posisiMenu}, judul section=${posisiJudul}`
    );

//-menu ini setelah menu Production, tidak menggantikannya.
posisiMenu > posisiMenuProduksi && posisiMenuProduksi > 0
  ? ok('kedua papan ada berdampingan di Progress')
  : salah(
      'kedua menu papan',
      `produksi=${posisiMenuProduksi}, material=${posisiMenu}`
    );

// Breadcrumb: section dulu, baru nama halaman.
const crumbs = halaman.slice(
  halaman.indexOf('data-slot="breadcrumb-list"'),
  halaman.indexOf('</ol>')
);
crumbs.includes('Progress') && crumbs.indexOf('Progress') < crumbs.indexOf('Material Fulfillment')
  ? ok('breadcrumb menaruh section sebelum nama halaman')
  : salah('breadcrumb', 'tidak menyebut section-nya, atau urutannya terbalik');

// Banner pratinjau: halaman ini belum terhubung ke database, dan itu
// harus terlihat — bukan halaman yang tampak sudah jadi.
halaman.includes('belum terhubung') || halaman.includes('Belum terhubung')
  ? ok('banner pratinjau terpasang')
  : salah('banner pratinjau', 'tidak ada peringatan bahwa halaman belum terhubung ke database');

// ===== 8. Stage =====

console.log('\n== Stage ==');

stageBawaan.every((s, i) => s === KARTU_PO[i].stage)
  ? ok('kartu yang belum dipindah tetap di stage-nya')
  : salah('stage bawaan', stageBawaan.join(', '));

stageDipindah === 'diterima'
  ? ok('karta yang sudah dipindah pindah')
  : salah('stage setelah pindah', `dapat "${stageDipindah}", harus "diterima"`);

// Kartu hasil form belum ada di daftar — harus tetap terlihat, di kolom
// pertama, bukan lenyap dari papan tanpa error apa pun.
stageKartuBaru === PAPAN_PO[0].id
  ? ok('kartu yang tidak ada di daftar mendarat di kolom pertama')
  : salah('kartu baru', `dapat "${stageKartuBaru}", harus "${PAPAN_PO[0].id}"`);

// Kolom terakhir tidak punya tujuan — tombol lanjut di sana harus mati.
tujuanSetelah[tujuanSetelah.length - 1] === null
  ? ok('kolom terakhir tidak punya tujuan lanjut')
  : salah('tujuan kolom terakhir', `dapat "${tujuanSetelah[tujuanSetelah.length - 1]}"`);

// ===== 9. Total =====

console.log('\n== Total ==');

// Total di kartu = jumlah qty x harga. Disalin di sini akan menguji
// salinannya sendiri, jadi perbandingannya dibuat dari data yang diekspor.
const totalSalah = subtotalBukti.filter((b) => b.hitung !== b.asli);
totalSalah.length === 0
  ? ok(`total Consistent dengan subtotal untuk ${subtotalBukti.length} kartu`)
  : salah('total kartu', `${totalSalah.length} kartu tidak cocok`);

totalPerKartu.every((t) => t.total > 0)
  ? ok('setiap kartu punya total positif')
  : salah('total kartu', 'ada kartu dengan total 0');

// ===== 10. Form "Pembelian Material Baru" =====

console.log('\n== Form PO baru ==');

// Tiga bagian wajib, urutannya sama seperti popup. Yang diperiksa POSISI, bukan
// hanya kehadirannya — bagian yang ada tapi salah tempat akan terasa baru saja
// form selesai dibuka.
const bagianHilang = posisiBagianForm.filter((b) => b.i < 0).map((b) => b.t);
const urutanFormBenar = posisiBagianForm.every((b, i) => i === 0 || posisiBagianForm[i - 1].i < b.i);
bagianHilang.length === 0
  ? ok('tiga bagian wajib ada di form')
  : salah('bagian form', `tidak ditemukan: ${bagianHilang.join(', ')}`);
urutanFormBenar
  ? ok('urutannya: Informasi Pembelian -> Workcode -> Item Material')
  : salah('urutan bagian form', posisiBagianForm.map((b) => `${b.t}=${b.i}`).join(', '));

// Field isian harus benar-benar ada sebagai isian. ID yang dipakai popup
// (po-nopo dan friends) — form punya id sendiri (baru-nopo), dan kalau form
// diam-diam memakai id popup, dua elemen di DOM mendapat id yang sama.
const fieldFormHilang = Object.entries(fieldForm)
  .filter(([, ada]) => !ada)
  .map(([n]) => n);
fieldFormHilang.length === 0
  ? ok('field isian form ada semua (No. PO, Tgl PO, PIC, Catatan)')
  : salah('field isian form', `tidak ditemukan: ${fieldFormHilang.join(', ')}`);

// Vendor harus Select, bukan Input bebas. Diperiksa lewat ATRIBUT trigger
// Base UI, bukan `includes("baru-vendor")` — id itu ada di keduanya, jadi
// check itu hijau baik kalau vendor Select maupun kalau diganti jadi teks biasa.
//
// Perbandingan dilakukan pada SEGMENT sebelum `>`: `SelectTrigger` punya
// `data-slot` dan `id`, dan itulah yang membuatnya bisa dibedakan dari `<input>`.
const segmenVendor = (html) => {
  const i = html.indexOf('baru-vendor');
  if (i < 0) return '';
  return html.slice(Math.max(0, i - 300), html.indexOf('>', i));
};
const vendorSelect = segmenVendor(formBaru);
const vendorInput = new RegExp('<input(?=[^>]*id="baru-vendor")[^>]*>').test(formBaru);
const vendorAda = vendorSelect.includes('baru-vendor');
!vendorInput && vendorAda && /data-slot|role="combobox"|<button/.test(vendorSelect)
  ? ok('Vendor berupa Select dari master, bukan input teks bebas')
  : salah(
      'kontrol Vendor',
      vendorInput
        ? 'vendor dirender sebagai <input> — harus Select, supaya nama nyambung ke master vendors'
        : !vendorAda
          ? 'tidak ada trigger Select untuk vendor'
          : `tidak bisa dipastikan sebagai Select: ${vendorSelect.slice(-120)}`
    );

// Kontra-pembuktian helper di atas benar-benar membedakan Select dari Input.
segmenVendor('<button data-slot="select-trigger" id="baru-vendor">Pilih</button>').includes(
  'data-slot'
) && !segmenVendor('<input id="baru-vendor">').includes('data-slot')
  ? ok('helper segmenVendor membedakan Select dari Input')
  : salah('helper segmenVendor', 'tidak membedakan Select dari input biasa');

// Field milik tahap lain tidak boleh ikut masuk form. Kolom centang "Datang"
// hanya hidup di Received, dan PO baru belum pernah sampai sana; tombol Tandai
// Selesai dan bagian Dokumen hidup di popup, bukan di form.
munculDiForm.length === 0
  ? ok('form tidak membawa kontrol tahap lain (Datang, Tandai Selesai, Dokumen)')
  : salah('kontrol asing di form', `masih ada: ${munculDiForm.join(', ')}`);

judulForm.length > 0
  ? ok(`judul form: "${judulForm}"`)
  : salah('judul form', 'kosong');

// ===== 11. Kartu hasil form =====

console.log('\n== Kartu dari form ==');

// kartuBaru() harus meletakkan kartu di Proposed -- kalau tidak, PO yang baru
// dibuat mendarat di kolom yang salah atau tidak sama sekali.
const stageKartuForm = tahapKartuDariForm;
const stageAsli = kartuDariForm.stage;
stageAsli === 'diajukan' && stageKartuForm === PAPAN_PO[0].id
  ? ok(`kartu hasil form lahir di ${PAPAN_PO[0].label}`)
  : salah(
      'tahap kartu baru',
      `kartuBaru() memberi stage "${stageAsli}", kolomnya "${stageKartuForm}", harus "${PAPAN_PO[0].id}"`
    );

// Item yang diisi di form harus ikut terbawa. Kartu tanpa item tidak bisa
// majulah: popup menolak membuka tahap berikutnya kalau items kosong.
gabungan.isiKartuBaru > 0
  ? ok(`kartu hasil form membawa ${gabungan.isiKartuBaru} baris material`)
  : salah('item kartu baru', 'baris material hilang — kartu tanpa item tidak bisa majulah');

// Dan yang ikut terbawa bukan cuma barisnya: isi baris pun harus sama dengan
// yang diketik di form. Kalau hanya `length` yang diperiksa, kartu yang membawa
// baris kosong — atau dengan nama material yang salah — tetap hijau.
gabungan.namaItem === NAMA_ITEM_UJI && gabungan.qtyItem === QTY_ITEM_UJI
  ? ok(`isi baris ikut terbawa: "${gabungan.namaItem}" x${gabungan.qtyItem}`)
  : salah(
      'isi item kartu baru',
      `nama="${gabungan.namaItem}", qty=${gabungan.qtyItem}; harus "${NAMA_ITEM_UJI}", qty=${QTY_ITEM_UJI}`
    );

// ===== 12. gabungKartu: akar bug tombol yang diam =====
console.log('\n== Gabung kartu (anti-regresi) ==');

// INI check anti-regresi untuk akar masalah tombol "Pembelian Material" yang
// diam: `semua` dulu hanya `KARTU_PO.map(...)`, jadi kartu dari form tidak
// pernah punya tempat muncul. Karena itu `aksi.buat` czas itu adalah stub.
//
// Yang diperiksa: kartu dari form BENAR-BENAR ada di daftar gabungan. Kalau ini
// merah, kembalikan `semua` ke hanya KARTU_PO dan tombolnya kembali diam.
gabungan.baruHadir && gabungan.total === KARTU_PO.length + 1
  ? ok(`kartu dari form muncul di daftar gabungan (${gabungan.total} = ${KARTU_PO.length} + 1)`)
  : salah(
      'gabungKartu',
      `total=${gabungan.total}, kartu baru hadir=${gabungan.baruHadir}; harus ${KARTU_PO.length + 1} dan hadir`
    );

// Gabung tidak boleh merusak atau menghilangkan kartu bawaan. Ini yang membuat
// data contoh tetap utuh begitu form dipakai — kalau kartu lama hilang, papan
// tiba-tiba lebih sedikit dari sebelumnya dan tidak ada yang mengetahuinya.
gabungan.bawaanUtuh
  ? ok('kartu bawaan tetap utuh setelah digabung (identik, bukan salinan)')
  : salah('kartu bawaan', 'ada kartu contoh yang hilang atau berubah setelah digabung');

gabungan.tanpaBaru === KARTU_PO.length
  ? ok('tanpa kartu baru, gabungan persis data bawaan')
  : salah('gabung tanpa kartu baru', `dapat ${gabungan.tanpaBaru}, harus ${KARTU_PO.length}`);

// Suntingan popup menang atas kartu aslinya — kalau tidak, mengedit harga di
// popup tidak akan mengubah angka di papan maupun di tabel "Daftar PO".
gabungan.disunting === 'SUNting'
  ? ok('suntingan popup menang atas kartu aslinya')
  : salah('suntingan', `vendor kartu yang disunting = "${gabungan.disunting}", harus "SUNting"`);

// --- Yang BENAR-BENAR diuji: halaman memakai hasil gabungKartu ---
//
// Check di atas semuanya memanggil `gabungKartu` langsung, jadi semuanya lulus
// walau halamannya tidak pernah memakainya. Yang di bawah merender HALAMAN
// UTUH dengan satu kartu dari form dan menghitung kartu di papannya.
//
// Perbandingannya dengan `halamanKosong` (halaman tanpa kartu baru) — bukan
// dengan angka tetap, karena angka yang benar bisa ikut berubah kalau nanti ada
// kartu contoh baru. Yang dijamin adalah SELISIHNYA tepat satu.
const selisihKartu = papanDenganKartuBaru.kartu - papanDenganKartuBaru.kartuTanpaBaru;
const kartuDiPapanDummy = (html) => (html.match(/data-slot="kartu-po"/g) || []).length;
// Sama untuk pembaca angka header, dan untuk yang membersihkannya. Pola yang
// tidak pernah cocok sama dengan pola yang tidak pernah salah — keduanya
// terlihat benar di sini, dan hanya salah satu yang berguna. (Check ini lahir
// setelah polanya salah tiga kali berturut-turut; tanpa pembuktian seperti
// ini, pola yang salah akan tetap hijau selamanya.)
const angkaHeaderDummy = (html) => {
  const bersih = html.replace(/<!--[\s\S]*?-->/g, '');
  return /(\d+)\s*tahap(.{1,30}?)(\d+)\s*PO/.exec(bersih)?.[3] ?? null;
};
selisihKartu === 1
  ? ok(
      `kartu dari form benar-benar muncul di papan (${papanDenganKartuBaru.kartuTanpaBaru} -> ${papanDenganKartuBaru.kartu})`
    )
  : salah(
      'kartu hasil form di papan',
      `dengan kartu baru=${papanDenganKartuBaru.kartu}, tanpa=${papanDenganKartuBaru.kartuTanpaBaru}; selisih harus 1`
    );

// Kontra-pembuktian: penghitungnya benar-benar membaca markup, jadi kalau
// `selisihKartu` di atas hijau tanpa menguji apa pun, check ini yang akan
// menyadarinya.
const papanDummy = 'x'.repeat(3) + 'data-slot="kartu-po"' + 'y';
kartuDiPapanDummy(papanDummy) === 1 && kartuDiPapanDummy('') === 0
  ? ok('penghitung kartu-po benar-benar menghitung kemunculan')
  : salah('penghitung kartu-po', 'tidak membedakan ada/tidaknya kartu');

// Diuji DUA bentuk: polos dan dengan simpul komentar. Bentuk kedua adalah
// bentuk yang sebenarnya muncul di markup React — kalau hanya bentuk pertama
// yang diuji, pembersihan simpul komentar tidak pernah teruji.
//
// Ketiga memuat kata tahap yang tidak diikuti angka dan PO - meniru banner
// pratinjau yang benar-benar ada di halaman, dan yang membuat pola
// kunci-ke-tahap pertama gagal tanpa pesan.
const polosDummy = 'text-muted-foreground">5 tahap • 8 PO</p>';
const komentarDummy = 'text-muted-foreground"><!---->5<!----> tahap • <!---->8<!----> PO</p>';
const bannerDummy = 'sebaran kartu antar tahap bisa dinilai dulu. Isinya</p>';
angkaHeaderDummy(polosDummy) === '8' &&
  angkaHeaderDummy(komentarDummy) === '8' &&
  angkaHeaderDummy(bannerDummy) === null &&
  angkaHeaderDummy('5 tahap • PO') === null
  ? ok('pembaca angka header membaca angka, tahan simpul komentar, dan mengabaikan banner')
  : salah(
      'pembaca angka header',
      `polos=${angkaHeaderDummy(polosDummy)}, komentar=${angkaHeaderDummy(komentarDummy)}, banner=${angkaHeaderDummy(bannerDummy)}; dua pertama harus "8", dua terakhir null`
    );

// No. PO hasil form harus tampil. Kartu yang ada di markup tapi tidak pernah
// terlihat sama saja tidak terlihat bagi orang yang memakai papan.
papanDenganKartuBaru.nomorPoTerlihat
  ? ok(`nomor PO hasil form tampil di papan: "${NO_PO_UJI}"`)
  : salah('nomor PO kartu baru', `"${NO_PO_UJI}" tidak ditemukan di halaman`);

// Penghitung di header harus ikut bertambah, kalau tidak halaman masih
//lecka Yard-nya sambil menampilkan kartu tambahan.
String(papanDenganKartuBaru.angkaHeader) === String(papanDenganKartuBaru.kartu)
  ? ok(`penghitung header ikut menyebut ${papanDenganKartuBaru.kartu} PO`)
  : salah(
      'angka header',
      `header="${papanDenganKartuBaru.angkaHeader}", kartu di papan=${papanDenganKartuBaru.kartu}, cuplikan=${papanDenganKartuBaru.cuplikanHeader}`
    );

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log(
    'LULUS — papan, popup, form PO baru, gerbang selesai, workcode, dan rutenya konsisten.'
  );
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
