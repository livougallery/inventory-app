// Master vendor — JSON API untuk React SPA (halaman /vendors).
//
// Mengikuti konvensi features/material/backend/routes.js dan
// features/negara/backend/routes.js: respons `{ ok: true, data }` /
// `{ ok: false, error }`, auth 401 JSON lewat requireAuth (bukan redirect),
// dan mutasi dilindungi validateToken CSRF.
//
// Vendor tidak bisa dihapus selama masih dipakai PO, pembelian white label,
// atau batch produksi — transaksi historis tidak boleh kehilangan vendor-nya.
// Pesan penolakan menyebut jumlah dan lokasi pemakaian untuk tiap tabel.
const express = require('express');
const db = require('../../../db');
const { validateToken } = require('../../../middleware/csrf');
const { requireAuth } = require('../../../middleware/apiAuth');

const router = express.Router();

// Nilai kode `tipe` disimpan apa adanya di DB; label hanya untuk tampilan.
// `import` ditampilkan sebagai "White Label" (spesifikasi keputusan 4 / tiket
// 04): nilai kodenya tidak diubah, hanya labelnya.
const TIPE_LABEL = {
  bahan_baku: 'Bahan Baku',
  produksi: 'Produksi',
  import: 'White Label',
};

const TIPE_VALID = Object.keys(TIPE_LABEL);

const labelTipe = (tipe) => TIPE_LABEL[tipe] || tipe;

// GET /api/vendors — daftar vendor urut nama, bisa difilter ?tipe=.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { tipe } = req.query;
    if (tipe !== undefined && !TIPE_VALID.includes(tipe)) {
      return res.status(400).json({
        ok: false,
        error: `Tipe tidak dikenal. Pilihan yang valid: ${TIPE_VALID.join(', ')}.`,
      });
    }

    const params = [];
    let sql = 'SELECT id, nama, alamat, kontak, tipe FROM vendors';
    if (tipe !== undefined) {
      params.push(tipe);
      sql += ' WHERE tipe = $1';
    }
    sql += ' ORDER BY nama';

    const rows = (await db.query(sql, params)).rows;
    rows.forEach((r) => {
      r.tipe_label = labelTipe(r.tipe);
    });
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[vendorsApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat data vendor' });
  }
});

// POST /api/vendors — tambah vendor.
router.post('/', requireAuth, validateToken, async (req, res) => {
  try {
    const nama = String(req.body.nama || '').trim();
    const tipe = String(req.body.tipe || '').trim();
    if (!nama) {
      return res.status(400).json({ ok: false, error: 'Nama vendor wajib diisi' });
    }
    if (!tipe) {
      return res.status(400).json({ ok: false, error: 'Tipe vendor wajib diisi' });
    }
    // Validasi sebelum INSERT supaya nilai liar menjawab 400 yang jelas, bukan
    // error CHECK constraint mentah dari database.
    if (!TIPE_VALID.includes(tipe)) {
      return res.status(400).json({
        ok: false,
        error: `Tipe vendor tidak valid. Pilihan yang valid: ${TIPE_VALID.join(', ')}.`,
      });
    }

    const row = (await db.query(
      `INSERT INTO vendors (nama, alamat, kontak, tipe)
       VALUES ($1, $2, $3, $4) RETURNING id, nama, alamat, kontak, tipe`,
      [nama, req.body.alamat || '', req.body.kontak || '', tipe]
    )).rows[0];
    row.tipe_label = labelTipe(row.tipe);
    res.status(201).json({ ok: true, data: row });
  } catch (error) {
    console.error('[vendorsApi] POST error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menambah vendor' });
  }
});

// PUT /api/vendors/:id — ubah vendor. Field yang tidak dikirim dibiarkan
// (bukan dikosongkan), supaya edit parsial tidak menghapus data.
router.put('/:id', requireAuth, validateToken, async (req, res) => {
  try {
    const existing = (await db.query('SELECT id FROM vendors WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Vendor tidak ditemukan' });
    }

    if (req.body.tipe !== undefined && !TIPE_VALID.includes(String(req.body.tipe).trim())) {
      return res.status(400).json({
        ok: false,
        error: `Tipe vendor tidak valid. Pilihan yang valid: ${TIPE_VALID.join(', ')}.`,
      });
    }

    const sets = [];
    const params = [];
    // updated_at ikut disentuh karena vendors punya kolom itu.
    for (const field of ['nama', 'alamat', 'kontak', 'tipe']) {
      if (req.body[field] === undefined) continue;
      const value = field === 'nama' ? String(req.body[field] || '').trim() : req.body[field];
      if (field === 'nama' && !value) {
        return res.status(400).json({ ok: false, error: 'Nama vendor wajib diisi' });
      }
      params.push(field === 'tipe' ? String(value).trim() : value);
      sets.push(`${field} = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, error: 'Tidak ada field yang diubah' });
    }

    params.push(req.params.id);
    const row = (await db.query(
      `UPDATE vendors SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, nama, alamat, kontak, tipe`,
      params
    )).rows[0];
    row.tipe_label = labelTipe(row.tipe);
    res.json({ ok: true, data: row });
  } catch (error) {
    console.error('[vendorsApi] PUT error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal mengubah vendor' });
  }
});

// DELETE /api/vendors/:id — tolak bila masih dipakai transaksi.
router.delete('/:id', requireAuth, validateToken, async (req, res) => {
  try {
    const existing = (await db.query('SELECT id FROM vendors WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Vendor tidak ditemukan' });
    }

    // Satu query menghitung ketiga tabel pemakai, jadi pesan bisa menyebut
    // semuanya sekaligus.
    const usage = (await db.query(`
      SELECT
        (SELECT COUNT(*) FROM purchase_orders   WHERE vendor_id = $1) AS po,
        (SELECT COUNT(*) FROM purchase_imports  WHERE vendor_id = $1) AS impor,
        (SELECT COUNT(*) FROM production_batches WHERE vendor_id = $1) AS batch
    `, [req.params.id])).rows[0];

    const po = Number(usage.po);
    const impor = Number(usage.impor);
    const batch = Number(usage.batch);

    if (po + impor + batch > 0) {
      const parts = [];
      if (po > 0) parts.push(`${po} PO`);
      if (impor > 0) parts.push(`${impor} pembelian white label`);
      if (batch > 0) parts.push(`${batch} batch produksi`);
      return res.status(409).json({
        ok: false,
        error:
          'Vendor dipakai di ' + parts.join(', ') +
          ' — tidak bisa dihapus. Hapus atau ganti vendor di transaksi itu dulu.',
      });
    }

    await db.query('DELETE FROM vendors WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[vendorsApi] DELETE error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menghapus vendor' });
  }
});

module.exports = router;
