/**
 * Uji mutasi untuk smoke-tab-warna.mjs.
 *
 * Tiap mutasi merusak SATU perilaku yang diklaim check-nya, menjalankan smoke
 * test, lalu memulihkan berkasnya. Mutasi yang TIDAK membuat test merah berarti
 * check-nya hijau tanpa menguji apa pun — dan itu harus diperbaiki, bukan
 * diabaikan.
 *
 * Berkas dicadangkan dulu (isi + SHA256), dan pemulihannya diverifikasi dengan
 * membandingkan hash. Kalau hash tidak kembali sama, skrip berhenti dan TIDAK
 * melanjutkan mutasi berikutnya — berkas yang tertinggal rusak jauh lebih mahal
 * daripada test yang tidak jalan.
 *
 * WAJIB BUILD ULANG tiap mutasi. Halaman diuji lewat http://localhost:3000, dan
 * server itu menyajikan `frontend/dist/` — build, bukan sumber. Tanpa
 * `npm run build` di antara mutasi dan test, yang diuji adalah bundle LAMA:
 * mutasinya tidak pernah terlihat, test tetap hijau, dan hasilnya terbaca
 * "check-nya tidak menguji apa pun" padahal justru harness-nya yang salah.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const HALAMAN = join(AKAR, 'frontend', 'src', 'pages', 'RegisterProduk.tsx');
const ISI_WARNA = join(AKAR, 'frontend', 'src', 'pages', 'register-produk', 'IsiWarna.tsx');
const FORM_WARNA = join(AKAR, 'frontend', 'src', 'pages', 'register-produk', 'FormWarnaBaru.tsx');
const POPUP_BUKTI = join(AKAR, 'frontend', 'src', 'pages', 'register-produk', 'PopupBuktiPasar.tsx');
const WARNA_LIB = join(AKAR, 'frontend', 'src', 'lib', 'warna.ts');
const SMOKE = join(AKAR, 'tests', 'smoke-tab-warna.mjs');

const hash = (s) => createHash('sha256').update(s).digest('hex');

// Cadangan tiap berkas yang boleh disentuh mutasi.
const cadangan = new Map();
for (const f of [HALAMAN, ISI_WARNA, FORM_WARNA, POPUP_BUKTI, WARNA_LIB]) {
  const isi = readFileSync(f, 'utf8');
  cadangan.set(f, { isi, hash: hash(isi) });
}

// CATATAN PENTING soal memilih mutasi di sini.
//
// 1. `npm run build` = `tsc -b && vite build`. Artinya mutasi yang membuat
//    TYPESCRIPT gagal tidak pernah sampai ke halaman: build-nya berhenti lebih
//    dulu, smoke test tidak pernah jalan, dan harness membaca itu sebagai
//    "merah". Hasilnya terlihat seperti check-nya bekerja padahal yang gagal
//    cuma kompilasi. Karena itu setiap mutasi di bawah harus tetap SAH secara
//    tipe — yang dirusak perilakunya, bukan bentuk kodenya.
//
// 2. `harusGagal` berisi LABEL KEGAGALAN, yaitu argumen PERTAMA `salah(...)` —
//    bukan teks `ok(...)`. Yang dicetak smoke test saat gagal adalah
//    "GAGAL <label> — <detail>", sedangkan teks `ok` cuma muncul kalau
//    check-nya LULUS. Menulis teks `ok` di sini membuat mutasi yang benar-benar
//    tertangkap dilaporkan "TERTANGKAP-SEBAGIAN", karena labelnya tidak pernah
//    ada di keluaran. Contoh: check-nya `salah('jumlah field popup', …)`,
//    bukan `salah('popup-nya cuma dua field', …)`.
const MUTASI = [
  {
    nama: 'baris tab dibuat rata tengah (justify-center)',
    berkas: HALAMAN,
    dari: '<TabsList variant="line" className="w-full justify-start">',
    ke: '<TabsList variant="line" className="w-full justify-center">',
    harusGagal: ['perataan tab'],
  },
  {
    nama: 'kotak cari dikembalikan ke LUAR panel (ikut terlihat di tab Colour)',
    berkas: HALAMAN,
    // Menaruh salinan kotak cari SEBELUM <Tabs> meniru keadaan aslinya:
    // kotak itu hidup di baris tab, di luar kedua panel, sehingga ikut
    // terlihat saat tab Colour dibuka. `querySelector` menemukan salinan
    // pertama ini, persis seperti dulu.
    dari: '      <Tabs\n        value={tab}',
    ke: '      <div><input aria-label="Cari produk" className="h-8 w-full" /></div>\n      <Tabs\n        value={tab}',
    harusGagal: ['cari di Colour'],
  },
  {
    nama: 'tab Colour dihapus dari daftar tab',
    berkas: HALAMAN,
    dari: "  { id: 'colour', label: 'Colour' },\n",
    ke: '',
    harusGagal: ['dua tab'],
  },

  // ===== Tab Colour: tabelnya harus tetap jadi reui Data Grid =====
  //
  // Mutasi ini yang menahan tabel warna supaya tidak diam-diam kembali jadi
  // tabel polos. Tanpa mereka, check "toolbar Master Data" bisa hijau hanya
  // karena kebetulan ada tombol bernama sama di tempat lain.
  {
    nama: 'sel kode warna tidak lagi memakai render khusus (kode tampil huruf kecil)',
    berkas: ISI_WARNA,
    dari: '        render: (w) => (\n          <span className="font-mono text-muted-foreground tabular-nums">\n            {w.kode}\n          </span>\n        ),',
    ke: '        render: (w) => <span>{w.kode.toLowerCase()}</span>,',
    harusGagal: ['isi baris'],
  },
  {
    nama: 'label kolom kedua diganti jadi "Kode"',
    berkas: ISI_WARNA,
    dari: "        label: 'Kode Warna',",
    ke: "        label: 'Kode',",
    harusGagal: ['kolom tabel'],
  },
  {
    nama: 'pencarian tidak lagi mencari nama warna (cuma kode)',
    berkas: ISI_WARNA,
    // `w.kode`, bukan `w.nama`. Bukan `get: () => ''` — dengan
    // `noUnusedParameters` menyala, parameter `w` yang tidak dipakai membuat
    // `tsc` gagal, dan yang merah jadi BUILD-nya, bukan check-nya (lihat
    // catatan di atas).
    dari: "      { label: 'Nama Warna', get: (w: WarnaMaster) => w.nama },",
    ke: "      { label: 'Nama Warna', get: (w: WarnaMaster) => w.kode },",
    // DUA label, karena satu mutasi ini merusak dua check sekaligus — dan
    // keduanya memang harus merah. Cari "hitam" tidak lagi cocok dengan nama
    // mana pun, jadi tabelnya kosong: hitungannya jatuh (penyaringan) DAN
    // barisnya bukan lagi yang diharapkan (isi hasil saring).
    //
    // Check hitungannya sempat LOLOS di sini, bukan karena labelnya salah,
    // melainkan karena check-nya sendiri tidak menguji apa pun: baris "Belum
    // ada warna…" yang dirender reui saat tabel kosong ikut terhitung, jadi
    // tabel kosong terbaca "1 baris < 4". Itu sudah diperbaiki di smoke
    // test-nya (lihat BARIS_ISI); labelnya ikut dicatat di sini supaya
    // regresinya tidak kembali diam-diam.
    harusGagal: ['penyaringan tabel warna', 'isi hasil saring'],
  },
  {
    nama: 'tombol "Tambah Warna" kehilangan teksnya',
    berkas: ISI_WARNA,
    // Cuma teksnya yang dihapus; `onTambahWarna` dan `Plus` tetap dipakai —
    // kalau tidak, `noUnusedParameters`/`noUnusedLocals` yang gagal lebih dulu.
    dari: '          <Plus className="h-4 w-4" />\n          Tambah Warna\n',
    ke: '          <Plus className="h-4 w-4" />\n',
    harusGagal: ['tombol tambah warna'],
  },

  // ===== Popup Tambah Warna =====
  {
    nama: 'field ketiga ditambahkan ke popup warna (bukan lagi cuma nama + kode)',
    berkas: FORM_WARNA,
    dari: '      {galat && (',
    ke: '      <div className="space-y-2"><Label htmlFor="warna-ket">Keterangan</Label><Input id="warna-ket" /></div>\n      {galat && (',
    // Field ketiga merusak DUA check: jumlahnya bukan lagi dua, dan id-nya
    // bukan lagi persis "warna-nama|warna-kode". Keduanya memang harus merah.
    harusGagal: ['jumlah field popup', 'field popup'],
  },
  {
    nama: 'kode warna tidak lagi dinaikkan jadi huruf besar saat diketik',
    berkas: FORM_WARNA,
    dari: 'setKode(normalisasiKode(e.target.value));',
    ke: 'setKode(e.target.value);',
    harusGagal: ['huruf besar saat diketik'],
  },
  {
    nama: 'kode kembar tidak lagi ditolak',
    berkas: FORM_WARNA,
    // `&& false` menjaga `w` DAN `kode` tetap terpakai (lihat catatan
    // noUnusedParameters di atas), tapi hasilnya selalu undefined — tidak ada
    // yang pernah dianggap bentrok.
    dari: '  const bentrok = terpakai.find((w) => w.kode === kode);',
    ke: '  const bentrok = terpakai.find((w) => w.kode === kode && false);',
    harusGagal: ['kode kembar', 'popup saat bentrok'],
  },
  {
    nama: 'warna baru tidak benar-benar masuk ke daftar (di-slice balik)',
    berkas: HALAMAN,
    // `data` dan `setWarnaBaru` dua-duanya tetap terpakai — kalau salah satu
    // hilang, yang merah `noUnusedParameters`/`noUnusedLocals` (BUILD), bukan
    // check-nya. `.slice(0, -1)` membuang elemen terakhir yang baru ditambah,
    // jadi panjangnya kembali seperti semula tanpa satu pun binding menganggur.
    //
    // Dulu mutasi ini berbentuk `if (data) return;` dan GAGAL-BUILD: mengganti
    // isinya jadi `return` membuat `setWarnaBaru` tak terpakai (TS6133), dan
    // harness membaca itu sebagai "merah" padahal testnya tidak pernah jalan.
    dari: '    setWarnaBaru((lama) => [...lama, data]);',
    ke: '    setWarnaBaru((lama) => [...lama, data].slice(0, -1));',
    // Tiga check ikut merah, dan memang harus: warnanya tidak ada di tabel,
    // namanya tidak ketemu, dan jumlahnya tidak bertambah.
    harusGagal: ['warna baru di tabel', 'nama warna baru', 'jumlah warna'],
  },
  {
    nama: 'popup "Tambah Warna" tidak menutup setelah Simpan',
    berkas: HALAMAN,
    dari: '    setWarnaBaru((lama) => [...lama, data]);\n    setFormWarnaTerbuka(false);',
    ke: '    setWarnaBaru((lama) => [...lama, data]);\n    setFormWarnaTerbuka(true);',
    harusGagal: ['popup setelah simpan'],
  },

  // ===== Kartu produk & popup bukti marketplace =====
  {
    nama: 'klik tombol bukti ikut merambat ke kartu (stopPropagation dihapus)',
    berkas: HALAMAN,
    // Handler-nya diganti utuh, bukan cuma baris `e.stopPropagation()` yang
    // dihapus: menyisakan `(e) =>` dengan `e` tak terpakai membuat `tsc` gagal
    // lebih dulu.
    dari: '        onClick={(e) => {\n          e.stopPropagation();\n          onBukti();\n        }}',
    ke: '        onClick={() => {\n          onBukti();\n        }}',
    harusGagal: ['perambatan klik'],
  },
  {
    nama: 'tombol bukti kehilangan labelnya (aria-label dihapus)',
    berkas: HALAMAN,
    dari: '        aria-label={`Lihat foto bukti ${NAMA_PASAR[status.platform]}`}\n',
    ke: '',
    harusGagal: ['tombol bukti'],
  },
  {
    nama: 'popup bukti tidak lagi menyatakan fotonya belum ada',
    berkas: POPUP_BUKTI,
    dari: '          <p className="text-sm text-muted-foreground">Belum ada foto bukti.</p>',
    ke: '          <p className="text-sm text-muted-foreground">Tidak ada.</p>',
    harusGagal: ['isi popup bukti'],
  },
  {
    nama: 'judul popup bukti tidak lagi menyebut platformnya',
    berkas: POPUP_BUKTI,
    dari: '          <DialogTitle>Bukti Pendaftaran — {NAMA_PASAR[status.platform]}</DialogTitle>',
    ke: '          <DialogTitle>Bukti Pendaftaran</DialogTitle>',
    harusGagal: ['platform di judul popup'],
  },
];

// Mutasi yang SENGAJA tidak ada di sini, dan alasannya.
//
// 1. "Pill Registered/Not registered dibedakan warnanya" dan "baris marketplace
//    lengkap tiga platform" — keduanya diuji oleh smoke-register-produk.mjs
//    (render server), bukan oleh smoke browser ini. Teksnya sama-sama muncul di
//    markup apa pun warnanya, dan ketiga barisnya ada tanpa perlu tab dibuka.
//    Menyalin mutasinya ke sini hanya menghasilkan "LOLOS-SALAH" yang
//    menyesatkan: harness ini memang bukan tempat check-nya.
//
// 2. "Cabang gambar di popup bukti" — tidak bisa dimutasi dengan aman.
//    Mengubah `status.fotoBukti ?` jadi `true ?` membuat TypeScript berhenti
//    menyempitkan tipe, sehingga `src={status.fotoBukti}` menerima
//    `string | null` dan `tsc` menolaknya. Yang merah jadi build-nya, bukan
//    check-nya. Cabang itu memang tidak bisa dijangkau dari data katalog
//    (`fotoBukti` selalu null sampai tabelnya diputuskan), jadi yang diuji di
//    sini adalah keadaan kosongnya — dan itu diuji oleh mutasi di atas.

// ===== Pemeriksaan awal: setiap `harusGagal` harus benar-benar ada =====
//
// Tanpa ini, label yang salah tulis baru ketahuan setelah seluruh mutasi
// berjalan — puluhan menit, karena tiap mutasi butuh build ulang. Pemeriksaan
// ini cuma membaca teks smoke test-nya dan menyelesaikan dalam milidetik.
//
// Yang diperiksa: setiap string di `harusGagal` muncul sebagai argumen PERTAMA
// `salah(...)` di smoke test. Justru itulah kesalahan yang pernah lolos ke
// sini: `harusGagal` diisi teks `ok(...)` (yang cuma dicetak saat check LULUS),
// sehingga mutasi yang benar-benar tertangkap dilaporkan "TERTANGKAP-SEBAGIAN"
// — merah, tapi dianggap bukan karena labelnya.
//
// Argumen pertama `salah` diambil lewat regex yang mentoleransi tanda kutip
// tunggal maupun ganda, karena dua bentuk itu dipakai bergantian di berkasnya.
const teksSmoke = readFileSync(SMOKE, 'utf8');
const labelSalah = new Set(
  Array.from(teksSmoke.matchAll(/salah\(\s*['"]([^'"]+)['"]/g)).map((m) => m[1])
);

const labelHilang = [];
for (const m of MUTASI) {
  for (const t of m.harusGagal) {
    if (!labelSalah.has(t)) labelHilang.push(`${m.nama} → "${t}"`);
  }
}

if (labelHilang.length > 0) {
  console.log('PEMERIKSAAN AWAL GAGAL — label ini tidak ada sebagai `salah(...)` di smoke test:');
  for (const l of labelHilang) console.log(`  - ${l}`);
  console.log('');
  console.log('Artinya: mutasi ini tidak akan pernah bisa terbaca "tertangkap",');
  console.log('karena keluaran yang dicocokkan bukan yang dicetak saat check gagal.');
  process.exit(1);
}
console.log(`Pemeriksaan awal: ${MUTASI.length} mutasi, semua label ada di smoke test.`);

let masalah = 0;

// ===== Pemulihan yang tahan proses di-kill =====
//
// Ini bukan kehati-hatian teoretis. Harness ini pernah mati di tengah jalan
// (di-kill dari luar saat build), dan karena pemulihannya waktu itu cuma ada
// di akhir blok — bukan di `finally` — berkas sumbernya TERTINGGAL dalam
// keadaan termutasi. Gejalanya diam dan menakutkan: `label: 'Kode Warna'` di
// sumber berubah jadi `label: 'Kode'`, dan satu-satunya cara menyadarinya
// adalah membandingkan dengan cadangan.
//
// Dua lapis sekarang:
//   1. `try/finally` di dalam loop — menahan throw dan `process.exit`.
//   2. Handler sinyal — menahan SIGINT/SIGTERM/SIGHUP (Ctrl+C, kill dari luar).
//
// `sedang` mencatat berkas yang SEDANG termutasi; pemulihan selalu menulis
// kembali ISI ASLI dari cadangan (bukan sekadar "kembalikan yang tadi"), jadi
// pemulihan ganda pun aman.
let sedang = null;

function pulihkan() {
  if (!sedang) return;
  const { berkas, asli } = sedang;
  try {
    writeFileSync(berkas, asli, 'utf8');
  } catch {
    /* sebaik yang bisa dilakukan saat proses sedang mati */
  }
  sedang = null;
}

