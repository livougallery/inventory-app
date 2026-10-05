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
const { parseId } = require('../../../middleware/parseId');
const photoUpload = require('../../../services/photoUpload');

const router = express.Router();

// Label tipe untuk tampilan; kolom kategori memakai slug di DB.
//
// Ini SATU-SATUNYA peta label tipe material yang boleh dipakai kode.
// Diekspor supaya halaman EJS yang masih hidup bisa memakainya, bukan
// menuliskan labelnya sendiri — dulu views/reports/stock-card.ejs
// menuliskan "Ecer" sendiri sementara API mengirim "Kain (Ecer)", dan
// view EJS material yang lain memakai dua ejaan lagi.
//
// Dua peta label pasti drift. Kalau butuh label di tempat lain, ambil dari
// `tipe_label` yang dikirim endpoint ini, atau impor peta ini.
const TIPE_LABEL = {
  kain: 'Kain',
  aksesoris: 'Aksesoris',
  cmt_cost: 'Product Fulfillment',
};

// Label Jenis material. Daftar tetap, bukan teks bebas — itu inti atributnya.
// Kain Pelapis sengaja di bawah Aksesoris meski namanya mengandung "Kain":
// ia komponen yang dijahit ke dalam busana, disimpan seperti aksesoris
// lainnya. Jangan "diperbaiki" masuk ke kategori Kain.
const JENIS_LABEL = {
  roll: 'Roll',
  ecer: 'Ecer',
  'hak kait': 'Hak Kait',
  kancing: 'Kancing',
  resleting: 'Resleting',
  karet: 'Karet',
  label: 'Label',
  renda: 'Renda',
  'kain pelapis': 'Kain Pelapis',
};

// Field deskriptif yang boleh dibuat/diubah via API. stok sengaja tak masuk.
//
// `jenis` dan `lokasi_id` WAJIB ada di sini: PUT merakit SET hanya dari
// daftar ini, jadi field yang tidak tercantum diam-diam terbuang — tanpa
// error, hanya tidak tersimpan.
const EDITABLE_FIELDS = ['kode_bahan', 'nama', 'tipe', 'jenis', 'lokasi_id', 'satuan', 'stok_minimum'];

