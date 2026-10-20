// ===== Katalog produk (data contoh) =====
//
// Satu sumber untuk dua tempat yang memang harus sama:
//
//   - halaman REGISTER > Register Produk (daftar kartu produk)
//   - pengisian otomatis form "Tambah Produksi" di PROGRESS
//
// Kalau keduanya punya daftarnya sendiri-sendiri, cepat atau lambat isinya
// berbeda — dan bedanya baru ketahuan saat presentasi, ketika nama produk yang
// baru saja dipilih di Register tidak muncul sebagai saran di form produksi.
//
// BELUM TERHUBUNG DATABASE. Ini contoh, sama seperti `barisContoh` di
// Product.tsx dan `KARTU_PRODUCTION` di data-kanban.ts. Koneksinya dikerjakan
// setelah tampilan disetujui — lihat BannerPratinjau di halamannya.

// Tipe-tipe ini idealnya tinggal di `lib/`, bukan dibaca dari dalam `pages/` —
// arah import seperti ini bikin `lib` bergantung ke halaman, dan nanti bikin
// halaman lain yang butuh katalog ikut menarik modul papan.
//
// Tapi memindahkannya berarti menyunting `data-kanban.ts`, dan berkas itu
// milik perubahan sesi lain yang sudah ter-commit; menyuntingnya di sini
// membuka perubahan lintas sesi yang belum perlu terjadi sekarang. Jadi yang
// dicatat dulu, bukan dibetulkan diam-diam.
import type {
  BarisWarna,
  SpesifikasiAksesori,
  SpesifikasiKain,
} from '@/pages/production-fulfillment/data-kanban';
import { JENIS_AKSESORI_BOM } from './opsi';

/**
 * Spesifikasi produksi satu produk — persis bentuk yang dibutuhkan form
 * "Tambah Produksi" supaya bisa mengisi dirinya sendiri.
 *
 * Bentuknya SENGAJA memakai tipe yang sudah ada di `data-kanban.ts`, bukan
 * tipe baru yang mirip: begitu bentuknya berbeda sedikit saja, pengisian
 * otomatisnya jadi pemetaan manual yang bisa salah tanpa ketahuan.
 */
export interface SpesifikasiProduksi {
  designCode: string;
  kategori: string;
  batch: string;
  /** Kode kategori vendor (`inhouse`/`konveksi`/`garment`), bukan labelnya. */
  kategoriVendor: string;
  namaVendor: string;
  warna: BarisWarna[];
  kain: SpesifikasiKain[];
  aksesori: SpesifikasiAksesori[];
}

/**
 * Satu varian di dalam kartu produk: satu warna + satu ukuran.
 *
 * Varian tidak lagi jadi baris daftar. Satu produk punya beberapa varian, dan
 * menyajikannya satu per satu membuat satu produk yang punya delapan varian
 * memakan delapan baris — persis kebalikan yang diminta pemilik: yang ingin
 * dibaca lebih dulu adalah "produk ini", lalu varian-variannya menyusul di
 * dalamnya.
 */
export interface VarianRegister {
  id: string;
  /**
   * Kode warnanya saja, mis. HTP.
   *
   * Bawaan katalog, bukan kolom tampilan: yang tampil di kartu adalah `warna`
   * (nama, mis. "Hitam"). Field ini disimpan supaya pencarian bisa mencocokkan
   * kode pendek tanpa harus mem-parse `kodeVarian`.
   */
  kodeWarna: string;
  /** Kode varian lengkap: desain + warna + ukuran, mis. LVU-TOP-11-HTP-M. */
  kodeVarian: string;
  warna: string;
  size: string;
  /** Stok varian ini yang sudah masuk gudang. */
  stokMasuk: number;
  /**
   * Stok varian ini yang bisa dijual.
   *
   * Tidak dihitung dari `stokMasuk`: sebagian stok bisa sudah terikat pesanan,
   * jadi bisa lebih kecil — dan itu keadaan nyata yang perlu terlihat, bukan
   * pembulatan. Kalau varian tidak punya angka khusus, sama dengan stok masuk.
   */
  stokJual: number;
  /**
   * Stok varian ini yang masih menunggu diproses (mis. belum lolos QC).
   *
   * TIDAK ditampilkan sebagai kolom — pemilik meminta kolom "Waiting for"
   * dihapus. Disimpan karena barang yang menunggu tetap ada di gudang, jadi
   * harus ikut masuk hitungan `totalStok`.
   */
  stokMenunggu: number;
}

