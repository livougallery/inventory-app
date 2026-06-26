const db = require('../db');

const StockService = {
  addFromPurchaseOrder(purchaseOrderId) {
    const items = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(purchaseOrderId);
    for (const item of items) {
      db.prepare('UPDATE raw_materials SET stok = stok + ? WHERE id = ?').run(item.qty, item.raw_material_id);
    }
  },
  deductRawMaterial(rawMaterialId, qty) {
    db.prepare('UPDATE raw_materials SET stok = stok - ? WHERE id = ?').run(qty, rawMaterialId);
  },
  addFinishedGoodFromDelivery(variantId, qty) {
    db.prepare('UPDATE product_variants SET stok = stok + ? WHERE id = ?').run(qty, variantId);
  },
  addFromPurchaseImport(importId) {
    const imp = db.prepare('SELECT * FROM purchase_imports WHERE id = ?').get(importId);
    if (imp) {
      db.prepare('UPDATE product_variants SET stok = stok + ? WHERE id = ?').run(imp.qty, imp.variant_id);
    }
  }
};

module.exports = StockService;
