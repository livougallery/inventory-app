import { useMemo, useState } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FLOW_TRANSAKSI, KATEGORI_VENDOR, SOLUSI, SUMBER_PRODUKSI, labelDari } from '@/lib/opsi';

// ===== Tabel Production Fulfillment (pratinjau) =====
//
// Empat puluh kolom sesuai daftar owner 7 September 2026 — modul terbesar.
// Data contoh, bukan dari database; koneksinya menyusul setelah disetujui.
//
// Halaman ini SENGAJA hanya berisi tabel. Papan kanban-nya dipindah ke
// PROGRESS > Production Fulfillment (lihat `PapanProduksi.tsx`), karena
// keduanya menjawab pertanyaan yang berbeda dan selama satu halaman papan
// selalu jadi tampilan kedua. Saklar "Kanban / Tabel" yang dulu ada di sini
// ikut dihapus bersama pemindahan itu — dibiarkan, ia jadi tombol yang
// memindahkan pembaca ke halaman lain tanpa memberitahu.
//
// Banyak kolom di sini ditandai "ambil dari tabel X" pada spesifikasi owner.
// Di tahap pratinjau semuanya diisi contoh. Saat koneksi dikerjakan nanti,
// kolom-kolom itu harus jadi relasi (bukan salinan teks), kalau tidak nilainya
// akan usang begitu data asalnya diubah.

export interface BarisPdff {
  id: number;
  workcodePdff: string;
  productName: string;
  fotoProduct: string | null;
  batch: string;
  dateRequest: string;
  brand: string;
  sourceProduction: string;
  kategoriVendor: string;
  namaVendor: string;
  skuDesign: string;
  pic: string;
  proofRegisterPlanPdff: string | null;
  suratJalan: string | null;
  buktiCuttingVendor: string | null;
  cuttingTotalPcs: number;
  registerCuttingPdff: string | null;
  kodeShipmentLivou: string;
  dateInvoiceLogistic: string;
  invoiceLogistic: string | null;
  proofPaymentLogistic: string | null;
  tanggalTerima: string;
  jumlahDatang: number;
  totalRealPcs: number;
  kesesuaianRealStock: string;
  solution: string;
  logSolution: string;
  dateInvoiceProduct: string;
  invoiceProduct: string | null;
  flowTransaction: string;
  proofPaymentProduct: string | null;
  proofReimburse: string | null;
  proofKalkulasiHpp: string | null;
  hpp: number;
  proofKalkulasiSellingPrice: string | null;
  sellingPrice: number;
  proofUploadEcommerce: string | null;
  jumlahUploadPos: number;
  uploadPos: string | null;
  /** Tanggal pengecekan finance atas produk. String kosong = belum dicek. */
  financeValidateProducts: string;
  /** Tanggal pengecekan finance atas logistik. String kosong = belum dicek. */
  financeValidateLogistics: string;
}

