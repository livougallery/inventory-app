const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const StockService = require('../services/stockService');
const { validateToken } = require('../middleware/csrf');

router.get('/', isAuthenticated, (req, res) => {
  const batches = db.prepare(`
    SELECT pb.*, p.nama_produk, v.nama as vendor_nama
    FROM production_batches pb
    LEFT JOIN products p ON pb.product_id = p.id
    LEFT JOIN vendors v ON pb.vendor_id = v.id
    ORDER BY pb.created_at DESC
  `).all();
  res.render('production-batches/index', { title: 'Batch Produksi', batches, error: null });
});

router.get('/create', isAuthenticated, role('admin'), (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE tipe_produksi='sendiri' ORDER BY nama_produk").all();
  const vendors = db.prepare("SELECT * FROM vendors WHERE tipe='produksi' ORDER BY nama").all();
  res.render('production-batches/create', { title: 'Buat Batch Produksi', products, vendors, error: null });
});

router.post('/', isAuthenticated, role('admin'), (req, res) => {
  const { product_id, nama_batch, tgl_mulai, tgl_selesai_est, jenis_produksi, vendor_id, jumlah_dipesan } = req.body;
  if (!product_id || !nama_batch || !tgl_mulai || !jenis_produksi || !jumlah_dipesan) {
    return res.redirect('/production-batches/create?error=Data tidak lengkap');
  }
  db.prepare(`INSERT INTO production_batches (product_id, nama_batch, tgl_mulai, tgl_selesai_est, jenis_produksi, vendor_id, jumlah_dipesan) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(product_id, nama_batch, tgl_mulai, tgl_selesai_est || null, jenis_produksi, vendor_id || null, jumlah_dipesan);
  res.redirect('/production-batches?success=' + encodeURIComponent('Batch produksi berhasil dibuat'));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const batch = db.prepare(`
    SELECT pb.*, p.nama_produk, v.nama as vendor_nama
    FROM production_batches pb
    LEFT JOIN products p ON pb.product_id = p.id
    LEFT JOIN vendors v ON pb.vendor_id = v.id
    WHERE pb.id = ?
  `).get(req.params.id);
  if (!batch) return res.status(404).send('Batch tidak ditemukan');
  batch.costs = db.prepare(`
    SELECT pc.*, rm.nama as material_nama, rm.satuan, pv.warna, pv.size
    FROM production_costs pc
    LEFT JOIN raw_materials rm ON pc.raw_material_id = rm.id
    LEFT JOIN product_variants pv ON pc.variant_id = pv.id
    WHERE pc.batch_id = ? ORDER BY pc.created_at DESC
  `).all(req.params.id);
  batch.deliveries = db.prepare(`
    SELECT pd.*, pv.warna, pv.size
    FROM production_deliveries pd
    LEFT JOIN product_variants pv ON pd.variant_id = pv.id
    WHERE pd.batch_id = ? ORDER BY pd.tgl_datang DESC
  `).all(req.params.id);
  batch.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY warna, size').all(batch.product_id);
  res.render('production-batches/show', { title: batch.nama_batch, batch, error: null });
});

router.get('/:id/add-cost', isAuthenticated, role('admin'), (req, res) => {
  const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).send('Batch tidak ditemukan');
  const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY warna, size').all(batch.product_id);
  const materials = db.prepare('SELECT * FROM raw_materials ORDER BY nama').all();
  res.render('production-batches/add-cost', { title: 'Tambah Biaya Produksi', batch, variants, materials, error: null });
});

router.post('/:id/costs', isAuthenticated, role('admin'), (req, res) => {
  const { variant_id, tipe_biaya, raw_material_id, qty_terpakai, biaya, keterangan } = req.body;
  if (!tipe_biaya || !biaya) {
    return res.redirect(`/production-batches/${req.params.id}/add-cost?error=Data tidak lengkap`);
  }
  const result = db.prepare(`INSERT INTO production_costs (batch_id, variant_id, tipe_biaya, raw_material_id, qty_terpakai, biaya, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, variant_id || null, tipe_biaya, raw_material_id || null, qty_terpakai || null, biaya, keterangan || '');
  // Deduct stock if raw material is used
  if (raw_material_id && qty_terpakai) {
    StockService.deductRawMaterial(raw_material_id, qty_terpakai);
  }
  res.redirect(`/production-batches/${req.params.id}?success=Biaya berhasil dicatat, menunggu validasi Finance`);
});

router.post('/:id/deliveries', isAuthenticated, role('admin'), (req, res) => {
  const { variant_id, tgl_datang, qty_datang, keterangan } = req.body;
  if (!variant_id || !tgl_datang || !qty_datang) {
    return res.redirect(`/production-batches/${req.params.id}?error=Data tidak lengkap`);
  }
  db.prepare('INSERT INTO production_deliveries (batch_id, variant_id, tgl_datang, qty_datang, keterangan) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, variant_id, tgl_datang, qty_datang, keterangan || '');
  // Update batch progress
  const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(req.params.id);
  const newSelesai = (batch.jumlah_selesai || 0) + parseInt(qty_datang);
  const newStatus = newSelesai >= batch.jumlah_dipesan ? 'completed' : 'in_progress';
  db.prepare('UPDATE production_batches SET jumlah_selesai = ?, status = ? WHERE id = ?').run(newSelesai, newStatus, req.params.id);
  // Add stock
  StockService.addFinishedGoodFromDelivery(variant_id, parseInt(qty_datang));
  res.redirect(`/production-batches/${req.params.id}?success=${qty_datang} pcs datang pada ${tgl_datang}`);
});

module.exports = router;
