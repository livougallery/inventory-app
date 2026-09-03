const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');
const ValidationService = require('../services/validationService');

// Pesan dari redirect dibaca dari query, bukan dari konstanta: `error` dan
// `success` dikirim sebagai query param oleh POST di bawah. Pola ini mengikuti
// routes/raw-materials.js:49. Tanpa baris ini, pesan kegagalan validasi ganda
// akan hilang diam-diam — view validation/index.ejs tidak membaca query
// sendiri.
router.get('/', isAuthenticated, role('finance'), async (req, res) => {
  const pendingPOs = (await db.query(`
    SELECT po.*, v.nama as vendor_nama, u.username as creator_name
    FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id
    LEFT JOIN users u ON po.created_by = u.id
    WHERE po.status = 'pending' ORDER BY po.created_at DESC
  `)).rows;

  const pendingCosts = (await db.query(`
    SELECT pc.*, pb.nama_batch, p.nama_produk
    FROM production_costs pc
    LEFT JOIN production_batches pb ON pc.batch_id = pb.id
    LEFT JOIN products p ON pb.product_id = p.id
    WHERE pc.status_validasi = 'pending' ORDER BY pc.created_at DESC
  `)).rows;

  const pendingImports = (await db.query(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    WHERE pi.status = 'pending' ORDER BY pi.created_at DESC
  `)).rows;

  res.render('validation/index', {
    title: 'Validasi Finance',
    pendingPOs,
    pendingCosts,
    pendingImports,
    error: req.query.error || null,
    success: req.query.success || null,
  });
});

// Nilai balik WAJIB diperiksa sejak tiket 08: approve/reject mengembalikan
// `false` kalau tidak ada baris yang berubah, artinya PO sudah diputuskan
// orang lain (atau tidak ada). Mengabaikannya berarti halaman ini mengumumkan
// keberhasilan untuk permintaan yang tidak melakukan apa-apa.
//
// Hal itu mudah terjadi: halaman ini menampilkan daftar PO pending, jadi
// dua finance bisa membukanya bersamaan dan berdua menekan tombol yang sama.
// Yang kalah harus diberi tahu, bukan diberi pesan sukses.
const APPROVE_GAGAL = '/validation?error=PO tidak bisa divalidasi. Statusnya sudah berubah.';
const REJECT_GAGAL = '/validation?error=PO tidak bisa ditolak. Statusnya sudah berubah.';

router.post('/po/:id/approve', isAuthenticated, role('finance'), async (req, res) => {
  const ok = await ValidationService.approvePurchaseOrder(req.params.id, req.session.userId);
  res.redirect(ok ? '/validation?success=PO berhasil divalidasi' : APPROVE_GAGAL);
});

router.post('/po/:id/reject', isAuthenticated, role('finance'), async (req, res) => {
  const ok = await ValidationService.rejectPurchaseOrder(
    req.params.id, req.session.userId, req.body.catatan || ''
  );
  res.redirect(ok ? '/validation?success=PO ditolak' : REJECT_GAGAL);
});

router.post('/cost/:id/approve', isAuthenticated, role('finance'), async (req, res) => {
  await ValidationService.approveProductionCost(req.params.id, req.session.userId);
  res.redirect('/validation?success=Biaya produksi berhasil divalidasi');
});

router.post('/cost/:id/reject', isAuthenticated, role('finance'), async (req, res) => {
  await ValidationService.rejectProductionCost(req.params.id, req.session.userId, req.body.catatan || '');
  res.redirect('/validation?success=Biaya produksi ditolak');
});

router.post('/import/:id/approve', isAuthenticated, role('finance'), async (req, res) => {
  await ValidationService.approvePurchaseImport(req.params.id, req.session.userId);
  res.redirect('/validation?success=Pembelian White Label berhasil divalidasi');
});

router.post('/import/:id/reject', isAuthenticated, role('finance'), async (req, res) => {
  await ValidationService.rejectPurchaseImport(req.params.id, req.session.userId, req.body.catatan || '');
  res.redirect('/validation?success=Pembelian White Label ditolak');
});

module.exports = router;
