// ===== Katalog produk (data contoh) =====
//
// Satu sumber untuk dua tempat yang memang harus sepakat:
//
//   - halaman REGISTER > Register Produk (daftar ala POS)
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

/** Satu baris varian di daftar Register — satu warna + satu ukuran. */
export interface BarisRegister {
  id: string;
  productId: string;
  nama: string;
  kategori: string;
  /** Kode desain produk, mis. LVU-TOP-11. */
  kode: string;
  /**
   * Kode warnanya saja, mis. HTP.
   *
   * Bawaan katalog, bukan kolom tabel: daftar Register menampilkan `warna`
   * (nama, mis. "Hitam Putih") sebagai kolomnya. Field ini disimpan supaya
   * pencarian bisa mencocokkan kode pendek tanpa harus mem-parse `kodeVarian`,
   * dan akan dipakai begitu pencarian itu dibuat.
   */
  kodeWarna: string;
  /** Kode varian lengkap: desain + warna + ukuran, mis. LVU-TOP-11-HTP-M. */
  kodeVarian: string;
  warna: string;
  size: string;
  brand: string;
  /** Foto produk. `null` = belum ada berkas, ditampilkan sebagai penanda. */
  foto: string | null;
  registerDate: string;
  /** Harga jual per pcs. */
  harga: number;
  /** Stok yang sudah masuk gudang. */
  stokMasuk: number;
  /** Stok yang bisa dijual — sebagian bisa tertahan untuk pesanan. */
  stokJual: number;
  /**
   * Stok yang sedang menunggu diproses (mis. belum lolos QC).
   *
   * Nol berarti tidak ada yang menunggu — dan itu ditampilkan sebagai 0, bukan
   * sebagai tanda hubung: "tidak ada yang menunggu" adalah kabar, sedangkan
   * kosong terbaca sebagai "tidak diketahui".
   */
  menunggu: number;
  /** Total stok = masuk + menunggu. */
  totalStok: number;
  /** Nilai sisa: total stok × harga jual. */
  nilaiSisa: number;
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
 * produk — dan bentuknya peta, bukan angka yang ditulis di dalam barisnya:
 * satu varian punya tiga angka stok yang harus konsisten satu sama lain
 * (masuk + menunggu = total), dan angka-angka yang ditulis terpisah di 14
 * baris adalah 14 kesempatan untuk tidak konsisten.
 *
 * `stokJual` sengaja TIDAK dihitung dari total: sebagian stok bisa sudah
 * terikat pesanan, jadi bisa lebih kecil — dan itu keadaan nyata yang perlu
 * terlihat, bukan pembulatan.
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
 * Rombak katalog jadi baris per varian — bentuk yang dibaca daftar POS.
 *
 * Satu baris = satu varian (warna + ukuran), bukan satu produk: itulah yang
 * punya stok dan harga sendiri, dan itu yang dicari saat memeriksa "ukuran M
 * yang hitam masih ada berapa".
 *
 * Urutannya mengikuti urutan katalog lalu urutan warna di spesifikasinya —
 * bukan diurut ulang di sini, supaya dua varian satu produk selalu muncul
 * berdampingan dan mata bisa membandingkannya.
 */
export function barisRegister(): BarisRegister[] {
  const hasil: BarisRegister[] = [];

  for (const p of PRODUK_REGISTER) {
    for (const w of p.spesifikasi.warna) {
      for (const ukuran of w.pcs) {
        const stok = STOK[`${p.id}|${w.kode}|${ukuran.ukuran}`];
        // Varian yang stoknya belum pernah dicatat tetap ditampilkan, dengan
        // angka nol. Menyembunyikannya membuat produk yang baru didaftarkan
        // tampak tidak punya varian sama sekali.
        const masuk = stok?.masuk ?? 0;
        const menunggu = stok?.menunggu ?? 0;
        const totalStok = masuk + menunggu;

        hasil.push({
          id: `${p.id}-${w.kode}-${ukuran.ukuran}`,
          productId: p.id,
          nama: p.nama,
          kategori: p.kategori,
          kode: p.spesifikasi.designCode,
          kodeWarna: w.kode,
          kodeVarian: `${p.spesifikasi.designCode}-${w.kode}-${ukuran.ukuran}`,
          warna: w.nama,
          size: ukuran.ukuran,
          brand: p.brand,
          foto: p.foto,
          registerDate: p.registerDate,
          harga: p.harga,
          stokMasuk: masuk,
          stokJual: stok?.jual ?? masuk,
          menunggu,
          totalStok,
          // Nilai sisa dihitung dari TOTAL stok, bukan stok jual: yang dinilai
          // di gudang adalah seluruh barang yang ada, termasuk yang belum bisa
          // dijual.
          nilaiSisa: totalStok * p.harga,
        });
      }
    }
  }

  return hasil;
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
