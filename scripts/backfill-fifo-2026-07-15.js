#!/usr/bin/env node
/**
 * Backfill script 2026-07-15 — populate material_batches & stock_movements
 * from existing purchase_order_items where PO is validated/received.
 *
 * Per spec: qty_sisa=0 for backfilled batches (data lama dianggap fully consumed
 * untuk kartu stok baru). Older PO items tetap ada via stock_movements sebagai audit trail.
 *
 * Idempotent via dedup key (raw_material_id, source_type, source_id).
 *
 * Usage: node scripts/backfill-fifo-2026-07-15.js --confirm
 */
const db = require('../db');

if (!process.argv.includes('--confirm')) {
  console.log('Refusing to run without --confirm (this script mutates the DB).');
  console.log('Re-run with: node scripts/backfill-fifo-2026-07-15.js --confirm');
  process.exit(1);
}

console.log('Backfill mulai...');

let batchCreated = 0;
let movementCreated = 0;
let skipped = 0;

const tx = db.transaction(() => {
  // Get all PO items where the PO has been validated or received
  const items = db.prepare(`
    SELECT poi.*, po.tgl_beli, po.status
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.status IN ('validated', 'received')
    ORDER BY po.tgl_beli ASC, poi.id ASC
  `).all();

  for (const item of items) {
    // Dedup check: skip if batch already exists for this (material, source_type, source_id)
    const exists = db.prepare(`
      SELECT 1 FROM material_batches
      WHERE raw_material_id = ? AND source_type = 'po' AND source_id = ?
    `).get(item.raw_material_id, item.purchase_order_id);

    if (exists) {
      skipped++;
      continue;
    }

    const r = db.prepare(`
      INSERT INTO material_batches (raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk)
      VALUES (?, 'po', ?, ?, 0, ?, ?)
    `).run(item.raw_material_id, item.purchase_order_id, item.qty, item.harga_satuan, item.tgl_beli);

    db.prepare(`
      INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
      VALUES (?, 'masuk', ?, ?, 'po', ?, ?, ?)
    `).run(item.raw_material_id, item.qty, r.lastInsertRowid, item.purchase_order_id, item.tgl_beli,
      `[Backfill] PO #${item.purchase_order_id} historical`);

    batchCreated++;
    movementCreated++;
  }

  // Reconcile: log mismatch warning (do NOT auto-fix)
  console.log('\n=== Reconciliation Warning ===');
  const recon = db.prepare(`
    SELECT rm.id, rm.nama, rm.stok AS stok_lama,
           COALESCE((SELECT SUM(qty_sisa) FROM material_batches WHERE raw_material_id = rm.id), 0) AS qty_sisa_total
    FROM raw_materials rm
  `).all();

  let mismatchCount = 0;
  for (const r of recon) {
    if (Math.abs(r.stok_lama - r.qty_sisa_total) > 0.001) {
      console.log(`  [WARN] material #${r.id} (${r.nama}): stok_lama=${r.stok_lama}, qty_sisa_total=${r.qty_sisa_total}, delta=${r.stok_lama - r.qty_sisa_total}`);
      mismatchCount++;
    }
  }
  if (mismatchCount === 0) console.log('  (semua stok match — tidak ada mismatch)');
});

tx();

console.log(`\nSelesai:`);
console.log(`  Batch baru    : ${batchCreated}`);
console.log(`  Movement baru : ${movementCreated}`);
console.log(`  Di-skip (dedup): ${skipped}`);
console.log('\nNOTE: per spec, qty_sisa di-set 0 untuk batch backfill (data lama dianggap fully consumed).');
console.log('Stok akurat saat ini dihitung dari batch BARU + stock movement adjustment manual.');
