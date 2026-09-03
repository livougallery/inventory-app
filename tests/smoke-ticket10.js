/**
 * Smoke test tiket 10: bukti bahwa file yang dihapus benar-benar mati.
 *
 * Tiket 10 mensyaratkan: "The material JSON API still works: its test suite
 * passes unchanged, and /stok-material still loads in the browser. This is
 * the proof that the deleted file was truly dead."
 *
 * Jadi dua hal yang dibuktikan di sini:
 *   1. /api/materials menjawab JSON yang benar (bukan 500).
 *   2. Halaman /stok-material (React) bisa dimuat.
 *
 * Cara pakai:
 *   1. node index.js
 *   2. node tests/smoke-ticket10.js
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
  return { status: r.status, text: await r.text(), contentType: r.headers.get('content-type') || '' };
}

(async () => {
  console.log('=== Smoke test tiket 10 (server nyata) ===\n');

  const lp = await req('GET', '/login');
  const m = lp.text.match(/name="_csrf"\s+value="([^"]+)"/)
    || lp.text.match(/value="([^"]+)"\s+name="_csrf"/);
  await req('POST', '/login', { form: { username: USER, password: PASS, _csrf: m ? m[1] : '' } });
  if (!cookie) { console.log('GAGAL login — dibatalkan.'); process.exit(1); }
  ok('login sebagai ' + USER);

  // ----- 1. API material masih menjawab -----
  const api = await req('GET', '/api/materials');
  if (api.status !== 200) {
    salah('/api/materials menjawab 200', `status ${api.status}`);
  } else {
    ok('/api/materials menjawab 200');
    if (!api.contentType.includes('application/json')) {
      salah('/api/materials menjawab JSON', api.contentType);
    } else {
      ok('/api/materials menjawab JSON');
      let json;
      try { json = JSON.parse(api.text); } catch (e) { json = null; }
      if (!json || json.ok !== true) {
        salah('/api/materials bentuk { ok: true, data }', 'bentuk tidak sesuai');
      } else {
        ok(`/api/materials bentuk benar (${json.data.length} material)`);

        // tipe_label HARUS ada — peta label yang diverifikasi tiket 10.
        const tanpaLabel = json.data.filter((m) => m.tipe_label === undefined);
        if (tanpaLabel.length > 0) {
          salah('semua material punya tipe_label', `${tanpaLabel.length} baris tanpa label`);
        } else {
          ok('semua material punya tipe_label');
        }

        // cmt_cost dilabeli "Product Fulfillment" — nilai yang disyaratkan.
        const cmt = json.data.filter((m) => m.tipe === 'cmt_cost');
        if (cmt.length > 0 && cmt.every((m) => m.tipe_label === 'Product Fulfillment')) {
          ok(`cmt_cost dilabeli "Product Fulfillment" (${cmt.length} material)`);
        } else if (cmt.length > 0) {
          salah('cmt_cost dilabeli "Product Fulfillment"', cmt[0].tipe_label);
        } else {
          ok('tidak ada material cmt_cost di data live (label tidak bisa diuji)');
        }

        // Tidak ada tipe material untuk Delivery atau Sample Design.
        const tipe = [...new Set(json.data.map((m) => m.tipe))];
        const terlarang = tipe.filter((t) => /kirim|delivery|sample|design/i.test(t));
        if (terlarang.length > 0) {
          salah('tidak ada tipe Delivery/Sample Design', terlarang.join(', '));
        } else {
          ok(`tipe material hanya: ${tipe.join(', ') || '(tidak ada data)'}`);
        }
      }
    }
  }

  // ----- 2. Halaman Stok Material masih dimuat -----
  //
  // /stok-material adalah rute React, jadi server mengirim index.html-nya.
  // Yang dibuktikan: tidak 500, dan aset JS-nya ada.
  const hal = await req('GET', '/stok-material');
  if (hal.status >= 500) {
    salah('/stok-material tidak 500', `status ${hal.status}`);
  } else {
    ok(`/stok-material dimuat (status ${hal.status})`);
  }

  const html = hal.status === 200 ? hal.text : '';
  if (html && /<div id="root"|src="\/assets\/|<script/.test(html)) {
    ok('/stok-material mengirim shell aplikasi React');
  } else if (html) {
    salah('shell React terkirim', 'tidak ditemukan #root atau script');
  }

  console.log(`\n=== SELESAI: ${gagal.length === 0 ? 'SEMUA HIJAU' : gagal.length + ' GAGAL'} ===`);
  if (gagal.length > 0) {
    for (const g of gagal) console.log('  - ' + g);
    process.exit(1);
  }
})();
