/**
 * Smoke test: halaman "HPP & Harga Jual" — satu baris per kartu, angka dari
 * `gerbangHpp()`.
 *
 * Kenapa ini ada: halaman ini tidak menghitung apa pun sendiri. Ia menyusun
 * baris dari `gerbangHpp()` — mesin yang sama dengan popup kartu — lalu
 * menampilkannya. Dua hal bisa rusak tanpa terlihat:
 *
 *   1. PEMETAAN kartu → baris. Kartu White Label yang memakai rumus
 *      Production, atau baris shipment yang dipasangkan ke kartu yang salah,
 *      menghasilkan angka yang terlihat masuk akal. `tsc -b` dan
 *      `vite build` dua-duanya hijau.
 *   2. HPP `null` yang berubah jadi `0`. 0 terbaca "produk ini gratis" dan
 *      tidak ada yang salah di layar — justru itu keputusan pemilik
 *      mempertahankan `null`.
 *
 * Yang diperiksa:
 *   1. Daftar baris    : 18 baris (10 Production + 8 White Label), urutannya
 *                        benar, id unik.
 *   2. Status & angka  : 11 Terhitung / 7 Tertahan, status dan angka sejalan,
 *                        tidak ada 0, alasan tertahan siap dibaca.
 *   3. Mesinnya sama   : setiap baris sama dengan `gerbangHpp()` untuk
 *                        kartunya — dihitung DI DALAM bundel dari fungsi
 *                        asli, bukan disalin ke skrip ini.
 *   4. Kolom           : urutan, filterOptions, jenis "uang", lebar, warna
 *                        badge, dan field pencarian.
 *   5. Halaman & menu  : rute merender halamannya (bukan fallback), banner,
 *                        18 baris sampai ke tabel, tidak ada "Rp 0", dan
 *                        entri sidebar berada tepat setelah "HPP".
 *   6. Tabel tertahan  : render terpisah berisi HANYA baris tertahan —
 *                        sel angkanya "—", bukan 0. Semua baris tertahan ada
 *                        di halaman 2 paginasi halaman utama, jadi tanpa
 *                        render ini AC "baris tertahan menampilkan —" cuma
 *                        dipercaya dari jenis kolom, tidak pernah dibuktikan
 *                        dari markup.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-hpp-harga-jual.mjs
 *
 * Tidak butuh server, tidak butuh browser, tidak menyentuh database.
 *
 * CATATAN soal paginasi — penting sebelum menambah check angka lewat markup:
 * `TabelPratinjau` menampilkan 10 baris per halaman (pageSize bawaan), jadi
 * markup SSR hanya memuat 10 baris PERTAMA. Luna Pants (baris ke-16) TIDAK ada
 * di markup, dan baris tertahan (semua White Label) juga tidak. Karena itu
 * angka diperiksa dari `susunBaris()` — fungsi yang halaman pakai untuk
 * `rows` — dan markup diperiksa hanya untuk yang memang tampak: rute, banner,
 * total di footer paginasi ("of 18"), header kolom, dan ketiadaan "Rp 0".
 * Check angka yang dipaksa lewat markup halaman 1 akan hijau tanpa menguji
 * apa pun.
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
// Pola yang sama persis dengan `smoke-register-produk.mjs`. `renderToString`
// biasa tidak bisa dipakai karena komponen memakai `import.meta.env` yang
// hanya dipahami Vite. Direktori kerja unik per proses supaya dua smoke test
// yang berjalan bersamaan tidak saling menimpa bundelnya.

mkdirSync(path.join(frontendDir, 'node_modules', '.tmp'), { recursive: true });
const kerja = mkdtempSync(path.join(frontendDir, 'node_modules', '.tmp', 'smoke-hpp-'));

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

// CATATAN: isi template literal di bawah TIDAK BOLEH memuat backtick — backtick
// menutup template literalnya lebih awal dan gejalanya SyntaxError di baris
// yang jauh. Penjaganya ada di bawah, sebelum build.
const entri = `
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import App from './src/App';
import TabelPratinjau from './src/components/TabelPratinjau';
import { susunBaris, kolomHarga, cariHarga } from './src/pages/HppHargaJual';
import { KARTU_PRODUCTION, KARTU_WHITELABEL } from './src/pages/production-fulfillment/data-kanban';
import { barisShipmentUntuk, gerbangHpp } from './src/pages/production-fulfillment/hpp';
import { barisContoh } from './src/pages/HppPratinjau';

// Halaman utuh, lewat rutenya — bukan komponennya langsung, supaya pemetaan
// rute dan entri menunya ikut teruji.
export const halaman = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/modul/hpp-harga-jual']}>
    <App />
  </MemoryRouter>
);

// Baris yang halaman pakai untuk tabelnya. Diperiksa langsung supaya angka
// di luar halaman 1 (paginasi) tetap terbukti — lihat catatan paginasi di
// header skrip.
export const baris = susunBaris();

// Tabel terpisah berisi HANYA baris tertahan. Semua baris tertahan ada di
// halaman 2 paginasi halaman utama, jadi sel "—" dan ketiadaan "Rp 0" di
// baris-baris itu tidak pernah muncul di markup halaman. Render ini yang
// membuktikannya langsung dari markup, bukan menyimpulkannya dari jenis kolom.
export const tabelTertahan = renderToStaticMarkup(
  <TabelPratinjau
    rows={baris.filter((b) => b.status === 'Tertahan')}
    columns={kolomHarga}
    searchFields={cariHarga}
    itemLabel="hasil HPP"
    rowKey={(r) => r.id}
  />
);

// Bentuk kolom yang bisa dibandingkan lintas modul: fungsi value/warna
// tidak bisa diserialkan, jadi yang diekspor hanya fieldnya. warnaStatus
// memanggil fungsi warna ASLI dari kolom, memakai baris ASLI.
export const kolomRingkas = kolomHarga.map((k) => ({
  key: k.key,
  label: k.label,
  jenis: k.jenis ?? null,
  lebar: k.lebar ?? null,
  filterOptions: k.filterOptions ?? null,
}));
export const warnaStatus = (b) => kolomHarga.find((c) => c.key === 'status').warna(b);

export const cariLabel = cariHarga.map((f) => f.label);
export const cariProduk = cariHarga[0] ? cariHarga[0].get : () => '';
export const cariWorkcode = cariHarga[1] ? cariHarga[1].get : () => '';

// Hasil mesin asli untuk setiap kartu, dihitung DI DALAM bundel dari fungsi
// yang sama dengan yang dipakai papan (barisShipmentUntuk + gerbangHpp).
// Kalau halaman menghitung ulang dengan rumusnya sendiri — atau memasangkan
// kartu ke baris shipment dengan cara berbeda — barisnya tidak akan sama
// dengan daftar ini.
export const mesin = [
  ...KARTU_PRODUCTION.map((k) => {
    const g = gerbangHpp(k, 'production', k.detail.ongkosJahit);
    return { id: k.id, hpp: g.hpp, jual: g.sellingPrice, boleh: g.bolehLanjut };
  }),
  ...KARTU_WHITELABEL.map((k) => {
    const { baris: shipment, produkAmbigu } = barisShipmentUntuk(k, barisContoh);
    const g = gerbangHpp(k, 'whitelabel', undefined, shipment ?? undefined);
    return { id: k.id, hpp: g.hpp, jual: g.sellingPrice, boleh: g.bolehLanjut && produkAmbigu === null };
  }),
];
`;

// Penjaga: sumber bundel di dalam template literal TIDAK BOLEH memuat backtick.
if ((entri.match(/`/g) ?? []).length > 0) {
  console.error(
    'GAGAL: sumber bundel (const entri) memuat backtick, yang menutup template literal-nya.'
  );
  process.exit(1);
}

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
  build: { ssr: ${JSON.stringify(masuk)}, outDir: ${JSON.stringify(kerja)}, emptyOutDir: true, minify: false, rollupOptions: { output: { format: 'esm', entryFileNames: 'hpp.mjs' } } },
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

if (gagalBangun) {
  console.error('\nGAGAL membangun bundel pratinjau HPP & Harga Jual:');
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
  halaman,
  baris,
  tabelTertahan,
  kolomRingkas,
  warnaStatus,
  cariLabel,
  cariProduk,
  cariWorkcode,
  mesin,
} = m;

// ===== 1. Daftar baris =====

console.log('\n== Daftar baris ==');

baris.length === 18
  ? ok('18 baris: 10 kartu Production + 8 kartu White Label')
  : salah('jumlah baris', `dapat ${baris.length}, harus 18`);

const produksi = baris.slice(0, 10);
const whiteLabel = baris.slice(10);

produksi.length === 10 && produksi.every((b) => b.sumber === 'Production')
  ? ok('10 baris pertama bersumber "Production"')
  : salah(
      'urutan Production',
      `10 pertama: ${produksi.map((b) => b.sumber).join(',') || '(kosong)'}`
    );

whiteLabel.length === 8 && whiteLabel.every((b) => b.sumber === 'White Label')
  ? ok('8 baris terakhir bersumber "White Label"')
  : salah(
      'urutan White Label',
      `8 terakhir: ${whiteLabel.map((b) => b.sumber).join(',') || '(kosong)'}`
    );

// Label yang tampil harus bentuk tampilan, bukan kode internal
// ('production'/'whitelabel') — dua-duanya lolos kalau tidak diperiksa.
const labelSumber = [...new Set(baris.map((b) => b.sumber))].sort().join('|');
labelSumber === 'Production|White Label'
  ? ok('label sumber memakai bentuk tampilan, bukan kode internal')
  : salah('label sumber', `dapat "${labelSumber}"`);

// Baris = KARTU, jadi kuncinya id kartu — dan id itu harus unik, kalau tidak
// React memakai satu kunci untuk dua baris dan barisnya saling menimpa.
const idUnik = new Set(baris.map((b) => b.id)).size;
idUnik === baris.length
  ? ok('id baris unik — kunci tabel tidak bertabrakan')
  : salah('id unik', `${idUnik} unik dari ${baris.length}`);

baris.every((b) => Number.isFinite(b.pcs) && b.pcs > 0)
  ? ok('setiap baris membawa pcs dari kartunya')
  : salah(
      'pcs',
      `baris tanpa pcs wajar: ${baris.filter((b) => !(Number.isFinite(b.pcs) && b.pcs > 0)).map((b) => b.id).join(', ')}`
    );

// ===== 2. Status & angka =====

console.log('\n== Status & angka ==');

const terhitung = baris.filter((b) => b.status === 'Terhitung');
const tertahan = baris.filter((b) => b.status === 'Tertahan');

terhitung.length === 11
  ? ok('11 baris "Terhitung" (10 Production + Luna Pants)')
  : salah('jumlah Terhitung', `dapat ${terhitung.length}, harus 11`);

tertahan.length === 7
  ? ok('7 baris "Tertahan" (White Label tanpa baris shipment)')
  : salah('jumlah Tertahan', `dapat ${tertahan.length}, harus 7`);

// Status dan angka turun dari gerbang yang sama, jadi harus sejalan. Kalau
// salah satu saja diubah (mis. `hpp: null` jadi `0`), baris "Tertahan" akan
// membawa angka — dan inilah check yang menangkapnya.
const inkonsisten = baris.filter(
  (b) =>
    (b.status === 'Terhitung') !== (b.hpp !== null) ||
    (b.hpp === null) !== (b.hargaJual === null)
);
inkonsisten.length === 0
  ? ok('status, hpp, dan harga jual sejalan di setiap baris')
  : salah(
      'konsistensi status/angka',
      `baris: ${inkonsisten.map((b) => `${b.id} (${b.status}, hpp=${b.hpp})`).join(', ')}`
    );

// `null` BUKAN `0`: 0 akan terbaca "produk ini gratis" dan ikut disetujui.
const adaNol = baris.filter((b) => b.hpp === 0 || b.hargaJual === 0);
adaNol.length === 0
  ? ok('tidak ada baris ber-HPP/harga jual 0')
  : salah('hpp/harga jual 0', `baris: ${adaNol.map((b) => b.id).join(', ')}`);

const alasan = [...new Set(tertahan.map((b) => b.keterangan))];
alasan.length === 1 && alasan[0] === 'Belum ada data ongkos kirim dan pembelian untuk kartu ini.'
  ? ok('baris tertahan membawa alasan yang siap dibaca')
  : salah('alasan tertahan', JSON.stringify(alasan));

terhitung.every((b) => b.keterangan === null)
  ? ok('baris terhitung tidak membawa keterangan')
  : salah(
      'keterangan terhitung',
      `terisi di: ${terhitung.filter((b) => b.keterangan !== null).map((b) => b.id).join(', ')}`
    );

// ===== 3. Angka cocok dengan mesin aslinya =====

console.log('\n== Angka dari gerbangHpp() ==');

// `mesin` dihitung di dalam bundel dari fungsi asli — bukan disalin ke skrip
// ini. Kalau halaman menghitung ulang dengan rumus sendiri, atau memasangkan
// kartu ke baris shipment dengan cara lain, di sinilah ketahuannya.
const beda = baris.filter((b) => {
  const x = mesin.find((mm) => mm.id === b.id);
  return !x || x.hpp !== b.hpp || x.jual !== b.hargaJual || x.boleh !== (b.status === 'Terhitung');
});
beda.length === 0
  ? ok('setiap baris sama dengan hasil gerbangHpp() untuk kartunya')
  : salah(
      'angka vs mesin',
      `beda di: ${beda
        .map((b) => {
          const x = mesin.find((mm) => mm.id === b.id);
          return `${b.id} (hpp ${b.hpp} vs ${x ? x.hpp : '—'})`;
        })
        .join(', ')}`
    );

const luna = baris.find((b) => b.produk === 'Luna Pants');
luna && luna.hpp === 131950 && luna.hargaJual === 316680
  ? ok('Luna Pants: HPP Rp131.950 · harga jual Rp316.680')
  : salah(
      'Luna Pants',
      luna ? `hpp=${luna.hpp}, jual=${luna.hargaJual}` : 'baris tidak ada'
    );

luna && luna.sumber === 'White Label' && luna.status === 'Terhitung'
  ? ok('Luna Pants dibaca sebagai White Label dan berstatus Terhitung')
  : salah('Luna Pants sumber/status', luna ? `${luna.sumber}/${luna.status}` : 'baris tidak ada');

// ===== 4. Kolom =====

console.log('\n== Kolom ==');

const kunci = kolomRingkas.map((k) => k.key).join(',');
kunci === 'produk,workcode,sumber,pcs,hpp,hargaJual,status,keterangan'
  ? ok('8 kolom dengan urutan sesuai spesifikasi')
  : salah('urutan kolom', `dapat "${kunci}"`);

const kSumber = kolomRingkas.find((k) => k.key === 'sumber');
JSON.stringify(kSumber?.filterOptions) === JSON.stringify(['Production', 'White Label'])
  ? ok('filter kolom Sumber berisi kedua label')
  : salah('filterOptions sumber', JSON.stringify(kSumber?.filterOptions));

const kStatus = kolomRingkas.find((k) => k.key === 'status');
JSON.stringify(kStatus?.filterOptions) === JSON.stringify(['Terhitung', 'Tertahan'])
  ? ok('filter kolom Status berisi kedua status')
  : salah('filterOptions status', JSON.stringify(kStatus?.filterOptions));

kolomRingkas.find((k) => k.key === 'hpp')?.jenis === 'uang' &&
kolomRingkas.find((k) => k.key === 'hargaJual')?.jenis === 'uang'
  ? ok('HPP dan Harga Jual memakai jenis "uang" (null dirender "—")')
  : salah(
      'jenis kolom uang',
      `hpp=${kolomRingkas.find((k) => k.key === 'hpp')?.jenis}, hargaJual=${kolomRingkas.find((k) => k.key === 'hargaJual')?.jenis}`
    );

kolomRingkas.find((k) => k.key === 'produk')?.lebar === 'max-w-44' &&
kolomRingkas.find((k) => k.key === 'keterangan')?.lebar === 'max-w-72'
  ? ok('lebar kolom teks panjang dibatasi')
  : salah(
      'lebar kolom',
      `produk=${kolomRingkas.find((k) => k.key === 'produk')?.lebar}, keterangan=${kolomRingkas.find((k) => k.key === 'keterangan')?.lebar}`
    );

const barisTerhitung = terhitung[0];
const barisTertahan = tertahan[0];
barisTerhitung &&
barisTertahan &&
warnaStatus(barisTerhitung) === 'hijau' &&
warnaStatus(barisTertahan) === 'kuning'
  ? ok('badge Status: hijau saat terhitung, kuning saat tertahan')
  : salah(
      'warna status',
      `terhitung=${barisTerhitung ? warnaStatus(barisTerhitung) : '(tidak ada)'}, tertahan=${barisTertahan ? warnaStatus(barisTertahan) : '(tidak ada)'}`
    );

cariLabel.join(',') === 'Produk,Workcode'
  ? ok('pencarian mencari lewat Produk dan Workcode')
  : salah('label pencarian', `dapat "${cariLabel.join(',')}"`);

luna && cariProduk(luna) === 'Luna Pants' && cariWorkcode(luna) === luna.workcode
  ? ok('fungsi pencarian membaca nama produk dan workcode baris')
  : salah(
      'isi pencarian',
      luna ? `produk="${cariProduk(luna)}", workcode="${cariWorkcode(luna)}"` : 'baris tidak ada'
    );

// ===== 5. Halaman lewat rutenya =====

console.log('\n== Halaman lewat rute ==');

halaman.includes('Coming soon')
  ? salah('rute', 'halaman dijawab fallback "Coming soon..." — rutenya tidak terpasang')
  : ok('rute /modul/hpp-harga-jual merender halamannya');

const main = halaman.slice(halaman.indexOf('<main'), halaman.lastIndexOf('</main>'));
main.includes('Tabel HPP &amp; Harga Jual (8 kolom)')
  ? ok('banner pratinjau menyebut modul dan jumlah kolomnya')
  : salah('banner', 'kalimat banner tidak ditemukan di <main>');

// Paginasi merender 10 baris pertama; totalnya muncul di footer. "of 18"
// membuktikan tabel benar-benar menerima 18 baris, bukan 10.
halaman.includes('of 18')
  ? ok('tabel menerima 18 baris (footer paginasi "of 18")')
  : salah('footer paginasi', '"of 18" tidak ditemukan di markup');

main.includes('HPP / pcs') && main.includes('Harga Jual') && main.includes('Keterangan')
  ? ok('header kolom utama ter-render')
  : salah('header kolom', 'ada label kolom yang tidak ditemukan di <main>');

// Format Rupiah memakai spasi (bisa tak-terputus) antara "Rp" dan angkanya,
// jadi polanya harus toleran. Yang dijaga: tidak ada satu pun sel bernilai
// nol — 0 terbaca sebagai "gratis", dan itu justru alasan `null` dipertahankan.
/Rp[\s ]*0(?![\d.,])/.test(halaman)
  ? salah('Rp 0 di markup', 'ada sel bernilai nol')
  : ok('tidak ada "Rp 0" di markup');

// Baris tertahan semuanya ada di halaman 2 paginasi, jadi sel "—"-nya TIDAK
// pernah muncul di `halaman` di atas — check ini membuktikannya langsung dari
// markup tabel terpisah yang berisi HANYA baris tertahan: kolom HPP dan Harga
// Jual menampilkan "—", dan tidak ada satu pun sel bernilai nol.
/Rp[\s ]*0(?![\d.,])/.test(tabelTertahan)
  ? salah('Rp 0 di tabel tertahan', 'ada sel bernilai nol di baris tertahan')
  : ok('tidak ada "Rp 0" di tabel baris tertahan');

const kosongDiharapkan = tertahan.length * 2; // HPP + Harga Jual per baris
const jumlahKosong = (tabelTertahan.match(/text-muted-foreground">—</g) ?? []).length;
jumlahKosong >= kosongDiharapkan
  ? ok(`baris tertahan menampilkan "—" di kolom angkanya (${jumlahKosong} sel)`)
  : salah(
      'baris tertahan menampilkan "—"',
      `${jumlahKosong} sel "—", harusnya ${kosongDiharapkan} (${tertahan.length} baris × HPP + Harga Jual)`
    );

// ===== 6. Menu sidebar =====

console.log('\n== Menu sidebar ==');

const nav = halaman.slice(halaman.indexOf('<nav'), halaman.indexOf('</nav>'));
const posHpp = nav.indexOf('/modul/hpp-baru"');
const posBaru = nav.indexOf('/modul/hpp-harga-jual"');
const posDatang = nav.indexOf('/modul/barang-datang"');

posBaru > 0
  ? ok('entri menu /modul/hpp-harga-jual ada di sidebar')
  : salah('menu', 'tidak ditemukan di <nav>');

posHpp > 0 && posBaru > posHpp && posDatang > posBaru
  ? ok('menu berada tepat setelah "HPP", sebelum "Barang Datang"')
  : salah('posisi menu', `hpp=${posHpp}, baru=${posBaru}, datang=${posDatang}`);

nav.includes('HPP &amp; Harga Jual')
  ? ok('label menu "HPP & Harga Jual"')
  : salah('label menu', 'tidak ditemukan di <nav>');

// Breadcrumb ikut `section` pada item menu — sumber yang berbeda dari judul
// section di sidebar.
const crumbs = halaman.slice(
  halaman.indexOf('data-slot="breadcrumb-list"'),
  halaman.indexOf('</ol>')
);
const crumbMaster = crumbs.indexOf('Master Data');
const crumbHalaman = crumbs.indexOf('HPP &amp; Harga Jual');
crumbMaster >= 0 && crumbHalaman > crumbMaster
  ? ok('breadcrumb menaruh section "Master Data" sebelum nama halaman')
  : salah('breadcrumb', `Master Data=${crumbMaster}, halaman=${crumbHalaman}`);

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log('LULUS — 18 baris, angka cocok dengan gerbangHpp(), rute & menu terpasang.');
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
