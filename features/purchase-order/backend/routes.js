// Purchase order bahan baku — JSON API untuk React SPA (halaman
// /pembelian-material).
//
// Mengikuti konvensi features/vendor/backend/routes.js dan
// features/material/backend/routes.js: respons `{ ok: true, data }` /
// `{ ok: false, error }`, auth 401 JSON lewat requireAuth (bukan redirect),
// mutasi dilindungi validateToken CSRF.
//
// Tiket 05 membuat data bisa DIBACA; tiket 06 menambah create. Ubah, hapus,
// dan validasi menyusul di tiket 07-08.
const express = require('express');
const db = require('../../../db');
const { validateToken } = require('../../../middleware/csrf');
const { requireAuth } = require('../../../middleware/apiAuth');

const router = express.Router();

// Nilai kode `status` disimpan apa adanya di DB; label hanya untuk tampilan.
// Labelnya mengikuti views/purchase-orders/index.ejs supaya halaman EJS dan
// React tidak pernah memakai dua istilah berbeda untuk status yang sama.
const STATUS_LABEL = {
  pending: 'Pending',
  validated: 'Tervalidasi',
  rejected: 'Ditolak',
  received: 'Diterima',
};

const labelStatus = (status) => STATUS_LABEL[status] || status;

// `total` dihitung dengan COALESCE karena SUM atas nol baris menghasilkan NULL,
// sedangkan klien mengharapkan angka — PO tanpa item harus 0, bukan null.
const TOTAL_SQL = `(SELECT COALESCE(SUM(subtotal), 0)
                    FROM purchase_order_items i
                    WHERE i.purchase_order_id = po.id)`;

// GET /api/purchase-orders — daftar PO, terbaru lebih dulu.
router.get('/', requireAuth, async (req, res) => {
  try {
    // Tiebreak id DESC wajib, bukan gaya: di live DB tiga PO pertama punya
    // created_at identik sampai mikrodetik (hasil migrasi), jadi ORDER BY
    // created_at DESC saja mengembalikan urutan yang tidak ditentukan.
    const rows = (await db.query(`
      SELECT po.id, po.no_po, po.tgl_beli, po.status,
             v.nama AS vendor_nama,
             u.username AS creator_name,
             ${TOTAL_SQL} AS total
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN users u ON po.created_by = u.id
      ORDER BY po.created_at DESC, po.id DESC
    `)).rows;

    rows.forEach((r) => {
      r.status_label = labelStatus(r.status);
    });
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[purchaseOrdersApi] GET error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat data pembelian material' });
  }
});

// GET /api/purchase-orders/:id — satu PO beserta baris itemnya.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // id divalidasi sebelum dipakai: tanpa ini, '/abc' akan diteruskan ke
    // Postgres dan memicu 22P02 (invalid input syntax for integer) yang
    // berujung 500, padahal yang diminta klien adalah 404.
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(404).json({ ok: false, error: 'Purchase order tidak ditemukan' });
    }

    // Field validasi (catatan_reject, validator_name) sengaja belum dikirim:
    // UI-nya ranah tiket 07. Diambil saat itu nanti, bukan sekarang.
    const po = (await db.query(`
      SELECT po.id, po.no_po, po.tgl_beli, po.status,
             v.nama AS vendor_nama,
             u.username AS creator_name,
             ${TOTAL_SQL} AS total
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = $1
    `, [id])).rows[0];

    if (!po) {
      return res.status(404).json({ ok: false, error: 'Purchase order tidak ditemukan' });
    }

    const items = (await db.query(`
      SELECT i.id, i.qty, i.harga_satuan, i.subtotal,
             rm.nama AS material_nama,
             rm.satuan
      FROM purchase_order_items i
      LEFT JOIN raw_materials rm ON i.raw_material_id = rm.id
      WHERE i.purchase_order_id = $1
      ORDER BY i.id
    `, [id])).rows;

    po.status_label = labelStatus(po.status);
    po.items = items;
    res.json({ ok: true, data: po });
  } catch (error) {
    console.error('[purchaseOrdersApi] GET/:id error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal memuat detail purchase order' });
  }
});

// ===== Validasi payload create =====
//
// Semua pengecekan dikumpulkan di satu fungsi yang mengembalikan daftar
// masalah, bukan lemparan pertama yang ditemui. Alasan: form klien perlu
// menampilkan semua field yang salah sekaligus, dan server tidak boleh
// menyimpan apa pun bila ada satu saja yang tidak valid.

const isPositiveNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// Mengembalikan `{ ok: true, value }` atau `{ ok: false, error }`.
const validateCreatePayload = (body) => {
  const { vendor_id, no_po, tgl_beli, items, kurs_amount, currency_id } = body;

  if (vendor_id === undefined || vendor_id === null || vendor_id === '') {
    return { ok: false, error: 'Vendor wajib dipilih' };
  }
  const vendorId = Number(vendor_id);
  if (!Number.isInteger(vendorId) || vendorId < 1) {
    return { ok: false, error: 'Vendor tidak valid' };
  }

  const noPo = String(no_po ?? '').trim();
  if (!noPo) {
    return { ok: false, error: 'Nomor PO wajib diisi' };
  }

  const tglBeli = String(tgl_beli ?? '').trim();
  if (!tglBeli) {
    return { ok: false, error: 'Tanggal pembelian wajib diisi' };
  }

  // Satu PO tanpa item tidak bermakna, dan membuatnya akan menghasilkan total
  // 0 yang tidak bisa dijelaskan di daftar.
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Purchase order minimal memiliki satu item' };
  }

  const parsedItems = [];
  for (const raw of items) {
    // Item wajib objek biasa. Tanpa penjaga ini, `raw.raw_material_id` pada
    // null melempar TypeError — dan karena fungsi ini dipanggil di luar blok
    // try pada route, error itu tidak pernah menjadi 400. Klien bisa mengirim
    // bentuk apa pun, jadi bentuknya diverifikasi sebelum isinya dibaca.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Format item tidak valid' };
    }

    const materialId = Number(raw.raw_material_id);
    if (!Number.isInteger(materialId) || materialId < 1) {
      return { ok: false, error: 'Material wajib dipilih pada tiap item' };
    }

    const qty = Number(raw.qty);
    // qty dan harga wajib angka terbatas; angka nol ditolak karena baris
    // bernilai nol hanya akan mengaburkan total PO.
    if (!isPositiveNumber(qty) || qty <= 0) {
      return { ok: false, error: 'Qty harus berupa angka lebih dari 0' };
    }

    const hargaSatuan = Number(raw.harga_satuan);
    if (!isPositiveNumber(hargaSatuan) || hargaSatuan <= 0) {
      return { ok: false, error: 'Harga satuan harus berupa angka lebih dari 0' };
    }

    // Varian opsional. Nilai yang sengaja dikosongkan (null, '', 0) diperlakukan
    // sama dengan tidak dikirim — klien React mengirim '' saat dropdown dikosongkan.
    let variantId = null;
    if (raw.variant_id !== undefined && raw.variant_id !== null && raw.variant_id !== '' && raw.variant_id !== 0) {
      variantId = Number(raw.variant_id);
      if (!Number.isInteger(variantId) || variantId < 1) {
        return { ok: false, error: 'Varian tidak valid' };
      }
    }

    parsedItems.push({
      raw_material_id: materialId,
      qty,
      harga_satuan: hargaSatuan,
      // Subtotal dihitung di sini, di server. Nilai `subtotal` yang dikirim
      // klien tidak pernah dibaca — kalau dipercaya, total PO bisa diubah
      // sesuka hati dari browser.
      subtotal: qty * hargaSatuan,
      variant_id: variantId,
    });
  }

  // Kurs opsional; default 1 (rupiah). Nilai 0 atau negatif ditolak karena
  // akan menghasilkan nilai IDR 0 atau negatif pada perhitungan hilir.
  let kurs = 1;
  if (kurs_amount !== undefined && kurs_amount !== null && kurs_amount !== '') {
    kurs = Number(kurs_amount);
    if (!Number.isFinite(kurs) || kurs <= 0) {
      return { ok: false, error: 'Kurs harus berupa angka lebih dari 0' };
    }
  }

  // Currency opsional. Nilai yang sengaja dikosongkan (null, '', 0) diperlakukan
  // sama dengan tidak dikirim — dropdown React mengirim '' saat dikosongkan.
  let currencyId = null;
  if (currency_id !== undefined && currency_id !== null && currency_id !== '' && currency_id !== 0) {
    currencyId = Number(currency_id);
    if (!Number.isInteger(currencyId) || currencyId < 1) {
      return { ok: false, error: 'Currency tidak valid' };
    }
  }

  return {
    ok: true,
    value: { vendorId, noPo, tglBeli, items: parsedItems, kurs, currencyId },
  };
};

