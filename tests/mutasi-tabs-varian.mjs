/**
 * Uji mutasi untuk smoke-tabs-varian.mjs.
 *
 * Sama seperti mutasi-tab-warna.mjs: tiap mutasi merusak SATU perilaku yang
 * diklaim check-nya, build ulang, jalankan smoke, lalu pulihkan. Mutasi yang
 * tidak membuat test merah berarti check-nya hijau tanpa menguji apa pun.
 *
 * Kenapa khusus: `ui/tabs.tsx` dipakai BERSAMA oleh enam halaman. Perubahan
 * varian `line` menyentuh className TabsTrigger yang juga dipakai lima halaman
 * varian `default`. Test regresinya ada di smoke-tabs-varian.mjs; harness ini
 * yang membuktikan test itu benar-benar menangkap kebocoran gaya, bukan sekadar
 * hijau karena halamannya kebetulan tampil.
 *
 * WAJIB BUILD ULANG tiap mutasi: halaman diuji lewat http://localhost:3000,
 * yang menyajikan `frontend/dist/` — build, bukan sumber.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABS = join(AKAR, 'frontend', 'src', 'components', 'ui', 'tabs.tsx');
const SMOKE = join(AKAR, 'tests', 'smoke-tabs-varian.mjs');

const hash = (s) => createHash('sha256').update(s).digest('hex');

const asli = readFileSync(TABS, 'utf8');
const hashAsli = hash(asli);

// Setiap `ke` harus tetap SAH sebagai JSX/TSX. `npm run build` = `tsc -b &&
// vite build`; mutasi yang ditolak TypeScript tidak pernah sampai ke halaman,
// dan harness akan salah membacanya sebagai "merah". Karena itu yang dirusak
// hanya NILAI di dalam string className, bukan bentuk kodenya.
//
// `harusGagal` berisi LABEL KEGAGALAN (argumen pertama `salah(...)`), bukan
// teks `ok(...)`.
const MUTASI = [
  {
    nama: 'latar pil varian default dihapus (tab aktif jadi transparan)',
    dari: 'data-[state=active]:bg-background data-[state=active]:text-foreground',
    ke: 'data-[state=active]:text-foreground',
    // Hanya varian default yang kehilangan latarnya; varian line sudah
    // transparan sejak awal, jadi check-nya tidak berubah. Labelnya satu untuk
    // kedua halaman default (keduanya jalur kode yang sama), dan nama halaman
    // yang gagal ikut terbaca di argumen detailnya.
    harusGagal: ['pil varian default'],
  },
  {
    nama: 'garis bawah varian line dimatikan (opacity 100 -> 0)',
    dari: 'group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
    ke: 'group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-0',
    harusGagal: ['garis Register Produk'],
  },
  {
    nama: 'varian line tidak lagi mematikan kotak pil saat aktif',
    dari: 'group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
    ke: 'group-data-[variant=line]/tabs-list:data-[state=active]:bg-background',
    harusGagal: ['latar Register Produk'],
  },
  {
    nama: 'penanda data-variant dihapus dari TabsList',
    dari: 'data-variant={variant}',
    ke: 'data-variant={undefined}',
    // Tanpa penanda ini, TIDAK ada satu pun halaman yang tahu variannya:
    // halaman default kehilangan identitasnya, dan halaman line kehilangan
    // seluruh override-nya (latar + garis bawah).
    harusGagal: [
      'varian default',
      'varian Register Produk',
      'latar Register Produk',
      'garis Register Produk',
    ],
  },
];

// Pemeriksaan awal: setiap label harus ada sebagai `salah(...)` di smoke test.
// Tanpa ini, label yang salah tulis baru ketahuan setelah semua build selesai.
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
  console.log('PEMERIKSAAN AWAL GAGAL — label tidak ada sebagai `salah(...)`:');
  for (const l of labelHilang) console.log(`  - ${l}`);
  process.exit(1);
}
console.log(`Pemeriksaan awal: ${MUTASI.length} mutasi, semua label ada di smoke test.`);

let masalah = 0;

// Pemulihan tahan-kill: lihat mutasi-tab-warna.mjs untuk alasannya. Berkas ini
// pernah tertinggal termutasi saat harness di-kill, dan gejalanya diam.
let sedang = null;
function pulihkan() {
  if (!sedang) return;
  try {
    writeFileSync(TABS, asli, 'utf8');
  } catch {
    /* sebaik yang bisa saat proses mati */
  }
  sedang = null;
}
for (const sinyal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sinyal, () => {
    if (sedang) {
      console.log(`\n  DIBATALKAN — memulihkan ${TABS} dulu…`);
      pulihkan();
    }
    process.exit(130);
  });
}
process.on('exit', pulihkan);

for (const m of MUTASI) {
  if (!asli.includes(m.dari)) {
    console.log(`  LEWAT  ${m.nama} — pola tidak ketemu di sumber`);
    masalah++;
    continue;
  }

  sedang = { berkas: TABS };

  let keluaran = '';
  let merah = false;
  let buildGagal = false;
  let pesanBuild = '';
  let pulih = false;

  try {
    writeFileSync(TABS, asli.split(m.dari).join(m.ke), 'utf8');

    // Build dan smoke TERPISAH: mutasi yang ditolak TypeScript harus terbaca
    // "GAGAL-BUILD", bukan "TERTANGKAP".
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
    writeFileSync(TABS, asli, 'utf8');
    sedang = null;
    pulih = hash(readFileSync(TABS, 'utf8')) === hashAsli;
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
