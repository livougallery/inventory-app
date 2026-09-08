import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { FLOW_TRANSAKSI, KATEGORI_VENDOR, SOLUSI, SUMBER_PRODUKSI, labelDari } from '@/lib/opsi';

// ===== Tabel Production Fulfillment (pratinjau) =====
//
// Empat puluh kolom sesuai daftar owner 7 September 2026 — modul terbesar.
// Data contoh, bukan dari database; koneksinya menyusul setelah disetujui.
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

export default function ProductionFulfillment() {
  const kolom: KolomPratinjau<BarisPdff>[] = useMemo(
    () => [
      // ---- Identitas ----
      { key: 'workcodePdff', label: 'Workcode PDFF', value: (r) => r.workcodePdff },
      { key: 'productName', label: 'Product Name', value: (r) => r.productName, lebar: 'max-w-44' },
      { key: 'fotoProduct', label: 'Foto Product', value: (r) => r.fotoProduct, jenis: 'foto' },
      { key: 'batch', label: 'Batch', value: (r) => r.batch },
      { key: 'dateRequest', label: 'Date Request', value: (r) => r.dateRequest },
      { key: 'brand', label: 'Brand', value: (r) => r.brand, filterOptions: ['Livou'] },
      {
        key: 'sourceProduction',
        label: 'Source Production',
        value: (r) => labelDari(SUMBER_PRODUKSI, r.sourceProduction),
        jenis: 'badge',
        filterOptions: SUMBER_PRODUKSI.map((s) => s.label),
      },
      {
        key: 'kategoriVendor',
        label: 'Kategori Vendor',
        value: (r) => labelDari(KATEGORI_VENDOR[r.sourceProduction] ?? [], r.kategoriVendor),
      },
      { key: 'namaVendor', label: 'Nama Vendor', value: (r) => r.namaVendor, lebar: 'max-w-40' },
      { key: 'skuDesign', label: 'SKU Design', value: (r) => r.skuDesign },
      { key: 'pic', label: 'PIC', value: (r) => r.pic },

      // ---- Dokumen rencana & cutting ----
      { key: 'proofRegisterPlanPdff', label: 'Proof Register Plan PDFF', value: (r) => r.proofRegisterPlanPdff, jenis: 'foto' },
      { key: 'suratJalan', label: 'Surat Jalan', value: (r) => r.suratJalan, jenis: 'foto' },
      { key: 'buktiCuttingVendor', label: 'Bukti Cutting Vendor', value: (r) => r.buktiCuttingVendor, jenis: 'foto' },
      { key: 'cuttingTotalPcs', label: 'Cutting Total Pcs', value: (r) => r.cuttingTotalPcs, jenis: 'angka' },
      { key: 'registerCuttingPdff', label: 'Register Cutting PDFF', value: (r) => r.registerCuttingPdff, jenis: 'foto' },

      // ---- Logistik (dari tabel White Label) ----
      { key: 'kodeShipmentLivou', label: 'Kode Shipment Livou', value: (r) => r.kodeShipmentLivou },
      { key: 'dateInvoiceLogistic', label: 'Date Invoice Logistic', value: (r) => r.dateInvoiceLogistic },
      { key: 'invoiceLogistic', label: 'Invoice Logistic', value: (r) => r.invoiceLogistic, jenis: 'foto' },
      { key: 'proofPaymentLogistic', label: 'Proof Payment Logistic', value: (r) => r.proofPaymentLogistic, jenis: 'foto' },

      // ---- Penerimaan (dari tabel Barang Datang) ----
      { key: 'tanggalTerima', label: 'Tanggal Terima', value: (r) => r.tanggalTerima },
      { key: 'jumlahDatang', label: 'Jumlah Datang', value: (r) => r.jumlahDatang, jenis: 'angka' },
      { key: 'totalRealPcs', label: 'Total Real Pcs', value: (r) => r.totalRealPcs, jenis: 'angka' },
      {
        key: 'kesesuaianRealStock',
        label: 'Kesesuaian Real Stock',
        value: (r) => r.kesesuaianRealStock,
        jenis: 'badge',
        warna: (r) => (r.kesesuaianRealStock === 'Sesuai' ? 'hijau' : 'merah'),
        filterOptions: ['Sesuai', 'Tidak Sesuai'],
      },
      {
        key: 'solution',
        label: 'Solution',
        value: (r) => labelDari(SOLUSI, r.solution),
        filterOptions: SOLUSI.map((s) => s.label),
      },
      { key: 'logSolution', label: 'Log Solution', value: (r) => r.logSolution, lebar: 'max-w-56' },

      // ---- Pembayaran produk ----
      { key: 'dateInvoiceProduct', label: 'Date Invoice Product', value: (r) => r.dateInvoiceProduct },
      { key: 'invoiceProduct', label: 'Invoice Product', value: (r) => r.invoiceProduct, jenis: 'foto' },
      {
        key: 'flowTransaction',
        label: 'Flow Transaction',
        value: (r) => labelDari(FLOW_TRANSAKSI, r.flowTransaction),
        jenis: 'badge',
        filterOptions: FLOW_TRANSAKSI.map((f) => f.label),
      },
      { key: 'proofPaymentProduct', label: 'Proof Payment Product', value: (r) => r.proofPaymentProduct, jenis: 'foto' },
      { key: 'proofReimburse', label: 'Proof Reimburse / Adjustment', value: (r) => r.proofReimburse, jenis: 'foto' },

      // ---- HPP & harga jual ----
      { key: 'proofKalkulasiHpp', label: 'Proof Kalkulasi HPP', value: (r) => r.proofKalkulasiHpp, jenis: 'foto' },
      { key: 'hpp', label: 'HPP', value: (r) => r.hpp, jenis: 'uang' },
      { key: 'proofKalkulasiSellingPrice', label: 'Proof Kalkulasi Selling Price', value: (r) => r.proofKalkulasiSellingPrice, jenis: 'foto' },
      { key: 'sellingPrice', label: 'Selling Price', value: (r) => r.sellingPrice, jenis: 'uang' },

      // ---- Upload & validasi ----
      { key: 'proofUploadEcommerce', label: 'Proof Upload E-commerce', value: (r) => r.proofUploadEcommerce, jenis: 'foto' },
      { key: 'jumlahUploadPos', label: 'Jumlah Upload POS', value: (r) => r.jumlahUploadPos, jenis: 'angka' },
      { key: 'uploadPos', label: 'Upload POS', value: (r) => r.uploadPos, jenis: 'foto' },
      { key: 'financeValidateProducts', label: 'Finance Validate Products', value: (r) => r.financeValidateProducts, jenis: 'tanggal' },
      { key: 'financeValidateLogistics', label: 'Finance Validate Logistics', value: (r) => r.financeValidateLogistics, jenis: 'tanggal' },
    ],
    []
  );

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
      <BannerPratinjau modul="Production Fulfillment" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari workcode PDFF…"
        itemLabel="PDFF"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
