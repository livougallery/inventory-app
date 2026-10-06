// ===== Data contoh papan Material Fulfillment (pratinjau) =====
//
// Halaman ini BELUM tersambung ke database — ini pratinjau tampilan untuk
// presentasi, sama seperti papan Production Fulfillment.
//
// Aturan yang dipegang di berkas ini, dan alasannya bukan kerapian:
//
//   1. SATU KARTU = SATU PO = SATU VENDOR. Bukan satu kartu per workcode.
//      Setiap jenis aksesori datang dari vendor berbeda, jadi satu pekerjaan
//      fulfilment yang butuh lima material menghasilkan LIMA kartu, bukan
//      satu. Inilah yang tidak bisa diakomodasi form pembelian yang punya satu
//      dropdown Supplier di atas dan banyak item di bawahnya.
//
//   2. SATU PO = SATU KATEGORI. Belum pernah ada vendor yang menjual dua
//      kategori, jadi Kategori dan Jenis ada di Informasi Pembelian, bukan
//      diulang di setiap baris item. Mengulanginya berarti nilai yang sama
//      ditulis delapan kali dan bisa berbeda di baris keempat.
//
//   3. HARGA TIDAK DISIMPAN DI MASTER. `features/material/backend/routes.js:5`
//      sudah menyebutnya, dan `harga_terakhir` diambil dari batch pembelian
//      termuda (`routes.js:104-110`) — bukan dari baris master. Jadi harga per
//      PO di sini bukan duplikat master: ia BATCH BARU yang belum masuk FIFO
//      dan baru akan ikutung saat material benar-benar datang.
//
// Karena itu "sudah datang" tidak kosmetik di halaman ini. Mencentang baris
// itulah yang membuat harga batch itu masuk riwayat — kebetulan cocok dengan
// keputusan owner: kartu tutup saat semua material sudah datang.

export interface BarisItem {
  /** Kunci stabil baris. Baris boleh dihapus, jadi indeks tidak bisa dipakai. */
  key: number;
  materialId: number | null;
  kode: string;
  nama: string;
  varian: string;
  satuan: string;
  qty: number;
  harga: number;
  foto: string | null;
}

export interface KartuPo {
  id: string;
  /** Id stage — harus salah satu id di PAPAN_PO. */
  stage: string;
  noPo: string;
  vendor: string;
  kategori: string;
  jenis: string;
  /**
   * Satu baris = satu workcode. Boleh banyak, dan boleh kosong — koneksi ke
   * produksi ditunda owner, jadi workcode diisi manual, bukan turunan kartu
   * Production Fulfillment. Lihat keputusan D1/D8 di
   * `.scratch/material-fulfillment-tahap/brainstorm-2026-09-25.md`.
   */
  workcodes: string[];
  tglPo: string;
  pic: string;
  inisial: string;
  catatan: string;
  items: BarisItem[];
  fotoNota: string | null;
  buktiBayar: string | null;
}

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

/**
 * Lima kolom, bukan enam. Stage "Dikirim" dihapus owner: tidak ada keputusan
 * yang diambil di sana yang tidak sudah diambil di "Dipesan", jadi Intermediate
 * cuma menambah satu klik tanpa menambah informasi.
 *
 * Labelnya Bahasa Inggris, mengikuti papan Production Fulfillment yang juga
 * berbahasa Inggris (Propose, Prepare, Cutting, ...). Alasannya sederhana:
 * satu orang membaca kedua papan bergantian, dan "Diajukan" di sini
 * bersebelahan dengan "Propose" di sana — dua nama berbeda untuk tahap yang
 * menurut urutan sama persis. Yang berubah hanya LABEL; `id`-nya tetap
 * berbahasa Indonesia dan tidak boleh diubah, karena ia yang jadi kunci
 * `pindah` dan ditulis di state yang sudah tersimpan.
 */
export const PAPAN_PO: StagePapan[] = [
  { id: 'diajukan', label: 'Proposed', warna: 'bg-slate-400' },
  { id: 'disetujui', label: 'Approved', warna: 'bg-amber-500' },
  { id: 'dipesan', label: 'Ordered', warna: 'bg-violet-500' },
  { id: 'diterima', label: 'Received', warna: 'bg-blue-500' },
  { id: 'selesai', label: 'Completed', warna: 'bg-emerald-500' },
];