/**
 * Stok satu warna di dalam kartu produk: seluruh ukuran warna itu dijumlahkan.
 *
 * Kartu tidak menampilkan tiap ukuran sendirian — untuk produk dengan 8 varian
 * itu jadi 8 baris angka yang mustahil dibandingkan sekilas. Yang ditampilkan
 * adalah satu baris per WARNA, jadi produk dua warna tetap dua baris. Tidak ada
 * ukuran yang hilang: jumlahnya ada di `stokJual` baris itu, dan rinciannya
 * tetap ada di `varian` untuk dialog detail.
 */
export interface WarnaRegister {
  id: string;
  kodeWarna: string;
  warna: string;
  /** Jumlah ukuran milik warna ini, mis. 4 untuk S/M/L/XL. */
  jumlahSize: number;
  /** Stok yang bisa dijual, dijumlahkan dari seluruh ukuran warna ini. */
  stokJual: number;
  /** Stok total warna ini, termasuk yang masih menunggu diproses. */
  stokTotal: number;
  /** Ukuran yang ada pada warna ini, mis. "S, M, L, XL". */
  size: string;
}

/**
 * Marketplace tempat produk didaftarkan agar bisa dijual.
 *
 * Ditulis sebagai kode (`shopee`), bukan label tampilan: labelnya urusan
 * render, dan yang tersimpan harus tetap sama walau tampilannya berganti.
 */
export type Platform = 'shopee' | 'tiktok' | 'shopify';

/**
 * Urutan tetap platform di kartu.
 *
 * Ditulis SEKALI di sini, bukan diurut ulang per kartu: urutan baris yang
 * berbeda-beda antar kartu membuat mata harus mencari ulang tiap kali, padahal
 * gunanya baris ini justru membandingkan status antar produk.
 */
export const PLATFORM: Platform[] = ['shopee', 'tiktok', 'shopify'];

/**
 * Label tampilan platform. Kode tetap bahasa Inggris, labelnya Indonesia.
 *
 * Ditulis SEKALI di sini, bukan di tiap halaman yang menampilkannya: kartu
 * produk dan popup bukti sama-sama menyebut nama platform, dan dua peta yang
 * terpisah cepat atau lambat berbeda ejaan — bedanya baru ketahuan saat
 * presentasi.
 */
export const NAMA_PASAR: Record<Platform, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok',
  shopify: 'Shopify',
};

/** Status satu produk di satu marketplace. */
export interface StatusPasar {
  platform: Platform;
  terdaftar: boolean;
  /**
   * Foto bukti pendaftaran di platform itu.
   *
   * `null` = belum ada berkas. Saat ini SELALU null: belum ada satu pun foto
   * bukti, dan — lebih penting — belum diputuskan foto ini disimpan di tabel
   * mana. Yang sudah pasti cuma bentuknya: satu gambar per (produk, platform).
   *
   * Tidak dikosongkan dari tipe walau selalu null: begitu datanya ada, yang
   * berubah cukup isinya, bukan bentuk kartunya lagi.
   */
  fotoBukti: string | null;
}

