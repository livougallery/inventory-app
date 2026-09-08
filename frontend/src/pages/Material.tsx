import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import {
  FLOW_TRANSAKSI,
  JENIS_MATERIAL,
  KATEGORI_MATERIAL,
  LOKASI,
  PIC,
  SATUAN,
  labelDari,
} from '@/lib/opsi';

// ===== Tabel Material (pratinjau) =====
//
// Enam belas kolom sesuai daftar owner 7 September 2026, diubah urutannya
// 8 September (workcode di kiri, lalu category/jenis/nama/foto). Isinya contoh
// yang diturunkan dari aturan yang disepakati (lihat `barisContoh` di bawah),
// BUKAN data dari database — koneksinya menyusul setelah disetujui.

export interface BarisMaterial {
  id: number;
  tanggal: string;
  kategori: string;
  workcode: string;
  jenis: string;
  nama: string;
  /** Foto material. null = belum ada foto. */
  foto: string | null;
  variasi: string;
  hargaPerUnit: number;
  qty: number;
  unit: string;
  supplier: string;
  /** Nama user yang menginput baris ini. */
  pic: string;
  /** Sumber dana / metode bayar. String kosong = belum diisi. */
  flowTransaction: string;
  lokasi: string;
  /** Foto nota pembelian material. null = belum diunggah. */
  proofOfInvoice: string | null;
  /** Screenshot bukti transfer bank. null = belum diunggah. */
  mutasiSs: string | null;
  /** Tanggal pengecekan finance. String kosong = belum dicek. */
  financeValidation: string;
}

// Baris contoh. Sengaja dibuat mencakup tiap kategori, supaya owner bisa
// melihat bahwa pilihan Jenis BERUBAH mengikuti Kategori — bukan daftar yang
// sama untuk semua baris.
const barisContoh: BarisMaterial[] = [
  {
    id: 1,
    tanggal: '2026-09-01',
    kategori: 'fabric',
    workcode: 'MAT-FAB-001',
    jenis: 'roll',
    nama: 'Kain Katun Combed 30s',
    foto: 'contoh',
    variasi: 'Hitam',
    hargaPerUnit: 45000,
    qty: 12,
    unit: 'yard',
    supplier: 'Toko Kain Makmur',
    pic: 'Rani',
    flowTransaction: 'livou_transfer',
    lokasi: 'Livou HQ Office',
    proofOfInvoice: 'contoh',
    mutasiSs: 'contoh',
    financeValidation: '2026-09-02',
  },
  {
    id: 2,
    tanggal: '2026-09-02',
    kategori: 'accessories',
    workcode: 'MAT-ACC-014',
    jenis: 'kancing',
    nama: 'Kancing Baju Mutu A',
    foto: 'contoh',
    variasi: 'Putih',
    hargaPerUnit: 2500,
    qty: 500,
    unit: 'pcs',
    supplier: 'CV Aksesoris Jaya',
    pic: 'Rani',
    flowTransaction: 'livou_transfer',
    lokasi: 'Livou HQ Office',
    proofOfInvoice: 'contoh',
    // Nota sudah diunggah, tapi bukti transfer menyusul — keadaan wajar di
    // hari belanja: supplier kirim barang dan nota dulu, transfer dicicil.
    mutasiSs: null,
    financeValidation: '',
  },
  {
    id: 3,
    tanggal: '2026-09-03',
    kategori: 'accessories',
    workcode: 'MAT-ACC-021',
    jenis: 'resleting',
    nama: 'Resleting YKK No. 5',
    foto: null,
    variasi: 'Hitam',
    hargaPerUnit: 8000,
    qty: 120,
    unit: 'pcs',
    supplier: 'CV Aksesoris Jaya',
    pic: 'Budi',
    flowTransaction: 'reimbursement',
    lokasi: 'Konveksi',
    proofOfInvoice: 'contoh',
    mutasiSs: 'contoh',
    financeValidation: '2026-09-04',
  },
  {
    id: 4,
    tanggal: '2026-09-04',
    kategori: 'fabric',
    workcode: 'MAT-FAB-007',
    jenis: 'ecer',
    nama: 'Kain Rayon Ecer',
    foto: 'contoh',
    variasi: 'Navy',
    hargaPerUnit: 38000,
    qty: 4,
    unit: 'meter',
    supplier: 'Toko Kain Makmur',
    pic: 'Budi',
    flowTransaction: '',
    lokasi: 'Konveksi',
    proofOfInvoice: null,
    mutasiSs: null,
    financeValidation: '',
  },
  {
    id: 5,
    tanggal: '2026-09-05',
    kategori: 'cmt_cost',
    workcode: 'MAT-CMT-002',
    jenis: 'real',
    nama: 'Ongkos Jahit Konveksi',
    foto: null,
    variasi: '—',
    hargaPerUnit: 15000,
    qty: 60,
    unit: 'pcs',
    supplier: 'Konveksi Bu Siti',
    pic: 'Sari',
    flowTransaction: 'livou_transfer',
    lokasi: 'Konveksi',
    proofOfInvoice: 'contoh',
    mutasiSs: 'contoh',
    financeValidation: '2026-09-06',
  },
  {
    id: 6,
    tanggal: '2026-09-06',
    kategori: 'delivery',
    workcode: 'MAT-DEL-003',
    jenis: 'fabric',
    nama: 'Ongkos Kirim Kain',
    foto: 'contoh',
    variasi: '—',
    hargaPerUnit: 25000,
    qty: 2,
    unit: 'time',
    supplier: 'JNE Express',
    pic: 'Sari',
    flowTransaction: 'reimbursement',
    lokasi: 'Livou HQ Office',
    proofOfInvoice: 'contoh',
    mutasiSs: null,
    financeValidation: '',
  },
  {
    id: 7,
    tanggal: '2026-09-07',
    kategori: 'sample',
    workcode: 'MAT-SMP-001',
    // Sample tidak punya daftar Jenis di spesifikasi — ditampilkan kosong,
    // bukan diisi tebakan.
    jenis: '',
    nama: 'Contoh Bahan untuk Persetujuan',
    foto: null,
    variasi: 'Cream',
    hargaPerUnit: 12000,
    qty: 3,
    unit: 'pcs',
    supplier: 'Toko Kain Makmur',
    pic: 'Rani',
    flowTransaction: '',
    lokasi: 'Livou HQ Office',
    proofOfInvoice: null,
    mutasiSs: null,
    financeValidation: '',
  },
];

