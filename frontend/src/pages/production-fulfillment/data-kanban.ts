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
  /** Kebutuhan dan stok per kode warna. Warna yang tidak tercantum dilewati. */
  perWarna: Record<string, { perPcs: number; tersedia: number }>;
}

export interface SpesifikasiAksesori {
  nama: string;
  varian: string;
  berlaku: string;
  perPcs: number;
  satuan: string;
  tersedia: number;
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
// Delapan tahap, persis daftar owner. Papan White Label memakai urutan yang
// sama dengan satu perbedaan: Cutting digantikan Invoice Logistic — barang
// white label tidak dipotong di sini, ia datang utuh dari vendor luar negeri.

export interface StagePapan {
  id: string;
  label: string;
}

export const PAPAN_PRODUCTION: StagePapan[] = [
  { id: 'propose', label: 'Propose' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'cutting', label: 'Cutting' },
  { id: 'receive', label: 'Receive' },
  { id: 'invoice-product', label: 'Invoice Product' },
  { id: 'hpp-price', label: 'HPP & Price' },
  { id: 'upload', label: 'Upload' },
  { id: 'finance-validate', label: 'Finance Validate' },
];

export const PAPAN_WHITELABEL: StagePapan[] = [
  { id: 'propose', label: 'Propose' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'invoice-logistic', label: 'Invoice Logistic' },
  { id: 'receive', label: 'Receive' },
  { id: 'invoice-product', label: 'Invoice Product' },
  { id: 'hpp-price', label: 'HPP & Price' },
  { id: 'upload', label: 'Upload' },
  { id: 'finance-validate', label: 'Finance Validate' },
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

  const push = (
    material: string,
    varian: string,
    berlaku: string,
    perPcs: number,
    satuan: string,
    qty: number,
    tersedia: number
  ) => {
    const total = perPcs * qty;
    const kurang = total > tersedia;
    baris.push({
      material,
      varian,
      berlaku,
      perPcs: `${presisi(perPcs)} ${satuan}`,
      total: `${angka(total)} ${satuan}`,
      fifo: `${angka(tersedia)} ${satuan}`,
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
    const qty = warna.reduce(
      (s, w) => s + w.pcs.filter((p) => p.ukuran === u).reduce((a, p) => a + p.qty, 0),
      0
    );
    push(`Label Size ${u}`, '—', `Size ${u}`, 1, 'pcs', qty, labelTersedia[u] ?? 0);
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
          // 50 pcs x 1.116 = 55.8 m, tersedia 70 m -> cukup.
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
// Vendor-nya di luar negeri (China), jadi tahap Cutting digantikan Invoice
// Logistic — barang datang utuh, tidak dipotong di sini.
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
    stage: 'prepare',
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
