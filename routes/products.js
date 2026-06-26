const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

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
  res.render('products/show', { title: product.nama_produk, product, error: null });
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

module.exports = router;
