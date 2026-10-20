// Register Produk — JSON API untuk React SPA halaman /modul/register-produk.
//
// Pola mengikuti features/vendor/backend/routes.js dan features/negara/backend/routes.js:
//   - respons { ok: true, data } / { ok: false, error }
//   - auth 401 JSON lewat requireAuth (bukan redirect)
//   - mutasi dilindungi validateToken CSRF
//
// Endpoint:
//   GET  /api/warna          — daftar master warna
//   POST /api/warna          — tambah warna baru
//   GET  /api/materials      — master bahan (kain + aksesoris) untuk dropdown BOM
//   GET  /api/products/register         — daftar produk + varian + marketplace + BOM
//   POST /api/products/register         — buat produk baru + varian + marketplace batch
//   PUT  /api/products/register/:id/marketplace — update status terdaftar / foto bukti
//   PUT  /api/products/register/:id/bom — ganti keputusan bahan produk
const express = require('express');
const db = require('../../../db');
const { validateToken } = require('../../../middleware/csrf');
const { requireAuth } = require('../../../middleware/apiAuth');
const { parseId } = require('../../../middleware/parseId');
const photoUpload = require('../../../services/photoUpload');

const router = express.Router();

/**
 * ===== Master Warna (/api/warna) =====
 */

// GET /api/warna — daftar warna urut kode, untuk form picker + tabel master.
router.get('/warna', requireAuth, async (req, res) => {
  try {
    const rows = (await db.query('SELECT kode, nama, created_at FROM warna ORDER BY kode')).rows;
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[warnaApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat daftar warna' });
  }
});

// POST /api/warna — tambah warna master.
router.post('/warna', requireAuth, validateToken, async (req, res) => {
  try {
    const kode = String(req.body.kode || '').trim().toUpperCase();
    const nama = String(req.body.nama || '').trim();
    if (!kode) {
      return res.status(400).json({ ok: false, error: 'Kode warna wajib diisi' });
    }
    if (!nama) {
      return res.status(400).json({ ok: false, error: 'Nama warna wajib diisi' });
    }

    const row = (await db.query(
      'INSERT INTO warna (kode, nama) VALUES ($1, $2) RETURNING kode, nama, created_at',
      [kode, nama]
    )).rows[0];
    res.status(201).json({ ok: true, data: row });
  } catch (error) {
    console.error('[warnaApi] POST error:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Kode warna sudah ada' });
    }
    res.status(500).json({ ok: false, error: 'Gagal menambah warna' });
  }
});

/**
 * ===== Register Produk (/api/products/register) =====
 */

