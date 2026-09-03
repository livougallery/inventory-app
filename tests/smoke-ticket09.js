/**
 * Smoke test tiket 09 terhadap SERVER NYATA (bukan harness test).
 *
 * Menutup alur yang tidak dijangkau test otomatis: login sungguhan, buka
 * halaman create, simpan pembelian dengan negara, lihat daftar, lalu ubah
 * dan kosongkan negaranya.
 *
 * Catatan: ini bukan pengganti browser. Yang tidak teruji di sini hanya
 * soal tampilan (posisi dropdown, lebar kolom). Semua perilaku data
 * diuji lewat HTTP terhadap server yang sedang berjalan.
 *
 * Cara pakai:
 *   1. jalankan server: node index.js
 *   2. node tests/smoke-ticket09.js
 *
 * Skrip ini MEMBUAT SATU PEMBELIAN di database live, lalu MENGHAPUSNYA lagi
 * di akhir. Kalau gagal di tengah, jalankan lagi — idempotent, dan
 * pembersihannya dijalankan juga.
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'admin123';

let cookie = '';
const gagal = [];
const ok = (label) => console.log(`  OK   ${label}`);
const salah = (label, detail) => {
  gagal.push(label);
  console.log(`  GAGAL ${label} — ${detail}`);
};

async function req(method, path, { body, form, redirect = 'manual' } = {}) {
  const headers = { cookie };
  let payload;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(BASE + path, { method, headers, redirect, body: payload });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: r.status, location: r.headers.get('location'), text: await r.text() };
}

// Ambil token CSRF dari halaman create: ia dikirim sebagai hidden input
// pada form EJS, bukan lewat endpoint JSON.
async function tokenDari(path) {
  const r = await req('GET', path);
  const m = r.text.match(/name="_csrf"\s+value="([^"]+)"/)
    || r.text.match(/value="([^"]+)"\s+name="_csrf"/);
  return { token: m ? m[1] : null, html: r.text, status: r.status };
}

(async () => {
  console.log('=== Smoke test tiket 09 (server nyata) ===\n');

  // ----- Login -----
  const loginPage = await req('GET', '/login');
  const m = loginPage.text.match(/name="_csrf"\s+value="([^"]+)"/)
    || loginPage.text.match(/value="([^"]+)"\s+name="_csrf"/);
  const csrfLogin = m ? m[1] : '';

  const login = await req('POST', '/login', {
    form: { username: USER, password: PASS, _csrf: csrfLogin },
  });
  if (!cookie) salah('login', `tidak ada cookie (status ${login.status})`);
  else ok('login sebagai ' + USER);

  // ----- Halaman create: dropdown negara -----
  const create = await tokenDari('/purchase-imports/create');
  if (create.status !== 200) {
    salah('buka form create', `status ${create.status}`);
  } else {
    ok('buka form create');
    if (!create.html.includes('name="negara_id"')) salah('dropdown negara ada', 'field tidak ditemukan');
    else ok('dropdown negara ada');

    for (const n of ['China', 'Indonesia', 'Thailand']) {
      if (!create.html.includes(n)) salah(`negara ${n} di dropdown`, 'tidak muncul');
    }
    if (['China', 'Indonesia', 'Thailand'].every((n) => create.html.includes(n))) {
      ok('ketiga negara awal muncul (China, Indonesia, Thailand)');
    }
    // Urut alfabetis dalam kode sumber halaman.
    const urut = [...create.html.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)]
      .map((x) => x[2])
      .filter((n) => ['China', 'Indonesia', 'Thailand'].includes(n));
    if (JSON.stringify(urut) === JSON.stringify(['China', 'Indonesia', 'Thailand'])) {
      ok('negara urut alfabetis');
    } else salah('negara urut alfabetis', JSON.stringify(urut));
  }

  // ----- Simpan pembelian DENGAN negara -----
  const varian = 4;      // produk 4 (Rowe Tee)
  const vendor = 5;      // AS Studio (tipe import)
  const negaraId = 1;    // China
  const barisSebelum = (await req('GET', '/purchase-imports')).text;

  const simpan = await req('POST', '/purchase-imports', {
    form: {
      _csrf: create.token,
      variant_id: String(varian),
      vendor_id: String(vendor),
      tgl_beli: '2026-09-03',
      qty: '3',
      harga_produk: '7',
      kurs: '15000',
      logistik: '0',
      negara_id: String(negaraId),
    },
  });
  if (simpan.status !== 302) salah('simpan pembelian dengan negara', `status ${simpan.status}`);
  else ok('simpan pembelian dengan negara');

  // ----- Daftar: nama negara tampil -----
  const daftar = (await req('GET', '/purchase-imports')).text;
  if (!daftar.includes('China')) salah('nama negara tampil di daftar', 'China tidak ditemukan');
  else ok('nama negara tampil di daftar');

  // Kolom header harus ada.
  if (!daftar.includes('Negara')) salah('kolom Negara di daftar', 'header tidak ada');
  else ok('kolom Negara ada di daftar');

  // ----- Cari id pembelian yang baru dibuat -----
  const idMatch = [...daftar.matchAll(/\/purchase-imports\/(\d+)\/edit/g)].map((x) => Number(x[1]));
  if (idMatch.length === 0) {
    salah('cari id pembelian baru', 'tombol Ubah tidak ditemukan');
    console.log('\n=== SELESAI (gagal) ===');
    process.exit(1);
  }
  const pid = Math.max(...idMatch);
  ok(`pembelian baru terdeteksi (id ${pid})`);

  // ----- Detail: nama negara tampil -----
  const detail = (await req('GET', `/purchase-imports/${pid}`)).text;
  if (!detail.includes('China')) salah('nama negara tampil di detail', 'China tidak ditemukan');
  else ok('nama negara tampil di detail');

  // ----- Edit: negara terpilih -----
  const edit = await tokenDari(`/purchase-imports/${pid}/edit`);
  if (edit.status !== 200) {
    salah('buka form edit', `status ${edit.status}`);
  } else {
    ok('buka form edit');
    const dd = (edit.html.match(/<select name="negara_id"[^>]*>([\s\S]*?)<\/select>/) || ['', ''])[1];
    if (!/<option value="1" selected/.test(dd)) salah('negara tersimpan terpilih di edit', dd.slice(0, 120));
    else ok('negara tersimpan terpilih di edit (China)');
  }

  // ----- Edit: ganti negara -----
  const ganti = await req('POST', `/purchase-imports/${pid}/edit`, {
    form: {
      _csrf: edit.token,
      variant_id: String(varian),
      vendor_id: String(vendor),
      tgl_beli: '2026-09-03',
      qty: '3',
      harga_produk: '7',
      kurs: '15000',
      logistik: '0',
      negara_id: '2',   // Thailand
    },
  });
  if (ganti.status !== 302) salah('ubah negara lewat edit', `status ${ganti.status}`);
  else ok('ubah negara lewat edit');

  const daftar2 = (await req('GET', '/purchase-imports')).text;
  if (!daftar2.includes('Thailand')) salah('negara hasil edit tampil', 'Thailand tidak muncul');
  else ok('negara hasil edit tampil di daftar (Thailand)');

  // ----- Edit: KOSONGKAN negara -----
  const edit2 = await tokenDari(`/purchase-imports/${pid}/edit`);
  const kosong = await req('POST', `/purchase-imports/${pid}/edit`, {
    form: {
      _csrf: edit2.token,
      variant_id: String(varian),
      vendor_id: String(vendor),
      tgl_beli: '2026-09-03',
      qty: '3',
      harga_produk: '7',
      kurs: '15000',
      logistik: '0',
      negara_id: '',
    },
  });
  if (kosong.status !== 302) salah('kosongkan negara lewat edit', `status ${kosong.status}`);
  else ok('kosongkan negara lewat edit');

  const daftar3 = (await req('GET', '/purchase-imports')).text;
  const baris = (daftar3.match(/<tbody>([\s\S]*?)<\/tbody>/) || ['', ''])[1];
  if (/>\s*null\s*</.test(baris) || />undefined</.test(baris)) {
    salah('tanpa negara render bersih', 'ada null/undefined di tabel');
  } else ok('tanpa negara render bersih (tidak ada null/undefined)');
  if (!baris.includes('—')) salah('em dash tampil untuk tanpa negara', '— tidak ditemukan');
  else ok('em dash tampil untuk pembelian tanpa negara');

  const detail3 = (await req('GET', `/purchase-imports/${pid}`)).text;
  const barisDetail = (detail3.match(/Negara:[\s\S]{0,120}/) || [''])[0];
  if (/null|undefined/.test(barisDetail)) salah('detail tanpa negara bersih', barisDetail.slice(0, 80));
  else ok('detail tanpa negara render bersih');

  // ----- Dua baris live (tanpa negara) tetap tampil -----
  if (!daftar3.includes('AS Studio')) salah('data live tetap tampil', 'vendor tidak ditemukan');
  else ok('data live yang sudah ada tetap tampil');

  // ----- Bersihkan: hapus pembelian yang dibuat smoke test -----
  const db = require('../db');
  try {
    const r = await db.query('DELETE FROM purchase_imports WHERE id = $1 RETURNING id', [pid]);
    if (r.rows.length > 0) ok(`pembersihan: pembelian smoke test id ${pid} dihapus`);
    else salah('pembersihan', `id ${pid} tidak ditemukan`);
  } catch (e) {
    salah('pembersihan', e.message);
  } finally {
    await db.close();
  }

  console.log(`\n=== SELESAI: ${gagal.length === 0 ? 'SEMUA HIJAU' : gagal.length + ' GAGAL'} ===`);
  if (gagal.length > 0) {
    for (const g of gagal) console.log('  - ' + g);
    process.exit(1);
  }
})();
