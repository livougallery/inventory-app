// Uji stub fetch di berkas presentasi offline.
//
// Stub diekstrak dari berkas yang benar-benar dibuka owner, lalu dijalankan di
// Node dengan `location` meniru file:// seperti yang ditemukan browser. Yang
// diuji bukan "kode stubnya kelihatan benar", tapi "berkas yang owner buka
// mengisi formnya".
//
// Jalankan: node tests/verifikasi-presentasi.test.cjs
const fs = require('node:fs');
const vm = require('node:vm');

const BERKAS = 'C:\\Users\\livou\\inventory-demo\\Inventory-APP-Presentasi.html';
const html = fs.readFileSync(BERKAS, 'utf8');

let lulus = 0;
let gagal = 0;
const daftarGagal = [];

function cek(nama, kondisi, tambahan) {
  if (kondisi) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    daftarGagal.push(nama);
    console.log('  GAGAL  ' + nama + (tambahan ? '  -> ' + tambahan : ''));
  }
}

// Ekstrak isi <script> yang berisi stub.
//
// JANGAN pakai indexOf('<script>') di sini: bundle React memuat string
// "<\\/script>" di dalam Javascript, jadi tag palsu itu lebih dulu ditemukan
// dan hasil ekstraksinya operator delete React sepanjang 845 KB.
function kodeStub() {
  const penanda = html.indexOf('// Stub fetch untuk berkas presentasi offline');
  if (penanda === -1) throw new Error('Stub tidak ada di berkas ini.');
  const awal = html.lastIndexOf('<script>', penanda);
  const akhir = html.indexOf('</script>', penanda);
  if (awal === -1 || akhir === -1) throw new Error('Tag <script> stub tidak ditemukan.');
  return html.slice(awal + '<script>'.length, akhir);
}

// Jalankan stub di sandbox. `panggilanAsli` dicatat setiap kali stub
// menyerahkan request ke fetch asli — itu satu-satunya bukti bahwa
// penjaga same-origin bekerja.
function jalankanStub(href, panggilAsli) {
  const sandbox = {
    location: { href, origin: new URL(href).origin },
    URL,
    Response,
    Promise,
    String,
    console,
  };
  sandbox.window = { fetch: panggilAsli };
  vm.createContext(sandbox);
  vm.runInContext(kodeStub(), sandbox);
  return sandbox.window.fetch;
}

const HREF = 'file:///C:/Users/livou/inventory-demo/Inventory-APP-Presentasi.html';
const OriginAsli = 'https://contoh.test';