export const PIC = [
  'Jan Chun Siong',
  'Jan Chun Siang',
  'Lina Wijaya',
  'Samuel Hartono',
];

// ===== Kategori & Jenis =====
//
// Daftar ini milik SATU PO, bukan milik baris item. Lihat aturan 2 di atas.
//
// Kain Pelapis sengaja di bawah Aksesoris meski namanya mengandung "Kain" —
// keputusan owner 4 September 2026, sama seperti di `StokMaterial.tsx:56`.

export interface OpsiKategori {
  value: string;
  label: string;
  jenis: string[];
  /** Satuan bawaan material di kategori ini. */
  satuan: string;
}

export const KATEGORI: OpsiKategori[] = [
  { value: 'kain', label: 'Kain', jenis: ['Roll', 'Ecer'], satuan: 'm' },
  {
    value: 'aksesoris',
    label: 'Aksesoris',
    jenis: ['Hak Kait', 'Kancing', 'Resleting', 'Karet', 'Label', 'Renda', 'Kain Pelapis'],
    satuan: 'pcs',
  },
  {
    value: 'cmt_cost',
    label: 'Product Fulfillment',
    jenis: [],
    satuan: 'pcs',
  },
];

export function kategoriDari(value: string): OpsiKategori {
  return KATEGORI.find((k) => k.value === value) ?? KATEGORI[1];
}

export function jenisUntuk(kategori: string): string[] {
  return kategoriDari(kategori).jenis;
}

// ===== Master material (pratinjau) =====
//
// Dipakai untuk dua hal: mengisi kolom foto, dan Strip saran saat nama yang
// diketik sudah punya master. Foto memakai `data:` URL supaya pratinjau tidak
// perlu server — lihat catatan Q7 di `.scratch/production-fulfillment-tahap/`.
//
// Bentuk kolomnya sengaja sama dengan `Material` di `StokMaterial.tsx:12`, dan
// `foto_path` sengaja kosong-string (bukan null) karena endpoint `/api/materials`
// menormalkan dengan `|| ''` sejak sebelum tiket foto material.

export interface MasterMaterial {
  id: number;
  kode_bahan: string;
  nama: string;
  kategori: string;
  satuan: string;
  varian_list: string[];
  foto_path: string;
}

/** SVG inline sebagai foto contoh — tanpa jaringan, tanpa berkas di server. */
function fotoContoh(warna: string, label: string): string {
  const teks = encodeURIComponent(label);
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${warna}"/><text x="60" y="66" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">${teks}</text></svg>`
  )}`;
}

export const MASTER_MATERIAL: MasterMaterial[] = [
  {
    id: 1,
    kode_bahan: 'MT-KN-001',
    nama: 'Kain Rayon',
    kategori: 'kain',
    satuan: 'm',
    varian_list: ['Black', 'Ivory', 'Navy'],
    foto_path: fotoContoh('#334155', 'Rayon'),
  },
  {
    id: 2,
    kode_bahan: 'MT-KN-002',
    nama: 'Kain Linen',
    kategori: 'kain',
    satuan: 'm',
    varian_list: ['Black', 'Ivory'],
    foto_path: fotoContoh('#475569', 'Linen'),
  },
  {
    id: 3,
    kode_bahan: 'MT-KN-014',
    nama: 'Kain Crepe',
    kategori: 'kain',
    satuan: 'm',
    varian_list: ['Black', 'Ivory', 'Sage'],
    foto_path: fotoContoh('#0f766e', 'Crepe'),
  },
  {
    id: 4,
    kode_bahan: 'MT-AK-004',
    nama: 'Karet Pinggang',
    kategori: 'aksesoris',
    satuan: 'm',
    varian_list: ['Hitam', 'Cream'],
    foto_path: fotoContoh('#b45309', 'Karet'),
  },
  {
    id: 5,
    kode_bahan: 'MT-AK-007',
    nama: 'Resleting 20cm',
    kategori: 'aksesoris',
    satuan: 'pcs',
    varian_list: ['Hitam', 'Cream', 'Navy'],
    foto_path: fotoContoh('#7c3aed', 'Reslet'),
  },
  {
    id: 6,
    kode_bahan: 'MT-AK-011',
    nama: 'Kancing Kaca',
    kategori: 'aksesoris',
    satuan: 'pcs',
    varian_list: ['Merah', 'Hitam'],
    foto_path: fotoContoh('#be123c', 'Kancing'),
  },
  {
    id: 7,
    kode_bahan: 'MT-AK-015',
    nama: 'Hak Kait YKK',
    kategori: 'aksesoris',
    satuan: 'pcs',
    varian_list: ['Navy', 'Cream'],
    foto_path: fotoContoh('#0369a1', 'Hak Kait'),
  },
  {
    id: 8,
    kode_bahan: 'MT-PF-003',
    nama: 'Jasa Jahit',
    kategori: 'cmt_cost',
    satuan: 'pcs',
    varian_list: [],
    foto_path: fotoContoh('#065f46', 'Jasa'),
  },
];

