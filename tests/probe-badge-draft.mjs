/**
 * Probe sekali pakai: apakah lencana DRAFT/COMPLETED benar-benar ter-render di
 * kartu, dan apakah aturannya benar-benar berubah saat aksesori diputuskan.
 *
 * Bukan test permanen — habis dipakai boleh dihapus. Tujuannya mengukur MARKUP
 * hasil render, bukan membaca sumber: sumber yang benar tetap hijau walau
 * lencananya tidak pernah sampai ke kartu.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/probe-badge-draft.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');

// Pembersihan lewat `process.on('exit')`: `process.exit()` DILEWATI blok finally.
mkdirSync(path.join(frontendDir, 'node_modules', '.tmp'), { recursive: true });
const kerja = mkdtempSync(path.join(frontendDir, 'node_modules', '.tmp', 'probe-badge-'));
const nama = path.basename(kerja);
const konfig = path.join(frontendDir, `_${nama}.vite.config.ts`);
const masuk = path.join(frontendDir, `_${nama}.entry.tsx`);

const bersihkan = () => {
  rmSync(kerja, { recursive: true, force: true });
  for (const f of [konfig, masuk]) rmSync(f, { force: true });
};
process.on('exit', bersihkan);

const entri = `
import { renderToStaticMarkup } from 'react-dom/server';
import RegisterProduk from './src/pages/RegisterProduk';
import { PRODUK_REGISTER, kartuRegister } from './src/lib/produk';
import { JENIS_AKSESORI_BOM, TANPA_AKSESORI } from './src/lib/opsi';

// Produk dengan SEMUA jenis aksesori dijawab "no need" -> harus COMPLETED.
const LENGKAP = {
  ...PRODUK_REGISTER[0],
  id: 'PRD-LENGKAP',
  nama: 'Produk Lengkap',
  spesifikasi: {
    ...PRODUK_REGISTER[0].spesifikasi,
    aksesori: JENIS_AKSESORI_BOM.map((j) => ({
      nama: TANPA_AKSESORI,
      varian: '-',
      berlaku: 'All variations',
      perPcs: 0,
      satuan: 'pcs',
      jenis: j.value,
    })),
  },
};

// Sama, tapi satu jenis dibiarkan kosong -> harus DRAFT.
const SEBAGIAN = {
  ...LENGKAP,
  id: 'PRD-SEBAGIAN',
  nama: 'Produk Sebagian',
  spesifikasi: {
    ...LENGKAP.spesifikasi,
    aksesori: LENGKAP.spesifikasi.aksesori.map((a, i) =>
      i === 0 ? { ...a, nama: '' } : a
    ),
  },
};

export const tanpaBom = renderToStaticMarkup(
  <RegisterProduk produkAwal={PRODUK_REGISTER} />
);
export const denganBom = renderToStaticMarkup(
  <RegisterProduk produkAwal={[LENGKAP, SEBAGIAN]} />
);

export const kelengkapan = {
  lengkap: kartuRegister([LENGKAP])[0].kelengkapan,
  sebagian: kartuRegister([SEBAGIAN])[0].kelengkapan,
  jumlahJenis: JENIS_AKSESORI_BOM.length,
  labelJenis: JENIS_AKSESORI_BOM.map((j) => j.label).join(', '),
  // Katalog contoh: apa adanya, untuk membandingkan.
  contohKatalog: kartuRegister(PRODUK_REGISTER).map((k) => k.id + '=' + (k.kelengkapan.lengkap ? 'COMPLETED' : 'DRAFT')),
};
`;

writeFileSync(
  konfig,
  `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(${JSON.stringify(frontendDir)}, 'src') }, dedupe: ['react', 'react-dom'] },
  build: { ssr: ${JSON.stringify(masuk)}, outDir: ${JSON.stringify(kerja)}, emptyOutDir: true, minify: false, rollupOptions: { output: { format: 'esm', entryFileNames: 'probe.mjs' } } },
});
`,
  'utf8'
);
writeFileSync(masuk, entri, 'utf8');

// Penjaga: sumber bundel di dalam template literal TIDAK BOLEH memuat backtick.
if ((entri.match(/`/g) ?? []).length > 0) {
  console.error('GAGAL: sumber bundel (const entri) memuat backtick, yang menutup template literal-nya.');
  process.exit(1);
}

let gagalBangun = null;
try {
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
  console.error('GAGAL membangun bundel pratinjau:');
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
const { tanpaBom, denganBom, kelengkapan } = m;

const hitung = (html, t) => (html.match(new RegExp(t, 'g')) || []).length;

console.log('\n== jenis aksesori yang dihubungkan ke master material ==');
console.log(`  ${kelengkapan.jumlahJenis} jenis: ${kelengkapan.labelJenis}`);
console.log('\n== kelengkapan yang dihitung ==');
console.log(`  LENGKAP : ${JSON.stringify(kelengkapan.lengkap)}`);
console.log(`  SEBAGIAN: ${JSON.stringify(kelengkapan.sebagian)}`);
console.log(`  katalog contoh: ${kelengkapan.contohKatalog.join('  ')}`);

console.log('\n== markup ==');
const draftTanpa = hitung(tanpaBom, 'DRAFT');
const compTanpa = hitung(tanpaBom, 'COMPLETED');
const draftDengan = hitung(denganBom, 'DRAFT');
const compDengan = hitung(denganBom, 'COMPLETED');
console.log(`  baseline (katalog contoh) : DRAFT=${draftTanpa} COMPLETED=${compTanpa}`);
console.log(`  +2 produk uji            : DRAFT=${draftDengan} COMPLETED=${compDengan}`);
console.log(`  selisih                  : DRAFT +${draftDengan - draftTanpa}  COMPLETED +${compDengan - compTanpa}`);

console.log('\n== grid ==');
const kelasGrid = /class="([^"]*lg:grid-cols-4[^"]*)"/.exec(denganBom)?.[1] ?? '(tidak ketemu)';
console.log(`  ${kelasGrid}`);
console.log(`  xl:grid-cols-5 : ${denganBom.includes('xl:grid-cols-5') ? 'ADA' : 'TIDAK ADA'}`);

console.log('\n== lencana pada kartu yang benar ==');
for (const n of ['Produk Lengkap', 'Produk Sebagian']) {
  const i = denganBom.indexOf(n);
  if (i < 0) {
    console.log(`  ${n}: TIDAK ADA di markup — kartunya tidak terender`);
    continue;
  }
  // Lencana berada di dalam div foto, sebelum nama. Jendela ke BELAKANG.
  const sekitar = denganBom.slice(Math.max(0, i - 4000), i);
  const jDraft = sekitar.lastIndexOf('DRAFT');
  const jComp = sekitar.lastIndexOf('COMPLETED');
  const badge = jDraft < 0 && jComp < 0 ? 'tidak ketemu' : jDraft > jComp ? 'DRAFT' : 'COMPLETED';
  console.log(`  ${n}: ${badge}`);
}

// Di mana lencananya duduk? Yang diminta pemilik: pojok kanan ATAS kartu.
//
// Jangkar pencariannya kata `absolute` DI DALAM class, bukan `<` terdekat
// sebelum teksnya: teks lencana didahului titik bulatnya sendiri
// (<span aria-hidden>...</span>), jadi `<` terdekat menangkap tag penutup yang
// tidak punya kelas sama sekali -- dan check-nya gagal membaca apa pun.
const pojok = (html, nama) => {
  const i = html.indexOf(nama);
  if (i < 0) return null;
  const sekitar = html.slice(0, i);
  const j = Math.max(sekitar.lastIndexOf('DRAFT'), sekitar.lastIndexOf('COMPLETED'));
  if (j < 0) return null;
  const a = sekitar.lastIndexOf('absolute', j);
  if (a < 0) return null;
  return html.slice(html.lastIndexOf('<', a), j);
};
console.log('\n== kelas lencana (harus absolute + right + top) ==');
for (const n of ['Produk Lengkap', 'Produk Sebagian']) {
  const tag = pojok(denganBom, n);
  const kelas = tag ? /class="([^"]*)"/.exec(tag)?.[1] ?? '' : '';
  const punya = ['absolute', 'right-2', 'top-2'].filter((k) => kelas.includes(k));
  console.log(`  ${n}: ${punya.join(' + ') || 'TIDAK ADA'} ${tag ? '' : '(tag tidak ketemu)'}`);
}

// Kontra-pembuktian: jumlah lencana harus MENGIKUTI isi katalog, bukan tetap.
// Kalau kedua render menghasilkan angka yang sama, pengukuran di atas tidak
// membaca apa pun dan seluruh probe ini hijau palsu.
console.log('');
const lulus =
  // Setiap produk dapat tepat satu lencana: 2 produk -> 1 DRAFT + 1 COMPLETED.
  draftDengan === 1 &&
  compDengan === 1 &&
  // Tidak ada produk yang lengkap di katalog contoh, jadi COMPLETED tidak
  // boleh muncul sama sekali di sana.
  compTanpa === 0 &&
  draftTanpa === 4;
if (lulus) {
  console.log('TERBUKTI — lencana ikut berubah mengikuti keputusan aksesori (COMPLETED hanya saat semua jenis dijawab).');
  process.exit(0);
}
console.log(
  `TIDAK TERBUKTI — katalog contoh harus 4 DRAFT + 0 COMPLETED, dua produk uji harus 1 DRAFT + 1 COMPLETED. ` +
    `Dapat: contoh ${draftTanpa}/${compTanpa}, uji ${draftDengan}/${compDengan}.`
);
process.exit(1);