/** Satu kartu produk di daftar Register — satu produk, bukan satu varian. */
export interface KartuRegister {
  id: string;
  nama: string;
  kategori: string;
  /** Kode desain produk, mis. LVU-TOP-11. */
  kode: string;
  /**
   * Brand dan tanggal daftar.
   *
   * Tidak tampil di kartu daftar, tapi tidak sia-sia: kartu ini tidak pernah
   * jadi satu-satunya jalan ke detail — ada halaman detail yang butuh keduanya,
   * dan memetiknya dari katalog lagi di tempat lain berarti satu produk bisa
   * tampil dengan brand berbeda di dua layar.
   */
  brand: string;
  /** Foto produk. `null` = belum ada berkas, ditampilkan sebagai penanda. */
  foto: string | null;
  registerDate: string;
  /** Harga jual per pcs. */
  harga: number;
  /**
   * Setiap varian (warna × ukuran). Dipakai dialog detail dan pencarian.
   *
   * Kartu daftar TIDAK merender daftar ini — ia merender `warnaRingkas` di
   * bawah, yang sudah dijumlahkan per warna. Kalau kartu ini langsung memetakan
   * `varian`, produk dengan 8 varian kembali jadi 8 baris angka.
   */
  varian: VarianRegister[];
  /** Satu baris per warna — inilah yang tampil di kartu daftar. */
  warnaRingkas: WarnaRegister[];
  /**
   * Status pendaftaran produk ini di tiap marketplace, satu entri per platform
   * dan SELALU lengkap tiga — bukan cuma yang sudah terdaftar.
   *
   * Lengkap karena yang dibaca pemilik di kartu adalah "mana yang belum",
   * bukan cuma "mana yang sudah". Kalau hanya yang terdaftar yang dikirim,
   * platform yang belum terdaftar akan hilang dari kartu, dan tidak adanya
   * baris terbaca sebagai "platform ini tidak dipakai" — padahal artinya
   * "belum didaftarkan", dan itu dua hal yang berbeda saat harus ditindak.
   */
  pasar: StatusPasar[];
  /** Jumlah warna berbeda di produk ini. */
  jumlahWarna: number;
  /** Jumlah varian (warna × ukuran) di produk ini. */
  jumlahVarian: number;
  /**
   * Stok masuk, dijumlahkan dari seluruh varian produk ini.
   *
   * Tidak tampil sendiri di kartu. Yang tetap dipakai adalah hitungan
   * `totalStok` di bawah, jadi tidak ada pekerjaan yang sia-sia.
   */
  totalMasuk: number;
  /**
   * Stok yang bisa dijual, dijumlahkan dari seluruh varian produk ini.
   *
   * Berbeda dari `totalStok` karena sebagian stok sudah terikat pesanan atau
   * belum selesai diproses, jadi tidak bisa langsung dijual. Kartu menampilkan
   * perbedaannya lewat dua nama yang berbeda: tiap baris warna ditulis
   * "N bisa jual", sedangkan totalnya ditulis "Total Stock". Tanpa pemisahan
   * nama itu orang akan menghitung sendiri, menemukan selisih, lalu mengira
   * kartu tersebut rusak.
   *
   * Tidak tampil sebagai angka tersendiri di kaki kartu — yang diminta
   * pemilik hanya jumlah varian dan Total Stock. Nilai ini tetap dipakai
   * untuk menjumlahkan baris warna, supaya tidak ada angka yang dihitung dua
   * kali.
   */
  totalJual: number;
  /**
   * Total stok = stok masuk + stok yang masih menunggu diproses.
   *
   * Yang menunggu tidak lagi tampil sebagai kolom — pemilik meminta kolom itu
   * dihapus dari tampilan. TETAP ikut dihitung di sini: membuangnya dari rumus
   * akan membuat "Total Stock" lebih kecil daripada barang yang benar-benar ada
   * di gudang, dan itu mengubah angka, bukan cuma cara menampilkannya.
   */
  totalStok: number;
  /** Nilai sisa: total stok × harga jual. */
  nilaiSisa: number;
  /**
   * Selesai atau belumnya BOM produk ini — yang tampil sebagai badge di
   * pojok kartu. Dihitung sekali di `kartuRegister`, bukan dibaca di dalam
   * `KartuProduk`, karena status ini soal isi spesifikasinya, bukan soal
   * gambarannya di layar.
   */
  kelengkapan: KelengkapanBom;
}

/**
 * Selesai atau belumnya satu BOM.
 *
 * `belumDiputuskan` memuat NAMA jenis yang masih kosong, bukan jumlahnya:
 * yang perlu ditindak dari kartu adalah "jenis mana yang belum", dan angka
 * saja tidak bisa dipakai membuka barisnya.
 */
export interface KelengkapanBom {
  lengkap: boolean;
  /** Jenis aksesoris yang belum diputuskan (masih `-`). */
  belumDiputuskan: string[];
}

export interface BomProdukRegister {
  id: number;
  variant_id: number;
  raw_material_id: number | null;
  qty_per_pcs: number;
  no_need: boolean;
  nama: string | null;
  tipe: string | null;
  jenis: string | null;
  satuan: string | null;
  warna: string;
  warna_kode: string | null;
  size: string;
}

export interface ProdukRegister {
  id: string;
  nama: string;
  brand: string;
  registerDate: string;
  kategori: string;
  /** Foto produk. `null` = belum ada berkas, ditampilkan sebagai penanda. */
  foto: string | null;
  harga: number;
  spesifikasi: SpesifikasiProduksi;
  /**
   * Stok gudang per varian, key `${kodeWarna}|${size}`.
   *
   * Terpisah dari `spesifikasi.warna[].pcs[].qty`, dan itu disengaja: `qty`
   * adalah RENCANA produksi (angka yang diketik di form Tambah Produksi),
   * sedangkan angka di sini adalah barang yang benar-benar ada di gudang.
   * Keduanya berbeda dan sering tidak sama besar — menggabungkannya jadi satu
   * field membuat rencana dan kenyataan saling menimpa.
   *
   * Kosong = varian ini belum punya catatan stok, dan itu berbeda dari stok
   * nol. Produk yang datang dari database selalu mengisinya; produk contoh
   * di bawah tidak, dan untuk mereka stok dibaca dari peta `STOK` seperti
   * sebelumnya.
   */
  stok?: Record<string, number>;
  /**
   * Status pendaftaran marketplace, satu entri per platform.
   *
   * Kosong = pakai peta contoh `PASAR` seperti sebelumnya. Produk yang datang
   * dari database selalu mengirim ketiga barisnya — termasuk yang belum
   * terdaftar, karena justru itu yang dicari di kartu.
   */
  pasar?: StatusPasar[];
  bom?: BomProdukRegister[];
  /** Database variant IDs keyed by `${kodeWarna}|${size}` for safe synchronization. */
  variantIds?: Record<string, number>;
}

