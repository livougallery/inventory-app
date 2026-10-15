/**
 * Smoke test browser: varian `TabsList` — `default` (pil) vs `line` (garis bawah).
 *
 * Kenapa ini ada
 * --------------
 * `ui/tabs.tsx` diubah untuk menambah varian `line` (contoh ReUI `c-tabs-2`)
 * yang dipakai halaman Register Produk. Perubahannya menyentuh className yang
 * DIPAKAI BERSAMA: `TabsTrigger` mendapat kelas `after:*` baru dan sekumpulan
 * `group-data-[variant=line]/tabs-list:*`.
 *
 * Kelas-kelas itu SEHARUSNYA diam pada varian `default`, karena selektornya
 * menuntut leluhur ber-`data-variant="line"`. Tapi "seharusnya" bukan bukti —
 * lima halaman lain (Products, HPP & Harga Jual, Material Fulfillment,
 * Production Batches, Production Fulfillment) memakai varian `default` tanpa
 * menyebut variannya, dan kalau kelas itu bocor, kelimanya berubah tanpa ada
 * yang meminta.
 *
 * Yang diperiksa di sini cuma pembeda visual yang paling langsung dan paling
 * mungkin rusak: apakah tab aktif masih berbentuk PIL (latar + bayangan) di
 * halaman varian default, dan berbentuk GARIS BAWAH di halaman varian line.
 *
 * Cara pakai (dari folder `frontend/`):
 *   node ../tests/smoke-tabs-varian.mjs
 *
 * Butuh server di http://localhost:3000 (bundle `frontend/dist/` yang sudah
 * dibangun) dan Chrome. Tidak menyentuh database.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ASAL = process.env.ASAL || 'http://localhost:3000';

if (!existsSync(CHROME)) {
  console.error('Chrome tidak ditemukan di ' + CHROME);
  console.error('Setel CHROME_PATH ke chrome.exe kalau lokasinya berbeda.');
  process.exit(1);
}

const PORTA = 9600 + Math.floor(Math.random() * 300);
const profil = mkdtempSync(join(tmpdir(), 'cdp-tabs-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=' + PORTA,
    `--user-data-dir=${profil}`,
    ASAL + '/login',
  ],
  { stdio: 'ignore' }
);

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function cariEndpoint() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORTA + '/json/list');
      const tab = (await res.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (tab) return tab.webSocketDebuggerUrl;
    } catch {
      /* chrome belum siap */
    }
    await tidur(300);
  }
  throw new Error('Chrome tidak membuka endpoint debugging');
}

let gagal = 0;
const ok = (p) => console.log('  OK   ' + p);
const salah = (p, d) => {
  gagal++;
  console.log('  GAGAL ' + p + ' — ' + d);
};

const ws = new WebSocket(await cariEndpoint());
await new Promise((r, j) => {
  ws.addEventListener('open', r);
  ws.addEventListener('error', j);
});

let idPesan = 0;
const tunggu = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && tunggu.has(m.id)) {
    tunggu.get(m.id)(m);
    tunggu.delete(m.id);
  }
});

