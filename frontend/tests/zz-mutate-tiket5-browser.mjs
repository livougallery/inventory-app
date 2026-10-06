// Runner mutasi untuk verifikasi BROWSER tiket 5.
//
// Kenapa runner terpisah dari zz-mutate-ticket5.mjs: yang itu menguji smoke
// test SSR (render ke string). Skrip browser menguji hal yang TIDAK PERNAH
// tersentuh SSR — klik kartu, dialog Base UI, Select portal, unggah berkas,
// perpindahan kolom papan, dan kunci setelah kartu pindah. Kalau check browser
// tidak pernah diuji mutasinya, ia bisa hijau-hijau saja (mis. selector yang
// tidak menemukan apa-apa lalu `false` dianggap lulus).
//
// Cara kerja: tiap mutasi mengubah satu baris di sumber, membangun presentasi
// ke berkas SEMENTARA (BUKAN Inventory-APP-Presentasi.html milik owner),
// menjalankan skrip browser terhadap berkas itu, lalu memulihkan sumber.
// Screenshot otomatis dilewati saat PRESENTASI_FILE diisi (lihat skripnya).
//
// Jalankan dari frontend/:  node tests/zz-mutate-tiket5-browser.mjs [--check]
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const FRONTEND = 'C:/Users/livou/inventory-app/frontend';
const POPUP = FRONTEND + '/src/pages/production-fulfillment/PopupKartu.tsx';
const DATA = FRONTEND + '/src/pages/production-fulfillment/data-kanban.ts';
const PAPAN = FRONTEND + '/src/pages/production-fulfillment/PapanFulfillment.tsx';
const TMP_HTML = FRONTEND + '/dist-presentasi/verifikasi-mutasi.html';

const asli = new Map();
for (const f of [POPUP, DATA, PAPAN]) asli.set(f, readFileSync(f, 'utf8'));

const pulihkan = () => {
  for (const [f, isi] of asli) writeFileSync(f, isi);
};
process.on('exit', pulihkan);