// Workcode PDFF = gabungan SKU + batch + kode sumber produksi, sesuai
// spesifikasi owner. Ditulis lengkap di contoh supaya wujudnya bisa dinilai.
const barisContoh: BarisPdff[] = [
  {
    id: 1,
    workcodePdff: 'LVU-TOP-11-EBK-B01-PRD',
    productName: 'Rowe Tee',
    fotoProduct: 'contoh',
    batch: 'B01',
    dateRequest: '2026-08-15',
    brand: 'Livou',
    sourceProduction: 'production',
    kategoriVendor: 'konveksi',
    namaVendor: 'Konveksi Bu Siti',
    skuDesign: 'LVU-TOP-11-EBK',
    pic: 'Admin Utama',
    proofRegisterPlanPdff: 'contoh',
    suratJalan: 'contoh',
    buktiCuttingVendor: 'contoh',
    cuttingTotalPcs: 100,
    registerCuttingPdff: 'contoh',
    kodeShipmentLivou: '—',
    dateInvoiceLogistic: '—',
    invoiceLogistic: null,
    proofPaymentLogistic: null,
    tanggalTerima: '2026-09-01',
    jumlahDatang: 2,
    totalRealPcs: 98,
    // Cutting 100 pcs, yang datang 98 → tidak sesuai.
    kesesuaianRealStock: 'Tidak Sesuai',
    solution: 'resent_stock',
    logSolution: 'Kekurangan 2 pcs dikirim menyusul minggu depan.',
    dateInvoiceProduct: '2026-09-01',
    invoiceProduct: 'contoh',
    flowTransaction: 'livou_transfer',
    proofPaymentProduct: 'contoh',
    proofReimburse: null,
    proofKalkulasiHpp: 'contoh',
    hpp: 78000,
    proofKalkulasiSellingPrice: 'contoh',
    sellingPrice: 189000,
    proofUploadEcommerce: 'contoh',
    jumlahUploadPos: 98,
    uploadPos: 'contoh',
    financeValidateProducts: '2026-09-05',
    financeValidateLogistics: '2026-09-06',
  },
  {
    id: 2,
    workcodePdff: 'LVU-DRS-02-CRM-B02-WL',
    productName: 'Midi Dress',
    fotoProduct: 'contoh',
    batch: 'B02',
    dateRequest: '2026-08-20',
    brand: 'Livou',
    sourceProduction: 'white_label',
    kategoriVendor: 'china',
    namaVendor: 'Guangzhou Fashion Co.',
    skuDesign: 'LVU-DRS-02-CRM',
    pic: 'Finance',
    proofRegisterPlanPdff: 'contoh',
    suratJalan: 'contoh',
    buktiCuttingVendor: null,
    cuttingTotalPcs: 50,
    registerCuttingPdff: 'contoh',
    kodeShipmentLivou: 'SH-CN-2609-002',
    dateInvoiceLogistic: '2026-09-03',
    invoiceLogistic: 'contoh',
    proofPaymentLogistic: 'contoh',
    tanggalTerima: '2026-09-06',
    jumlahDatang: 1,
    totalRealPcs: 50,
    kesesuaianRealStock: 'Sesuai',
    // Sesuai spesifikasi: solution boleh kosong kalau aman.
    solution: '',
    logSolution: '',
    dateInvoiceProduct: '2026-09-04',
    invoiceProduct: 'contoh',
    flowTransaction: 'reimbursement',
    proofPaymentProduct: 'contoh',
    proofReimburse: 'contoh',
    proofKalkulasiHpp: 'contoh',
    hpp: 132000,
    proofKalkulasiSellingPrice: 'contoh',
    sellingPrice: 299000,
    proofUploadEcommerce: null,
    jumlahUploadPos: 0,
    uploadPos: null,
    financeValidateProducts: '',
    financeValidateLogistics: '2026-09-06',
  },
];