// GET /api/products/register
// Daftar produk yang terdaftar di sistem Register, lengkap dengan:
//   - varian (warna, size, sku, stok, harga jual)
//   - warna master (untuk label konsisten)
//   - marketplace per platform (shopee/tiktok/shopify)
//
// Urutan: products.id DESC (terbaru dulu).
router.get('/products/register', requireAuth, async (req, res) => {
  try {
    // Ambil semua produk + kolom baru
    const products = (await db.query(
      'SELECT id, nama_produk, kategori, tipe_produksi, design_code, brand, harga_jual_default, created_at, updated_at FROM products ORDER BY id DESC'
    )).rows;

    const result = [];

    for (const p of products) {
      // Varian per produk
      const varian = (await db.query(
        'SELECT id, warna, size, sku, stok, warna_kode, hpp_saat_ini FROM product_variants WHERE product_id = $1 ORDER BY id',
        [p.id]
      )).rows;

      // Marketplace per produk
      const marketplaces = (await db.query(
        'SELECT platform, terdaftar, foto_bukti FROM product_marketplaces WHERE product_id = $1 ORDER BY platform',
        [p.id]
      )).rows;

      const foto = (await db.query(
        `SELECT file_path FROM product_photos
          WHERE product_id = $1
          ORDER BY is_primary DESC, id DESC
          LIMIT 1`,
        [p.id]
      )).rows[0];

      // BOM per produk — satu baris per (varian × bahan), apa adanya.
      //
      // Dikirim lewat endpoint yang sama, bukan endpoint kedua yang dipanggil
      // saat dialog dibuka: daftar produk sudah satu perjalanan, dan membuka
      // detail jadi perjalanan kedua berarti kartu produk menampilkan badge
      // DRAFT lebih dulu lalu berubah — badge yang berkedip membuat orang ragu
      // pada bacaannya.
      //
      // Bentuknya BARIS DATAR, bukan sudah dikelompokkan: yang butuh
      // pengelompokan cuma tampilan (per warna untuk kain, per jenis untuk
      // aksesoris), dan mengelompokkannya di sini berarti server ikut tahu
      // bentuk layar.
      //
      // `no_need` dikirim sebagai boolean. Kolomnya di database integer
      // (1 = sengaja tidak dipakai), dan menerjemahkan angkanya jadi kalimat
      // di sini akan membuat dua tempat tahu arti angka itu — kata "no need"
      // dipakai frontend untuk memutuskan draft/selesai, jadi frontend yang
      // menyimpannya.
      const bom = (await db.query(
        `SELECT pb.id, pb.variant_id, pb.raw_material_id, pb.qty_per_pcs,
                (COALESCE(pb.no_need, 0) = 1) AS no_need,
                COALESCE(pb.jenis, rm.jenis) AS jenis,
                rm.nama, rm.tipe, rm.satuan,
                pv.warna, pv.warna_kode, pv.size
           FROM product_bom pb
           JOIN product_variants pv ON pv.id = pb.variant_id
           LEFT JOIN raw_materials rm ON rm.id = pb.raw_material_id
          WHERE pv.product_id = $1
          ORDER BY rm.tipe NULLS LAST, rm.jenis NULLS LAST, rm.nama NULLS LAST, pv.id`,
        [p.id]
      )).rows;

      result.push({
        id: p.id,
        nama: p.nama_produk,
        kategori: p.kategori || '',
        tipe_produksi: p.tipe_produksi,
        design_code: p.design_code || '',
        brand: p.brand || '',
        harga: Number(p.harga_jual_default || 0),
        created_at: p.created_at,
        foto_path: foto?.file_path ?? null,
        varian: varian.map(v => ({
          id: v.id,
          warna: v.warna,
          warna_kode: v.warna_kode,
          size: v.size,
          sku: v.sku,
          stok: Number(v.stok || 0),
          hpp_saat_ini: Number(v.hpp_saat_ini || 0),
        })),
        marketplaces: marketplaces.map(m => ({
          platform: m.platform,
          terdaftar: Boolean(m.terdaftar),
          foto_bukti: m.foto_bukti,
        })),
        bom: bom.map(b => ({
          id: b.id,
          variant_id: b.variant_id,
          raw_material_id: b.raw_material_id,
          qty_per_pcs: Number(b.qty_per_pcs || 0),
          no_need: Boolean(b.no_need),
          nama: b.nama,
          tipe: b.tipe,
          jenis: b.jenis,
          satuan: b.satuan,
          warna: b.warna,
          warna_kode: b.warna_kode,
          size: b.size,
        })),
      });
    }

    res.json({ ok: true, data: result });
  } catch (error) {
    console.error('[registerProdukApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat daftar produk' });
  }
});

// POST /api/products/register/:id/foto — unggah atau ganti foto utama produk.
router.post(
  '/products/register/:id/foto',
  requireAuth,
  validateToken,
  photoUpload.buatUploadFoto('product').single('foto'),
  photoUpload.tanganiErrorUpload,
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      await photoUpload.hapusBerkas(req.file?.filename);
      return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'Berkas foto belum dipilih' });

    try {
      const existing = (await db.query('SELECT id FROM products WHERE id = $1', [id])).rows[0];
      if (!existing) {
        await photoUpload.hapusBerkas(req.file.filename);
        return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
      }

      const prior = (await db.query(
        'SELECT file_path FROM product_photos WHERE product_id = $1 AND variant_id IS NULL',
        [id]
      )).rows;
      await db.query(
        'DELETE FROM product_photos WHERE product_id = $1 AND variant_id IS NULL',
        [id]
      );
      for (const photo of prior) await photoUpload.hapusBerkas(photo.file_path);

      await db.query(
        `INSERT INTO product_photos (product_id, file_path, is_primary)
         VALUES ($1, $2, 1)`,
        [id, req.file.filename]
      );
      res.json({ ok: true, data: { file_path: req.file.filename } });
    } catch (error) {
      await photoUpload.hapusBerkas(req.file.filename);
      console.error('[registerProdukApi] POST photo error:', error.message);
      res.status(500).json({ ok: false, error: 'Gagal menyimpan foto produk' });
    }
  }
);

