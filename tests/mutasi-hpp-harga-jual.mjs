/**
 * Mutation test untuk pemeriksaan smoke "HPP & Harga Jual".
 *
 * Tiap mutasi merusak SATU hal yang seharusnya dijaga smoke test, lalu test
 * dijalankan. Mutasi yang tidak membuat test gagal berarti pemeriksaannya
 * kosong — lulus tanpa memeriksa apa pun.
 *
 * Kenapa ini ada, dan kenapa permanen: kelas kesalahan ini sudah dua kali
 * menimpa halaman-halaman di repo ini — check pertama kali hijau karena
 * memeriksa hal yang salah, bukan karena kodenya benar. Tiket halaman ini
 * mewajibkan tiga mutasi; daftar di bawah lebih panjang karena SETIAP check
 * punya mutasi yang membuktikannya, bukan cuma tiga yang diwajibkan.
 *
 * Bukan test (jest tidak memungutnya: namanya bukan `*.test.js`), jadi ia
 * TIDAK dihapus setelah dipakai — ia alat yang dijalankan ulang tiap kali
 * halaman atau datanya berubah.
 *
 * Jalankan: `node tests/mutasi-hpp-harga-jual.mjs` (dari root repo).
 *
 * Lanjutkan run yang terhenti: `node tests/mutasi-hpp-harga-jual.mjs --dari=20`
 * (mulai dari mutasi ke-20). Pre-check tetap memeriksa SELURUH daftar.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');

const HALAMAN = path.join(frontend, 'src/pages/HppHargaJual.tsx');
const SHELL = path.join(frontend, 'src/components/Shell.tsx');
const APP = path.join(frontend, 'src/App.tsx');

const MUTASI = [
  // ===== Baris & angkanya =====

  {
    nama: 'HPP White Label yang tertahan diubah null → 0 (keputusan pemilik)',
    berkas: HALAMAN,
    dari: "      sumber: 'White Label',\n      pcs: totalPcs(kartu),\n      hpp: g.hpp,",
    ke: "      sumber: 'White Label',\n      pcs: totalPcs(kartu),\n      hpp: g.hpp ?? 0,",
    // 0 terbaca "produk ini gratis" — justru itu `null` dipertahankan. Empat
    // check harus menangkapnya: konsistensi status, larangan angka nol (data),
    // perbandingan dengan mesin asli, dan dua lewat markup tabel tertahan
    // (sel "—" hilang, "Rp 0" muncul).
    //
    // CATATAN soal tiket: tiket meminta check "7 baris Tertahan" ikut gagal di
    // sini, dan itu TIDAK MUNGKIN — status turun dari `bolehLanjut`, bukan dari
    // `hpp`, jadi hpp:0 tidak mengubah jumlah Tertahan (7 tetap 7). Yang gagal
    // adalah pemeriksaan angkanya. Deviasi ini disengaja.
    harusGagal: [
      'konsistensi status/angka',
      'hpp/harga jual 0',
      'angka vs mesin',
      'Rp 0 di tabel tertahan',
      'baris tertahan menampilkan',
    ],
  },
  {
    nama: 'rumus White Label ditukar memakai gerbang Production',
    berkas: HALAMAN,
    dari: "    const g = gerbangHpp(kartu, 'whitelabel', undefined, shipment ?? undefined);",
    ke: "    const g = gerbangHpp(kartu, 'production', kartu.detail.ongkosJahit);",
    // Kartu WL tidak punya ongkos jahit → semuanya tertahan dengan alasan
    // Production. Luna Pants kehilangan angkanya, dan jumlah Terhitung turun.
    harusGagal: ['jumlah Terhitung', 'angka vs mesin', 'Luna Pants', 'alasan tertahan'],
  },
  {
    nama: 'label sumber White Label ditukar jadi "Production"',
    berkas: HALAMAN,
    dari: "      sumber: 'White Label',",
    ke: "      sumber: 'Production',",
    harusGagal: ['urutan White Label', 'label sumber', 'Luna Pants sumber/status'],
  },
  {
    nama: 'urutan baris dibalik — White Label dulu',
    berkas: HALAMAN,
    dari: '  return [...produksi, ...whiteLabel];',
    ke: '  return [...whiteLabel, ...produksi];',
    harusGagal: ['urutan Production', 'urutan White Label'],
  },
  {
    nama: 'daftar kartu White Label dipotong satu',
    berkas: HALAMAN,
    dari: '  const whiteLabel: BarisHarga[] = KARTU_WHITELABEL.map((kartu) => {',
    ke: '  const whiteLabel: BarisHarga[] = KARTU_WHITELABEL.slice(0, 7).map((kartu) => {',
    harusGagal: ['jumlah baris', 'urutan White Label', 'jumlah Tertahan'],
  },
  {
    nama: 'kunci baris Production diseragamkan (id tidak unik)',
    berkas: HALAMAN,
    dari: "      id: kartu.id,\n      produk: kartu.productName,\n      workcode: kartu.workcode,\n      sumber: 'Production',",
    ke: "      id: 'x',\n      produk: kartu.productName,\n      workcode: kartu.workcode,\n      sumber: 'Production',",
    // Baris = kartu, dan kartu yang berbeda wajib punya kunci berbeda —
    // kalau tidak, React memakai satu kunci untuk banyak baris.
    harusGagal: ['id unik'],
  },
  {
    nama: 'pcs Production diisi 0 (bukan dari kartunya)',
    berkas: HALAMAN,
    dari: "      sumber: 'Production',\n      pcs: totalPcs(kartu),",
    ke: "      sumber: 'Production',\n      pcs: 0,",
    harusGagal: ['pcs'],
  },
  {
    nama: 'alasan tertahan dibuang (keterangan selalu null)',
    berkas: HALAMAN,
    dari: '        : g.alasan,\n    };\n  });\n\n  return [...produksi, ...whiteLabel];',
    ke: '        : null,\n    };\n  });\n\n  return [...produksi, ...whiteLabel];',
    // Kartu tertahan tanpa alasan = orang tidak tahu apa yang harus
    // ditindak — dan halaman ini justru ada untuk itu.
    harusGagal: ['alasan tertahan'],
  },
  {
    nama: 'baris terhitung diberi keterangan (keterangan tidak lagi null)',
    berkas: HALAMAN,
    dari: "      status: g.bolehLanjut ? 'Terhitung' : 'Tertahan',\n      keterangan: g.alasan,",
    ke: "      status: g.bolehLanjut ? 'Terhitung' : 'Tertahan',\n      keterangan: g.alasan ?? 'catatan',",
    harusGagal: ['keterangan terhitung'],
  },
  {
    nama: 'status White Label dipatok "Terhitung"',
    berkas: HALAMAN,
    dari: "      status: boleh ? 'Terhitung' : 'Tertahan',",
    ke: "      status: 'Terhitung',",
    harusGagal: ['jumlah Tertahan', 'konsistensi status/angka'],
  },

  // ===== Kolom =====

  {
    nama: 'urutan kolom produk & workcode ditukar',
    berkas: HALAMAN,
    dari: "  { key: 'produk', label: 'Produk', value: (r) => r.produk, lebar: 'max-w-44' },\n  { key: 'workcode', label: 'Workcode', value: (r) => r.workcode },",
    ke: "  { key: 'workcode', label: 'Workcode', value: (r) => r.workcode },\n  { key: 'produk', label: 'Produk', value: (r) => r.produk, lebar: 'max-w-44' },",
    harusGagal: ['urutan kolom'],
  },
  {
    nama: 'filter kolom Sumber dikosongkan',
    berkas: HALAMAN,
    dari: "    filterOptions: ['Production', 'White Label'],",
    ke: '    filterOptions: [],',
    harusGagal: ['filterOptions sumber'],
  },
  {
    nama: 'filter kolom Status kehilangan "Tertahan"',
    berkas: HALAMAN,
    dari: "    filterOptions: ['Terhitung', 'Tertahan'],",
    ke: "    filterOptions: ['Terhitung'],",
    harusGagal: ['filterOptions status'],
  },
  {
    nama: 'kolom HPP memakai jenis "angka" (null tidak lagi "—")',
    berkas: HALAMAN,
    dari: "  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'uang' },",
    ke: "  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'angka' },",
    harusGagal: ['jenis kolom uang'],
  },
  {
    nama: 'lebar kolom produk tidak lagi dibatasi',
    berkas: HALAMAN,
    dari: "  { key: 'produk', label: 'Produk', value: (r) => r.produk, lebar: 'max-w-44' },",
    ke: "  { key: 'produk', label: 'Produk', value: (r) => r.produk, lebar: 'max-w-40' },",
    harusGagal: ['lebar kolom'],
  },
  {
    nama: 'warna badge "Terhitung" tidak lagi hijau',
    berkas: HALAMAN,
    dari: "    warna: (r) => (r.status === 'Terhitung' ? 'hijau' : 'kuning'),",
    ke: "    warna: (r) => (r.status === 'Terhitung' ? 'netral' : 'kuning'),",
    harusGagal: ['warna status'],
  },
  {
    nama: 'label field pencarian diubah',
    berkas: HALAMAN,
    dari: "  { label: 'Produk', get: (r) => r.produk },",
    ke: "  { label: 'Nama Produk', get: (r) => r.produk },",
    harusGagal: ['label pencarian'],
  },
  {
    nama: 'field pencarian Produk membaca workcode',
    berkas: HALAMAN,
    dari: "  { label: 'Produk', get: (r) => r.produk },",
    ke: "  { label: 'Produk', get: (r) => r.workcode },",
    harusGagal: ['isi pencarian'],
  },

  // ===== Halaman lewat rutenya =====

  {
    nama: 'banner menyebut jumlah kolom yang salah',
    berkas: HALAMAN,
    dari: '      <BannerPratinjau modul="HPP & Harga Jual" jumlahKolom={kolomHarga.length} />',
    ke: '      <BannerPratinjau modul="HPP & Harga Jual" jumlahKolom={7} />',
    harusGagal: ['banner'],
  },
  {
    nama: 'tabel hanya diberi 10 baris (bukan 18)',
    berkas: HALAMAN,
    dari: '        rows={baris}',
    ke: '        rows={baris.slice(0, 10)}',
    // Footer paginasi menampilkan TOTAL baris yang diterima tabel — di sini
    // "of 18" berubah jadi "of 10", dan itulah satu-satunya tempat totalnya
    // terlihat di markup (halaman 1 hanya merender 10 baris pertama).
    harusGagal: ['footer paginasi'],
  },
  {
    nama: 'label kolom "Keterangan" diubah',
    berkas: HALAMAN,
    dari: "  { key: 'keterangan', label: 'Keterangan', value: (r) => r.keterangan, lebar: 'max-w-72' },",
    ke: "  { key: 'keterangan', label: 'Catatan', value: (r) => r.keterangan, lebar: 'max-w-72' },",
    harusGagal: ['header kolom'],
  },
  {
    nama: 'sel HPP selalu bernilai 0',
    berkas: HALAMAN,
    dari: "  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'uang' },",
    ke: "  { key: 'hpp', label: 'HPP / pcs', value: () => 0, jenis: 'uang' },",
    // Membuktikan check "Rp 0" membaca MARKUP, bukan cuma data: nilai 0 di
    // sel (bukan di `susunBaris`) hanya terlihat lewat render.
    harusGagal: ['Rp 0 di markup'],
  },
  {
    nama: 'route di App.tsx diganti nama',
    berkas: APP,
    dari: '      <Route path="/modul/hpp-harga-jual" element={',
    ke: '      <Route path="/modul/hpp-harga-jual-baru" element={',
    // Halaman jatuh ke fallback "Coming soon..." — rute, banner, footer, dan
    // header kolom harus ikut gagal.
    harusGagal: ['rute', 'banner', 'footer paginasi', 'header kolom'],
    // Breadcrumb TIDAK ikut gagal, dan itu bukan kebetulan: ia dibangun dari
    // URL + daftar menu, bukan dari rute yang cocok. Mengganti nama rute tidak
    // mengubah URL, jadi breadcrumb-nya tetap benar. Asersi ini yang menjaga
    // pembagian itu — kalau suatu saat breadcrumb ikut gagal, berarti ia mulai
    // bergantung pada rute, dan itu perubahan perilaku yang perlu dilihat.
    tidakBolehGagal: ['breadcrumb'],
  },

  // ===== Menu sidebar =====

  {
    nama: 'entri menu HPP & Harga Jual dihapus',
    berkas: SHELL,
    dari: "  {\n    path: '/modul/hpp-harga-jual',\n    label: 'HPP & Harga Jual',\n    // Panah naik, bukan kalkulator: kalkulator sudah dipakai \"HPP\" tepat di\n    // atasnya, dan dua ikon yang sama berdempetan membuat barisnya sulit\n    // dibedakan saat sidebar dipindai cepat.\n    icon: TrendingUp,\n    section: 'Master Data',\n  },\n",
    ke: '',
    harusGagal: ['menu', 'posisi menu', 'label menu', 'breadcrumb'],
  },
  {
    nama: 'entri menu disalin ke awal daftar (posisi salah)',
    berkas: SHELL,
    dari: "const modulBaru: NavItem[] = [\n  { path: '/modul/material', label: 'Material', icon: Package, section: 'Master Data' },",
    ke: "const modulBaru: NavItem[] = [\n  { path: '/modul/hpp-harga-jual', label: 'HPP & Harga Jual', icon: TrendingUp, section: 'Master Data' },\n  { path: '/modul/material', label: 'Material', icon: Package, section: 'Master Data' },",
    harusGagal: ['posisi menu'],
  },
  {
    nama: 'section menu dihapus (breadcrumb kehilangan induk)',
    berkas: SHELL,
    dari: "    icon: TrendingUp,\n    section: 'Master Data',",
    ke: '    icon: TrendingUp,',
    harusGagal: ['breadcrumb'],
  },
];

// `--dari=N` (1-based) menjalankan hanya mutasi ke-N dan seterusnya — untuk
// melanjutkan run yang terhenti. Di mesin ini harness pernah di-kill sistem
// saat memory kritis: TerminateProcess melewati blok `finally`, jadi berkas
// yang sedang dimutasi ditinggal rusak dan harus dipulihkan dulu
// (.scratch/hpp-restore.ps1) sebelum run berikutnya. Pre-check di bawah tetap
// memeriksa SELURUH daftar, bukan hanya irisan yang dijalankan.
const argDari = process.argv.find((a) => a.startsWith('--dari='));
const nomorDari = argDari ? Number(argDari.slice('--dari='.length)) : 1;
if (!Number.isInteger(nomorDari) || nomorDari < 1 || nomorDari > MUTASI.length) {
  console.log(
    `Nilai --dari tidak sah: ${argDari ?? '(kosong)'} — pakai --dari=N, N = 1..${MUTASI.length}.`
  );
  process.exit(1);
}
const mulaiDari = nomorDari - 1;

/**
 * Cari `dari` di berkas, toleran terhadap CRLF/LF, dan kembalikan posisinya di
 * koordinat berkas ASLI (mulai dan akhir).
 *
 * Pola di daftar mutasi ditulis dengan LF, jadi pencariannya harus di versi LF —
 * kalau tidak, pola multi-baris tidak pernah ketemu. Pemetaan baliknya dibangun
 * dengan MENYUSURI berkas aslinya, bukan aritmetika yang mengasumsikan akhiran
 * baris seragam: satu berkas boleh CRLF dan tetangganya LF. Kesalahan di sini
 * pernah membuat berkas hasil mutasi rusak sintaks, bundel SSR gagal dibangun,
 * dan test keluar non-zero tanpa satu pun baris GAGAL — harness-nya membaca itu
 * sebagai "mutasi tertangkap" padahal pemeriksaannya tidak pernah jalan.
 */
