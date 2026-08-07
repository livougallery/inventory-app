const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/', isAuthenticated, async (req, res) => {
  const vendors = (await db.query('SELECT * FROM vendors ORDER BY nama')).rows;
  res.render('vendors/index', { title: 'Data Vendor', vendors, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  res.render('vendors/create', { title: 'Tambah Vendor', error: null });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { nama, tipe, kontak, alamat } = req.body;
  if (!nama || !tipe) {
    return res.render('vendors/create', { title: 'Tambah Vendor', error: 'Nama dan tipe vendor harus diisi' });
  }
  await db.run('INSERT INTO vendors (nama, tipe, kontak, alamat) VALUES ($1, $2, $3, $4) RETURNING id',
    [nama, tipe, kontak || '', alamat || '']);
  res.redirect('/vendors?success=' + encodeURIComponent('Vendor berhasil ditambahkan'));
});

router.get('/:id/edit', isAuthenticated, role('admin'), async (req, res) => {
  const vendor = await db.one('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
  if (!vendor) return res.status(404).send('Vendor tidak ditemukan');
  res.render('vendors/edit', { title: 'Edit Vendor', vendor, error: null });
});

router.put('/:id', isAuthenticated, role('admin'), async (req, res) => {
  const { nama, tipe, kontak, alamat } = req.body;
  await db.run('UPDATE vendors SET nama=$1, tipe=$2, kontak=$3, alamat=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5',
    [nama, tipe, kontak || '', alamat || '', req.params.id]);
  res.redirect('/vendors?success=' + encodeURIComponent('Vendor berhasil diubah'));
});

router.delete('/:id', isAuthenticated, role('admin'), async (req, res) => {
  await db.run('DELETE FROM vendors WHERE id = $1', [req.params.id]);
  res.redirect('/vendors?success=' + encodeURIComponent('Vendor berhasil dihapus'));
});

module.exports = router;
