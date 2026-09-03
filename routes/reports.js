const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

// Peta label tipe material dipinjam dari fitur material, bukan ditulis
// ulang di sini. Tiket 10 melarang peta label kedua: dua peta pasti drift.
// Sebelumnya view ini menuliskan "Ecer" sendiri sementara API mengirim
// "Kain (Ecer)" untuk nilai yang sama.
const { TIPE_LABEL } = require('../features/material/backend/routes');

router.get('/stock-card', isAuthenticated, async (req, res) => {
  const materials = (await db.query('SELECT * FROM raw_materials ORDER BY nama')).rows;
  // Label dihitung di route supaya view tidak perlu merangkainya sendiri.
  for (const m of materials) {
    m.tipe_label = TIPE_LABEL[m.tipe] || m.tipe;
  }
  const materialId = req.query.raw_material_id ? parseInt(req.query.raw_material_id) : (materials[0] ? materials[0].id : null);
  const dateFrom = req.query.date_from || null;
  const dateTo = req.query.date_to || null;

  let movements = [];
  let summary = null;
  let selectedMaterial = null;

  if (materialId) {
    selectedMaterial = await db.one('SELECT * FROM raw_materials WHERE id = $1', [materialId]);
    // Label ditambahkan di route, bukan dirangkai di view: view yang
    // merangkai labelnya sendiri itulah sumber inkonsistensi yang
    // ditemukan tiket 10.
    if (selectedMaterial) {
      selectedMaterial.tipe_label = TIPE_LABEL[selectedMaterial.tipe] || selectedMaterial.tipe;
    }

    let sql = `
      SELECT sm.*, mb.tgl_masuk AS batch_tgl, mb.harga_satuan AS batch_harga
      FROM stock_movements sm
      LEFT JOIN material_batches mb ON sm.batch_id = mb.id
      WHERE sm.raw_material_id = $1
    `;
    let paramIdx = 1;
    const params = [materialId];
    if (dateFrom) { paramIdx++; sql += ` AND sm.tgl >= $${paramIdx}`; params.push(dateFrom); }
    if (dateTo) { paramIdx++; sql += ` AND sm.tgl <= $${paramIdx}`; params.push(dateTo); }
    sql += ' ORDER BY sm.tgl ASC, sm.id ASC';
    movements = (await db.query(sql, params)).rows;

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

router.get('/monthly-expenses', isAuthenticated, async (req, res) => {
  const bulan = req.query.bulan || (new Date().getMonth() + 1).toString();
  const tahun = req.query.tahun || new Date().getFullYear().toString();
  const mm = bulan.padStart(2, '0');

  const poExpense = await db.one(`
    SELECT COALESCE(SUM(poi.subtotal), 0)::real as total
    FROM purchase_orders po
    JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
    WHERE po.status = 'validated' AND to_char(po.tgl_beli::date, 'MM') = $1 AND to_char(po.tgl_beli::date, 'YYYY') = $2
  `, [mm, tahun]);

  const prodExpense = await db.one(`
    SELECT COALESCE(SUM(biaya), 0)::real as total
    FROM production_costs
    WHERE status_validasi = 'validated' AND to_char(created_at, 'MM') = $1 AND to_char(created_at, 'YYYY') = $2
  `, [mm, tahun]);

  const importExpense = await db.one(`
    SELECT COALESCE(SUM(hpp_per_item * qty), 0)::real as total
    FROM purchase_imports
    WHERE status = 'validated' AND to_char(tgl_beli::date, 'MM') = $1 AND to_char(tgl_beli::date, 'YYYY') = $2
  `, [mm, tahun]);

  const komponen = (await db.query(`
    SELECT tipe_biaya, SUM(biaya)::real as total
    FROM production_costs
    WHERE status_validasi = 'validated' AND to_char(created_at, 'MM') = $1 AND to_char(created_at, 'YYYY') = $2
    GROUP BY tipe_biaya
  `, [mm, tahun])).rows;

  const filterTipe = req.query.tipe_biaya || null;
  let detailCosts = [];
  if (filterTipe) {
    detailCosts = (await db.query(`
      SELECT pc.id, pc.biaya, pc.tipe_biaya, pc.created_at, pb.nama_batch
      FROM production_costs pc
      LEFT JOIN production_batches pb ON pc.batch_id = pb.id
      WHERE pc.status_validasi = 'validated' AND pc.tipe_biaya = $1
        AND to_char(pc.created_at, 'MM') = $2 AND to_char(pc.created_at, 'YYYY') = $3
      ORDER BY pc.created_at DESC
    `, [filterTipe, mm, tahun])).rows;
  }

  res.render('reports/monthly-expenses', {
    title: 'Pengeluaran Bulanan', bulan, tahun,
    poExpense: (poExpense && poExpense.total) || 0, prodExpense: (prodExpense && prodExpense.total) || 0,
    importExpense: (importExpense && importExpense.total) || 0, komponen,
    detailCosts, filterTipe, error: null
  });
});

module.exports = router;
