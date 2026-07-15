const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const FifoService = require('../services/fifoService');

router.get('/', isAuthenticated, (req, res) => {
  const materials = db.prepare('SELECT * FROM raw_materials ORDER BY nama').all();
  res.render('raw-materials/index', { title: 'Bahan Baku', materials, error: null });
});

router.get('/create', isAuthenticated, role('admin'), (req, res) => {
  res.render('raw-materials/create', { title: 'Tambah Bahan Baku', error: null });
});

router.post('/', isAuthenticated, role('admin'), (req, res) => {
  const { nama, tipe, satuan, stok_minimum } = req.body;
  if (!nama || !tipe || !satuan) {
    return res.render('raw-materials/create', { title: 'Tambah Bahan Baku', error: 'Nama, tipe dan satuan harus diisi' });
  }
  db.prepare('INSERT INTO raw_materials (nama, tipe, satuan, stok_minimum) VALUES (?, ?, ?, ?)')
    .run(nama, tipe, satuan, stok_minimum || null);
  res.redirect('/raw-materials?success=' + encodeURIComponent('Bahan baku berhasil ditambahkan'));
});

router.get('/:id/edit', isAuthenticated, role('admin'), (req, res) => {
  const material = db.prepare('SELECT * FROM raw_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).send('Bahan tidak ditemukan');
  res.render('raw-materials/edit', { title: 'Edit Bahan Baku', material, error: null });
});

router.put('/:id', isAuthenticated, role('admin'), (req, res) => {
  const { nama, tipe, satuan, stok_minimum } = req.body;
  db.prepare('UPDATE raw_materials SET nama=?, tipe=?, satuan=?, stok_minimum=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(nama, tipe, satuan, stok_minimum || null, req.params.id);
  res.redirect('/raw-materials?success=' + encodeURIComponent('Bahan baku berhasil diubah'));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const material = db.prepare('SELECT * FROM raw_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).send('Material tidak ditemukan');
  const movements = db.prepare('SELECT * FROM stock_movements WHERE raw_material_id = ? ORDER BY id DESC LIMIT 50').all(req.params.id);
  res.render('raw-materials/show', {
    title: material.nama,
    material,
    movements,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

router.post('/:id/adjust-stok', isAuthenticated, role('admin'), (req, res) => {
  const { qty_delta, keterangan } = req.body;
  const delta = parseFloat(qty_delta);
  if (isNaN(delta) || delta === 0) {
    return res.redirect(`/raw-materials/${req.params.id}?error=Qty delta harus angka bukan 0`);
  }
  const rm = db.prepare('SELECT * FROM raw_materials WHERE id = ?').get(req.params.id);
  if (!rm) return res.status(404).send('Material tidak ditemukan');
  try {
    FifoService.recordAdjustment(req.params.id, delta, req.session.userId, keterangan || 'Manual adjustment');
    res.redirect(`/raw-materials/${req.params.id}?success=Stok di-adjust sebesar ${delta}`);
  } catch (e) {
    res.redirect(`/raw-materials/${req.params.id}?error=` + encodeURIComponent(e.message));
  }
});

router.delete('/:id', isAuthenticated, role('admin'), (req, res) => {
  db.prepare('DELETE FROM raw_materials WHERE id = ?').run(req.params.id);
  res.redirect('/raw-materials?success=' + encodeURIComponent('Bahan baku berhasil dihapus'));
});

module.exports = router;
