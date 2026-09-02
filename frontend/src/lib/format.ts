// Format angka untuk tampilan. Sebelumnya `rupiah` dan `toNum` disalin di
// tiap halaman (StokMaterial, PembelianMaterial) — satu sumber supaya tidak
// ada dua halaman yang memformat Rupiah dengan aturan berbeda.

export const rupiah = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

// Kolom NUMERIC/REAL dari Postgres bisa datang sebagai string, jadi angka
// dinormalisasi dulu sebelum diformat atau dijumlahkan.
export const toNum = (v: number | string | null) => (v === null ? null : Number(v));
