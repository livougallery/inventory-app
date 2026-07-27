const db = require('../db');

const FIFO = {
  // Called when PO is validated: update status + create batch + 'masuk' movement per item
  // All operations in one transaction so PO status and stock stay in sync.
  async createBatchFromPO(purchaseOrderId, userId) {
    await db.transaction(async (tx) => {
      await tx.run("UPDATE purchase_orders SET status='validated', validated_by=$1, validated_at=CURRENT_TIMESTAMP WHERE id=$2", [userId, purchaseOrderId]);
      const r = await tx.query(`
        SELECT poi.*, po.tgl_beli
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.purchase_order_id
        WHERE poi.purchase_order_id = $1
      `, [purchaseOrderId]);
      const items = r.rows;

      for (const item of items) {
        const batchR = await tx.run(`
          INSERT INTO material_batches (raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk)
          VALUES ($1, 'po', $2, $3, $3, $4, $5) RETURNING id
        `, [item.raw_material_id, purchaseOrderId, item.qty, item.harga_satuan, item.tgl_beli]);
        const batchId = batchR.returningId;
        await tx.run(`
          INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
          VALUES ($1, 'masuk', $2, $3, 'po', $4, $5, $6)
        `, [item.raw_material_id, item.qty, batchId, purchaseOrderId, item.tgl_beli, `PO #${purchaseOrderId}`]);
        await tx.run('UPDATE raw_materials SET stok = stok + $1 WHERE id = $2',
          [item.qty, item.raw_material_id]);
      }
    });
  },

  // FIFO deduction: returns details of batches touched
  // Returns array: [{batchId, qty, tgl_masuk, harga_satuan}]
  async deductFifo(rawMaterialId, qtyNeeded, refType = 'production', refId = null) {
    const preview = await this.previewFifo(rawMaterialId, qtyNeeded);
    if (preview.shortfall > 0) {
      throw new Error(`Stok tidak cukup untuk material #${rawMaterialId}: kurang ${preview.shortfall}`);
    }
    await db.transaction(async (tx) => {
      for (const b of preview.used) {
        await tx.run('UPDATE material_batches SET qty_sisa = qty_sisa - $1 WHERE id = $2', [b.qty, b.batchId]);
        await tx.run(`
          INSERT INTO stock_movements (raw_material_id, movement_type, qty, batch_id, ref_type, ref_id, tgl, keterangan)
          VALUES ($1, 'keluar', $2, $3, $4, $5, CURRENT_DATE, $6)
        `, [rawMaterialId, b.qty, b.batchId, refType, refId, `FIFO consume batch #${b.batchId}`]);
      }
      await tx.run('UPDATE raw_materials SET stok = stok - $1 WHERE id = $2', [qtyNeeded, rawMaterialId]);
    });
    return preview.used;
  },

  async previewFifo(rawMaterialId, qtyNeeded) {
    const r = await db.query(`
      SELECT * FROM material_batches
      WHERE raw_material_id = $1 AND qty_sisa > 0
      ORDER BY tgl_masuk ASC, id ASC
    `, [rawMaterialId]);
    const batches = r.rows;
    const used = [];
    let remaining = qtyNeeded;
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, b.qty_sisa);
      used.push({
        batchId: b.id,
        qty: take,
        tgl_masuk: b.tgl_masuk,
        harga_satuan: b.harga_satuan,
        sumber: b.source_type
      });
      remaining -= take;
    }
    const totalCost = used.reduce((s, b) => s + b.qty * b.harga_satuan, 0);
    return { used, totalCost, shortfall: Math.max(0, remaining) };
  },

  // Manual adjustment (positive or negative)
  async recordAdjustment(rawMaterialId, qtyDelta, userId, keterangan = '') {
    await db.transaction(async (tx) => {
      const type = qtyDelta >= 0 ? 'masuk' : 'keluar';
      const absQty = Math.abs(qtyDelta);
      await tx.run(`
        INSERT INTO stock_movements (raw_material_id, movement_type, qty, ref_type, ref_id, tgl, keterangan, created_by)
        VALUES ($1, $2, $3, 'manual', NULL, CURRENT_DATE, $4, $5)
      `, [rawMaterialId, type, absQty, keterangan, userId]);
      await tx.run('UPDATE raw_materials SET stok = stok + $1 WHERE id = $2', [qtyDelta, rawMaterialId]);
    });
  },

  // List batches (oldest first) for stock card display
  async getBatchesForMaterial(rawMaterialId) {
    const r = await db.query(`
      SELECT * FROM material_batches
      WHERE raw_material_id = $1
      ORDER BY tgl_masuk ASC, id ASC
    `, [rawMaterialId]);
    return r.rows;
  },

  // Stock = SUM batch.qty_sisa — replaces direct raw_materials.stok reads in UI
  async getStockForMaterial(rawMaterialId) {
    const row = await db.one(`
      SELECT COALESCE(SUM(qty_sisa), 0)::real AS qty_sisa_total, COUNT(*)::int AS batch_count
      FROM material_batches WHERE raw_material_id = $1
    `, [rawMaterialId]);
    return row || { qty_sisa_total: 0, batch_count: 0 };
  },

  async getAvgPriceForMaterial(rawMaterialId) {
    const row = await db.one(`
      SELECT COALESCE(SUM(qty_sisa * harga_satuan), 0)::real AS total_value,
             COALESCE(SUM(qty_sisa), 0)::real AS total_qty
      FROM material_batches
      WHERE raw_material_id = $1 AND qty_sisa > 0
    `, [rawMaterialId]);
    if (!row || row.total_qty === 0) return null;
    return row.total_value / row.total_qty;
  }
};

module.exports = FIFO;
