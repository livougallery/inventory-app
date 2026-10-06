/**
 * Smoke test klik: buka halaman Register Produk di presentasi, TEKAN tombol
 * "Tambah Produk", lalu periksa isi form yang benar-benar dirender.
 *
 * Kenapa tidak pakai --dump-dom: dump-dom hanya menangkap HTML awal. Dialog
 * dirender lewat portal yang baru muncul setelah ada klik, jadi tanpa klik
 * dump-dom selalu lolos padahal form-nya tidak pernah tampil.
 *
 * Satu-satunya alat yang bisa dipakai: Chrome DevTools Protocol lewat
 * WebSocket, yang sudah ada di Node tanpa dependensi tambahan. Itu yang dipakai
 * di sini, bukan menambah dependensi ke repo hanya untuk satu smoke test.
 *
 * SKALA. Berkas ini memeriksa bundle presentasi yang SUDAH dibangun
 * (`frontend/dist-presentasi/presentasi.html`), bukan sumber. Jadi jalankan
 * `npx vite build --config vite.presentasi.config.ts` di `frontend/` lebih
 * dulu — kalau tidak, yang diuji bisa bundle lama dan test ini hijau padahal
 * sumbernya sudah rusak. Bandingkan dengan smoke-register-produk.mjs yang
 * membangun sendiri lewat Vite; bedanya, script ini tidak membangun apa pun
 * supaya bisa memeriksa perilaku klik di browser sungguhan.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(AKAR, 'frontend', 'dist-presentasi', 'presentasi.html');
const URL = pathToFileURL(BUNDLE).href + '#/modul/register-produk';

const CHROME = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

if (!existsSync(BUNDLE)) {
  console.error('Bundle presentasi belum ada: ' + BUNDLE);
  console.error('Jalankan lebih dulu: cd frontend && npx vite build --config vite.presentasi.config.ts');
  process.exit(1);
}

// Porta diambil acak, bukan dikunci: Chrome yang dibiarkan hidup dari
// eksekusi sebelumnya (atau yang sedang jalan di terminal lain) akan memegang
// porta tetap, dan eksekusi berikutnya gagal start tanpa error yang berguna.
const PORTA = 9400 + Math.floor(Math.random() * 400);

const profil = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=' + PORTA,
  `--user-data-dir=${profil}`,
  URL,
], { stdio: 'ignore' });

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function cariEndpoint() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORTA + '/json/list');
      const tab = (await res.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (tab) return tab.webSocketDebuggerUrl;
    } catch { /* chrome belum siap */ }
    await tidur(300);
  }
  throw new Error('Chrome tidak membuka endpoint debugging');
}

let gagal = 0;
const ok = (p) => console.log('  OK   ' + p);
const salah = (p) => { gagal++; console.log('  GAGAL ' + p); };

try {
  const url = await cariEndpoint();
  const ws = new WebSocket(url);
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });

  let id = 0;
  const tunggu = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
  };
  const kirim = (method, params = {}) =>
    new Promise((r) => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

  const nilai = async (expr) => {
    const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  await kirim('Runtime.enable');
  await tidur(2500);   // bundle sudah inlined, jadi ini hanya menunggu mount React

  const adaTombol = await nilai(
    `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Tambah Produk')`
  );
  adaTombol ? ok('tombol "Tambah Produk" ada di halaman daftar') : salah('tombol "Tambah Produk" tidak ada');

  await nilai(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tambah Produk').click()`);
  await tidur(1200);

  const isi = await nilai(`document.body.innerText`);
  for (const t of ['Product attributes', 'Detail varian', 'Kode varian', 'Colour', 'Size']) {
    isi.includes(t) ? ok('form memuat "' + t + '"') : salah('form tidak memuat "' + t + '"');
  }
  isi.includes('Rencana') ? salah('kolom "Rencana (pcs)" masih ada setelah diklik') : ok('kolom "Rencana (pcs)" tidak ada di form yang terbuka');

  const jumlahInput = await nilai(`document.querySelectorAll('input[aria-label^="Kode varian"]').length`);
  jumlahInput === 1 ? ok('ada 1 input kode varian yang bisa diketik') : salah('input kode varian: dapat ' + jumlahInput + ', harusnya 1');

  // Jumlah input saja TIDAK cukup: input yang onChange-nya dilumpuhkan tetap
  // sebuah <input>, jadi check di atas akan tetap hijau padahal kotak kodenya
  // sudah tidak bisa diisi. Yang diuji di sini benar-benar pengetikan:
  // ketik, lalu lihat apakah nilainya masuk ke state React.
  const ketik = await nilai(`(() => {
    const el = document.querySelector('input[aria-label^="Kode varian"]');
    if (!el) return 'tidak ada input';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'UJI-KODE');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'diketik';
  })()`);
  if (ketik !== 'diketik') {
    salah('tidak bisa mengetik ke kolom kode: ' + ketik);
  } else {
    await tidur(400);
    const tersimpan = await nilai(`(() => {
      const el = document.querySelector('input[aria-label^="Kode varian"]');
      return el ? el.value : '(hilang)';
    })()`);
    tersimpan === 'UJI-KODE'
      ? ok('ketikan masuk ke kolom kode (state React, bukan teks mati)')
      : salah('kolom kode tidak menerima ketikan: nilainya "' + tersimpan + '"');
  }

  const ikon = await nilai(
    `document.querySelectorAll('button[aria-label^="Hapus varian"] > svg').length`
  );
  ikon === 1 ? ok('tombol hapus memuat ikon svg') : salah('tombol hapus: ' + ikon + ' ikon svg');

  // Error React akan muncul di body sebagai "Minified React error #NNN".
  const adaError = /Minified React error|Uncaught|Error: /.test(await nilai('document.body.innerText'));
  adaError ? salah('halaman menampilkan pesan error') : ok('tidak ada pesan error di layar');

  ws.close();
} finally {
  // `chrome.kill()` saja TIDAK cukup. Dia hanya mengirim sinyal ke proses
  // renderer yang menjadi anak langsung; Chrome menahan browser-process-nya
  // yang juga memegang port debugging dan direktori profil. Diam-diam 20-an
  // proses Chrome akan menumpuk setiap kali test ini dijalankan. Yang dipakai
  // di sini `taskkill /T /F`: seluruh pohon, tanpa menunggu konfirmasi.
  spawn('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  await tidur(1200);
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* sisa di TEMP, tidak berbahaya */ }
}

console.log('');
if (gagal === 0) { console.log('LULUS — form terbuka lewat klik dan isinya sesuai.'); process.exit(0); }
console.log('GAGAL — ' + gagal + ' pemeriksaan tidak lolos.');
process.exit(1);
