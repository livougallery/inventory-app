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
  // Ejaan di sini MENGIKUTI DATABASE apa adanya (pakai spasi, bukan garis
  // bawah). Bukan pilihan gaya: `raw_materials` punya CHECK yang menolak
  // ejaan lain --
  //   (tipe='aksesoris' AND jenis IN ('hak kait','kancing','resleting',
  //                                   'karet','label','renda','kain pelapis'))
  // -- jadi menulis 'hak_kait' di sini membuat pilihan itu ditolak database,
  // dan `product_bom` menunjuk jenis yang tidak ada di master. Satu ejaan
  // untuk satu jenis, dan yang berkuasa adalah yang tersimpan.
  accessories: [
    { value: 'hak kait', label: 'Hak Kait' },
    { value: 'kancing', label: 'Kancing' },
    { value: 'resleting', label: 'Resleting' },
    { value: 'label', label: 'Label' },
    { value: 'karet', label: 'Karet' },
    { value: 'renda', label: 'Renda' },
    // "Kain Pelapis" sengaja di bawah Aksesoris meski namanya mengandung
    // "Kain": ia komponen yang dijahit ke dalam busana, disimpan seperti
    // aksesoris lain. Sama dengan keputusan yang sudah tertulis di
    // `features/material/backend/routes.js` dan CHECK di `db.js`.
    { value: 'kain pelapis', label: 'Kain Pelapis' },
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

// ---- Register Produk: baris BOM ----

/**
 * Kategori material yang bahannya menempel di satu pcs produk jadi, dan
 * karenanya punya barisnya sendiri di dialog Register Produk.
 *
 * Ini satu-satunya tombol yang perlu diputar kalau nanti ada kategori lain
 * yang harus ikut (kata pemilik: "kalau ada tambahan nanti aku info lagi mau
 * tambah kategori apa"). Kategori yang SENGAJA belum ikut: `delivery`
 * (ongkos kirim), `sample`, dan `cmt_cost` (ongkos jahit) — ketiganya biaya,
 * bukan bahan yang dipasang ke barang.
 */
export const KATEGORI_BOM = ['fabric', 'accessories'] as const;

/**
 * Jenis bahan yang punya kotaknya sendiri di dialog produk Register.
 *
 * Daftarnya DITURUNKAN dari `KATEGORI_BOM` × `JENIS_MATERIAL`, bukan ditulis
 * ulang: jenis yang ditambah di master material langsung ikut muncul di sini,
 * dan sebaliknya tidak ada dua daftar yang bisa berbeda ejaan.
 */
export const JENIS_AKSESORI_BOM = KATEGORI_BOM.flatMap(
  (k) => JENIS_MATERIAL[k] ?? []
);

/**
 * Nilai `nama` yang berarti "jenis ini sengaja tidak dipakai".
 *
 * Dipilih eksplisit oleh pengguna, dan itu bedanya dengan kosong: kosong
 * berarti belum diputuskan (barisnya masih draft), sedangkan ini berarti
 * sudah diputuskan tidak perlu. Lihat `statusKelengkapan()`.
 */
export const TANPA_AKSESORI = 'no need';

/**
 * Brand produk jadi — pilihan baku.
 *
 * Bukan master yang tumbuh sendiri seperti `KATEGORI_PRODUK`: ini cuma dua
 * merek yang dipakai grup ini, dan pemilik menyebut keduanya langsung
 * ("klo di database kosong masukin aja LIVOU dan CASSCA", 19 Okt 2026).
 *
 * Daftarnya DIPAKAI BERSAMA sumber lain, bukan menggantikannya: dialog produk
 * menampilkan gabungan brand yang sudah dipakai produk lain dengan dua nama
 * ini. Alasannya dua arah. Tanpa daftar ini, semua produk yang brandnya masih
 * kosong (ketiganya, saat catatan ini ditulis) menghasilkan dropdown KOSONG —
 * persis keluhan pemilik. Tanpa gabungan itu, brand yang sudah dipakai tapi
 * tidak ada di sini akan tampil sebagai kotak kosong di produknya sendiri.
 *
 * Ditulis KAPITAL mengikuti ejaan yang diminta pemilik. Yang tersimpan di
 * database persis yang dipilih, jadi ejaannya harus satu.
 */
export const BRAND_PRODUK = ['LIVOU', 'CASSCA'] as const;

/**
 * Kategori produk jadi.
 *
 * Dipakai dua tempat: form "Tambah Produk" dan baris Kategori di dialog
 * detail. Ditulis sekali di sini supaya keduanya tidak menawarkan daftar yang
 * berbeda — produk yang dibuat dari satu daftar harus bisa dibetulkan dari
 * daftar yang sama.
 *
 * CATATAN PENTING soal isi lama: ketiga produk yang ada di database sekarang
 * berkategori 'Atasan', 'Top', dan 'Pants' (lihat `tmp/_probe-brand.mjs`).
 * Dua yang pertama TIDAK ada di daftar ini. Karena itu pemakainya wajib
 * menyertakan nilai produk itu sendiri sebagai pilihan (lihat `PanelKiri`) —
 * tanpa itu, membuka dialog produk lama lalu menekan Simpan akan diam-diam
 * mengubah kategorinya jadi salah satu dari daftar ini.
 */
export const KATEGORI_PRODUK = [
  { value: 'T-Shirt', label: 'T-Shirt' },
  { value: 'Pants', label: 'Pants' },
  { value: 'Dress', label: 'Dress' },
  { value: 'Blouse', label: 'Blouse' },
  { value: 'Outer', label: 'Outer' },
  { value: 'Set', label: 'Set' },
] as const;

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

/**
 * Lokasi terima barang — dari master `locations`, BUKAN teks bebas.
 *
 * Alasannya sama dengan PIC (`opsi.ts` bagian atas): lokasi dipakai untuk
 * filter dan untuk memutuskan ke gudang mana barang masuk, dan filter hanya
 * berguna kalau nilainya seragam. Dua orang yang mengetik "Gudang" dan
 * "Gudang HQ" membuat satu gudang terlihat seperti dua.
 *
 * Dua nilai di bawah sama persis dengan seed `locations` di `db.js`. Endpoint
 * `GET /api/locations` belum ada — daftar ini yang dipakai sampai koneksinya
 * dibuat, dan sengaja ditulis di sini (bukan di dalam komponen) supaya begitu
 * endpoint-nya ada, satu-satunya yang berubah adalah sumber daftar ini.
 */
export const LOKASI_TERIMA = [
  { value: 'gudang', label: 'Gudang (Livou HQ Office)' },
  { value: 'konveksi', label: 'Konveksi' },
] as const;

/**
 * Ke mana barang masuk saat diterima — pilihan tingkat KEDATANGAN.
 *
 * Berbeda dari `LOKASI_TERIMA` yang menyebut gedungnya, ini menyebut jenis
 * alurnya, dan itu yang menentukan apa yang terjadi setelah "Simpan
 * Penerimaan". Karena satu kiriman bisa datang sebagian ke stok dan sebagian
 * langsung dikirim ke pembeli, pilihannya ada di tiap kedatangan — bukan satu
 * nilai per kartu.
 */
export const SUMBER_TERIMA = [
  { value: 'stok', label: 'Masuk Stok Gudang' },
  { value: 'kirim_langsung', label: 'Kirim Langsung ke Pembeli' },
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
