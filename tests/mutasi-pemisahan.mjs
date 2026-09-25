/**
 * Mutation test untuk pemeriksaan pemisahan halaman + perbaikan hasil review.
 *
 * Tiap mutasi merusak SATU hal yang seharusnya dijaga pemeriksaan, lalu test
 * dijalankan. Mutasi yang tidak membuat test gagal berarti pemeriksaannya
 * kosong — lulus tanpa memeriksa apa pun.
 *
 * Bukan test (jest tidak memungutnya: namanya bukan `*.test.js`), jadi ia TIDAK
 * dihapus setelah dipakai — ia dijaga sebagai alat yang dijalankan ulang tiap
 * kali papan atau formulirnya berubah. Tujuh mutasi terakhir mengembalikan bug
 * yang benar-benar ada di kode dan baru ketahuan lewat /code-review; tanpa
 * mutasi itu, perbaikannya cuma dipercaya benar karena sudah dijalankan sekali.
 *
 * Jalankan: `node tests/mutasi-pemisahan.mjs` (dari root repo).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');

const MUTASI = [
  {
    nama: 'item.section papan dikembalikan ke "Master Data"',
    berkas: path.join(frontend, 'src/components/Shell.tsx'),
    dari: "    icon: SquareKanban,\n    section: 'Progress',",
    ke: "    icon: SquareKanban,\n    section: 'Master Data',",
    // Pindahnya menu di sidebar dan induk di breadcrumb datang dari DUA sumber
    // yang berbeda: section di `navSectionsVideo`, dan `item.section`. Mutasi
    // ini merusak yang kedua saja — jadi justru pemeriksaan sidebar yang TIDAK
    // boleh gagal di sini (menunya memang masih di grup Progress).
    harusGagal: ['breadcrumb papan'],
    tidakBolehGagal: ['menu papan'],
  },
  {
    nama: 'kedua rute menunjuk halaman yang sama (tabel)',
    berkas: path.join(frontend, 'src/App.tsx'),
    dari: '          <PapanProduksi />',
    ke: '          <ProductionFulfillment />',
    // 'dua rute' (bukan 'kedua rute') adalah label persisnya di smoke test —
    // dicek lewat `includes`, jadi salah tulis di sini membuat mutasi yang
    // sebenarnya tertangkap terlihat seperti baru tertangkap separuh.
    harusGagal: ['halaman papan', 'dua rute'],
  },
  {
    nama: 'saklar Kanban/Tabel dipasang lagi di halaman tabel',
    berkas: path.join(frontend, 'src/pages/ProductionFulfillment.tsx'),
    // Sengaja <span>, bukan <Button>: halaman ini sudah tidak mengimpor Button,
    // dan mutasi yang gagal karena import hilang akan "tertangkap" tanpa
    // membuktikan apa pun tentang pemeriksaannya.
    dari: '      <Tabs value={stageAktif} onValueChange={setStageAktif}>',
    ke: `      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        <span>Kanban</span>
        <span>Tabel</span>
      </div>
      <Tabs value={stageAktif} onValueChange={setStageAktif}>`,
    harusGagal: ['saklar Kanban/Tabel di halaman tabel'],
  },
  {
    nama: 'banner halaman papan menyebut "Tabel" lagi',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/PapanProduksi.tsx'),
    dari: 'bentuk="papan"',
    ke: '',
    harusGagal: ['banner halaman papan'],
  },
  {
    nama: 'menu papan ditambahkan juga ke section Master Data',
    berkas: path.join(frontend, 'src/components/Shell.tsx'),
    dari: "  { path: '/modul/hpp-baru', label: 'HPP', icon: Calculator, section: 'Master Data' },",
    ke: `  { path: '/modul/production-fulfillment', label: 'Papan', icon: SquareKanban, section: 'Master Data' },
  { path: '/modul/hpp-baru', label: 'HPP', icon: Calculator, section: 'Master Data' },`,
    // Menu papan jadi muncul DULUAN di Master Data, sebelum judul Progress.
    harusGagal: ['menu papan'],
  },
  {
    nama: 'section Progress dihapus, papannya dilebur ke Master Data',
    berkas: path.join(frontend, 'src/components/Shell.tsx'),
    // Pola ini dulu menyalin seluruh blok `navSectionsVideo` (empat baris),
    // dan itu rapuh: begitu ada section baru di antaranya — mis. 'Register' —
    // polanya tidak ketemu lagi dan harness melaporkan LEWAT, padahal yang
    // rusak cuma pola di harness-nya, bukan pemeriksaannya. Sekarang yang
    // diambil cuma baris `items` milik section Progress, yang unik karena
    // 'Progress' muncul dua kali di berkas ini (mode video dan mode normal)
    // tapi hanya yang ini memakai `papanProgress` di dalam `navSectionsVideo`.
    dari: `    title: 'Progress',
    items: papanProgress,
  },
];`,
    ke: `    title: 'Master Data',
    items: [...modulBaru, ...papanProgress],
  },
];`,
    harusGagal: ['section Progress'],
  },

  // ===== Mutasi untuk perbaikan hasil review =====
  //
  // Semuanya menjaga perilaku yang SEBELUMNYA salah dan tidak tertangkap
  // pemeriksaan mana pun. Tanpa mutasi di sini, perbaikannya cuma dipercaya
  // benar karena sudah dijalankan sekali — bukan karena ada yang menjaganya.

  {
    nama: 'kunci bahan kembali dari teks saja, tanpa nomor kemunculan (bug asli)',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/data-kanban.ts'),
    dari: "      kunci: ke === 1 ? teks : `${teks}#${ke}`,",
    ke: '      kunci: teks,',
    // Ini bug asli yang dilaporkan review: dua baris kain bernama sama (kain
    // utama + furing) berbagi satu kunci, jadi satu centang di Prepare
    // menandai keduanya dan gate-nya terbuka sebelum bahannya diperiksa.
    // Pemeriksaannya harus memakai kartu yang benar-benar punya baris kembar —
    // memeriksa kartu contoh yang kebetulan tidak punya kembar akan lulus
    // walau kuncinya kembali bertabrakan.
    harusGagal: ['kunci bahan kembar'],
  },
  {
    nama: 'stok kosong dikembalikan jadi 0 (bug asli)',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/FormProduksiBaru.tsx'),
    dari: '    const tersedia = angkaStok(b.tersedia) ?? undefined;',
    ke: '    const tersedia = angkaStok(b.tersedia) ?? 0;',
    harusGagal: ['stok belum dicatat'],
  },
  {
    nama: 'kolom stok kembali memakai angka() yang menolak nol',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/FormProduksiBaru.tsx'),
    dari: '    const tersedia = angkaStok(b.tersedia) ?? undefined;',
    ke: '    const tersedia = angka(b.tersedia) ?? undefined;',
    // Kebalikan dari mutasi di atas, dan sama pentingnya: stok 0 adalah keadaan
    // yang nyata ("habis"), jadi memakai `angka()` di sini membuat stok yang
    // benar-benar kosong terbaca "Belum dicatat" — dua keadaan berbeda jadi
    // tampak sama, dan kekurangan yang nyata kehilangan badge merahnya.
    harusGagal: ['stok nol'],
  },
  {
    nama: 'akhiran workcode dipatok _PRDN untuk kedua papan (bug asli)',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/data-kanban.ts'),
    dari: 'workcode: `PDFF_${b.designCode}_${b.batch}_${AKHIRAN_WORKCODE[sumber]}`',
    ke: 'workcode: `PDFF_${b.designCode}_${b.batch}_PRDN`',
    harusGagal: ['workcode kartu White Label'],
  },
  {
    nama: 'kode warna kembar dibiarkan sama (bug asli)',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/FormProduksiBaru.tsx'),
    dari: '  if (!dipakai.has(dasar)) return pilih(dasar);',
    ke: '  if (!dipakai.has(dasar)) return dasar;',
    // Ini justru mengembalikan bug PERSIS seperti aslinya: `dasar` yang belum
    // dipakai dikembalikan tanpa dicatat, jadi baris berikutnya dengan kode sama
    // tetap lolos. Pemeriksaannya harus menangkap itu, bukan cuma memeriksa
    // bahwa fungsinya mengembalikan sesuatu.
    harusGagal: ['kode warna kembar', 'kode untuk nama identik'],
  },
  {
    nama: 'label popup dipatok "Production proposal" (bug asli)',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/PopupKartu.tsx'),
    dari: "  return sumber === 'whitelabel' ? 'White Label proposal' : 'Production proposal';",
    ke: "  return 'Production proposal';",
    harusGagal: ['label popup'],
  },
  {
    nama: 'janji "tabel bawah" ditulis tanpa syarat (bug asli)',
    berkas: path.join(frontend, 'src/pages/production-fulfillment/PopupKartu.tsx'),
    dari: `        keterangan={
          adaTabelBahan
            ? 'Satu baris mewakili satu kombinasi warna dan ukuran. Kesiapan bahan diperiksa di tabel bawah.'
            : 'Satu baris mewakili satu kombinasi warna dan ukuran.'
        }`,
    ke: `        keterangan="Satu baris mewakili satu kombinasi warna dan ukuran. Kesiapan bahan diperiksa di tabel bawah."`,
    harusGagal: ['janji tabel bawah'],
  },
];

/**
 * Cari `dari` di berkas, toleran terhadap CRLF/LF, dan kembalikan posisinya di
 * koordinat berkas ASLI (mulai dan akhir).
 *
 * Pola di daftar mutasi ditulis dengan LF, jadi pencariannya harus di versi LF —
 * kalau tidak, pola multi-baris tidak pernah ketemu.
 *
 * Hasilnya lalu harus dipetakan KEMBALI ke koordinat berkas asli. Di sinilah
 * jebakannya, dan versi pertama fungsi ini salah dengan cara yang halus:
 * pemetaannya mengasumsikan SEMUA baris berakhiran CRLF (`i + jumlah \n
 * sebelumnya`). Itu benar untuk berkas lama di repo ini, tapi TIDAK untuk
 * berkas yang baru ditulis editor — `Shell.tsx` dan `PapanProduksi.tsx`
 * berakhiran LF murni. Di berkas LF, tiap baris pola menambah satu karakter
 * yang tidak ada di berkas asli, jadi potongannya meleset dan yang terpotong
 * adalah teks acak.
 *
 * Akibatnya menipu: berkas hasil mutasinya rusak sintaks, bundel SSR gagal
 * dibangun, dan test keluar non-zero TANPA satu pun baris `GAGAL`. Harness-nya
 * membaca itu sebagai "mutasi tertangkap", padahal pemeriksaannya tidak pernah
 * jalan. Empat dari enam mutasi jatuh ke lubang ini.
 *
 * Karena itu pemetaannya dibangun dengan MENYUSURI berkas aslinya, bukan dengan
 * aritmetika yang mengasumsikan akhiran baris seragam. Satu berkas boleh CRLF
 * dan tetangganya LF: `core.autocrlf=true` menormalkan keduanya saat masuk git,
 * tapi yang dibaca fungsi ini adalah isi di disk, apa adanya.
 */
