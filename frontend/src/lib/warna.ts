// ===== Master warna (data contoh) =====
//
// Halaman REGISTER > Colour menampilkan daftar warna beserta kodenya. Daftar itu
// DITURUNKAN dari katalog produk, bukan ditulis ulang di sini.
//
// Alasannya sama persis dengan `KODE_WARNA` di `FormProdukBaru.tsx`: kode warna
// masuk ke `kodeVarian` (mis. `LVU-TOP-11-HTP-M`). Kalau halaman Colour punya
// daftarnya sendiri, menambah warna di katalog akan menghasilkan varian yang
// kodenya tidak cocok dengan yang terdaftar di halaman ini — dan bedanya baru
// ketahuan saat ada yang membandingkan dua layar.
//
// BELUM TERHUBUNG DATABASE. Sama seperti katalog produknya — lihat
// BannerPratinjau di halamannya.

import { PRODUK_REGISTER } from './produk';

export interface WarnaMaster {
  /** Kode pendek warna, mis. HTP. Unik — dipakai sebagai id baris. */
  kode: string;
  /** Nama tampilan warna, mis. Hitam. */
  nama: string;
}

/**
 * Seluruh warna yang dipakai katalog, satu baris per kode.
 *
 * Dikelompokkan per KODE, bukan per nama: dua produk yang sama-sama "Hitam"
 * memakai kode HTP yang sama, dan keduanya harus jadi SATU baris di halaman ini
 * — bukan dua baris yang terlihat seperti warna berbeda.
 *
 * Urutannya mengikuti kemunculan pertama di katalog, supaya halaman ini tidak
 * mengacak sendiri urutan yang sudah dipakai halaman lain.
 */
export function daftarWarna(): WarnaMaster[] {
  const peta = new Map<string, WarnaMaster>();
  for (const p of PRODUK_REGISTER) {
    for (const w of p.spesifikasi.warna) {
      if (!peta.has(w.kode)) peta.set(w.kode, { kode: w.kode, nama: w.nama });
    }
  }
  return [...peta.values()];
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
 */
export function normalisasiKode(kode: string): string {
  return kode.trim().toUpperCase();
}
