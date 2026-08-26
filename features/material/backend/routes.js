// Material & Raw Materials Routes (Combined)
// This file handles both material master data and material purchases

const express = require('express');
const router = express.Router();
const db = require('../../db'); // Adjust path as needed
const { requireAuth } = require('../auth');

// ==================== MATERIAL MASTER DATA ====================

// GET /cek-data/material - List all materials
router.get('/material', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        kode_material,
        nama_material,
        satuan,
        stok,
        harga_beli_rata_rata,
        created_at,
        updated_at
      FROM raw_materials
      ORDER BY nama_material
    `);

    res.render('cek-data/material', {
      title: 'Data Material',
      materials: result.rows,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).send('Error loading materials');
  }
});

// POST /cek-data/material - Add new material
router.post('/material', requireAuth, async (req, res) => {
  try {
    const { kode_material, nama_material, satuan } = req.body;

    const result = await db.query(`
      INSERT INTO raw_materials (kode_material, nama_material, satuan)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [kode_material, nama_material, satuan]);

    res.redirect('/cek-data/material');
  } catch (error) {
    console.error('Error adding material:', error);
    res.status(500).send('Error adding material');
  }
});

// POST /cek-data/material/update - Update material
router.post('/material/update', requireAuth, async (req, res) => {
  try {
    const { id, kode_material, nama_material, satuan } = req.body;

    await db.query(`
      UPDATE raw_materials
      SET kode_material = $1, nama_material = $2, satuan = $3, updated_at = NOW()
      WHERE id = $4
    `, [kode_material, nama_material, satuan, id]);

    res.redirect('/cek-data/material');
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).send('Error updating material');
  }
});

// POST /cek-data/material/delete - Delete material
router.post('/material/delete', requireAuth, async (req, res) => {
  try {
    const { id } = req.body;

    await db.query(`
      DELETE FROM raw_materials WHERE id = $1
    `, [id]);

    res.redirect('/cek-data/material');
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).send('Error deleting material');
  }
});

// ==================== PEMBELIAN MATERIAL ====================

// GET /cek-data/pembelian-material - List material purchases
router.get('/pembelian-material', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id,
        p.tanggal,
        p.supplier,
        p.total_harga,
        p.status,
        p.catatan,
        COUNT(i.id) as jumlah_item
      FROM material_purchases p
      LEFT JOIN material_purchase_items i ON p.id = i.purchase_id
      GROUP BY p.id
      ORDER BY p.tanggal DESC
    `);

    res.render('cek-data/pembelian-material', {
      title: 'Pembelian Material',
      purchases: result.rows,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error fetching material purchases:', error);
    res.status(500).send('Error loading material purchases');
  }
});

// POST /cek-data/pembelian-material - Add new purchase
router.post('/pembelian-material', requireAuth, async (req, res) => {
  try {
    const { tanggal, supplier, total_harga, status, catatan } = req.body;

    const result = await db.query(`
      INSERT INTO material_purchases (tanggal, supplier, total_harga, status, catatan)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tanggal, supplier, total_harga, status, catatan]);

    res.redirect('/cek-data/pembelian-material');
  } catch (error) {
    console.error('Error adding purchase:', error);
    res.status(500).send('Error adding purchase');
  }
});

module.exports = router;
