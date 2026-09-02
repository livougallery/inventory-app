// Ulangi tiga mutasi yang hasilnya mencurigakan: 42, 67, 67 test gagal.
//
// Dua perbaikan dari mutate-diagnose.js:
//
// 1. SEBELUM dan SESUDAH tiap mutasi dijalankan baseline (kode utuh). Kalau
//    baseline ikut merah, hasil mutasi dibuang sebagai gangguan database —
//    tanpa ini, flake dilaporkan sebagai "terbunuh" dan menutupi celah
//    sungguhan pada test.
// 2. Dua percobaan per mutasi. Mutasi yang benar-benar terbunuh akan gagal
//    konsisten; flake tidak.
//
// Hanya menjalankan satu suite (purchaseOrders) agar lebih cepat dan
// kemungkinan bentrokan koneksi lebih kecil. Semua mutasi di bawah mutasi
// pada rute POST, jadi suite inilah yang semestinya menggigit.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PO = path.join(ROOT, 'features/purchase-order/backend/routes.js');
const SUITE = 'tests/purchaseOrdersApi.test.js';

const CASES = [
  ['hapus transaksi',
    'const created = await db.transaction(async (tx) => {',
    'const created = await (async (tx) => {'],
  ['hapus validasi qty',
    '    if (!isPositiveNumber(qty) || qty <= 0) {',
    '    if (false) {'],
  ['currency_id tidak divalidasi',
    '    if (currencyId !== null) {',
    '    if (false) {'],
];

const original = fs.readFileSync(PO, 'utf8');
const restore = () => fs.writeFileSync(PO, original);

const run = () => {
  try {
    execSync(`npx jest ${SUITE}`, { cwd: ROOT, stdio: 'pipe', timeout: 600000 });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '') };
  }
};

const gagal = (out) => {
  const m = out.match(/Tests:\s+(\d+) failed/);
  return m ? Number(m[1]) : 0;
};

// Ambil baris error yang bukan sekadar nama test — untuk melihat apakah
// kegagalannya karena assertion atau karena koneksi database putus.
const reason = (out) => {
  const lines = out.split('\n');
  const hit = lines.filter((l) => /ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout exceeded|connection|terminating|pool|ENOTFOUND|too many clients|no more connections/i.test(l));
  if (hit.length) return `DB: ${hit[0].trim().slice(0, 120)}`;
  const assert = lines.find((l) => /Expected|Received|toHaveProperty|Expected status/.test(l));
  return assert ? `ASSERT: ${assert.trim().slice(0, 120)}` : '(tidak dikenal)';
};

(async () => {
  for (const [label, from, to] of CASES) {
    console.log(`\n### ${label}`);

    if (!original.includes(from)) {
      console.log('  SKIP: pola tidak ditemukan di file sumber');
      continue;
    }

    for (const attempt of [1, 2]) {
      // Baseline SEBELUM: kalau ini merah, keadaan sedang tidak sehat.
      restore();
      const pre = run();
      if (!pre.ok) {
        console.log(`  percobaan ${attempt}: BASELINE SEBELUM merah (${gagal(pre.out)} gagal) → ${reason(pre.out)}`);
        console.log('  hasil dibuang: gangguan database, bukan bukti');
        continue;
      }

      // Mutasi diterapkan.
      fs.writeFileSync(PO, original.replace(from, to));
      const r = run();
      const n = gagal(r.out);

      // Baseline SESUDAH: membuktikan kode utuh kembali hijau.
      restore();
      const post = run();

      const putusan = !r.ok && n > 0 && post.ok
        ? 'TERBUNUH — bukti nyata (kode utuh tetap hijau)'
        : r.ok
          ? 'LOLOS — celah pada test'
          : 'TIDAK SAH — baseline sesudah ikut merah';

      console.log(`  percobaan ${attempt}: mutasi ${r.ok ? 'HIJAU' : `MERAH (${n} gagal)`} | baseline sesudah ${post.ok ? 'HIJAU' : 'MERAH'} → ${putusan}`);
      if (!r.ok) console.log(`    alasan: ${reason(r.out)}`);
    }
  }

  restore();
  console.log('\n=== Verifikasi akhir ===');
  const final = run();
  console.log(final.ok ? 'HIJAU — file sumber kembali utuh' : `MERAH — PERIKSA FILE (${gagal(final.out)} gagal)`);
})();
