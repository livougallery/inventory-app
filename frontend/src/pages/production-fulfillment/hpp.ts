import type { KartuPdff } from './data-kanban';
import { AKHIRAN_WORKCODE, MARGIN_HARGA_JUAL, totalPcs } from './data-kanban';

// ===== HPP: dua mode, dua rumus =====
//
// Berkas ini berdiri sendiri, bukan ditambahkan ke `data-kanban.ts`, karena tiga
// hal:
//
//  1. `data-kanban.ts` ikut disunting tiket lain yang jalan bersamaan. Rumus HPP
//     tidak perlu ikut jadi bahan perebutan baris.
//  2. Arah impornya satu arah. `data-kanban.ts` tidak tahu apa-apa soal HPP,
//     jadi berkas ini boleh memakainya tanpa risiko lingkaran.
//  3. HPP punya aturan sendiri (harga FIFO, ongkos jahit, margin global) yang
//     tidak berlaku untuk kartu di luar halaman HPP & Price.
//
//
// HPP Produksi — bahan dari kartu, dibagi barang jadi
//     totalBiaya  = Σ (totalUsage × hargaFIFO)
//     hppProduksi = totalBiaya ÷ jumlahPcsJadi
//
// HPP White Label — beli dan kirim dari satu shipment, dibagi pcs shipment
//     biayaBeli    = actualIdrPaidProduct ÷ totalPcs
//     biayaKirim   = actualIdrPaidLogistic ÷ totalPcs
//     hppWhiteLabel = biayaBeli + biayaKirim
//
// Dua aturan yang mengikatnya sudah diputuskan pemilik:
//
//   • Mode ditentukan PAPAN, bukan workcode. Workcode hanya pengecek: kalau
//     suffix-nya beda dengan papan, tampilkan peringatan, jangan pindah mode.
//     Alasannya tercatat di `data-kanban.ts` — dulu akhiran workcode ditulis di
//     dalam `kartuBaru()`, dan usulan yang dibuat dari papan White Label mendapat
//     workcode produksi tanpa error apa pun. Jadi workcode pernah salah, dan
//     sistemnya sudah tahu itu.
//
//   • HPP Produksi tanpa ongkos jahit = kartu MACET, bukan HPP nol. Ongkos jahit
//     adalah kategori material `cmt_cost`.


/**
 * Bulatkan ke 2 desimal.
 *
 * Ada karena float64. `65 × 1.38` = `89.69999999999999`, bukan `89.7`. Kalau
 * total biaya dijumlahkan dari angka mentah itu, HPP dan kolom Total Cost di
 * tabel bisa berbeda beberapa rupiah — dan yang terlihat di layar adalah
 * bahannya salah, bukan angkanya.
 *
 * Dipakai di SETIAP anak perhitungan, bukan cuma di akhir. Kalau pembulatan
 * baru jalan di akhir, kesalahan survives dari baris pertama sampai terakhir.
 */
