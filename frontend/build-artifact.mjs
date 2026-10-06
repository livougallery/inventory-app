// Build artifact presentasi dari `dist-presentasi/presentasi.html`.
//
// Dua transformasi, dan hanya dua:
//
// 1. Bungkus ulang kerangka HTML supaya cocok dengan yang Artifact minta.
//    Halaman dibungkus server saat publish, jadi isinya ditulis langsung —
//    tanpa <!doctype>, <html>, <head>, <body> sendiri. Build Vite punya
//    semuanya, dan itu yang bikin halaman kosong di artifact.
//
// 2. Pasang stub `fetch` yang menjawab dari data contoh. Build presentasi ini
//    memanggil /api/vendors, /api/materials, /api/currencies, /api/purchase-
//    orders dan /api/csrf saat runtime. Di file:// request-nya jatuh ke path
//    "file" yang tidak ada, jadi gagal diam-diem. Di artifact, path yang sama
//    berarti request ke claude.ai — tanpa stub ini form PO akan menampilkan
//    "Gagal memuat daftar vendor" di depan owner.
//
// Isi stub diambil dari sample yang sudah ada di repo (lib/opsi.ts,
// pages/material-fulfillment/data-po.ts) supaya dropdown owner kelihatan
// berisi, bukan kosong.
//
// Keluaran: frontend/dist-artifact/index.html

import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const SRC = path.join(HERE, 'dist-presentasi', 'presentasi.html');
const OUT_DIR = path.join(HERE, 'dist-artifact');
const OUT = path.join(OUT_DIR, 'index.html');

const built = fs.readFileSync(SRC, 'utf8');

// Pisahkan kerangka build menjadi isi head dan isi body.
//
// Tag modul build ada di dalam <head>. Modul aktif setelah parser menutup
// head, jadi CSS-nya belum bisa berdesain sampai <body> ikut terparse —
// tidak apa-apa untuk presentasi (satu kedipan), tapi tidak boleh dipecah.
function splitDocument(html) {
  const headOpen = html.indexOf('<head>');
  const headClose = html.indexOf('</head>');
  const bodyOpen = html.indexOf('<body>');
  const bodyClose = html.lastIndexOf('</body>');

  if (headOpen === -1 || headClose === -1 || bodyOpen === -1 || bodyClose === -1) {
    throw new Error('Tag <head>/<body> tidak ditemukan di build presentasi.');
  }
  if (bodyOpen < headClose) {
    throw new Error('Urutan <body> sebelum </head> — tidak shopper di file ini.');
  }

  return {
    headInner: html.slice(headOpen + 6, headClose),
    bodyInner: html.slice(bodyOpen + 6, bodyClose),
  };
}

