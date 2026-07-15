const db = require('../db');

const FIFO = {
  // Called when PO is validated: create batch + 'masuk' movement per item
  createBatchFromPO(purchaseOrderId) {
    const tx = db.transaction(() => {
      const items = db.prepare(`
        SELECT poi.*, po.tgl_beli
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.purchase_order_id
        WHERE poi.purchase_order_id = ?
      `).all(purchaseOrderId);

      const batchInsert = db.prepare(`
        INSERT INTO material_batches (raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk)
        VALUES (?, 'po', ?, ?, ?, ?, ?)
      `);
      const moveInsert = db.prepare(`
        INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
        VALUES (?, 'masuk', ?, ?, 'po', ?, ?, ?)
      `);
      const stockUpd = db.prepare('UPDATE raw_materials SET stok = stok + ? WHERE id = ?');

      for (const item of items) {
        const r = batchInsert.run(item.raw_material_id, purchaseOrderId, item.qty, item.qty, item.harga_satuan, item.tgl_beli);
        const batchId = r.lastInsertRowid;
        moveInsert.run(item.raw_material_id, item.qty, batchId, purchaseOrderId, item.tgl_beli, `PO #${purchaseOrderId}`);
        stockUpd.run(item.qty, item.raw_material_id);
      }
    });
    tx();
  },

  // FIFO deduction: returns details of batches touched
  // Returns array: [{batchId, qty, tgl_masuk, harga_satuan}]
  deductFifo(rawMaterialId, qtyNeeded, refType = 'production', refId = null) {
    const used = [];
    const tx = db.transaction(() => {
      // Lock + read oldest first
      const batches = db.prepare(`
        SELECT * FROM material_batches
        WHERE raw_material_id = ? AND qty_sisa > 0
        ORDER BY tgl_masuk ASC, id ASC
      `).all(rawMaterialId);

      let remaining = qtyNeeded;
      const updBatch = db.prepare('UPDATE material_batches SET qty_sisa = qty_sisa - ? WHERE id = ?');
      const updStock = db.prepare('UPDATE raw_materials SET stok = stok - ? WHERE id = ?');
      const moveInsert = db.prepare(`
        INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
        VALUES (?, 'keluar', ?, ?, ?, ?, DATE('now'), ?)
      `);

      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, b.qty_sisa);
        updBatch.run(take, b.id);
        moveInsert.run(rawMaterialId, take, b.id, refType, refId, `FIFO consume batch #${b.id}`);
        used.push({ batchId: b.id, qty: take, tgl_masuk: b.tgl_masuk, harga_satuan: b.harga_satuan });
        remaining -= take;
      }

      if (remaining > 0) {
        // Shortfall — record as adjustment warning (qty 0 movement)
        throw new Error(`Stok tidak cukup untuk material #${rawMaterialId}: kurang ${remaining}`);
      }

      updStock.run(qtyNeeded, rawMaterialId);
    });
    tx();
    return used;
  },

  // Manual adjustment (positive or negative)
  recordAdjustment(rawMaterialId, qtyDelta, userId, keterangan = '') {
    const tx = db.transaction(() => {
      const type = qtyDelta >= 0 ? 'masuk' : 'keluar';
      const absQty = Math.abs(qtyDelta);
      db.prepare(`
        INSERT INTO stock_movements (raw_material_id, movement_type, qty, ref_type, ref_id, tgl, keterangan, created_by)
        VALUES (?, ?, ?, 'manual', NULL, DATE('now'), ?, ?)
      `).run(rawMaterialId, type, absQty, keterangan, userId);
      db.prepare('UPDATE raw_materials SET stok = stok + ? WHERE id = ?').run(qtyDelta, rawMaterialId);
    });
    tx();
  },

  // List batches (oldest first) for stock card display
  getBatchesForMaterial(rawMaterialId) {
    return db.prepare(`
      SELECT * FROM material_batches
      WHERE raw_material_id = ?
      ORDER BY tgl_masuk ASC, id ASC
    `).all(rawMaterialId);
  },

  // Stock = SUM batch.qty_sisa — replaces direct raw_materials.stok reads in UI
  getStockForMaterial(rawMaterialId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(qty_sisa),0) AS qty_sisa_total, COUNT(*) AS batch_count
      FROM material_batches WHERE raw_material_id = ?
    `).get(rawMaterialId);
    return row;
  }
};

module.exports = FIFO;