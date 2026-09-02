// Mutasi test untuk tiket 07 (ubah & hapus PO).
//
// Pola WAJIB baseline sebelum + sesudah tiap mutasi, dari pelajaran tiket 06:
// tanpa itu, suite yang crash dilaporkan sebagai "terbunuh" dan bisa menutupi
// celah sungguhan pada test.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PO = path.join(ROOT, 'features/purchase-order/backend/routes.js');
const SUITE = 'tests/purchaseOrdersApi.test.js';

const CASES = [
  // Penjaga status adalah inti tiket ini. Kalau penjaganya longgar, PO yang
  // sudah divalidasi bisa diubah dan stok jadi tidak bisa direkonsiliasi.
  ['penjaga status ubah dilonggar (semua status boleh)',
    "  if (po.status !== EDITABLE_STATUS) {\n    return {\n      ok: false,\n      status: 409,\n      error: 'Purchase order tidak bisa diubah lagi karena barangnya sudah tercatat di stok',\n    };\n  }",
    "  if (false) {\n    return {\n      ok: false,\n      status: 409,\n      error: 'Purchase order tidak bisa diubah lagi karena barangnya sudah tercatat di stok',\n    };\n  }"],

  ['penjaga status hapus dilonggar (semua status boleh)',
    "  if (po.status !== EDITABLE_STATUS) {\n    return {\n      ok: false,\n      status: 409,\n      error: 'Purchase order tidak bisa dihapus lagi karena barangnya sudah tercatat di stok',\n    };\n  }",
    "  if (false) {\n    return {\n      ok: false,\n      status: 409,\n      error: 'Purchase order tidak bisa dihapus lagi karena barangnya sudah tercatat di stok',\n    };\n  }"],

  // 409 -> 400: kode statusnya adalah bagian dari kontrak tiket.
  ['penjaga status menjawab 400, bukan 409',
    "      status: 409,\n      error: 'Purchase order tidak bisa diubah lagi",
    "      status: 400,\n      error: 'Purchase order tidak bisa diubah lagi"],

  // Item diganti sebagai set. Tanpa DELETE, item laha menumpuk.
  ['item lama tidak dihapus saat ubah (menumpuk)',
    "      await tx.query(\n        'DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [id]\n      );",
    "      // (mutasi) penghapusan item lama dilewati"],

  // Subtotal server: kalau nilai klien dipercaya, total PO bisa dimanipulasi.
  ['subtotal ubah ambil dari klien',
    'subtotal: qty * hargaSatuan,',
    'subtotal: Number(raw.subtotal) || 0,'],

  // Header dan item harus satu transaksi.
  ['ubah tanpa transaksi (header dan item terpisah)',
    '    await db.transaction(async (tx) => {\n      await tx.query(\n        `UPDATE purchase_orders',
    '    await (async (tx) => {\n      await tx.query(\n        `UPDATE purchase_orders'],

  // Penjaga tipe item: tanpa ini items: [null] -> 500.
  ['penjaga tipe item dimatikan',
    "    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {",
    '    if (false) {'],

  // id tidak valid -> 404, bukan 500.
  ['id PUT tidak divalidasi',
    '  const id = parseId(req.params.id);\n  if (id === null) {\n    return res.status(404).json({ ok: false, error: \'Purchase order tidak ditemukan\' });\n  }\n\n  const parsed = validateCreatePayload(req.body || {});',
    '  const id = Number(req.params.id);\n\n  const parsed = validateCreatePayload(req.body || {});'],

  // Penjaga keamanan: jangan sampai hilang tanpa ketahuan.
  ['PUT tanpa penjaga CSRF',
    "router.put('/:id', requireAuth, validateToken,",
    "router.put('/:id', requireAuth,"],

  ['DELETE tanpa penjaga auth',
    "router.delete('/:id', requireAuth, validateToken,",
    "router.delete('/:id', validateToken,"],
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

const strip = (s) => s.replace(/\[[0-9;]*m/g, '');
const gagal = (out) => {
  const m = strip(out).match(/Tests:\s+(\d+) failed/);
  return m ? Number(m[1]) : 0;
};
const names = (out) => [...new Set(
  [...strip(out).matchAll(/●\s+(.+?)(?:\r?\n)/g)]
    .map((m) => m[1].trim())
    .filter((n) => n.includes('›') && !n.startsWith('Console'))
)];

(async () => {
  console.log('=== Baseline (kode utuh) ===');
  restore();
  const pre = run();
  if (!pre.ok) {
    console.log(`MERAH (${gagal(pre.out)} gagal) — hentikan, keadaan tidak sehat`);
    names(pre.out).forEach((n) => console.log('  -', n));
    process.exit(1);
  }
  console.log('HIJAU\n');

  let mati = 0;
  let hidup = 0;
  let tidakSah = 0;

  for (const [label, from, to] of CASES) {
    if (!original.includes(from)) {
      console.log(`SKIP   ${label}  (pola tidak ditemukan)`);
      continue;
    }

    fs.writeFileSync(PO, original.replace(from, to));
    const r = run();

    restore();
    const post = run();

    if (!r.ok && post.ok) {
      mati += 1;
      console.log(`MATI   ${label}  (${gagal(r.out)} test gagal)`);
      names(r.out).slice(0, 4).forEach((n) => console.log(`         - ${n.replace('JSON API /api/purchase-orders › ', '')}`));
    } else if (r.ok) {
      hidup += 1;
      console.log(`HIDUP  ${label}  <<< TEST TIDAK MENGUJI INI`);
    } else {
      tidakSah += 1;
      console.log(`TIDAK SAH  ${label}  (baseline sesudah ikut merah — gangguan DB, diulang nanti)`);
    }
  }

  restore();
  console.log('\n=== Ringkasan ===');
  console.log(`  terbunuh (MATI)   : ${mati}`);
  console.log(`  lolos (HIDUP)     : ${hidup}`);
  console.log(`  tidak sah         : ${tidakSah}`);

  const final = run();
  console.log(`\n=== Verifikasi restore ===`);
  console.log(final.ok ? 'HIJAU — kode kembali utuh' : `MERAH — PERIKSA FILE (${gagal(final.out)} gagal)`);
})();