// ===== Data contoh =====
//
// Empat produk, dua varian warna masing-masing. Jumlahnya sengaja kecil: yang
// sedang dinilai di sini susunan kolom dan alur klik-nya, bukan kemampuannya
// menampung ribuan baris.

const KAIN_KATUN: SpesifikasiKain = {
  nama: 'Cotton Combed 30s',
  satuan: 'm',
  perWarna: {
    HTP: { perPcs: 1.6, tersedia: 480 },
    PTH: { perPcs: 1.6, tersedia: 520 },
  },
};

const AKSESORI_LABEL: SpesifikasiAksesori = {
  nama: 'Label Brand',
  varian: '—',
  berlaku: 'All variations',
  perPcs: 1,
  satuan: 'pcs',
  tersedia: 900,
};

const AKSESORI_BENANG: SpesifikasiAksesori = {
  nama: 'Benang Jahit',
  varian: '—',
  berlaku: 'All variations',
  perPcs: 0.2,
  satuan: 'roll',
  tersedia: 40,
};

export const PRODUK_REGISTER: ProdukRegister[] = [
  {
    id: 'PRD-01',
    nama: 'Rowe Tee',
    brand: 'Livou',
    registerDate: '2026-08-01',
    kategori: 'T-Shirt',
    foto: 'contoh',
    harga: 149000,
    spesifikasi: {
      designCode: 'LVU-TOP-11',
      kategori: 'T-Shirt',
      batch: 'B-04',
      kategoriVendor: 'konveksi',
      namaVendor: 'Livou',
      warna: [
        {
          nama: 'Hitam',
          kode: 'HTP',
          pcs: [
            { ukuran: 'S', qty: 20 },
            { ukuran: 'M', qty: 30 },
            { ukuran: 'L', qty: 25 },
            { ukuran: 'XL', qty: 10 },
          ],
        },
        {
          nama: 'Putih',
          kode: 'PTH',
          pcs: [
            { ukuran: 'S', qty: 15 },
            { ukuran: 'M', qty: 25 },
            { ukuran: 'L', qty: 20 },
            { ukuran: 'XL', qty: 10 },
          ],
        },
      ],
      kain: [KAIN_KATUN],
      aksesori: [AKSESORI_LABEL, AKSESORI_BENANG],
    },
  },
  {
    id: 'PRD-02',
    nama: 'Aline Pants',
    brand: 'Livou',
    registerDate: '2026-08-12',
    kategori: 'Pants',
    foto: null,
    harga: 289000,
    spesifikasi: {
      designCode: 'LVU-BTM-04',
      kategori: 'Pants',
      batch: 'B-04',
      kategoriVendor: 'garment',
      namaVendor: 'Livou',
      warna: [
        {
          nama: 'Hitam',
          kode: 'HTP',
          pcs: [
            { ukuran: 'S', qty: 15 },
            { ukuran: 'M', qty: 20 },
            { ukuran: 'L', qty: 15 },
          ],
        },
        {
          nama: 'Navy',
          kode: 'NVY',
          pcs: [
            { ukuran: 'S', qty: 10 },
            { ukuran: 'M', qty: 15 },
            { ukuran: 'L', qty: 10 },
          ],
        },
      ],
      kain: [
        {
          nama: 'Twill Stretch',
          satuan: 'm',
          perWarna: {
            HTP: { perPcs: 1.4, tersedia: 210 },
            NVY: { perPcs: 1.4, tersedia: 95 },
          },
        },
      ],
      aksesori: [
        { ...AKSESORI_LABEL, tersedia: 600 },
        { nama: 'Kancing Metal', varian: '—', berlaku: 'All variations', perPcs: 1, satuan: 'pcs', tersedia: 300 },
      ],
    },
  },
  {
    id: 'PRD-03',
    nama: 'Midi Dress',
    brand: 'Livou',
    registerDate: '2026-09-02',
    kategori: 'Dress',
    foto: 'contoh',
    harga: 359000,
    spesifikasi: {
      designCode: 'LVU-DRS-02',
      kategori: 'Dress',
      batch: 'B-05',
      kategoriVendor: 'konveksi',
      namaVendor: 'Livou',
      warna: [
        {
          nama: 'Cream',
          kode: 'CRM',
          pcs: [
            { ukuran: 'S', qty: 10 },
            { ukuran: 'M', qty: 18 },
            { ukuran: 'L', qty: 12 },
          ],
        },
        {
          nama: 'Hitam',
          kode: 'HTP',
          pcs: [
            { ukuran: 'S', qty: 8 },
            { ukuran: 'M', qty: 14 },
            { ukuran: 'L', qty: 10 },
          ],
        },
      ],
      kain: [
        {
          nama: 'Rayon Viscose',
          satuan: 'm',
          perWarna: {
            CRM: { perPcs: 2.2, tersedia: 150 },
            HTP: { perPcs: 2.2, tersedia: 88 },
          },
        },
      ],
      aksesori: [AKSESORI_LABEL, { nama: 'Resleting 40cm', varian: '—', berlaku: 'All variations', perPcs: 1, satuan: 'pcs', tersedia: 120 }],
    },
  },
  {
    id: 'PRD-04',
    nama: 'Celeste Blouse',
    brand: 'Livou',
    registerDate: '2026-09-18',
    kategori: 'Blouse',
    foto: null,
    harga: 219000,
    spesifikasi: {
      designCode: 'LVU-TOP-31',
      kategori: 'Blouse',
      batch: 'B-05',
      kategoriVendor: 'inhouse',
      namaVendor: 'Livou',
      warna: [
        {
          nama: 'Putih',
          kode: 'PTH',
          pcs: [
            { ukuran: 'S', qty: 12 },
            { ukuran: 'M', qty: 20 },
            { ukuran: 'L', qty: 15 },
          ],
        },
      ],
      kain: [
        {
          nama: 'Satin Silk',
          satuan: 'm',
          perWarna: { PTH: { perPcs: 1.8, tersedia: 260 } },
        },
      ],
      aksesori: [AKSESORI_LABEL],
    },
  },
];

