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
  }),

  kartu({
    id: 'p-04',
    stage: 'prepare',
    productName: 'Noir Pants',
    workcode: 'PDFF_CSC-PNT-08_B-01_GRMT',
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
