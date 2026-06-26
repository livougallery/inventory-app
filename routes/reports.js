const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/stock-card', isAuthenticated, (req, res) => {
  const materials = db.prepare('SELECT * FROM raw_materials ORDER BY nama').all();
  let selectedMaterial = null;
  let movements = [];

  if (req.query.raw_material_id) {
    const matId = req.query.raw_material_id;
    selectedMaterial = db.prepare('SELECT * FROM raw_materials WHERE id = ?').get(matId);

    const poEntries = db.prepare(`
      SELECT poi.qty as masuk, 0 as keluar, po.tgl_beli as tanggal, po.no_po as ref, 'PO Masuk' as tipe
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.purchase_order_id = po.id
      WHERE poi.raw_material_id = ? AND po.status IN ('validated','received')
    `).all(matId);

    const usage = db.prepare(`
      SELECT 0 as masuk, pc.qty_terpakai as keluar, pb.tgl_mulai as tanggal, pb.nama_batch as ref, 'Pemakaian Produksi' as tipe
      FROM production_costs pc
      JOIN production_batches pb ON pc.batch_id = pb.id
      WHERE pc.raw_material_id = ? AND pc.status_validasi = 'validated'
    `).all(matId);

    movements = [...poEntries, ...usage].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    let saldo = 0;
    movements = movements.map(m => {
      saldo += parseFloat(m.masuk || 0) - parseFloat(m.keluar || 0);
      return { ...m, saldo };
    });
  }

  res.render('reports/stock-card', { title: 'Kartu Stok', materials, selectedMaterial, movements, error: null });
});

router.get('/monthly-expenses', isAuthenticated, (req, res) => {
  const bulan = req.query.bulan || (new Date().getMonth() + 1).toString();
  const tahun = req.query.tahun || new Date().getFullYear().toString();

  const poExpense = db.prepare(`
    SELECT COALESCE(SUM(poi.subtotal), 0) as total
    FROM purchase_orders po
    JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
    WHERE po.status = 'validated' AND strftime('%m', po.tgl_beli) = ? AND strftime('%Y', po.tgl_beli) = ?
  `).get(bulan.padStart(2, '0'), tahun);

  const prodExpense = db.prepare(`
    SELECT COALESCE(SUM(biaya), 0) as total
    FROM production_costs
    WHERE status_validasi = 'validated' AND strftime('%m', created_at) = ? AND strftime('%Y', created_at) = ?
  `).get(bulan.padStart(2, '0'), tahun);

  const importExpense = db.prepare(`
    SELECT COALESCE(SUM(hpp_per_item * qty), 0) as total
    FROM purchase_imports
    WHERE status = 'validated' AND strftime('%m', tgl_beli) = ? AND strftime('%Y', tgl_beli) = ?
  `).get(bulan.padStart(2, '0'), tahun);

  const komponen = db.prepare(`
    SELECT tipe_biaya, SUM(biaya) as total
    FROM production_costs
    WHERE status_validasi = 'validated' AND strftime('%m', created_at) = ? AND strftime('%Y', created_at) = ?
    GROUP BY tipe_biaya
  `).all(bulan.padStart(2, '0'), tahun);

  res.render('reports/monthly-expenses', {
    title: 'Pengeluaran Bulanan', bulan, tahun,
    poExpense: poExpense.total || 0, prodExpense: prodExpense.total || 0,
    importExpense: importExpense.total || 0, komponen, error: null
  });
});

module.exports = router;
