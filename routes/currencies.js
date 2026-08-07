const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const { validateToken } = require('../middleware/csrf');

router.get('/', isAuthenticated, role('admin'), async (req, res) => {
  const currencies = (await db.query('SELECT * FROM currencies ORDER BY kode')).rows;
  res.render('currencies/index', { title: 'Manajemen Currency', currencies, error: null });
});

router.post('/', isAuthenticated, role('admin'), validateToken, async (req, res) => {
  const { kode, nama, simbol, is_active } = req.body;
  if (!kode || !nama) return res.redirect('/admin/currencies?error=' + encodeURIComponent('Kode dan nama harus diisi'));
  try {
    await db.run('INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1,$2,$3,$4) RETURNING id',
      [kode.toUpperCase(), nama, simbol || '', is_active ? 1 : 0]);
    res.redirect('/admin/currencies?success=' + encodeURIComponent('Currency berhasil ditambah'));
  } catch (e) {
    res.redirect('/admin/currencies?error=' + encodeURIComponent('Kode currency sudah ada'));
  }
});

router.put('/:id', isAuthenticated, role('admin'), validateToken, async (req, res) => {
  const { kode, nama, simbol, is_active } = req.body;
  try {
    await db.run('UPDATE currencies SET kode=$1, nama=$2, simbol=$3, is_active=$4 WHERE id=$5',
      [kode.toUpperCase(), nama, simbol || '', is_active ? 1 : 0, req.params.id]);
    res.redirect('/admin/currencies?success=' + encodeURIComponent('Currency berhasil diubah'));
  } catch (e) {
    res.redirect('/admin/currencies?error=' + encodeURIComponent(e.message));
  }
});

router.delete('/:id', isAuthenticated, role('admin'), validateToken, async (req, res) => {
  // FK check — refuse if used in purchase_orders
  const usedRow = await db.one('SELECT COUNT(*)::int AS c FROM purchase_orders WHERE currency_id = $1', [req.params.id]);
  const usedCount = usedRow ? usedRow.c : 0;
  if (usedCount > 0) {
    return res.redirect('/admin/currencies?error=' + encodeURIComponent(
      'Currency dipakai di ' + usedCount + ' PO — tidak bisa dihapus. Hapus atau ganti currency di PO tsb dulu.'
    ));
  }
  try {
    await db.run('DELETE FROM currencies WHERE id = $1', [req.params.id]);
    res.redirect('/admin/currencies?success=' + encodeURIComponent('Currency berhasil dihapus'));
  } catch (e) {
    res.redirect('/admin/currencies?error=' + encodeURIComponent(e.message));
  }
});

module.exports = router;
