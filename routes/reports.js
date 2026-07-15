const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/stock-card', isAuthenticated, (req, res) => {
  const materials = db.prepare('SELECT * FROM raw_materials ORDER BY nama').all();
  const materialId = req.query.raw_material_id ? parseInt(req.query.raw_material_id) : (materials[0] ? materials[0].id : null);
  const dateFrom = req.query.date_from || null;
  const dateTo = req.query.date_to || null;

  let movements = [];
  let summary = null;
  let selectedMaterial = null;

  if (materialId) {
    selectedMaterial = db.prepare('SELECT * FROM raw_materials WHERE id = ?').get(materialId);

    let sql = `
      SELECT sm.*, mb.tgl_masuk AS batch_tgl, mb.harga_satuan AS batch_harga
      FROM stock_movements sm
      LEFT JOIN material_batches mb ON sm.batch_id = mb.id
      WHERE sm.raw_material_id = ?
    `;
    const params = [materialId];
    if (dateFrom) { sql += ' AND sm.tgl >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND sm.tgl <= ?'; params.push(dateTo); }
    sql += ' ORDER BY sm.tgl ASC, sm.id ASC';
    movements = db.prepare(sql).all(...params);

    let bal = 0;
    movements.forEach(m => {
      if (m.movement_type === 'masuk') bal += m.qty;
      else bal -= m.qty;
      m.running_balance = bal;
    });

    summary = {
      total_masuk: movements.filter(m => m.movement_type === 'masuk').reduce((s, m) => s + m.qty, 0),
      total_keluar: movements.filter(m => m.movement_type === 'keluar').reduce((s, m) => s + m.qty, 0),
      current_balance: bal
    };
  }
  res.render('reports/stock-card', { title: 'Kartu Stok', materials, selectedMaterial, materialId, dateFrom, dateTo, movements, summary });
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

  const filterTipe = req.query.tipe_biaya || null;
  let detailCosts = [];
  if (filterTipe) {
    detailCosts = db.prepare(`
      SELECT pc.id, pc.biaya, pc.tipe_biaya, pc.created_at, pb.nama_batch
      FROM production_costs pc
      LEFT JOIN production_batches pb ON pc.batch_id = pb.id
      WHERE pc.status_validasi = 'validated' AND pc.tipe_biaya = ?
        AND strftime('%m', pc.created_at) = ? AND strftime('%Y', pc.created_at) = ?
      ORDER BY pc.created_at DESC
    `).all(filterTipe, bulan.padStart(2, '0'), tahun);
  }

  res.render('reports/monthly-expenses', {
    title: 'Pengeluaran Bulanan', bulan, tahun,
    poExpense: poExpense.total || 0, prodExpense: prodExpense.total || 0,
    importExpense: importExpense.total || 0, komponen,
    detailCosts, filterTipe, error: null
  });
});

module.exports = router;
