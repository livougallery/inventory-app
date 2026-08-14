// Menu "Material" (path /cek-data) — tabel gabungan dari Supabase, hanya untuk VIEW.
// Tujuannya mengecek apakah ada salah input data. Tidak ada aksi
// edit/hapus di sini; perbaikan data tetap lewat form masing-masing.
//
// View aktif (1 tabel per halaman), dinavigasi via tab:
//   /cek-data/material            — Data Material
//   /cek-data/pembelian-material  — Pembelian Material (kedatangan bahan baku)
//
// Di-hide untuk sekarang:
//   /cek-data/material-produk     — Material Produk (BOM per varian).
//   Kontennya lebih cocok di bawah menu Produk; dikembalikan dengan
//   menambah lagi link tab di views/cek-data/_table.ejs.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');

const TIPE_LABEL = {
  kain_roll: 'Kain (Roll)',
  kain_ecer: 'Kain (Ecer)',
  aksesoris: 'Aksesoris',
  cmt_cost: 'Jasa / CMT',
};

// 1. Data Material — raw_materials + agregasi raw_material_variants + harga
//    terakhir + foto bahan. Master bahan tidak menyimpan harga; harga diambil
//    dari batch pembelian terbaru.
router.get('/material', isAuthenticated, async (req, res) => {
  const rows = (await db.query(`
    SELECT rm.id, rm.kode_bahan, rm.nama, rm.tipe, rm.satuan,
           rm.stok, v.varian_list, hb.harga_terakhir, ph.foto_path
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
  });
  res.render('cek-data/material', { title: 'Material — Data Material', rows });
});

// 2. Pembelian Material — material_batches + No PO + vendor + PIC + flow
//    transaksi + bukti invoice + validasi finance. Varian bahan diambil dari
//    purchase_order_items (batch sendiri tidak menyimpan variant_id),
//    di-match via bahan + No PO; bila satu PO punya >1 varian bahan yang
//    sama, string_agg menampilkannya semua.
router.get('/pembelian-material', isAuthenticated, async (req, res) => {
  const rows = (await db.query(`
    SELECT mb.id, mb.tgl_masuk, rm.nama AS bahan, rm.satuan,
           mb.qty_awal, mb.harga_satuan, mb.source_type, po.no_po,
           po.id AS po_id, vi.varian_list, ven.nama AS supplier,
           COALESCE(NULLIF(uc.nama_lengkap, ''), uc.username) AS pic, po.created_by,
           po.status, po.flow_transaksi, uv.nama_lengkap AS validator,
           po.validated_at, ph.invoice_count
    FROM material_batches mb
    JOIN raw_materials rm ON rm.id = mb.raw_material_id
    LEFT JOIN purchase_orders po ON mb.source_type = 'po' AND po.id = mb.source_id
    LEFT JOIN vendors ven ON ven.id = po.vendor_id
    LEFT JOIN users uc ON uc.id = po.created_by
    LEFT JOIN users uv ON uv.id = po.validated_by
    LEFT JOIN LATERAL (
      SELECT string_agg(rmv.nama_varian, ', ' ORDER BY rmv.nama_varian) AS varian_list
      FROM purchase_order_items poi
      JOIN raw_material_variants rmv ON rmv.id = poi.variant_id
      WHERE mb.source_type = 'po' AND poi.purchase_order_id = mb.source_id
        AND poi.raw_material_id = mb.raw_material_id
    ) vi ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS invoice_count
      FROM purchase_order_photos pph
      WHERE pph.purchase_order_id = mb.source_id
    ) ph ON mb.source_type = 'po'
    ORDER BY mb.tgl_masuk DESC, mb.id DESC
  `)).rows;
  rows.forEach((r) => {
    r.no_po = r.no_po || '';
    r.varian_list = r.varian_list || '';
    r.supplier = r.supplier || '';
    r.pic = r.pic || '';
    r.flow_transaksi = r.flow_transaksi || '';
    r.validated_at = r.validated_at || '';
    r.invoice_url = r.invoice_count > 0 ? '/purchase-orders/' + r.po_id : '';
    // Finance validation: PO divalidasi oleh user role finance
    r.finance_status = r.status === 'validated' || r.status === 'received'
      ? 'Approved'
      : r.status === 'rejected' ? 'Rejected' : 'Pending';
  });
  res.render('cek-data/pembelian-material', { title: 'Material — Pembelian Material', rows });
});

// 3. Material Produk (BOM) per varian — DI-HIDE untuk sekarang (lihat catatan
//    di atas file). Routenya sengaja tidak dipasang; view + data tetap ada di
//    views/cek-data/material-produk.ejs kalau mau dikembalikan.

module.exports = router;
