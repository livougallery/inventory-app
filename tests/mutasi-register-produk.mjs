/**
 * Mutation test untuk smoke-register-produk.mjs.
 *
 * Kenapa ini ada: halaman Register Produk baru saja disambungkan ke database
 * (16 Okt 2026), dan tiga check baru lahir bersamanya — pemuat halaman,
 * alasan "master warna belum termuat", dan bentuk tabel varian yang sekarang
 * bergantung pada prop `warnaMaster`. Check yang tidak pernah dilihat MERAH
 * belum membuktikan apa pun: ia bisa hijau karena tidak menemukan apa pun
 * untuk diperiksa, dan itu persis kelas kesalahan yang sudah dua kali menimpa
 * halaman ini.
 *
 * Cara kerjanya: satu berkas sumber dirusak dengan sengaja, smoke test
 * dijalankan, lalu berkasnya dikembalikan. Mutasi dianggap BAIK kalau label
 * check yang dituju benar-benar muncul sebagai `GAGAL <label>`.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/mutasi-register-produk.mjs
 *
 * Aturan yang dipakai harness ini, dan alasannya:
 *
 * 1. `harusGagal` berisi LABEL KEGAGALAN, yaitu argumen PERTAMA `salah(...)` —
 *    bukan teks `ok(...)`. Teks `ok` cuma dicetak saat check LULUS, jadi
 *    menaruhnya di sini akan selalu terbaca "tidak tertangkap".
 *
 * 2. Tiap mutasi harus tetap LOLOS BUILD. Kalau berkasnya jadi syntax error,
 *    smoke testnya mati sebelum check mana pun jalan, dan harness membaca
 *    "tidak ada yang hijau" sebagai "tertangkap" — padahal testnya tidak
 *    pernah menguji apa pun.
 *
 * 3. Berkas dikembalikan lewat `finally` DAN lewat handler sinyal. Proses yang
 *    dibunuh di tengah bisa meninggalkan berkas dalam keadaan termutasi, dan
 *    itu diam-diam mencemari semua test berikutnya.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const akarRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = path.join(akarRepo, 'frontend');

const HALAMAN = path.join(frontendDir, 'src', 'pages', 'RegisterProduk.tsx');
const FORM = path.join(frontendDir, 'src', 'pages', 'register-produk', 'FormProdukBaru.tsx');

const sha = (teks) => createHash('sha256').update(teks).digest('hex');

// ===== Daftar mutasi =====
//
// `dari` harus muncul PERSIS SEKALI di berkasnya. Kalau nol kali, mutasinya
// sudah basi (sumbernya berubah) dan itu dilaporkan sebagai kegagalan, bukan
// dilewati diam-diam — mutasi yang tidak menemukan sasarannya selalu terbaca
// "tidak tertangkap", dan orangnya lalu mengejar check yang sebenarnya sehat.
const MUTASI = [
  {
    nama: 'cabang "Memuat produk…" dihapus, jadi keadaan memuat jatuh ke daftar kosong',
    berkas: HALAMAN,
    dari: '          {memuat && semua.length === 0 ? (',
    ke: '          {false && memuat && semua.length === 0 ? (',
    // Dua-duanya harus merah, dan itu memang yang membuktikan urutannya benar:
    // pemuatnya hilang, DAN halaman yang sedang memuat mengaku daftarnya kosong.
    harusGagal: ['pemuat', 'urutan keadaan'],
  },
  {
    nama: 'alasan "master warna belum termuat" tidak lagi didaftarkan',
    berkas: FORM,
    dari: "  if (warnaMaster.length === 0) masalah.push('Master warna belum termuat — buka ulang form ini');",
    ke: '',
    harusGagal: ['alasan master kosong'],
  },
  {
    nama: 'warna pertama tidak lagi dipilih dari master (tabel varian jadi kosong)',
    berkas: FORM,
    dari: '    warnaMaster.length > 0 ? [warnaMaster[0].nama] : []',
    ke: '    []',
    // Tabel varian kosong berarti tidak ada input kode dan tidak ada ikon hapus.
    harusGagal: ['input kode varian', 'aksi hapus'],
  },
  {
    nama: 'produkAwal tidak lagi ikut ke katalog (seam smoke test putus)',
    berkas: HALAMAN,
    dari: '    () => [...produk, ...produkAwal],',
    ke: '    () => [...produk],',
    // Katalognya jadi kosong di KEDUA render, jadi selisihnya nol — bukan satu.
    harusGagal: ['kartu dari form', 'hitungan produk', 'nama produk baru'],
  },
];

// ===== Pemeriksaan awal =====
//
// Setiap `harusGagal` harus benar-benar ada sebagai argumen pertama `salah(...)`
// di smoke testnya. Tanpa ini, salah ketik satu huruf di sini membuat harness
// melaporkan "TIDAK TERTANGKAP" selamanya, dan orangnya mengejar check yang
// sebenarnya sudah bekerja.
console.log('== Pemeriksaan awal ==');

const sumberSmoke = readFileSync(path.join(akarRepo, 'tests', 'smoke-register-produk.mjs'), 'utf8');
let lolosAwal = true;

for (const m of MUTASI) {
  for (const t of m.harusGagal) {
    // Dicari dalam bentuk `salah('label'` — argumen PERTAMA, bukan sembarang
    // kemunculan teksnya.
    const ada = sumberSmoke.includes(`salah('${t}'`) || sumberSmoke.includes(`salah(\n      '${t}'`);
    if (!ada) {
      console.log(`  GAGAL label "${t}" tidak ada sebagai salah('${t}') di smoke test`);
      lolosAwal = false;
    }
  }
  // `dari` harus ada tepat sekali. Nol kali = mutasi basi.
  const isiAsli = readFileSync(m.berkas, 'utf8');
  const jumlah = isiAsli.split(m.dari).length - 1;
  if (jumlah !== 1) {
    console.log(`  GAGAL sasaran mutasi "${m.nama}" muncul ${jumlah}x, harus 1`);
    lolosAwal = false;
  }
}

if (lolosAwal) console.log(`  OK   ${MUTASI.length} mutasi siap, semua label & sasaran ketemu`);
else {
  console.log('\nGAGAL — harnessnya sendiri belum beres; mutasi tidak dijalankan.');
  process.exit(1);
}

// ===== Backup + restore =====

const cadangan = new Map();
for (const berkas of new Set(MUTASI.map((m) => m.berkas))) {
  const isi = readFileSync(berkas, 'utf8');
  cadangan.set(berkas, { isi, hash: sha(isi) });
}

let sedangTermutasi = null;
function kembalikan() {
  for (const [berkas, { isi, hash }] of cadangan) {
    writeFileSync(berkas, isi, 'utf8');
    if (sha(readFileSync(berkas, 'utf8')) !== hash) {
      console.error(`  BAHAYA: ${berkas} tidak kembali seperti semula`);
    }
  }
  sedangTermutasi = null;
}
process.on('exit', () => { if (sedangTermutasi) kembalikan(); });
for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.on(sinyal, () => {
    kembalikan();
    process.exit(1);
  });
}

// ===== Jalankan =====

console.log('\n== Menjalankan mutasi ==');

let tertangkap = 0;
const meleset = [];

for (const m of MUTASI) {
  const asli = readFileSync(m.berkas, 'utf8');
  const termutasi = asli.replace(m.dari, m.ke);
  if (termutasi === asli) {
    console.log(`  LEWAT ${m.nama} — penggantian tidak mengubah apa pun`);
    meleset.push(m.nama);
    continue;
  }

  sedangTermutasi = m.berkas;
  writeFileSync(m.berkas, termutasi, 'utf8');

  let keluaran = '';
  let matiBangun = false;
  try {
    keluaran = execFileSync(process.execPath, [path.join(akarRepo, 'tests', 'smoke-register-produk.mjs')], {
      cwd: frontendDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    keluaran = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    // Smoke test keluar dengan kode 1 baik saat check-nya merah maupun saat
    // buildnya gagal. Yang dibedakan: kalau buildnya yang gagal, TIDAK ADA
    // baris OK sama sekali.
    matiBangun = !keluaran.includes('  OK   ');
  } finally {
    writeFileSync(m.berkas, asli, 'utf8');
    sedangTermutasi = null;
  }

  const hashSekarang = sha(readFileSync(m.berkas, 'utf8'));
  if (hashSekarang !== cadangan.get(m.berkas).hash) {
    console.log(`  BAHAYA ${m.nama} — berkas tidak kembali utuh, hentikan`);
    process.exit(1);
  }

  if (matiBangun) {
    console.log(`  GAGAL-BANGUN ${m.nama} — smoke testnya mati sebelum check jalan`);
    meleset.push(m.nama);
    continue;
  }

  const hilang = m.harusGagal.filter((t) => !keluaran.includes(`GAGAL ${t} `));
  if (hilang.length === 0) {
    console.log(`  TERTANGKAP ${m.nama}`);
    tertangkap += 1;
  } else {
    console.log(`  TIDAK TERTANGKAP ${m.nama} — masih hijau: ${hilang.join(', ')}`);
    meleset.push(m.nama);
  }
}

// ===== Hasil =====

console.log('');
if (tertangkap === MUTASI.length) {
  console.log(`LULUS — ${tertangkap}/${MUTASI.length} mutasi tertangkap.`);
  process.exit(0);
}
console.log(`GAGAL — ${tertangkap}/${MUTASI.length} tertangkap. Meleset:`);
for (const n of meleset) console.log(`  - ${n}`);
process.exit(1);