/**
 * Stok contoh per varian, di-key `productId|kodeWarna|size`.
 *
 * Dipisah dari katalog di atas karena ini angka GUDANG, bukan spesifikasi
 * produk — dan bentuknya peta, bukan angka yang ditulis di dalam kartu
 * produknya: satu varian punya tiga angka stok yang harus konsisten satu sama
 * lain (masuk + menunggu = total), dan angka-angka yang ditulis terpisah di 23
 * baris adalah 23 kesempatan untuk tidak konsisten.
 *
 * `jual` sengaja TIDAK dihitung dari total: sebagian stok bisa sudah terikat
 * pesanan, jadi bisa lebih kecil — dan itu keadaan nyata yang perlu terlihat,
 * bukan pembulatan.
 */
const STOK: Record<string, { masuk: number; menunggu: number; jual?: number }> = {
  'PRD-01|HTP|S': { masuk: 40, menunggu: 0 },
  'PRD-01|HTP|M': { masuk: 85, menunggu: 5, jual: 80 },
  'PRD-01|HTP|L': { masuk: 60, menunggu: 0 },
  'PRD-01|HTP|XL': { masuk: 25, menunggu: 0 },
  'PRD-01|PTH|S': { masuk: 30, menunggu: 0 },
  'PRD-01|PTH|M': { masuk: 70, menunggu: 10, jual: 60 },
  'PRD-01|PTH|L': { masuk: 55, menunggu: 0 },
  'PRD-01|PTH|XL': { masuk: 20, menunggu: 0 },
  'PRD-02|HTP|S': { masuk: 35, menunggu: 0 },
  'PRD-02|HTP|M': { masuk: 48, menunggu: 2, jual: 46 },
  'PRD-02|HTP|L': { masuk: 30, menunggu: 0 },
  'PRD-02|NVY|S': { masuk: 22, menunggu: 0 },
  'PRD-02|NVY|M': { masuk: 40, menunggu: 0 },
  'PRD-02|NVY|L': { masuk: 18, menunggu: 4 },
  'PRD-03|CRM|S': { masuk: 20, menunggu: 0 },
  'PRD-03|CRM|M': { masuk: 45, menunggu: 0 },
  'PRD-03|CRM|L': { masuk: 28, menunggu: 3 },
  'PRD-03|HTP|S': { masuk: 15, menunggu: 0 },
  'PRD-03|HTP|M': { masuk: 38, menunggu: 0 },
  'PRD-03|HTP|L': { masuk: 22, menunggu: 0 },
  'PRD-04|PTH|S': { masuk: 26, menunggu: 0 },
  'PRD-04|PTH|M': { masuk: 52, menunggu: 0 },
  'PRD-04|PTH|L': { masuk: 34, menunggu: 0 },
};

