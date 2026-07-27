const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

// Multer setup for product photos (one file at a time)
const productPhotoDir = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(productPhotoDir)) fs.mkdirSync(productPhotoDir, { recursive: true });
const productPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, productPhotoDir),
    filename: (req, file, cb) => cb(null, 'product-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

router.get('/', isAuthenticated, async (req, res) => {
  const products = (await db.query(`
    SELECT p.*, COUNT(pv.id) as varian_count, COALESCE(SUM(pv.stok), 0) as total_stok
    FROM products p LEFT JOIN product_variants pv ON p.id = pv.product_id
    GROUP BY p.id ORDER BY p.nama_produk
  `)).rows;
  res.render('products/index', { title: 'Data Produk', products, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  res.render('products/create', { title: 'Tambah Produk', product: null, error: null });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { nama_produk, kategori, tipe_produksi } = req.body;
  let variants = req.body.variants;
  if (!nama_produk || !tipe_produksi) {
    return res.render('products/create', { title: 'Tambah Produk', error: 'Nama dan tipe produk harus diisi', product: null });
  }
  if (!Array.isArray(variants)) variants = variants ? [variants] : [];
  const result = await db.run('INSERT INTO products (nama_produk, kategori, tipe_produksi) VALUES ($1, $2, $3) RETURNING id',
    [nama_produk, kategori || '', tipe_produksi]);
  const productId = result.returningId;
  for (const v of variants) {
    if (v && v.warna && v.size && v.sku) {
      await db.run('INSERT INTO product_variants (product_id, warna, size, sku) VALUES ($1, $2, $3, $4) RETURNING id',
        [productId, v.warna, v.size, v.sku]);
    }
  }
  res.redirect('/products?success=' + encodeURIComponent('Produk berhasil ditambahkan'));
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const product = await db.one('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!product) return res.status(404).send('Produk tidak ditemukan');
  product.variants = (await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY warna, size', [req.params.id])).rows;
  const photos = (await db.query('SELECT * FROM product_photos WHERE product_id = $1 ORDER BY is_primary DESC, id ASC', [req.params.id])).rows;
  const variantPrices = (await db.query(`
    SELECT vp.* FROM variant_prices vp
    JOIN product_variants pv ON pv.id = vp.variant_id
    WHERE pv.product_id = $1
  `, [req.params.id])).rows;
  res.render('products/show', { title: product.nama_produk, product, photos, variantPrices, error: null });
});

router.get('/:id/edit', isAuthenticated, role('admin'), async (req, res) => {
  const product = await db.one('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!product) return res.status(404).send('Produk tidak ditemukan');
  product.variants = (await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY warna, size', [req.params.id])).rows;
  res.render('products/edit', { title: 'Edit Produk', product, error: null });
});

router.put('/:id', isAuthenticated, role('admin'), async (req, res) => {
  const { nama_produk, kategori, tipe_produksi } = req.body;
  let variants = req.body.variants;
  await db.run('UPDATE products SET nama_produk=$1, kategori=$2, tipe_produksi=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4',
    [nama_produk, kategori || '', tipe_produksi, req.params.id]);
  await db.run('DELETE FROM product_variants WHERE product_id = $1', [req.params.id]);
  if (!Array.isArray(variants)) variants = variants ? [variants] : [];
  for (const v of variants) {
    if (v && v.warna && v.size && v.sku) {
      await db.run('INSERT INTO product_variants (product_id, warna, size, sku) VALUES ($1, $2, $3, $4) RETURNING id',
        [req.params.id, v.warna, v.size, v.sku]);
    }
  }
  res.redirect('/products?success=' + encodeURIComponent('Produk berhasil diubah'));
});

router.delete('/:id', isAuthenticated, role('admin'), async (req, res) => {
  await db.run('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.redirect('/products?success=' + encodeURIComponent('Produk berhasil dihapus'));
});

// Upload foto produk
router.post('/:id/photos', isAuthenticated, role('admin'), productPhotoUpload.single('foto'), async (req, res) => {
  const productId = parseInt(req.params.id);
  const variantId = req.body.variant_id ? parseInt(req.body.variant_id) : null;
  const isPrimary = req.body.is_primary === '1' ? 1 : 0;
  if (!req.file) return res.redirect(`/products/${productId}?error=` + encodeURIComponent('File tidak ada'));
  try {
    if (isPrimary) {
      await db.run('UPDATE product_photos SET is_primary = 0 WHERE product_id = $1', [productId]);
    }
    await db.run('INSERT INTO product_photos (product_id, variant_id, file_path, is_primary) VALUES ($1,$2,$3,$4) RETURNING id',
      [productId, variantId, 'products/' + req.file.filename, isPrimary]);
    res.redirect(`/products/${productId}?success=` + encodeURIComponent('Foto berhasil diupload'));
  } catch (e) {
    res.redirect(`/products/${productId}?error=` + encodeURIComponent(e.message));
  }
});

// Hapus foto produk
router.post('/:id/photos/:photoId/delete', isAuthenticated, role('admin'), async (req, res) => {
  const productId = parseInt(req.params.id);
  const photo = await db.one('SELECT * FROM product_photos WHERE id=$1 AND product_id=$2', [req.params.photoId, productId]);
  if (!photo) return res.redirect(`/products/${productId}?error=` + encodeURIComponent('Foto tidak ditemukan'));
  await db.run('DELETE FROM product_photos WHERE id=$1', [req.params.photoId]);
  fs.promises.unlink(path.join(__dirname, '..', 'uploads', photo.file_path)).catch(() => {});
  res.redirect(`/products/${productId}?success=` + encodeURIComponent('Foto dihapus'));
});

// Set harga jual per-varian (#4 harga) — upsert
router.post('/variants/:variantId/price', isAuthenticated, role('admin'), async (req, res) => {
  const variantId = req.params.variantId;
  const { harga_jual, berlaku_at } = req.body;
  const hj = parseFloat(harga_jual);
  const variantRow = await db.one('SELECT product_id FROM product_variants WHERE id = $1', [variantId]);
  if (!variantRow) return res.status(404).send('Variant tidak ditemukan');
  if (isNaN(hj) || hj < 0) {
    return res.redirect(`/products/${variantRow.product_id}?error=` + encodeURIComponent('Harga tidak valid'));
  }
  try {
    await db.run(`INSERT INTO variant_prices (variant_id, harga_jual, berlaku_at, updated_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT(variant_id) DO UPDATE SET harga_jual=excluded.harga_jual, berlaku_at=excluded.berlaku_at, updated_by=excluded.updated_by`,
      [variantId, hj, berlaku_at || new Date().toISOString().slice(0,10), req.session.userId]);
    res.redirect(`/products/${variantRow.product_id}?success=` + encodeURIComponent('Harga jual disimpan'));
  } catch (e) {
    res.redirect(`/products/${variantRow.product_id}?error=` + encodeURIComponent(e.message));
  }
});

// Set harga jual default produk (#4 harga)
router.post('/:id/default-price', isAuthenticated, role('admin'), async (req, res) => {
  const productId = req.params.id;
  const hj = parseFloat(req.body.harga_jual_default) || 0;
  await db.run('UPDATE products SET harga_jual_default = $1 WHERE id = $2', [hj, productId]);
  res.redirect(`/products/${productId}?success=` + encodeURIComponent('Harga default disimpan'));
});

module.exports = router;
