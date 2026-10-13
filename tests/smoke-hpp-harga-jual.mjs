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
 *   4. Kolom & SKU     : urutan, filterOptions, jenis "uang", lebar, warna
 *                        badge, field pencarian, dan kolom "SKU Produk"
 *                        (LVU-…, tanpa CSC-) — nilai, label, dan pencariannya.
 *   5. Halaman & menu  : rute merender halamannya (bukan fallback), banner,
 *                        18 baris sampai ke tabel, tidak ada "Rp 0", tombol
 *                        keyboard di kolom Produk, dan entri sidebar di
 *                        section Report (paling bawah).
 *   6. Popup           : isi popup di-render LANGSUNG lewat `IsiPopupHarga`
 *                        (portal `Dialog` tidak ter-render di server): header,
 *                        stat box, tab Perhitungan (Production & White Label),
 *                        tab Riwayat (angka, "ini", delta, empty state), dan
 *                        kartu tertahan (alasan + "—").
 *   7. Tabel tertahan  : render terpisah berisi HANYA baris tertahan —
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
 * CATATAN soal Rupiah di markup: `Intl` menaruh NBSP (U+00A0) antara "Rp" dan
 * angkanya, jadi perbandingan teks apa pun yang memuat Rupiah harus lewat
 * `norm()` dulu — tanpa itu check-nya gagal karena spasi yang tak terlihat.
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
import { susunBaris, kolomHarga, cariHarga, skuProduk, formatDelta, riwayatUntuk, IsiPopupHarga } from './src/pages/HppHargaJual';
import { KARTU_PRODUCTION, KARTU_WHITELABEL } from './src/pages/production-fulfillment/data-kanban';
import { barisShipmentUntuk, gerbangHpp, hppProduksi } from './src/pages/production-fulfillment/hpp';
import { rupiah } from './src/lib/format';
import { barisContoh } from './src/pages/HppPratinjau';

export { rupiah };

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
    columns={kolomHarga(() => {})}
    searchFields={cariHarga}
    itemLabel="hasil HPP"
    rowKey={(r) => r.id}
  />
);

// ===== Isi popup, di-render LANGSUNG =====
//
// DialogContent memakai portal dan portal tidak ter-render di server, jadi
// popup tidak akan pernah muncul di markup halaman di atas — pemeriksaannya
// harus lewat IsiPopupHarga yang sudah dipisah dari pembungkusnya.
//
// Radix Tabs hanya me-render tab yang AKTIF saat SSR: tab Riwayat hanya bisa
// diperiksa lewat render kedua dengan tabAwal="riwayat". Tanpa itu check
// riwayatnya hijau tanpa memeriksa apa pun.

export const elodie = baris.find((b) => b.produk === 'Elodie Top');
export const luna = baris.find((b) => b.produk === 'Luna Pants');
export const tertahanPertama = baris.find((b) => b.status === 'Tertahan');

// Render yang tidak boleh meruntuhkan SELURUH bundel: kalau barisnya tidak ada
// (mis. mutasi memotong daftarnya), popup-nya tidak bisa dirender — dan itu
// harus terbaca sebagai check yang GAGAL, bukan sebagai bundel yang gagal
// di-import. Kegagalan import keluar non-zero TANPA baris GAGAL, dan harness
// mutasi membaca itu sebagai "mutasi tidak sah" — bukan "tertangkap".
const renderIsi = (baris, tabAwal) => {
  if (!baris) return '';
  try {
    return renderToStaticMarkup(<IsiPopupHarga baris={baris} tabAwal={tabAwal} />);
  } catch (e) {
    return '';
  }
};

export const popupElodie = renderIsi(elodie);
export const popupLuna = renderIsi(luna);
export const popupElodieRiwayat = renderIsi(elodie, 'riwayat');
export const popupLunaRiwayat = renderIsi(luna, 'riwayat');
export const popupTertahan = renderIsi(tertahanPertama);