/**
 * Status pendaftaran contoh per produk, di-key `productId`.
 *
 * Dipisah dari katalog di atas dengan alasan yang sama seperti `STOK`: ini
 * keadaan BISNIS (sudah didaftarkan ke platform mana saja), bukan spesifikasi
 * produk — dan menaruhnya di dalam tiap produk berarti 4 kesempatan untuk
 * tidak konsisten soal platform mana yang ada.
 *
 * `terdaftar` sengaja hanya ditulis untuk yang SUDAH terdaftar. Selebihnya
 * dianggap belum — jadi menambah platform baru nanti tidak perlu menyunting
 * empat produk sekaligus, cukup menambah namanya di `PLATFORM`. Produk yang
 * belum terdaftar di platform apa pun cukup tidak punya entri sama sekali.
 *
 * BELUM TERHUBUNG DATABASE, sama seperti sisa katalog ini.
 */
const PASAR: Record<string, Partial<Record<Platform, boolean>>> = {
  // Semua platform — produk pertama, sudah lengkap.
  'PRD-01': { shopee: true, tiktok: true, shopify: true },
  // Hanya Shopee: menggambarkan produk yang pendaftarannya belum tuntas, jadi
  // keadaan "sebagian" ini benar-benar terlihat di kartu dan bukan cuma
  // diandaikan ada.
  'PRD-02': { shopee: true },
  // Semua platform.
  'PRD-03': { shopee: true, tiktok: true, shopify: true },
  // Hanya TikTok: produk terbaru yang baru masuk satu platform.
  'PRD-04': { tiktok: true },
};

/**
 * Hitung kelengkapan BOM: selesai hanya kalau SETIAP jenis aksesoris sudah
 * diputuskan — dipakai (ada namanya) atau sengaja tidak dipakai ("no need").
 *
 * Dipisah dari `kartuRegister` karena aturannya yang perlu dibaca ulang saat
 * pertanyaannya "kenapa produk ini masih draft", bukan pemetaannya.
 *
 * Tiga keadaan yang sengaja dibedakan, dan ketiganya nyata:
 *
 *   - daftar jenis yang wajib KOSONG → LENGKAP. Dipakai pemanggil yang memang
 *     tidak punya apa pun untuk diputuskan. Halaman TIDAK memakai ini: ia
 *     selalu mengirim daftar master (bawaan fungsi ini).
 *   - jenis ada, semuanya sudah punya keputusan → LENGKAP.
 *   - ada satu saja yang kosong → draft, dan yang kosong disebut namanya.
 *
 * "no need" dihitung SUDAH DIPUTUSKAN, bukan kosong: itu justru keputusan
 * yang dicari. Yang masih kosong (`-`) berarti belum diputuskan.
 *
 * Akibat yang SENGAJA dari aturan di atas: produk yang BOM-nya belum diisi
 * (`aksesori` kosong, dan begitulah setiap produk dari database — lihat
 * catatan di `lib/registerProduk.ts`) terbaca DRAFT. Itu memang yang diminta
 * pemilik: lencananya adalah daftar kerja, dan produk yang aksesorinya belum
 * pernah diputuskan memang belum selesai. Lencana ini baru berhenti berguna
 * kalau ia menyala untuk produk yang sudah diisi — bukan kalau ia menyala
 * untuk yang belum.
 */
export function fungsiKelengkapanBom(
  sp: SpesifikasiProduksi,
  /**
   * Jenis yang wajib diputuskan. Bawaannya daftar dari master data
   * (`JENIS_AKSESORI_BOM`) — jenis yang tidak dipakai lagi tetap bisa
   * dihilangkan dengan mengirim daftar sendiri, dan daftar KOSONG berarti
   * tidak ada yang perlu diputuskan (selalu selesai).
   */
  jenisWajib: string[] = JENIS_AKSESORI_BOM.map((j) => j.value)
): KelengkapanBom {
  // Jenis yang wajib diputuskan: yang diminta master data, DITAMBAH jenis yang
  // sudah punya baris di BOM. Yang kedua mencegah produk yang memakai jenis
  // lama ikut jadi draft hanya karena master datanya berubah.
  const wajib = [
    ...new Set([...jenisWajib, ...sp.aksesori.map((a) => a.jenis ?? '')]),
  ].filter((jenis) => jenis !== '');

  // Belum diputuskan = belum punya barisnya SAMA SEKALI, atau punya barisnya
  // tapi namanya masih kosong ("-"). "no need" sudah diputuskan.
  const belumDiputuskan = wajib.filter((jenis) => {
    const baris = sp.aksesori.find((a) => a.jenis === jenis);
    return !baris || (baris.nama ?? '').trim() === '';
  });

  return { lengkap: belumDiputuskan.length === 0, belumDiputuskan };
}