// PUT /api/products/register/:id — perbarui identitas produk.
//
// Lima kolom, bukan dua. `kategori` dan `register_date` ikut dibuka 19 Okt 2026
// atas permintaan pemilik ("kategori dan registered jg bisa lgsg edit kyk SKU
// dan Brand"); `nama_produk` menyusul di hari yang sama ("nama produk ... kalau
// di klik bisa langsung edit") — semuanya baris di daftar Identitas yang sama,
// jadi memisahkan endpointnya berarti satu tombol Simpan yang memanggil dua
// permintaan dan bisa gagal separuh.
//
// `kategori`, `register_date`, dan `nama_produk` OPSIONAL dan hanya ditulis
// kalau dikirim. Pemanggil yang cuma mengirim design_code + brand tetap jalan
// apa adanya, dan kolom yang tidak dikirim tidak ikut dikosongkan — beda antara
// "tidak diubah" dan "dikosongkan" harus tetap terjaga.
router.put('/products/register/:id', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
  }

  const designCode = String(req.body.design_code ?? '').trim();
  const brand = String(req.body.brand ?? '').trim();
  if (!designCode || !brand) {
    return res.status(400).json({ ok: false, error: 'SKU Produk dan Brand wajib diisi' });
  }

  /* Nama produk ikut disunting di daftar Identitas sejak 19 Okt 2026 (permintaan
     pemilik), jadi ia ikut lewat endpoint ini.

     Dipisah dari `kategori`/`register_date` di bawah karena kolomnya `NOT NULL`
     di database: mengirimnya kosong BUKAN "kosongkan" yang sah, melainkan
     pelanggaran constraint yang akan lolos ke `catch` dan keluar sebagai 500
     "Gagal memperbarui identitas produk" — pesan yang menunjuk ke arah yang
     salah. Karena itu kosong ditolak di sini sebagai 400. */
  const nama = req.body.nama_produk === undefined ? undefined : String(req.body.nama_produk).trim();
  if (nama !== undefined && !nama) {
    return res.status(400).json({ ok: false, error: 'Nama produk wajib diisi' });
  }

  /* Tanggal daftar hanya mengubah bagian tanggalnya.

     `<input type="date">` mengirim `YYYY-MM-DD` tanpa jam. Menulisnya apa
     adanya ke `created_at` yang bertipe TIMESTAMP akan menyetel jamnya ke
     00:00:00 — produk yang didaftarkan siang hari jadi terlihat didaftarkan
     tengah malam, dan urutannya di daftar (yang diurutkan `id`, bukan tanggal)
     tidak ikut berubah sehingga selisihnya baru ketahuan belakangan.

     Karena itu tanggalnya digabung dengan jam-menit-detik yang SUDAH ada:
     yang disunting pengguna cuma tanggalnya, sisanya dibiarkan. */
  const registerDate = req.body.register_date === undefined ? undefined : String(req.body.register_date).trim();
  if (registerDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(registerDate)) {
    return res.status(400).json({ ok: false, error: 'Tanggal daftar harus berformat YYYY-MM-DD' });
  }

  const kategori =
    req.body.kategori === undefined ? undefined : String(req.body.kategori).trim();

  try {
    const product = await db.one(
      `UPDATE products
          SET design_code = $1,
              brand = $2,
              kategori = COALESCE($3, kategori),
              created_at = COALESCE($4::date + (created_at::time), created_at),
              nama_produk = COALESCE($5, nama_produk),
              updated_at = NOW()
        WHERE id = $6
        RETURNING id, nama_produk, design_code, brand, kategori, created_at`,
      [designCode, brand, kategori ?? null, registerDate ?? null, nama ?? null, id]
    );
    if (!product) return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
    res.json({ ok: true, data: product });
  } catch (error) {
    console.error('[registerProdukApi] PUT identity error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memperbarui identitas produk' });
  }
});