function cari(isi, dari) {
  const lf = isi.replace(/\r\n/g, '\n');
  const mulaiLf = lf.indexOf(dari);
  if (mulaiLf < 0) return null;

  // Peta indeks versi-LF -> indeks berkas asli. Tiap elemen adalah posisi
  // karakter di berkas asli yang mewakili satu karakter di versi LF; `\r\n`
  // menyumbang satu elemen (posisi `\r`), karakter lain menyumbang satu.
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
  peta.push(isi.length); // sentinel: akhir string versi LF

  const akhirLf = mulaiLf + dari.length;
  return { mulai: peta[mulaiLf], akhir: peta[akhirLf] };
}

const jalankan = () => {
  try {
    execFileSync(process.execPath, [path.join(root, 'tests/smoke-kanban-fulfillment.mjs')], {
      cwd: frontend,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { kode: 0, keluaran: '' };
  } catch (e) {
    return { kode: e.status ?? 1, keluaran: String(e.stdout || '') + String(e.stderr || '') };
  }
};

const dasar = jalankan();
console.log(`BASELINE: exit=${dasar.kode} (harus 0)\n`);
if (dasar.kode !== 0) {
  console.log(dasar.keluaran.slice(-3000));
  process.exit(1);
}

let semuaTertangkap = true;
for (const m of MUTASI) {
  const asli = readFileSync(m.berkas, 'utf8');
  const pos = cari(asli, m.dari);
  if (!pos) {
    console.log(`LEWAT  ${m.nama} — pola tidak ditemukan di ${path.basename(m.berkas)}`);
    semuaTertangkap = false;
    continue;
  }

  // Restore WAJIB di `finally`. Sebelumnya penulisan ulang diletakkan setelah
  // pemanggilan test, dan itu meninggalkan berkas dalam keadaan termutasi
  // begitu proses ini mati di tengah jalan — yang terjadi sungguhan saat
  // keluarannya dipotong dengan `Select-Object -First`, karena pipa yang
  // ditutup mematikan prosesnya. Akibatnya run berikutnya melaporkan baseline
  // gagal, dan yang terlihat seperti masalah test sebenarnya berkas rusak.
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
  // bagian pemeriksaan sama sekali — mis. bundel SSR gagal dibangun karena
  // berkas hasil mutasinya rusak sintaks. Ini BUKAN mutasi tertangkap, dan
  // tidak boleh dilaporkan sebagai "SEBAGIAN": bedanya adalah bedanya antara
  // "pemeriksaannya bekerja" dan "pemeriksaannya tidak pernah jalan".
  if (gagal.length === 0) {
    console.log(`TIDAK SAH  ${m.nama} — test gagal tanpa satu pun pemeriksaan jalan`);
    console.log(`          keluaran mentah (ekor):\n${hasil.keluaran.trim().split('\n').slice(-12).map((l) => `            ${l}`).join('\n')}`);
    semuaTertangkap = false;
    continue;
  }

  const ketemu = m.harusGagal.filter((h) => gagal.some((g) => g.includes(h)));
  const bocor = (m.tidakBolehGagal ?? []).filter((h) => gagal.some((g) => g.includes(h)));
  const lengkap = ketemu.length === m.harusGagal.length && bocor.length === 0;
  if (!lengkap) semuaTertangkap = false;
  console.log(`${lengkap ? 'KETANGKAP' : 'SEBAGIAN'}  ${m.nama}`);
  console.log(`          gagal: ${gagal.join(' | ')}`);
  if (bocor.length) console.log(`          BOCOR (tidak seharusnya gagal): ${bocor.join(' | ')}`);
}

console.log(semuaTertangkap ? '\nSEMUA MUTASI KETANGKAP' : '\nADA MUTASI YANG LOLOS');
process.exit(semuaTertangkap ? 0 : 1);