// Baris tanpa riwayat: SKU-nya tidak ada di RIWAYAT_CONTOH, jadi tab Riwayat
// harus menampilkan empty state — bukan daftar kosong tanpa penjelasan.
export const barisTanpaRiwayat = baris.find(
  (b) => b.sku !== 'LVU-TOP-17' && b.sku !== 'LVU-PNT-31'
);
export const popupTanpaRiwayat = renderIsi(barisTanpaRiwayat, 'riwayat');

// Label tab yang tampil — "Riwayat HPP (4)" membuktikan jumlah entri ikut
// dibaca dari riwayat, bukan angka yang ditulis tetap di markup.
export const labelTabElodie = {
  perhitungan: popupElodie.includes('Perhitungan HPP'),
  riwayat: popupElodieRiwayat.includes('Riwayat HPP (4)'),
  riwayatLuna: popupLunaRiwayat.includes('Riwayat HPP (2)'),
};

// Nilai-nilai yang dipakai check popup, dihitung DI DALAM bundel dari mesin
// asli — supaya angka di markup dibandingkan dengan mesinnya, bukan dengan
// angka yang ditulis ulang di skrip ini. gerbangHpp tidak mengembalikan
// total biaya (itu milik hppProduksi), jadi dua-duanya diambil.
export const mesinElodie = elodie
  ? gerbangHpp(elodie.kartu, 'production', elodie.kartu.detail.ongkosJahit)
  : null;
export const produksiElodie = elodie
  ? hppProduksi(elodie.kartu, elodie.kartu.detail.ongkosJahit)
  : null;
export const shipmentLuna = luna ? barisShipmentUntuk(luna.kartu, barisContoh).baris : null;

// Delta dihitung lewat formatDelta yang ASLI, dari riwayat yang ASLI —
// slice(1) aman untuk riwayat sepanjang apa pun, jadi mutasi yang memotong
// riwayat tidak meruntuhkan bundelnya.
const riwayatTop = riwayatUntuk('LVU-TOP-17');
const riwayatPnt = riwayatUntuk('LVU-PNT-31');
export const deltaElodie = riwayatTop
  .slice(1)
  .map((e, i) => formatDelta(e.hpp, riwayatTop[i].hpp));
export const deltaLuna = riwayatPnt.length > 1
  ? [formatDelta(riwayatPnt[1].hpp, riwayatPnt[0].hpp)]
  : [];

// Bentuk kolom yang bisa dibandingkan lintas modul: fungsi value/warna
// tidak bisa diserialkan, jadi yang diekspor hanya fieldnya. warnaStatus
// memanggil fungsi warna ASLI dari kolom, memakai baris ASLI.
const kolom = kolomHarga(() => {});
export const kolomRingkas = kolom.map((k) => ({
  key: k.key,
  label: k.label,
  jenis: k.jenis ?? null,
  lebar: k.lebar ?? null,
  filterOptions: k.filterOptions ?? null,
}));
export const warnaStatus = (b) => kolom.find((c) => c.key === 'status').warna(b);

// Tombol keyboard: onRowClick hanya mouse, jadi kolom Produk dirender
// sebagai tombol ber-aria-label. Callback buka tidak terlihat di markup,
// jadi render dengan callback kosong tetap memeriksa markup yang sama persis
// dengan yang dipakai halaman.
export const tabelProduk = renderToStaticMarkup(
  <TabelPratinjau
    rows={baris}
    columns={kolom}
    searchFields={cariHarga}
    itemLabel="hasil HPP"
    rowKey={(r) => r.id}
  />
);

export const cariLabel = cariHarga.map((f) => f.label);
export const cariProduk = cariHarga[0] ? cariHarga[0].get : () => '';
export const cariSku = cariHarga[1] ? cariHarga[1].get : () => '';