const FETCH_STUB = `
<script>
// ===== Stub fetch untuk build presentasi =====
//
// Build presentasi ini memanggil endpoint /api/ saat runtime. Di file://
// request-nya jatuh ke path "file" yang tidak ada lalu gagal diam-diem; di
// artifact, path yang sama berarti request ke claude.ai. Stub ini menjawab
// dari data contoh, jadi dropdown dan tabelnya berisi.
//
// Hanya endpoint yang memang dipanggil bundle. Mutasi (POST/PUT/DELETE)
// menjawab dengan pesan batas, bukan error HTTP: form-nya tetap bisa dipakai
// dan owner tahu ada batasnya — bukan为先 diam lalu bingung.
(function () {
  var ASLI = window.fetch;
  var ASET = {
    currency: [
      { id: 1, kode: 'IDR', nama: 'Rupiah Indonesia', simbol: 'Rp' },
      { id: 2, kode: 'USD', nama: 'Dolar Amerika Serikat', simbol: '$' },
      { id: 3, kode: 'CNY', nama: 'Yuan China', simbol: 'CNY' }
    ],
    material: [
      { id: 1, nama: 'Kain Rayon', satuan: 'yard', variants: [] },
      { id: 2, nama: 'Kain Linen', satuan: 'yard', variants: [] },
      { id: 3, nama: 'Kain Crepe', satuan: 'yard', variants: [] },
      { id: 4, nama: 'Karet Pinggang', satuan: 'pcs', variants: [] },
      { id: 5, nama: 'Resleting 20cm', satuan: 'pcs', variants: [] },
      { id: 6, nama: 'Kancing Kaca', satuan: 'pcs', variants: [] },
      { id: 7, nama: 'Hak Kait YKK', satuan: 'pcs', variants: [] },
      { id: 8, nama: 'Jasa Jahit', satuan: 'time', variants: [] }
    ],
    vendor: [
      { id: 1, nama: 'CV Aksesoris Jaya', tipe: 'bahan_baku' },
      { id: 2, nama: 'PT Textile Indo', tipe: 'bahan_baku' },
      { id: 3, nama: 'PT Supplier Maju Jaya', tipe: 'bahan_baku' },
      { id: 4, nama: 'UD Teknologi Nusantara', tipe: 'bahan_baku' },
      { id: 5, nama: 'CV Sumber Rezeki', tipe: 'bahan_baku' }
    ],
    po: [
      {
        id: 1, po_number: 'PO-2024-001', vendor: 'CV Aksesoris Jaya', tipe: 'bahan_baku',
        order_date: '2024-01-15', total_amount: 15500000, currency_id: 1, status: 'approved', items: []
      },
      {
        id: 2, po_number: 'PO-2024-002', vendor: 'PT Textile Indo', tipe: 'bahan_baku',
        order_date: '2024-01-16', total_amount: 8200000, currency_id: 1, status: 'pending', items: []
      },
      {
        id: 3, po_number: 'PO-2024-003', vendor: 'PT Supplier Maju Jaya', tipe: 'bahan_baku',
        order_date: '2024-01-20', total_amount: 12800000, currency_id: 1, status: 'processing', items: []
      }
    ],
    flow: ['livou_transfer', 'reimbursement']
  };

  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function ok(data) {
    return Promise.resolve(json({ ok: true, data: data }));
  }

  function batas() {
    return Promise.resolve(json({
      ok: false,
      error: 'Data contoh, bukan database. Yang disimpan tidak ikut ke artifact ini.'
    }));
  }

  window.fetch = function (input) {
    var alamat = typeof input === 'string' ? input : (input && input.url) || '';
    var args = arguments;
    var metode = String((args[1] && args[1].method) || 'GET').toUpperCase();
    var url;
    try {
      url = new URL(alamat, location.href);
    } catch (e) {
      url = new URL('/', location.href);
    }

    // Hanya same-origin yang dilayani. Permintaan ke host lain dibiarkan
    // lewat ke fetch asli: stub ini tidak berwenang berbohong tentang
    // kondisi internet di luar artifact.
    if (url.origin !== location.origin) {
      return ASLI.apply(window, args);
    }

    if (url.pathname === '/api/csrf') {
      // Bentuknya polos tanpa field ok (lihat lib/api.ts), jadi harus
      // distub di sini — lewat ok() akan selalu dianggap gagal.
      return Promise.resolve(json({ csrfToken: 'presentasi' }));
    }

    if (url.pathname === '/api/login') {
      return Promise.resolve(json({ ok: true, csrfToken: 'presentasi', redirect: '/' }));
    }

    if (metode !== 'GET') {
      return batas();
    }

    if (url.pathname === '/api/vendors' || url.pathname === '/api/vendors/') {
      return ok(ASET.vendor);
    }
    if (url.pathname === '/api/materials') {
      return ok(ASET.material);
    }
    if (url.pathname === '/api/currencies') {
      return ok(ASET.currency);
    }
    if (url.pathname === '/api/purchase-orders/flow-transaksi') {
      return ok(ASET.flow);
    }
    if (url.pathname === '/api/purchase-orders' || url.pathname === '/api/purchase-orders/') {
      return ok(ASET.po);
    }
    if (url.pathname.startsWith('/api/')) {
      return ok([]);
    }
    return ASLI.apply(window, args);
  };
})();
</script>
`;

const { headInner, bodyInner } = splitDocument(built);

const page = ['<title>Inventory System — Presentasi</title>', FETCH_STUB, headInner, bodyInner].join('\n');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');

const bytes = fs.statSync(OUT).size;
console.log('OK   ', OUT);
console.log('bytes', bytes, '=' + (bytes / 1048576).toFixed(2) + 'MB');
console.log('limit 16MB:', bytes <= 16 * 1048576 ? 'AMAN' : 'LEBIH BESAR');