// POST /api/products/register — buat produk + varian + marketplace.
// Body: { nama_produk, kategori, design_code, brand, harga, tipe_produk,
//         varian: [{ warna, size, sku, stok }], warna_kode?: { "Black": "BLK" } }
router.post('/products/register', requireAuth, validateToken, async (req, res) => {
  try {
    const result = await db.transaction(async (tx) => {
      const body = req.body;
      const nama = String(body.nama_produk || '').trim();
      if (!nama) {
        throw { status: 400, message: 'Nama produk wajib diisi' };
      }

      // 1. Insert produk
      const p = (await tx.query(
        `INSERT INTO products (nama_produk, kategori, design_code, brand, tipe_produksi, harga_jual_default)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [nama, body.kategori || '', body.design_code || null, body.brand || '',
         body.tipe_produksi || 'sendiri', Number(body.harga || 0)]
      )).rows[0];

      // 2. Insert varian + link warna_kode ke master
      if (Array.isArray(body.varian) && body.varian.length > 0) {
        for (const v of body.varian) {
          const warnaNama = String(v.warna || '').trim();
          const warnaKode = body.warna_kode && body.warna_kode[warnaNama]
            ? body.warna_kode[warnaNama]
            : null;

          await tx.query(
            `INSERT INTO product_variants (product_id, warna, size, sku, stok, warna_kode)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [p.id, warnaNama, String(v.size || ''), String(v.sku || ''),
             Number(v.stok || 0), warnaKode]
          );
        }
      }

      // 3. Insert marketplace — selalu 3 platform
      const platforms = ['shopee', 'tiktok', 'shopify'];
      for (const plat of platforms) {
        await tx.query(
          `INSERT INTO product_marketplaces (product_id, platform, terdaftar)
           VALUES ($1, $2, FALSE)`,
          [p.id, plat]
        );
      }

      // 4. Kembalikan data lengkap
      const varian = (await tx.query(
        'SELECT id, warna, warna_kode, size, sku, stok FROM product_variants WHERE product_id = $1 ORDER BY id',
        [p.id]
      )).rows;

      const marketplaces = (await tx.query(
        'SELECT platform, terdaftar FROM product_marketplaces WHERE product_id = $1 ORDER BY platform',
        [p.id]
      )).rows;

      return {
        id: p.id,
        nama: p.nama_produk,
        kategori: p.kategori,
        design_code: p.design_code,
        brand: p.brand,
        tipe_produksi: p.tipe_produksi,
        harga: Number(p.harga_jual_default || 0),
        varian: varian.map(v => ({
          id: v.id,
          warna: v.warna,
          warna_kode: v.warna_kode,
          size: v.size,
          sku: v.sku,
          stok: Number(v.stok || 0),
        })),
        marketplaces: marketplaces.map(m => ({
          platform: m.platform,
          terdaftar: Boolean(m.terdaftar),
          foto_bukti: null,
        })),
      };
    });

    res.status(201).json({ ok: true, data: result });
  } catch (error) {
    console.error('[registerProdukApi] POST error:', error.message);
    if (error.status) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }
    res.status(500).json({ ok: false, error: 'Gagal menambah produk' });
  }
});