// SKU: helper asli untuk setiap kartu + apakah ada sisa "CSC-" di mana pun.
export const skuSemua = baris.map((b) => skuProduk(b.kartu));
export const adaCsc = baris.some((b) => b.sku.includes('CSC-'));

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
  tabelProduk,
  kolomRingkas,
  warnaStatus,
  cariLabel,
  cariProduk,
  cariSku,
  mesin,
  elodie,
  luna,
  tertahanPertama,
  popupElodie,
  popupLuna,
  popupElodieRiwayat,
  popupLunaRiwayat,
  popupTertahan,
  popupTanpaRiwayat,
  labelTabElodie,
  mesinElodie,
  produksiElodie,
  shipmentLuna,
  deltaElodie,
  deltaLuna,
  skuSemua,
  adaCsc,
  rupiah,
} = m;

// Rupiah dari Intl memuat NBSP (U+00A0) antara "Rp" dan angkanya. Semua
// perbandingan teks yang memuat Rupiah lewat sini dulu supaya spasi tak
// terlihat itu tidak membuat check gagal karena sebab yang salah.
const norm = (s) => s.replace(/ /g, ' ');

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

luna && luna.hpp === 131950 && luna.hargaJual === 316680
  ? ok('Luna Pants: HPP Rp131.950 · harga jual Rp316.680')
  : salah(
      'Luna Pants',
      luna ? `hpp=${luna.hpp}, jual=${luna.hargaJual}` : 'baris tidak ada'
    );

luna && luna.sumber === 'White Label' && luna.status === 'Terhitung'
  ? ok('Luna Pants dibaca sebagai White Label dan berstatus Terhitung')
  : salah('Luna Pants sumber/status', luna ? `${luna.sumber}/${luna.status}` : 'baris tidak ada');

// ===== 3b. SKU Produk =====

console.log('\n== SKU Produk ==');

// SKU = designCode tanpa prefix `CSC-`, berprefix `LVU-` — pola yang sama
// dengan `skuVarian()` di data-kanban.ts. Kalau salah satu bagian hilang,
// riwayat HPP per SKU tidak akan pernah cocok dengan baris mana pun.
elodie && elodie.sku === 'LVU-TOP-17'
  ? ok('SKU Elodie Top: LVU-TOP-17')
  : salah('SKU Elodie', elodie ? `dapat "${elodie.sku}"` : 'baris tidak ada');

luna && luna.sku === 'LVU-PNT-31'
  ? ok('SKU Luna Pants: LVU-PNT-31')
  : salah('SKU Luna', luna ? `dapat "${luna.sku}"` : 'baris tidak ada');

!adaCsc
  ? ok('tidak ada sisa prefix "CSC-" di kolom SKU mana pun')
  : salah(
      'sisa CSC- di SKU',
      baris.filter((b) => b.sku.includes('CSC-')).map((b) => b.sku).join(', ')
    );

// Setiap baris harus memakai helper yang sama — bukan cuma dua contoh di
// atas. Baris yang SKU-nya dihitung dengan cara lain lolos dari dua check
// pertama tapi putus kaitannya dengan riwayat.
const skuBeda = baris.filter((b, i) => b.sku !== skuSemua[i] || !/^LVU-/.test(b.sku));
skuBeda.length === 0
  ? ok('semua 18 baris memakai skuProduk() dan berawalan "LVU-"')
  : salah(
      'SKU semua kartu',
      skuBeda.map((b) => `${b.produk}="${b.sku}"`).join(', ')
    );

// ===== 4. Kolom =====

console.log('\n== Kolom ==');

const kunci = kolomRingkas.map((k) => k.key).join(',');
kunci === 'produk,sku,sumber,pcs,hpp,hargaJual,status,keterangan'
  ? ok('8 kolom dengan urutan sesuai spesifikasi')
  : salah('urutan kolom', `dapat "${kunci}"`);

// Label kolom kedua ikut diperiksa — kuncinya bisa benar sementara labelnya
// masih "Workcode", dan itu yang dibaca orang di layar.
kolomRingkas.find((k) => k.key === 'sku')?.label === 'SKU Produk'
  ? ok('kolom kedua berlabel "SKU Produk"')
  : salah(
      'label kolom SKU',
      `dapat "${kolomRingkas.find((k) => k.key === 'sku')?.label}"`
    );

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

