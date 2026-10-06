/**
 * Runner mutasi untuk pemeriksaan Tiket 3 (Finance Validate — daftar temuan)
 * di smoke test.
 *
 * Tiap mutasi di bawah merusak SATU hal di kode app dan menuntut smoke test
 * melaporkan setidaknya satu GAGAL. Mutasi yang membiarkan suite tetap hijau
 * berarti pemeriksaan yang bersangkutan tidak benar-benar menguji apa pun —
 * ia hijau karena alasan lain, bukan karena kodenya benar.
 *
 * Jalankan: node tests/zz-mutate-ticket3.mjs
 * Semua berkas yang disentuh dipulihkan lagi, termasuk kalau proses mati.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'C:/Users/livou/inventory-app';
const POPUP = ROOT + '/frontend/src/pages/production-fulfillment/PopupKartu.tsx';
const TEMUAN = ROOT + '/frontend/src/pages/production-fulfillment/temuan.ts';

const asli = new Map();
for (const f of [POPUP, TEMUAN]) asli.set(f, readFileSync(f, 'utf8'));

const pulihkan = () => {
  for (const [f, isi] of asli) writeFileSync(f, isi);
};
process.on('exit', pulihkan);

// [label, file, find, replace]
const MUTASI = [
  // -- Routing: popup Finance Validate memakai seksinya sendiri.
  //
  // M1 mematikan cabangnya: popupnya jatuh ke SeksiBelumAda dan pemeriksaan
  // "memakai seksi temuan" harus GAGAL.
  [
    'M1 routing finance-validate dimatikan',
    POPUP,
    "const bisaFinanceValidate = stageId === 'finance-validate';",
    'const bisaFinanceValidate = false;',
  ],
  // M2: cabangnya hidup, tapi penjaga fallback-nya lupa mengecualikan
  // finance-validate. Dua seksi dirender sekaligus — daftar temuan tampil,
  // TAPI di bawahnya muncul lagi "Belum ada isi khusus". Pemeriksaan yang
  // cuma mencari judul akan lolos; yang menangkap ini adalah pemeriksaan
  // "fallback TIDAK boleh ada".
  [
    'M2 fallback SeksiBelumAda tidak mengecualikan finance-validate',
    POPUP,
    '        !bisaUpload &&\n        !bisaFinanceValidate &&\n',
    '        !bisaUpload &&\n',
  ],

  // -- Gerbang: boleh lanjut hanya kalau tidak ada temuan terbuka.
  [
    'M3 gerbang selalu terbuka (bolehLanjut = true)',
    POPUP,
    'const bolehLanjut = terbuka.length === 0;',
    'const bolehLanjut = true;',
  ],

  // -- Riwayat: temuan yang ditutup tetap tampil, statusnya berubah.
  //
  // M4 menyaring daftarnya jadi hanya temuan terbuka — persis yang dilarang
  // keputusan pemilik ("tampil dengan status, bukan hilang"). Yang menangkap
  // ini adalah pemeriksaan jumlah baris: sesudah semua ditutup, jumlahnya
  // harus SAMA dengan sebelumnya.
  [
    'M4 daftar disaring hanya temuan terbuka (riwayat hilang)',
    POPUP,
    '            {temuan.map((t) => (',
    '            {terbuka.map((t) => (',
  ],

  // -- Sambungan: data dari papan benar-benar diteruskan ke daftar temuan.
  //
  // M5 menghapus satu dari tiga store bukti yang digabung popup. Kartu bersih
  // lalu terlihat punya temuan — dan pemeriksaan "Tidak ada temuan" GAGAL.
  [
    'M5 penggabungan bukti: store HPP tidak dibaca popup',
    POPUP,
    '            ...(buktiHpp[kartu.id] ?? {}),\n',
    '',
  ],
  [
    'M6 terima tidak diteruskan popup ke daftar temuan',
    POPUP,
    '          tertutup={temuanTertutup}\n          terima={terima}\n',
    '          tertutup={temuanTertutup}\n          terima={[]}\n',
  ],
  [
    'M7 barisHpp tidak diteruskan popup ke daftar temuan',
    POPUP,
    '          tertutup={temuanTertutup}\n          terima={terima}\n          barisHpp={barisHpp}\n',
    '          tertutup={temuanTertutup}\n          terima={terima}\n          barisHpp={[]}\n',
  ],
  [
    'M8 temuanTertutup tidak diteruskan popup ke daftar temuan',
    POPUP,
    '          tertutup={temuanTertutup}\n',
    '          tertutup={[]}\n',
  ],

  // -- Lima sumber temuan, satu per satu dimatikan / dibuat salah.
  [
    'M9 pemeriksaan ongkos jahit dimatikan',
    TEMUAN,
    '    if (hasil.tanpaOngkosJahit) {',
    '    if (false) {',
  ],
  [
    'M10 penjaga HPP di bawah biaya beli dimatikan',
    TEMUAN,
    '      if (hasil.hpp < hasil.biayaBeli) {',
    '      if (false) {',
  ],
  // M11: rumus Sisa kehilangan `masukStok`. Varian yang kekurangannya sudah
  // ditutup barang masuk stok (reject yang akhirnya diterima) jadi dituduh
  // kurang — dan pemeriksaan kontrolnya harus GAGAL.
  [
    'M11 rumus Sisa tidak mengikutkan Masuk Stok',
    TEMUAN,
    '    const sisa = t.plan - (t.sudahDatang + t.masukStok);',
    '    const sisa = t.plan - t.sudahDatang;',
  ],
  // M12: 0 disamakan dengan "sudah diisi" — pembeda 0 vs undefined yang
  // dikoreksi owner. Setiap angka upload jadi temuan, dan kontrol
  // "80 tidak jadi temuan" GAGAL.
  [
    'M12 jumlahUploadPos: semua angka dianggap temuan (0 vs terisi hilang)',
    TEMUAN,
    '  if (kartu.tahapAkhir?.jumlahUploadPos === 0) {',
    '  if (kartu.tahapAkhir?.jumlahUploadPos !== undefined) {',
  ],
  [
    'M13 loop bukti wajib dimatikan',
    TEMUAN,
    '      if ((bukti[j.id]?.length ?? 0) === 0) {',
    '      if (false) {',
  ],
  [
    'M14 temuan yang sudah ditutup tetap berstatus terbuka',
    TEMUAN,
    "    temuan.push({ ...t, status: ditutup.includes(t.id) ? 'tertutup' : 'terbuka' });",
    "    temuan.push({ ...t, status: 'terbuka' });",
  ],

  // -- Daftar bukti wajib per papan.
  //
  // M15 menukar cabang Production jadi Invoice Logistic: kartu Production
  // dituntut bukti stage yang tidak pernah dilaluinya, dan pemeriksaan
  // "tanpa invoice-logistic" GAGAL.
  [
    'M15 buktiWajib: papan Production menuntut Invoice Logistic',
    TEMUAN,
    "    daftar.push({ stage: 'cutting', jenis: JENIS_BUKTI_CUTTING });",
    "    daftar.push({ stage: 'invoice-logistic', jenis: JENIS_BUKTI_INVOICE_LOGISTIC });",
  ],
  // M16: satu tahap hilang dari daftar wajib. Bukti upload yang kosong jadi
  // tidak pernah jadi temuan — dan pemeriksaan daftar lengkap GAGAL.
  [
    'M16 buktiWajib: tahap upload hilang dari daftar',
    TEMUAN,
    "  daftar.push({ stage: 'upload', jenis: JENIS_BUKTI_UPLOAD });\n",
    '',
  ],

  // -- Label stage asal.
  [
    'M17 labelStageAsal mengembalikan id mentah',
    TEMUAN,
    '  return LABEL_STAGE[id] ?? id;',
    '  return id;',
  ],
];

// M18: urutan blok receive dan upload ditukar — yang harus DIUNGGAH tampil
// sebelum yang harus DIPUTUSKAN. Anchornya DISUSUN dari sumber, bukan diketik
// ulang: dua blok itu panjang dan memuat template literal, dan satu spasi yang
// meleset membuat anchornya tidak pernah ditemukan. Pemisahnya tiga komentar
// bernomor yang unik di temuan.ts.
const srcTemuan = asli.get(TEMUAN);
const iReceive = srcTemuan.indexOf('  // 3. Receive: Sisa > 0 per varian.');
const iUpload = srcTemuan.indexOf('  // 4. Upload: jumlahUploadPos = 0.');
const iBukti = srcTemuan.indexOf('  // 5. Bukti wajib yang kosong.');
if (iReceive < 0 || iUpload < 0 || iBukti < 0 || !(iReceive < iUpload && iUpload < iBukti)) {
  console.error('GAGAL: penanda blok di temuan.ts tidak ditemukan berurutan');
  process.exit(1);
}
const blokReceive = srcTemuan.slice(iReceive, iUpload);
const blokUpload = srcTemuan.slice(iUpload, iBukti);
MUTASI.push([
  'M18 urutan receive/upload ditukar',
  TEMUAN,
  blokReceive + blokUpload,
  blokUpload + blokReceive,
]);

let tertangkap = 0;
const lolos = [];

// Mode cepat: hanya memeriksa bahwa tiap anchor DITEMUKAN TEPAT SEKALI.
//
// `String.replace` dengan string akan mengganti kemunculan PERTAMA, jadi
// anchor yang cocok dua kali akan memutasi baris yang salah — dan mutasinya
// bisa tetap "tertangkap" karena kebetulan memutus hal lain. Itu sudah
// kejadian di repo ini. Jalankan `--check` setiap kali anchor diubah, sebelum
// menghabiskan waktu menjalankan suite belasan kali.
if (process.argv.includes('--check')) {
  let masalah = 0;
  for (const [label, file, cari] of MUTASI) {
    const isi = asli.get(file);
    const n = isi.split(cari).length - 1;
    if (n !== 1) {
      masalah++;
      console.log(`MASALAH ${label}\n        ditemukan ${n} kali di ${file.split('/').pop()} (harus 1)`);
    }
  }
  console.log('');
  console.log(
    masalah === 0
      ? `OK: ${MUTASI.length} anchor semuanya ditemukan tepat sekali.`
      : `GAGAL: ${masalah} anchor bermasalah dari ${MUTASI.length}.`
  );
  process.exit(masalah === 0 ? 0 : 1);
}

for (const [label, file, cari, ganti] of MUTASI) {
  const isi = asli.get(file);
  if (!isi.includes(cari)) {
    console.log(`LEWAT  ${label}\n       TARGET TIDAK DITEMUKAN di ${file.split('/').pop()}`);
    lolos.push(label + ' (target tidak ditemukan)');
    continue;
  }
  writeFileSync(file, isi.replace(cari, ganti));

  let gagal = '';
  try {
    const out = execFileSync('node', ['tests/smoke-kanban-fulfillment.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    void out;
  } catch (e) {
    // Non-zero exit berarti setidaknya satu GAGAL — itu yang dicari.
    gagal = (e.stdout || '') + (e.stderr || '');
  }

  // Yang dihitung BUKAN cuma "ada GAGAL". Mutasi yang membuat berkas modul
  // melempar error juga membuktikan pemeriksaan terkait bekerja — dan itulah
  // yang bisa lolos kalau harness hanya mencari kata "GAGAL".
  //
  // Syarat "hijau sejati" sengaja dibuat ketat: harus ada LULUS di output.
  // Suite yang mati tidak pernah mencetak kata itu.
  const adaGagal = /GAGAL/.test(gagal);
  const crash = /(TypeError|ReferenceError|SyntaxError|RangeError):/.test(gagal);
  const hijauSejati = /LULUS/.test(gagal) && !adaGagal && !crash;

  if (hijauSejati) {
    console.log(`LEWAT  ${label} — smoke test tetap hijau`);
    lolos.push(label);
  } else if (crash) {
    tertangkap++;
    const pesan = (gagal.match(/^\w*(?:Type|Reference|Syntax|Range)Error:.*$/m) || [
      '(tanpa pesan)',
    ])[0];
    console.log(`TANGKAP ${label}\n        suite MATI: ${pesan.slice(0, 160)}`);
  } else if (adaGagal) {
    tertangkap++;
    const ringkas = (gagal.match(/GAGAL .*/g) || []).slice(0, 3).join(' | ');
    console.log(`TANGKAP ${label}\n        ${ringkas.slice(0, 220)}`);
  } else {
    tertangkap++;
    console.log(
      `TANGKAP ${label}\n        suite berhenti tanpa LULUS/GAGAL — output ${gagal.length} karakter, TIDAK trustworthy`
    );
  }
  pulihkan();
}

console.log('');
console.log(`Tertangkap: ${tertangkap}/${MUTASI.length}`);
if (lolos.length) {
  console.log('LOLOS (check tidak efektif):');
  for (const l of lolos) console.log('  - ' + l);
  process.exit(1);
}
