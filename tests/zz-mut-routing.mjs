import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const ROOT = 'C:/Users/livou/inventory-app';
const POP = ROOT + '/frontend/src/pages/production-fulfillment/PopupKartu.tsx';
const asli = readFileSync(POP, 'utf8');
process.on('exit', () => writeFileSync(POP, asli));

const M = [
  ['R1 bisaHpp selalu salah (seksi HPP tak pernah dirender)',
   "const bisaHpp = stageId === 'hpp-price';",
   "const bisaHpp = false;"],
  ['R2 bisaHpp selalu benar (semua stage pakai mode HPP)',
   "const bisaHpp = stageId === 'hpp-price';",
   "const bisaHpp = true;"],
  ['R3 sumber diabaikan, selalu production',
   '          kartu,\n          sumber,\n',
   "          kartu,\n          sumber: 'production',\n"],
  ['R4 buktiHpp[] tidak diteruskan (bukti kartu lain/berkosong)',
   'bukti: buktiHpp[kartu.id] ?? {},',
   'bukti: {},'],
  // R5 dan R6 DIWASPADAI SEBAGAI MUSTAHIL DIUJI LEWAT SSR, bukan celah test.
  //
  // Shim itu memilih STATE mana yang menerima berkas — dan itu baru terjadi
  // saat handler dipanggil, yaitu saat ada klik. `renderToStaticMarkup`
  // merender tanpa interaksi sama sekali, jadi pilihan store tidak pernah
  // menulis apa pun ke markup. Markup dengan shim dan tanpa shim identik.
  //
  // Bukti kodenya nyata: di `SeksiHppPrice`, `aksi` diterima sebagai
  // `AksiBuktiHpp` (memakai `AksiStage['lanjutStage']` saja), lalu
  // diteruskan ke `KotakBukti` yang memanggil `aksi.tambahBukti(...)` dari
  // `onChange` input file. Tidak ada jalur render yang menyentuh
  // `tambahBukti`/`hapusBukti`. Menghapus shim berarti hanya handler yang
  // terpasang berubah, dan halaman tetap persis sama sampai ada yang diklik.
  //
  // Kalau shimp ini perlu dibuktikan, tempatnya bukan harness SSR: ia perlu
  // Klik sungguhan (browser check) atau memanggil `IsiPopup` dengan `aksi`
  // sungguhan lalu memeriksa state setelah `tambahBukti` dipanggil.
  ['R5 shim HPP dibuang, KotakBukti dapat handler Cutting',
   'tambahBukti: aksi.tambahBuktiHpp,\n    hapusBukti: aksi.hapusBuktiHpp,',
   'tambahBukti: aksi.tambahBukti,\n    hapusBukti: aksi.hapusBukti,'],
  ['R6 shim HPP salah: tukar tambah dan hapus',
   'tambahBukti: aksi.tambahBuktiHpp,\n    hapusBukti: aksi.hapusBuktiHpp,',
   'tambahBukti: aksi.hapusBuktiHpp,\n    hapusBukti: aksi.tambahBuktiHpp,'],
  ['R7 terkunci selalu false di stage HPP',
   'terkunci: sudahDisetujui,',
   'terkunci: false,'],
  ['R8 tujuan tidak diteruskan (label tombol jadi "stage berikutnya")',
   'tujuan: stageBerikutnya,',
   'tujuan: undefined,'],
];

let n = 0;
const lolos = [];
for (const [label, cari, ganti] of M) {
  if (!asli.includes(cari)) { console.log('LEWAT  ' + label + ' — TARGET TIDAK DITEMUKAN'); lolos.push(label); continue; }
  writeFileSync(POP, asli.replace(cari, ganti));
  let out = '';
  try { out = execFileSync('node', ['tests/smoke-kanban-fulfillment.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  if (/GAGAL/.test(out)) { n++; console.log('TANGKAP ' + label); }
  else { console.log('LEWAT  ' + label + ' — tetap hijau'); lolos.push(label); }
  writeFileSync(POP, asli);
}
console.log('\nTertangkap: ' + n + '/' + M.length);
if (lolos.length) { for (const l of lolos) console.log('  LOLOS: ' + l); process.exit(1); }
