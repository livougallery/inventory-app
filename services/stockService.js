const db = require('../db');

const StockService = {
  async addFromPurchaseOrder(purchaseOrderId) {
    const r = await db.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [purchaseOrderId]);
    const items = r.rows;
    for (const item of items) {
      await db.run('UPDATE raw_materials SET stok = stok + $1 WHERE id = $2', [item.qty, item.raw_material_id]);
    }
  },
  async deductRawMaterial(rawMaterialId, qty) {
    await db.run('UPDATE raw_materials SET stok = stok - $1 WHERE id = $2', [qty, rawMaterialId]);
  },
  async addFinishedGoodFromDelivery(variantId, qty) {
    await db.run('UPDATE product_variants SET stok = stok + $1 WHERE id = $2', [qty, variantId]);
  },
  async addFromPurchaseImport(importId) {
    const imp = await db.one('SELECT * FROM purchase_imports WHERE id = $1', [importId]);
    if (imp) {
      await db.run('UPDATE product_variants SET stok = stok + $1 WHERE id = $2', [imp.qty, imp.variant_id]);
    }
  }
};

module.exports = StockService;
