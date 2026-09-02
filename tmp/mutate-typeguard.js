// Bukti bahwa test penjaga tipe benar-benar menggigit: hapus penjaganya,
// dan test `items: [null]` harus gagal.
//
// Memakai pola baseline SEBELUM + SESUDAH dari mutate-retry.js: kalau baseline
// ikut merah, hasilnya dibuang sebagai gangguan database, bukan dilaporkan
// sebagai "terbunuh".
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PO = path.join(ROOT, 'features/purchase-order/backend/routes.js');
const SUITE = 'tests/purchaseOrdersApi.test.js';

const FROM = `    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Format item tidak valid' };
    }`;
const TO = `    if (false) {
      return { ok: false, error: 'Format item tidak valid' };
    }`;

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

// Baris "● ..." bisa terbungkus kode warna ANSI, jadi warna dibuang dulu
// sebelum dicocokkan dengan regex.
const strip = (s) => s.replace(/\[[0-9;]*m/g, '');

const names = (out) => [...new Set(
  [...strip(out).matchAll(/●\s+(.+?)(?:\r?\n)/g)]
    .map((m) => m[1].trim())
    .filter((n) => n.includes('›') && !n.startsWith('Console'))
)];

(async () => {
  if (!original.includes(FROM)) {
    console.log('SKIP: penjaga tipe tidak ditemukan di file sumber');
    console.log('(mungkin tertimpa oleh proses mutasi lain yang sedang berjalan)');
    process.exit(1);
  }

  console.log('=== Baseline (kode utuh) ===');
  restore();
  const pre = run();
  console.log(pre.ok ? 'HIJAU' : `MERAH (${names(pre.out).length} gagal) — hentikan, keadaan tidak sehat`);
  if (!pre.ok) { console.log(names(pre.out).join('\n')); process.exit(1); }

  console.log('\n=== Mutasi: penjaga tipe dimatikan ===');
  fs.writeFileSync(PO, original.replace(FROM, TO));
  const r = run();

  console.log('\n=== Baseline sesudah (kode dipulihkan) ===');
  restore();
  const post = run();

  const putusan = !r.ok && post.ok ? 'TERBUNUH — test menggigit'
    : r.ok ? 'LOLOS — test tidak menguji ini'
      : 'TIDAK SAH — baseline sesudah ikut merah';

  console.log(`\nmutasi ${r.ok ? 'HIJAU' : 'MERAH'} | baseline sesudah ${post.ok ? 'HIJAU' : 'MERAH'}`);
  console.log(`keputusan: ${putusan}`);
  if (!r.ok) {
    console.log('test yang gagal saat penjaga dimatikan:');
    names(r.out).forEach((n) => console.log('  -', n));
  }
})();
