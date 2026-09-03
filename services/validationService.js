const db = require('../db');
const StockService = require('./stockService');
const FifoService = require('./fifoService');
const HppService = require('./hppService');

const ValidationService = {
  // Mengembalikan `true` kalau PO benar-benar divalidasi, `false` kalau tidak
  // ada baris yang berubah — artinya PO tidak ada, atau statusnya sudah bukan
  // `pending` (sudah divalidasi, ditolak, atau diterima).
  //
  // Nilai balik ini WAJIB diperiksa pemanggil. Mengabaikannya berarti
  // melaporkan "berhasil" untuk permintaan yang tidak melakukan apa-apa —
  // tepat yang terjadi pada halaman validasi EJS sebelum nilai balik ini ada.
  async approvePurchaseOrder(id, userId) {
    // All work (status update + FIFO batches + stock movements) inside one transaction
    return FifoService.createBatchFromPO(id, userId);
  },
  // Predikat `status='pending'` ADA DI UPDATE, dengan alasan yang sama seperti
  // approve: menolak PO yang sudah diputuskan tidak boleh menimpa keputusan
  // itu. rowCount 0 berarti kalah dari permintaan lain yang lebih dulu, atau
  // PO-nya memang tidak ada.
  async rejectPurchaseOrder(id, userId, catatan) {
    const r = await db.run(`UPDATE purchase_orders
      SET status='rejected', validated_by=$1, validated_at=CURRENT_TIMESTAMP, catatan_reject=$2
      WHERE id=$3 AND status='pending'`, [userId, catatan, id]);
    return r.rowCount > 0;
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
