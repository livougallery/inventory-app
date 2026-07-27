const db = require('../db');

const HppService = {
  async calculateFromBatch(batchId) {
    const batch = await db.one('SELECT * FROM production_batches WHERE id = $1', [batchId]);
    if (!batch) return;

    const costsR = await db.query("SELECT * FROM production_costs WHERE batch_id = $1 AND status_validasi = 'validated'", [batchId]);
    const costs = costsR.rows;
    if (!costs.length) return;

    const costsByVariant = {};
    for (const c of costs) {
      const key = c.variant_id || '';
      if (!costsByVariant[key]) costsByVariant[key] = [];
      costsByVariant[key].push(c);
    }

    const nonSpecificCosts = costsByVariant[''] || [];
    const totalNonSpesifik = nonSpecificCosts.reduce((s, c) => s + c.biaya, 0);
    const variantsR = await db.query('SELECT * FROM product_variants WHERE product_id = $1', [batch.product_id]);
    const variants = variantsR.rows;

    for (const variant of variants) {
      const key = String(variant.id);
      const variantCosts = costsByVariant[key] || [];
      const specificBiaya = variantCosts.reduce((s, c) => s + c.biaya, 0);

      const kain = variantCosts.filter(c => c.tipe_biaya === 'kain').reduce((s, c) => s + c.biaya, 0);
      const aksesoris = variantCosts.filter(c => c.tipe_biaya === 'aksesoris').reduce((s, c) => s + c.biaya, 0);
      const jahit = variantCosts.filter(c => c.tipe_biaya === 'jahit').reduce((s, c) => s + c.biaya, 0);
      const lain = variantCosts.filter(c => ['kirim_aksesoris', 'others'].includes(c.tipe_biaya)).reduce((s, c) => s + c.biaya, 0);

      const qtyVR = await db.one('SELECT COALESCE(SUM(qty_datang), 0)::real as total FROM production_deliveries WHERE batch_id=$1 AND variant_id=$2', [batchId, variant.id]);
      const qtyV = qtyVR.total;
      const qtyTotal = Math.max(batch.jumlah_selesai, 1);

      const prop = qtyV / qtyTotal;
      const tk = nonSpecificCosts.filter(c => c.tipe_biaya === 'kain').reduce((s, c) => s + c.biaya, 0) * prop;
      const ta = nonSpecificCosts.filter(c => c.tipe_biaya === 'aksesoris').reduce((s, c) => s + c.biaya, 0) * prop;
      const tj = nonSpecificCosts.filter(c => c.tipe_biaya === 'jahit').reduce((s, c) => s + c.biaya, 0) * prop;
      const tl = nonSpecificCosts.filter(c => ['kirim_aksesoris', 'others'].includes(c.tipe_biaya)).reduce((s, c) => s + c.biaya, 0) * prop;

      const totalBiaya = specificBiaya + (totalNonSpesifik * prop);
      const hppTotal = qtyV > 0 ? totalBiaya / qtyV : 0;
      const qtySafe = Math.max(qtyV, 1);

      await db.run(`INSERT INTO hpp_history (variant_id, sumber, sumber_id, komponen_kain, komponen_aksesoris, komponen_jahit, komponen_lain, hpp_total) VALUES ($1, 'produksi', $2, $3, $4, $5, $6, $7)`,
        [variant.id, batchId, (kain + tk) / qtySafe, (aksesoris + ta) / qtySafe, (jahit + tj) / qtySafe, (lain + tl) / qtySafe, hppTotal]);

      const oldHpp = variant.hpp_saat_ini;
      const oldStok = variant.stok;
      const newStok = qtyV;
      if (oldStok + newStok > 0) {
        const avgHpp = ((oldHpp * oldStok) + (hppTotal * newStok)) / (oldStok + newStok);
        await db.run('UPDATE product_variants SET hpp_saat_ini = $1 WHERE id = $2', [avgHpp, variant.id]);
      }
    }
  },

  async calculateFromImport(importId) {
    const imp = await db.one('SELECT * FROM purchase_imports WHERE id = $1', [importId]);
    if (!imp) return;

    await db.run(`INSERT INTO hpp_history (variant_id, sumber, sumber_id, komponen_kain, komponen_aksesoris, komponen_jahit, komponen_lain, hpp_total) VALUES ($1, 'beli_jadi', $2, 0, 0, 0, $3, $4)`,
      [imp.variant_id, importId, imp.hpp_per_item, imp.hpp_per_item]);

    const variant = await db.one('SELECT * FROM product_variants WHERE id = $1', [imp.variant_id]);
    if (variant) {
      const oldStok = Math.max(variant.stok - imp.qty, 0);
      if (oldStok + imp.qty > 0) {
        const avg = ((variant.hpp_saat_ini * oldStok) + (imp.hpp_per_item * imp.qty)) / (oldStok + imp.qty);
        await db.run('UPDATE product_variants SET hpp_saat_ini = $1 WHERE id = $2', [avg, imp.variant_id]);
      }
    }
  }
};

module.exports = HppService;
