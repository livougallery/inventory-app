/**
 * Mutation test untuk tiket 08 — memastikan test benar-benar menguji sesuatu.
 *
 * Cara: rusak implementasi sedikit demi sedikit, jalankan test tiket 08, dan
 * catat apakah ada test yang mati. Test yang tetap hijau setelah implementasi
 * dirusak berarti tidak menguji apa pun.
 *
 * Cara pakai:
 *   node tests/mutate-ticket08.js
 *
 * File ini TIDAK mengandung testnya sendiri (namanya bukan *.test.js, jadi
 * tidak dipungut jest) — ia cuma menjalankan jest terhadap kode yang dirusak,
 * lalu mengembalikan isi file seperti semula.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const MUTAN = [
  {
    nama: 'hapus predikat status di UPDATE fifoService',
    file: 'services/fifoService.js',
    dari: "WHERE id=$2 AND status='pending'`, [userId, purchaseOrderId]);",
    menjadi: "WHERE id=$2`, [userId, purchaseOrderId]);",
  },
  {
    nama: 'abaikan rowCount (selalu kembalikan true)',
    file: 'services/fifoService.js',
    dari: 'if (head.rowCount === 0) return false;',
    menjadi: 'if (false) return false;',
  },
  {
    nama: 'stok di-SET alih-alih di-INCREMENT',
    file: 'services/fifoService.js',
    dari: "'UPDATE raw_materials SET stok = stok + $1 WHERE id = $2'",
    menjadi: "'UPDATE raw_materials SET stok = $1 WHERE id = $2'",
  },
  {
    nama: 'movement_type jadi keluar',
    file: 'services/fifoService.js',
    dari: `VALUES ($1, 'masuk', $2, $3, 'po', $4, $5, $6)`,
    menjadi: `VALUES ($1, 'keluar', $2, $3, 'po', $4, $5, $6)`,
  },
  {
    nama: 'qty_sisa batch jadi 0',
    file: 'services/fifoService.js',
    dari: 'VALUES ($1, \'po\', $2, $3, $3, $4, $5) RETURNING id',
    menjadi: 'VALUES ($1, \'po\', $2, $3, 0, $4, $5) RETURNING id',
  },
  {
    nama: 'hapus predikat status di reject service',
    file: 'services/validationService.js',
    dari: "WHERE id=$3 AND status='pending'\`, [userId, catatan, id]);",
    menjadi: "WHERE id=$3`, [userId, catatan, id]);",
  },
  {
    nama: 'reject mengabaikan rowCount',
    file: 'services/validationService.js',
    dari: 'return r.rowCount > 0;',
    menjadi: 'return true;',
  },
  {
    nama: 'role finance diganti requireAuth',
    file: 'features/purchase-order/backend/routes.js',
    dari: "router.post('/:id/validate', requireAuth, requireRole('finance'), validateToken,",
    menjadi: "router.post('/:id/validate', requireAuth, validateToken,",
  },
  {
    nama: 'alasan penolakan tidak divalidasi',
    file: 'features/purchase-order/backend/routes.js',
    dari: "if (typeof catatan !== 'string' || catatan.trim() === '') {",
    menjadi: 'if (false) {',
  },
  {
    nama: '409 diganti 200 pada validasi ganda',
    file: 'features/purchase-order/backend/routes.js',
    dari: `      return res.status(409).json({
        ok: false,
        error: refusalReason('divalidasi', await statusSekarang(id)),
      });`,
    menjadi: `      return res.json({ ok: true, data: await readOne(id) });`,
  },
  {
    // Menjaga agar urutan pengecekan tidak dibalik: 404 harus menang atas
    // 400 pada endpoint tolak. Mutan ini memindahkan validasi alasan ke
    // sebelum pengecekan keberadaan PO.
    nama: 'validasi alasan didahulukan sebelum cek keberadaan PO',
    file: 'features/purchase-order/backend/routes.js',
    dari: `    if (!(await cekPoAda(id))) {
      return res.status(404).json({ ok: false, error: 'Purchase order tidak ditemukan' });
    }

    // Alasan WAJIB, bukan opsional.`,
    menjadi: `    // Alasan WAJIB, bukan opsional.`,
  },
];

// Menilai dari KELUARAN, bukan dari exit code yang tidak bisa dibedakan.
// Jest menulis "Tests:       N failed" ke stderr/stdout; pola itu yang
// dicari. Exit code saja tidak cukup: kegagalan menjalankan jest (npx tidak
// ketemu, argumen salah) juga memberi exit code bukan nol, dan akan salah
// dibaca sebagai "mutan mati" — padahal testnya tidak pernah dijalankan.
const jalankan = () => {
  const isWin = process.platform === 'win32';
  const r = require('child_process').spawnSync(
    isWin ? 'npx.cmd' : 'npx',
    ['jest', 'tests/purchaseOrdersApi.test.js', '-t', 'validate'],
    { cwd: ROOT, encoding: 'utf8', shell: isWin }
  );
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  // Baris ringkasannya "Tests:   N skipped, M passed, T total" dan hanya
  // menyebut "failed" kalau ada yang gagal — jadi ketiadaan kata "failed"
  // justru tanda lulus. Regex lama mencari "failed" dan selalu gagal pada
  // run yang hijau, membaca semuanya sebagai "tidak terbaca".
  const m = out.match(/Tests:\s+(.*)$/m);
  if (!m) {
    // Tidak ada baris "Tests:" sama sekali = jest tidak berjalan.
    console.error('  [PERINGATAN] jest tidak menghasilkan ringkasan; stdout:');
    console.error(out.slice(-500));
    return null;
  }
  const gagal = m[1].match(/(\d+)\s+failed/);
  return gagal ? false : true;   // true = hijau
};

const main = () => {
  console.log('Menjalankan baseline (kode asli)…');
  const baseline = jalankan();
  console.log(`Baseline: ${baseline === null ? 'TIDAK TERBACA' : baseline ? 'HIJAU' : 'MERAH'}\n`);
  if (baseline !== true) {
    console.error('Baseline tidak hijau — hentikan, mutasi tidak bisa dinilai.');
    process.exit(1);
  }

  const hasil = [];
  for (const m of MUTAN) {
    const p = path.join(ROOT, m.file);
    const asli = fs.readFileSync(p, 'utf8');
    if (!asli.includes(m.dari)) {
      hasil.push({ ...m, status: 'TEKS TIDAK DITEMUKAN' });
      continue;
    }
    fs.writeFileSync(p, asli.replace(m.dari, m.menjadi), 'utf8');
    const hijau = jalankan();
    fs.writeFileSync(p, asli, 'utf8');   // pulihkan
    hasil.push({
      ...m,
      status: hijau === null ? 'TIDAK TERBACA' : hijau ? 'LOLOS (test lemah!)' : 'mati (bagus)',
    });
    const pulih = fs.readFileSync(p, 'utf8');
    if (pulih !== asli) {
      console.error(`GAGAL memulihkan ${m.file} — hentikan.`);
      process.exit(1);
    }
  }

  console.log('=== Hasil mutasi ===');
  for (const h of hasil) {
    console.log(`${h.status.padEnd(22)} ${h.nama}`);
  }
  const lolos = hasil.filter((h) => h.status.startsWith('LOLOS') || h.status.includes('TIDAK'));
  console.log(`\n${hasil.length - lolos.length}/${hasil.length} mutan mati.`);
  if (lolos.length > 0) process.exit(1);
};

main();