export default function Material() {
  const kolom: KolomPratinjau<BarisMaterial>[] = useMemo(
    () => [
      { key: 'tanggal', label: 'Date Transaction', value: (r) => r.tanggal },
      { key: 'workcode', label: 'Workcode', value: (r) => r.workcode },
      {
        key: 'kategori',
        label: 'Category',
        value: (r) => labelDari(KATEGORI_MATERIAL, r.kategori),
        jenis: 'badge',
        filterOptions: KATEGORI_MATERIAL.map((k) => k.label),
      },
      {
        key: 'jenis',
        label: 'Jenis',
        value: (r) => labelDari(JENIS_MATERIAL[r.kategori] ?? [], r.jenis),
      },
      { key: 'nama', label: 'Nama', value: (r) => r.nama, lebar: 'max-w-56' },
      { key: 'foto', label: 'Foto', value: (r) => r.foto, jenis: 'foto' },
      { key: 'variasi', label: 'Variasi', value: (r) => r.variasi },
      { key: 'qty', label: 'Qty', value: (r) => r.qty, jenis: 'angka' },
      { key: 'unit', label: 'Unit', value: (r) => r.unit, filterOptions: [...SATUAN] },
      { key: 'hargaPerUnit', label: 'Price/Unit', value: (r) => r.hargaPerUnit, jenis: 'uang' },
      { key: 'supplier', label: 'Supplier', value: (r) => r.supplier, lebar: 'max-w-44' },
      { key: 'pic', label: 'PIC', value: (r) => r.pic, filterOptions: [...PIC] },
      {
        key: 'flowTransaction',
        label: 'Flow Transaction',
        value: (r) => labelDari(FLOW_TRANSAKSI, r.flowTransaction),
        jenis: 'badge',
        filterOptions: FLOW_TRANSAKSI.map((f) => f.label),
      },
      {
        key: 'lokasi',
        label: 'Lokasi Barang',
        value: (r) => r.lokasi,
        filterOptions: [...LOKASI],
      },
      {
        key: 'proofOfInvoice',
        label: 'Proof of Invoice',
        value: (r) => r.proofOfInvoice,
        jenis: 'foto',
      },
      { key: 'mutasiSs', label: 'Mutasi SS', value: (r) => r.mutasiSs, jenis: 'foto' },
      {
        key: 'financeValidation',
        label: 'Finance Validation',
        value: (r) => r.financeValidation,
        jenis: 'tanggal',
      },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Nama', get: (r: BarisMaterial) => r.nama },
      { label: 'Workcode', get: (r: BarisMaterial) => r.workcode },
      { label: 'Supplier', get: (r: BarisMaterial) => r.supplier },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Material" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari material…"
        itemLabel="material"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
