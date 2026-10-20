// ===== Data contoh papan Kanban Production Fulfillment (pratinjau) =====
//
// Halaman ini BELUM tersambung ke database — ini pratinjau tampilan untuk
// presentasi, sama seperti tabel 40 kolom yang sudah ada.
//
// Satu aturan yang dipegang di berkas ini: **tidak ada angka yang diketik dua
// kali.** `planQty` dan jumlah baris varian dihitung dari tabel warna/ukuran,
// dan `Total Need` di BOM dihitung dari qty x kebutuhan per pcs. Alasannya
// bukan kerapian: di presentasi owner sering menjumlahkan sendiri di kepala,
// dan satu angka yang tidak cocok akan menghabiskan sisa presentasi.
//
// Badge di kartu ("Ready" / "Not Enough — Short X m") juga TIDAK disimpan —
// ia diturunkan dari baris BOM. Jadi tidak mungkin ada kartu bertanda "Ready"
// yang isinya masih kurang, atau sebaliknya.

export interface BarisUkuran {
  ukuran: string;
  qty: number;
  /**
   * Kode varian milik pengguna untuk pasangan warna+ukuran ini.
   *
   * Ada karena pemilik meminta kolomnya bisa disunting: rumus kode variasi
   * belum dibuat, jadi yang dipakai adalah hasil ketikan orang, bukan tebakan
   * sistem. Selama field ini opsional, `kartuRegister` tetap menurunkan
   * `kodeVarian` dari `designCode` + kode warna + ukuran seperti biasa — jadi
   * produk lama yang kodenya belum pernah diisi tidak ikut berubah.
   *
   * Tanpa field ini, kode yang diketik di form akan dibuang begitu kartu
   * dirakit: bentuk simpanannya tidak punya tempat untuk menampungnya.
   */
  kode?: string;
  /** Stable database identity for Register Produk variant edits. */
  variantId?: number;
}

/** Satu warna bisa punya jumlah ukuran berbeda dari warna lain — itu wajar. */
export interface BarisWarna {
  nama: string;
  kode: string;
  pcs: BarisUkuran[];
}

export interface SpesifikasiKain {
  nama: string;
  satuan: string;
  /**
   * Kebutuhan dan stok per kode warna. Warna yang tidak tercantum dilewati.
   *
   * `tersedia` boleh kosong: stok yang belum pernah dicatat berbeda dari stok
   * yang habis, dan hanya yang kedua yang boleh jadi badge merah. Lihat
   * `push()` di `bahanKartu()`.
   */
  perWarna: Record<string, { perPcs: number; tersedia?: number }>;
}

export interface SpesifikasiAksesori {
  nama: string;
  varian: string;
  berlaku: string;
  perPcs: number;
  satuan: string;
  /** Boleh kosong — stok yang belum dicatat, bukan stok nol. Lihat `push()`. */
  tersedia?: number;
  /**
   * Jenis material di master (`label`, `kancing`, `resleting`, …).
   *
   * Dipakai dialog Register Produk, yang menyusun satu baris per jenis supaya
   * kelengkapan BOM bisa dinilai: baris yang `nama`-nya masih kosong berarti
   * jenis itu belum diputuskan. Di papan produksi field ini tidak dibaca —
   * di sana hanya baris yang sudah terisi yang muncul.
   */
  jenis?: string;
}

export interface DetailKartu {
  designCode: string;
  kategori: string;
  dibuatOleh: string;
  tanggalDibuat: string;
  warna: BarisWarna[];
  /** Stok label per ukuran, dipakai untuk baris "Label Size X". */
  labelTersedia: Record<string, number>;
  aksesori: SpesifikasiAksesori[];
  kain: SpesifikasiKain[];
  /**
   * Ongkos jahit per pcs — kategori material `cmt_cost`.
   *
   * Opsional karena ketiadaannya harus bisa ditampilkan sebagai MASALAH, bukan
   * sebagai nol. Keputusan pemilik: "tidak mungkin hpp produksi tidak punya ongkos
   * jahit, pasti punya. Kalau masih kosong biarin stuck di hpp." Jadi kartu yang
   * belum mengisinya belum boleh dihitung HPP-nya — lihat `gerbangHpp()` di
   * `hpp.ts`.
   *
   * Papan White Label tidak pernah mengisinya: barangnya dibeli utuh, tidak ada
   * jahit di sini.
   */
  ongkosJahit?: { perPcs: number };
}

export interface KartuPdff {
  id: string;
  /** Id stage — harus salah satu id di PAPAN_PRODUCTION / PAPAN_WHITELABEL. */
  stage: string;
  productName: string;
  brand: string;
  workcode: string;
  batch: string;
  kategoriVendor: string;
  namaVendor: string;
  dateRequest: string;
  pic: string;
  inisial: string;
  detail: DetailKartu;
  /**
   * Isi tiga tahap akhir — Invoice Logistic, Invoice Product, Upload.
   *
   * Ada di kartu, bukan di store terpisah seperti `cuttingPcs`, karena isinya
   * BUKAN hasil ketikan orang di popup: ini kolom yang memang dimiliki satu
   * kartu, sama seperti `batch` atau `namaVendor`. Yang diketik orang di popup
   * ditumpuk di atasnya lewat `ubahTahap` — lihat `PapanFulfillment.tsx`.
   *
   * Opsional seluruhnya: kartu yang belum sampai tahap itu belum punya isinya,
   * dan `undefined` di sini berarti "belum ada", bukan "kosong".
   */
  tahapAkhir?: DataTahapAkhir;
}

/**
 * Data yang diisi di tiga tahap akhir, dikelompokkan jadi satu.
 *
 * Digabung dalam satu objek, bukan ditulis satu per satu di `KartuPdff`,
 * supaya "tahap ini belum diisi" bisa dibedakan dari "tahap ini kosong": satu
 * objek yang tidak ada jauh lebih jelas daripada lima field `undefined` yang
 * harus diperiksa satu per satu.
 *
 * Semuanya opsional. `flowTransaction` yang kosong BUKAN berarti
 * `livou_transfer` — ia berarti "belum diputuskan", dan pemilih bukti mana yang
 * muncul bergantung pada jawaban itu.
 */
export interface DataTahapAkhir {
  /**
   * Nomor shipment Livou.
   *
   * Disimpan di kartu karena di tabel 40 kolom ia memang kolom kartu
   * (`kodeShipmentLivou`). Sengaja TIDAK dipakai untuk mencocokkan HPP: `hpp.ts`
   * mencocokkan lewat `namaProduct`, dan menambah kunci kedua di sana berarti
   * dua kunci yang bisa berbeda diam-diam.
   */
  kodeShipmentLivou?: string;
  /** Tanggal invoice logistik — tahap Invoice Logistic, papan White Label. */
  dateInvoiceLogistic?: string;
  /** Tanggal invoice produk — tahap Invoice Product, kedua papan. */
  dateInvoiceProduct?: string;
  /**
   * Solusi atas selisih jumlah datang. Nilainya dari `SOLUSI` di `lib/opsi.ts`,
   * tapi tipenya sengaja `string`: daftar pilihan boleh bertambah tanpa
   * membuat kartu lama gagal dibaca.
   */
  solution?: string;
  /**
   * Catatan kenapa solusi itu dipilih (Q9: "Solution + Log Solution terisi").
   *
   * Dipisah dari `solution`, bukan digabung jadi satu teks: yang satu KODE
   * yang dipakai untuk menyaring dan menghitung, yang satu kalimat bebas yang
   * dibaca manusia. Menggabungkannya membuat "berapa kartu yang diselesaikan
   * dengan refund" tidak bisa dijawab tanpa membaca semua catatannya.
   *
   * Diisi di stage Receive, saat selisihnya memang harus diputuskan sebelum
   * kartu boleh lanjut.
   */
  logSolution?: string;
  /**
   * Ke mana barang dibayar — `FLOW_TRANSAKSI` di `lib/opsi.ts`.
   *
   * `livou_transfer` dan `reimbursement` meminta BUKTI YANG BERBEDA, jadi
   * kosongnya bukan sekadar kolom yang belum diisi: selama nilainya kosong,
   * belum diketahui bukti mana yang harus diunggah.
   */
  flowTransaction?: string;
  /**
   * Berapa pcs yang sudah masuk POS. Angka, bukan hitungan berkas.
   *
   * `0` dan `undefined` sengaja dibedakan: `0` berarti "belum ada yang masuk
   * POS" dan itu temuan di Finance Validate, sedangkan `undefined` berarti
   * belum diisi sama sekali.
   */
  jumlahUploadPos?: number;
}

export interface BarisBahan {
  material: string;
  varian: string;
  berlaku: string;
  /**
   * Kunci stabil satu baris bahan, dipakai untuk menyimpan penanda "sudah siap"
   * di tahap Prepare.
   *
   * Sengaja dibentuk dari isi barisnya, bukan dari nomor baris: kalau urutan
   * BOM berubah, nomor bergeser dan penanda yang sudah dicentang akan menempel
   * ke baris yang salah — diam-diam, tanpa error.
   *
   * Isi baris saja TIDAK cukup: dua baris kain bernama sama (kain utama dan
   * furing, misalnya) menghasilkan teks yang identik, jadi keduanya berbagi
   * satu kunci. Akibatnya satu centang menandai keduanya sekaligus, dan gate
   * Prepare terbuka sebelum bahannya benar-benar diperiksa. Karena itu nomor
   * kemunculannya ikut disertakan — lihat `nomorKemunculan` di `bahanKartu()`.
   */
  kunci: string;
  perPcs: string;
  total: string;
  fifo: string;
  status: 'ready' | 'kurang';
  catatan?: string;
  /** Besarnya kekurangan, dipakai untuk memilih badge kartu. */
  kurangQty?: number;
}

// ===== Tahap =====
//
// Delapan tahap untuk papan Production, persis daftar owner. Papan White Label
// memakai urutan yang sama dengan DUA perbedaan: Cutting digantikan Invoice
// Logistic (barang white label tidak dipotong di sini, ia datang utuh dari
// vendor luar negeri), dan Prepare dihapus — usulan white label yang di-approve
// langsung ke Invoice Logistic, jadi papannya tujuh kolom.

