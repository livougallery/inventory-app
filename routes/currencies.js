const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const { validateToken } = require('../middleware/csrf');

router.get('/', isAuthenticated, role('admin'), (req, res) => {
  const currencies = db.prepare('SELECT * FROM currencies ORDER BY kode').all();
  res.render('currencies/index', { title: 'Manajemen Currency', currencies, error: null });
});

router.post('/', isAuthenticated, role('admin'), validateToken, (req, res) => {
  const { kode, nama, simbol, is_active } = req.body;
  if (!kode || !nama) return res.redirect('/admin/currencies?error=' + encodeURIComponent('Kode dan nama harus diisi'));
  try {
    db.prepare('INSERT INTO currencies (kode, nama, simbol, is_active) VALUES (?,?,?,?)')
      .run(kode.toUpperCase(), nama, simbol || '', is_active ? 1 : 0);
    res.redirect('/admin/currencies?success=' + encodeURIComponent('Currency berhasil ditambah'));
  } catch (e) {
    res.redirect('/admin/currencies?error=' + encodeURIComponent('Kode currency sudah ada'));
  }
});

router.put('/:id', isAuthenticated, role('admin'), validateToken, (req, res) => {
  const { kode, nama, simbol, is_active } = req.body;
  try {
    db.prepare('UPDATE currencies SET kode=?, nama=?, simbol=?, is_active=? WHERE id=?')
      .run(kode.toUpperCase(), nama, simbol || '', is_active ? 1 : 0, req.params.id);
    res.redirect('/admin/currencies?success=' + encodeURIComponent('Currency berhasil diubah'));
  } catch (e) {
    res.redirect('/admin/currencies?error=' + encodeURIComponent(e.message));
  }
});

router.delete('/:id', isAuthenticated, role('admin'), validateToken, (req, res) => {
  // FK check — refuse if used in purchase_orders
  const usedCount = db.prepare('SELECT COUNT(*) AS c FROM purchase_orders WHERE currency_id = ?').get(req.params.id).c;
  if (usedCount > 0) {
    return res.redirect('/admin/currencies?error=' + encodeURIComponent(
      'Currency dipakai di ' + usedCount + ' PO — tidak bisa dihapus. Hapus atau ganti currency di PO tsb dulu.'
    ));
  }
  try {
    db.prepare('DELETE FROM currencies WHERE id = ?').run(req.params.id);
    res.redirect('/admin/currencies?success=' + encodeURIComponent('Currency berhasil dihapus'));
  } catch (e) {
    res.redirect('/admin/currencies?error=' + encodeURIComponent(e.message));
  }
});

module.exports = router;