function kirim(method, params = {}) {
  const id = ++idPesan;
  return new Promise((resolve, reject) => {
    tunggu.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluasi(expr) {
  const r = await kirim('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'gagal evaluasi');
  }
  return r.result.value;
}

// Login dulu — halaman dilindungi. Lewat fetch dari dalam halaman, bukan
// mengisi form: yang diuji di sini tabnya, bukan login.
await evaluasi(`
  (async () => {
    if (!location.pathname.startsWith('/login')) return 'sudah-masuk';
    const csrf = document.querySelector('input[name="_csrf"]')?.value ?? '';
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin', _csrf: csrf }),
    });
    return 'login ' + r.status;
  })()
`);

/**
 * Buka satu halaman lalu baca bentuk tab aktifnya.
 *
 * Yang dibaca, dan kenapa persis itu:
 *   - `data-variant` pada TabsList  → varian mana yang benar-benar terpasang
 *   - latar tab aktif               → pil berisi `bg-background`, garis bawah
 *                                     tidak (transparan)
 *   - `::after` opacity             → garis bawahnya menyala (1) atau tidak (0)
 *
 * `::after` dibaca lewat `getComputedStyle(el, '::after')`; itu satu-satunya
 * cara mengukur pseudo-element dari JS, dan di situlah garis bawahnya hidup.
 */
async function bentukTab(url) {
  await kirim('Page.navigate', { url: ASAL + url });
  await tidur(2500);
  return evaluasi(`
    (() => {
      const list = document.querySelector('[role="tablist"]');
      if (!list) return { ada: false };
      const aktif = list.querySelector('[role="tab"][aria-selected="true"]')
        ?? list.querySelector('[role="tab"]');
      if (!aktif) return { ada: true, adaTab: false, variant: list.getAttribute('data-variant') };
      const cs = getComputedStyle(aktif);
      const after = getComputedStyle(aktif, '::after');
      return {
        ada: true,
        adaTab: true,
        variant: list.getAttribute('data-variant'),
        // rgba(0,0,0,0) saat transparan.
        latarTransparan: cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent',
        latar: cs.backgroundColor,
        bayangan: cs.boxShadow,
        afterOpacity: Number(after.opacity),
        afterLebar: after.width,
        afterTinggi: after.height,
      };
    })()
  `);
}

// ===== Halaman varian `default` — pil TIDAK boleh berubah =====

console.log('\n== Varian default (pil) — halaman lain ==');

// Tiga dari lima halaman varian default tidak bisa dipakai di sini:
//   - Products & Production Batches: `/products` dan `/production-batches`
//     DIBLOKIR saat mode video aktif (PATH_DIBLOKIR_VIDEO di Shell.tsx) dan
//     dialihkan ke /modul/material — tabnya tidak pernah tampil.
//   - HPP & Harga Jual: tabnya hidup di dalam panel detail per baris, bukan di
//     tingkat halaman, jadi baru ada setelah satu baris dibuka.
//
// Dua halaman di bawah ini cukup, dan bukan sekadar sisa yang gampang: varian
// default di-render oleh SATU jalur kode yang sama di tabs.tsx (className
// TabsTrigger), jadi halaman mana pun yang memakainya menguji jalur itu.
const DEFAULT_PAGES = [
  { url: '/modul/material-fulfillment', nama: 'Material Fulfillment' },
  { url: '/modul/production-fulfillment-table', nama: 'Production Fulfillment' },
];

for (const p of DEFAULT_PAGES) {
  const b = await bentukTab(p.url);
  if (!b.ada || !b.adaTab) {
    salah('tab varian default', `${p.nama}: ${JSON.stringify(b)}`);
    continue;
  }
  // Label `salah` sengaja STRING TETAP, bukan template literal berisi nama
  // halaman. Harness mutasi mencocokkan label ini dari sumber dengan regex
  // string-literal; label yang dirakit (`pil ${p.nama}`) tidak terbaca, dan
  // harness menolaknya sebagai label tidak ada. Nama halamannya tetap terlihat
  // — ia pindah ke argumen detail, yang ikut tercetak di keluaran.
  b.variant === 'default'
    ? ok(`${p.nama}: TabsList ber-varian "default"`)
    : salah('varian default', `${p.nama}: data-variant="${b.variant}"`);
  !b.latarTransparan
    ? ok(`${p.nama}: tab aktif masih berisi pil (latar ${b.latar})`)
    : salah('pil varian default', `${p.nama}: latar tab aktif transparan — gaya pil-nya hilang`);
  b.afterOpacity === 0
    ? ok(`${p.nama}: garis bawah TIDAK menyala (opacity ${b.afterOpacity})`)
    : salah(
        'garis varian default',
        `${p.nama}: garis bawah menyala (opacity ${b.afterOpacity}) — kelas varian line bocor ke default`
      );
}

// ===== Halaman varian `line` — garis bawah HARUS menyala =====

console.log('\n== Varian line (garis bawah) — Register Produk ==');

const line = await bentukTab('/modul/register-produk');
if (!line.ada || !line.adaTab) {
  salah('tab Register Produk', JSON.stringify(line));
} else {
  line.variant === 'line'
    ? ok('Register Produk: TabsList ber-varian "line"')
    : salah('varian Register Produk', `data-variant="${line.variant}"`);
  line.latarTransparan
    ? ok('Register Produk: tab aktif tanpa kotak latar (bukan pil)')
    : salah('latar Register Produk', `latar terisi (${line.latar}) — pil-nya belum dimatikan`);
  line.afterOpacity === 1
    ? ok(`Register Produk: garis bawah menyala (opacity ${line.afterOpacity}, ${line.afterLebar} x ${line.afterTinggi})`)
    : salah('garis Register Produk', `garis bawah tidak menyala (opacity ${line.afterOpacity})`);
}

console.log('');
if (gagal === 0) {
  console.log('LULUS — varian default tetap pil, varian line bergaris bawah.');
} else {
  console.log(`GAGAL — ${gagal} check tidak lolos.`);
}

ws.close();
chrome.kill();

try {
  rmSync(profil, { recursive: true, force: true });
} catch {
  /* Chrome masih memegang berkasnya; bukan kegagalan test */
}

process.exit(gagal === 0 ? 0 : 1);
