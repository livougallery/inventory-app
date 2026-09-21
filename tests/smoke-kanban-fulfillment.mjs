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
 *   1. Papan Production  : 8 kolom, 10 kartu, teks kunci ada
 *   2. Papan White Label : 8 kolom, 8 kartu, dan TIDAK ada kolom "Cutting"
 *                          (white label tidak dipotong — diganti Invoice Logistic)
 *   3. Popup Elodie Top  : tiga seksi, tabel varian, tabel BOM, angka-angka
 *   4. Angka turunan     : plan qty, jumlah varian, dan badge kekurangan
 *                          dihitung ulang dari data dan dicocokkan
 *
 * Pemeriksaan nomor 4 yang paling penting. Angka di papan TIDAK diketik
 * manual — semuanya diturunkan dari tabel warna/ukuran dan tabel BOM. Skrip ini
 * membuktikan turunannya benar, jadi tidak mungkin ada kartu bertanda "Ready"
 * yang isinya masih kurang.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-kanban-fulfillment.mjs
 *
 * Tidak butuh server, tidak butuh browser, tidak menyentuh database.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
const kerja = mkdtempSync(path.join(frontendDir, 'node_modules', '.tmp', 'smoke-kanban-'));
const konfig = path.join(frontendDir, '_smoke-kanban.vite.config.ts');
const masuk = path.join(frontendDir, '_smoke-kanban.entry.tsx');

const entri = `
import { renderToStaticMarkup } from 'react-dom/server';
import PapanFulfillment from './src/pages/production-fulfillment/PapanFulfillment';
import { IsiPopup } from './src/pages/production-fulfillment/PopupKartu';
import {
  KARTU_PRODUCTION, KARTU_WHITELABEL,
  PAPAN_PRODUCTION, PAPAN_WHITELABEL,
  totalPcs, jumlahVarian, kekurangan, bahanKartu,
} from './src/pages/production-fulfillment/data-kanban';

export const produksi = renderToStaticMarkup(
  <PapanFulfillment stages={PAPAN_PRODUCTION} kartu={KARTU_PRODUCTION} />
);
export const whitelabel = renderToStaticMarkup(
  <PapanFulfillment stages={PAPAN_WHITELABEL} kartu={KARTU_WHITELABEL} />
);
export const popup = renderToStaticMarkup(<IsiPopup kartu={KARTU_PRODUCTION[0]} />);

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
`;

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
  console.error('\nGAGAL membangun bundel pratinjau papan:');
  console.error(String(e.stdout || e.message).slice(0, 3000));
  process.exit(1);
} finally {
  for (const f of [konfig, masuk]) if (existsSync(f)) rmSync(f, { force: true });
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
rmSync(kerja, { recursive: true, force: true });

const { produksi, whitelabel, popup, fakta, faktaWL } = m;

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

// ===== 2. Papan White Label =====

console.log('\n== Papan White Label ==');
const kolomWl = (whitelabel.match(/data-slot="kanban-column"/g) || []).length;
const kartuWl = (whitelabel.match(/data-slot="kartu-fulfillment"/g) || []).length;
kolomWl === 8 ? ok('8 kolom') : salah('jumlah kolom WL', `dapat ${kolomWl}, harus 8`);
kartuWl === 8 ? ok('8 kartu') : salah('jumlah kartu WL', `dapat ${kartuWl}, harus 8`);
whitelabel.includes('Invoice Logistic')
  ? ok('ada kolom "Invoice Logistic"')
  : salah('kolom "Invoice Logistic"', 'tidak ditemukan');

// White label tidak dipotong di sini — kalau "Cutting" muncul, papannya salah.
!whitelabel.includes('>Cutting<')
  ? ok('tidak ada kolom "Cutting" (benar — diganti Invoice Logistic)')
  : salah('kolom "Cutting" di papan White Label', 'seharusnya tidak ada');

whitelabel.includes('WHLB')
  ? ok('workcode white label memakai akhiran WHLB')
  : salah('akhiran WHLB', 'tidak ditemukan');

// ===== 3. Popup =====

console.log('\n== Popup detail kartu ==');
for (const t of [
  'Product &amp; Proposal Information',
  'Color &amp; Size Plan',
  'Material Requirements (BOM)',
  'LVU-TOP-17-BLK-S', 'LVU-TOP-17-IVR-L',
  '6 variation rows', 'Total plan 145 PCS',
  'Label Brand', 'Karet Pinggang', 'Kain Pleats',
  'registered automatically',
]) {
  popup.includes(t) ? ok(`popup "${t}"`) : salah(`popup "${t}"`, 'tidak ditemukan');
}

// ===== 4. Angka turunan =====

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

// ===== Hasil =====

console.log('');
if (gagal.length === 0) {
  console.log('LULUS — papan, popup, dan angka turunannya konsisten.');
  process.exit(0);
}
console.log(`GAGAL — ${gagal.length} pemeriksaan tidak lolos:`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
