// Lookup negara asal pembelian (white label) — JSON API untuk React SPA.
//
// Mengikuti konvensi features/material/backend/routes.js: respons
// `{ ok: true, data }` / `{ ok: false, error }`, auth 401 JSON lewat
// requireAuth (bukan redirect), dan mutasi dilindungi validateToken CSRF.
//
// Negara tidak bisa dihapus selama masih dipakai purchase_imports — transaksi
// tidak boleh kehilangan referensi negaranya. Pesannya menyebut jumlah
// pemakaian, mengikuti pola currency CRUD yang sudah ada.
const express = require('express');
const db = require('../../../db');
const { validateToken } = require('../../../middleware/csrf');
const { requireAuth } = require('../../../middleware/apiAuth');
const { parseId } = require('../../../middleware/parseId');

const router = express.Router();

// Nama negara dinormalisasi: spasi di ujung dibuang, null/undefined jadi ''.
function normalizeNama(value) {
  return String(value || '').trim();
}

// Cari negara berdasarkan nama tanpa mempermasalahkan huruf besar-kecil.
// `exceptId` dipakai PUT supaya rename ke namanya sendiri tidak dihitung
// sebagai konflik.
async function findByName(nama, exceptId) {
  const params = [nama];
  let sql = 'SELECT id FROM negara WHERE LOWER(nama) = LOWER($1)';
  if (exceptId !== undefined) {
    params.push(exceptId);
    sql += ' AND id <> $2';
  }
  return (await db.query(sql, params)).rows[0];
}

// Pre-check findByName menangani jalur normal, tapi ia tidak atomik: dua
// request bersamaan bisa lolos berdua, lalu salah satunya menabrak unique
// index uq_negara_nama. Karena itu pelanggaran constraint (23505) juga
// dipetakan ke 409 — tiket mensyaratkan nama ganda menjawab 409 yang jelas,
// bukan 500 dari database.
function isDuplicateKey(error) {
  return error && error.code === '23505';
}

// GET /api/negara — daftar negara, urut alfabetis (spesifikasi: user story 13).
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = (await db.query('SELECT * FROM negara ORDER BY nama')).rows;
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[negaraApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat daftar negara' });
  }
});

// POST /api/negara — tambah negara.
router.post('/', requireAuth, validateToken, async (req, res) => {
  try {
    const nama = normalizeNama(req.body.nama);
    if (!nama) {
      return res.status(400).json({ ok: false, error: 'Nama negara wajib diisi' });
    }

    // Cek dulu sebelum INSERT supaya nama duplikat menjawab 409 yang jelas,
    // bukan error constraint mentah dari database.
    const dupe = await findByName(nama);
    if (dupe) {
      return res.status(409).json({ ok: false, error: `Negara "${nama}" sudah ada` });
    }

    const row = (await db.query(
      'INSERT INTO negara (nama) VALUES ($1) RETURNING *',
      [nama]
    )).rows[0];
    res.status(201).json({ ok: true, data: row });
  } catch (error) {
    console.error('[negaraApi] POST error:', error.message);
    if (isDuplicateKey(error)) {
      return res.status(409).json({ ok: false, error: 'Nama negara sudah ada' });
    }
    res.status(500).json({ ok: false, error: 'Gagal menambah negara' });
  }
});

// PUT /api/negara/:id — ubah nama negara.
router.put('/:id', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Negara tidak ditemukan' });
  }

  try {
    const existing = (await db.query('SELECT id FROM negara WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Negara tidak ditemukan' });
    }

    const nama = normalizeNama(req.body.nama);
    if (!nama) {
      return res.status(400).json({ ok: false, error: 'Nama negara wajib diisi' });
    }

    // Konflik hanya dihitung terhadap negara *lain* — rename ke namanya
    // sendiri bukan konflik.
    const dupe = await findByName(nama, id);
    if (dupe) {
      return res.status(409).json({ ok: false, error: `Negara "${nama}" sudah ada` });
    }

    const row = (await db.query(
      'UPDATE negara SET nama = $1 WHERE id = $2 RETURNING *',
      [nama, id]
    )).rows[0];
    res.json({ ok: true, data: row });
  } catch (error) {
    console.error('[negaraApi] PUT error:', error.message);
    if (isDuplicateKey(error)) {
      return res.status(409).json({ ok: false, error: 'Nama negara sudah ada' });
    }
    res.status(500).json({ ok: false, error: 'Gagal mengubah negara' });
  }
});

// DELETE /api/negara/:id — tolak bila masih dipakai transaksi.
router.delete('/:id', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Negara tidak ditemukan' });
  }

  try {
    const existing = (await db.query('SELECT id FROM negara WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Negara tidak ditemukan' });
    }

    const usage = (await db.query(
      'SELECT COUNT(*)::int AS c FROM purchase_imports WHERE negara_id = $1',
      [id]
    )).rows[0];

    if (Number(usage.c) > 0) {
      return res.status(409).json({
        ok: false,
        error:
          'Negara dipakai di ' + usage.c +
          ' pembelian white label — tidak bisa dihapus. Ganti negara di pembelian itu dulu.',
      });
    }

    await db.query('DELETE FROM negara WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[negaraApi] DELETE error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menghapus negara' });
  }
});

module.exports = router;
