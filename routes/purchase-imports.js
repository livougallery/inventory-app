const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const role = require('../middleware/role');

// ===== Negara asal pembelian (tiket 09) =====
//
// Negara dicatat pada TRANSAKSI, bukan pada vendor: satu vendor bisa
// mendatangkan barang dari lebih dari satu negara. Konsekuensinya, negara
// baru diketahui saat transaksi terjadi — itu trade-off yang sudah disepakati
// di spesifikasi.
//
// Negara OPSIONAL. Dua baris purchase_imports yang sudah ada di live DB
// sama-sama tidak punya negara, jadi "tanpa negara" adalah keadaan normal,
// bukan kasus pinggiran.
//
// Negara tidak boleh ikut perhitungan HPP. Ia metadata deskriptif; kalau
// sampai masuk rumus, HPP berubah gara-gara memilih negara.

// Daftar negara untuk dropdown, urut alfabetis. Urutan datang dari ORDER BY,
// bukan dari urutan baris di tabel — kalau mengandalkan urutan insert,
// negara yang ditambahkan belakangan akan muncul di posisi acak.
const daftarNegara = () =>
  db.query('SELECT id, nama FROM negara ORDER BY nama').then((r) => r.rows);

// Mengubah nilai form `negara_id` menjadi id negara atau NULL.
//
// Mengembalikan objek, bukan nilai, karena ada TIGA hasil yang berbeda:
// id yang sah, "sengaja dikosongkan" (NULL), dan "tidak sah" (error).
// Mengembalikan null polos tidak bisa membedakan yang kedua dari yang ketiga.
//
// Nilai kosong ('', null, undefined) berarti NULL — BUKAN fallback ke negara
// pertama. Mengisi otomatis akan diam-diam mengarang asal pembelian, dan
// pengguna tak pernah tahu datanya salah.
async function parseNegara(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, negaraId: null };
  }
  const id = Number(raw);
  // Regex, bukan Number() saja: Number() meloloskan '1.0', ' 1 ', '+1'
  // sebagai id 1. Bukan masalah keamanan di sini, tapi satu negara tidak
  // perlu punya beberapa ejaan nilai.
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, error: 'Negara tidak valid' };
  }
  // Divalidasi terhadap tabel negara. Tanpa ini, id fiktif diteruskan ke
  // Postgres dan memicu pelanggaran FK (23503) yang menjawab 500 — padahal
  // yang diminta klien adalah pesan yang jelas.
  const ada = await db.one('SELECT id FROM negara WHERE id = $1', [id]);
  if (!ada) {
    return { ok: false, error: 'Negara tidak ditemukan' };
  }
  return { ok: true, negaraId: id };
}

