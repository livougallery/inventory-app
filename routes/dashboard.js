const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, (req, res) => {
  const totalBahan = db.prepare('SELECT COUNT(*) as c FROM raw_materials').get();
  const stokBahan = db.prepare('SELECT SUM(stok) as s FROM raw_materials').get();
  const bahanMenipis = db.prepare("SELECT * FROM raw_materials WHERE stok_minimum IS NOT NULL AND stok <= stok_minimum").all();
  const produksiBerjalan = db.prepare("SELECT COUNT(*) as c FROM production_batches WHERE status IN ('planned','in_progress')").get();
  const pendingPO = db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE status='pending'").get();
  const pendingCost = db.prepare("SELECT COUNT(*) as c FROM production_costs WHERE status_validasi='pending'").get();
  const pendingImport = db.prepare("SELECT COUNT(*) as c FROM purchase_imports WHERE status='pending'").get();
  const totalPending = pendingPO.c + pendingCost.c + pendingImport.c;

  const products = db.prepare(`
    SELECT p.nama_produk, ROUND(AVG(pv.hpp_saat_ini),0) as avg_hpp
    FROM products p JOIN product_variants pv ON p.id = pv.product_id
    WHERE pv.hpp_saat_ini > 0 GROUP BY p.id
  `).all();

  res.render('dashboard/index', {
    title: 'Dashboard',
    totalBahan: totalBahan.c, stokBahan: stokBahan.s || 0,
    bahanMenipis, produksiBerjalan: produksiBerjalan.c,
    totalPending, products
  });
});

module.exports = router;
