import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { JENIS_MATERIAL, KATEGORI_MATERIAL, SCOPE, labelDari } from '@/lib/opsi';

// ===== Tabel Bill of Material + HPP Production (pratinjau) =====
//
// Revisi 7 September 2026:
//   - "Jumlah per 1 Pcs" → "Qty/Unit"
//   - "Harga per 1 Pcs"  → "FIFO Price/Unit"
//   - Ditambah: Unit, Scope, Applies To, Total Usage, Total Cost
//
// Nama berkas sengaja BomHpp.tsx: BOM.tsx sudah ada (halaman BOM lama), dan
// menimpanya akan menghapus kode yang masih dipakai.

export interface BarisBom {
  id: number;
  workcodePdff: string;
  namaProduct: string;
  // ---- Material (dari tabel Material) ----
  kategori: string;
  kodeMaterial: string;
  jenisMaterial: string;
  namaMaterial: string;
  variasiMaterial: string;
  // ---- Pemakaian ----
  qtyPerUnit: number;
  unit: string;
  scope: string;
  appliesTo: string;
  /** Jumlah varian yang kena aturan ini — dipakai menghitung Total Usage. */
  jumlahVarian: number;
  /** Jumlah pcs produksi untuk workcode ini. */
  jumlahPcs: number;
  fifoPricePerUnit: number;
}

// Satu produk butuh beberapa material — jadi beberapa baris berbagi workcode
// PDFF yang sama. Ini contoh resep Rowe Tee.
//
// Total Usage dan Total Cost DITULIS di contoh ini supaya angkanya bisa
// dilihat, tapi keduanya adalah HASIL HITUNG:
//   Total Usage = Qty/Unit × Jumlah Varian × Jumlah Pcs
//   Total Cost  = Total Usage × FIFO Price/Unit
// Saat koneksi database nanti, keduanya sebaiknya dihitung server. Menyimpannya
// sebagai kolom isian memberi peluang nilainya tidak cocok dengan rumusnya.
const barisContoh: BarisBom[] = [
  {
    id: 1,
    workcodePdff: 'LVU-TOP-11-EBK-B01-PRD',
    namaProduct: 'Rowe Tee',
    kategori: 'fabric',
    kodeMaterial: 'MAT-FAB-001',
    jenisMaterial: 'roll',
    namaMaterial: 'Kain Katun Combed 30s',
    variasiMaterial: 'Hitam',
    qtyPerUnit: 1.5,
    unit: 'yard',
    // Kain dipakai semua varian.
    scope: 'all',
    appliesTo: 'All Variants',
    jumlahVarian: 2,
    jumlahPcs: 100,
    fifoPricePerUnit: 45000,
  },
  {
    id: 2,
    workcodePdff: 'LVU-TOP-11-EBK-B01-PRD',
    namaProduct: 'Rowe Tee',
    kategori: 'accessories',
    kodeMaterial: 'MAT-ACC-014',
    jenisMaterial: 'label',
    namaMaterial: 'Label Livou',
    variasiMaterial: 'Putih',
    qtyPerUnit: 1,
    unit: 'pcs',
    scope: 'all',
    appliesTo: 'All Variants',
    jumlahVarian: 2,
    jumlahPcs: 100,
    fifoPricePerUnit: 2500,
  },
  {
    id: 3,
    workcodePdff: 'LVU-TOP-11-EBK-B01-PRD',
    namaProduct: 'Rowe Tee',
    kategori: 'cmt_cost',
    kodeMaterial: 'MAT-CMT-002',
    jenisMaterial: 'real',
    namaMaterial: 'Ongkos Jahit Konveksi',
    variasiMaterial: '—',
    qtyPerUnit: 1,
    unit: 'pcs',
    // Ongkos jahit hanya untuk size tertentu.
    scope: 'selected',
    appliesTo: 'L',
    jumlahVarian: 1,
    jumlahPcs: 100,
    fifoPricePerUnit: 15000,
  },
  {
    id: 4,
    workcodePdff: 'LVU-DRS-02-CRM-B02-WL',
    namaProduct: 'Midi Dress',
    kategori: 'fabric',
    kodeMaterial: 'MAT-FAB-007',
    jenisMaterial: 'ecer',
    namaMaterial: 'Kain Rayon Ecer',
    variasiMaterial: 'Cream',
    qtyPerUnit: 2.5,
    unit: 'meter',
    scope: 'by_color',
    appliesTo: 'Cream',
    jumlahVarian: 1,
    jumlahPcs: 50,
    fifoPricePerUnit: 38000,
  },
  {
    id: 5,
    workcodePdff: 'LVU-DRS-02-CRM-B02-WL',
    namaProduct: 'Midi Dress',
    kategori: 'accessories',
    kodeMaterial: 'MAT-ACC-021',
    jenisMaterial: 'resleting',
    namaMaterial: 'Resleting YKK No. 5',
    variasiMaterial: 'Cream',
    qtyPerUnit: 1,
    unit: 'pcs',
    scope: 'all',
    appliesTo: 'All Variants',
    jumlahVarian: 1,
    jumlahPcs: 50,
    fifoPricePerUnit: 8000,
  },
];

