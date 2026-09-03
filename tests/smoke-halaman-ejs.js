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

// Halaman yang harus memuat tanpa 500. 302 (redirect) dianggap wajar untuk
// halaman yang butuh parameter.
const HALAMAN = [
  '/dashboard',
  '/vendors',
  '/products',
  '/raw-materials',
  '/cek-data/material',
  '/purchase-imports',
  '/purchase-imports/create',
  '/production-batches',
  '/hpp',
  '/validation',
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