export interface StagePapan {
  id: string;
  label: string;
  /**
   * Kelas Tailwind untuk titik penanda tahap di header kolom.
   *
   * ReUI tidak mewarnai kolomnya sendiri — contoh resminya pun menambahkan
   * penanda ini per kolom. Ditulis sebagai kelas utuh (bukan dirangkai dari
   * nama warna) supaya pemindai Tailwind menemukannya sebagai string biasa.
   */
  warna: string;
}

export const PAPAN_PRODUCTION: StagePapan[] = [
  { id: 'propose', label: 'Propose', warna: 'bg-slate-400' },
  { id: 'prepare', label: 'Prepare', warna: 'bg-amber-500' },
  { id: 'cutting', label: 'Cutting', warna: 'bg-violet-500' },
  { id: 'receive', label: 'Receive', warna: 'bg-blue-500' },
  { id: 'invoice-product', label: 'Invoice Product', warna: 'bg-pink-500' },
  { id: 'hpp-price', label: 'HPP & Price', warna: 'bg-emerald-500' },
  { id: 'upload', label: 'Upload', warna: 'bg-indigo-500' },
  { id: 'finance-validate', label: 'Finance Validate', warna: 'bg-green-600' },
];

export const PAPAN_WHITELABEL: StagePapan[] = [
  { id: 'propose', label: 'Propose', warna: 'bg-slate-400' },
  { id: 'invoice-logistic', label: 'Invoice Logistic', warna: 'bg-cyan-500' },
  { id: 'receive', label: 'Receive', warna: 'bg-blue-500' },
  { id: 'invoice-product', label: 'Invoice Product', warna: 'bg-pink-500' },
  { id: 'hpp-price', label: 'HPP & Price', warna: 'bg-emerald-500' },
  { id: 'upload', label: 'Upload', warna: 'bg-indigo-500' },
  { id: 'finance-validate', label: 'Finance Validate', warna: 'bg-green-600' },
];

// ===== Perhitungan =====

