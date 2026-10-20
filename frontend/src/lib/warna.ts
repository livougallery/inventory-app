// ===== Master warna =====
//
// Halaman REGISTER > Colour menampilkan daftar warna beserta kodenya. Sejak
// 16 Oktober 2026 daftar itu datang dari TABEL `warna` di database, lewat
// `GET /api/register-produk/warna` — bukan lagi diturunkan dari katalog contoh.
//
// Kode warna masuk ke `kodeVarian` (mis. `LVU-TOP-11-HTP-M`) dan ke kolom
// `product_variants.warna_kode`, yang punya foreign key ke `warna(kode)`.
// Artinya warna yang tidak ada di tabel ini TIDAK BISA dipakai produk: menyimpan
// varian dengan kode yang belum terdaftar akan ditolak database. Karena itu
// form Tambah Produk memilih warnanya dari daftar ini, bukan dari daftar
// ketikan sendiri.
//
// File ini sekarang cuma menyimpan BENTUK-nya (`WarnaMaster`) dan aturan
// perapian kodenya. Pemetaan dari JSON API ada di `lib/registerProduk.ts`,
// supaya tidak ada dua tempat yang membaca bentuk balikan server.

export interface WarnaMaster {
  /** Kode pendek warna, mis. HTP. Unik — dipakai sebagai id baris. */
  kode: string;
  /** Nama tampilan warna, mis. Hitam. */
  nama: string;
}

/**
 * Rapikan kode yang diketik orang sebelum disimpan.
 *
 * Huruf besar itu BUKAN pilihan gaya. Kode warna masuk ke `kodeVarian`
 * (mis. `LVU-TOP-11-HTP-M`), dan kode varian dipakai apa adanya untuk
 * mencocokkan varian di layar lain. "htp" dan "HTP" adalah dua kode berbeda
 * bagi pencocokan teks, jadi warna yang sama akan terlihat sebagai dua warna
 * berbeda begitu ada yang mengetiknya dengan huruf kecil.
 *
 * Karena itu kodenya dinaikkan ke huruf besar di SATU tempat ini, bukan
 * diserahkan ke kebiasaan pengetiknya — dan bukan pula ditampilkan
 * huruf-besar-kan saat dirender, karena yang tersimpan tetap harus sama dengan
 * yang terlihat.
 *
 * Server merapikan ulang dengan aturan yang sama (`routes.js`, POST /warna).
 * Itu bukan duplikasi yang berbahaya: yang di klien menentukan apa yang
 * TERLIHAT saat diketik, yang di server menentukan apa yang TERSIMPAN kalau
 * ada yang memanggil API-nya langsung.
 */
export function normalisasiKode(kode: string): string {
  return kode.trim().toUpperCase();
}
