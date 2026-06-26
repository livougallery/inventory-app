const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/', isAuthenticated, (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY nama').all();
  res.render('vendors/index', { title: 'Data Vendor', vendors, error: null });
});

router.get('/create', isAuthenticated, role('admin'), (req, res) => {
  res.render('vendors/create', { title: 'Tambah Vendor', error: null });
});

router.post('/', isAuthenticated, role('admin'), (req, res) => {
  const { nama, tipe, kontak, alamat } = req.body;
  if (!nama || !tipe) {
    return res.render('vendors/create', { title: 'Tambah Vendor', error: 'Nama dan tipe vendor harus diisi' });
  }
  db.prepare('INSERT INTO vendors (nama, tipe, kontak, alamat) VALUES (?, ?, ?, ?)')
    .run(nama, tipe, kontak || '', alamat || '');
  res.redirect('/vendors?success=' + encodeURIComponent('Vendor berhasil ditambahkan'));
});

router.get('/:id/edit', isAuthenticated, role('admin'), (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).send('Vendor tidak ditemukan');
  res.render('vendors/edit', { title: 'Edit Vendor', vendor, error: null });
});

router.put('/:id', isAuthenticated, role('admin'), (req, res) => {
  const { nama, tipe, kontak, alamat } = req.body;
  db.prepare('UPDATE vendors SET nama=?, tipe=?, kontak=?, alamat=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(nama, tipe, kontak || '', alamat || '', req.params.id);
  res.redirect('/vendors?success=' + encodeURIComponent('Vendor berhasil diubah'));
});

router.delete('/:id', isAuthenticated, role('admin'), (req, res) => {
  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.redirect('/vendors?success=' + encodeURIComponent('Vendor berhasil dihapus'));
});

module.exports = router;
