// Material master data — JSON API untuk React SPA (halaman /master-data).
//
// Stok TIDAK bisa diedit lewat API ini: stok adalah akumulasi
// material_batches (pembelian/produksi), dikelola oleh services/fifoService.
// Harga juga tidak disimpan di master — harga_terakhir diambil dari batch
// pembelian termuda.
const express = require('express');
const db = require('../../../db');
const { validateToken } = require('../../../middleware/csrf');
const { requireAuth } = require('../../../middleware/apiAuth');

const router = express.Router();

// Label tipe untuk tampilan; kolom kategori memakai slug di DB.
const TIPE_LABEL = {
  kain_roll: 'Fabric Roll',
  kain_ecer: 'Kain (Ecer)',
  aksesoris: 'Aksesoris',
  cmt_cost: 'Product Fulfillment',
};

// Field deskriptif yang boleh dibuat/diubah via API. stok sengaja tak masuk.
const EDITABLE_FIELDS = ['kode_bahan', 'nama', 'tipe', 'satuan', 'stok_minimum'];

// GET /api/materials — list + join varian/harga terakhir/foto.
// SQL identik dengan halaman cek-data lama (routes/cek-data.js sebelum dihapus).
router.get('/', requireAuth, async (req, res) => {
  try {
    // Varian diambil sebagai baris terstruktur, terpisah dari query utama.
    //
    // `varian_list` di atas adalah string agregat buatan string_agg — cukup
    // untuk ditampilkan di tabel, tapi tidak bisa dipakai mengisi dropdown
    // (tiket 06 butuh id tiap varian). Menguraikan string itu akan langsung
    // rusak begitu nama varian mengandung ", " atau tanda kurung, jadi
    // di sini diambil terstruktur.
    const variantRows = (await db.query(`
      SELECT id, raw_material_id, nama_varian, stok, satuan
      FROM raw_material_variants
      ORDER BY nama_varian, id
    `)).rows;

    // Dikelompokkan per material di JS, bukan dengan json_agg: satu query
    // datar lebih mudah dibaca, dan `stok` REAL tetap angka asli tanpa
    // konversi perantara JSON.
    const variantsByMaterial = new Map();
    for (const v of variantRows) {
      if (!variantsByMaterial.has(v.raw_material_id)) {
        variantsByMaterial.set(v.raw_material_id, []);
      }
      variantsByMaterial.get(v.raw_material_id).push({
        id: v.id,
        nama_varian: v.nama_varian,
        stok: v.stok,
        satuan: v.satuan,
      });
    }

    const rows = (await db.query(`
      SELECT rm.id, rm.kode_bahan, rm.nama, rm.tipe, rm.satuan,
             rm.stok, rm.stok_minimum, rm.updated_at,
             v.varian_list, hb.harga_terakhir, ph.foto_path
      FROM raw_materials rm
      LEFT JOIN (
        SELECT raw_material_id,
               string_agg(nama_varian || ' (' || stok::text || ')', ', ' ORDER BY id) AS varian_list
        FROM raw_material_variants
        GROUP BY raw_material_id
      ) v ON v.raw_material_id = rm.id
      LEFT JOIN LATERAL (
        SELECT mb.harga_satuan AS harga_terakhir
        FROM material_batches mb
        WHERE mb.raw_material_id = rm.id
        ORDER BY mb.tgl_masuk DESC, mb.id DESC
        LIMIT 1
      ) hb ON TRUE
      LEFT JOIN LATERAL (
        SELECT pph.file_path AS foto_path
        FROM raw_material_photos pph
        WHERE pph.raw_material_id = rm.id
        ORDER BY pph.id DESC
        LIMIT 1
      ) ph ON TRUE
      ORDER BY rm.nama
    `)).rows;
    rows.forEach((r) => {
      r.tipe_label = TIPE_LABEL[r.tipe] || r.tipe;
      r.varian_list = r.varian_list || '';
      r.foto_path = r.foto_path || '';
      // Selalu array, termasuk saat material tidak punya varian. Ini kasus
      // normal hari ini — semua 7 material di live DB punya nol varian —
      // jadi klien tidak perlu menangani null/undefined terpisah.
      r.variants = variantsByMaterial.get(r.id) || [];
    });
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[materialsApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat data material' });
  }
});

// POST /api/materials — buat master material baru.
router.post('/', requireAuth, validateToken, async (req, res) => {
  try {
    const { nama, tipe, satuan } = req.body;
    if (!nama || !tipe || !satuan) {
      return res.status(400).json({ ok: false, error: 'Nama, tipe, dan satuan wajib diisi' });
    }
    const values = {
      kode_bahan: req.body.kode_bahan || null,
      nama,
      tipe,
      satuan,
      stok_minimum: req.body.stok_minimum ?? null,
    };
    const row = (await db.query(
      `INSERT INTO raw_materials (kode_bahan, nama, tipe, satuan, stok_minimum)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [values.kode_bahan, values.nama, values.tipe, values.satuan, values.stok_minimum]
    )).rows[0];
    res.status(201).json({ ok: true, data: row });
  } catch (error) {
    console.error('[materialsApi] POST error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menambah material' });
  }
});

// PUT /api/materials/:id — ubah field deskriptif saja.
router.put('/:id', requireAuth, validateToken, async (req, res) => {
  try {
    const existing = (await db.query('SELECT id FROM raw_materials WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
    }

    const sets = [];
    const params = [];
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    params.push(req.params.id);
    const row = (await db.query(
      `UPDATE raw_materials SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    )).rows[0];
    res.json({ ok: true, data: row });
  } catch (error) {
    console.error('[materialsApi] PUT error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal mengubah material' });
  }
});

// DELETE /api/materials/:id — tolak jika masih dipakai transaksi/BOM.
router.delete('/:id', requireAuth, validateToken, async (req, res) => {
  try {
    const usage = (await db.query(`
      SELECT
        (SELECT COUNT(*) FROM material_batches WHERE raw_material_id = $1) AS batches,
        (SELECT COUNT(*) FROM product_bom WHERE raw_material_id = $1) AS bom
    `, [req.params.id])).rows[0];

    if (Number(usage.batches) > 0) {
      return res.status(409).json({
        ok: false,
        error: 'Material punya riwayat pembelian sehingga tidak bisa dihapus',
      });
    }
    if (Number(usage.bom) > 0) {
      return res.status(409).json({
        ok: false,
        error: 'Material masih dipakai di BOM produk sehingga tidak bisa dihapus',
      });
    }

    const deleted = (await db.query('DELETE FROM raw_materials WHERE id = $1 RETURNING id', [req.params.id])).rows[0];
    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
    }
    // Varian & foto ikut terhapus lewat ON DELETE CASCADE.
    res.json({ ok: true });
  } catch (error) {
    console.error('[materialsApi] DELETE error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menghapus material' });
  }
});

module.exports = router;