/**
 * Rombak katalog jadi satu kartu per produk — bentuk yang dibaca daftar
 * Register.
 *
 * Satu kartu = satu produk. Varian (warna + ukuran) dikumpulkan DI DALAMNYA
 * dan tidak lagi jadi baris sendiri, karena dari cara daftar master dibaca orang
 * sudah jelas: yang dicari lebih dulu "produk ini ada berapa", bukan
 * "varian ketiga produk ini ada berapa".
 *
 * Urutannya mengikuti urutan katalog lalu urutan warna di spesifikasinya —
 * bukan diurut ulang di sini, supaya dua varian satu produk selalu berdampingan
 * dan mata bisa membandingkannya.
 *
 * Kartu ini menyiapkan DUA tingkat ringkasan, untuk dua pembaca berbeda:
 *   - `warnaRingkas` — satu baris per warna. Inilah yang dirender di kartu.
 *     Untuk produk 8 varian, 8 baris angka tidak bisa dibandingkan sekilas;
 *     "Hitam 210" jauh lebih cepat dibaca daripada empat baris S/M/L/XL.
 *   - `varian` — satu baris per (warna × ukuran). Tidak dirender di kartu,
 *     tapi dipakai dialog detail dan pencarian, jadi tidak ada angka yang hilang.
 *
 * Katalognya bisa diganti pemanggil (`daftar`), karena kartu Register
 * setelah ini tidak hanya berisi empat produk contoh: produk yang baru
 * didaftarkan lewat form "Tambah Produk" ikut lewat sini, lewat pemanggilan
 * kedua di `RegisterProduk`. Menyalin logika peringkasan ke pemanggil berarti
 * dua implementasi yang bisa berbeda — dan karena keduanya menghitung angka
 * yang sama (total stok, nilai sisa), layar bisa menampilkan dua angka
 * berbeda untuk satu produk tanpa ada yang mengetahuinya. Satu definisi, satu
 * sumber.
 *
 * Default-nya `PRODUK_REGISTER` supaya pemanggil lama yang tidak-care tidak
 * ikut berubah.
 */
