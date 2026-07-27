const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const { validateToken } = require('../middleware/csrf');

router.get('/', isAuthenticated, async (req, res) => {
  const orders = (await db.query(`
    SELECT po.*, v.nama as vendor_nama, u.username as creator_name,
           (SELECT SUM(subtotal) FROM purchase_order_items WHERE purchase_order_id = po.id) as total
    FROM purchase_orders po
    LEFT JOIN vendors v ON po.vendor_id = v.id
    LEFT JOIN users u ON po.created_by = u.id
    ORDER BY po.created_at DESC
  `)).rows;
  res.render('purchase-orders/index', { title: 'Pembelian Bahan Baku', orders, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  const vendors = (await db.query("SELECT * FROM vendors WHERE tipe IN ('bahan_baku','import') ORDER BY nama")).rows;
  const materials = (await db.query('SELECT * FROM raw_materials ORDER BY nama')).rows;
  const currencies = (await db.query('SELECT * FROM currencies WHERE is_active = 1 ORDER BY kode')).rows;
  res.render('purchase-orders/create', { title: 'Buat Purchase Order', vendors, materials, currencies, error: null });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { vendor_id, no_po, tgl_beli, items } = req.body;
  if (!vendor_id || !no_po || !items) {
    return res.redirect('/purchase-orders/create?error=Data tidak lengkap');
  }
  const itemsArr = Array.isArray(items) ? items : [items];
  const currencyId = req.body.currency_id ? parseInt(req.body.currency_id) : null;
  const kursAmount = parseFloat(req.body.kurs_amount) || 1;
  const result = await db.run('INSERT INTO purchase_orders (vendor_id, no_po, tgl_beli, currency_id, kurs_amount, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [vendor_id, no_po, tgl_beli, currencyId, kursAmount, req.session.userId]);
  const poId = result.returningId;
  for (const item of itemsArr) {
    if (item.raw_material_id && item.qty && item.harga_satuan) {
      const qty = parseFloat(item.qty);
      const harga = parseFloat(item.harga_satuan);
      await db.run('INSERT INTO purchase_order_items (purchase_order_id, raw_material_id, qty, harga_satuan, subtotal) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [poId, item.raw_material_id, qty, harga, qty * harga]);
    }
  }
  res.redirect('/purchase-orders?success=' + encodeURIComponent('PO berhasil dibuat, menunggu validasi Finance'));
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const po = await db.one(`
    SELECT po.*, v.nama as vendor_nama, u.username as creator_name, uv.username as validator_name
    FROM purchase_orders po
    LEFT JOIN vendors v ON po.vendor_id = v.id
    LEFT JOIN users u ON po.created_by = u.id
    LEFT JOIN users uv ON po.validated_by = uv.id
    WHERE po.id = $1
  `, [req.params.id]);
  if (!po) return res.status(404).send('PO tidak ditemukan');
  const items = (await db.query(`
    SELECT poi.*, rm.nama as material_nama, rm.satuan
    FROM purchase_order_items poi
    LEFT JOIN raw_materials rm ON poi.raw_material_id = rm.id
    WHERE poi.purchase_order_id = $1
  `, [req.params.id])).rows;
  po.items = items;
  res.render('purchase-orders/show', { title: 'Detail PO', po, error: null });
});

router.post('/:id/quick-edit', isAuthenticated, role('admin'), validateToken, async (req, res) => {
  const { no_po, catatan } = req.body;
  try {
    const po = await db.one("SELECT * FROM purchase_orders WHERE id = $1", [req.params.id]);
    if (!po) return res.status(404).json({ ok: false, error: 'PO tidak ditemukan' });
    await db.run("UPDATE purchase_orders SET no_po = $1, catatan_reject = $2 WHERE id = $3",
      [no_po || po.no_po, catatan || '', req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