(async function () {
  // ---------------------------------------------------------------- kerangka
  console.log('\n== kerangka berkas ==');
  cek('ada <!doctype>', /^<!doctype html>/i.test(html.trim()));
  cek('ada <html>', /<html/i.test(html));
  cek('ada <head> dan <body>', /<head>/.test(html) && /<body/.test(html));
  cek('stub terpasang tepat sekali',
    (html.match(/Stub fetch untuk berkas presentasi offline/g) || []).length === 1);
  cek('stub muncul sebelum </head>',
    html.indexOf('Stub fetch untuk berkas presentasi offline') < html.indexOf('</head>'));
  // urutan di berkas TIDAK menentukan urutan jalan: modul type="module" itu
  // deferred, jadi baru dieksekusi setelah dokumen selesai diparsing,
  // sedangkan stub script klasik jalan saat parser menyentuhnya. Yang
  // membuktikan urutan sebenarnya ada di verifikasi-browser-presentasi.mjs.

  // ------------------------------------------------ stub pada file:// (drive)
  console.log('\n== stub di file:// (path PUNYA huruf drive) ==');
  cek('origin file:// adalah "null"', new URL(HREF).origin === 'null');
  cek('path /api/vendors jadi /C:/api/vendors di file://',
    new URL('/api/vendors', HREF).pathname === '/C:/api/vendors',
    'dapat ' + new URL('/api/vendors', HREF).pathname);

  const flin = jalankanStub(HREF, () => {
    flin.lewat++;
    return Promise.resolve(new Response('ASLI'));
  });
  flin.lewat = 0;

  // Dua bentuk jawaban: JSON dari stub, atau teks 'ASLI' dari fetch asli
  // (yang tidak JSON sama sekali). Jadi reader harus tahan keduanya.
  const mintaMentah = async (alamat, options) => flin(alamat, options);
  const minta = async (alamat, options) => (await flin(alamat, options)).json();

  const vendor = await minta('/api/vendors');
  cek('GET /api/vendors -> ok', vendor.ok === true, JSON.stringify(vendor).slice(0, 90));
  cek('  daftar vendor terisi (5)',
    Array.isArray(vendor.data) && vendor.data.length === 5,
    'dapat ' + (Array.isArray(vendor.data) ? vendor.data.length : 'bukan array'));

  const material = await minta('/api/materials');
  cek('GET /api/materials -> 8 material', material.ok === true && material.data.length === 8);

  const mataUang = await minta('/api/currencies');
  cek('GET /api/currencies -> 3 mata uang', mataUang.ok === true && mataUang.data.length === 3);

  const po = await minta('/api/purchase-orders');
  cek('GET /api/purchase-orders -> 3 PO', po.ok === true && po.data.length === 3);

  const flow = await minta('/api/purchase-orders/flow-transaksi');
  cek('GET flow-transaksi -> 2 nilai', flow.ok === true && flow.data.length === 2);

  // Bentuk polos tanpa field ok — inilah yang bikin withCsrf selalu gagal kalau
  // tidak distub (lihat frontend/src/lib/api.ts).
  const csrf = await minta('/api/csrf');
  cek('GET /api/csrf -> csrfToken berupa string', typeof csrf.csrfToken === 'string',
    JSON.stringify(csrf).slice(0, 90));
  cek('  /api/csrf tanpa field ok (bentuk aslinya)', csrf.ok === undefined);

  // --------------------------------------------------------------- mutasi
  console.log('\n== mutasi ditolak dengan pesan batas ==');
  const simpan = await minta('/api/vendors', { method: 'POST' });
  cek('POST /api/vendors -> ok:false', simpan.ok === false);
  cek('  pesannya jelas (bukan error HTTP kosong)',
    typeof simpan.error === 'string' && simpan.error.length > 10, simpan.error);

  const hapus = await minta('/api/vendors/3', { method: 'DELETE' });
  cek('DELETE -> ok:false', hapus.ok === false);

  // --------------------------------------------- host lain dibiarkan lewat
  console.log('\n== permintaan ke host lain ==');
  const sebelum = flin.lewat;
  await mintaMentah(OriginAsli + '/api/vendors');
  cek('host lain DITERUSKAN ke fetch asli', flin.lewat === sebelum + 1,
    'nilai sebelum=' + sebelum + ' sesudah=' + flin.lewat);

  const sebelum2 = flin.lewat;
  const cdn = await mintaMentah('https://cdn.example.com/lib.js');
  cek('CDN lain juga diteruskan', flin.lewat === sebelum2 + 1);
  cek('  dan jawabannya milik fetch asli, bukan data contoh',
    (await cdn.text()) === 'ASLI');

  // ------------------------------------------- stub yang sama di https://
  console.log('\n== stub tetap benar di https (kalau nanti dipublish) ==');
  const hhttps = jalankanStub('https://claude.ai/artifact/abc', () =>
    Promise.resolve(new Response('ASLI')));
  const vHttps = await (await hhttps('/api/vendors')).json();
  cek('GET /api/vendors di https -> 5 vendor', vHttps.ok === true && vHttps.data.length === 5);

  // -------------------------------------------------------------- ringkasan
  console.log('\n== ringkasan ==');
  console.log('  lulus ' + lulus + ', gagal ' + gagal);
  if (gagal) {
    console.log('  yang gagal:');
    for (const n of daftarGagal) console.log('    - ' + n);
  }
  process.exit(gagal === 0 ? 0 : 1);
})();
