// Master currency — JSON API untuk React SPA (dropdown pada form PO).
//
// Read-only dengan sengaja: master currency dikelola lewat halaman admin EJS
// (/admin/currencies, admin saja). Yang dibutuhkan halaman React hanyalah
// daftar untuk dipilih, jadi tidak ada POST/PUT/DELETE di sini — menambahkannya
// berarti membuat dua jalur yang bisa mengubah master yang sama.
//
// Mengikuti konvensi features/*/backend/routes.js: respons `{ ok: true, data }`
// / `{ ok: false, error }`, auth 401 JSON lewat requireAuth (bukan redirect).
const express = require('express');
const db = require('../../../db');
const { requireAuth } = require('../../../middleware/apiAuth');

const router = express.Router();

// GET /api/currencies — daftar currency aktif, urut kode.
router.get('/', requireAuth, async (req, res) => {
  try {
    // Hanya yang aktif: currency yang sudah dinonaktifkan tidak boleh dipilih
    // untuk transaksi baru, meski PO lama masih merujuknya (FK-nya tetap utuh).
    const rows = (await db.query(`
      SELECT id, kode, nama, simbol, is_active
      FROM currencies
      WHERE is_active = 1
      ORDER BY kode
    `)).rows;
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[currenciesApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat daftar currency' });
  }
});

module.exports = router;
