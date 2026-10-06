// Stub `fetch` untuk berkas presentasi offline.
//
// Dipasang sebagai <script> klasik tepat sebelum </head> di berkas HTML hasil
// build, supaya modul bundel (yang juga ada di head) memuat SETELAH stub aktif.
// Urutan di berkas tidak menentukan urutan jalan: modul `type="module"` itu
// deferred, jadi baru dieksekusi setelah dokumen selesai diparsing, sedangkan
// script klasik jalan begitu parser menyentuhnya.
//
// Kenapa stub diperlukan. Aplikasi ini memanggil endpoint /api/ saat runtime —
// memuat daftar vendor, material, mata uang, PO. Di file:// request itu jatuh ke
// path "file" yang tidak ada lalu gagal diam-diam; di server aplikasi yang
// hidup, request-nya jadi milik origin yang enshrined dan membawa cookie sesi
// owner. Stub menjawab dari data contoh supaya form di depan owner kelihatan
// berisi.
//
// CATATAN PENTING soal pencocokan path: di file://, `new URL('/api/vendors',
// location.href)` memberi pathname `/C:/api/vendors` — huruf drive ikut masuk.
// Jadi stub ini membuang awalan `/<huruf>:` sebelum membandingkan path. Tanpa itu,
// stub hanya benar di https dan halaman offline justru kosong.
//
//-stub ditulis sebagai teks biasa, bukan template literal, supaya di dalam
// berkas HTML tidak ada ${...} yang bisa tertukar dengan string lain.

export const FETCH_STUB = `
<script>
// Stub fetch untuk berkas presentasi offline.
(function () {
  var ASLI = window.fetch;

  var currency = [
    { id: 1, kode: 'IDR', nama: 'Rupiah Indonesia', simbol: 'Rp' },
    { id: 2, kode: 'USD', nama: 'Dolar Amerika Serikat', simbol: '$' },
    { id: 3, kode: 'CNY', nama: 'Yuan China', simbol: 'CNY' }
  ];
  var material = [
    { id: 1, nama: 'Kain Rayon', satuan: 'yard', variants: [] },
    { id: 2, nama: 'Kain Linen', satuan: 'yard', variants: [] },
    { id: 3, nama: 'Kain Crepe', satuan: 'yard', variants: [] },
    { id: 4, nama: 'Karet Pinggang', satuan: 'pcs', variants: [] },
    { id: 5, nama: 'Resleting 20cm', satuan: 'pcs', variants: [] },
    { id: 6, nama: 'Kancing Kaca', satuan: 'pcs', variants: [] },
    { id: 7, nama: 'Hak Kait YKK', satuan: 'pcs', variants: [] },
    { id: 8, nama: 'Jasa Jahit', satuan: 'time', variants: [] }
  ];
  var vendor = [
    { id: 1, nama: 'CV Aksesoris Jaya', tipe: 'bahan_baku' },
    { id: 2, nama: 'PT Textile Indo', tipe: 'bahan_baku' },
    { id: 3, nama: 'PT Supplier Maju Jaya', tipe: 'bahan_baku' },
    { id: 4, nama: 'UD Teknologi Nusantara', tipe: 'bahan_baku' },
    { id: 5, nama: 'CV Sumber Rezeki', tipe: 'bahan_baku' }
  ];
  var po = [
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
  ];

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
      error: 'Data contoh, bukan database. Yang disimpan tidak ikut ke berkas ini.'
    }));
  }

  // Buang awalan /<huruf>:. Di file://, URL absolut punya pathname
  // /C:/api/vendors — tanpa langkah ini stub tidak akan pernah cocok.
  function pathApi(pathname) {
    return pathname.replace(/^\\/[A-Za-z]:/, '');
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
    // kondisi internet di luar halaman ini.
    if (url.origin !== location.origin) {
      return ASLI.apply(window, args);
    }

    var p = pathApi(url.pathname);

    if (p === '/api/csrf') {
      // Bentuknya polos tanpa field ok (lihat lib/api.ts), jadi harus
      // distub di sini — lewat ok() akan selalu dianggap gagal.
      return Promise.resolve(json({ csrfToken: 'presentasi' }));
    }
    if (p === '/api/login') {
      return Promise.resolve(json({ ok: true, csrfToken: 'presentasi', redirect: '/' }));
    }
    if (metode !== 'GET') {
      return batas();
    }
    if (p === '/api/vendors' || p === '/api/vendors/') {
      return ok(vendor);
    }
    if (p === '/api/materials') {
      return ok(material);
    }
    if (p === '/api/currencies') {
      return ok(currency);
    }
    if (p === '/api/purchase-orders/flow-transaksi') {
      return ok(['livou_transfer', 'reimbursement']);
    }
    if (p === '/api/purchase-orders' || p === '/api/purchase-orders/') {
      return ok(po);
    }
    if (p.startsWith('/api/')) {
      return ok([]);
    }
    return ASLI.apply(window, args);
  };
})();
</script>
`;
