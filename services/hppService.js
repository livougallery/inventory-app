const db = require('../db');

const HppService = {
  calculateFromBatch(batchId) {
    const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(batchId);
    if (!batch) return;

    const costs = db.prepare("SELECT * FROM production_costs WHERE batch_id = ? AND status_validasi = 'validated'").all(batchId);
    if (!costs.length) return;

    const costsByVariant = {};
    for (const c of costs) {
      const key = c.variant_id || '';
      if (!costsByVariant[key]) costsByVariant[key] = [];
      costsByVariant[key].push(c);
    }

    const nonSpecificCosts = costsByVariant[''] || [];
    const totalNonSpesifik = nonSpecificCosts.reduce((s, c) => s + c.biaya, 0);
    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(batch.product_id);

    for (const variant of variants) {
      const key = String(variant.id);
      const variantCosts = costsByVariant[key] || [];
      const specificBiaya = variantCosts.reduce((s, c) => s + c.biaya, 0);

      const kain = variantCosts.filter(c => c.tipe_biaya === 'kain').reduce((s, c) => s + c.biaya, 0);
      const aksesoris = variantCosts.filter(c => c.tipe_biaya === 'aksesoris').reduce((s, c) => s + c.biaya, 0);
      const jahit = variantCosts.filter(c => c.tipe_biaya === 'jahit').reduce((s, c) => s + c.biaya, 0);
      const lain = variantCosts.filter(c => ['kirim_aksesoris', 'others'].includes(c.tipe_biaya)).reduce((s, c) => s + c.biaya, 0);

      const qtyV = db.prepare('SELECT COALESCE(SUM(qty_datang),0) as total FROM production_deliveries WHERE batch_id=? AND variant_id=?').get(batchId, variant.id).total;
      const qtyTotal = Math.max(batch.jumlah_selesai, 1);

      const prop = qtyV / qtyTotal;
      const tk = nonSpecificCosts.filter(c => c.tipe_biaya === 'kain').reduce((s, c) => s + c.biaya, 0) * prop;
      const ta = nonSpecificCosts.filter(c => c.tipe_biaya === 'aksesoris').reduce((s, c) => s + c.biaya, 0) * prop;
      const tj = nonSpecificCosts.filter(c => c.tipe_biaya === 'jahit').reduce((s, c) => s + c.biaya, 0) * prop;
      const tl = nonSpecificCosts.filter(c => ['kirim_aksesoris', 'others'].includes(c.tipe_biaya)).reduce((s, c) => s + c.biaya, 0) * prop;

      const totalBiaya = specificBiaya + (totalNonSpesifik * prop);
      const hppTotal = qtyV > 0 ? totalBiaya / qtyV : 0;
      const qtySafe = Math.max(qtyV, 1);

      db.prepare(`INSERT INTO hpp_history (variant_id, sumber, sumber_id, komponen_kain, komponen_aksesoris, komponen_jahit, komponen_lain, hpp_total) VALUES (?, 'produksi', ?, ?, ?, ?, ?, ?)`)
        .run(variant.id, batchId, (kain + tk) / qtySafe, (aksesoris + ta) / qtySafe, (jahit + tj) / qtySafe, (lain + tl) / qtySafe, hppTotal);

      const oldHpp = variant.hpp_saat_ini;
      const oldStok = variant.stok;
      const newStok = qtyV;
      if (oldStok + newStok > 0) {
        const avgHpp = ((oldHpp * oldStok) + (hppTotal * newStok)) / (oldStok + newStok);
        db.prepare('UPDATE product_variants SET hpp_saat_ini = ? WHERE id = ?').run(avgHpp, variant.id);
      }
    }
  },

  calculateFromImport(importId) {
    const imp = db.prepare('SELECT * FROM purchase_imports WHERE id = ?').get(importId);
    if (!imp) return;

    db.prepare(`INSERT INTO hpp_history (variant_id, sumber, sumber_id, komponen_kain, komponen_aksesoris, komponen_jahit, komponen_lain, hpp_total) VALUES (?, 'beli_jadi', ?, 0, 0, 0, ?, ?)`)
      .run(imp.variant_id, importId, imp.hpp_per_item, imp.hpp_per_item);

    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(imp.variant_id);
    if (variant) {
      const oldStok = Math.max(variant.stok - imp.qty, 0);
      if (oldStok + imp.qty > 0) {
        const avg = ((variant.hpp_saat_ini * oldStok) + (imp.hpp_per_item * imp.qty)) / (oldStok + imp.qty);
        db.prepare('UPDATE product_variants SET hpp_saat_ini = ? WHERE id = ?').run(avg, imp.variant_id);
      }
    }
  }
};

module.exports = HppService;