export function presisiFix(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Margin global untuk harga jual.
 *
 * SATU konstanta untuk semua produk — bukan per produk, bukan per kanal.
 * Mengubah angka di sini mengubah semua harga jual sekaligus, dan tidak ada
 * tempat lain yang perlu ikut diubah supaya tidak satunya.
 *
 * Dideklarasikan di `data-kanban.ts`, bukan di sini: file itu tidak mengimpor
 * apa pun, jadi konstantanya bisa ditarik ke sana tanpa membuat arah impor
 * berbalik. `hpp.ts` sudah mengimpor `AKHIRAN_WORKCODE` dan `totalPcs` dari
 * sana, jadi menambah satu import searah tidak mengubah apa pun.
 *
 * Diekspor ulang di sini supaya pemanggil yang sudah bekerja dengan rumus HPP
 * cukup mengimpor dari satu modul.
 */
export { MARGIN_HARGA_JUAL };

export type SumberPapan = 'production' | 'whitelabel';

/** Kategori material yang menandai ongkos jahit konveksi. */
export const KATEGORI_CMT = 'cmt_cost';

// ===== Harga FIFO bahan =====
//
// Kartu di `data-kanban.ts` menyimpan kebutuhan (`perPcs`) tapi TIDAK menyimpan
// harga — dan tidak akan, karena harga FIFO berubah setiap kali ada pembelian
// baru. Jadi harga hidup di sini, satu tempat, dan setiap baris yang butuh
// harga mengambil dari peta ini.
//
// Angkanya adalah data contoh untuk presentasi, supaya HPP punya angka yang
// masuk akal dan bisa dibandingkan antar kartu. Ganti di sini kalau sudah ada
// harga asli dari tabel Material.

/** Key: nama material persis seperti tertulis di `detail.aksesori` / `detail.kain`. */
export const HARGA_FIFO: Record<string, number> = {
  // Kain — satuan per meter.
  'Kain Chiffon': 42000,
  'Kain Cotton Combed': 48000,
  'Kain Crepe': 52000,
  'Kain Drill': 55000,
  'Kain Georgette': 58000,
  'Kain Linen': 62000,
  'Kain Pleats': 56000,
  'Kain Polyester': 38000,
  'Kain Poplin': 45000,
  'Kain Rajut': 50000,
  'Kain Rayon': 44000,
  'Kain Satin': 64000,
  'Kain Sifon': 60000,
  'Kain Silk': 125000,
  'Kain Twill': 55000,
  'Kain Velvet': 98000,
  'Kain Voile': 40000,
  // Aksesori.
  'Karet Pinggang': 18000,
  'Label Brand': 2500,
  // Ongkos jahit — satuan per pcs. Baris ini ditambahkan ke setiap kartu
  // Production yang punya `ongkosJahit`; lihat `DetailKartu.ongkosJahit`.
  'Ongkos Jahit Konveksi': 15000,
};

/** Harga label per ukuran: label brand sudah masuk `HARGA_FIFO`, label size tidak. */
export const HARGA_LABEL_SIZE = 1500;

// ===== Bentuk hasil hitung =====

/** Satu baris biaya bahan, sudah dihitung semua. Angka, bukan teks. */
export interface BarisBiaya {
  material: string;
  varian: string;
  berlaku: string;
  /** Kategori material — `cmt_cost` berarti ongkos jahit. */
  kategori: string;
  perPcs: number;
  satuan: string;
  /** Kebutuhan keseluruhan, sudah dibulatkan ke 2 desimal. */
  totalUsage: number;
  /** Harga FIFO per satuan, atau `null` kalau materialnya tidak ada di peta harga. */
  harga: number | null;
  /** `totalUsage × harga`, sudah dibulatkan. `null` kalau harganya tidak ada. */
  biaya: number | null;
}

export interface HasilHppProduksi {
  /** Biaya bahan + ongkos jahit, dijumlahkan dari baris yang harganya ada. */
  totalBiaya: number;
  /** Pembagi: barang jadi yang masuk stok. */
  jumlahPcsJadi: number;
  /** `null` kalau ongkos jahit belum diisi — HPP belum boleh dihitung. */
  hpp: number | null;
  /** Alasan HPP `null`, kalau ada. */
  tanpaOngkosJahit: boolean;
  baris: BarisBiaya[];
  /** Material tanpa harga FIFO — HPP meremehkannya, dan itu harus kelihatan. */
  tanpaHarga: string[];
}

export interface HasilHppWhiteLabel {
  /** `actualIdrPaidProduct ÷ totalPcs`. */
  biayaBeli: number;
  /** `actualIdrPaidLogistic ÷ totalPcs` — ongkos kirim ikut masuk HPP. */
  biayaKirim: number;
  hpp: number;
}

// ===== HPP Produksi =====

/**
 * Susun baris biaya dari spesifikasi kartu, lengkap dengan harga dan biayanya.
 *
 * Urutannya sama dengan `bahanKartu()`: aksesori umum, label per ukuran, kain
 * per warna, lalu ongkos jahit. Baris yang tidak punya harga FIFO tetap ikut
 *dikirim, dengan `harga: null` — disembunyikan saja bukan berarti tidak ada.
 */
export function barisBiayaKartu(
  kartu: KartuPdff,
  ongkosJahit: { perPcs: number } | undefined
): BarisBiaya[] {
  const { warna, aksesori, kain, labelTersedia } = kartu.detail;
  const semuaPcs = totalPcs(kartu);
  const baris: BarisBiaya[] = [];

  const push = (
    material: string,
    varian: string,
    berlaku: string,
    perPcs: number,
    satuan: string,
    qty: number,
    // Override harga. Hanya untuk ongkos jahit, yang harganya datang dari
    // parameter dan bukan dari `HARGA_FIFO`. `undefined` berarti "tidak ada
    // override"; `null` berarti override yang sengaja dikosongkan. Dua keadaan
    // itu dibedakan, jadi keduanya harus dinyatakan eksplisit di tipe.
    hargaOpsi?: number | null
  ) => {
    const totalUsage = presisiFix(perPcs * qty);
    // Label per ukuran diambil dari peta terpisah: namanya berbeda tiap ukuran,
    // jadi tidak bisa jadi satu entri di `HARGA_FIFO`.
    const harga =
      hargaOpsi !== undefined
        ? hargaOpsi
        : (HARGA_FIFO[material] ??
          (material.startsWith('Label Size ') ? HARGA_LABEL_SIZE : null));
    baris.push({
      material,
      varian,
      berlaku,
      kategori: material === 'Ongkos Jahit Konveksi' ? KATEGORI_CMT : 'bahan',
      perPcs: presisiFix(perPcs),
      satuan,
      totalUsage,
      harga,
      // `null`, bukan `totalUsage × 0`. Kalau harga tidak ada, biaya ini belum
      // diketahui — dan 0 akan ikut dijumlahkan sehingga HPP terlihat sudah
      // lengkap padahal ada bahan yang belum dihargai.
      //
      // Dihitung dari `totalUsage`, yang sendiri diturunkan dari `perPcs` — bukan
      // dihitung terpisah. Kalau ongkos jahit punya jalur sendiri, ada dua
      // tempat yang bisayai berbeda pendapat soal biayanya tanpa ada yang salah.
      biaya: harga === null ? null : presisiFix(totalUsage * harga),
    });
  };

  for (const a of aksesori) {
    push(a.nama, a.varian, a.berlaku, a.perPcs, a.satuan, semuaPcs);
  }

  const ukuranUnik = [...new Set(warna.flatMap((w) => w.pcs.map((p) => p.ukuran)))];
  for (const u of ukuranUnik) {
    // Sama seperti `bahanKartu()`: ukuran yang stok labelnya belum dicatat
    // dilewati, bukan dianggap nol.
    if (labelTersedia[u] === undefined) continue;
    const qty = warna.reduce(
      (s, w) => s + w.pcs.filter((p) => p.ukuran === u).reduce((a, p) => a + p.qty, 0),
      0
    );
    push(`Label Size ${u}`, '—', `Size ${u}`, 1, 'pcs', qty);
  }

  for (const k of kain) {
    for (const w of warna) {
      const spec = k.perWarna[w.kode];
      if (!spec) continue;
      const qty = w.pcs.reduce((a, p) => a + p.qty, 0);
      push(k.nama, w.nama, `Color ${w.nama}`, spec.perPcs, k.satuan, qty);
    }
  }

  if (ongkosJahit) {
    // `ongkosJahit.perPcs` sudah adalah HARGA per pcs, bukan kebutuhan bahan.
    // Jadi kebutuhannya 1 pcs per barang jadi — persis seperti bahan lain, dan
    // dihitung lewat `push()` yang sama. Jalur terpisah dulu membuat ongkos jahit
    // bisa terhitung dua kali tanpa ada yang salah: {kebutuhan} × {harga}, yang
    // angkanya melonjak jadi 225.092.008 dan tidak pernah muncul sebagai error.
    push('Ongkos Jahit Konveksi', '—', 'Semua Varian', 1, 'pcs', semuaPcs, ongkosJahit.perPcs);
  }

  return baris;
}

/**
 * HPP Produksi.
 *
 * `jumlahPcsJadi` = `totalPcs(kartu)`, yaitu barang jadi yang masuk stok.
 * Keputusan pemilik: app ini TIDAK mengurangi reject, karena kalau dikurangi
 * HPP akan selalu berbeda dari perhitungan di luar app. Yang sampai dianggap
 * masuk — dan pembaginya adalah jumlah yang sama dengan kebutuhan bahannya, jadi
 * tidak ada bahan yang ditanggung separuh.
 */
export function hppProduksi(
  kartu: KartuPdff,
  ongkosJahit: { perPcs: number } | undefined
): HasilHppProduksi {
  const baris = barisBiayaKartu(kartu, ongkosJahit);
  const jumlahPcsJadi = totalPcs(kartu);
  const tanpaHarga = baris
    .filter((b) => b.harga === null)
    .map((b) => `${b.material} (${b.varian})`);
  const tanpaOngkosJahit = !baris.some((b) => b.kategori === KATEGORI_CMT);

  // Jumlahkan baris yang biayanya benar-benar ada. Baris tanpa harga tidak
  // ikut — dan namanya dikembalikan supaya tidak hilang diam-diam.
  const totalBiaya = presisiFix(
    baris.reduce((s, b) => s + (b.biaya ?? 0), 0)
  );

  return {
    totalBiaya,
    jumlahPcsJadi,
    // Tanpa ongkos jahit, HPP TIDAK dihitung. Bukan 0 — 0 akan terbaca sebagai
    // "produk ini gratis", dan kartu pun akan lolos ke Upload dengan angka itu.
    // Owner: "tidak mungkin hpp produksi tidak punya ongkos jahit, pasti punya.
    // Kalau masih kosong biarin stuck di hpp."
    hpp: tanpaOngkosJahit ? null : presisiFix(totalBiaya / jumlahPcsJadi),
    tanpaOngkosJahit,
    baris,
    tanpaHarga,
  };
}

// ===== HPP White Label =====

/**
 * Bagian shipment yang dipakai rumus HPP.
 *
 * Ditulis sebagai bentuk terpisah, bukan `BarisHpp` dari `HppPratinjau.tsx`:
 * berkas itu mengimpor fungsi ini, jadi bentuknya harus di sini —
 * kalau dibalik, baru ada lingkaran.
 */
export interface BarisBiayaWhiteLabel {
  actualIdrPaidProduct: number;
  actualIdrPaidLogistic: number;
  totalPcs: number;
}

/**
 * HPP White Label: beli + kirim, dibagi pcs.
 *
 * `pricePerPcs` SENGAJA TIDAK dipakai. Di tiga dari empat baris contoh, ia tidak
 * cocok dengan `totalPrice ÷ totalPcs` (52 vs 52,5; 42 vs 52,5; 95 vs 308,33),
 * jadi ia tidak bisa jadi sumber. Yang dipakai `actualIdrPaidProduct`, yang
 * sudah terverifikasi sama dengan `totalPrice × kurs` di semua baris.
 *
 * `totalPcs` adalah pcs SEORANG SHIPMENT, bukan pcs baris ini. Baris 1 dan 2 satu
 * shipment yang sama dan dua-duanya menulis 80 — dan itu benar, bukan data yang
 * terulang dua kali. Karena itu baris per shipment TIDAK boleh dijumlahkan:
 * menjumlahkan akan menghitung ongkos kirim dua kali.
 */
export function hppWhiteLabel(baris: BarisBiayaWhiteLabel): HasilHppWhiteLabel {
  const biayaBeli = presisiFix(baris.actualIdrPaidProduct / baris.totalPcs);
  const biayaKirim = presisiFix(baris.actualIdrPaidLogistic / baris.totalPcs);
  return { biayaBeli, biayaKirim, hpp: presisiFix(biayaBeli + biayaKirim) };
}

// ===== Memasangkan kartu White Label ke baris shipment =====

/** Bentuk yang dipakai fungsi ini — cukup kolom yang benar-benar dibaca. */
export interface BarisShipmentRingkas {
  namaProduct: string;
  actualIdrPaidProduct: number;
  actualIdrPaidLogistic: number;
  totalPcs: number;
  codeShipment: string;
  currency: string;
  kurs: number;
  namaSupplier: string;
}

/**
 * Baris shipment milik kartu ini, kalau ada.
 *
 * Dicocokkan lewat `namaProduct`. Bukan pilihan stylistic: kartu White Label
 * TIDAK punya field `kodeShipmentLivou` — field itu ada di tabel
 * `ProductionFulfillment`, bukan di `KartuPdff`. Jadi nama produk adalah satu-
 * satu kunci yang ada di kedua tempat.
 *
 * Kalau nama itu nanti tidak lagi unik, yang benar bukan menebak dengan potongan
 * teks — potongan yang cocok ke nama yang mirip akan mengembalikan angka kartu
 * LAIN tanpa error sama sekali — tapi menambahkan workcode yang sama ke kedua
 * tempat dan mencocokkan lewat itu. Sampai itu terjadi, lebih baik HPP-nya
 * kosong dengan alasan yang tampil daripada terisi angka yang salah.
 *
 * `produkAmbigu` mengembalikan nama yang cocok lebih dari sekali, supaya pemanggil
 * bisa MENOLAK menampilkannya alih-alih diam-diam memilih yang pertama.
 */
export function barisShipmentUntuk(
  kartu: KartuPdff,
  baris: readonly BarisShipmentRingkas[]
): { baris: BarisShipmentRingkas | null; produkAmbigu: string | null } {
  const cocok = baris.filter((b) => b.namaProduct === kartu.productName);
  if (cocok.length === 0) return { baris: null, produkAmbigu: null };
  if (cocok.length > 1) return { baris: null, produkAmbigu: kartu.productName };
  return { baris: cocok[0], produkAmbigu: null };
}

// ===== Harga jual =====

/** Harga jual = HPP × margin global. Terhitung, bukan input. */
export function hargaJual(hpp: number): number {
  return presisiFix(hpp * MARGIN_HARGA_JUAL);
}

// ===== Pengecek workcode =====

export interface PengecekSumber {
  /** Suffix workcode, huruf kapital. `null` kalau workcode tidak berakhir apa pun. */
  suffix: string | null;
  /** True kalau suffix workcode cocok dengan papan kartunya. */
  cocok: boolean;
  /** Peringatan untuk ditampilkan. `null` kalau cocok. */
  peringatan: string | null;
}

/**
 * Bandingkan suffix workcode dengan papan kartunya.
 *
 * Ini PENGECEK, bukan penentu mode — papan yang menang. Fungsinya cuma memberi
 * tahu kalau workcode kelihatan salah, supaya orang membetulkannya, bukan
 * supaya sistem diam-diam memakai rumus yang berbeda.
 */
export function cekSumberWorkcode(kartu: KartuPdff, sumber: SumberPapan): PengecekSumber {
  const workcode = kartu.workcode ?? '';
  const pieces = workcode.split('_');
  const suffix = pieces.length ? pieces[pieces.length - 1] : '';
  const diharapkan = AKHIRAN_WORKCODE[sumber];
  if (suffix === diharapkan) return { suffix, cocok: true, peringatan: null };
  return {
    suffix: suffix || null,
    cocok: false,
    peringatan: `Workcode berakhiran "${suffix || '(kosong)'}", bukan "${diharapkan}" seperti papan ${
      sumber === 'production' ? 'Production' : 'White Label'
    }. HPP tetap dihitung memakai rumus papan.`,
  };
}

// ===== Gerbang HPP & Price =====

export interface GerbangHpp {
  /** Boleh kartu lanjut ke stage berikutnya? */
  bolehLanjut: boolean;
  /** Alasan tidak boleh — ditampilkan di tombol yang dinonaktifkan. */
  alasan: string | null;
  /** Peringatan workcode. Tidak menahan kartu; hanya memberi tahu. */
  peringatan: string | null;
  /** HPP kalau sudah boleh dihitung, `null` kalau belum. */
  hpp: number | null;
  /** Harga jual, `null` kalau HPP-nya belum ada. */
  sellingPrice: number | null;
}

/**
 * Gerbang tunggal untuk HPP & Price, dipanggil dari dua mode.
 *
 * Satu fungsi, bukan dua: kalau masing-masing mode punya gynya sendiri, aturan
 * "kartu Production tanpa ongkos jahit tidak boleh lanjut" bisa berlaku di satu
 * tempat dan hilang di tempat lain.
 *
 * Syaratnya:
 *   - Production: ongkos jahit harus ada. Tanpa itu kartu tertahan di HPP.
 *   - White Label: selalu boleh — HPP-nya bisa dihitung begitu ongkostir tersedia.
 */
export function gerbangHpp(
  kartu: KartuPdff,
  sumber: SumberPapan,
  ongkosJahit: { perPcs: number } | undefined,
  whiteLabel?: BarisBiayaWhiteLabel
): GerbangHpp {
  const { peringatan } = cekSumberWorkcode(kartu, sumber);
  if (sumber === 'whitelabel') {
    if (!whiteLabel) {
      return {
        bolehLanjut: false,
        alasan: 'Belum ada data ongkos kirim dan pembelian untuk kartu ini.',
        peringatan,
        hpp: null,
        sellingPrice: null,
      };
    }
    const { hpp } = hppWhiteLabel(whiteLabel);
    return { bolehLanjut: true, alasan: null, peringatan, hpp, sellingPrice: hargaJual(hpp) };
  }

  const hasil = hppProduksi(kartu, ongkosJahit);
  if (hasil.tanpaOngkosJahit) {
    return {
      bolehLanjut: false,
      alasan: 'Ongkos jahit belum diisi. HPP produksi belum bisa dihitung.',
      peringatan,
      hpp: null,
      sellingPrice: null,
    };
  }
  const hpp = hasil.hpp as number;
  return { bolehLanjut: true, alasan: null, peringatan, hpp, sellingPrice: hargaJual(hpp) };
}
