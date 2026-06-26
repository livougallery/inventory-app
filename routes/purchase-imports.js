const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/', isAuthenticated, (req, res) => {
  const imports = db.prepare(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama, u.username as creator_name
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    LEFT JOIN users u ON pi.created_by = u.id
    ORDER BY pi.created_at DESC
  `).all();
  res.render('purchase-imports/index', { title: 'Pembelian Barang Jadi', imports, error: null });
});

router.get('/create', isAuthenticated, role('admin'), (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE tipe_produksi='beli_jadi' ORDER BY nama_produk").all();
  products.forEach(p => {
    p.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY warna, size').all(p.id);
  });
  const vendors = db.prepare("SELECT * FROM vendors WHERE tipe='import' ORDER BY nama").all();
  res.render('purchase-imports/create', { title: 'Input Pembelian Import', products, vendors, error: null });
});

router.post('/', isAuthenticated, role('admin'), (req, res) => {
  const { variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik } = req.body;
  if (!variant_id || !vendor_id || !tgl_beli || !qty || !harga_produk) {
    return res.redirect('/purchase-imports/create?error=Data tidak lengkap');
  }
  const hpp = (parseFloat(harga_produk) * parseFloat(kurs || 1)) + (parseFloat(logistik || 0) / parseInt(qty));
  db.prepare('INSERT INTO purchase_imports (variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik, hpp_per_item, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs || 1, logistik || 0, hpp, req.session.userId);
  res.redirect('/purchase-imports?success=' + encodeURIComponent('Pembelian dicatat, menunggu validasi Finance'));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const imp = db.prepare(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama, u.username as creator_name, uv.username as validator_name
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    LEFT JOIN users u ON pi.created_by = u.id
    LEFT JOIN users uv ON pi.validated_by = uv.id
    WHERE pi.id = ?
  `).get(req.params.id);
  if (!imp) return res.status(404).send('Pembelian tidak ditemukan');
  res.render('purchase-imports/show', { title: 'Detail Pembelian', imp, error: null });
});

module.exports = router;