export function cariMaterial(id: number | null): MasterMaterial | undefined {
  return MASTER_MATERIAL.find((m) => m.id === id);
}

/**
 * Master yang boleh dipakai di PO kategori ini.
 *
 * Disaring per kategori karena satu PO = satu kategori (aturan 2). Tanpa
 * saringan ini, baris bisa diisi material Berbeda kategori dan kolom
 * "Kategori" di atas jadi berbohong.
 */
export function masterPerKategori(kategori: string): MasterMaterial[] {
  return MASTER_MATERIAL.filter((m) => m.kategori === kategori);
}

// ===== Aritmetika =====

export function subtotal(baris: BarisItem[]): number {
  return baris.reduce((s, b) => s + b.qty * b.harga, 0);
}

export function total(kartu: KartuPo): number {
  return subtotal(kartu.items);
}

/**
 * Kunci baris item — unik DI DALAM satu PO, bukan di seluruh aplikasi.
 *
 * Dua material dengan `materialId` sama BOLEH berdiri di satu PO kalau varian
 * atau kombinasinya berbeda: satu PO untuk satu roll kain, dan roll Black
 * dan roll Ivory sama-sama master id 1. Karena itu `materialId` saja tidak
 * cukup sebagai kunci — dua baris itu akan berbagi satu kunci, dan satu
 * centang "sudah datang" ikut menandai yang lain, sehingga gerbang "semua
 * material datang" terbuka sebelum bahan yang satu benar-benar ada.
 *
 * Bug ini bukan karangan: data contoh punya tiga kartu dengan baris kembar
 * seperti ini, dan smoke test yang menangkapnya. Varian ikut masuk kunci
 * supaya dua baris berbeda tidak berbagi satu centang.
 *
 * Baris material baru belum punya id, jadi kuncinya jatuh ke nomor baris —
 * unik selama baris itu hidup, dan hilang bersama barisnya, yang memang
 * benar: centangnya ikut hilang.
 */
export function kunciItem(item: BarisItem): string {
  const dasar = String(item.materialId ?? `baru-${item.key}`);
  const varian = item.varian.trim().toLowerCase();
  return varian ? `${dasar}|${varian}` : dasar;
}

export interface RingkasanDatang {
  sudah: number;
  totalBaris: number;
  /** Benar kalau semua baris yang punya isi sudah dicentang. */
  lengkap: boolean;
}

/**
 * Berapa baris yang sudah dicentang "sudah datang" — gate tombol Selesaikan.
 *
 * Yang dihitung hanya baris yang PUNYA ISI. Baris yang baru ditambahkan tapi
 * belum diisi nama tidak boleh ikut dihitung, kalau tidak tombol Selesaikan
 * hidup hanya karena ada baris yang belum ada isinya sama sekali.
 *
 * Bandingkan dua sisi dengan KUNCI, bukan jumlah. Centang bisa tertinggal pada
 * baris yang sudah dihapus, dan kalau `kunci.size` dipakai langsung sebagai
 * "sudah", `lengkap` bisa true padahal masih ada baris kosong yang belum
 * dicentang. Yang dihitung di sini hanya centang pada baris yang benar-benar
 * ada sekarang.
 */