// ===== Definisi kolom: SATU sumber, dipakai semua stage =====
//
// Stage cuma memilih dan mengurutkan ulang dari peta ini — tidak ada satu pun
// stage yang mendefinisikan kolomnya sendiri. Alasannya bukan sekadar hemat
// baris: kalau tiap stage menulis "Invoicelogistic" dan "Invoice logistic"
// sendiri, maka label, jenis (foto/uang/badge), dan daftar filternya bisa
// berbeda antar tab. Pemilik akan melihat kolom yang sama tampil beda di dua
// stage, dan filter yang diisi di satu tab tidak cocok dengan tab lainnya.
//
// Konsekuensinya: menambah kolom dilakukan sekali di sini, lalu disebut namanya
// di stage yang memerlukannya.
const KOLOM: Record<string, KolomPratinjau<BarisPdff>> = {
  // ---- Identitas ----
  workcodePdff: { key: 'workcodePdff', label: 'Workcode PDFF', value: (r) => r.workcodePdff },
  productName: { key: 'productName', label: 'Product Name', value: (r) => r.productName, lebar: 'max-w-44' },
  fotoProduct: { key: 'fotoProduct', label: 'Photo Product', value: (r) => r.fotoProduct, jenis: 'foto' },
  batch: { key: 'batch', label: 'Batch', value: (r) => r.batch },
  dateRequest: { key: 'dateRequest', label: 'Date Request', value: (r) => r.dateRequest },
  brand: { key: 'brand', label: 'Brand', value: (r) => r.brand, filterOptions: ['Livou'] },
  sourceProduction: {
    key: 'sourceProduction',
    label: 'Source Production',
    value: (r) => labelDari(SUMBER_PRODUKSI, r.sourceProduction),
    jenis: 'badge',
    filterOptions: SUMBER_PRODUKSI.map((s) => s.label),
  },
  kategoriVendor: {
    key: 'kategoriVendor',
    label: 'Kategori Vendor',
    value: (r) => labelDari(KATEGORI_VENDOR[r.sourceProduction] ?? [], r.kategoriVendor),
  },
  namaVendor: { key: 'namaVendor', label: 'Nama Vendor', value: (r) => r.namaVendor, lebar: 'max-w-40' },
  skuDesign: { key: 'skuDesign', label: 'SKU Design', value: (r) => r.skuDesign },
  pic: { key: 'pic', label: 'PIC', value: (r) => r.pic },

  // ---- Dokumen rencana & cutting ----
  proofRegisterPlanPdff: { key: 'proofRegisterPlanPdff', label: 'Proof Register Plan PDFF', value: (r) => r.proofRegisterPlanPdff, jenis: 'foto' },
  suratJalan: { key: 'suratJalan', label: 'Surat Jalan', value: (r) => r.suratJalan, jenis: 'foto' },
  buktiCuttingVendor: { key: 'buktiCuttingVendor', label: 'Bukti Cutting Vendor', value: (r) => r.buktiCuttingVendor, jenis: 'foto' },
  cuttingTotalPcs: { key: 'cuttingTotalPcs', label: 'Cutting Total Pcs', value: (r) => r.cuttingTotalPcs, jenis: 'angka' },
  registerCuttingPdff: { key: 'registerCuttingPdff', label: 'Register Cutting PDFF', value: (r) => r.registerCuttingPdff, jenis: 'foto' },

  // ---- Logistik (dari tabel White Label) ----
  kodeShipmentLivou: { key: 'kodeShipmentLivou', label: 'Kode Shipment Livou', value: (r) => r.kodeShipmentLivou },
  dateInvoiceLogistic: { key: 'dateInvoiceLogistic', label: 'Date Invoice Logistic', value: (r) => r.dateInvoiceLogistic },
  invoiceLogistic: { key: 'invoiceLogistic', label: 'Invoice Logistic', value: (r) => r.invoiceLogistic, jenis: 'foto' },
  proofPaymentLogistic: { key: 'proofPaymentLogistic', label: 'Proof Payment Logistic', value: (r) => r.proofPaymentLogistic, jenis: 'foto' },

  // ---- Penerimaan (dari tabel Barang Datang) ----
  tanggalTerima: { key: 'tanggalTerima', label: 'Tanggal Terima', value: (r) => r.tanggalTerima },
  jumlahDatang: { key: 'jumlahDatang', label: 'Jumlah Datang', value: (r) => r.jumlahDatang, jenis: 'angka' },
  totalRealPcs: { key: 'totalRealPcs', label: 'Total Real Pcs', value: (r) => r.totalRealPcs, jenis: 'angka' },
  kesesuaianRealStock: {
    key: 'kesesuaianRealStock',
    label: 'Kesesuaian Real Stock',
    value: (r) => r.kesesuaianRealStock,
    jenis: 'badge',
    warna: (r) => (r.kesesuaianRealStock === 'Sesuai' ? 'hijau' : 'merah'),
    filterOptions: ['Sesuai', 'Tidak Sesuai'],
  },
  solution: {
    key: 'solution',
    label: 'Solution',
    value: (r) => labelDari(SOLUSI, r.solution),
    filterOptions: SOLUSI.map((s) => s.label),
  },
  logSolution: { key: 'logSolution', label: 'Log Solution', value: (r) => r.logSolution, lebar: 'max-w-56' },

  // ---- Pembayaran produk ----
  dateInvoiceProduct: { key: 'dateInvoiceProduct', label: 'Date Invoice Product', value: (r) => r.dateInvoiceProduct },
  invoiceProduct: { key: 'invoiceProduct', label: 'Invoice Product', value: (r) => r.invoiceProduct, jenis: 'foto' },
  flowTransaction: {
    key: 'flowTransaction',
    label: 'Flow Transaction',
    value: (r) => labelDari(FLOW_TRANSAKSI, r.flowTransaction),
    jenis: 'badge',
    filterOptions: FLOW_TRANSAKSI.map((f) => f.label),
  },
  proofPaymentProduct: { key: 'proofPaymentProduct', label: 'Proof Payment Product', value: (r) => r.proofPaymentProduct, jenis: 'foto' },
  proofReimburse: { key: 'proofReimburse', label: 'Proof Reimburse / Adjustment', value: (r) => r.proofReimburse, jenis: 'foto' },

  // ---- HPP & harga jual ----
  proofKalkulasiHpp: { key: 'proofKalkulasiHpp', label: 'Proof Kalkulasi HPP', value: (r) => r.proofKalkulasiHpp, jenis: 'foto' },
  hpp: { key: 'hpp', label: 'HPP', value: (r) => r.hpp, jenis: 'uang' },
  proofKalkulasiSellingPrice: { key: 'proofKalkulasiSellingPrice', label: 'Proof Kalkulasi Selling Price', value: (r) => r.proofKalkulasiSellingPrice, jenis: 'foto' },
  sellingPrice: { key: 'sellingPrice', label: 'Selling Price', value: (r) => r.sellingPrice, jenis: 'uang' },

  // ---- Upload & validasi ----
  proofUploadEcommerce: { key: 'proofUploadEcommerce', label: 'Proof Upload E-commerce', value: (r) => r.proofUploadEcommerce, jenis: 'foto' },
  jumlahUploadPos: { key: 'jumlahUploadPos', label: 'Jumlah Upload POS', value: (r) => r.jumlahUploadPos, jenis: 'angka' },
  uploadPos: { key: 'uploadPos', label: 'Upload POS', value: (r) => r.uploadPos, jenis: 'foto' },
  financeValidateProducts: { key: 'financeValidateProducts', label: 'Finance Validate Products', value: (r) => r.financeValidateProducts, jenis: 'tanggal' },
  financeValidateLogistics: { key: 'financeValidateLogistics', label: 'Finance Validate Logistics', value: (r) => r.financeValidateLogistics, jenis: 'tanggal' },
};