cariLabel.join(',') === 'Produk,SKU Produk'
  ? ok('pencarian mencari lewat Produk dan SKU Produk')
  : salah('label pencarian', `dapat "${cariLabel.join(',')}"`);

luna && cariProduk(luna) === 'Luna Pants' && cariSku(luna) === luna.sku
  ? ok('fungsi pencarian membaca nama produk dan SKU baris')
  : salah(
      'isi pencarian',
      luna ? `produk="${cariProduk(luna)}", sku="${cariSku(luna)}"` : 'baris tidak ada'
    );

// Placeholder ikut menyebut keduanya: pengguna tahu field ini juga mencari
// SKU, bukan cuma nama produk.
halaman.includes('Cari produk atau SKU…')
  ? ok('placeholder pencarian menyebut produk dan SKU')
  : salah(
      'placeholder pencarian',
      'teks "Cari produk atau SKU…" tidak ditemukan di markup halaman'
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

main.includes('SKU Produk')
  ? ok('header "SKU Produk" ter-render di halaman')
  : salah('header SKU', '"SKU Produk" tidak ditemukan di <main>');

// Jalur keyboard: `onRowClick` hanya mouse (didokumentasikan di
// TabelPratinjau.tsx), jadi kolom Produk WAJIB berupa tombol ber-aria-label.
// Diperiksa dari render tabel yang memasang kolom asli halaman — bukan dari
// `susunBaris()` — karena tombolnya hidup di markup, bukan di data.
tabelProduk.includes('aria-label="Buka detail HPP Elodie Top"')
  ? ok('kolom Produk punya tombol ber-aria-label "Buka detail HPP …"')
  : salah(
      'tombol keyboard produk',
      'aria-label="Buka detail HPP Elodie Top" tidak ditemukan di markup tabel'
    );

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
const posBaru = nav.indexOf('/modul/hpp-harga-jual"');
const posHpp = nav.indexOf('/modul/hpp-baru"');
const posProgress = nav.indexOf('>Progress<');
const posReport = nav.indexOf('>Report<');

posBaru > 0
  ? ok('entri menu /modul/hpp-harga-jual ada di sidebar')
  : salah('menu', 'tidak ditemukan di <nav>');

// Revisi 1 (tiket 02): halaman PINDAH dari Master Data ke section Report,
// paling bawah setelah Progress. Dua entri ber-path sama akan membuat dua
// baris aktif sekaligus, jadi posisinya diperiksa, bukan cuma keberadaannya.
posReport > 0 && posBaru > posReport
  ? ok('entri menu berada di dalam section Report')
  : salah('section menu', `Report=${posReport}, entri=${posBaru}`);

posProgress > 0 && posReport > posProgress
  ? ok('section Report berada setelah Progress (paling bawah)')
  : salah('urutan section', `Progress=${posProgress}, Report=${posReport}`);

// Kalau entri masih ikut `modulBaru` (di atas Report), ia muncul DUA kali di
// sidebar — check ini yang membuktikannya, bukan `posBaru > posReport` saja.
const jumlahEntri = (nav.match(/\/modul\/hpp-harga-jual"/g) ?? []).length;
jumlahEntri === 1
  ? ok('entri menu hanya muncul sekali (tidak ikut Master Data lagi)')
  : salah('entri ganda', `entri /modul/hpp-harga-jual muncul ${jumlahEntri}× di sidebar`);

nav.includes('HPP &amp; Harga Jual')
  ? ok('label menu "HPP & Harga Jual"')
  : salah('label menu', 'tidak ditemukan di <nav>');

// Breadcrumb ikut `section` pada item menu — sumber yang berbeda dari judul
// section di sidebar.
const crumbs = halaman.slice(
  halaman.indexOf('data-slot="breadcrumb-list"'),
  halaman.indexOf('</ol>')
);
const crumbReport = crumbs.indexOf('Report');
const crumbHalaman = crumbs.indexOf('HPP &amp; Harga Jual');
crumbReport >= 0 && crumbHalaman > crumbReport
  ? ok('breadcrumb menaruh section "Report" sebelum nama halaman')
  : salah('breadcrumb', `Report=${crumbReport}, halaman=${crumbHalaman}`);

// ===== 7. Popup (isi, dirender langsung) =====

console.log('\n== Popup: tab Perhitungan ==');

// Header: nama produk + pill SKU + baris kedua batch/pcs/status.
popupElodie.includes('Elodie Top') && popupElodie.includes('LVU-TOP-17')
  ? ok('header popup: nama produk + SKU')
  : salah('header popup', 'nama produk atau SKU tidak ditemukan di markup popup');

// Batch-nya dibungkus <span> sendiri di dalam baris "Batch B-00 · 145 pcs",
// jadi yang dicari potongan markupnya, bukan kalimat utuhnya.
popupElodie.includes('Batch') &&
popupElodie.includes('>B-00</span>') &&
popupElodie.includes('145 pcs')
  ? ok('baris kedua header: batch dan pcs dari kartunya')
  : salah('batch/pcs popup', 'Batch / >B-00</span> / 145 pcs tidak ditemukan di markup popup');

// Batch dibandingkan dengan batch baris LAIN (Luna = B-01): tanpa ini, batch
// yang ditulis tetap "B-00" di header tetap lolos — kartu pertama kebetulan
// memang B-00. Nilainya dibaca dari `luna.batch`, bukan ditulis di sini.
luna && popupLuna.includes(`>${luna.batch}</span>`)
  ? ok('header popup Luna memakai batch kartunya (B-01), bukan nilai tetap')
  : salah(
      'batch/pcs popup Luna',
      luna ? `diharapkan ">${luna.batch}</span>" di header popup Luna` : 'baris Luna tidak ada'
    );

// Tiga stat box, masing-masing dipatok ke kotaknya SENDIRI — bukan dicari di
// seluruh popup. Dua nilai yang sama muncul lagi di tempat lain (rupiah HPP
// adalah awalan dari "Rp 111.900,14" di garis bagi, dan total biaya muncul
// lagi di baris total tabel), jadi mencari di seluruh popup akan hijau
// walaupun kotaknya berisi angka lain. Potongan markup antara label kotak dan
// label kotak berikutnya memisahkan ketiganya.
const potongan = (dari, sampai) =>
  popupElodie.slice(popupElodie.indexOf(dari), popupElodie.indexOf(sampai));
const kotakHpp = potongan('HPP / pcs', 'Harga Jual');
const kotakJual = potongan('Harga Jual', 'Total biaya batch ini');
const kotakTotal = potongan('Total biaya batch ini', 'Perhitungan HPP');

mesinElodie &&
produksiElodie &&
norm(kotakHpp).includes(norm(rupiah(mesinElodie.hpp))) &&
norm(kotakJual).includes(norm(rupiah(mesinElodie.sellingPrice))) &&
norm(kotakTotal).includes(norm(rupiah(produksiElodie.totalBiaya)))
  ? ok('stat box Elodie: HPP, harga jual, dan total biaya sama dengan mesin')
  : salah(
      'stat box Elodie',
      mesinElodie
        ? `hpp=${mesinElodie.hpp}, jual=${mesinElodie.sellingPrice}, total=${produksiElodie?.totalBiaya}`
        : 'baris Elodie tidak ada'
    );

// Sub-label kotak harga jual membaca margin GLOBAL dari konstanta
// (MARGIN_HARGA_JUAL), bukan angka yang ditulis ulang di halaman — 2,4.
kotakJual.includes('HPP × 2,4')
  ? ok('sub harga jual menyebut margin global (HPP × 2,4)')
  : salah('label margin', 'teks "HPP × 2,4" tidak ditemukan di kotak Harga Jual');

// Garis bagi butuh 2 desimal (rupiah() membulatkan ke rupiah utuh, jadi
// "111.900,14" HANYA bisa muncul lewat rupiahPresisi dari @/lib/format —
// angka ini yang membuktikan garis baginya tidak memakai formatter yang
// membulatkan).
norm(popupElodie).includes('Rp 111.900,14')
  ? ok('garis bagi Elodie menampilkan HPP 2 desimal (Rp 111.900,14)')
  : salah('garis bagi Elodie', 'teks "Rp 111.900,14" tidak ditemukan di markup popup');

norm(popupElodie).includes('16.225.520 ÷ 145')
  ? ok('garis bagi Elodie memakai total biaya dan pcs jadi yang benar')
  : salah('isi garis bagi Elodie', 'teks "16.225.520 ÷ 145" tidak ditemukan');

// Tabel perhitungan Production: baris bahan + baris ongkos jahit ikut, dan
// header kolomnya sesuai mockup.
popupElodie.includes('Ongkos Jahit Konveksi') &&
popupElodie.includes('Harga FIFO') &&
popupElodie.includes('Total biaya bahan + ongkos jahit')
  ? ok('tabel perhitungan Production: baris ongkos jahit + header + total')
  : salah(
      'tabel perhitungan',
      'baris ongkos jahit / header / total tidak lengkap di markup popup'
    );

console.log('\n== Popup: White Label ==');

norm(popupLuna).includes(shipmentLuna?.codeShipment ?? '\u0000') &&
norm(popupLuna).includes(shipmentLuna?.namaSupplier ?? '\u0000')
  ? ok('popup White Label menyebut kode shipment dan nama vendornya')
  : salah(
      'shipment WL',
      shipmentLuna
        ? `diharapkan ${shipmentLuna.codeShipment} · ${shipmentLuna.namaSupplier}`
        : 'baris shipment Luna tidak ditemukan'
    );

shipmentLuna &&
norm(popupLuna).includes(norm(rupiah(shipmentLuna.actualIdrPaidProduct))) &&
norm(popupLuna).includes(norm(rupiah(shipmentLuna.actualIdrPaidLogistic)))
  ? ok('komponen White Label: pembelian produk + ongkos kirim dari shipmentnya')
  : salah(
      'komponen WL',
      `produk=${shipmentLuna?.actualIdrPaidProduct}, logistik=${shipmentLuna?.actualIdrPaidLogistic}`
    );

norm(popupLuna).includes('Rp 131.950,00') && norm(popupLuna).includes('5.278.000 ÷ 40')
  ? ok('garis bagi White Label: total shipment ÷ 40 pcs')
  : salah('garis bagi WL', 'teks "Rp 131.950,00" / "5.278.000 ÷ 40" tidak ditemukan');

console.log('\n== Popup: tab Riwayat ==');

// Radix hanya me-render tab aktif — isi riwayat diperiksa lewat render kedua
// dengan tabAwal="riwayat". Tanpa render itu, check di bawah ini tidak akan
// pernah menemukan apa pun.
popupElodieRiwayat.includes('26 May 2026') &&
popupElodieRiwayat.includes('B-00') &&
popupElodieRiwayat.includes('B-03')
  ? ok('riwayat Elodie: entri B-03 sampai B-00 ter-render')
  : salah('riwayat Elodie', 'batch/tanggal entri riwayat tidak ditemukan di markup');

// "ini" menandai batch kartu ini di antara riwayat — tanpa itu, orang tidak
// tahu baris mana yang sedang dibuka.
popupElodieRiwayat.includes('>ini<')
  ? ok('entri riwayat untuk batch kartu ini ditandai "ini"')
  : salah('tanda ini', 'badge "ini" tidak ditemukan di markup riwayat');

const deltaDitemukan = deltaElodie.filter((d) => norm(popupElodieRiwayat).includes(d));
deltaElodie.length === 3 && deltaDitemukan.length === deltaElodie.length
  ? ok(`delta riwayat Elodie sesuai hitungan: ${deltaElodie.join(' / ')}`)
  : salah(
      'delta riwayat',
      `ditemukan ${deltaDitemukan.join(', ') || '(tidak ada)'} dari ${deltaElodie.join(', ') || '(kosong)'}`
    );

// Nilai dipatok LITERAL dari mockup yang disetujui — bukan dihitung ulang
// lewat formatDelta yang sama dengan halaman. Check di atas sengaja
// menghitung ulang (membuktikan urutan pembandingnya benar); check INI yang
// menahan formatDelta itu sendiri: tanda atau pembulatan yang salah tetap
// "konsisten" di kedua sisi check pertama, jadi tidak pernah ketahuan dari
// sana.
const deltaMockupElodie = ['−5,3%', '+2,6%', '+2,5%'];
deltaMockupElodie.every((d) => norm(popupElodieRiwayat).includes(d))
  ? ok('delta riwayat Elodie persis mockup: −5,3% / +2,6% / +2,5%')
  : salah(
      'delta literal Elodie',
      `markup memuat ${deltaMockupElodie.filter((d) => norm(popupElodieRiwayat).includes(d)).join(' / ') || '(tidak ada)'} dari ${deltaMockupElodie.join(' / ')}`
    );

// Label tab membawa JUMLAH entri — "Riwayat HPP (4)" tidak bisa muncul kalau
// jumlahnya ditulis tetap di markup.
labelTabElodie.perhitungan && labelTabElodie.riwayat
  ? ok('tab Riwayat menyebut jumlah entri (Riwayat HPP (4))')
  : salah('label tab', JSON.stringify(labelTabElodie));

labelTabElodie.riwayatLuna
  ? ok('tab Riwayat Luna memakai jumlah entri miliknya sendiri (2)')
  : salah('label tab Luna', 'Riwayat HPP (2) tidak ditemukan di markup popup Luna');

deltaLuna.length > 0 && norm(popupLunaRiwayat).includes(deltaLuna[0])
  ? ok(`delta riwayat Luna dihitung dari entri sebelumnya (${deltaLuna[0]})`)
  : salah('delta Luna', `diharapkan "${deltaLuna.join('') || '(kosong)'}" di markup popup Luna`);

// Sama seperti Elodie: satu delta dipatok LITERAL — 129.400 → 131.950 harus
// terbaca "+2,0%" (naik 1,97%, dibulatkan satu desimal). Check di atas
// menghitung ulang lewat formatDelta yang SAMA dengan halaman, jadi
// kesalahan tanda/pembulatan tidak akan ketahuan dari sana.
norm(popupLunaRiwayat).includes('+2,0%')
  ? ok('delta riwayat Luna persis hitungan: +2,0%')
  : salah('delta literal Luna', 'teks "+2,0%" tidak ditemukan di markup popup Luna');

// SKU tanpa entri riwayat: empty state yang menjelaskan, bukan daftar kosong.
popupTanpaRiwayat.includes('Belum ada riwayat HPP untuk SKU ini.')
  ? ok('SKU tanpa riwayat menampilkan empty state')
  : salah(
      'empty state riwayat',
      'kalimat "Belum ada riwayat HPP untuk SKU ini." tidak ditemukan'
    );

console.log('\n== Popup: kartu tertahan ==');

// Kartu tertahan: alasan yang bisa dibaca, angka "—" (bukan 0), dan tab
// Perhitungan menampilkan alasan — bukan tabel kosong.
const ketTertahan = tertahanPertama ? String(tertahanPertama.keterangan ?? '') : '';
tertahanPertama && ketTertahan.length > 0 && popupTertahan.includes(norm(ketTertahan))
  ? ok('popup kartu tertahan menampilkan alasannya')
  : salah(
      'alasan di popup tertahan',
      tertahanPertama ? `keterangan="${tertahanPertama.keterangan}"` : 'baris tertahan tidak ada'
    );

!norm(popupTertahan).includes('Rp 0') && norm(popupTertahan).includes('—')
  ? ok('popup kartu tertahan memakai "—", bukan "Rp 0"')
  : salah('angka popup tertahan', 'ditemukan "Rp 0" atau tidak ada "—" di markup');

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log('LULUS — 18 baris, angka cocok dengan gerbangHpp(), rute & menu terpasang.');
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
