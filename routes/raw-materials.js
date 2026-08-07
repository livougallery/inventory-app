const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const FifoService = require('../services/fifoService');

router.get('/', isAuthenticated, async (req, res) => {
  const materials = (await db.query('SELECT * FROM raw_materials ORDER BY nama')).rows;
  res.render('raw-materials/index', { title: 'Bahan Baku', materials, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  res.render('raw-materials/create', { title: 'Tambah Bahan Baku', error: null });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { nama, tipe, satuan, stok_minimum } = req.body;
  if (!nama || !tipe || !satuan) {
    return res.render('raw-materials/create', { title: 'Tambah Bahan Baku', error: 'Nama, tipe dan satuan harus diisi' });
  }
  await db.run('INSERT INTO raw_materials (nama, tipe, satuan, stok_minimum) VALUES ($1, $2, $3, $4) RETURNING id',
    [nama, tipe, satuan, stok_minimum || null]);
  res.redirect('/raw-materials?success=' + encodeURIComponent('Bahan baku berhasil ditambahkan'));
});

router.get('/:id/edit', isAuthenticated, role('admin'), async (req, res) => {
  const material = await db.one('SELECT * FROM raw_materials WHERE id = $1', [req.params.id]);
  if (!material) return res.status(404).send('Bahan tidak ditemukan');
  res.render('raw-materials/edit', { title: 'Edit Bahan Baku', material, error: null });
});

router.put('/:id', isAuthenticated, role('admin'), async (req, res) => {
  const { nama, tipe, satuan, stok_minimum } = req.body;
  await db.run('UPDATE raw_materials SET nama=$1, tipe=$2, satuan=$3, stok_minimum=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5',
    [nama, tipe, satuan, stok_minimum || null, req.params.id]);
  res.redirect('/raw-materials?success=' + encodeURIComponent('Bahan baku berhasil diubah'));
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const material = await db.one('SELECT * FROM raw_materials WHERE id = $1', [req.params.id]);
  if (!material) return res.status(404).send('Material tidak ditemukan');
  const movements = (await db.query('SELECT * FROM stock_movements WHERE raw_material_id = $1 ORDER BY id DESC LIMIT 50', [req.params.id])).rows;
  res.render('raw-materials/show', {
    title: material.nama,
    material,
    movements,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/:id/adjust-stok', isAuthenticated, role('admin'), async (req, res) => {
  const { qty_delta, keterangan } = req.body;
  const delta = parseFloat(qty_delta);
  if (isNaN(delta) || delta === 0) {
    return res.redirect(`/raw-materials/${req.params.id}?error=Qty delta harus angka bukan 0`);
  }
  const rm = await db.one('SELECT * FROM raw_materials WHERE id = $1', [req.params.id]);
  if (!rm) return res.status(404).send('Material tidak ditemukan');
  try {
    await FifoService.recordAdjustment(req.params.id, delta, req.session.userId, keterangan || 'Manual adjustment');
    res.redirect(`/raw-materials/${req.params.id}?success=Stok di-adjust sebesar ${delta}`);
  } catch (e) {
    res.redirect(`/raw-materials/${req.params.id}?error=` + encodeURIComponent(e.message));
  }
});

router.delete('/:id', isAuthenticated, role('admin'), async (req, res) => {
  await db.run('DELETE FROM raw_materials WHERE id = $1', [req.params.id]);
  res.redirect('/raw-materials?success=' + encodeURIComponent('Bahan baku berhasil dihapus'));
});

module.exports = router;