// ===== Daftar stage =====
//
// Satu baris PDFF melewati semua stage ini — stage BUKAN filter yang
// memecah data. Jadi setiap stage memakai baris yang SAMA (`barisContoh`);
// yang berubah hanya kolom mana yang ditampilkan.
//
// ID stage di sini SAMA dengan id kolom di papan kanban (lihat
// `PAPAN_PRODUCTION` di pages/production-fulfillment/data-kanban.ts). Versi
// sebelumnya memakai kosakata sendiri — 'terima-stock', 'calculate-hpp',
// 'upload-system' — untuk pekerjaan yang di papan bernama 'receive',
// 'hpp-price', 'upload'. Karena tabel dan papan kini dua halaman terpisah,
// divergensinya tidak terlihat dari layar: satu pekerjaan punya dua nama
// tergantung halaman mana yang dibuka. Menyamakan id-nya membuat keduanya
// bisa disambungkan ke satu tabel stage tanpa penerjemahan.
//
// Catatan kolom: stage 3 (Cutting) dan stage 5 (Laporan Terima Stock)
// sama-sama menyebut "Register Plan PDFF". Keduanya memakai
// `proofRegisterPlanPdff` — kolom bukti unggah yang juga dipakai stage 2. Jadi
// "Proof Register Plan PDFF" di stage 2 dan "Register Plan PDFF" di stage 3
// adalah kolom yang sama; hanya penyebutannya di daftar owner yang berbeda.
export interface StagePdff {
  id: string;
  label: string;
  ikon: string;
  kunciKolom: string[];
}

const STAGE: StagePdff[] = [
  {
    id: 'propose',
    label: 'Propose Fulfillment',
    ikon: '📜',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'dateRequest', 'pic', 'brand',
      'sourceProduction', 'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
    ],
  },
  {
    id: 'prepare',
    label: 'Prepare Production',
    ikon: '🗃️',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'proofRegisterPlanPdff', 'suratJalan',
    ],
  },
  {
    id: 'cutting',
    label: 'Cutting',
    ikon: '✂️',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'proofRegisterPlanPdff', 'buktiCuttingVendor', 'cuttingTotalPcs', 'registerCuttingPdff',
    ],
  },
  {
    id: 'invoice-logistic',
    label: 'Invoice - Logistic',
    ikon: '✈️',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'kodeShipmentLivou', 'dateInvoiceLogistic', 'invoiceLogistic', 'proofPaymentLogistic',
    ],
  },
  {
    // `receive`, bukan `terima-stock`: id-nya milik domain yang sama dengan
    // kolom 'Receive' di papan. Labelnya tetap kata owner untuk halaman ini.
    id: 'receive',
    label: 'Laporan Terima Stock',
    ikon: '📦',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'proofRegisterPlanPdff', 'cuttingTotalPcs', 'registerCuttingPdff', 'kodeShipmentLivou',
      'tanggalTerima', 'jumlahDatang', 'totalRealPcs', 'kesesuaianRealStock',
      'logSolution', 'solution',
    ],
  },
  {
    id: 'invoice-product',
    label: 'Invoice - Product',
    ikon: '👚',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'kodeShipmentLivou', 'solution',
      'dateInvoiceProduct', 'invoiceProduct', 'proofPaymentProduct',
      'flowTransaction', 'proofReimburse',
    ],
  },
  {
    // `hpp-price`, bukan `calculate-hpp` — id kolom 'HPP & Price' di papan.
    id: 'hpp-price',
    label: 'Calculate HPP & Price',
    ikon: '🧮',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'invoiceLogistic', 'proofPaymentLogistic', 'kodeShipmentLivou', 'solution',
      'invoiceProduct', 'proofPaymentProduct',
      'proofKalkulasiHpp', 'hpp', 'proofKalkulasiSellingPrice', 'sellingPrice',
    ],
  },
  {
    // `upload`, bukan `upload-system` — id kolom 'Upload' di papan.
    id: 'upload',
    label: 'Upload System',
    ikon: '💻',
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'kodeShipmentLivou', 'solution',
      'proofKalkulasiHpp', 'hpp', 'proofKalkulasiSellingPrice', 'sellingPrice',
      'proofUploadEcommerce', 'jumlahUploadPos', 'uploadPos',
    ],
  },
  {
    id: 'finance-validate',
    label: 'Finance Validate',
    ikon: '✅',
    // Sengaja diletakkan terakhir, meski pemeriksaan finance atas invoice
    // sebenarnya terjadi saat stage 4 dan 6 berjalan. Ini tampilan untuk
    // meninjau yang SUDAH diperiksa, bukan tahap yang dikerjakan belakangan.
    //
    // Sembilan kolom pertamanya blok identitas yang sama dengan stage lain —
    // sengaja diulang, karena tanpa workcode dan nama vendor, dua tanggal
    // validasi di sini tidak bisa diketahui milik baris yang mana.
    kunciKolom: [
      'productName', 'fotoProduct', 'batch', 'pic', 'dateRequest',
      'kategoriVendor', 'namaVendor', 'skuDesign', 'workcodePdff',
      'financeValidateProducts', 'financeValidateLogistics',
    ],
  },
];

