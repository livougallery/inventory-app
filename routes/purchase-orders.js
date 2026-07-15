const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/', isAuthenticated, (req, res) => {
  const orders = db.prepare(`
    SELECT po.*, v.nama as vendor_nama, u.username as creator_name,
           (SELECT SUM(subtotal) FROM purchase_order_items WHERE purchase_order_id = po.id) as total
    FROM purchase_orders po
    LEFT JOIN vendors v ON po.vendor_id = v.id
    LEFT JOIN users u ON po.created_by = u.id
    ORDER BY po.created_at DESC
  `).all();
  res.render('purchase-orders/index', { title: 'Pembelian Bahan Baku', orders, error: null });
});

router.get('/create', isAuthenticated, role('admin'), (req, res) => {
  const vendors = db.prepare("SELECT * FROM vendors WHERE tipe IN ('bahan_baku','import') ORDER BY nama").all();
  const materials = db.prepare('SELECT * FROM raw_materials ORDER BY nama').all();
  const currencies = db.prepare('SELECT * FROM currencies WHERE is_active = 1 ORDER BY kode').all();
  res.render('purchase-orders/create', { title: 'Buat Purchase Order', vendors, materials, currencies, error: null });
});

router.post('/', isAuthenticated, role('admin'), (req, res) => {
  const { vendor_id, no_po, tgl_beli, items } = req.body;
  if (!vendor_id || !no_po || !items) {
    return res.redirect('/purchase-orders/create?error=Data tidak lengkap');
  }
  const itemsArr = Array.isArray(items) ? items : [items];
  const currencyId = req.body.currency_id ? parseInt(req.body.currency_id) : null;
  const kursAmount = parseFloat(req.body.kurs_amount) || 1;
  const result = db.prepare('INSERT INTO purchase_orders (vendor_id, no_po, tgl_beli, currency_id, kurs_amount, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(vendor_id, no_po, tgl_beli, currencyId, kursAmount, req.session.userId);
  const poId = result.lastInsertRowid;
  const ins = db.prepare('INSERT INTO purchase_order_items (purchase_order_id, raw_material_id, qty, harga_satuan, subtotal) VALUES (?, ?, ?, ?, ?)');
  for (const item of itemsArr) {
    if (item.raw_material_id && item.qty && item.harga_satuan) {
      const qty = parseFloat(item.qty);
      const harga = parseFloat(item.harga_satuan);
      ins.run(poId, item.raw_material_id, qty, harga, qty * harga);
    }
  }
  res.redirect('/purchase-orders?success=' + encodeURIComponent('PO berhasil dibuat, menunggu validasi Finance'));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const po = db.prepare(`
    SELECT po.*, v.nama as vendor_nama, u.username as creator_name, uv.username as validator_name
    FROM purchase_orders po
    LEFT JOIN vendors v ON po.vendor_id = v.id
    LEFT JOIN users u ON po.created_by = u.id
    LEFT JOIN users uv ON po.validated_by = uv.id
    WHERE po.id = ?
  `).get(req.params.id);
  if (!po) return res.status(404).send('PO tidak ditemukan');
  const items = db.prepare(`
    SELECT poi.*, rm.nama as material_nama, rm.satuan
    FROM purchase_order_items poi
    LEFT JOIN raw_materials rm ON poi.raw_material_id = rm.id
    WHERE poi.purchase_order_id = ?
  `).all(req.params.id);
  po.items = items;
  res.render('purchase-orders/show', { title: 'Detail PO', po, error: null });
});

module.exports = router;
