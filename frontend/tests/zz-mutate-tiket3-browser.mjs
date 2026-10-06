// Runner mutasi untuk verifikasi BROWSER tiket 3 (Finance Validate).
//
// Kenapa runner terpisah dari zz-mutate-ticket3.mjs: yang itu menguji smoke
// test SSR (render ke string). Skrip browser menguji hal yang TIDAK PERNAH
// tersentuh SSR — klik kartu, dialog Base UI, klik "Tutup temuan" yang
// mengubah state PAPAN, popup dibuka lagi, dan papan White Label. Dan itu
// bukan teori: verifikasi browser tiket ini SUDAH menangkap satu bug nyata
// yang tidak mungkin dilihat SSR — `PopupKartu` tidak meneruskan `sumber` ke
// `IsiPopup`, sehingga setiap popup White Label diam-diam memakai aturan
// temuan Production. Karena itu check browser di sini wajib dibuktikan
// mutasinya: kalau tidak, ia bisa hijau-hijau saja.
//
// Cara kerja: tiap mutasi mengubah satu baris di sumber, membangun presentasi
// ke berkas SEMENTARA (BUKAN Inventory-APP-Presentasi.html milik owner),
// menjalankan skrip browser terhadap berkas itu, lalu memulihkan sumber.
// Screenshot otomatis dilewati saat PRESENTASI_FILE diisi (lihat skripnya).
//
// Jalankan dari frontend/:  node tests/zz-mutate-tiket3-browser.mjs [--check]
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const FRONTEND = 'C:/Users/livou/inventory-app/frontend';
const POPUP = FRONTEND + '/src/pages/production-fulfillment/PopupKartu.tsx';
const PAPAN = FRONTEND + '/src/pages/production-fulfillment/PapanFulfillment.tsx';
const TMP_HTML = FRONTEND + '/dist-presentasi/verifikasi-mutasi-t3.html';

const asli = new Map();
for (const f of [POPUP, PAPAN]) asli.set(f, readFileSync(f, 'utf8'));

const pulihkan = () => {
  for (const [f, isi] of asli) writeFileSync(f, isi);
};
process.on('exit', pulihkan);

// [label, file, find, replace]
const MUTASI = [
  // -- Routing: yang diuji browser adalah "popup yang BENAR terbuka".
  [
    'B1 finance-validate jatuh ke SeksiBelumAda',
    POPUP,
    "const bisaFinanceValidate = stageId === 'finance-validate';",
    'const bisaFinanceValidate = false;',
  ],
  // -- Gerbang: kartu bertemuan boleh lanjut.
  [
    'B2 gerbang finance-validate selalu terbuka',
    POPUP,
    'const bolehLanjut = terbuka.length === 0;',
    'const bolehLanjut = true;',
  ],
  // -- Riwayat: temuan tertutup tetap tampil. Ini yang dilarang keputusan
  // pemilik ("tampil dengan status, bukan hilang") — dan browser satu-satunya
  // tempat menguji daftarnya benar-benar dirender ulang setelah diklik.
  [
    'B3 daftar disaring hanya temuan terbuka (riwayat hilang)',
    POPUP,
    '            {temuan.map((t) => (',
    '            {terbuka.map((t) => (',
  ],
  // -- Klik "Tutup temuan" benar-benar MENCATAT id-nya di state papan.
  //    Mutasi ini membuat kliknya tidak mencatat apa pun — dan seluruh
  //    kelompok pemeriksaan tutup-temuan harus GAGAL.
  [
    'B4 tutupTemuan tidak mencatat id',
    PAPAN,
    '        return punya.includes(id) ? lama : { ...lama, [k.id]: [...punya, id] };',
    '        return lama;',
  ],
  // -- Keputusan tutup DIBACA lagi oleh popup. B4 memutus pencatatan; B5
  //    memutus pembacaan — dua sisi yang berbeda dari sambungan yang sama.
  [
    'B5 temuanTertutup tidak diteruskan papan ke popup',
    PAPAN,
    '        temuanTertutup={temuanTertutup}',
    '        temuanTertutup={{}}',
  ],
  // -- `sumber` diteruskan pembungkus Dialog ke IsiPopup. Ini BUG NYATA yang
  //    pernah ada (dan ketahuan dari verifikasi browser tiket ini): tanpa
  //    baris ini, `IsiPopup` diam-diam memakai default 'production' dan kartu
  //    White Label dituntut bukti Cutting + ongkos jahit. Dua pemeriksaan WL
  //    di skrip browser harus GAGAL kalau baris ini hilang lagi.
  [
    'B6 sumber tidak diteruskan pembungkus popup (revert bug WL)',
    POPUP,
    '          sumber={sumber}\n          renderHpp={renderHpp}',
    '          renderHpp={renderHpp}',
  ],
  // -- Label tombol gerbang. Finance Validate kolom terakhir, jadi tombolnya
  //    berbunyi "Selesaikan validasi" — kalau labelnya berubah, pembaca
  //    tombolnya tidak menemukan apa pun dan pemeriksaan gerbang GAGAL.
  [
    'B7 label tombol gerbang jadi kalimat cadangan',
    POPUP,
    "{tujuan ? `Lanjut ke ${tujuan.label}` : 'Selesaikan validasi'}",
    "{tujuan ? `Lanjut ke ${tujuan.label}` : 'Lanjut ke stage berikutnya'}",
  ],
  // -- "Sekali jalan": Finance Validate kolom TERAKHIR, jadi `stageSetelah`
  //    mengembalikan undefined dan menekan tombolnya tidak memindahkan kartu
  //    ke mana-mana. Mutasi ini membuat tombolnya MUNDUR ke kolom pertama —
  //    persis yang dilarang keputusan pemilik — dan pemeriksaan "kartu tetap
  //    di kolom Finance Validate" harus GAGAL. Sebelum mutasi ini ada, satu-
  //    satunya check yang menguji keputusan utama tiket ini tidak pernah
  //    dibuktikan bisa menggigit.
  [
    'B8 tombol selesai memundurkan kartu (melanggar sekali jalan)',
    PAPAN,
    '      if (tujuan) setPindah((lama) => ({ ...lama, [k.id]: tujuan.id }));\n      setTerbukaId(null);\n    },\n    kembalikanCutting:',
    "      setPindah((lama) => ({ ...lama, [k.id]: 'propose' }));\n      setTerbukaId(null);\n    },\n    kembalikanCutting:",
  ],
];

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

function pathToFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/');
}

async function bangunDanTulis() {
  // Vite + stub dijalankan langsung (bukan lewat `npm run build:presentasi-file`)
  // supaya hasilnya bisa diarahkan ke berkas SEMENTARA. build-presentasi.mjs
  // menulis ke path tetap milik owner, jadi TIDAK dipakai di sini.
  execFileSync('npx', ['vite', 'build', '--config', 'vite.presentasi.config.ts'], {
    cwd: FRONTEND, stdio: 'ignore', shell: true,
  });
  const built = readFileSync(FRONTEND + '/dist-presentasi/presentasi.html', 'utf8');
  const headClose = built.indexOf('</head>');
  if (headClose < 0) throw new Error('</head> tidak ada di build');
  const { FETCH_STUB } = await import(pathToFileUrl(FRONTEND + '/stub-presentasi.mjs'));
  writeFileSync(TMP_HTML, built.slice(0, headClose) + FETCH_STUB + built.slice(headClose), 'utf8');
}

let tertangkap = 0;
const lolos = [];
const tidakSah = [];

// Baseline WAJIB: build tanpa mutasi lewat jalur sementara (TMP_HTML +
// PRESENTASI_FILE) harus hijau. Tanpa langkah ini, kegagalan lingkungan —
// vite gagal jalan, stub tidak terpasang, Chrome tidak ketemu — akan terlihat
// persis seperti "mutasi tertangkap", dan seluruh laporan jadi palsu.
console.log('== baseline (tanpa mutasi) ==');
try {
  await bangunDanTulis();
  const out = execFileSync('node', ['tests/verifikasi-tiket3-browser.mjs'], {
    cwd: FRONTEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PRESENTASI_FILE: TMP_HTML.replace(/\//g, '\\') },
    timeout: 240000,
  });
  if (!/lulus \d+, gagal 0/.test(out)) {
    console.log('BASELINE TIDAK HIJAU — harness tidak trustworthy, berhenti.');
    console.log(out.split('\n').slice(-12).join('\n'));
    process.exit(1);
  }
  const n = (out.match(/lulus (\d+), gagal 0/) || [])[1];
  console.log(`OK: baseline hijau (${n} check lulus lewat jalur sementara).\n`);
} catch (e) {
  console.log('BASELINE GAGAL — harness tidak trustworthy, berhenti.');
  console.log(String((e.stdout || '') + (e.stderr || e.message)).slice(-800));
  process.exit(1);
}

// `--hanya B1` untuk menjalankan satu mutasi saja. Dipakai saat pertama kali
// menyetel harness: kalau seluruh mutasi dijalankan sementara harness-nya
// sendiri rusak, semuanya bisa "tertangkap" secara palsu dan tidak ada yang
// ketahuan.
// Pencocokannya `label.startsWith(hanya + ' ')` — dengan spasi, supaya `B1`
// tidak ikut menjalankan B10-B11.
const hanyaIdx = process.argv.indexOf('--hanya');
const hanya = hanyaIdx >= 0 ? process.argv[hanyaIdx + 1] : null;
const daftarJalan = hanya ? MUTASI.filter(([label]) => label.startsWith(hanya + ' ')) : MUTASI;
if (hanya && daftarJalan.length === 0) {
  console.log('Tidak ada mutasi yang cocok dengan ' + hanya);
  process.exit(1);
}

for (const [label, file, cari, ganti] of daftarJalan) {
  const isi = asli.get(file);
  if (!isi.includes(cari)) {
    console.log(`LEWAT  ${label}\n       TARGET TIDAK DITEMUKAN di ${file.split('/').pop()}`);
    lolos.push(label + ' (target tidak ditemukan)');
    continue;
  }
  writeFileSync(file, isi.replace(cari, ganti));

  let hasil = '';
  let keluar = 0;
  let gagalBangun = '';
  try {
    await bangunDanTulis();
  } catch (e) {
    gagalBangun = String(e.message || e).slice(0, 200);
  }

  if (gagalBangun) {
    // Build gagal = mutasinya memang memutus sesuatu yang dipakai compiler.
    // Itu tetap "tertangkap" — tapi hanya kalau pesannya jelas build, bukan
    // kegagalan lingkungan.
    tertangkap++;
    console.log(`TANGKAP ${label}\n        build gagal: ${gagalBangun.slice(0, 160)}`);
    pulihkan();
    continue;
  }

  try {
    const out = execFileSync('node', ['tests/verifikasi-tiket3-browser.mjs'], {
      cwd: FRONTEND,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PRESENTASI_FILE: TMP_HTML.replace(/\//g, '\\') },
      timeout: 240000,
    });
    hasil = out;
  } catch (e) {
    hasil = (e.stdout || '') + (e.stderr || '');
    // `status` non-null = skrip selesai dengan exit code itu. `signal` terisi
    // (SIGTERM) = timeout — outputnya parsial dan TIDAK boleh dipercaya.
    keluar = typeof e.status === 'number' ? e.status : -1;
  }

  const adaGagal = /GAGAL/.test(hasil);
  const crash = /(TypeError|ReferenceError|SyntaxError|RangeError):/.test(hasil);
  // Watchdog = skrip browser menggantung lalu memaksa keluar. Run yang
  // menggantung itu TIDAK SAH sebagai bukti — sebagian check tidak pernah
  // jalan. Kalau ini dihitung "tertangkap", kegagalan harness menyamar jadi
  // hasil uji. Diperiksa SEBELUM adaGagal: hang setelah beberapa GAGAL tetap
  // bukan bukti yang bisa dipercaya.
  const watchdog = /watchdog/.test(hasil);
  // "Hijau sejati" menuntut TIGA hal sekaligus: exit code 0 (proses benar-benar
  // selesai, bukan di-timeout), ringkasan `gagal 0` ada, dan tidak ada baris
  // GAGAL. Output parsial dari proses yang dibunuh bisa memuat `gagal 0` dari
  // jalan sebelumnya — exit code yang membedakannya.
  const hijauSejati = keluar === 0 && !adaGagal && !crash && /lulus \d+, gagal 0/.test(hasil);

  if (watchdog) {
    tidakSah.push(label);
    console.log(`TIDAK SAH  ${label} — skrip browser menggantung (watchdog), hasil tidak bisa dipercaya`);
  } else if (hijauSejati) {
    console.log(`LEWAT  ${label} — verifikasi browser tetap hijau`);
    lolos.push(label);
  } else if (adaGagal) {
    tertangkap++;
    const ringkas = (hasil.match(/GAGAL .*/g) || []).slice(0, 3).join(' | ');
    console.log(`TANGKAP ${label}\n        ${ringkas.slice(0, 220)}`);
  } else if (crash) {
    tertangkap++;
    const pesan = (hasil.match(/^\w*(?:Type|Reference|Syntax|Range)Error:.*$/m) || ['(tanpa pesan)'])[0];
    console.log(`TANGKAP ${label}\n        crash: ${pesan.slice(0, 160)}`);
  } else {
    tertangkap++;
    console.log(`TANGKAP ${label}\n        skrip berhenti tanpa ringkasan (exit ${keluar}) — output ${hasil.length} karakter, TIDAK trustworthy`);
  }
  pulihkan();
}

// Bersihkan berkas sementara; dist-presentasi akan ditimpa build berikutnya.
if (existsSync(TMP_HTML)) rmSync(TMP_HTML, { force: true });

console.log('');
console.log(`Tertangkap: ${tertangkap}/${daftarJalan.length}`);
if (lolos.length || tidakSah.length) {
  if (lolos.length) {
    console.log('LOLOS (check browser tidak efektif):');
    for (const l of lolos) console.log('  - ' + l);
  }
  if (tidakSah.length) {
    console.log('TIDAK SAH (harness menggantung — perbaiki dulu, jangan baca sebagai tertangkap):');
    for (const l of tidakSah) console.log('  - ' + l);
  }
  process.exit(1);
}