export default function ProductionFulfillment() {
  const [stageAktif, setStageAktif] = useState(STAGE[0].id);

  const searchFields = useMemo(
    () => [
      { label: 'Workcode PDFF', get: (r: BarisPdff) => r.workcodePdff },
      { label: 'Product Name', get: (r: BarisPdff) => r.productName },
      { label: 'SKU Design', get: (r: BarisPdff) => r.skuDesign },
      { label: 'Nama Vendor', get: (r: BarisPdff) => r.namaVendor },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Production Fulfillment" jumlahKolom={Object.keys(KOLOM).length} />

      <Tabs value={stageAktif} onValueChange={setStageAktif}>
        {/* Tab digulir horizontal, tidak dibungkus: delapan stage dengan emoji
            dan nama panjang akan memakan tiga baris kalau dibungkus, dan
            urutannya — yang merupakan urutan kerja — jadi sulit dibaca. */}
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          {STAGE.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="shrink-0 gap-1.5">
              <span aria-hidden="true">{s.ikon}</span>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STAGE.map((s) => (
          <TabsContent key={s.id} value={s.id}>
            <StagePdffTable stage={s} searchFields={searchFields} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Satu tabel per stage.
 *
 * `key` disetel ke id stage dengan sengaja: ini yang membuat filter, urutan,
 * dan kolom yang disembunyikan kembali ke keadaan awal setiap kali tab diganti.
 * Tanpanya, TanStack mempertahankan state tabel dari stage sebelumnya — jadi
 * filter "Kategori Vendor = Konveksi" yang diisi di stage 1 ikut terbawa ke
 * stage 4, tempat kolom itu tidak ada lagi dan filternya bekerja tanpa terlihat.
 */
function StagePdffTable({
  stage,
  searchFields,
}: {
  stage: StagePdff;
  searchFields: { label: string; get: (row: BarisPdff) => string }[];
}) {
  // SEMUA 40 kolom diteruskan, bukan cuma milik stage ini.
  //
  // Alasannya dropdown "Kolom": isinya diambil dari kolom yang diteruskan ke
  // tabel. Kalau yang diteruskan hanya kolom stage, maka dropdown itu cuma
  // berisi kolom yang sudah tampil — jadi tombol "Kolom" jadi tidak berguna,
  // dan kolom di luar stage tidak bisa dimunculkan dari UI sama sekali.
  //
  // Dengan semua kolom diteruskan, dropdown-nya lengkap 40; yang tampil di
  // tabel tinggal yang disebut `kunciKolomAktif`. Pemilik bisa mencentang
  // kolom lain kapan saja tanpa ganti stage.
  const kolom = useMemo(() => Object.values(KOLOM), []);

  return (
    <TabelPratinjau
      key={stage.id}
      rows={barisContoh}
      columns={kolom}
      searchFields={searchFields}
      kunciKolomAktif={stage.kunciKolom}
      searchPlaceholder="Cari workcode PDFF…"
      // Nama berkas ekspor ikut menyebut stage: delapan stage menghasilkan
      // berkas yang isinya berbeda, jadi "export-PDFF-2026-09-10.csv" dari dua
      // stage yang berbeda akan saling menimpa.
      itemLabel={`PDFF-${stage.id}`}
      rowKey={(r) => r.id}
    />
  );
}
