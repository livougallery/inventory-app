// Bangun satu berkas HTML per halaman untuk screenshot owner.
//
// Dipakai setelah `npm run build:presentasi` (atau build:presentasi-file, yang
// jalannya sama lalu menambah stub). Setiap berkas adalah salinan IDENTIK dari
// build yang sama, dengan stub fetch terpasang dan hash router yang sudah diisi.
//
// Kenapa per berkas, padahal HashRouter bisa pindah halaman tanpa reload.
//
// Dua alasan, dan hanya yang kedua yang benar:
//
//   1. Alasan yang salah: dikira "tabrakan". Tidak ada. Berkas ini HashRouter,
//      jadi pindah halaman cukup mengganti bagian setelah `#`. Sidebar ter-
//      render ulang tiap navigasi dan tidak ada yang saling menimpa.
//   2. Alasan yang benar: owner diminta screenshot satu per satu. Seseorang
//      yang diberi 21 tautan harus menyalin-paste URL-nya satu per satu;
//      dengan 21 berkas, mereka cukup klik-klik nama file. Selisihnya
//      beberapa detik per halaman, tapi sekali untuk setiap screenshot.
//
// Yang TIDAK boleh dilupakan: tiap berkas 1,1 MB dan isinya nyaris sama
// semua. Jangan dikirim utuh; kompres dulu atau kirim foldernya.
//
// Perintah: node build-ss.mjs

import fs from 'node:fs';
import path from 'node:path';
import { FETCH_STUB } from './stub-presentasi.mjs';

const HERE = import.meta.dirname;
const SRC = path.join(HERE, 'dist-presentasi', 'presentasi.html');
const OUT_DIR = 'C:\\Users\\livou\\inventory-demo\\ss';

// Daftar halaman yang owner mau screenshot.
//
// Klasifikasi di bawah bukan soal selera. `MODE_VIDEO = true` di
// components/Shell.tsx memasang <Navigate> untuk setiap path di
// PATH_DIBLOKIR_VIDEO, jadi halaman-halaman itu tidak akan pernah tampil apa
// pun isinya — semuanya dialihkan ke /modul/material. Berkas untuk mereka
// tetap dibuat supaya tidak ada yang bingung mencari-cari, tapi isinya akan
// sama semua dan tidak berguna. Jangan fezetkan.
const HALAMAN = [
  // --- Yang benar-benar tampil (tidak ada di PATH_DIBLOKIR_VIDEO) ---
  { slug: '01-material',        path: '/modul/material' },
  { slug: '02-material-fulfillment', path: '/modul/material-fulfillment' },
  { slug: '03-production-fulfillment', path: '/modul/production-fulfillment' },
  { slug: '04-production-fulfillment-table', path: '/modul/production-fulfillment-table' },
  { slug: '05-register-produk',  path: '/modul/register-produk' },
  { slug: '06-whitelabel',      path: '/modul/whitelabel' },
  { slug: '07-product',         path: '/modul/product' },
  { slug: '08-barang-datang',   path: '/modul/barang-datang' },
  { slug: '09-bom-hpp',         path: '/modul/bom-hpp' },
  { slug: '10-hpp-baru',        path: '/modul/hpp-baru' },

  // --- Terblokir MODE_VIDEO: file dibuat, isinya /modul/material semua ---
  { slug: '11-stok-material',   path: '/stok-material', blokir: true },
  { slug: '12-pembelian-material', path: '/pembelian-material', blokir: true },
  { slug: '13-vendors',         path: '/vendors', blokir: true },
  { slug: '14-products',        path: '/products', blokir: true },
  { slug: '15-purchase-orders', path: '/purchase-orders', blokir: true },
  { slug: '16-production-batches', path: '/production-batches', blokir: true },
  { slug: '17-hpp',             path: '/hpp', blokir: true },
  { slug: '18-bom',             path: '/bom', blokir: true },
  { slug: '19-master-data',     path: '/master-data', blokir: true },
  { slug: '20-material-grid',   path: '/modul/material-grid', blokir: true },
  { slug: '21-dashboard',       path: '/', blokir: true },
];

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
if (built.slice(headOpen + 6, headClose).includes('Stub fetch untuk berkas presentasi offline')) {
  throw new Error('Stub sudah ada di build — build sumber sudah tercemar. Hapus dan build ulang.');
}

// Membuka berkas ini langsung ke halamannya sendiri.
//
// Hash HARUS diubah sebelum bundle bereaksi: HashRouter bereaksi pada event
// 'hashchange', dan kalau hash baru dipasang setelah bundle mount, React akan
// render halaman awal dulu, lalu pindah — kedipan.
// Karena itu dipasang sebagai <script> klasik di <head>, yang jalan saat parser
// menyentuhnya, SEBELUM modul bundel dieksekusi.
//
// JANGAN pakai location.replace() di sini: itu memicu reload penuh, jadi tiap
// berkas memuat 1,1 MB dua kali. location.hash hanya menulis history entry.
const SNIPPET_ROUTER = `
<script>
// Membuka berkas ini langsung ke halamannya sendiri, bukan ke dashboard.
(function () {
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    location.hash = '#__SS_ROUTE__';
  }
})();
</script>
`;

function pasangStub(html) {
  return html.slice(0, headClose) + FETCH_STUB + SNIPPET_ROUTER + html.slice(headClose);
}

const base = pasangStub(built);

fs.mkdirSync(OUT_DIR, { recursive: true });

let ditulis = 0;
const triage = { hidup: [], blokir: [] };
const dipakai = new Set();

for (const hal of HALAMAN) {
  const nama = hal.slug + '.html';
  if (dipakai.has(nama)) {
    throw new Error('Slug dobel: ' + nama);
  }
  dipakai.add(nama);

  const isi = base.split('__SS_ROUTE__').join(hal.path);
  const out = path.join(OUT_DIR, nama);
  fs.writeFileSync(out, isi, 'utf8');
  ditulis++;
  triage[hal.blokir ? 'blokir' : 'hidup'].push(nama);
}

console.log('OK    ' + OUT_DIR);
console.log('ditulis ' + ditulis + ' berkas');
console.log('');
console.log('  tampil apa adanya (' + triage.hidup.length + '):');
for (const n of triage.hidup) console.log('    ' + n);
console.log('');
console.log('  TERBLOKIR MODE_VIDEO, isinya sama semua (' + triage.blokir.length + '):');
for (const n of triage.blokir) console.log('    ' + n);
console.log('');
console.log('  Ukuran per berkas: ' +
  (fs.statSync(path.join(OUT_DIR, HALAMAN[0].slug + '.html')).size / 1048576).toFixed(2) + ' MB');
console.log('  Total folder: ' +
  (fs.readdirSync(OUT_DIR).reduce((a, f) => a + fs.statSync(path.join(OUT_DIR, f)).size, 0) / 1048576).toFixed(1) + ' MB');
