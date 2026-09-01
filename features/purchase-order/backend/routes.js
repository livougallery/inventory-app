// Purchase order bahan baku — JSON API untuk React SPA (halaman
// /pembelian-material).
//
// Mengikuti konvensi features/vendor/backend/routes.js dan
// features/material/backend/routes.js: respons `{ ok: true, data }` /
// `{ ok: false, error }`, auth 401 JSON lewat requireAuth (bukan redirect).
//
// Tiket 05 hanya membuat data bisa DIBACA. Create, edit, dan validasi menyusul
// di tiket 06-08, jadi di sini belum ada validateToken CSRF.
const express = require('express');
const db = require('../../../db');
const { requireAuth } = require('../../../middleware/apiAuth');

const router = express.Router();

// Nilai kode `status` disimpan apa adanya di DB; label hanya untuk tampilan.
// Labelnya mengikuti views/purchase-orders/index.ejs supaya halaman EJS dan
// React tidak pernah memakai dua istilah berbeda untuk status yang sama.
const STATUS_LABEL = {
  pending: 'Pending',
  validated: 'Tervalidasi',
  rejected: 'Ditolak',
  received: 'Diterima',
};

const labelStatus = (status) => STATUS_LABEL[status] || status;

// `total` dihitung dengan COALESCE karena SUM atas nol baris menghasilkan NULL,
// sedangkan klien mengharapkan angka — PO tanpa item harus 0, bukan null.
const TOTAL_SQL = `(SELECT COALESCE(SUM(subtotal), 0)
                    FROM purchase_order_items i
                    WHERE i.purchase_order_id = po.id)`;

// GET /api/purchase-orders — daftar PO, terbaru lebih dulu.
router.get('/', requireAuth, async (req, res) => {
  try {
    // Tiebreak id DESC wajib, bukan gaya: di live DB tiga PO pertama punya
    // created_at identik sampai mikrodetik (hasil migrasi), jadi ORDER BY
    // created_at DESC saja mengembalikan urutan yang tidak ditentukan.
    const rows = (await db.query(`
      SELECT po.id, po.no_po, po.tgl_beli, po.status,
             v.nama AS vendor_nama,
             u.username AS creator_name,
             ${TOTAL_SQL} AS total
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN users u ON po.created_by = u.id
      ORDER BY po.created_at DESC, po.id DESC
    `)).rows;

    rows.forEach((r) => {
      r.status_label = labelStatus(r.status);
    });
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[purchaseOrdersApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat data pembelian material' });
  }
});

// GET /api/purchase-orders/:id — satu PO beserta baris itemnya.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // id divalidasi sebelum dipakai: tanpa ini, '/abc' akan diteruskan ke
    // Postgres dan memicu 22P02 (invalid input syntax for integer) yang
    // berujung 500, padahal yang diminta klien adalah 404.
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(404).json({ ok: false, error: 'Purchase order tidak ditemukan' });
    }

    // Field validasi (catatan_reject, validator_name) sengaja belum dikirim:
    // UI-nya ranah tiket 07. Diambil saat itu nanti, bukan sekarang.
    const po = (await db.query(`
      SELECT po.id, po.no_po, po.tgl_beli, po.status,
             v.nama AS vendor_nama,
             u.username AS creator_name,
             ${TOTAL_SQL} AS total
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = $1
    `, [id])).rows[0];

    if (!po) {
      return res.status(404).json({ ok: false, error: 'Purchase order tidak ditemukan' });
    }

    const items = (await db.query(`
      SELECT i.id, i.qty, i.harga_satuan, i.subtotal,
             rm.nama AS material_nama,
             rm.satuan
      FROM purchase_order_items i
      LEFT JOIN raw_materials rm ON i.raw_material_id = rm.id
      WHERE i.purchase_order_id = $1
      ORDER BY i.id
    `, [id])).rows;

    po.status_label = labelStatus(po.status);
    po.items = items;
    res.json({ ok: true, data: po });
  } catch (error) {
    console.error('[purchaseOrdersApi] GET/:id error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat detail purchase order' });
  }
});

module.exports = router;
