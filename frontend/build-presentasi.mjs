// Bangun satu berkas HTML siap-presentasi untuk owner.
//
// Sumbernya build Vite (`dist-presentasi/presentasi.html`). Yang dilakukan di
// sini hanya satu: memasang stub `fetch` supaya halaman tidak bergantung pada
// server. Isi stub-nya ada di `stub-presentasi.mjs`, yang juga dipakai
// `build-ss.mjs` untuk berkas-berek per-halaman.
//
// Keluaran: C:\Users\livou\inventory-demo\Inventory-APP-Presentasi.html
//
// Perintah: npm run build:presentasi-file   (dari folder frontend/)
//
// JANGAN meng-import berkas ini dari skrip lain: seluruh build-nya jalan di
// top-level, jadi import apa pun akan menulis ulang Inventory-APP-Presentasi.html.

import fs from 'node:fs';
import path from 'node:path';
import { FETCH_STUB } from './stub-presentasi.mjs';

const HERE = import.meta.dirname;
const SRC = path.join(HERE, 'dist-presentasi', 'presentasi.html');
const OUT = 'C:\\Users\\livou\\inventory-demo\\Inventory-APP-Presentasi.html';

const built = fs.readFileSync(SRC, 'utf8');

const headOpen = built.indexOf('<head>');
const headClose = built.indexOf('</head>');
const bodyOpen = built.indexOf('<body');
const bodyClose = built.lastIndexOf('</body>');

if (headOpen === -1 || headClose === -1 || bodyOpen === -1 || bodyClose === -1) {
  throw new Error('Tag <head>/<body> tidak ditemukan di build presentasi.');
}
if (bodyOpen < headClose) {
  throw new Error('Urutan <body> sebelum </head> — build ini tidak shopper.');
}

// Stub disisipkan tepat sebelum </head>, jadi modul bundel (yang juga ada di
// head) dimuat setelahnya. Cek dulu supaya build sumber tidak tercemar stub
// ganda — kalau bocor, setiap build berikutnya akan menambah satu salinan.
if (built.slice(headOpen + 6, headClose).includes('Stub fetch untuk berkas presentasi offline')) {
  throw new Error('Stub sudah ada di build — build sumber sudah tercemar. Hapus dan build ulang.');
}

const page = built.slice(0, headClose) + FETCH_STUB + built.slice(headClose);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');

const bytes = fs.statSync(OUT).size;
console.log('OK    ' + OUT);
console.log('bytes ' + bytes + '  = ' + (bytes / 1048576).toFixed(2) + 'MB');
console.log('doctype  : ' + (page.startsWith('<!doctype') ? 'ada (wajib)' : 'TIDAK ADA'));
console.log('stub     : ' + (page.includes('Stub fetch untuk berkas presentasi offline') ? 'terpasang' : 'GAGAL'));