for (const sinyal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sinyal, () => {
    if (sedang) {
      console.log(`\n  DIBATALKAN — memulihkan ${sedang.berkas} dulu…`);
      pulihkan();
    }
    process.exit(130);
  });
}

process.on('exit', pulihkan);

for (const m of MUTASI) {
  const cad = cadangan.get(m.berkas);
  const asli = cad.isi;

  if (!asli.includes(m.dari)) {
    console.log(`  LEWAT  ${m.nama} — pola tidak ketemu di sumber`);
    masalah++;
    continue;
  }

  sedang = { berkas: m.berkas, asli };

  let keluaran = '';
  let merah = false;
  let buildGagal = false;
  let pesanBuild = '';
  let pulih = false;

  try {
    writeFileSync(m.berkas, asli.split(m.dari).join(m.ke), 'utf8');

    // Build dan smoke dijalankan TERPISAH, bukan dalam satu try.
    //
    // `npm run build` = `tsc -b && vite build`. Kalau keduanya digabung,
    // mutasi yang ditolak TypeScript menghasilkan error yang sama bentuknya
    // dengan check yang gagal — dan harness akan melaporkannya "TERTANGKAP",
    // padahal test-nya tidak pernah jalan. Dipisah begini, kegagalan build
    // punya laporannya sendiri.
    try {
      execFileSync('npm.cmd', ['run', 'build'], {
        cwd: join(AKAR, 'frontend'),
        stdio: 'pipe',
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
    } catch (e) {
      buildGagal = true;
      pesanBuild = String(e.stdout || '') + String(e.stderr || '');
    }

    if (!buildGagal) {
      try {
        execFileSync(process.execPath, [SMOKE], {
          cwd: join(AKAR, 'frontend'),
          stdio: 'pipe',
          encoding: 'utf8',
        });
      } catch (e) {
        merah = true;
        keluaran = String(e.stdout || '') + String(e.stderr || '');
      }
    }
  } finally {
    // Pemulihan + verifikasi hash SEBELUM apa pun yang lain — dan di
    // `finally`, supaya throw/exit di tengah pun tetap memulihkan.
    writeFileSync(m.berkas, asli, 'utf8');
    sedang = null;
    pulih = hash(readFileSync(m.berkas, 'utf8')) === cad.hash;
  }

  if (!pulih) {
    console.log(`  BAHAYA ${m.nama} — berkas TIDAK pulih sama; berhenti.`);
    process.exit(1);
  }

  if (buildGagal) {
    const baris = pesanBuild.split('\n').find((l) => l.includes('error TS')) ?? '(tanpa error TS)';
    console.log(`  GAGAL-BUILD  ${m.nama} — ditolak TypeScript, check-nya tidak pernah diuji`);
    console.log(`               ${baris.trim()}`);
    masalah++;
    continue;
  }

  if (!merah) {
    console.log(`  LOLOS-SALAH  ${m.nama} — test tetap hijau, check-nya tidak menguji apa pun`);
    masalah++;
    continue;
  }

  // Label dicocokkan BERSAMA pembungkusnya ("GAGAL <label> "), bukan sebagai
  // substring lepas. `salah(p, d)` selalu mencetak bentuk itu, jadi
  // mengandalkannya membuat pencocokan tidak ambigu: tanpa ini label pendek
  // ikut cocok dengan label lain yang memuatnya — mis. `tabel warna` cocok
  // dengan `penyaringan tabel warna`, dan mutasi yang gagal di check yang
  // salah terbaca "tertangkap".
  //
  // Spasi di ujung, bukan tanda pisahnya: karakter tanda pisah di keluaran
  // (em-dash) gampang berubah kalau berkasnya pernah ditulis ulang dengan
  // encoding lain, dan itu bukan hal yang sedang diuji di sini.
  const tertangkap = m.harusGagal.filter((t) => keluaran.includes(`GAGAL ${t} `));
  if (tertangkap.length === m.harusGagal.length) {
    console.log(`  TERTANGKAP   ${m.nama}`);
  } else {
    const hilang = m.harusGagal.filter((t) => !tertangkap.includes(t));
    console.log(
      `  TERTANGKAP-SEBAGIAN  ${m.nama} — merah, tapi bukan karena: ${hilang.join(', ')}`
    );
    masalah++;
  }
}

console.log('');
if (masalah === 0) {
  console.log(`LULUS — ${MUTASI.length} mutasi tertangkap, berkas pulih utuh.`);
  process.exit(0);
} else {
  console.log(`GAGAL — ${masalah} masalah pada harness/check.`);
  process.exit(1);
}
