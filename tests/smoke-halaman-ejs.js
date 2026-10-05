/**
 * Smoke test halaman EJS setelah perubahan middleware/auth.js (tiket 09).
 *
 * isAuthenticated kini mengisi res.locals.user dan res.locals.currentPath.
 * Perubahan itu menyentuh SEMUA halaman EJS, bukan cuma white label — jadi
 * tiap halaman perlu dicek tidak menjadi 500.
 *
 * Cara pakai:
 *   1. node index.js
 *   2. node tests/smoke-halaman-ejs.js
 *
 * Hanya melakukan GET, jadi aman dijalankan berulang.
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'admin123';

let cookie = '';
const gagal = [];

async function req(method, path, { form, redirect = 'manual' } = {}) {
  const headers = { cookie };
  let payload;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  }
  const r = await fetch(BASE + path, { method, headers, redirect, body: payload });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, location: r.headers.get('location'), text: await r.text() };
}

// Halaman EJS yang harus memuat tanpa 500. 302 (redirect) dianggap wajar untuk
// halaman yang butuh parameter.
//
// Hanya halaman EJS. Daftar ini sengaja tidak memuat path yang ada di
// SPA_ROUTES (`/products`, `/vendors`, `/purchase-orders`,
// `/production-batches`, `/hpp`) maupun `/dashboard`: semuanya dilayani
// React — catch-all SPA, atau `app.get('/dashboard', serveSPA)` di
// index.js — SEBELUM router EJS sempat jalan. Mengujinya di sini tidak pernah
// menyentuh view EJS sama sekali, jadi check yang hijau itu hijau karena
// React sehat, bukan karena view EJS sehat. Itu persis green check yang
// tidak menguji apa-apa.
//
// `/raw-materials` dan `/cek-data/material` juga tidak ada: keduanya tidak
// pernah punya route yang ter-mount, dan sekarang view-nya sudah dihapus
// (tiket 02) — mengujinya hanya menghasilkan 404 yang memang tak salah.
//
// CATATAN PENTING soal `/validation`: route-nya `role('finance')`, sedangkan
// user smoke ini `admin`. `middleware/role.js` menjawab 403 dan me-render
// `error`, jadi entri ini **tidak** menguji `views/validation/index.ejs` —
// ia menguji `views/error.ejs`. Yang ia buktikan adalah bahwa middleware
// role tidak melempar saat menolak, bukan bahwa halaman validasi sehat.
// Smoke test hijau di sini tidak berarti halaman validasi sehat.
// Untuk menguji view-nya sendiri, jalankan dengan SMOKE_USER=<user finance>.
//
// `/admin/currencies` ditambahkan (tiket 02): ter-mount di `index.js:237`,
// ditautkan dari sidebar (`views/layout.ejs:224`), dan punya form yang membaca
// `csrfToken` — jadi ia live EJS yang belum pernah masuk daftar ini.
const HALAMAN = [
  '/purchase-imports',
  '/purchase-imports/create',
  '/validation',
  '/reports/stock-card',
  '/reports/monthly-expenses',
  '/admin/currencies',
];

(async () => {
  console.log('=== Smoke test halaman EJS (setelah perubahan auth) ===\n');

  const lp = await req('GET', '/login');
  const m = lp.text.match(/name="_csrf"\s+value="([^"]+)"/)
    || lp.text.match(/value="([^"]+)"\s+name="_csrf"/);
  await req('POST', '/login', { form: { username: USER, password: PASS, _csrf: m ? m[1] : '' } });
  if (!cookie) {
    console.log('GAGAL login — smoke test dibatalkan.');
    process.exit(1);
  }
  console.log('OK   login\n');

  for (const h of HALAMAN) {
    const r = await req('GET', h);
    if (r.status === 500) {
      // Ambil baris error-nya kalau ada, supaya tidak perlu buka log.
      const err = (r.text.match(/Error:[^\n]{0,160}/) || ['(tidak ada pesan)'])[0];
      gagal.push(h);
      console.log(`GAGAL ${h} → 500 — ${err}`);
    } else if (r.status === 404) {
      // 404 untuk halaman yang memang tidak ada rutenya tidak dihitung gagal,
      // tapi tetap dilaporkan supaya tidak lolos tanpa perhatian.
      console.log(`LEWAT ${h} → 404 (tidak ada rutenya)`);
    } else if (r.status === 302) {
      console.log(`OK   ${h} → 302 (redirect, wajar)`);
    } else {
      console.log(`OK   ${h} → ${r.status}`);
    }
  }

  console.log(`\n=== SELESAI: ${gagal.length === 0 ? 'TIDAK ADA HALAMAN 500' : gagal.length + ' HALAMAN 500'} ===`);
  if (gagal.length > 0) {
    for (const g of gagal) console.log('  - ' + g);
    process.exit(1);
  }
})();
