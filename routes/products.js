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

router.get('/', isAuthenticated, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, COUNT(pv.id) as varian_count
    FROM products p LEFT JOIN product_variants pv ON p.id = pv.product_id
    GROUP BY p.id ORDER BY p.nama_produk
  `).all();
  res.render('products/index', { title: 'Data Produk', products, error: null });
});

router.get('/create', isAuthenticated, role('admin'), (req, res) => {
  res.render('products/create', { title: 'Tambah Produk', product: null, error: null });
});

router.post('/', isAuthenticated, role('admin'), (req, res) => {
  const { nama_produk, kategori, tipe_produksi } = req.body;
  let variants = req.body.variants;
  if (!nama_produk || !tipe_produksi) {
    return res.render('products/create', { title: 'Tambah Produk', error: 'Nama dan tipe produk harus diisi', product: null });
  }
  if (!Array.isArray(variants)) variants = variants ? [variants] : [];
  const result = db.prepare('INSERT INTO products (nama_produk, kategori, tipe_produksi) VALUES (?, ?, ?)')
    .run(nama_produk, kategori || '', tipe_produksi);
  const productId = result.lastInsertRowid;
  const ins = db.prepare('INSERT INTO product_variants (product_id, warna, size, sku) VALUES (?, ?, ?, ?)');
  for (const v of variants) {
    if (v && v.warna && v.size && v.sku) ins.run(productId, v.warna, v.size, v.sku);
  }
  res.redirect('/products?success=' + encodeURIComponent('Produk berhasil ditambahkan'));
});

router.get('/:id', isAuthenticated, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).send('Produk tidak ditemukan');
  product.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY warna, size').all(req.params.id);
  const photos = db.prepare('SELECT * FROM product_photos WHERE product_id = ? ORDER BY is_primary DESC, id ASC').all(req.params.id);
  const variantPrices = db.prepare(`
    SELECT vp.* FROM variant_prices vp
    JOIN product_variants pv ON pv.id = vp.variant_id
    WHERE pv.product_id = ?
  `).all(req.params.id);
  res.render('products/show', { title: product.nama_produk, product, photos, variantPrices, error: null });
});

router.get('/:id/edit', isAuthenticated, role('admin'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).send('Produk tidak ditemukan');
  product.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY warna, size').all(req.params.id);
  res.render('products/edit', { title: 'Edit Produk', product, error: null });
});

router.put('/:id', isAuthenticated, role('admin'), (req, res) => {
  const { nama_produk, kategori, tipe_produksi } = req.body;
  let variants = req.body.variants;
  db.prepare('UPDATE products SET nama_produk=?, kategori=?, tipe_produksi=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(nama_produk, kategori || '', tipe_produksi, req.params.id);
  db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
  if (!Array.isArray(variants)) variants = variants ? [variants] : [];
  const ins = db.prepare('INSERT INTO product_variants (product_id, warna, size, sku) VALUES (?, ?, ?, ?)');
  for (const v of variants) {
    if (v && v.warna && v.size && v.sku) ins.run(req.params.id, v.warna, v.size, v.sku);
  }
  res.redirect('/products?success=' + encodeURIComponent('Produk berhasil diubah'));
});

router.delete('/:id', isAuthenticated, role('admin'), (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.redirect('/products?success=' + encodeURIComponent('Produk berhasil dihapus'));
});

// Upload foto produk
router.post('/:id/photos', isAuthenticated, role('admin'), productPhotoUpload.single('foto'), (req, res) => {
  const productId = parseInt(req.params.id);
  const variantId = req.body.variant_id ? parseInt(req.body.variant_id) : null;
  const isPrimary = req.body.is_primary === '1' ? 1 : 0;
  if (!req.file) return res.redirect(`/products/${productId}?error=` + encodeURIComponent('File tidak ada'));
  try {
    if (isPrimary) {
      db.prepare('UPDATE product_photos SET is_primary = 0 WHERE product_id = ?').run(productId);
    }
    db.prepare('INSERT INTO product_photos (product_id, variant_id, file_path, is_primary) VALUES (?,?,?,?)')
      .run(productId, variantId, 'products/' + req.file.filename, isPrimary);
    res.redirect(`/products/${productId}?success=` + encodeURIComponent('Foto berhasil diupload'));
  } catch (e) {
    res.redirect(`/products/${productId}?error=` + encodeURIComponent(e.message));
  }
});

// Hapus foto produk
router.post('/:id/photos/:photoId/delete', isAuthenticated, role('admin'), (req, res) => {
  const productId = parseInt(req.params.id);
  const photo = db.prepare('SELECT * FROM product_photos WHERE id=? AND product_id=?').get(req.params.photoId, productId);
  if (!photo) return res.redirect(`/products/${productId}?error=` + encodeURIComponent('Foto tidak ditemukan'));
  db.prepare('DELETE FROM product_photos WHERE id=?').run(req.params.photoId);
  fs.promises.unlink(path.join(__dirname, '..', 'uploads', photo.file_path)).catch(() => {});
  res.redirect(`/products/${productId}?success=` + encodeURIComponent('Foto dihapus'));
});

// Set harga jual per-varian (#4 harga) — upsert
router.post('/variants/:variantId/price', isAuthenticated, role('admin'), (req, res) => {
  const variantId = req.params.variantId;
  const { harga_jual, berlaku_at } = req.body;
  const hj = parseFloat(harga_jual);
  const variantRow = db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(variantId);
  if (!variantRow) return res.status(404).send('Variant tidak ditemukan');
  if (isNaN(hj) || hj < 0) {
    return res.redirect(`/products/${variantRow.product_id}?error=` + encodeURIComponent('Harga tidak valid'));
  }
  try {
    db.prepare(`INSERT INTO variant_prices (variant_id, harga_jual, berlaku_at, updated_by)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(variant_id) DO UPDATE SET harga_jual=excluded.harga_jual, berlaku_at=excluded.berlaku_at, updated_by=excluded.updated_by`)
      .run(variantId, hj, berlaku_at || new Date().toISOString().slice(0,10), req.session.userId);
    res.redirect(`/products/${variantRow.product_id}?success=` + encodeURIComponent('Harga jual disimpan'));
  } catch (e) {
    res.redirect(`/products/${variantRow.product_id}?error=` + encodeURIComponent(e.message));
  }
});

// Set harga jual default produk (#4 harga)
router.post('/:id/default-price', isAuthenticated, role('admin'), (req, res) => {
  const productId = req.params.id;
  const hj = parseFloat(req.body.harga_jual_default) || 0;
  db.prepare('UPDATE products SET harga_jual_default = ? WHERE id = ?').run(hj, productId);
  res.redirect(`/products/${productId}?success=` + encodeURIComponent('Harga default disimpan'));
});

module.exports = router;
