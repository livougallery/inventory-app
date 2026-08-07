const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, async (req, res) => {
  const products = (await db.query(`
    SELECT p.*, pv.id as varian_id, pv.warna, pv.size, pv.hpp_saat_ini, pv.sku
    FROM products p JOIN product_variants pv ON p.id = pv.product_id
    ORDER BY p.nama_produk, pv.warna, pv.size
  `)).rows;

  let histories = [];
  if (req.query.variant_id) {
    histories = (await db.query(`
      SELECT h.*, p.nama_produk, pv.warna, pv.size
      FROM hpp_history h
      JOIN product_variants pv ON h.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE h.variant_id = $1
      ORDER BY h.created_at DESC
    `, [req.query.variant_id])).rows;
  }

  res.render('hpp/index', { title: 'Detail HPP', products, histories, selectedVariantId: req.query.variant_id || '', error: null });
});

module.exports = router;