// Opsi dropdown produk dan vendor — identik untuk create dan edit, sengaja
// tidak diduplikasi supaya kedua form tidak bisa berbeda isi.
async function opsiForm() {
  const products = (await db.query("SELECT * FROM products WHERE tipe_produksi='beli_jadi' ORDER BY nama_produk")).rows;
  for (const p of products) {
    p.variants = (await db.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY warna, size', [p.id])).rows;
  }
  const vendors = (await db.query("SELECT * FROM vendors WHERE tipe='import' ORDER BY nama")).rows;
  const negara = await daftarNegara();
  return { products, vendors, negara };
}

// Menghitung HPP per item. Rumusnya TIDAK berubah dari sebelum tiket 09 dan
// tidak melibatkan negara — sengaja dipisah jadi fungsi sendiri supaya
// perubahan pada form tidak tanpa sengaja menyentuh rumus ini.
function hitungHpp(hargaProduk, kurs, logistik, qty) {
  return (parseFloat(hargaProduk) * parseFloat(kurs || 1)) + (parseFloat(logistik || 0) / parseInt(qty));
}

// Field wajib form pembelian. Dipakai create dan edit supaya keduanya tidak
// punya dua definisi "data lengkap" yang bisa berbeda.
function validasiForm(body) {
  const { variant_id, vendor_id, tgl_beli, qty, harga_produk } = body;
  if (!variant_id || !vendor_id || !tgl_beli || !qty || !harga_produk) {
    return { ok: false, error: 'Data tidak lengkap' };
  }
  return { ok: true };
}

router.get('/', isAuthenticated, async (req, res) => {
  const imports = (await db.query(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama, u.username as creator_name,
           n.nama as negara_nama
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    LEFT JOIN users u ON pi.created_by = u.id
    LEFT JOIN negara n ON pi.negara_id = n.id
    ORDER BY pi.created_at DESC
  `)).rows;
  res.render('purchase-imports/index', { title: 'White Label', imports, error: null });
});

router.get('/create', isAuthenticated, role('admin'), async (req, res) => {
  const { products, vendors, negara } = await opsiForm();
  res.render('purchase-imports/create', {
    title: 'Input Pembelian White Label',
    products,
    vendors,
    negara,
    error: null,
  });
});

router.post('/', isAuthenticated, role('admin'), async (req, res) => {
  const { variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik } = req.body;

  const valid = validasiForm(req.body);
  if (!valid.ok) {
    return res.redirect('/purchase-imports/create?error=' + encodeURIComponent(valid.error));
  }

  const parsed = await parseNegara(req.body.negara_id);
  if (!parsed.ok) {
    return res.redirect('/purchase-imports/create?error=' + encodeURIComponent(parsed.error));
  }

  const hpp = hitungHpp(harga_produk, kurs, logistik, qty);
  await db.run(`INSERT INTO purchase_imports
    (variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik, hpp_per_item, created_by, negara_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs || 1, logistik || 0, hpp,
     req.session.userId, parsed.negaraId]);
  res.redirect('/purchase-imports?success=' + encodeURIComponent('Pembelian dicatat, menunggu validasi Finance'));
});

// ===== Ubah pembelian (tiket 09) =====
//
// Rute edit dibuat untuk tiket 09, yang mensyaratkan negara bisa diubah atau
// dikosongkan pada pembelian yang sudah ada. Sebelumnya fitur ubah tidak ada
// sama sekali untuk white label — bukan cuma view-nya, endpoint-nya juga.
//
// DIBATASI KE STATUS PENDING. Alasannya sama dengan penjaga pada purchase
// order (tiket 07): pembelian yang sudah divalidasi sudah masuk perhitungan
// HPP dan stok, jadi mengubahnya membuat angka yang sudah dipakai divergen
// dari datanya.

// POST dipakai, bukan PUT: form EJS di halaman ini tidak memakai
// method-override, dan menyimpannya lewat POST menghindari ketergantungan
// pada middleware tambahan yang tidak dipasang untuk rute ini.
router.get('/:id/edit', isAuthenticated, role('admin'), async (req, res) => {
  const imp = await db.one('SELECT * FROM purchase_imports WHERE id = $1', [req.params.id]);
  if (!imp) return res.status(404).send('Pembelian tidak ditemukan');

  if (imp.status !== 'pending') {
    return res.redirect('/purchase-imports/' + imp.id + '?error=' +
      encodeURIComponent('Pembelian tidak bisa diubah karena statusnya sudah ' + imp.status));
  }

  const { products, vendors, negara } = await opsiForm();
  res.render('purchase-imports/edit', {
    title: 'Ubah Pembelian White Label',
    imp,
    products,
    vendors,
    negara,
    error: null,
  });
});

router.post('/:id/edit', isAuthenticated, role('admin'), async (req, res) => {
  const id = req.params.id;
  const imp = await db.one('SELECT * FROM purchase_imports WHERE id = $1', [id]);
  if (!imp) return res.status(404).send('Pembelian tidak ditemukan');

  // Penjaga status diulang di sini, tidak hanya di GET: pengguna bisa
  // membuka form selagi pending lalu menekan Simpan setelah divalidasi.
  // Penjaga di GET saja tidak mencegah itu.
  if (imp.status !== 'pending') {
    return res.redirect('/purchase-imports/' + id + '?error=' +
      encodeURIComponent('Pembelian tidak bisa diubah karena statusnya sudah ' + imp.status));
  }

  const valid = validasiForm(req.body);
  if (!valid.ok) {
    return res.redirect('/purchase-imports/' + id + '/edit?error=' + encodeURIComponent(valid.error));
  }

  const parsed = await parseNegara(req.body.negara_id);
  if (!parsed.ok) {
    return res.redirect('/purchase-imports/' + id + '/edit?error=' + encodeURIComponent(parsed.error));
  }

  const { variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs, logistik } = req.body;
  const hpp = hitungHpp(harga_produk, kurs, logistik, qty);
  await db.run(`UPDATE purchase_imports
    SET variant_id=$1, vendor_id=$2, tgl_beli=$3, qty=$4, harga_produk=$5, kurs=$6,
        logistik=$7, hpp_per_item=$8, negara_id=$9
    WHERE id=$10 AND status='pending'`,
    [variant_id, vendor_id, tgl_beli, qty, harga_produk, kurs || 1, logistik || 0, hpp,
     parsed.negaraId, id]);
  res.redirect('/purchase-imports?success=' + encodeURIComponent('Pembelian berhasil diubah'));
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const imp = await db.one(`
    SELECT pi.*, pv.warna, pv.size, p.nama_produk, v.nama as vendor_nama, u.username as creator_name, uv.username as validator_name,
           n.nama as negara_nama
    FROM purchase_imports pi
    LEFT JOIN product_variants pv ON pi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN vendors v ON pi.vendor_id = v.id
    LEFT JOIN users u ON pi.created_by = u.id
    LEFT JOIN users uv ON pi.validated_by = uv.id
    LEFT JOIN negara n ON pi.negara_id = n.id
    WHERE pi.id = $1
  `, [req.params.id]);
  if (!imp) return res.status(404).send('Pembelian tidak ditemukan');
  // `error` dibaca dari query: redirect dari rute edit mengirim pesan
  // penolakan lewat ?error=. Tanpa ini pesannya hilang diam-diam, dan
  // pengguna cuma melihat halaman detail tanpa tahu mengapa ia dilempar
  // ke sini.
  res.render('purchase-imports/show', {
    title: 'Detail Pembelian',
    imp,
    error: req.query.error || null,
  });
});

module.exports = router;