export function ringkasDatang(
  kartuId: string,
  items: BarisItem[],
  datang: Record<string, string[]>
): RingkasanDatang {
  const kunci = new Set(datang[kartuId] ?? []);
  const terisi = items.filter((b) => b.nama.trim() !== '');
  const sudah = terisi.filter((b) => kunci.has(kunciItem(b))).length;
  return {
    sudah,
    totalBaris: terisi.length,
    lengkap: terisi.length > 0 && sudah === terisi.length,
  };
}

// ===== Kartu contoh =====

let nomorBaris = 0;

function item(
  materialId: number | null,
  overrides: Partial<BarisItem> = {}
): BarisItem {
  const master = cariMaterial(materialId);
  return {
    key: nomorBaris++,
    materialId,
    kode: master?.kode_bahan ?? '',
    nama: master?.nama ?? '',
    varian: master?.varian_list[0] ?? '',
    satuan: master?.satuan ?? 'pcs',
    qty: 0,
    harga: 0,
    foto: master?.foto_path ?? null,
    ...overrides,
  };
}

/**
 * Delapan kartu contoh, tersebar di kelima kolom.
 *
 * Semuanya sengaja memakai vendor BERBEDA. Itu bukan pilihan estetika: justru
 * itulah masalah yang diselesaikan halaman ini — satu pekerjaan fulfilment
 * butuh material dari banyak vendor, dan setiap jenis aksesori punya vendor
 * sendiri. Kalau kartu contoh mengulang vendor, papan ini akan terlihat rapi
 * persis seperti form yang salah, dan tidak satu pun pemeriksaan di bawah bisa
 * menangkapnya: papan yang salah tapi konsisten tetap lolos semua.
 *
 * workcode-nya boleh berulang di beberapa kartu — itu memang begitu di
 * dunia nyata: satu PO untuk kain dan satu PO untuk kancing melayani workcode
 * yang sama. Yang tidak boleh berulang adalah VENDOR-nya.
 */