export function kartuRegister(
  daftar: ProdukRegister[] = PRODUK_REGISTER
): KartuRegister[] {
  return daftar.map((p) => {
    const varian: VarianRegister[] = [];

    for (const w of p.spesifikasi.warna) {
      for (const ukuran of w.pcs) {
        // Dua sumber angka stok, dan yang satu tidak menimpa yang lain:
        //   - `p.stok` — angka GUDANG yang dikirim database.
        //   - `STOK`   — peta contoh untuk produk bawaan yang belum terhubung.
        // Produk yang punya `stok` TIDAK ikut membaca peta contoh: produk
        // database berstok nol dan produk contoh berstok nol terlihat sama,
        // tapi yang pertama berarti "barangnya habis" dan yang kedua berarti
        // "angkanya belum pernah ada".
        const dariDb = p.stok?.[`${w.kode}|${ukuran.ukuran}`];
        const contoh = STOK[`${p.id}|${w.kode}|${ukuran.ukuran}`];
        const angka = dariDb !== undefined ? { masuk: dariDb, menunggu: 0 } : contoh;

        // Varian yang stoknya belum pernah dicatat tetap dihitung, dengan angka
        // nol. Menghilangkannya membuat produk yang baru didaftarkan terlihat
        // tidak punya varian sama sekali.
        varian.push({
          id: `${p.id}-${w.kode}-${ukuran.ukuran}`,
          kodeWarna: w.kode,
          // Kode yang diketik pengguna menang kalau ada. Kalau tidak, kode
          // variasi tetap diturunkan seperti biasa -- jadi produk yang
          // kodenya belum pernah diisi tidak ikut berubah bentuk.
          kodeVarian:
            ukuran.kode || `${p.spesifikasi.designCode}-${w.kode}-${ukuran.ukuran}`,
          warna: w.nama,
          size: ukuran.ukuran,
          stokMasuk: angka?.masuk ?? 0,
          stokJual: angka?.jual ?? angka?.masuk ?? 0,
          stokMenunggu: angka?.menunggu ?? 0,
        });
      }
    }

    // Ringkasan per warna. Dikelompokkan dari `varian` yang baru dibangun,
    // bukan dengan menulis ulang perulangan di atas — jadi tidak mungkin dua
    // tingkat ringkasan berhitung beda karena satu diperbarui dan yang lain tidak.
    const perWarna = new Map<string, VarianRegister[]>();
    for (const v of varian) {
      const isi = perWarna.get(v.kodeWarna);
      if (isi) isi.push(v);
      else perWarna.set(v.kodeWarna, [v]);
    }

    const warnaRingkas: WarnaRegister[] = [...perWarna.entries()].map(([kode, isi]) => ({
      id: `${p.id}-${kode}`,
      kodeWarna: kode,
      warna: isi[0].warna,
      jumlahSize: isi.length,
      stokJual: isi.reduce((s, v) => s + v.stokJual, 0),
      stokTotal: isi.reduce((s, v) => s + v.stokMasuk + v.stokMenunggu, 0),
      size: isi.map((v) => v.size).join(', '),
    }));

    const totalMasuk = varian.reduce((s, v) => s + v.stokMasuk, 0);
    const totalJual = varian.reduce((s, v) => s + v.stokJual, 0);
    // "Menunggu" tidak lagi jadi kolom, tapi barang yang menunggu tetap ada di
    // gudang — jadi ia tetap masuk hitungan total. Mengeluarkannya bukan sekadar
    // menyembunyikan angka, itu membuat total lebih kecil dari kenyataan.
    const totalStok = totalMasuk + varian.reduce((s, v) => s + v.stokMenunggu, 0);

    // Selalu tiga baris, urut `PLATFORM` — lihat catatan di `StatusPasar`.
    // Yang tidak disebut di `PASAR` berarti belum terdaftar, dan itu tetap
    // dikirim sebagai baris supaya kartunya bisa menampilkan "belum" alih-alih
    // diam-diam menghilangkan platformnya.
    //
    // Produk yang datang dari database sudah membawa ketiga barisnya sendiri
    // (`p.pasar`), jadi peta contoh tidak dibaca lagi untuk mereka — kalau
    // keduanya dibaca, produk database bisa mewarisi status contoh yang
    // kebetulan punya id sama.
    const pasar: StatusPasar[] = p.pasar
      ? PLATFORM.map((platform) => {
          const dariDb = p.pasar?.find((s) => s.platform === platform);
          return {
            platform,
            terdaftar: dariDb?.terdaftar ?? false,
            fotoBukti: dariDb?.fotoBukti ?? null,
          };
        })
      : PLATFORM.map((platform) => ({
          platform,
          terdaftar: PASAR[p.id]?.[platform] === true,
          fotoBukti: null,
        }));

    return {
      id: p.id,
      nama: p.nama,
      kategori: p.kategori,
      kode: p.spesifikasi.designCode,
      brand: p.brand,
      foto: p.foto,
      registerDate: p.registerDate,
      harga: p.harga,
      varian,
      warnaRingkas,
      pasar,
      jumlahWarna: p.spesifikasi.warna.length,
      jumlahVarian: varian.length,
      totalMasuk,
      totalJual,
      totalStok,
      // Nilai sisa dihitung dari TOTAL stok, bukan stok jual: yang dinilai
      // di gudang adalah seluruh barang yang ada, termasuk yang belum bisa
      // dijual.
      nilaiSisa: totalStok * p.harga,
      // Dihitung di sini, bukan di kartunya: status ini soal isi BOM, dan
      // perhitungan yang sama juga dipakai penyaring di halaman.
      kelengkapan: fungsiKelengkapanBom(p.spesifikasi),
    };
  });
}

/** Produk yang punya varian dengan nama itu — untuk pengisian otomatis form. */
export function cariProduk(nama: string): ProdukRegister | undefined {
  const q = nama.trim().toLowerCase();
  if (q === '') return undefined;
  return PRODUK_REGISTER.find((p) => p.nama.toLowerCase() === q);
}

/**
 * Nama produk untuk saran di form produksi.
 *
 * Yang dikembalikan nama produknya saja (bukan baris varian): form produksi
 * meminta satu nama, lalu seluruh spesifikasinya ikut terisi.
 */
export function namaProduk(): string[] {
  return PRODUK_REGISTER.map((p) => p.nama);
}