// PUT /api/products/register/:id/variants — sinkronkan size untuk satu warna.
// Variant ID yang dipertahankan tidak berubah; variant yang dirujuk riwayat ditolak bila dihapus.
router.put('/products/register/:id/variants', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });

  const warnaKode = String(req.body.warna_kode || '').trim();
  const warnaKodeBaru = String(req.body.warna_kode_baru || warnaKode).trim();
  const variants = req.body.variants;
  if (!warnaKode || !warnaKodeBaru || !Array.isArray(variants)) {
    return res.status(400).json({ ok: false, error: 'Warna dan daftar size wajib diisi' });
  }
  const sizes = variants.map((v) => String(v?.size || '').trim());
  const ids = variants.filter((v) => v?.id != null).map((v) => {
    const raw = String(v.id);
    return parseId(raw);
  });
  if (sizes.some((s) => !s) || new Set(sizes.map((s) => s.toLocaleLowerCase())).size !== sizes.length || ids.some((variantId) => variantId === null) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ ok: false, error: 'Size wajib diisi dan tidak boleh berulang; ID varian harus valid dan unik' });
  }
  if (variants.length === 0 && req.body.hapus_semua !== true) {
    return res.status(400).json({ ok: false, error: 'Minimal satu size wajib diisi' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const product = await tx.one('SELECT id, design_code FROM products WHERE id = $1 FOR UPDATE', [id]);
      if (!product) throw { status: 404, message: 'Produk tidak ditemukan' };
      const warna = await tx.one('SELECT kode, nama FROM warna WHERE kode = $1', [warnaKodeBaru]);
      if (!warna) throw { status: 400, message: 'Warna master tidak ditemukan' };

      const current = (await tx.query(
        'SELECT id, size, sku FROM product_variants WHERE product_id = $1 AND warna_kode = $2 FOR UPDATE',
        [id, warnaKode]
      )).rows;
      const tujuanSudahDipakai = warnaKodeBaru !== warnaKode && (await tx.one(
        'SELECT EXISTS (SELECT 1 FROM product_variants WHERE product_id = $1 AND warna_kode = $2) AS used',
        [id, warnaKodeBaru]
      )).used;
      if (tujuanSudahDipakai) throw { status: 409, message: 'Warna tujuan sudah memiliki varian pada produk ini' };
      const currentById = new Map(current.map((v) => [v.id, v]));
      const sourceSkuPrefix = [product.design_code || '', warnaKode].filter(Boolean).join('-');
      const targetSkuPrefix = [product.design_code || '', warnaKodeBaru].filter(Boolean).join('-');
      const skuPrefix = targetSkuPrefix;
      const keep = new Set();
      for (const item of variants) {
        const size = String(item.size).trim();
        if (item.id != null) {
          const variantId = parseId(String(item.id));
          const existing = currentById.get(variantId);
          if (!existing) throw { status: 400, message: 'Varian tidak cocok dengan warna produk' };
          keep.add(variantId);
          const base = `${skuPrefix}-${size}`.replace(/^-+|-+$/g, '');
          const sourceStandardSku = [sourceSkuPrefix, existing.size].filter(Boolean).join('-');
          const sku = existing.sku === sourceStandardSku || existing.sku === existing.size
            ? base
            : existing.sku;
          if (existing.size !== size || existing.sku !== sku || warnaKodeBaru !== warnaKode) {
            await tx.query(
              'UPDATE product_variants SET warna = $1, warna_kode = $2, size = $3, sku = $4, updated_at = NOW() WHERE id = $5',
              [warna.nama, warnaKodeBaru, size, sku, variantId]
            );
          }
          continue;
        }
        const base = [product.design_code || '', warnaKodeBaru, size].filter(Boolean).join('-');
        await tx.query(
          `INSERT INTO product_variants (product_id, warna, size, sku, stok, warna_kode)
           VALUES ($1, $2, $3, $4, 0, $5)`,
          [id, warna.nama, size, base, warnaKodeBaru]
        );
      }

      const removeIds = current.filter((v) => !keep.has(v.id)).map((v) => v.id);
      if (warnaKodeBaru !== warnaKode && current.length && removeIds.length) {
        throw { status: 400, message: 'Pindah warna harus mempertahankan semua ID varian yang ada' };
      }
      if (removeIds.length) {
        const dependencies = await tx.one(
          `SELECT
             EXISTS (SELECT 1 FROM production_costs WHERE variant_id = ANY($1::integer[])) OR
             EXISTS (SELECT 1 FROM production_deliveries WHERE variant_id = ANY($1::integer[])) OR
             EXISTS (SELECT 1 FROM hpp_history WHERE variant_id = ANY($1::integer[])) OR
             EXISTS (SELECT 1 FROM purchase_imports WHERE variant_id = ANY($1::integer[])) OR
             EXISTS (SELECT 1 FROM shipment_invoices WHERE variant_id = ANY($1::integer[])) AS used`,
          [removeIds]
        );
        if (dependencies.used) throw { status: 409, message: 'Size ini sudah dipakai transaksi atau riwayat; tidak dapat dihapus.' };
        await tx.query('DELETE FROM product_variants WHERE id = ANY($1::integer[])', [removeIds]);
      }

      return (await tx.query(
        'SELECT id, warna, size, sku, stok, warna_kode, hpp_saat_ini FROM product_variants WHERE product_id = $1 AND warna_kode = $2 ORDER BY id',
        [id, warnaKodeBaru]
      )).rows;
    });
    res.json({ ok: true, data: result.map((v) => ({ ...v, stok: Number(v.stok || 0), hpp_saat_ini: Number(v.hpp_saat_ini || 0) })) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, error: error.message });
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'SKU varian sudah digunakan' });
    if (error.code === '23503') return res.status(409).json({ ok: false, error: 'Varian masih dipakai dan tidak dapat dihapus' });
    console.error('[registerProdukApi] PUT variants error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memperbarui varian' });
  }
});

