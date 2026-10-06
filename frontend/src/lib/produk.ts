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
        const stok = STOK[`${p.id}|${w.kode}|${ukuran.ukuran}`];
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
          stokMasuk: stok?.masuk ?? 0,
          stokJual: stok?.jual ?? stok?.masuk ?? 0,
          stokMenunggu: stok?.menunggu ?? 0,
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
      jumlahWarna: p.spesifikasi.warna.length,
      jumlahVarian: varian.length,
      totalMasuk,
      totalJual,
      totalStok,
      // Nilai sisa dihitung dari TOTAL stok, bukan stok jual: yang dinilai
      // di gudang adalah seluruh barang yang ada, termasuk yang belum bisa
      // dijual.
      nilaiSisa: totalStok * p.harga,
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