function cari(isi, dari) {
  const lf = isi.replace(/\r\n/g, '\n');
  const mulaiLf = lf.indexOf(dari);
  if (mulaiLf < 0) return null;

  const peta = [];
  let i = 0;
  while (i < isi.length) {
    if (isi[i] === '\r' && isi[i + 1] === '\n') {
      peta.push(i);
      i += 2;
    } else {
      peta.push(i);
      i += 1;
    }
  }
  peta.push(isi.length);

  const akhirLf = mulaiLf + dari.length;
  return { mulai: peta[mulaiLf], akhir: peta[akhirLf] };
}

const jalankan = () => {
  try {
    execFileSync(process.execPath, [path.join(root, 'tests/smoke-hpp-harga-jual.mjs')], {
      cwd: frontend,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { kode: 0, keluaran: '' };
  } catch (e) {
    return { kode: e.status ?? 1, keluaran: String(e.stdout || '') + String(e.stderr || '') };
  }
};

// Pre-check SEMUA pola sebelum menjalankan mutasi satu pun. Dua hal yang
// dicegah, dua-duanya sudah pernah terjadi di repo ini:
//
//   1. Pola yang basi (berkasnya sudah berubah) — tanpa ini baru ketahuan
//      setelah puluhan build, dan setiap mutasi "LEWAT" adalah satu putaran
//      yang tidak membuktikan apa pun.
//   2. Pola yang TIDAK UNIK — `cari()` mengambil kemunculan pertama, jadi pola
//      yang muncul dua kali bisa memutasi lokasi yang salah: berkasnya rusak
//      di tempat lain, test gagal karena sebab yang berbeda, dan hasilnya
//      terbaca "mutasi tertangkap" padahal bukan pemeriksaan itu yang gagal.
{
  const masalah = [];
  for (const m of MUTASI) {
    const asli = readFileSync(m.berkas, 'utf8');
    const lf = asli.replace(/\r\n/g, '\n');
    let n = 0;
    for (let i = lf.indexOf(m.dari); i >= 0; i = lf.indexOf(m.dari, i + 1)) n += 1;
    if (n === 0) masalah.push(`  - ${m.nama} (${path.basename(m.berkas)}) — pola tidak ditemukan`);
    else if (n > 1)
      masalah.push(`  - ${m.nama} (${path.basename(m.berkas)}) — pola muncul ${n}×, tidak unik`);
  }
  if (masalah.length) {
    console.log('DAFTAR MUTASI BERMASALAH — perbaiki dulu sebelum menjalankan:');
    console.log(masalah.join('\n'));
    process.exit(1);
  }
  console.log(`Pre-check: ${MUTASI.length} pola mutasi ada dan unik.`);

  // Coverage: SETIAP label `salah(...)` di smoke test harus bisa dipicu oleh
  // minimal satu mutasi. Check yang tidak terpetakan ke mutasi mana pun adalah
  // check yang tidak pernah dibuktikan — persis kelas kesalahan yang tiket ini
  // ada untuk mencegahnya. Dijalankan di sini (bukan saat iterasi) supaya
  // check yang lupa dimutasi ketahuan sebelum puluhan build berjalan.
  const isiSmoke = readFileSync(path.join(root, 'tests/smoke-hpp-harga-jual.mjs'), 'utf8');
  // `\s*` wajib: separuh pemanggilan `salah()` menaruh labelnya di baris
  // berikutnya (`salah(\n      'urutan Production',`). Tanpa itu, check-check
  // itu terlihat "tidak ada" dan coverage-nya lolos karena alasan yang salah.
  const labelSmoke = [...isiSmoke.matchAll(/salah\(\s*'([^']+)'/g)].map((x) => x[1]);
  const semuaHarusGagal = MUTASI.flatMap((m) => m.harusGagal);
  const takTercakup = labelSmoke.filter(
    (label) => !semuaHarusGagal.some((h) => label.includes(h))
  );
  if (takTercakup.length) {
    console.log('CHECK TANPA MUTASI — tambahkan mutasi untuk label berikut:');
    for (const l of takTercakup) console.log(`  - ${l}`);
    process.exit(1);
  }
  console.log(`Pre-check: ${labelSmoke.length} label check punya mutasi yang membuktikannya.\n`);
}

const dasar = jalankan();
console.log(`BASELINE: exit=${dasar.kode} (harus 0)\n`);
if (dasar.kode !== 0) {
  console.log(dasar.keluaran.slice(-3000));
  process.exit(1);
}

if (mulaiDari > 0) {
  console.log(
    `Melanjutkan dari mutasi ${nomorDari} — ${MUTASI.length - mulaiDari} mutasi akan dijalankan.\n`
  );
}

let semuaTertangkap = true;
for (const m of MUTASI.slice(mulaiDari)) {
  const asli = readFileSync(m.berkas, 'utf8');
  const pos = cari(asli, m.dari);
  if (!pos) {
    console.log(`LEWAT  ${m.nama} — pola tidak ditemukan di ${path.basename(m.berkas)}`);
    semuaTertangkap = false;
    continue;
  }

  // Restore WAJIB di `finally`: kalau tidak, proses yang mati di tengah
  // meninggalkan berkas termutasi dan run berikutnya melaporkan baseline
  // gagal — yang terlihat seperti masalah test padahal berkasnya rusak.
  let hasil;
  try {
    writeFileSync(m.berkas, asli.slice(0, pos.mulai) + m.ke + asli.slice(pos.akhir), 'utf8');
    hasil = jalankan();
  } finally {
    writeFileSync(m.berkas, asli, 'utf8');
  }

  if (hasil.kode === 0) {
    console.log(`TIDAK KETANGKAP  ${m.nama} — test tetap LULUS`);
    semuaTertangkap = false;
    continue;
  }

  // Label yang dilaporkan `salah()` adalah argumen pertamanya, bukan teks OK.
  const gagal = [...hasil.keluaran.matchAll(/^  GAGAL (.+?) —/gm)].map((x) => x[1]);

  // Keluar non-zero TANPA satu pun baris GAGAL berarti testnya tidak sampai ke
  // bagian pemeriksaan — mis. bundel SSR gagal dibangun karena berkas hasil
  // mutasinya rusak sintaks. Itu BUKAN mutasi tertangkap.
  if (gagal.length === 0) {
    console.log(`TIDAK SAH  ${m.nama} — test gagal tanpa satu pun pemeriksaan jalan`);
    console.log(
      `          keluaran mentah (ekor):\n${hasil.keluaran
        .trim()
        .split('\n')
        .slice(-12)
        .map((l) => `            ${l}`)
        .join('\n')}`
    );
    semuaTertangkap = false;
    continue;
  }

  const ketemu = m.harusGagal.filter((h) => gagal.some((g) => g.includes(h)));
  // Asersi negatif: check yang TIDAK boleh ikut gagal. Lihat catatan pada
  // mutasi rename rute — tanpa ini, mutasi yang seharusnya hanya memicu satu
  // pemeriksaan bisa "lulus" karena pemeriksaan lain ikut runtuh, dan yang
  // terbukti bukan yang dimaksud.
  const bocor = (m.tidakBolehGagal ?? []).filter((h) => gagal.some((g) => g.includes(h)));
  const lengkap = ketemu.length === m.harusGagal.length && bocor.length === 0;
  if (!lengkap) semuaTertangkap = false;
  console.log(`${lengkap ? 'KETANGKAP' : 'SEBAGIAN'}  ${m.nama}`);
  console.log(`          gagal: ${gagal.join(' | ')}`);
  if (bocor.length) console.log(`          BOCOR (tidak seharusnya gagal): ${bocor.join(' | ')}`);
  if (ketemu.length !== m.harusGagal.length) {
    const kurang = m.harusGagal.filter((h) => !gagal.some((g) => g.includes(h)));
    console.log(`          KURANG (tidak ikut gagal): ${kurang.join(' | ')}`);
  }
}

const rentang = mulaiDari > 0 ? ` (${nomorDari}–${MUTASI.length})` : '';
console.log(
  semuaTertangkap ? `\nSEMUA MUTASI${rentang} KETANGKAP` : `\nADA MUTASI${rentang} YANG LOLOS`
);
process.exit(semuaTertangkap ? 0 : 1);