// PUT /api/products/register/:id/bom — ganti keputusan BOM untuk satu warna.
// Tiap keputusan diterapkan pada seluruh size dengan warna_kode yang sama.
router.put('/products/register/:id/bom', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
  }

  const warnaKode = String(req.body.warna_kode || '').trim();
  const keputusan = req.body.keputusan;
  if (!warnaKode || !Array.isArray(keputusan)) {
    return res.status(400).json({ ok: false, error: 'Warna dan daftar keputusan wajib diisi' });
  }

  const jenisKeKategori = {
    roll: 'kain',
    ecer: 'kain',
    'hak kait': 'aksesoris',
    kancing: 'aksesoris',
    resleting: 'aksesoris',
    label: 'aksesoris',
    karet: 'aksesoris',
    renda: 'aksesoris',
    'kain pelapis': 'aksesoris',
  };
  const sudah = new Set();
  for (const item of keputusan) {
    const jenis = String(item?.jenis || '').trim();
    if (!Object.hasOwn(jenisKeKategori, jenis) || sudah.has(jenis)) {
      return res.status(400).json({ ok: false, error: 'Jenis BOM tidak valid atau berulang' });
    }
    sudah.add(jenis);

    if (item.no_need === true) {
      if (item.raw_material_id != null) {
        return res.status(400).json({ ok: false, error: 'Keputusan no-need tidak boleh memilih material' });
      }
      continue;
    }

    const belumDiputuskan = item.raw_material_id == null && (item.qty_per_pcs == null || item.qty_per_pcs === '' || Number(item.qty_per_pcs) === 0);
    if (belumDiputuskan) continue;

    const materialId = parseId(String(item.raw_material_id ?? ''));
    const qty = Number(item.qty_per_pcs);
    if (materialId === null || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, error: 'Material dan kebutuhan per pcs yang valid wajib diisi' });
    }
  }

  try {
    const rows = await db.transaction(async (tx) => {
      const product = await tx.one('SELECT id FROM products WHERE id = $1 FOR UPDATE', [id]);
      if (!product) throw { status: 404, message: 'Produk tidak ditemukan' };

      const variants = (await tx.query(
        `SELECT id FROM product_variants
          WHERE product_id = $1 AND warna_kode = $2
          ORDER BY id FOR UPDATE`,
        [id, warnaKode]
      )).rows;
      if (!variants.length) throw { status: 404, message: 'Warna tidak ditemukan pada produk' };

      for (const item of keputusan) {
        if (item.no_need === true || item.raw_material_id == null && Number(item.qty_per_pcs || 0) === 0) continue;
        const materialId = Number(item.raw_material_id);
        const material = await tx.one(
          'SELECT id FROM raw_materials WHERE id = $1 AND tipe = $2 AND jenis = $3',
          [materialId, jenisKeKategori[item.jenis], item.jenis]
        );
        if (!material) throw { status: 400, message: 'Material tidak sesuai dengan jenis BOM' };
      }

      const variantIds = variants.map((v) => v.id);
      await tx.query('DELETE FROM product_bom WHERE variant_id = ANY($1::integer[])', [variantIds]);
      for (const variant of variants) {
        for (const item of keputusan) {
          if (item.no_need !== true && item.raw_material_id == null && Number(item.qty_per_pcs || 0) === 0) continue;
          // Baris "no need" tidak menunjuk material apa pun, jadi `jenis`-nya
          // tidak bisa dibaca lewat join ke `raw_materials` — tanpa ditulis di
          // sini, keputusannya tersimpan tapi jenisnya hilang saat daftar
          // dimuat ulang, dan barisnya lalu tampak seperti tidak pernah
          // disimpan. Baris material tetap membiarkan join yang menentukan
          // jenisnya, supaya mengubah jenis material ikut terbaca di sini.
          if (item.no_need === true) {
            await tx.query(
              `INSERT INTO product_bom (variant_id, raw_material_id, qty_per_pcs, no_need, jenis)
               VALUES ($1, NULL, 0, 1, $2)`,
              [variant.id, item.jenis]
            );
          } else {
            await tx.query(
              `INSERT INTO product_bom (variant_id, raw_material_id, qty_per_pcs, no_need)
               VALUES ($1, $2, $3, NULL)`,
              [variant.id, Number(item.raw_material_id), Number(item.qty_per_pcs)]
            );
          }
        }
      }

      return (await tx.query(
        `SELECT pb.id, pb.variant_id, pb.raw_material_id, pb.qty_per_pcs,
                (COALESCE(pb.no_need, 0) = 1) AS no_need,
                COALESCE(pb.jenis, rm.jenis) AS jenis,
                rm.nama, rm.tipe, rm.satuan,
                pv.warna, pv.warna_kode, pv.size
           FROM product_bom pb
           JOIN product_variants pv ON pv.id = pb.variant_id
           LEFT JOIN raw_materials rm ON rm.id = pb.raw_material_id
          WHERE pv.product_id = $1 AND pv.warna_kode = $2
          ORDER BY rm.tipe NULLS LAST, rm.jenis NULLS LAST, rm.nama NULLS LAST, pv.id`,
        [id, warnaKode]
      )).rows;
    });

    res.json({
      ok: true,
      data: rows.map((b) => ({
        id: b.id,
        variant_id: b.variant_id,
        raw_material_id: b.raw_material_id,
        qty_per_pcs: Number(b.qty_per_pcs || 0),
        no_need: Boolean(b.no_need),
        nama: b.nama,
        tipe: b.tipe,
        jenis: b.jenis,
        satuan: b.satuan,
        warna: b.warna,
        warna_kode: b.warna_kode,
        size: b.size,
      })),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }
    console.error('[registerProdukApi] PUT BOM error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal menyimpan BOM' });
  }
});