/** Bulatkan ke 2 desimal lalu tulis apa adanya — titik desimal, seperti mockup. */
function angka(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Kolom "Qty / Pcs" ditulis apa adanya, bukan dibulatkan.
 *
 * Ini bukan detail gaya. Kalau `0.756` ditampilkan sebagai `0.76`, pembaca yang
 * mengalikan sendiri — 145 x 0.76 = 110.2 — akan mendapat angka berbeda dari
 * kolom Total Need (109.62), dan menyangka tabelnya salah. Angka yang tampil
 * harus angka yang dipakai menghitung.
 */
function presisi(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

export function totalPcs(kartu: KartuPdff): number {
  return kartu.detail.warna.reduce(
    (s, w) => s + w.pcs.reduce((a, p) => a + p.qty, 0),
    0
  );
}

export function jumlahVarian(kartu: KartuPdff): number {
  return kartu.detail.warna.reduce((s, w) => s + w.pcs.length, 0);
}

export function skuVarian(kartu: KartuPdff, kodeWarna: string, ukuran: string): string {
  const kode = kartu.detail.designCode.replace(/^CSC-/, '');
  return `LVU-${kode}-${kodeWarna}-${ukuran}`;
}

/**
 * Susun baris BOM dari spesifikasi kartu.
 *
 * Urutannya: aksesori umum, lalu label per ukuran, lalu kain per warna —
 * supaya yang dibaca lebih dulu adalah bahan yang berlaku untuk semua varian,
 * baru yang spesifik.
 */
export function bahanKartu(kartu: KartuPdff): BarisBahan[] {
  const { warna, aksesori, kain, labelTersedia } = kartu.detail;
  const semuaPcs = totalPcs(kartu);
  const baris: BarisBahan[] = [];

  // Berapa kali satu teks baris sudah muncul. Dipakai untuk membedakan baris
  // yang isinya kebetulan sama — tanpa ini, dua baris "Kain Rayon | Black |
  // Color Black" berbagi satu kunci dan satu centang membuka gate untuk
  // keduanya. Penghitungnya per-teks, bukan nomor urut global, supaya kunci
  // tetap stabil kalau ada baris lain yang ditambah atau dihapus di atasnya.
  const nomorKemunculan = new Map<string, number>();

  const push = (
    material: string,
    varian: string,
    berlaku: string,
    perPcs: number,
    satuan: string,
    qty: number,
    // `undefined` = stoknya belum pernah dicatat. Itu BUKAN nol: menampilkannya
    // sebagai 0 membuat baris yang datanya cuma belum diisi langsung bertanda
    // merah "Not Enough", dan pembaca menyimpulkan stoknya habis padahal tidak
    // ada yang tahu. Barisnya tetap tampil — kebutuhannya nyata — hanya kolom
    // stoknya yang jujur mengatakan belum ada angkanya.
    tersedia: number | undefined
  ) => {
    const total = perPcs * qty;
    const kurang = tersedia !== undefined && total > tersedia;
    const teks = `${material}|${varian}|${berlaku}`;
    const ke = (nomorKemunculan.get(teks) ?? 0) + 1;
    nomorKemunculan.set(teks, ke);
    baris.push({
      // `#1` hanya muncul kalau teksnya memang berulang, supaya kunci baris
      // yang lazim tetap persis seperti sebelumnya.
      kunci: ke === 1 ? teks : `${teks}#${ke}`,
      material,
      varian,
      berlaku,
      perPcs: `${presisi(perPcs)} ${satuan}`,
      total: `${angka(total)} ${satuan}`,
      fifo: tersedia === undefined ? 'Belum dicatat' : `${angka(tersedia)} ${satuan}`,
      status: kurang ? 'kurang' : 'ready',
      ...(kurang
        ? {
            catatan: `Short ${angka(total - tersedia)} ${satuan}`,
            kurangQty: total - tersedia,
          }
        : {}),
    });
  };

  for (const a of aksesori) {
    push(a.nama, a.varian, a.berlaku, a.perPcs, a.satuan, semuaPcs, a.tersedia);
  }

  const ukuranUnik = [...new Set(warna.flatMap((w) => w.pcs.map((p) => p.ukuran)))];
  for (const u of ukuranUnik) {
    const tersedia = labelTersedia[u];
    // Ukuran yang stok labelnya belum dicatat dilewati, bukan dianggap nol.
    // "Belum ada catatannya" dan "stoknya habis" adalah dua hal berbeda;
    // menampilkan yang pertama sebagai kekurangan membuat kartu baru — yang
    // memang belum punya catatan label — selalu bertanda merah.
    if (tersedia === undefined) continue;
    const qty = warna.reduce(
      (s, w) => s + w.pcs.filter((p) => p.ukuran === u).reduce((a, p) => a + p.qty, 0),
      0
    );
    push(`Label Size ${u}`, '—', `Size ${u}`, 1, 'pcs', qty, tersedia);
  }

  for (const k of kain) {
    for (const w of warna) {
      const spec = k.perWarna[w.kode];
      if (!spec) continue;
      const qty = w.pcs.reduce((a, p) => a + p.qty, 0);
      push(k.nama, w.nama, `Color ${w.nama}`, spec.perPcs, k.satuan, qty, spec.tersedia);
    }
  }

  return baris;
}

/**
 * Kekurangan yang paling besar, kalau ada — inilah yang jadi badge kartu.
 *
 * Sengaja yang TERBESAR, bukan yang pertama. Satu kartu bisa kurang di dua
 * bahan sekaligus (Elodie Top kurang di Kain Pleats 19.28 m dan di Karet
 * Pinggang 12.53 m). Menampilkan yang pertama saja membuat urutan baris BOM
 * menentukan isi badge — dan urutan itu bisa berubah tanpa ada yang sadar.
 * Yang terbesar adalah yang paling mendesak, jadi itu yang ditampilkan.
 */
export function kekurangan(kartu: KartuPdff): string | null {
  const kurang = bahanKartu(kartu).filter((b) => b.status === 'kurang');
  if (kurang.length === 0) return null;
  const terbesar = kurang.reduce((a, b) => ((b.kurangQty ?? 0) > (a.kurangQty ?? 0) ? b : a));
  return terbesar.catatan ?? null;
}

// ===== Kesiapan bahan (tahap Prepare) =====
//
// Di tahap Prepare, tiap baris bahan dicentang kalau barangnya sudah benar-benar
// dibeli. Kartu baru boleh lanjut ke kolom berikutnya setelah SEMUA baris bahan
// siap — karena itu pindahnya bukan drag, tapi tombol yang muncul hanya saat
// syaratnya terpenuhi.
//
// Isi centangnya disimpan di luar `KartuPdff` (lihat `KARTU_BARU` di bawah),
// bukan sebagai field di dalam kartu. Dua alasan: `bahanKartu()` tetap murni
// turunan dari data kartu seperti sebelumnya, dan saat koneksi database
// dikerjakan, yang perlu dikirim cuma daftar kunci yang siap — bukan seluruh
// kartu.

/** Daftar kunci baris bahan yang sudah ditandai siap, per id kartu. */
export type SiapBahan = Record<string, string[]>;

/**
 * Perpindahan kartu antar stage, per id kartu.
 *
 * Peta ini yang menang atas `stage` bawaan kartu, jadi satu peta cukup untuk
 * dua hal sekaligus: kartu contoh yang di-approve dari Propose, dan kartu yang
 * lanjut dari Prepare ke kolom berikutnya.
 */
export type PindahKartu = Record<string, string>;

export interface DataProduksiBaru {
  productName: string;
  designCode: string;
  kategori: string;
  batch: string;
  kategoriVendor: string;
  namaVendor: string;
  dateRequest: string;
  pic: string;
  inisial: string;
  warna: BarisWarna[];
  labelTersedia: Record<string, number>;
  aksesori: SpesifikasiAksesori[];
  kain: SpesifikasiKain[];
}

/**
 * Akhiran workcode per papan.
 *
 * Dipisah jadi peta, bukan ditulis di dalam `kartuBaru()`: akhiran ini milik
 * PAPAN, dan papan itu yang tahu dirinya Production atau White Label. Versi
 * sebelumnya menulis `_PRDN` tetap di dalam fungsinya, jadi usulan yang dibuat
 * dari papan White Label mendapat workcode produksi — terlihat di kartu dan
 * popup, tanpa error apa pun.
 */
export const AKHIRAN_WORKCODE: Record<'production' | 'whitelabel', string> = {
  production: 'PRDN',
  whitelabel: 'WHLB',
};

/**
 * Margin global untuk harga jual — SATU konstanta untuk semua produk.
 *
 * Berpindah ke sini dari `hpp.ts` karena tiket 4 menaruhnya di satu tempat
 * yang jadi pusat data papan, dan karena file ini tidak mengimpor apa pun —
 * jadi memindahkan konstanta ke sini tetap tanpa lingkaran, sementara
 * `hpp.ts` sudah mengimpor `AKHIRAN_WORKCODE` dan `totalPcs` dari file ini.
 *
 * CATATAN UNTUK PEMILIK: nilai 2,4 dipilih karena angka lama di tabel HPP
 * menyiratkan dua margin yang saling bertentangan (189.000/78.000 = 2,42 dan
 * 299.000/132.000 = 2,27), jadi tidak ada nilai lama yang bisa dipertahankan.
 * Kalau margin yang benar berbeda, ubah hanya baris ini — harga jual di
 * halaman HPP, di tabel Production Fulfillment, dan di kartu popup semuanya
 * membaca konstanta yang sama.
 */
export const MARGIN_HARGA_JUAL = 2.4;

/**
 * Kartu dari form "Tambah Produksi" di kolom Propose.
 *
 * Lahir di stage `propose` — persis seperti usulan baru: belum disetujui, dan
 * baru naik ke kolom setelah Propose setelah di-approve lewat popupnya (Prepare
 * di papan Production, Invoice Logistic di papan White Label). `id` ditentukan
 * pemanggil supaya tidak mungkin bentrok dengan kartu yang sudah ada.
 *
 * `sumber` WAJIB dioper, bukan punya nilai bawaan: kartu yang lahir di papan
 * White Label harus berakhiran `_WHLB` seperti delapan kartu contoh di
 * sebelahnya. Nilai bawaan akan membuat pemanggil yang lupa mengoper tetap
 * mendapat workcode yang terlihat benar — persis kegagalan yang paling sulit
 * ketahuan, karena tidak ada yang error.
 */
export function kartuBaru(
  id: string,
  b: DataProduksiBaru,
  sumber: 'production' | 'whitelabel'
): KartuPdff {
  return {
    id,
    stage: 'propose',
    productName: b.productName,
    brand: 'CASSCA',
    workcode: `PDFF_${b.designCode}_${b.batch}_${AKHIRAN_WORKCODE[sumber]}`,
    batch: b.batch,
    kategoriVendor: b.kategoriVendor,
    namaVendor: b.namaVendor,
    dateRequest: b.dateRequest,
    pic: b.pic,
    inisial: b.inisial,
    detail: {
      designCode: b.designCode,
      kategori: b.kategori,
      dibuatOleh: b.pic,
      tanggalDibuat: b.dateRequest,
      warna: b.warna,
      labelTersedia: b.labelTersedia,
      aksesori: b.aksesori,
      kain: b.kain,
    },
  };
}

/**
 * Kunci semua baris bahan — semuanya boleh ditandai siap.
 *
 * Termasuk baris yang stoknya kurang, dan itu memang disengaja: baris yang
 * kurang justru baris yang paling perlu dibeli. Kalau baris itu diblokir,
 * gate-nya jadi tidak mungkin terpenuhi dan kartunya tidak akan pernah bisa
 * lanjut ke kolom berikutnya.
 */
export function kunciBahan(kartu: KartuPdff): string[] {
  return bahanKartu(kartu).map((b) => b.kunci);
}

/** Ringkasan centang satu kartu, dipakai kartu papan maupun popup. */
export interface RingkasanBahan {
  siap: number;
  total: number;
  /** Benar kalau semua baris bahan sudah ditandai siap. */
  lengkap: boolean;
  /** Baris yang stoknya masih kurang — informasi, bukan penghalang. */
  kurang: number;
}

export function ringkasBahan(kartu: KartuPdff, siap: SiapBahan): RingkasanBahan {
  const semua = bahanKartu(kartu);
  const kunci = new Set(siap[kartu.id] ?? []);
  const ditandai = semua.filter((b) => kunci.has(b.kunci)).length;
  return {
    siap: ditandai,
    total: semua.length,
    lengkap: semua.length > 0 && ditandai === semua.length,
    kurang: semua.filter((b) => b.status === 'kurang').length,
  };
}

// ===== Cutting =====
//
// Data cutting disimpan di luar kartu, sama seperti `SiapBahan`: kartu contoh
// di sini adalah data pratinjau, dan angka yang diketik orang di popup tidak
// boleh ikut tersimpan di dalamnya — kalau iya, setiap kartu perlu salinannya
// sendiri dan angka hasil ketik orang hilang begitu halamannya dimuat ulang.

/**
 * Pcs hasil cutting per varian, per kartu. Kuncinya dari `barisVarian()`. */
export type CuttingPcs = Record<string, Record<string, number>>;

/**
 * Berkas bukti cutting, dua tingkat: id kartu -> id jenis bukti -> daftar berkas.
 *
 * Dua tingkat, bukan satu, karena satu kartu punya DUA jenis bukti yang wajib
 * dan keduanya boleh lebih dari satu berkas. Kalau satu tingkat saja, kedua
 * jenis berbagi satu daftar dan mustahil tahu mana yang sudah terkumpul — satu
 * file potong kain saja akan terlihat seperti dua bukti lengkap.
 */
export type BuktiCutting = Record<string, Record<string, BerkasBukti[]>>;

/**
 * Satu catatan pengembalian kartu dari Receive ke Cutting (Q11).
 *
 * Q1 tidak mencatat siapa yang menyetujui cutting. Kalau angka pcs boleh
 * diubah diam-diam setelah kartu lolos ke Receive, angka yang sudah dibaca
 * di sana berubah tanpa jejak — itu yang Q11 mau cegah. Jadi setiap kali data
 * dibuka kembali, catat kenapa.
 *
 * `totalPcs` bukan angka yang diketik orang: diambil dari
 * `ringkasCutting(...).totalPcs` saat tombol ditekan. Gunanya supaya kalau
 * angkanya lalu diedit lagi, selisihnya terlihat tanpa perlu dibandingkan
 * manual dengan catatan.
 *
 * "Siapa" sengaja tidak dicatat. Owner memilih jejak berupa waktu, alasan, dan
 * angka saat itu — dan tree React ini belum punya user yang bisa dialirkan
 * (tidak ada endpoint `/api/me`), jadi menambahkannya berarti menarik pekerjaan
 * yang belum diminta ke dalam tiket ini.
 */
export interface CatatanKembalikan {
  /** Kapan tombol ditekan — ISO string. */
  waktu: string;
  /** Alasan bebas dari orang yang membuka kembali data terkunci. */
  alasan: string;
  /** Total pcs yang tercatat pada saat itu. */
  totalPcs: number;
}

/**
 * Riwayat pengembalian per kartu. Nilainya daftar, bukan satu objek: satu
 * kartu bisa dikembalikan lebih dari sekali, dan jejak yang hilang di
 * pengembalian kedua sama saja artinya dengan tidak pernah ada jejak.
 */
export type KembalikanCutting = Record<string, CatatanKembalikan[]>;

/**
 * Satu temuan di stage Finance Validate — apa yang tidak cocok antara hasil
 * satu stage dan yang seharusnya, lengkap dengan dari mana asalnya.
 *
 * DIHITUNG, bukan disimpan: `temuanKartu()` di `temuan.ts` menurunkannya dari
 * data yang ada, jadi temuan yang sudah tidak berlaku lagi karena datanya
 * diperbaiki tidak terus menghantui kartu. Yang disimpan orang hanyalah id
 * temuan yang sudah DITUTUP — dan itulah yang membedakan `terbuka` dari
 * `tertutup` di bawah.
 *
 * `stage` adalah id stage ASAL temuan, bukan stage kartu sekarang. Kartu yang
 * sedang dibuka ada di finance-validate, tapi temuannya bisa berasal dari
 * cutting, receive, upload, atau hpp-price; tanpa kolom ini pembaca tidak tahu
 * ke mana harus melihat untuk membetulkannya.
 */
export interface Temuan {
  /** Id stabil. Dipakai untuk menutup temuan dan memeriksanya di test. */
  id: string;
  /** Judul singkat: apa yang tidak cocok. */
  label: string;
  /** Penjelasan + angkanya — "berapa" yang diminta pemilik. */
  detail: string;
  /** Id stage asal temuan: 'cutting' | 'receive' | 'upload' | 'hpp-price'. */
  stage: string;
  /**
   * `terbuka` = masih menahan kartu; `tertutup` = sudah ditangani.
   *
   * Temuan tertutup TETAP ditampilkan dengan statusnya, bukan dihapus —
   * keputusan pemilik: riwayatnya harus terlihat, supaya orang bisa
   * membedakan "tidak pernah ada masalah" dari "masalahnya sudah selesai".
   */
  status: 'terbuka' | 'tertutup';
}

/**
 * Satu berkas yang dipilih pengguna.
 *
 * Sengaja bukan `File`: `File` tidak bisa di-*snapshot* ke markup server, dan
 * state React harus bisa dibaca ulang setelah render. Yang disimpan di state
 * data deskriptif — nama, ukuran, tipe — plus `url` hasil
 * `URL.createObjectURL`, yang cukup untuk menampilkan pratinjau dan membuka
 * PDF. Berkas aslinya tetap dipegang browser lewat object URL itu; tidak ada
 * yang dikirim ke server.
 */
export interface BerkasBukti {
  nama: string;
  ukuran: number;
  tipe: string;
  /**
   * `blob:` URL dari `URL.createObjectURL(file)`, dibuat saat berkas dipilih.
   *
   * Wajib ada karena tanpa ini user tidak bisa MELIHAT apa yang baru diunggah
   * — daftar nama berkas bukan bukti apa pun, dan untuk "foto SS register"
   * isi fotonya justru satu-satunya yang perlu diperiksa. URL-nya dibuang
   * bersama berkasnya; jangan disimpan lebih lama dari umur component-nya.
   */
  url: string;
}

/** Dua jenis bukti yang wajib ada sebelum kartu boleh keluar dari Cutting. */
export const JENIS_BUKTI_CUTTING = [
  {
    id: 'laporan-potong',
    judul: 'Laporan Potong Kain',
    keterangan: 'PDF atau foto laporan potong kain.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
  {
    id: 'register-cutting',
    judul: 'Foto SS Register Cutting PDFF',
    keterangan: 'Tangkapan layar register cutting PDFF.',
    terima: '.jpg,.jpeg,.png,.webp',
  },
] as const;

export type IdBuktiCutting = (typeof JENIS_BUKTI_CUTTING)[number]['id'];

/** Kunci jenis bukti yang dipanggil dari form — dipakai sebagai penanda silang. */
export const SEMUA_ID_BUKTI: IdBuktiCutting[] = JENIS_BUKTI_CUTTING.map((b) => b.id);

// ===== Bukti tiga tahap akhir (tiket 5) =====
//
// Setiap tahap punya daftar buktinya sendiri, dan yang paling penting: id-nya
// berbeda satu sama lain. Kalau tiga tahap berbagi id seperti 'bukti', maka
// berkas yang diunggah di Invoice Logistic akan ikut terhitung di Upload —
// dan tidak ada yang gagal, karena yang terlihat cuma "kok sudah ada isinya?".
//
// Id-nya ditulis sama persis dengan nama kolom di `ProductionFulfillment.tsx`
// (`invoiceLogistic`, `proofPaymentLogistic`, `invoiceProduct`,
// `proofPaymentProduct`, `proofReimburse`, `proofUploadEcommerce`, `uploadPos`)
// supaya tidak ada dua kamus yang harus dijaga sinkron. Kecuali satu: kolom
// 40-kolomnya bernama `invoiceLogistic`/`invoiceProduct`, dan di sini keduanya
// diunggah sebagai bukti — jadi id-nya sama, artinya sama.

/** Bukti tahap Invoice Logistic. Hanya ada di papan White Label. */
export const JENIS_BUKTI_INVOICE_LOGISTIC = [
  {
    id: 'invoiceLogistic',
    judul: 'Bukti Invoice Logistic',
    keterangan: 'Nota/invoice dari pihak logistik untuk shipment ini.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
  {
    id: 'proofPaymentLogistic',
    judul: 'Bukti Pembayaran Logistic',
    keterangan: 'Bukti transfer/pembayaran ongkos kirim shipment ini.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
] as const;

/**
 * Dua bukti tahap Invoice Product yang SELALU ada, apa pun jalur transaksinya.
 *
 * Yang berbeda antar jalur cuma bukti KETIGA-nya — lihat
 * `JENIS_BUKTI_FLOW` di bawah. Dipisah begini supaya tidak ada dua daftar
 * lengkap yang harus dijaga sama isinya.
 */
export const JENIS_BUKTI_INVOICE_PRODUCT = [
  {
    id: 'invoiceProduct',
    judul: 'Bukti Invoice Product',
    keterangan: 'Invoice produk untuk shipment ini.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
] as const;

/**
 * Bukti yang muncul BERGANTUNG jalur transaksi — dua jalur, dua field berbeda.
 *
 * `livou_transfer` = barang pindah ke Livou, jadi yang dibuktikan adalah
 * pembayarannya. `reimbursement` = barang dikembalikan ke vendor, jadi yang
 * dibuktikan adalah penggantiannya. Keduanya TIDAK PERNAH tampil bersamaan:
 * menampilkan dua kotak sekaligus membuat orang mengunggah berkas yang salah
 * tempat tanpa ada yang menahannya.
 */
export const JENIS_BUKTI_FLOW = [
  {
    value: 'livou_transfer',
    id: 'proofPaymentProduct',
    judul: 'Bukti Pembayaran Product',
    keterangan: 'Bukti pembayaran karena barang pindah ke Livou.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
  {
    value: 'reimbursement',
    id: 'proofReimburse',
    judul: 'Bukti Reimburse',
    keterangan: 'Bukti penggantian karena barang dikembalikan ke vendor.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
] as const;

/**
 * Bukti tahap Upload — dua kotak, keduanya screenshot.
 *
 * Dua-duanya bukti, bukan angka. Yang angka adalah `jumlahUploadPos`, dan ia
 * hidup di `DataTahapAkhir`, bukan di sini — tiga hal ini tidak boleh saling
 * menggantikan (lihat CONTEXT.md, "Jumlah Upload POS").
 */
export const JENIS_BUKTI_UPLOAD = [
  {
    id: 'proofUploadEcommerce',
    judul: 'Proof Upload Ecommerce',
    keterangan: 'Screenshot produk sudah tayang di marketplace.',
    terima: '.jpg,.jpeg,.png,.webp',
  },
  {
    id: 'uploadPos',
    judul: 'Upload POS',
    keterangan: 'Screenshot produk sudah masuk POS.',
    terima: '.jpg,.jpeg,.png,.webp',
  },
] as const;

/**
 * Dua jenis bukti tahap HPP & Price.
 *
 * Pindah ke sini dari `SeksiHppPrice.tsx` supaya seluruh daftar jenis bukti
 * tinggal di satu berkas. Yang memindahkannya tiket 3: `temuan.ts` juga membaca
 * daftar ini untuk mencari "bukti belum diunggah", dan mengimpor dari berkas
 * component akan membentuk lingkaran modul — `SeksiHppPrice.tsx` mengimpor
 * `KotakBukti` dari `PopupKartu.tsx`, sedangkan `PopupKartu` yang memanggil
 * `temuanKartu()`. Satu lingkaran yang sudah pernah membuat urutan modul tidak
 * bisa ditentukan.
 *
 * Bukti ini TIDAK menahan kartu keluar dari HPP & Price (lihat `SeksiHppPrice`),
 * tapi kekurangannya menjadi temuan di Finance Validate — stage penutup yang
 * memeriksa hasil semua stage sebelumnya.
 */
export const JENIS_BUKTI_HPP = [
  {
    id: 'kalkulasi-hpp',
    judul: 'Bukti Kalkulasi HPP',
    keterangan: 'Hitungan HPP: bahan + ongkos jahit, atau beli + kirim.',
    terima: '.jpg,.jpeg,.png,.webp,.pdf',
  },
  {
    id: 'kalkulasi-selling-price',
    judul: 'Bukti Kalkulasi Selling Price',
    keterangan: 'Harga jual = HPP × margin global yang sama untuk semua produk.',
    terima: '.jpg,.jpeg,.png,.webp,.pdf',
  },
] as const;

/**
 * Daftar jenis bukti satu tahap, lengkap.
 *
 * Dipakai `ringkasTahapBukti()` supaya "berapa bukti yang wajib" tidak pernah
 * ditulis dua kali: satu di layar, satu di pemeriksaan kelengkapan.
 *
 * `flowTransaction` ikut masuk karena dua jalur Invoice Product meminta field
 * yang berbeda — kalau fungsi ini mengembalikan daftar yang sama untuk
 * keduanya, kotak yang salah akan ikut dituntut terisi.
 */
export function jenisBuktiTahap(
  tahap: 'invoice-logistic' | 'invoice-product' | 'upload',
  flowTransaction?: string
): readonly { id: string; judul: string; keterangan: string; terima: string }[] {
  if (tahap === 'invoice-logistic') return JENIS_BUKTI_INVOICE_LOGISTIC;
  if (tahap === 'upload') return JENIS_BUKTI_UPLOAD;
  const jalur = JENIS_BUKTI_FLOW.find((f) => f.value === flowTransaction);
  // Tanpa jalur yang dipilih, bukti ketiganya BELUM DIKETAHUI — bukan dianggap
  // `livou_transfer`. Menebak di sini berarti menuntut bukti yang mungkin bukan
  // milik kartu itu, dan pemiliknya akan mencari berkas yang tidak pernah ada.
  return jalur ? [...JENIS_BUKTI_INVOICE_PRODUCT, jalur] : JENIS_BUKTI_INVOICE_PRODUCT;
}

/**
 * Ringkasan bukti satu tahap: berapa jenis yang sudah terisi dari yang wajib.
 *
 * `total` mengikuti daftar dari `jenisBuktiTahap()`, jadi Invoice Product tanpa
 * jalur yang dipilih menghitung satu bukti, dan sesudah jalurnya dipilih
 * menghitung dua. Itu memang yang terjadi di layar.
 */
export interface RingkasanBuktiTahap {
  terisi: number;
  total: number;
  lengkap: boolean;
}

export function ringkasTahapBukti(
  bukti: Record<string, BerkasBukti[]>,
  tahap: 'invoice-logistic' | 'invoice-product' | 'upload',
  flowTransaction?: string
): RingkasanBuktiTahap {
  const wajib = jenisBuktiTahap(tahap, flowTransaction);
  const terisi = wajib.filter((j) => (bukti[j.id]?.length ?? 0) > 0).length;
  return { terisi, total: wajib.length, lengkap: terisi === wajib.length };
}

/** Bukti tiga tahap akhir, per kartu. Bentuknya sama dengan `BuktiCutting`. */
export type BuktiTahapAkhir = Record<string, Record<string, BerkasBukti[]>>;

// ===== Receive: kedatangan barang (tiket 6) =====
//
// Bentuknya mengikuti keputusan Q5: SATU BARIS = SATU KEDATANGAN, bukan satu
// baris per kartu. Satu workcode bisa datang beberapa kali (contoh owner:
// "kekurangan 2 pcs dikirim menyusul"), dan tiap kiriman punya tanggal, surat
// jalan, dan lokasinya sendiri. Kalau kedatangan digabung jadi satu angka di
// kartu, "kapan sisanya datang" tidak bisa dijawab dari layar mana pun.
//
// Angka pcs disimpan per KUNCI varian — kunci yang sama dengan `barisVarian()`
// (`BLK|S`, `IVR|XL`). Bukan per nama varian: dua baris yang kebetulan
// berwarna sama harus bisa dibedakan, dan kunci itu sudah menghitungnya.

/**
 * Satu peristiwa kedatangan barang.
 *
 * `datang` dan `reject` DIPISAH, bukan disimpan sebagai satu angka bersih.
 * Yang dicatat orang di lapangan adalah "20 datang, 2 rusak" — dan dua angka
 * itu yang dipakai untuk menghitung `Masuk Stok = Datang − Reject`. Kalau yang
 * disimpan cuma hasil bersihnya, angka reject-nya hilang dan tidak ada cara
 * menjawab "berapa yang ditolak bulan ini" tanpa membuka ulang foto buktinya.
 */
export interface Kedatangan {
  /** Nomor urut per kartu, 1..n. Ditampilkan sebagai badge `Receipt #n`. */
  urut: number;
  tanggal: string;
  /** Id dari `LOKASI_TERIMA` di `lib/opsi.ts` — bukan teks bebas. */
  lokasi: string;
  /** Id dari `SUMBER_TERIMA` — menentukan apa yang terjadi setelah disimpan. */
  sumber: string;
  /** Pcs datang fisik per kunci varian, SEBELUM dikurangi reject. */
  datang: Record<string, number>;
  /** Pcs reject per kunci varian. */
  reject: Record<string, number>;
  /**
   * Angka yang tertulis di surat jalan vendor, kalau ada.
   *
   * Dipakai HANYA di papan White Label sebagai dasar kesesuaian (Q10) — di sana
   * tidak ada Cutting, jadi satu-satunya pembanding yang dimiliki adalah surat
   * jalannya. Di papan Production kolom ini tidak ditampilkan: dasarnya hasil
   * cutting, dan dua angka pembanding sekaligus membuat "kok tidak sesuai"
   * muncul dari selisih yang memang bukan urusan stage ini.
   */
  suratJalanQty?: number;
  /** Kenapa ada reject. Opsional — menjawab "kenapa" tanpa perlu rapat. */
  keterangan: string;
  /** Nama pencatat, dari sesi yang login (`GET /api/me`). Kosong = belum ada. */
  dicatatOleh: string;
  /**
   * `draft` = masih ketikan, belum dihitung sebagai barang masuk.
   * `final` = sudah disimpan sebagai penerimaan.
   *
   * Yang membedakan keduanya penting dan bukan sekadar penanda: `Masuk Stok`
   * di kartu angka hanya menjumlahkan yang `final`. Draft yang ikut dihitung
   * membuat sisa terlihat nol padahal barangnya belum pernah disimpan — dan
   * begitu draft-nya dihapus, angkanya berubah lagi tanpa jejak.
   */
  status: 'draft' | 'final';
}

/** Kedatangan per kartu, dua tingkat seperti store bukti lainnya. */
export type KedatanganKartu = Record<string, Kedatangan[]>;

/** Jenis bukti Receive. Id-nya unik, tidak dipakai tahap lain. */
export const JENIS_BUKTI_RECEIVE = [
  {
    id: 'bukti-terima',
    judul: 'Bukti Terima',
    keterangan: 'Foto barang saat diterima, sebelum dihitung per varian.',
    terima: '.jpg,.jpeg,.png,.webp',
  },
  {
    id: 'surat-jalan',
    judul: 'Surat Jalan',
    keterangan: 'Surat jalan dari vendor — dasar kesesuaian di papan White Label.',
    terima: '.pdf,.jpg,.jpeg,.png,.webp',
  },
] as const;

/**
 * Bukti penerimaan, per kartu. Bentuknya sama dengan `BuktiTahapAkhir`, tapi
 * store-nya SENDIRI — bukan ditumpangkan ke sana.
 *
 * Alasannya sama dengan pemisahan store HPP dan tiga tahap akhir: id-nya
 * berbeda (`bukti-terima`, `surat-jalan`), dan Finance Validate menggabungkan
 * store tahap akhir jadi satu peta untuk menghitung temuan. Berkas penerimaan
 * yang ikut ke peta itu akan muncul sebagai "bukti" di tahap yang tidak pernah
 * mengunggahnya — tanpa ada yang gagal.
 */
export type BuktiReceive = Record<string, Record<string, BerkasBukti[]>>;

/** Masuk stok satu varian pada satu kedatangan: `datang − reject`, tidak negatif. */
export function masukStokKedatangan(k: Kedatangan, kunci: string): number {
  // Tidak pernah negatif: reject yang lebih besar dari yang datang itu salah
  // ketik, dan mengembalikan angka negatif akan mengurangi stok varian lain
  // lewat penjumlahan total — diam-diam, tanpa ada baris yang terlihat salah.
  return Math.max(0, (k.datang[kunci] ?? 0) - (k.reject[kunci] ?? 0));
}

/** Ringkasan penerimaan satu kartu — sumber empat kartu angka di mockup. */
export interface RingkasanTerima {
  plan: number;
  /** Pcs yang sudah masuk stok dari kedatangan FINAL saja. */
  masukStok: number;
  /** `plan − masukStok`, tidak negatif. */
  sisa: number;
  /** Berapa kali barang datang (kedatangan final). */
  jumlahKedatangan: number;
  /** Tanggal kedatangan terakhir, sudah diformat. Kosong kalau belum ada. */
  terakhir: string;
  /** Persentase `masukStok` terhadap `plan`, dibulatkan. */
  persen: number;
  /** Per kunci varian: yang sudah masuk stok dari kedatangan final. */
  sudahDatang: Record<string, number>;
}

/**
 * Rekap kedatangan satu kartu.
 *
 * Hanya kedatangan `final` yang dihitung, dan itu disengaja: draft adalah
 * ketikan yang belum disimpan, jadi menampilkannya sebagai barang masuk membuat
 * "Sisa" berkurang sebelum ada yang menekan Simpan — angka di layar tidak
 * pernah cocok dengan apa yang benar-benar tercatat.
 */
export function ringkasTerima(kartu: KartuPdff, kedatangan: Kedatangan[]): RingkasanTerima {
  const final = kedatangan.filter((k) => k.status === 'final');
  const sudahDatang: Record<string, number> = {};
  for (const k of final) {
    for (const b of barisVarian(kartu)) {
      const n = masukStokKedatangan(k, b.kunci);
      if (n > 0) sudahDatang[b.kunci] = (sudahDatang[b.kunci] ?? 0) + n;
    }
  }
  const masukStok = Object.values(sudahDatang).reduce((s, n) => s + n, 0);
  const plan = totalPcs(kartu);
  const urut = [...final].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  return {
    plan,
    masukStok,
    sisa: Math.max(0, plan - masukStok),
    jumlahKedatangan: final.length,
    terakhir: urut.length > 0 ? urut[urut.length - 1].tanggal : '',
    persen: plan > 0 ? Math.round((masukStok / plan) * 100) : 0,
    sudahDatang,
  };
}

/**
 * Satu baris tabel penerimaan per varian — persis kolom mockup owner.
 *
 * `draft` adalah kedatangan yang SEDANG diisi. Kalau tidak ada, kolom "Datang
 * Sekarang", "Reject", dan "Masuk Stok" berisi nol dan "Sisa" tetap dihitung
 * dari yang sudah tercatat.
 *
 * "Sisa" sengaja IKUT menghitung draft, bukan hanya yang tersimpan. Yang
 * mengetik perlu melihat sisanya bergerak saat ia mengetik — kalau angkanya
 * baru berubah setelah disimpan, tidak ada cara tahu ketikannya salah sebelum
 * menekan tombol, dan kesalahannya baru ketahuan dari stok yang tidak cocok.
 */
export interface BarisPenerimaan {
  kunci: string;
  warna: string;
  ukuran: string;
  sku: string;
  plan: number;
  /** Sudah masuk stok dari kedatangan FINAL sebelumnya. */
  sudahDatang: number;
  /** Datang fisik pada draft yang sedang diisi. */
  datang: number;
  reject: number;
  /** `datang − reject` pada draft. */
  masuk: number;
  /** `plan − (sudahDatang + masuk)`, tidak negatif. */
  sisa: number;
}

export function barisPenerimaan(
  kartu: KartuPdff,
  ringkas: RingkasanTerima,
  draft?: Kedatangan
): BarisPenerimaan[] {
  return barisVarian(kartu).map((b) => {
    const sudah = ringkas.sudahDatang[b.kunci] ?? 0;
    const datang = draft?.datang[b.kunci] ?? 0;
    const reject = draft?.reject[b.kunci] ?? 0;
    const masuk = draft ? masukStokKedatangan(draft, b.kunci) : 0;
    return {
      kunci: b.kunci,
      warna: b.warna,
      ukuran: b.ukuran,
      sku: skuVarian(kartu, b.kode, b.ukuran),
      plan: b.qty,
      sudahDatang: sudah,
      datang,
      reject,
      masuk,
      sisa: Math.max(0, b.qty - (sudah + masuk)),
    };
  });
}

/**
 * Data contoh kedatangan — bahan presentasi, bukan data dari database.
 *
 * Dua kartu, dua keadaan yang sengaja berbeda supaya keduanya bisa ditunjukkan
 * tanpa mengetik apa pun saat presentasi:
 *
 *   * `p-06` Aluna Top (Production) — dua kedatangan selesai, formulirnya
 *     KOSONG. Yang dipertunjukkan: sisa per varian dan "Receipt #3" yang siap
 *     diisi.
 *   * `w-04` Belle Cardigan (White Label) — satu kedatangan selesai + satu
 *     DRAFT berisi angka. Yang dipertunjukkan: `Masuk Stok = Datang − Reject`
 *     sudah terlihat di layar, dan badge-nya berbunyi "Draft".
 */
export const KEDATANGAN_CONTOH: KedatanganKartu = {
  'p-06': [
    {
      urut: 1,
      tanggal: '2026-09-08',
      lokasi: 'gudang',
      sumber: 'stok',
      datang: { 'BLK|S': 25, 'BLK|M': 30, 'BLK|L': 25 },
      reject: {},
      keterangan: '',
      dicatatOleh: 'Jan Chun Siong',
      status: 'final',
    },
    {
      urut: 2,
      tanggal: '2026-09-15',
      lokasi: 'gudang',
      sumber: 'stok',
      datang: { 'IVR|S': 25, 'IVR|M': 30 },
      reject: {},
      keterangan: '',
      dicatatOleh: 'Jan Chun Siang',
      status: 'final',
    },
  ],
  'w-04': [
    {
      urut: 1,
      tanggal: '2026-09-10',
      lokasi: 'gudang',
      sumber: 'stok',
      datang: { 'CRM|S': 25, 'CRM|M': 30, 'NVY|S': 20 },
      reject: {},
      keterangan: '',
      dicatatOleh: 'Jan Chun Siong',
      status: 'final',
      suratJalanQty: 75,
    },
    {
      urut: 2,
      tanggal: '2026-09-22',
      lokasi: 'konveksi',
      sumber: 'stok',
      // Reject 2 pcs pada satu varian: angka inilah yang membuat
      // `Masuk Stok = Datang − Reject` terbaca di layar tanpa perlu diketik.
      datang: { 'CRM|L': 25, 'NVY|M': 25, 'NVY|L': 25 },
      reject: { 'CRM|L': 2 },
      keterangan: 'Dua pcs jahitan miring, dikembalikan ke konveksi.',
      dicatatOleh: 'Jan Chun Siang',
      status: 'draft',
    },
  ],
};

/**
 * Ringkasan stage Cutting: sudahkah pekerjaan cutting satu kartu selesai.
 *
 * Punya tiga syarat, dan semuanya harus benar:
 *   1. SETIAP varian punya pcs cutting yang sudah diisi (boleh 0 — 0 itu
 *      keputusan "tidak ada yang dipotong dari varian ini", bukan "belum diisi";
 *      yang membedakan keduanya adalah kotak input yang masih kosong).
 *   2. Kedua jenis bukti sudah diunggah.
 *
 * Syarat (1) sengaja membedakan "0" dari "kosong". Kalau angka 0 diperlakukan
 * sama dengan belum diisi, maka varian yang memang tidak dipotong tidak akan
 * pernah bisa diselesaikan — dan gerbangnya mustahil dibuka tanpa data palsu.
 */
export interface RingkasanCutting {
  /** Berapa varian yang pcs cutting-nya sudah diisi. */
  terisi: number;
  /** Total varian di kartu ini. */
  total: number;
  /** Berapa jenis bukti yang sudah terisi. */
  bukti: number;
  /** Total jenis bukti yang wajib ada. */
  totalBukti: number;
  /** Total pcs hasil cutting. */
  totalPcs: number;
  /** Benar kalau kedua syarat di atas terpenuhi. */
  lengkap: boolean;
}

export function ringkasCutting(
  kartu: KartuPdff,
  pcs: CuttingPcs,
  bukti: BuktiCutting
): RingkasanCutting {
  const varian = barisVarian(kartu);
  const isiKartu: Record<string, number> = pcs[kartu.id] ?? {};
  const terisi = varian.filter((v) => isiKartu[v.kunci] !== undefined).length;
  const buktiKartu: Record<string, BerkasBukti[]> = bukti[kartu.id] ?? {};
  let buktiTerisi = 0;
  for (const id of SEMUA_ID_BUKTI) {
    if ((buktiKartu[id] ?? []).length > 0) buktiTerisi++;
  }
  return {
    terisi,
    total: varian.length,
    bukti: buktiTerisi,
    totalBukti: SEMUA_ID_BUKTI.length,
    totalPcs: varian.reduce((s, v) => s + (isiKartu[v.kunci] ?? 0), 0),
    lengkap: terisi === varian.length && buktiTerisi === SEMUA_ID_BUKTI.length,
  };
}

/**
 * Satu baris warna/ukuran, flatten dari `detail.warna`, lengkap dengan kuncinya.
 *
 * `kunci` dihitung DI SINI, sekali jalan, bukan di setiap tempat yang
 * membutuhkannya. Kalau tiap pemanggil menghitungnya sendiri, tiap pemanggil
 * harus membangun ulang peta nomor kemunculan dari nol — dan pemanggil yang
 * paling sering jalan (satu per baris tabel) berubah jadi O(baris^2). Yang lebih
 * penting daripada kecepatan: kalau kuncinya dihitung di dua tempat dengan cara
 * berbeda, input cutting yang mengetik orang menempel ke baris yang salah.
 *
 * `[kodeWarna, ukuran]` saja tidak cukup sebagai kunci: satu warna boleh punya
 * ukuran yang sama tercatat dua kali, dan dua baris seperti itu akan berbagi
 * satu kunci sehingga mengetik angka di satu baris ikut mengubah baris lain.
 */
export interface BarisVarian {
  warna: string;
  kode: string;
  ukuran: string;
  qty: number;
  /** Kunci stabil baris ini di dalam kartunya — dihitung oleh `barisVarian()`. */
  kunci: string;
}

export function barisVarian(kartu: KartuPdff): BarisVarian[] {
  const nomor = new Map<string, number>();
  return kartu.detail.warna.flatMap((w) =>
    w.pcs.map((p) => {
      const teks = `${w.kode}|${p.ukuran}`;
      const ke = (nomor.get(teks) ?? 0) + 1;
      nomor.set(teks, ke);
      return {
        warna: w.nama,
        kode: w.kode,
        ukuran: p.ukuran,
        qty: p.qty,
        kunci: ke === 1 ? teks : `${teks}#${ke}`,
      };
    })
  );
}

/**
 * Stage setelah `id` di papan ini. `undefined` kalau `id` kolom terakhir atau
 * tidak ada di papan.
 *
 * Dipakai untuk semua perpindahan kartu. Tujuannya TIDAK PERNAH ditulis tetap
 * seperti `'prepare'`: papan White Label tidak punya kolom itu, jadi kartu yang
 * dipindah ke sana tidak cocok dengan kolom mana pun dan lenyap dari papan —
 * tanpa error, tanpa jejak, dan datanya sendiri terlihat benar.
 */
export function stageSetelah(stages: StagePapan[], id: string): StagePapan | undefined {
  const i = stages.findIndex((s) => s.id === id);
  return i >= 0 ? stages[i + 1] : undefined;
}

/**
 * Stage tempat sebuah kartu berada sekarang.
 *
 * Urutan menangnya penting: perpindahan yang sudah dikerjakan MENANG atas stage
 * bawaan kartu. Kalau dibalik, approve di Propose tidak akan memindahkan apa
 * pun — kartunya ada di daftar bawaan, jadi stage bawaannya selalu dianggap
 * yang berlaku, dan tombolnya seperti tidak bekerja.
 *
 * Dua penjagaan di bawah sama-sama menjaga satu hal: kartu tidak boleh lenyap
 * dari papan. Kolom yang tidak ada di papan ini — misalnya tujuan perpindahan
 * lama yang menunjuk `prepare` di papan White Label — diabaikan, dan kartunya
 * tetap tampil di kolom yang masuk akal. Kartu yang hilang tanpa pesan jauh
 * lebih sulit dilacak daripada kartu yang muncul di kolom yang salah.
 *
 * Kartu yang tidak ada di daftar (hasil form) ditaruh di kolom setelah Propose
 * di papan itu: kartu lahir dari approve, jadi tempat paling masuk akalnya
 * memang stage setelah Propose — di papan White Label Invoice Logistic, bukan
 * Prepare.
 */
export function stageKartu(
  id: string,
  daftar: KartuPdff[],
  pindah: Record<string, string>,
  stages: StagePapan[]
): string {
  const tujuan = pindah[id];
  if (tujuan && stages.some((s) => s.id === tujuan)) return tujuan;

  const kartu = daftar.find((k) => k.id === id);
  if (kartu && stages.some((s) => s.id === kartu.stage)) return kartu.stage;

  return stageSetelah(stages, 'propose')?.id ?? stages[0]?.id ?? 'propose';
}

// ===== Satu usulan baru, dipakai smoke test =====
//
// Sama dengan yang dihasilkan form "Tambah Produksi": lahir di Propose, naik ke
// Prepare setelah di-approve. Bahannya sengaja belum lengkap (Karet Pinggang
// 60 m untuk 130 pcs), jadi alur gate di Prepare bisa diperagakan sampai
// selesai: centang satu per satu, lalu tombol lanjut baru hidup setelah baris
// terakhir siap.

export const KARTU_BARU: DataProduksiBaru = {
  productName: 'Celeste Dress',
  designCode: 'CSC-DRS-31',
  kategori: 'Dress',
  batch: 'B-04',
  kategoriVendor: 'Inhouse',
  namaVendor: 'Livou',
  dateRequest: '15 Sep 2026',
  pic: 'Jan Chun Siong',
  inisial: 'JS',
  warna: [
    {
      nama: 'Black',
      kode: 'BLK',
      pcs: [
        { ukuran: 'S', qty: 20 },
        { ukuran: 'M', qty: 25 },
        { ukuran: 'L', qty: 20 },
      ],
    },
    {
      nama: 'Ivory',
      kode: 'IVR',
      pcs: [
        { ukuran: 'S', qty: 20 },
        { ukuran: 'M', qty: 25 },
        { ukuran: 'L', qty: 20 },
      ],
    },
  ],
  labelTersedia: { S: 120, M: 150, L: 120 },
  aksesori: [
    { nama: 'Label Brand', varian: 'LIVOU', berlaku: 'All variations', perPcs: 1, satuan: 'pcs', tersedia: 500 },
    // 130 pcs x 0.756 = 98.28 m, tersedia 60 m -> kurang 38.28 m.
    { nama: 'Karet Pinggang', varian: '—', berlaku: 'All variations', perPcs: 0.756, satuan: 'm', tersedia: 60 },
  ],
  kain: [
    {
      nama: 'Kain Rayon',
      satuan: 'm',
      perWarna: {
        BLK: { perPcs: 1.5, tersedia: 120 },
        IVR: { perPcs: 1.5, tersedia: 115 },
      },
    },
  ],
};

// ===== Pabrik kartu =====

interface BahanKartu {
  id: string;
  stage: string;
  productName: string;
  workcode: string;
  batch: string;
  kategoriVendor: string;
  namaVendor: string;
  dateRequest: string;
  pic: string;
  inisial: string;
  designCode: string;
  kategori: string;
  tanggalDibuat: string;
  warna: BarisWarna[];
  labelTersedia: Record<string, number>;
  aksesori: SpesifikasiAksesori[];
  kain: SpesifikasiKain[];
  /** Diisi papan Production saja — lihat `ongkosJahit` di `DetailKartu`. */
  ongkosJahit?: { perPcs: number };
}

function kartu(b: BahanKartu): KartuPdff {
  return {
    id: b.id,
    stage: b.stage,
    productName: b.productName,
    brand: 'CASSCA',
    workcode: b.workcode,
    batch: b.batch,
    kategoriVendor: b.kategoriVendor,
    namaVendor: b.namaVendor,
    dateRequest: b.dateRequest,
    pic: b.pic,
    inisial: b.inisial,
    detail: {
      designCode: b.designCode,
      kategori: b.kategori,
      dibuatOleh: b.pic,
      tanggalDibuat: b.dateRequest,
      warna: b.warna,
      labelTersedia: b.labelTersedia,
      aksesori: b.aksesori,
      kain: b.kain,
      // Disalin apa adanya, termasuk `undefined`. Yang tidak diteruskan adalah
      // nilai bawaan — kalau `kartu()` memberi ongkos jahit sendiri, kartu
      // White Label ikut dapat ongkos jahit dan HPP-nya dihitung dengan rumus
      // yang salah, tanpa ada yang salah.
      ...(b.ongkosJahit ? { ongkosJahit: b.ongkosJahit } : {}),
    },
  };
}

/** Tiga aksesori yang hampir selalu ada di setiap produk. */
function aksesoriUmum(labelBrandTersedia: number, karetTersedia: number): SpesifikasiAksesori[] {
  return [
    {
      nama: 'Label Brand',
      varian: 'LIVOU',
      berlaku: 'All variations',
      perPcs: 1,
      satuan: 'pcs',
      tersedia: labelBrandTersedia,
    },
    {
      nama: 'Karet Pinggang',
      varian: '—',
      berlaku: 'All variations',
      perPcs: 0.756,
      satuan: 'm',
      tersedia: karetTersedia,
    },
  ];
}

// ===== Papan Production =====

export const KARTU_PRODUCTION: KartuPdff[] = [
  kartu({
    id: 'p-01',
    stage: 'propose',
    productName: 'Elodie Top',
    workcode: 'PDFF_CSC-TOP-17_B-00_PRDN',
    batch: 'B-00',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '26 May 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-TOP-17',
    kategori: 'Top',
    tanggalDibuat: '26 May 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 30 },
        ],
      },
      {
        nama: 'Ivory',
        kode: 'IVR',
        pcs: [
          { ukuran: 'S', qty: 15 },
          { ukuran: 'M', qty: 25 },
          { ukuran: 'L', qty: 25 },
        ],
      },
    ],
    labelTersedia: { S: 120, M: 140, L: 140 },
    aksesori: aksesoriUmum(600, 97.09),
    kain: [
      {
        nama: 'Kain Pleats',
        satuan: 'm',
        perWarna: {
          // Black 20+30+30 = 80 pcs; 80 x 1.116 = 89.28 m, tersedia 70 m
          // -> kurang 19.28 m. Angka itulah yang jadi badge kartu ini.
          BLK: { perPcs: 1.116, tersedia: 70 },
          IVR: { perPcs: 1.785, tersedia: 200 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-02',
    stage: 'propose',
    productName: 'Rhea Top',
    workcode: 'PDFF_CSC-TOP-09_B-00_PRDN',
    batch: 'B-00',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '03 Jun 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-TOP-09',
    kategori: 'Top',
    tanggalDibuat: '03 Jun 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 30 },
          { ukuran: 'M', qty: 40 },
          { ukuran: 'L', qty: 40 },
        ],
      },
      {
        nama: 'Ivory',
        kode: 'IVR',
        pcs: [
          { ukuran: 'S', qty: 30 },
          { ukuran: 'M', qty: 35 },
          { ukuran: 'L', qty: 35 },
        ],
      },
    ],
    labelTersedia: { S: 180, M: 200, L: 200 },
    aksesori: aksesoriUmum(900, 200),
    kain: [
      {
        nama: 'Kain Linen',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.24, tersedia: 180 },
          IVR: { perPcs: 1.31, tersedia: 160 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-03',
    stage: 'prepare',
    productName: 'Sora Top',
    workcode: 'PDFF_CSC-TOP-21_B-01_PRDN',
    batch: 'B-01',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '07 May 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-TOP-21',
    kategori: 'Top',
    tanggalDibuat: '07 May 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
        ],
      },
      {
        nama: 'Ivory',
        kode: 'IVR',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 25 },
          { ukuran: 'L', qty: 25 },
        ],
      },
    ],
    labelTersedia: { S: 130, M: 150, L: 150 },
    aksesori: aksesoriUmum(700, 150),
    kain: [
      {
        nama: 'Kain Crepe',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.18, tersedia: 100 },
          IVR: { perPcs: 1.22, tersedia: 95 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-04',
    stage: 'prepare',
    productName: 'Noir Pants',
    workcode: 'PDFF_CSC-PNT-08_B-01_PRDN',
    batch: 'B-01',
    kategoriVendor: 'Garment',
    namaVendor: 'Kouji',
    dateRequest: '24 Apr 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-PNT-08',
    kategori: 'Pants',
    tanggalDibuat: '24 Apr 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 40 },
          { ukuran: 'M', qty: 50 },
          { ukuran: 'L', qty: 50 },
          { ukuran: 'XL', qty: 40 },
        ],
      },
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 40 },
          { ukuran: 'M', qty: 50 },
          { ukuran: 'L', qty: 50 },
          { ukuran: 'XL', qty: 40 },
        ],
      },
    ],
    labelTersedia: { S: 200, M: 240, L: 240, XL: 200 },
    aksesori: aksesoriUmum(1200, 300),
    kain: [
      {
        nama: 'Kain Drill',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.42, tersedia: 280 },
          NVY: { perPcs: 1.42, tersedia: 300 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-05',
    stage: 'cutting',
    productName: 'Midi Dress',
    workcode: 'PDFF_CSC-DRS-02_B-02_PRDN',
    batch: 'B-02',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '20 Jun 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-DRS-02',
    kategori: 'Dress',
    tanggalDibuat: '20 Jun 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'XS', qty: 20 },
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
          { ukuran: 'XL', qty: 20 },
        ],
      },
    ],
    labelTersedia: { XS: 80, S: 110, M: 130, L: 110, XL: 80 },
    aksesori: aksesoriUmum(500, 150),
    kain: [
      {
        nama: 'Kain Satin',
        satuan: 'm',
        perWarna: {
          // 120 pcs x 1.85 = 222 m, tersedia 209.47 -> kurang 12.53 m.
          BLK: { perPcs: 1.85, tersedia: 209.47 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-06',
    stage: 'receive',
    productName: 'Aluna Top',
    workcode: 'PDFF_CSC-TOP-33_B-02_PRDN',
    batch: 'B-02',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '26 Apr 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-TOP-33',
    kategori: 'Top',
    tanggalDibuat: '26 Apr 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
        ],
      },
      {
        nama: 'Ivory',
        kode: 'IVR',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 30 },
          { ukuran: 'XL', qty: 15 },
        ],
      },
    ],
    labelTersedia: { S: 160, M: 180, L: 170, XL: 100 },
    aksesori: aksesoriUmum(800, 190),
    kain: [
      {
        nama: 'Kain Voile',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.15, tersedia: 110 },
          IVR: { perPcs: 1.2, tersedia: 130 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-07',
    stage: 'invoice-product',
    productName: 'Livia Blouse',
    workcode: 'PDFF_CSC-BLS-05_B-01_PRDN',
    batch: 'B-01',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '12 May 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-BLS-05',
    kategori: 'Top',
    tanggalDibuat: '12 May 2026',
    warna: [
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 24 },
          { ukuran: 'M', qty: 24 },
          { ukuran: 'L', qty: 24 },
          { ukuran: 'XL', qty: 24 },
        ],
      },
    ],
    labelTersedia: { S: 90, M: 90, L: 90, XL: 90 },
    aksesori: aksesoriUmum(400, 100),
    kain: [
      {
        nama: 'Kain Sifon',
        satuan: 'm',
        perWarna: {
          CRM: { perPcs: 1.32, tersedia: 150 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-08',
    stage: 'hpp-price',
    productName: 'Vera Skirt',
    workcode: 'PDFF_CSC-SKT-14_B-01_PRDN',
    batch: 'B-01',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '15 May 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-SKT-14',
    kategori: 'Bottom',
    tanggalDibuat: '15 May 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 25 },
          { ukuran: 'L', qty: 20 },
        ],
      },
      {
        nama: 'Sage',
        kode: 'SGE',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 25 },
          { ukuran: 'L', qty: 20 },
        ],
      },
    ],
    labelTersedia: { S: 120, M: 140, L: 120 },
    aksesori: aksesoriUmum(600, 130),
    kain: [
      {
        nama: 'Kain Twill',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.38, tersedia: 95 },
          SGE: { perPcs: 1.38, tersedia: 100 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-09',
    stage: 'upload',
    productName: 'Nara Shirt',
    workcode: 'PDFF_CSC-SHR-03_B-00_PRDN',
    batch: 'B-00',
    kategoriVendor: 'Inhouse',
    namaVendor: 'Livou',
    dateRequest: '08 May 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-SHR-03',
    kategori: 'Top',
    tanggalDibuat: '08 May 2026',
    warna: [
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 30 },
          { ukuran: 'M', qty: 40 },
          { ukuran: 'L', qty: 40 },
        ],
      },
      {
        nama: 'White',
        kode: 'WHT',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 35 },
          { ukuran: 'L', qty: 30 },
        ],
      },
    ],
    labelTersedia: { S: 180, M: 220, L: 210 },
    aksesori: aksesoriUmum(900, 210),
    kain: [
      {
        nama: 'Kain Poplin',
        satuan: 'm',
        perWarna: {
          NVY: { perPcs: 1.48, tersedia: 180 },
          WHT: { perPcs: 1.48, tersedia: 150 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),

  kartu({
    id: 'p-10',
    stage: 'finance-validate',
    productName: 'Rowe Tee',
    workcode: 'PDFF_CSC-TEE-11_B-00_PRDN',
    batch: 'B-00',
    kategoriVendor: 'Konveksi',
    namaVendor: 'Kouji',
    dateRequest: '30 Apr 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-TEE-11',
    kategori: 'Top',
    tanggalDibuat: '30 Apr 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 35 },
          { ukuran: 'M', qty: 45 },
          { ukuran: 'L', qty: 45 },
        ],
      },
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 20 },
        ],
      },
    ],
    labelTersedia: { S: 150, M: 190, L: 170 },
    aksesori: aksesoriUmum(800, 180),
    kain: [
      {
        nama: 'Kain Cotton Combed',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.05, tersedia: 140 },
          CRM: { perPcs: 1.05, tersedia: 90 },
        },
      },
    ],
    ongkosJahit: { perPcs: 15000 },
  }),
];