// [label, file, find, replace]
const MUTASI = [
  // -- Routing: yang diuji browser adalah "popup yang BENAR terbuka".
  [
    'B1 invoice-logistic jatuh ke SeksiBelumAda',
    POPUP,
    "const bisaInvoiceLogistic = stageId === 'invoice-logistic';",
    'const bisaInvoiceLogistic = false;',
  ],
  [
    'B2 invoice-product jatuh ke SeksiBelumAda',
    POPUP,
    "const bisaInvoiceProduct = stageId === 'invoice-product';",
    'const bisaInvoiceProduct = false;',
  ],
  [
    'B3 upload jatuh ke SeksiBelumAda',
    POPUP,
    "const bisaUpload = stageId === 'upload';",
    'const bisaUpload = false;',
  ],
  // -- Dua jalur: hanya boleh SATU kotak bukti tampil per jalur.
  [
    'B4 kedua jalur dirender sekaligus',
    DATA,
    'return jalur ? [...JENIS_BUKTI_INVOICE_PRODUCT, jalur] : JENIS_BUKTI_INVOICE_PRODUCT;',
    'return [...JENIS_BUKTI_INVOICE_PRODUCT, ...JENIS_BUKTI_FLOW];',
  ],
  // Catatan: "id dua jalur DITUKAR" tidak ada di daftar ini, dan itu disengaja.
  // Menukar kedua id sekaligus adalah bijeksi: render dan simpan sama-sama
  // lewat pemetaan yang tertukar itu, jadi layarnya identik dan tidak ada check
  // DOM yang bisa melihatnya — percobaan pertama memang hijau-hijau saja untuk
  // mutasi itu. Penukaran murni diuji di runner SSR (M6), tempat id-nya
  // di-assert langsung. Yang browser BISA lihat adalah TABRAKAN id — dua jalur
  // memakai id yang sama — karena berkas yang diunggah di satu jalur lalu ikut
  // tampil di kotak jalur lain. Itu B5 di bawah.
  [
    'B5 kedua jalur memakai id yang sama — berkas bocor antar jalur',
    DATA,
    "    value: 'reimbursement',\n    id: 'proofReimburse',",
    "    value: 'reimbursement',\n    id: 'proofPaymentProduct',",
  ],
  // -- Upload: angka, bukan berkas; 0 bukan kosong.
  [
    'B6 jumlah upload jadi kotak berkas',
    POPUP,
    '              type="number"\n              min={0}',
    '              type="file"\n              min={0}',
  ],
  [
    'B7 0 dianggap belum diisi',
    POPUP,
    'const terisi = jumlah !== undefined;',
    'const terisi = jumlah !== undefined && jumlah > 0;',
  ],
  // -- Terkunci total.
  //
  // Tiga mutasi lama di blok ini DIBUANG karena tidak bisa diamati dari browser:
  // begitu kartu pindah stage, seksinya berhenti dirender — tidak ada keadaan
  // di mana seksi Invoice Logistic tampil sambil kartunya sudah lewat. Dua di
  // antaranya diuji runner SSR: "kunci dimatikan di pemanggil" = M12, "tombol
  // Lanjut dibiarkan saat terkunci" = M14 (di sana `IsiPopup` dirender LANGSUNG
  // dengan `sudahLewat` terisi, dan penjaga kedua itu memang punya seam-nya di
  // situ).
  //
  // Yang ketiga — perpindahan tidak DICATAT di `sudahLewat` — tidak diuji di
  // mana pun, dan memang tidak bisa dari papan: selama kartunya masih di
  // stage-nya, daftar itu kosong (terkunci=false, sama seperti tanpa mutasi);
  // begitu pindah, seksinya hilang. Pencatatan itu penjaga untuk layar per-tahap
  // yang belum ada (lihat catatan `sudahLewat` di PopupKartu.tsx). Menulis
  // mutasinya di sini hanya akan hijau-hijau saja; tempatnya nanti di runner
  // layar itu.
  //
  // Yang browser BISA buktikan adalah akibat ujungnya: kartu benar-benar
  // pindah, dan sesudahnya isi stage lama tidak bisa disunting lagi. Kalau
  // perpindahannya sendiri dimatikan, kelompok pemeriksaan itu GAGAL.
  [
    'B8 lanjutStage tidak memindahkan kartu — seksi lama masih bisa disunting',
    PAPAN,
    "        });\n      }\n      if (tujuan) setPindah((lama) => ({ ...lama, [k.id]: tujuan.id }));",
    '        });\n      }',
  ],
  // -- Gerbang: kartu kosong boleh lanjut.
  [
    'B9 gerbang invoice-logistic selalu terbuka',
    POPUP,
    '  const bolehLanjut = kurang.length === 0;\n\n  return (\n    <section className="space-y-3">\n      <JudulSeksi\n        judul="Invoice Logistic"',
    '  const bolehLanjut = true;\n\n  return (\n    <section className="space-y-3">\n      <JudulSeksi\n        judul="Invoice Logistic"',
  ],
  // -- Papan: invoice-logistic bocor ke papan Production.
  [
    'B10 invoice-logistic ditambah ke papan Production',
    DATA,
    "  { id: 'cutting', label: 'Cutting', warna: 'bg-violet-500' },\n  { id: 'receive', label: 'Receive', warna: 'bg-blue-500' },",
    "  { id: 'cutting', label: 'Cutting', warna: 'bg-violet-500' },\n  { id: 'invoice-logistic', label: 'Invoice Logistic', warna: 'bg-cyan-500' },\n  { id: 'receive', label: 'Receive', warna: 'bg-blue-500' },",
  ],
  // -- Label tujuan: tombol memakai kalimat cadangan.
  [
    'B11 label tujuan invoice-logistic jadi kalimat cadangan',
    POPUP,
    '            Lanjut ke {tujuan?.label ?? \'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
    '            Lanjut ke {\'stage berikutnya\'}\n          </Button>\n        )}\n      </div>\n    </section>\n  );\n}\n\nfunction SeksiInvoiceProduct({',
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
  const out = execFileSync('node', ['tests/verifikasi-tiket5-browser.mjs'], {
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
    const out = execFileSync('node', ['tests/verifikasi-tiket5-browser.mjs'], {
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
