const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const StockService = require('../services/stockService');
const FifoService = require('../services/fifoService');
const HppFormula = require('../services/hppFormulaService');
const { validateToken } = require('../middleware/csrf');

router.get('/', isAuthenticated, async (req, res) => {
  const batches = (await db.query(`
    SELECT pb.*, p.nama_produk, v.nama as vendor_nama
    FROM production_batches pb
    LEFT JOIN products p ON pb.product_id = p.id
    LEFT JOIN vendors v ON pb.vendor_id = v.id
    ORDER BY pb.created_at DESC
  `)).rows;
  res.render('production-batches/index', { title: 'Batch Produksi', batches, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  const products = (await db.query("SELECT * FROM products WHERE tipe_produksi='sendiri' ORDER BY nama_produk")).rows;
  const vendors = (await db.query("SELECT * FROM vendors WHERE tipe='produksi' ORDER BY nama")).rows;
  res.render('production-batches/create', { title: 'Buat Batch Produksi', products, vendors, error: null });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { product_id, nama_batch, tgl_mulai, tgl_selesai_est, jenis_produksi, vendor_id, jumlah_dipesan } = req.body;
  if (!product_id || !nama_batch || !tgl_mulai || !jenis_produksi || !jumlah_dipesan) {
    return res.redirect('/production-batches/create?error=Data tidak lengkap');
  }
  await db.run(`INSERT INTO production_batches (product_id, nama_batch, tgl_mulai, tgl_selesai_est, jenis_produksi, vendor_id, jumlah_dipesan) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [product_id, nama_batch, tgl_mulai, tgl_selesai_est || null, jenis_produksi, vendor_id || null, jumlah_dipesan]);
  res.redirect('/production-batches?success=' + encodeURIComponent('Batch produksi berhasil dibuat'));
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const batch = await db.one(`
    SELECT pb.*, p.nama_produk, v.nama as vendor_nama
    FROM production_batches pb
    LEFT JOIN products p ON pb.product_id = p.id
    LEFT JOIN vendors v ON pb.vendor_id = v.id
    WHERE pb.id = $1
  `, [req.params.id]);
  if (!batch) return res.status(404).send('Batch tidak ditemukan');
  batch.costs = (await db.query(`
    SELECT pc.*, rm.nama as material_nama, rm.satuan, pv.warna, pv.size
    FROM production_costs pc
    LEFT JOIN raw_materials rm ON pc.raw_material_id = rm.id
    LEFT JOIN product_variants pv ON pc.variant_id = pv.id
    WHERE pc.batch_id = $1 ORDER BY pc.created_at DESC
  `, [req.params.id])).rows;
  batch.deliveries = (await db.query(`
    SELECT pd.*, pv.warna, pv.size
    FROM production_deliveries pd
    LEFT JOIN product_variants pv ON pd.variant_id = pv.id
    WHERE pd.batch_id = $1 ORDER BY pd.tgl_datang DESC
  `, [req.params.id])).rows;
  batch.variants = (await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY warna, size', [batch.product_id])).rows;
  const cfgRow = await db.one('SELECT formula_json FROM hpp_batch_config WHERE batch_id = $1', [req.params.id]);
  batch.formula_json = (cfgRow && cfgRow.formula_json) || '';
  res.render('production-batches/show', { title: batch.nama_batch, batch, error: null });
});

router.get('/:id/add-cost', isAuthenticated, role('admin'), async (req, res) => {
  const batch = await db.one('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
  if (!batch) return res.status(404).send('Batch tidak ditemukan');
  const variants = (await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY warna, size', [batch.product_id])).rows;
  const materials = (await db.query('SELECT * FROM raw_materials ORDER BY nama')).rows;
  res.render('production-batches/add-cost', { title: 'Tambah Biaya Produksi', batch, variants, materials, error: null });
});

router.post('/:id/costs', isAuthenticated, role('admin'), async (req, res) => {
  const { variant_id, tipe_biaya, raw_material_id, qty_terpakai, biaya, keterangan } = req.body;
  if (!tipe_biaya || !biaya) {
    return res.redirect(`/production-batches/${req.params.id}/add-cost?error=Data tidak lengkap`);
  }
  await db.run(`INSERT INTO production_costs (batch_id, variant_id, tipe_biaya, raw_material_id, qty_terpakai, biaya, keterangan) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [req.params.id, variant_id || null, tipe_biaya, raw_material_id || null, qty_terpakai || null, biaya, keterangan || '']);
  // Deduct stock if raw material is used
  if (raw_material_id && qty_terpakai) {
    try {
      await FifoService.deductFifo(raw_material_id, parseFloat(qty_terpakai), 'production', req.params.id);
    } catch (err) {
      return res.redirect(`/production-batches/${req.params.id}/add-cost?error=` + encodeURIComponent(err.message));
    }
  }
  res.redirect(`/production-batches/${req.params.id}?success=Biaya berhasil dicatat, menunggu validasi Finance`);
});

router.post('/:id/deliveries', isAuthenticated, role('admin'), async (req, res) => {
  const { variant_id, tgl_datang, qty_datang, keterangan } = req.body;
  if (!variant_id || !tgl_datang || !qty_datang) {
    return res.redirect(`/production-batches/${req.params.id}?error=Data tidak lengkap`);
  }
  await db.run('INSERT INTO production_deliveries (batch_id, variant_id, tgl_datang, qty_datang, keterangan) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.params.id, variant_id, tgl_datang, qty_datang, keterangan || '']);
  // Update batch progress
  const batch = await db.one('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
  const newSelesai = (batch.jumlah_selesai || 0) + parseInt(qty_datang);
  const newStatus = newSelesai >= batch.jumlah_dipesan ? 'completed' : 'in_progress';
  await db.run('UPDATE production_batches SET jumlah_selesai = $1, status = $2 WHERE id = $3', [newSelesai, newStatus, req.params.id]);
  // Add stock
  await StockService.addFinishedGoodFromDelivery(variant_id, parseInt(qty_datang));
  res.redirect(`/production-batches/${req.params.id}?success=${qty_datang} pcs datang pada ${tgl_datang}`);
});

router.post('/:id/formula', isAuthenticated, role('admin'), validateToken, async (req, res) => {
  const { formula_json } = req.body;
  try {
    JSON.parse(formula_json);  // validate JSON
    await db.run(`INSERT INTO hpp_batch_config (batch_id, formula_json, updated_by)
                VALUES ($1, $2, $3)
                ON CONFLICT(batch_id) DO UPDATE SET formula_json=excluded.formula_json, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`,
      [req.params.id, formula_json, req.session.userId]);
    res.redirect(`/production-batches/${req.params.id}?success=Formula disimpan`);
  } catch (e) {
    res.redirect(`/production-batches/${req.params.id}?error=Formula JSON invalid: ${e.message}`);
  }
});

router.get('/:id/hpp-preview', isAuthenticated, async (req, res) => {
  const batch = await db.one('SELECT * FROM production_batches WHERE id = $1', [req.params.id]);
  if (!batch) return res.status(404).json({ ok:false, error:'Batch tidak ditemukan' });
  const costs = (await db.query("SELECT * FROM production_costs WHERE batch_id = $1 AND status_validasi = 'validated'", [req.params.id])).rows;

  const cfg = await db.one('SELECT * FROM hpp_batch_config WHERE batch_id = $1', [req.params.id]);
  let formulaJson = null;
  let fallbackUsed = false;
  if (cfg) {
    formulaJson = cfg.formula_json;
    const evalResult = HppFormula.evaluate(formulaJson, costs);
    if (!evalResult.ok) { fallbackUsed = true; formulaJson = null; }
  }

  if (!formulaJson) {
    fallbackUsed = true;
    const defTipe = (costs[0] && costs[0].tipe_biaya) || 'kain';
    const def = await db.one('SELECT * FROM hpp_formula_templates WHERE tipe_biaya = $1 AND is_default = 1', [defTipe]);
    formulaJson = def ? def.formula_json : '{"mode":"weighted_avg","fields":["biaya"]}';
  }

  const result = HppFormula.evaluate(formulaJson, costs);
  result.fallback = fallbackUsed;
  result.batch = { id: batch.id, nama: batch.nama_batch };
  res.json(result);
});

module.exports = router;
