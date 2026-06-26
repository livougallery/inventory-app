const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, pv.id as varian_id, pv.warna, pv.size, pv.hpp_saat_ini, pv.sku
    FROM products p JOIN product_variants pv ON p.id = pv.product_id
    ORDER BY p.nama_produk, pv.warna, pv.size
  `).all();

  let histories = [];
  if (req.query.variant_id) {
    histories = db.prepare(`
      SELECT h.*, p.nama_produk, pv.warna, pv.size
      FROM hpp_history h
      JOIN product_variants pv ON h.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE h.variant_id = ?
      ORDER BY h.created_at DESC
    `).all(req.query.variant_id);
  }

  res.render('hpp/index', { title: 'Detail HPP', products, histories, selectedVariantId: req.query.variant_id || '', error: null });
});

module.exports = router;
