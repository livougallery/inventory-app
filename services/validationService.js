const db = require('../db');
const StockService = require('./stockService');
const FifoService = require('./fifoService');
const HppService = require('./hppService');

const ValidationService = {
  async approvePurchaseOrder(id, userId) {
    await db.run("UPDATE purchase_orders SET status='validated', validated_by=$1, validated_at=CURRENT_TIMESTAMP WHERE id=$2", [userId, id]);
    // FIFO: create batches + movement entries (also handles stock increment)
    await FifoService.createBatchFromPO(id);
  },
  async rejectPurchaseOrder(id, userId, catatan) {
    await db.run("UPDATE purchase_orders SET status='rejected', validated_by=$1, validated_at=CURRENT_TIMESTAMP, catatan_reject=$2 WHERE id=$3", [userId, catatan, id]);
  },
  async approveProductionCost(id, userId) {
    const cost = await db.one("SELECT * FROM production_costs WHERE id = $1", [id]);
    if (!cost) return false;
    await db.run("UPDATE production_costs SET status_validasi='validated', validated_by=$1, validated_at=CURRENT_TIMESTAMP WHERE id=$2", [userId, id]);
    await HppService.calculateFromBatch(cost.batch_id);
    return true;
  },
  async rejectProductionCost(id, userId, catatan) {
    await db.run("UPDATE production_costs SET status_validasi='rejected', validated_by=$1, validated_at=CURRENT_TIMESTAMP, keterangan=$2 WHERE id=$3", [userId, catatan, id]);
  },
  async approvePurchaseImport(id, userId) {
    await db.run("UPDATE purchase_imports SET status='validated', validated_by=$1, validated_at=CURRENT_TIMESTAMP WHERE id=$2", [userId, id]);
    await StockService.addFromPurchaseImport(id);
    await HppService.calculateFromImport(id);
  },
  async rejectPurchaseImport(id, userId, catatan) {
    await db.run("UPDATE purchase_imports SET status='rejected', validated_by=$1, validated_at=CURRENT_TIMESTAMP, catatan_reject=$2 WHERE id=$3", [userId, catatan, id]);
  }
};

module.exports = ValidationService;
