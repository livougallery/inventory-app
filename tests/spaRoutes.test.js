/**
 * Penjaga SPA_ROUTES: setiap rute React di `frontend/src/App.tsx` harus
 * terdaftar di `SPA_ROUTES` (`index.js`), kalau tidak server menjawab 404.
 *
 * Kenapa test ini ada
 * -------------------
 * Catch-all di `index.js` hanya menyajikan SPA untuk path yang ada di
 * `SPA_ROUTES`. Rute yang sudah ditambahkan di `App.tsx` tapi lupa didaftarkan
 * di sana TIDAK memunculkan error apa pun saat build, tidak menggagalkan
 * `tsc`, dan tidak terlihat oleh smoke test mana pun yang merender komponen
 * React langsung — mereka melewati server sepenuhnya.
 *
 * Sudah kejadian 2026-09-25: `/modul/production-fulfillment-table` ditambahkan
 * ke `App.tsx` bersama pemisahan papan kanban, tapi tidak ke `SPA_ROUTES`.
 * Halaman itu — tujuan utama menu "Production Fulfillment" di Master Data —
 * menjawab 404 di app sungguhan sementara seluruh suite hijau.
 *
 * Cara kerjanya
 * -------------
 * Rute diekstrak dari `App.tsx` apa adanya (regex, bukan impor): berkas itu TSX
 * dan tidak bisa di-`require` dari Jest CommonJS. Yang diperiksa adalah
 * KECOCOKAN DUA DAFTAR, bukan perilaku runtime, jadi pembacaan teks sudah
 * memadai — dan justru lebih tahan terhadap perubahan bentuk komponen.
 *
 * Rute bertanda `*` (catch-all React) sengaja dilewati: tidak ada path konkret
 * yang bisa dicocokkan dengannya.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP_TSX = path.join(ROOT, 'frontend/src/App.tsx');
const INDEX_JS = path.join(ROOT, 'index.js');

/**
 * Rute React yang SENGAJA tidak dilayani SPA.
 *
 * `/login` dirender EJS (`app.get('/login')` di index.js) dan komentar
 * `SPA_ROUTES` menyebutnya eksplisit sebagai pengecualian. Didaftarkan di sini
 * sebagai daftar, bukan disaring diam-diam di dalam fungsi: pengecualian yang
 * tersembunyi di logika pemeriksaan akan menelan rute berikutnya yang lupa
 * didaftarkan, dan test ini kehilangan gunanya.
 */
const DIKECUALIKAN = new Set(['/login']);

/** Path `<Route path="...">` di App.tsx, tanpa yang bertanda `*`. */
function ruteReact() {
  const isi = fs.readFileSync(APP_TSX, 'utf8');
  return [...isi.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.includes('*'))
    .filter((p) => !DIKECUALIKAN.has(p));
}

/**
 * Isi literal `new Set([...])` milik SPA_ROUTES di index.js.
 *
 * Sengaja dipotong dari `new Set([` sampai `])` yang pertama: mengambil semua
 * string di seluruh berkas akan ikut menangkap path lain (mis. `/api/...`) dan
 * membuat pemeriksaannya lolos karena alasan yang salah.
 */
function ruteSpa() {
  const isi = fs.readFileSync(INDEX_JS, 'utf8');
  const awal = isi.indexOf('const SPA_ROUTES = new Set([');
  if (awal < 0) {
    throw new Error('SPA_ROUTES tidak ditemukan di index.js — bentuknya berubah, perbarui test ini');
  }
  const akhir = isi.indexOf('])', awal);
  const blok = isi.slice(awal, akhir);
  return new Set([...blok.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

describe('SPA_ROUTES vs rute React', () => {
  test('setiap rute di App.tsx terdaftar di SPA_ROUTES', () => {
    const spa = ruteSpa();
    const belum = ruteReact().filter((p) => !spa.has(p));

    // Pesannya sengaja menyebut akibatnya (404), bukan cuma "tidak terdaftar":
    // yang membaca kegagalan ini perlu tahu kenapa ia penting.
    expect(belum).toEqual([]);
  });

  test('tidak ada SPA_ROUTES yang tidak punya rute React', () => {
    // Arah sebaliknya. Tidak fatal seperti arah pertama — rute React yang
    // dihapus menyisakan entri yang tidak lagi melayani apa pun, dan entri itu
    // menyamarkan rute baru yang salah tulis.
    const react = new Set(ruteReact());
    const yatim = [...ruteSpa()].filter((p) => !react.has(p));

    expect(yatim).toEqual([]);
  });
});