// Rumus ditulis sekali di sini, dipakai dua kolom terakhir. Kalau rumusnya
// berubah, yang berubah satu fungsi — bukan dua kolom yang bisa berbeda
// pendapat soal cara menghitung.
const hitungTotalUsage = (r: BarisBom) => r.qtyPerUnit * r.jumlahVarian * r.jumlahPcs;
const hitungTotalCost = (r: BarisBom) => hitungTotalUsage(r) * r.fifoPricePerUnit;

export default function BomHpp() {
  // Urutan kolom mengikuti cara membacanya:
  //   1. Identitas (workcode, produk)
  //   2. Material apa
  //   3. Dipakai berapa & untuk siapa (scope)
  //   4. Hasil hitung (total usage, total cost)
  // Hasil hitung sengaja di ujung: itu kesimpulan dari kolom sebelumnya,
  // jadi aneh kalau ditaruh di tengah.
  const kolom: KolomPratinjau<BarisBom>[] = useMemo(
    () => [
      // ---- 1. Identitas ----
      { key: 'workcodePdff', label: 'Workcode PDFF', value: (r) => r.workcodePdff },
      { key: 'namaProduct', label: 'Nama Product', value: (r) => r.namaProduct, lebar: 'max-w-40' },

      // ---- 2. Material ----
      {
        key: 'kategori',
        label: 'Category',
        value: (r) => labelDari(KATEGORI_MATERIAL, r.kategori),
        jenis: 'badge',
        filterOptions: KATEGORI_MATERIAL.map((k) => k.label),
      },
      { key: 'kodeMaterial', label: 'Kode Material', value: (r) => r.kodeMaterial },
      {
        key: 'jenisMaterial',
        label: 'Jenis Material',
        value: (r) => labelDari(JENIS_MATERIAL[r.kategori] ?? [], r.jenisMaterial),
      },
      { key: 'namaMaterial', label: 'Nama Material', value: (r) => r.namaMaterial, lebar: 'max-w-48' },
      { key: 'variasiMaterial', label: 'Variasi Material', value: (r) => r.variasiMaterial },

      // ---- 3. Pemakaian ----
      // Bisa desimal (1.5 yard per pcs), jadi tidak dibulatkan.
      { key: 'qtyPerUnit', label: 'Qty/Unit', value: (r) => r.qtyPerUnit, jenis: 'angka' },
      { key: 'unit', label: 'Unit', value: (r) => r.unit, filterOptions: ['pcs', 'yard', 'kg', 'meter', 'time'] },
      {
        key: 'scope',
        label: 'Scope',
        value: (r) => labelDari(SCOPE, r.scope),
        jenis: 'badge',
        filterOptions: SCOPE.map((s) => s.label),
      },
      // Isinya bergantung Scope: ALL → "All Variants", Selected → size,
      // By Color → warna. Ditampilkan apa adanya, bukan diterjemahkan, supaya
      // aturan yang berlaku terlihat jelas di tabel.
      { key: 'appliesTo', label: 'Applies To', value: (r) => r.appliesTo },
      { key: 'jumlahPcs', label: 'Jumlah Pcs', value: (r) => r.jumlahPcs, jenis: 'angka' },
      { key: 'fifoPricePerUnit', label: 'FIFO Price/Unit', value: (r) => r.fifoPricePerUnit, jenis: 'uang' },

      // ---- 4. Hasil hitung ----
      { key: 'totalUsage', label: 'Total Usage', value: hitungTotalUsage, jenis: 'angka' },
      { key: 'totalCost', label: 'Total Cost', value: hitungTotalCost, jenis: 'uang' },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Workcode PDFF', get: (r: BarisBom) => r.workcodePdff },
      { label: 'Nama Product', get: (r: BarisBom) => r.namaProduct },
      { label: 'Kode Material', get: (r: BarisBom) => r.kodeMaterial },
      { label: 'Nama Material', get: (r: BarisBom) => r.namaMaterial },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Bill of Material + HPP Production" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari workcode atau material…"
        itemLabel="baris BOM"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
