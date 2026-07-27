const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, async (req, res) => {
  const totalBahanRow = await db.one('SELECT COUNT(*)::int as c FROM raw_materials');
  const totalBahan = totalBahanRow ? totalBahanRow.c : 0;
  const stokBahanRow = await db.one('SELECT SUM(stok)::real as s FROM raw_materials');
  const stokBahan = stokBahanRow ? stokBahanRow.s || 0 : 0;
  const bahanMenipis = (await db.query("SELECT * FROM raw_materials WHERE stok_minimum IS NOT NULL AND stok <= stok_minimum")).rows;
  const produksiBerjalanRow = await db.one("SELECT COUNT(*)::int as c FROM production_batches WHERE status IN ('planned','in_progress')");
  const produksiBerjalan = produksiBerjalanRow ? produksiBerjalanRow.c : 0;
  const pendingPoRow = await db.one("SELECT COUNT(*)::int as c FROM purchase_orders WHERE status='pending'");
  const pendingPO = pendingPoRow ? pendingPoRow.c : 0;
  const pendingCostRow = await db.one("SELECT COUNT(*)::int as c FROM production_costs WHERE status_validasi='pending'");
  const pendingCost = pendingCostRow ? pendingCostRow.c : 0;
  const pendingImportRow = await db.one("SELECT COUNT(*)::int as c FROM purchase_imports WHERE status='pending'");
  const pendingImport = pendingImportRow ? pendingImportRow.c : 0;
  const totalPending = pendingPO + pendingCost + pendingImport;

  const products = (await db.query(`
    SELECT p.nama_produk, ROUND(AVG(pv.hpp_saat_ini),0) as avg_hpp
    FROM products p JOIN product_variants pv ON p.id = pv.product_id
    WHERE pv.hpp_saat_ini > 0 GROUP BY p.id
  `)).rows;

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const urgentPOs = (await db.query(`
    SELECT po.id, po.no_po, po.created_at, v.nama as vendor_nama
    FROM purchase_orders po
    LEFT JOIN vendors v ON po.vendor_id = v.id
    WHERE po.status = 'pending' AND po.created_at < $1
    ORDER BY po.created_at ASC LIMIT 5
  `, [threeDaysAgo])).rows;

  const lowStock = (await db.query(`
    SELECT id, nama, satuan, stok, stok_minimum FROM raw_materials
    WHERE stok_minimum IS NOT NULL AND stok < stok_minimum
    ORDER BY (stok_minimum - stok) DESC LIMIT 5
  `)).rows;

  const hasUrgent = urgentPOs.length > 0 || lowStock.length > 0;

  res.render('dashboard/index', {
    title: 'Dashboard',
    totalBahan, stokBahan,
    bahanMenipis, produksiBerjalan,
    totalPending, products,
    hasUrgent, urgentPOs, lowStock
  });
});

module.exports = router;