// POST /api/purchase-orders — buat PO beserta seluruh itemnya.
router.post('/', requireAuth, validateToken, async (req, res) => {
  const parsed = validateCreatePayload(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }
  const { vendorId, noPo, tglBeli, items, kurs, currencyId } = parsed.value;

  try {
    // Referensi dicek sebelum INSERT supaya nilai fiktif menjawab 400 yang
    // jelas, bukan error constraint mentah dari database.
    const vendor = (await db.query('SELECT id FROM vendors WHERE id = $1', [vendorId])).rows[0];
    if (!vendor) {
      return res.status(400).json({ ok: false, error: 'Vendor tidak ditemukan' });
    }

    if (currencyId !== null) {
      const currency = (await db.query(
        'SELECT id FROM currencies WHERE id = $1', [currencyId]
      )).rows[0];
      if (!currency) {
        return res.status(400).json({ ok: false, error: 'Currency tidak ditemukan' });
      }
    }

    const materialIds = [...new Set(items.map((i) => i.raw_material_id))];
    const materials = (await db.query(
      `SELECT id FROM raw_materials WHERE id = ANY($1::int[])`,
      [materialIds]
    )).rows;
    if (materials.length !== materialIds.length) {
      return res.status(400).json({ ok: false, error: 'Material tidak ditemukan' });
    }

    // Varian harus milik material pada baris yang SAMA. Pemeriksaan material
    // di atas tidak cukup: tanpa ini, item bisa mencantumkan material A
    // dengan varian milik material B, dan baris itu akan salah terbaca di
    // detail PO.
    const variantIds = [...new Set(items.map((i) => i.variant_id).filter((v) => v !== null))];
    if (variantIds.length > 0) {
      const variants = (await db.query(
        `SELECT id, raw_material_id FROM raw_material_variants WHERE id = ANY($1::int[])`,
        [variantIds]
      )).rows;

      const belongTo = new Map(variants.map((v) => [v.id, v.raw_material_id]));
      for (const item of items) {
        if (item.variant_id === null) continue;
        const owner = belongTo.get(item.variant_id);
        if (owner === undefined) {
          return res.status(400).json({ ok: false, error: 'Varian tidak ditemukan' });
        }
        if (owner !== item.raw_material_id) {
          return res.status(400).json({
            ok: false,
            error: 'Varian tidak sesuai dengan material pada baris yang sama',
          });
        }
      }
    }

    // PO dan seluruh itemnya dibuat dalam satu transaksi. Tanpa ini, kegagalan
    // di item ke-N akan meninggalkan PO tanpa item (atau item yatim) karena
    // INSERT pertama sudah terlanjur ter-commit.
    const created = await db.transaction(async (tx) => {
      const po = (await tx.query(
        `INSERT INTO purchase_orders
           (vendor_id, no_po, tgl_beli, status, created_by, kurs_amount, currency_id)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6)
         RETURNING id, no_po, tgl_beli, status, created_by, kurs_amount, currency_id`,
        // created_by diambil dari sesi, bukan dari body: mempercayai body
        // berarti siapa pun bisa mengaku sebagai pengguna lain.
        [vendorId, noPo, tglBeli, req.session.userId, kurs, currencyId]
      )).rows[0];

      for (const item of items) {
        await tx.query(
          `INSERT INTO purchase_order_items
             (purchase_order_id, raw_material_id, qty, harga_satuan, subtotal, variant_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [po.id, item.raw_material_id, item.qty, item.harga_satuan, item.subtotal, item.variant_id]
        );
      }

      return po;
    });

    // Dibaca ulang lewat query yang sama dengan GET /:id, supaya PO yang
    // dikembalikan bentuknya persis sama dengan yang akan ditampilkan klien
    // setelah navigasi — bukan bentuk mentah hasil INSERT.
    const row = (await db.query(`
      SELECT po.id, po.no_po, po.tgl_beli, po.status, po.created_by, po.kurs_amount,
             v.nama AS vendor_nama,
             u.username AS creator_name,
             cur.kode AS currency_kode,
             ${TOTAL_SQL} AS total
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN users u ON po.created_by = u.id
      LEFT JOIN currencies cur ON po.currency_id = cur.id
      WHERE po.id = $1
    `, [created.id])).rows[0];

    row.status_label = labelStatus(row.status);
    res.status(201).json({ ok: true, data: row });
  } catch (error) {
    console.error('[purchaseOrdersApi] POST error:', error.message);
    res.status(500).json({ ok: false, error: 'Gagal membuat purchase order' });
  }
});

module.exports = router;
