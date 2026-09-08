import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { KATEGORI_VENDOR, SUMBER_PRODUKSI, labelDari } from '@/lib/opsi';

// ===== Tabel Barang Datang (pratinjau) =====
//
// Enam belas kolom sesuai daftar owner 7 September 2026. Data contoh, bukan
// dari database — koneksinya menyusul setelah disetujui.
//
// Modul ini adalah SUMBER untuk dua kolom di Production Fulfillment (tanggal
// terima dan jumlah datang), jadi workcode PDFF di sini harus cocok persis
// dengan yang di tabel itu.

export interface BarisBarangDatang {
  id: number;
  workcodePdff: string;
  namaProduct: string;
  warnaProduct: string;
  sizeProduct: string;
  brand: string;
  sourceProduction: string;
  kategoriVendor: string;
  supplier: string;
  tanggalTerima: string;
  buktiTerima: string | null;
  suratJalan: string | null;
  suratJalanQty: number;
  realTerimaQty: number;
  kondisiTerakhir: string;
  registerStockToPdff: string | null;
  uploadPos: string | null;
}

const barisContoh: BarisBarangDatang[] = [
  {
    id: 1,
    workcodePdff: 'LVU-TOP-11-EBK-B01-PRD',
    namaProduct: 'Rowe Tee',
    warnaProduct: 'Hitam',
    sizeProduct: 'M',
    brand: 'Livou',
    sourceProduction: 'production',
    kategoriVendor: 'konveksi',
    supplier: 'Konveksi Bu Siti',
    tanggalTerima: '2026-09-01',
    buktiTerima: 'contoh',
    suratJalan: 'contoh',
    suratJalanQty: 60,
    realTerimaQty: 60,
    kondisiTerakhir: 'Sesuai',
    registerStockToPdff: 'contoh',
    uploadPos: 'contoh',
  },
  {
    id: 2,
    workcodePdff: 'LVU-TOP-11-EBK-B01-PRD',
    namaProduct: 'Rowe Tee',
    warnaProduct: 'Hitam',
    sizeProduct: 'L',
    brand: 'Livou',
    sourceProduction: 'production',
    kategoriVendor: 'konveksi',
    supplier: 'Konveksi Bu Siti',
    tanggalTerima: '2026-09-01',
    buktiTerima: 'contoh',
    suratJalan: 'contoh',
    // Surat jalan 40, yang datang 38 → selisih 2 pcs. Ini yang membuat
    // "Kesesuaian Real Stock" di tabel PDFF menjadi Tidak Sesuai.
    suratJalanQty: 40,
    realTerimaQty: 38,
    kondisiTerakhir: 'Tidak Sesuai',
    registerStockToPdff: 'contoh',
    uploadPos: null,
  },
  {
    id: 3,
    workcodePdff: 'LVU-DRS-02-CRM-B02-WL',
    namaProduct: 'Midi Dress',
    warnaProduct: 'Cream',
    sizeProduct: 'M',
    brand: 'Livou',
    sourceProduction: 'white_label',
    kategoriVendor: 'china',
    supplier: 'Guangzhou Fashion Co.',
    tanggalTerima: '2026-09-06',
    buktiTerima: 'contoh',
    suratJalan: 'contoh',
    suratJalanQty: 50,
    realTerimaQty: 50,
    kondisiTerakhir: 'Sesuai',
    registerStockToPdff: 'contoh',
    uploadPos: 'contoh',
  },
];

export default function BarangDatang() {
  const kolom: KolomPratinjau<BarisBarangDatang>[] = useMemo(
    () => [
      { key: 'workcodePdff', label: 'Workcode PDFF', value: (r) => r.workcodePdff },
      { key: 'namaProduct', label: 'Nama Product', value: (r) => r.namaProduct, lebar: 'max-w-40' },
      { key: 'warnaProduct', label: 'Warna Product', value: (r) => r.warnaProduct },
      { key: 'sizeProduct', label: 'Size Product', value: (r) => r.sizeProduct },
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
      { key: 'supplier', label: 'Supplier', value: (r) => r.supplier, lebar: 'max-w-40' },
      { key: 'tanggalTerima', label: 'Tanggal Terima', value: (r) => r.tanggalTerima },
      { key: 'buktiTerima', label: 'Bukti Terima', value: (r) => r.buktiTerima, jenis: 'foto' },
      { key: 'suratJalan', label: 'Surat Jalan', value: (r) => r.suratJalan, jenis: 'foto' },
      { key: 'suratJalanQty', label: 'Surat Jalan Qty', value: (r) => r.suratJalanQty, jenis: 'angka' },
      { key: 'realTerimaQty', label: 'Real Terima Qty', value: (r) => r.realTerimaQty, jenis: 'angka' },
      {
        key: 'kondisiTerakhir',
        label: 'Kondisi Terakhir',
        value: (r) => r.kondisiTerakhir,
        jenis: 'badge',
        // Dihitung dari selisih dua kolom sebelumnya, bukan diisi sendiri —
        // menyimpannya terpisah memberi peluang nilainya tidak konsisten.
        warna: (r) => (r.suratJalanQty === r.realTerimaQty ? 'hijau' : 'merah'),
        filterOptions: ['Sesuai', 'Tidak Sesuai'],
      },
      { key: 'registerStockToPdff', label: 'Register Stock to PDFF', value: (r) => r.registerStockToPdff, jenis: 'foto' },
      { key: 'uploadPos', label: 'Upload POS', value: (r) => r.uploadPos, jenis: 'foto' },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Workcode PDFF', get: (r: BarisBarangDatang) => r.workcodePdff },
      { label: 'Nama Product', get: (r: BarisBarangDatang) => r.namaProduct },
      { label: 'Supplier', get: (r: BarisBarangDatang) => r.supplier },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Barang Datang" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari workcode atau produk…"
        itemLabel="penerimaan"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