// ===== Papan White Label =====
//
// Dua perbedaan dari papan Production, keduanya keputusan pemilik:
//
//   1. Tidak ada Cutting. Vendor-nya di luar negeri (China), barang datang
//      utuh — tidak dipotong di sini. Digantikan Invoice Logistic.
//   2. Tidak ada Prepare. Usulan yang di-approve langsung ke Invoice Logistic,
//      jadi tidak ada tahap menyiapkan bahan di papan ini.
//
// Konsekuensinya penting dan disengaja: papan ini TIDAK punya gate kesiapan
// bahan sama sekali. Centang bahan per baris hanya hidup di papan Production,
// karena hanya di sana bahan itu disiapkan sendiri. Kartu white label tidak
// pernah tertahan menunggu bahan.
//
// Di data sungguhan kedua papan ini BUKAN dua daftar seperti ini: keduanya
// membaca tabel yang sama, dan yang menentukan sebuah kartu masuk papan mana
// adalah `source_production`. Dua daftar terpisah di sini hanya karena
// pratinjau belum punya database.

export const KARTU_WHITELABEL: KartuPdff[] = [
  kartu({
    id: 'w-01',
    stage: 'propose',
    productName: 'Camille Set',
    workcode: 'PDFF_CSC-SET-06_B-03_WHLB',
    batch: 'B-03',
    kategoriVendor: 'China',
    namaVendor: 'Guangzhou Fashion',
    dateRequest: '02 Jun 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-SET-06',
    kategori: 'Set',
    tanggalDibuat: '02 Jun 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 30 },
          { ukuran: 'M', qty: 35 },
          { ukuran: 'L', qty: 35 },
          { ukuran: 'XL', qty: 20 },
        ],
      },
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 30 },
          { ukuran: 'M', qty: 35 },
          { ukuran: 'L', qty: 35 },
          { ukuran: 'XL', qty: 20 },
        ],
      },
    ],
    labelTersedia: { S: 150, M: 180, L: 180, XL: 110 },
    aksesori: aksesoriUmum(1000, 260),
    kain: [
      {
        nama: 'Kain Rayon',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.62, tersedia: 210 },
          CRM: { perPcs: 1.62, tersedia: 220 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-02',
    stage: 'invoice-logistic',
    productName: 'Odette Gown',
    workcode: 'PDFF_CSC-GWN-19_B-03_WHLB',
    batch: 'B-03',
    kategoriVendor: 'China',
    namaVendor: 'Haining Silk Co',
    dateRequest: '11 Jun 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-GWN-19',
    kategori: 'Dress',
    tanggalDibuat: '11 Jun 2026',
    warna: [
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 25 },
          { ukuran: 'L', qty: 25 },
          { ukuran: 'XL', qty: 20 },
        ],
      },
    ],
    labelTersedia: { S: 60, M: 80, L: 80, XL: 60 },
    aksesori: aksesoriUmum(300, 80),
    kain: [
      {
        nama: 'Kain Silk',
        satuan: 'm',
        perWarna: {
          // 90 pcs x 2.1 = 189 m, tersedia 180.6 -> kurang 8.4 m.
          NVY: { perPcs: 2.1, tersedia: 180.6 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-03',
    stage: 'invoice-logistic',
    productName: 'Allure Dress',
    workcode: 'PDFF_CSC-DRS-11_B-02_WHLB',
    batch: 'B-02',
    kategoriVendor: 'China',
    namaVendor: 'Guangzhou Fashion',
    dateRequest: '26 Apr 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-DRS-11',
    kategori: 'Dress',
    tanggalDibuat: '26 Apr 2026',
    warna: [
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
        ],
      },
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 30 },
          { ukuran: 'XL', qty: 15 },
        ],
      },
    ],
    labelTersedia: { S: 160, M: 180, L: 170, XL: 100 },
    aksesori: aksesoriUmum(800, 190),
    kain: [
      {
        nama: 'Kain Georgette',
        satuan: 'm',
        perWarna: {
          NVY: { perPcs: 1.72, tersedia: 150 },
          CRM: { perPcs: 1.72, tersedia: 200 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-04',
    stage: 'receive',
    productName: 'Belle Cardigan',
    workcode: 'PDFF_CSC-CRD-07_B-02_WHLB',
    batch: 'B-02',
    kategoriVendor: 'China',
    namaVendor: 'Guangzhou Fashion',
    dateRequest: '19 May 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-CRD-07',
    kategori: 'Outer',
    tanggalDibuat: '19 May 2026',
    warna: [
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
        ],
      },
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 20 },
          { ukuran: 'M', qty: 25 },
          { ukuran: 'L', qty: 25 },
        ],
      },
    ],
    labelTersedia: { S: 130, M: 160, L: 150 },
    aksesori: aksesoriUmum(700, 160),
    kain: [
      {
        nama: 'Kain Rajut',
        satuan: 'm',
        perWarna: {
          CRM: { perPcs: 1.55, tersedia: 130 },
          NVY: { perPcs: 1.55, tersedia: 120 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-05',
    stage: 'invoice-product',
    productName: 'Iris Blouse',
    workcode: 'PDFF_CSC-BLS-22_B-02_WHLB',
    batch: 'B-02',
    kategoriVendor: 'China',
    namaVendor: 'Haining Silk Co',
    dateRequest: '22 May 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-BLS-22',
    kategori: 'Top',
    tanggalDibuat: '22 May 2026',
    warna: [
      {
        nama: 'White',
        kode: 'WHT',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 30 },
        ],
      },
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
        ],
      },
    ],
    labelTersedia: { S: 140, M: 170, L: 160 },
    aksesori: aksesoriUmum(700, 170),
    kain: [
      {
        nama: 'Kain Satin',
        satuan: 'm',
        perWarna: {
          WHT: { perPcs: 1.44, tersedia: 140 },
          CRM: { perPcs: 1.44, tersedia: 130 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-06',
    stage: 'hpp-price',
    productName: 'Luna Pants',
    workcode: 'PDFF_CSC-PNT-31_B-01_WHLB',
    batch: 'B-01',
    kategoriVendor: 'China',
    namaVendor: 'Guangzhou Fashion',
    dateRequest: '05 May 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-PNT-31',
    kategori: 'Pants',
    tanggalDibuat: '05 May 2026',
    warna: [
      {
        nama: 'Black',
        kode: 'BLK',
        pcs: [
          { ukuran: 'S', qty: 35 },
          { ukuran: 'M', qty: 40 },
          { ukuran: 'L', qty: 40 },
          { ukuran: 'XL', qty: 35 },
        ],
      },
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 35 },
          { ukuran: 'M', qty: 40 },
          { ukuran: 'L', qty: 40 },
          { ukuran: 'XL', qty: 35 },
        ],
      },
    ],
    labelTersedia: { S: 180, M: 220, L: 220, XL: 180 },
    aksesori: aksesoriUmum(1100, 290),
    kain: [
      {
        nama: 'Kain Polyester',
        satuan: 'm',
        perWarna: {
          BLK: { perPcs: 1.36, tersedia: 200 },
          NVY: { perPcs: 1.36, tersedia: 210 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-07',
    stage: 'upload',
    productName: 'Maya Top',
    workcode: 'PDFF_CSC-TOP-44_B-01_WHLB',
    batch: 'B-01',
    kategoriVendor: 'China',
    namaVendor: 'Guangzhou Fashion',
    dateRequest: '28 Apr 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    designCode: 'CSC-TOP-44',
    kategori: 'Top',
    tanggalDibuat: '28 Apr 2026',
    warna: [
      {
        nama: 'Cream',
        kode: 'CRM',
        pcs: [
          { ukuran: 'S', qty: 35 },
          { ukuran: 'M', qty: 40 },
          { ukuran: 'L', qty: 35 },
        ],
      },
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'S', qty: 30 },
          { ukuran: 'M', qty: 35 },
          { ukuran: 'L', qty: 35 },
        ],
      },
    ],
    labelTersedia: { S: 180, M: 210, L: 200 },
    aksesori: aksesoriUmum(900, 220),
    kain: [
      {
        nama: 'Kain Chiffon',
        satuan: 'm',
        perWarna: {
          CRM: { perPcs: 1.28, tersedia: 150 },
          NVY: { perPcs: 1.28, tersedia: 140 },
        },
      },
    ],
  }),

  kartu({
    id: 'w-08',
    stage: 'finance-validate',
    productName: 'Zara Dress',
    workcode: 'PDFF_CSC-DRS-28_B-00_WHLB',
    batch: 'B-00',
    kategoriVendor: 'China',
    namaVendor: 'Haining Silk Co',
    dateRequest: '20 Apr 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    designCode: 'CSC-DRS-28',
    kategori: 'Dress',
    tanggalDibuat: '20 Apr 2026',
    warna: [
      {
        nama: 'Navy',
        kode: 'NVY',
        pcs: [
          { ukuran: 'XS', qty: 20 },
          { ukuran: 'S', qty: 25 },
          { ukuran: 'M', qty: 30 },
          { ukuran: 'L', qty: 25 },
          { ukuran: 'XL', qty: 20 },
        ],
      },
    ],
    labelTersedia: { XS: 70, S: 90, M: 110, L: 90, XL: 70 },
    aksesori: aksesoriUmum(400, 110),
    kain: [
      {
        nama: 'Kain Velvet',
        satuan: 'm',
        perWarna: {
          NVY: { perPcs: 1.95, tersedia: 240 },
        },
      },
    ],
  }),
];