// PUT /api/products/register/:id/marketplace — update status terdaftar.
// Body: { platform, terdaftar, foto_bukti? }
router.put('/products/register/:id/marketplace', requireAuth, validateToken, async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
  }

  const { platform, terdaftar, foto_bukti } = req.body;
  if (!platform || !['shopee', 'tiktok', 'shopify'].includes(platform)) {
    return res.status(400).json({ ok: false, error: 'Platform tidak valid' });
  }

  try {
    // Cek produk ada
    const existing = (await db.query('SELECT id FROM products WHERE id = $1', [id])).rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Produk tidak ditemukan' });
    }

    // Upsert marketplace row
    await db.query(
      `INSERT INTO product_marketplaces (product_id, platform, terdaftar, foto_bukti, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (product_id, platform) DO UPDATE SET
         terdaftar = EXCLUDED.terdaftar,
         foto_bukti = EXCLUDED.foto_bukti,
         updated_at = NOW()`,
      [id, platform, Boolean(terdaftar), foto_bukti || null]
    );

    // Kembalikan data marketplace yang diupdate
    const row = (await db.query(
      'SELECT platform, terdaftar, foto_bukti FROM product_marketplaces WHERE product_id = $1 AND platform = $2',
      [id, platform]
    )).rows[0];

    res.json({ ok: true, data: row });
  } catch (error) {
    console.error('[registerProdukApi] PUT marketplace error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memperbarui marketplace' });
  }
});

module.exports = router;
