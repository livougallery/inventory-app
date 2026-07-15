const db = require('../db');
const StockService = require('./stockService');
const FifoService = require('./fifoService');
const HppService = require('./hppService');

const ValidationService = {
  approvePurchaseOrder(id, userId) {
    const tx = db.transaction(() => {
      db.prepare("UPDATE purchase_orders SET status='validated', validated_by=?, validated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(userId, id);
      // Existing legacy: bump raw_materials.stok (kept for backward compat with UI that reads it)
      StockService.addFromPurchaseOrder(id);
      // NEW: create FIFO batches + movement entries
      FifoService.createBatchFromPO(id);
    });
    tx();
  },
  rejectPurchaseOrder(id, userId, catatan) {
    db.prepare("UPDATE purchase_orders SET status='rejected', validated_by=?, validated_at=CURRENT_TIMESTAMP, catatan_reject=? WHERE id=?")
      .run(userId, catatan, id);
  },
  approveProductionCost(id, userId) {
    const cost = db.prepare("SELECT * FROM production_costs WHERE id = ?").get(id);
    if (!cost) return false;
    db.prepare("UPDATE production_costs SET status_validasi='validated', validated_by=?, validated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(userId, id);
    HppService.calculateFromBatch(cost.batch_id);
    return true;
  },
  rejectProductionCost(id, userId, catatan) {
    db.prepare("UPDATE production_costs SET status_validasi='rejected', validated_by=?, validated_at=CURRENT_TIMESTAMP, keterangan=? WHERE id=?")
      .run(userId, catatan, id);
  },
  approvePurchaseImport(id, userId) {
    db.prepare("UPDATE purchase_imports SET status='validated', validated_by=?, validated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(userId, id);
    StockService.addFromPurchaseImport(id);
    HppService.calculateFromImport(id);
  },
  rejectPurchaseImport(id, userId, catatan) {
    db.prepare("UPDATE purchase_imports SET status='rejected', validated_by=?, validated_at=CURRENT_TIMESTAMP, catatan_reject=? WHERE id=?")
      .run(userId, catatan, id);
  }
};

module.exports = ValidationService;
