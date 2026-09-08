// ===== Nilai pilihan untuk 7 modul =====
//
// Semua daftar pilihan dikumpulkan di satu tempat karena daftar yang sama
// dipakai lebih dari satu modul — misal "Kategori Vendor" muncul di Production
// Fulfillment dan di Barang Datang. Kalau masing-masing menulis sendiri,
// lambat laun isinya akan berbeda dan perbedaannya baru terasa saat filter
// satu halaman tidak menemukan baris yang ada di halaman lain.
//
// Nilai kode (sebelah kiri) disengaja dalam bahasa Inggris karena itu yang
// akan dikirim ke database; label tampilannya yang bahasa Indonesia.
//
// Sumber: daftar kolom owner, 7 September 2026.

// ---- Material ----

/** Kategori material. */
export const KATEGORI_MATERIAL = [
  { value: 'accessories', label: 'Accessories' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'sample', label: 'Sample' },
  { value: 'cmt_cost', label: 'CMT Cost' },
] as const;

/**
 * Jenis material, bergantung pada kategori.
 *
 * Peta, bukan daftar datar: pilihan jenis berbeda tiap kategori, jadi
 * disimpan sebagai kategori → daftar jenis.
 */
export const JENIS_MATERIAL: Record<string, { value: string; label: string }[]> = {
  accessories: [
    { value: 'hak_kait', label: 'Hak Kait' },
    { value: 'kancing', label: 'Kancing' },
    { value: 'resleting', label: 'Resleting' },
    { value: 'label', label: 'Label' },
    { value: 'karet', label: 'Karet' },
    { value: 'renda', label: 'Renda' },
  ],
  fabric: [
    { value: 'roll', label: 'Roll' },
    { value: 'ecer', label: 'Ecer' },
  ],
  delivery: [
    { value: 'accessories', label: 'Accessories' },
    { value: 'sample', label: 'Sample' },
    { value: 'stock', label: 'Stock' },
    { value: 'fabric', label: 'Fabric' },
  ],
  cmt_cost: [
    { value: 'plan', label: 'Plan' },
    { value: 'real', label: 'Real' },
  ],
};

/** Satuan material. */
export const SATUAN = ['pcs', 'yard', 'kg', 'meter', 'time'] as const;

/** Lokasi penyimpanan barang. */
export const LOKASI = ['Livou HQ Office', 'Konveksi'] as const;

/**
 * Warna produk.
 *
 * Daftar ini dipakai lebih dari satu modul (Product, Barang Datang, BOM),
 * jadi disimpan di sini — warna yang ejaannya berbeda antar halaman membuat
 * filter satu halaman tidak menemukan baris yang ada di halaman lain.
 */
export const WARNA = ['Hitam', 'Putih', 'Cream', 'Navy'] as const;

/** Ukuran produk. */
export const SIZE = ['S', 'M', 'L', 'XL'] as const;

/**
 * PIC material — nama user yang menginput baris.
 *
 * Contoh untuk pratinjau. Nanti diganti daftar nama dari tabel `users`,
 * bukan diketik bebas: PIC dipakai untuk filter, dan filter hanya berguna
 * kalau ejaannya seragam ("Rani" tidak boleh pernah jadi "rani").
 */
export const PIC = ['Rani', 'Budi', 'Sari'] as const;

// ---- White Label ----

/** Asal kota-negara impor. */
export const KOTA_NEGARA = [
  'Bangkok-Thailand',
  'Guangzhou-China',
  'Jakarta-Indonesia',
] as const;

/** Mata uang. */
export const MATA_UANG = ['THB', 'CNY', 'IDR'] as const;

/** Jasa logistik. */
export const LOGISTIK = ['Transindo Global', 'MJ Logistics'] as const;

// ---- Production / Barang Datang ----

/** Sumber produksi. */
export const SUMBER_PRODUKSI = [
  { value: 'production', label: 'Production' },
  { value: 'white_label', label: 'White Label' },
] as const;

/**
 * Kategori vendor, bergantung pada sumber produksi.
 * Production → Inhouse / Konveksi / Garment.
 * White Label → China / Thailand / Indonesia.
 */
export const KATEGORI_VENDOR: Record<string, { value: string; label: string }[]> = {
  production: [
    { value: 'inhouse', label: 'Inhouse' },
    { value: 'konveksi', label: 'Konveksi' },
    { value: 'garment', label: 'Garment' },
  ],
  white_label: [
    { value: 'china', label: 'China' },
    { value: 'thailand', label: 'Thailand' },
    { value: 'indonesia', label: 'Indonesia' },
  ],
};

/** Alur transaksi pembayaran. */
export const FLOW_TRANSAKSI = [
  { value: 'livou_transfer', label: 'Livou Transfer' },
  { value: 'reimbursement', label: 'Reimbursement' },
] as const;

/** Solusi bila jumlah pcs real tidak sesuai rencana. Boleh kosong. */
export const SOLUSI = [
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'resent_stock', label: 'Resent Stock' },
] as const;

// ---- BOM ----

/**
 * Cakupan pemakaian material.
 * ALL     → dipakai semua varian
 * Selected→ hanya varian tertentu (kolom Applies To = size)
 * By Color→ hanya warna tertentu (kolom Applies To = warna)
 *
 * Nilai `Applies To` bergantung pada Scope, jadi tidak disimpan sebagai daftar
 * sendiri: menyimpannya terpisah memberi peluang isinya tidak cocok dengan
 * scope-nya.
 */
export const SCOPE = [
  { value: 'all', label: 'ALL' },
  { value: 'selected', label: 'Selected' },
  { value: 'by_color', label: 'By Color' },
] as const;

// ---- Util tampilan ----

/**
 * Ubah kode jadi label untuk ditampilkan.
 * Kode yang tidak dikenal dikembalikan apa adanya — jangan sampai sebuah
 * nilai baru membuat sel tabel tiba-tiba kosong.
 */
export function labelDari(
  daftar: readonly { value: string; label: string }[],
  nilai: string | null | undefined
): string {
  if (!nilai) return '—';
  return daftar.find((d) => d.value === nilai)?.label ?? nilai;
}

/** Label untuk daftar yang nilainya string polos (tanpa pasangan value/label). */
export function labelPolos(nilai: string | null | undefined): string {
  return nilai || '—';
}
