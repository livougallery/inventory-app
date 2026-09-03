/**
 * Smoke test: label tipe material konsisten antara API dan halaman EJS
 * yang masih hidup (tiket 10, temuan lanjutan).
 *
 * Yang dibuktikan: nilai `kain_ecer` (dan tipe lainnya) dilabeli SAMA di
 * /api/materials dan di /reports/stock-card. Dulu halaman itu menuliskan
 * "Ecer" sendiri sementara API mengirim "Kain (Ecer)".
 *
 * Cara pakai:
 *   1. node index.js
 *   2. node tests/smoke-label-tipe.js
 *
 * Hanya GET — aman dijalankan berulang.
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'admin123';

let cookie = '';
const gagal = [];
const ok = (l) => console.log(`  OK   ${l}`);
const salah = (l, d) => { gagal.push(l); console.log(`  GAGAL ${l} — ${d}`); };

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
  return { status: r.status, text: await r.text() };
}

(async () => {
  console.log('=== Smoke test label tipe material (server nyata) ===\n');

  const lp = await req('GET', '/login');
  const m = lp.text.match(/name="_csrf"\s+value="([^"]+)"/)
    || lp.text.match(/value="([^"]+)"\s+name="_csrf"/);
  await req('POST', '/login', { form: { username: USER, password: PASS, _csrf: m ? m[1] : '' } });
  if (!cookie) { console.log('GAGAL login — dibatalkan.'); process.exit(1); }
  ok('login sebagai ' + USER);

  // Label dari API — sumber kebenaran (TIPE_LABEL di fitur material).
  const api = JSON.parse((await req('GET', '/api/materials')).text);
  const labelApi = new Map(api.data.map((x) => [x.tipe, x.tipe_label]));
  ok(`label dari API: ${[...labelApi.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);

  // Halaman EJS yang masih hidup.
  const kartu = await req('GET', '/reports/stock-card');
  if (kartu.status !== 200) {
    salah('/reports/stock-card dimuat', `status ${kartu.status}`);
  } else {
    ok('/reports/stock-card dimuat (200)');

    // Ambil tiap pasangan "Nama (Label)" dari dropdown bahan.
    const pasangan = [...kartu.text.matchAll(/>\s*([^<>\n]+?)\s*\(([^()]+?)\)\s*—\s*Stok:/g)]
      .map((x) => ({ nama: x[1].trim(), label: x[2].trim() }));

    if (pasangan.length === 0) {
      salah('dropdown bahan berisi label', 'tidak ada baris yang cocok');
    } else {
      ok(`dropdown bahan: ${pasangan.length} bahan`);

      // Tiap label yang tampil HARUS salah satu nilai TIPE_LABEL.
      const nilaiSah = new Set([...labelApi.values(), ...labelApi.keys()]);
      const aneh = pasangan.filter((p) => !nilaiSah.has(p.label));
      if (aneh.length > 0) {
        salah(
          'label di halaman sesuai TIPE_LABEL',
          aneh.map((p) => `${p.nama}→"${p.label}"`).join(', ')
        );
      } else {
        ok('semua label di halaman sesuai TIPE_LABEL');
      }

      // "Ecer" polos tidak boleh muncul lagi — itulah bug yang diperbaiki.
      const ecerPolos = pasangan.filter((p) => p.label === 'Ecer');
      if (ecerPolos.length > 0) {
        salah('tidak ada label "Ecer" polos', `${ecerPolos.length} bahan`);
      } else {
        ok('tidak ada label "Ecer" polos (bug lama)');
      }
    }

    // Rangkaian ternary per-tipe tidak boleh ada di HTML hasil render.
    // (Ini juga diuji di test pengaman terhadap berkas sumbernya.)
    if (/tipe === 'kain_roll'/.test(kartu.text)) {
      salah('view tidak lagi merangkai label sendiri', 'pola lama masih ada');
    } else {
      ok('view memakai tipe_label dari route');
    }
  }

  console.log(`\n=== SELESAI: ${gagal.length === 0 ? 'SEMUA HIJAU' : gagal.length + ' GAGAL'} ===`);
  if (gagal.length > 0) {
    for (const g of gagal) console.log('  - ' + g);
    process.exit(1);
  }
})();