export const KARTU_PO: KartuPo[] = [
  {
    id: 'po-01',
    stage: 'diajukan',
    noPo: 'PO-2026-0001',
    vendor: 'Toko Kain Makmur',
    kategori: 'kain',
    jenis: 'Roll',
    workcodes: ['PDFF_CSC-TOP-17_B-00_PRDN'],
    tglPo: '26 Sep 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    catatan: 'Kain untuk Elodie Top, warna Black dan Ivory.',
    items: [
      item(1, { varian: 'Black', qty: 120, harga: 85000 }),
      item(1, { varian: 'Ivory', qty: 80, harga: 85000 }),
    ],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-02',
    stage: 'diajukan',
    noPo: 'PO-2026-0002',
    vendor: 'Aksesoris Jaya Abadi',
    kategori: 'aksesoris',
    jenis: 'Karet',
    workcodes: ['PDFF_CSC-TOP-17_B-00_PRDN', 'PDFF_CSC-TOP-09_B-00_PRDN'],
    tglPo: '26 Sep 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    catatan: 'Karet dibutuhkan dua batch sekaligus.',
    items: [item(4, { varian: 'Hitam', qty: 240, harga: 12000 })],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-03',
    stage: 'disetujui',
    noPo: 'PO-2026-0003',
    vendor: 'Toko Resleting Sentosa',
    kategori: 'aksesoris',
    jenis: 'Resleting',
    //Vendor berbeda dari kartu Hak Kait di bawah — keduanya aksesoris, dan
    //justru itulah masalahnya: satu jenis aksesori tak pernah dari vendor yang
    //sama dengan jenis lainnya.
    workcodes: ['PDFF_CSC-DRS-02_B-02_PRDN'],
    tglPo: '24 Sep 2026',
    pic: 'Lina Wijaya',
    inisial: 'LW',
    catatan: '',
    items: [
      item(5, { varian: 'Hitam', qty: 130, harga: 4500 }),
      item(5, { varian: 'Cream', qty: 130, harga: 4500 }),
    ],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-04',
    stage: 'dipesan',
    noPo: 'PO-2026-0004',
    vendor: 'Konveksi Sejahtera Mandiri',
    kategori: 'kain',
    jenis: 'Roll',
    workcodes: ['PDFF_CSC-PNT-08_B-01_GRMT'],
    tglPo: '22 Sep 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    catatan: 'Kain drill untuk Noir Pants, dua warna.',
    items: [
      item(2, { varian: 'Black', qty: 200, harga: 78000 }),
      item(2, { varian: 'Ivory', qty: 150, harga: 78000 }),
    ],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-05',
    stage: 'dipesan',
    noPo: 'PO-2026-0005',
    vendor: 'Percetakan Grafika',
    kategori: 'cmt_cost',
    jenis: '',
    workcodes: ['PDFF_CSC-BLS-05_B-01_PRDN'],
    tglPo: '20 Sep 2026',
    pic: 'Samuel Hartono',
    inisial: 'SH',
    catatan: 'Jasa cetak label brand size S/M/L/XL.',
    items: [item(8, { qty: 96, harga: 2500 })],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-06',
    stage: 'diterima',
    noPo: 'PO-2026-0006',
    vendor: 'Toko Kain Makmur Jaya',
    kategori: 'kain',
    jenis: 'Roll',
    workcodes: ['PDFF_CSC-TOP-21_B-01_PRDN'],
    tglPo: '18 Sep 2026',
    pic: 'Jan Chun Siang',
    inisial: 'JS',
    catatan: 'Kain crepe, warna Black.',
    items: [item(3, { varian: 'Black', qty: 120, harga: 92000 })],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-07',
    stage: 'selesai',
    noPo: 'PO-2026-0007',
    vendor: 'Toko Kancing Batik',
    kategori: 'aksesoris',
    jenis: 'Kancing',
    workcodes: ['PDFF_CSC-DRS-02_B-02_PRDN'],
    tglPo: '15 Sep 2026',
    pic: 'Lina Wijaya',
    inisial: 'LW',
    catatan: '',
    items: [item(6, { varian: 'Merah', qty: 260, harga: 800 })],
    fotoNota: null,
    buktiBayar: null,
  },
  {
    id: 'po-08',
    stage: 'selesai',
    noPo: 'PO-2026-0008',
    vendor: 'Toko Hak Kait Nusantara',
    kategori: 'aksesoris',
    jenis: 'Hak Kait',
    workcodes: ['PDFF_CSC-TEE-11_B-00_PRDN'],
    tglPo: '12 Sep 2026',
    pic: 'Jan Chun Siong',
    inisial: 'JS',
    catatan: '',
    items: [item(7, { varian: 'Navy', qty: 200, harga: 2500 })],
    fotoNota: null,
    buktiBayar: null,
  },
];

/**
 * Stage setelah `id` di papan ini. `undefined` kalau `id` kolom terakhir atau
 * tidak ada di papan.
 *
 * Sama seperti papan Production Fulfillment: tujuan perpindahan TIDAK PERNAH
 * ditulis tetap seperti `'dipesan'`, tapi diambil dari urutan kolom. Menulis
 * tetap membuat kartu yang sudah dipindah ke kolom terakhir tidak punya tujuan
 * — dan di sini itu berarti tombolnya diam, bukan errornya.
 */
export function stageSetelah(stages: StagePapan[], id: string): StagePapan | undefined {
  const i = stages.findIndex((s) => s.id === id);
  return i >= 0 ? stages[i + 1] : undefined;
}

/**
 * Stage tempat sebuah kartu berada sekarang.
 *
 * Urutannya penting: perpindahan yang sudah dikerjakan MENANG atas stage
 * bawaan kartu. Kalau dibalik, approve di Diajukan tidak akan memindahkan
 * apa pun — kartunya ada di daftar bawaan, jadi stage bawaannya selalu
 * dianggap yang berlaku, dan tombolnya seperti tidak bekerja.
 *
 * Kartu yang tidak ada di daftar (hasil form) ditaruh di kolom pertama: kartu
 * baru dari form belum pernah di-approve, jadi tempat paling masuk akal memang
 * kolom paling awal.
 */