// GET /api/materials — list + join varian/harga terakhir/foto.
// SQL identik dengan halaman cek-data lama yang sudah dihapus bersama
// controller-nya (tiket 02).
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
      SELECT rm.id, rm.kode_bahan, rm.nama, rm.tipe, rm.jenis, rm.satuan,
             rm.stok, rm.stok_minimum, rm.updated_at,
             lok.nama AS lokasi_nama,
             v.varian_list, hb.harga_terakhir, ph.foto_path
      FROM raw_materials rm
      -- Nama lokasi diputuskan di sini, bukan di klien: hanya server yang
      -- tahu tabel locations, dan membiarkan frontend memetakan id → label
      -- berarti dua peta label yang bisa drift.
      LEFT JOIN locations lok ON lok.id = rm.lokasi_id
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
        -- is_primary DIDAHULUKAN, lalu id terbaru. Tanpa ini, foto yang
        -- ditandai utama bisa kalah dari foto lain hanya karena id-nya lebih
        -- kecil — padahal kolom is_primary ada tepat untuk menentukan ini.
        -- id DESC tetap jadi penentu kedua supaya hasilnya tidak acak kalau
        -- beberapa baris sama-sama ditandai utama.
        ORDER BY pph.is_primary DESC, pph.id DESC
        LIMIT 1
      ) ph ON TRUE
      ORDER BY rm.nama
    `)).rows;
    rows.forEach((r) => {
      r.tipe_label = TIPE_LABEL[r.tipe] || r.tipe;
      // Tiga nama dipakai di sini: `kategori_label` dan `tipe_label` untuk
      // Kategori, `jenis_label` untuk Jenis. `tipe_label` dipertahankan
      // karena klien dan view EJS yang sudah ada memakainya — menghapusnya
      // akan merusak halaman yang tidak ikut tiket ini.
      r.kategori_label = r.tipe_label;
      // NULL tetap null, BUKAN 'null' atau '': syarat tiket mensyaratkan
      // baris tanpa Jenis tidak menampilkan teks apa pun selain em dash.
      r.jenis_label = r.jenis ? (JENIS_LABEL[r.jenis] || r.jenis) : null;
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
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
  }

  try {
    const existing = (await db.query('SELECT id FROM raw_materials WHERE id = $1', [id])).rows[0];
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
    params.push(id);
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

// ===== Foto material (tiket 11d) =====
//
// Memakai services/photoUpload.js yang sama dengan nota PO, jadi aturan tipe
// berkas, batas ukuran, dan penamaannya tidak punya dua versi.

// POST /:id/foto — unggah atau ganti foto material.
//
// tanganiErrorUpload berbagi dengan fitur purchase-order — lihat komentar di
// services/photoUpload.js untuk alasannya.
router.post(
  '/:id/foto',
  requireAuth,
  validateToken,
  photoUpload.buatUploadFoto('material').single('foto'),
  photoUpload.tanganiErrorUpload,
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      await photoUpload.hapusBerkas(req.file?.filename);
      return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
    }

    try {
      const existing = (await db.query('SELECT id FROM raw_materials WHERE id = $1', [id])).rows[0];
      if (!existing) {
        await photoUpload.hapusBerkas(req.file?.filename);
        return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Berkas foto belum dipilih' });
      }

      // Ganti, bukan tambah: satu foto utama per material. Yang lama dihapus
      // lebih dulu supaya kegagalan di tengah tidak meninggalkan dua foto.
      const lama = await db.query(
        'SELECT file_path FROM raw_material_photos WHERE raw_material_id = $1',
        [id]
      );
      await db.query('DELETE FROM raw_material_photos WHERE raw_material_id = $1', [id]);
      for (const f of lama.rows) await photoUpload.hapusBerkas(f.file_path);

      await db.query(
        `INSERT INTO raw_material_photos (raw_material_id, file_path, is_primary)
         VALUES ($1, $2, 1)`,
        // is_primary diisi 1, bukan dibiarkan default 0. Kolom ini sudah ada
        // di skema dan query pembacaan bisa memakainya, jadi menyimpannya
        // dengan benar sekarang lebih murah daripada memperbaiki nanti.
        [id, req.file.filename]
      );

      res.json({ ok: true, data: { file_path: req.file.filename } });
    } catch (error) {
      await photoUpload.hapusBerkas(req.file?.filename);
      console.error('[materialsApi] POST foto error:', error.message);
      res.status(500).json({ ok: false, error: 'Gagal menyimpan foto material' });
    }
  }
);

// DELETE /:id/foto — hapus foto material.
router.delete('/:id/foto', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
  }

  try {
    // Keberadaan material dicek, bukan keberadaan fotonya — alasan yang sama
    // dengan endpoint foto PO: menghapus foto yang tidak ada sudah menghasilkan
    // keadaan yang diminta, sedangkan menghapus foto milik material yang tidak
    // ada adalah kesalahan yang perlu diberitahukan.
    const existing = (await db.query('SELECT id FROM raw_materials WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
    }

    const baris = await db.query(
      'SELECT file_path FROM raw_material_photos WHERE raw_material_id = $1',
      [id]
    );
    await db.query('DELETE FROM raw_material_photos WHERE raw_material_id = $1', [id]);
    for (const f of baris.rows) await photoUpload.hapusBerkas(f.file_path);
    res.json({ ok: true });
  } catch (error) {
    console.error('[materialsApi] DELETE foto error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menghapus foto material' });
  }
});

// DELETE /api/materials/:id — tolak jika masih dipakai transaksi/BOM.
router.delete('/:id', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
  }

  try {
    const usage = (await db.query(`
      SELECT
        (SELECT COUNT(*) FROM material_batches WHERE raw_material_id = $1) AS batches,
        (SELECT COUNT(*) FROM product_bom WHERE raw_material_id = $1) AS bom
    `, [id])).rows[0];

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

    // Berkas foto dibaca SEBELUM material dihapus. FK memang bercascade untuk
    // baris raw_material_photos, tetapi setelah materialnya hilang, baris foto
    // itu ikut lenyap dan daftar namanya tidak bisa dibaca lagi.
    const fotoRows = (await db.query(
      'SELECT file_path FROM raw_material_photos WHERE raw_material_id = $1',
      [id]
    )).rows;

    const deleted = (await db.query('DELETE FROM raw_materials WHERE id = $1 RETURNING id', [id])).rows[0];
    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Material tidak ditemukan' });
    }

    // Varian ikut terhapus lewat ON DELETE CASCADE. Baris foto juga, tetapi
    // BERKASNYA tidak — tanpa ini, setiap material yang dihapus meninggalkan
    // berkas yatim di disk yang tidak direferensikan siapa pun. Dulu komentar
    // di sini mengklaim cascade mengurus semuanya; itu hanya benar untuk
    // barisnya.
    for (const f of fotoRows) await photoUpload.hapusBerkas(f.file_path);
    res.json({ ok: true });
  } catch (error) {
    console.error('[materialsApi] DELETE error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menghapus material' });
  }
});

// Tetap diekspor sebagai router — index.js memakainya langsung di
// app.use('/api/materials', require(...)), jadi membungkusnya jadi
// `{ router, TIPE_LABEL }` akan merusak pemasangan rutenya.
//
// TIPE_LABEL ditempel sebagai properti supaya pemanggil lain bisa
// `require('.../routes').TIPE_LABEL` tanpa menyentuh kontrak app.use.
module.exports = router;
module.exports.TIPE_LABEL = TIPE_LABEL;
