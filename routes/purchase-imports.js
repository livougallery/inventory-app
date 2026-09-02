const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/', isAuthenticated, async (req, res) => {
  const imports = (await db.query(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama, u.username as creator_name
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    LEFT JOIN users u ON pi.created_by = u.id
    ORDER BY pi.created_at DESC
  `)).rows;
  res.render('purchase-imports/index', { title: 'White Label', imports, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  const products = (await db.query("SELECT * FROM products WHERE tipe_produksi='beli_jadi' ORDER BY nama_produk")).rows;
  for (const p of products) {
    p.variants = (await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY warna, size', [p.id])).rows;
  }
  const vendors = (await db.query("SELECT * FROM vendors WHERE tipe='import' ORDER BY nama")).rows;
  res.render('purchase-imports/create', { title: 'Input Pembelian White Label', products, vendors, error: null });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik } = req.body;
  if (!variant_id || !vendor_id || !tgl_beli || !qty || !harga_produk) {
    return res.redirect('/purchase-imports/create?error=Data tidak lengkap');
  }
  const hpp = (parseFloat(harga_produk) * parseFloat(kurs || 1)) + (parseFloat(logistik || 0) / parseInt(qty));
  await db.run('INSERT INTO purchase_imports (variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik, hpp_per_item, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
    [variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs || 1, logistik || 0, hpp, req.session.userId]);
  res.redirect('/purchase-imports?success=' + encodeURIComponent('Pembelian dicatat, menunggu validasi Finance'));
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const imp = await db.one(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama, u.username as creator_name, uv.username as validator_name
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    LEFT JOIN users u ON pi.created_by = u.id
    LEFT JOIN users uv ON pi.validated_by = uv.id
    WHERE pi.id = $1
  `, [req.params.id]);
  if (!imp) return res.status(404).send('Pembelian tidak ditemukan');
  res.render('purchase-imports/show', { title: 'Detail Pembelian', imp, error: null });
});

module.exports = router;