export function stageKartu(
  id: string,
  daftar: KartuPo[],
  pindah: Record<string, string>,
  stages: StagePapan[]
): string {
  const tujuan = pindah[id];
  if (tujuan && stages.some((s) => s.id === tujuan)) return tujuan;

  const kartu = daftar.find((k) => k.id === id);
  if (kartu && stages.some((s) => s.id === kartu.stage)) return kartu.stage;

  return stages[0]?.id ?? 'diajukan';
}

/**
 * Kartu dari form "Pembelian Material" di kolom Proposed.
 *
 * `id` ditentukan pemanggil supaya tidak mungkin bentrok dengan kartu contoh —
 * pemanggilnya menghitung dari kartu yang sudah ada, bukan dari `Date.now()`
 * yang bisa kembar dalam milidetik yang sama.
 *
 * CATATAN tipe parameter. `items` sengaja TIDAK dikecualikan di sini.
 * Versi sebelumnya menulis `Omit<KartuPo, 'id' | 'stage' | 'items'>` — yang
 * berarti "fungsi ini tidak menerima baris material" — padahal pemanggilnya
 * (`MaterialFulfillment.tsx`) meneruskan data form yang jelas punya `items`.
 * TypeScript tetap menerimanya karena itu variabel, bukan object literal, jadi
 * tipe yang salah tidak pernah ketahuan: baris material yang diisi di form
 * hilang diam-diam dan kartu lahir tanpa item.
 *
 * Ditangkap oleh smoke test "kartu hasil form membawa N baris material"
 * (28 Sep) — bukan oleh `tsc`, yang hijau sepanjang waktu.
 */
export function kartuBaru(id: string, b: Omit<KartuPo, 'id' | 'stage'>): KartuPo {
  // `items: []` ditulis SETELAH spread, bukan sebelumnya, supaya kartu yang
  // formnya belum diisi baris material pun tetap punya array — bukan `undefined`
  // yang akan membuat `items.filter(...)` di tabel dan `items.map(...)` di
  // popup meledak begitu PO tanpa material dibuka. Nilai bawaan ada di sini,
  // bukan di sebelah kirinya yang diam-diam ditimpa.
  return { id, stage: 'diajukan', ...b, items: b.items ?? [] };
}

// ===== Hak isi per stage =====
//
// Owner 28 September 2026: isi popup berbeda per tahap, dan tidak semua
// tahap boleh diedit.
//
//   - `bisaEdit`  : Informasi Pembelian, Workcode, dan Item Material boleh diedit
//   - `bisaUnggah`: Foto Invoice Material boleh diunggah
//   - `bisaDatang`: kolom centang "Datang" hidup
//
// Tiga hal ini sengaja dipisah, bukan tiga kebetulan yang kebetulan sama.
// "Bisa diedit" tidak otomatis berarti "bisa diunggah foto": pada tahap
// Received tidak ada satu pun isian yang boleh diedit lagi, tetapi foto
// invoice tetap boleh ditambahkan — karena dokumennya baru saja tiba dan
// masih perlu dilampirkan.

/** Informasi Pembelian + Workcode + Item Material masih boleh diedit. */
export const STAGE_BOLEH_EDIT = ['diajukan', 'disetujui', 'dipesan'] as const;

/** Foto Invoice Material boleh diunggah/diubah. */
export const STAGE_BOLEH_UNGGAH = ['dipesan', 'diterima', 'selesai'] as const;

/** Centang "Datang" hidup — hanya di tahap materialnya yang benar-benar tiba. */
export const STAGE_BOLEH_DATANG = ['diterima'] as const;

export function bisaEdit(stageId: string | undefined): boolean {
  return stageId !== undefined && (STAGE_BOLEH_EDIT as readonly string[]).includes(stageId);
}

export function bisaUnggah(stageId: string | undefined): boolean {
  return stageId !== undefined && (STAGE_BOLEH_UNGGAH as readonly string[]).includes(stageId);
}

export function bisaTandaiDatang(stageId: string | undefined): boolean {
  return stageId !== undefined && (STAGE_BOLEH_DATANG as readonly string[]).includes(stageId);
}
