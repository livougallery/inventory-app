import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { SIZE, SUMBER_PRODUKSI, WARNA, labelDari } from '@/lib/opsi';

// ===== Tabel Product (pratinjau) =====
//
// Delapan kolom sesuai daftar owner 7 September 2026, direvisi 8 September:
// Source Production ditambah di urutan pertama, dan kolom Variasi (warna +
// size digabung) dipecah jadi Warna dan Size sendiri. Data contoh, bukan dari
// database — koneksinya menyusul setelah disetujui.

export interface BarisProduct {
  id: number;
  sourceProduction: string;
  kode: string;
  nama: string;
  foto: string | null;
  brand: string;
  registerDate: string;
  /**
   * Warna dan size dipisah jadi dua kolom (revisi 8 September 2026).
   * Sebelumnya digabung jadi satu string "Hitam / M" — itu membuat warna
   * tidak bisa difilter atau diurut sendiri, padahal warna dipakai juga di
   * BOM (kolom Applies To).
   */
  warna: string;
  size: string;
}

const barisContoh: BarisProduct[] = [
  {
    id: 1,
    sourceProduction: 'production',
    kode: 'LVU-TOP-11-EBK',
    nama: 'Rowe Tee',
    foto: 'contoh',
    brand: 'Livou',
    registerDate: '2026-08-01',
    warna: 'Hitam',
    size: 'M',
  },
  {
    id: 2,
    sourceProduction: 'white_label',
    kode: 'LVU-TOP-11-EWH',
    nama: 'Rowe Tee',
    foto: 'contoh',
    brand: 'Livou',
    registerDate: '2026-08-01',
    warna: 'Putih',
    size: 'L',
  },
  {
    id: 3,
    sourceProduction: 'production',
    kode: 'LVU-BTM-04-SBK',
    nama: 'Aline Pants',
    foto: null,
    brand: 'Livou',
    registerDate: '2026-08-12',
    warna: 'Hitam',
    size: 'S',
  },
  {
    id: 4,
    sourceProduction: 'white_label',
    kode: 'LVU-DRS-02-CRM',
    nama: 'Midi Dress',
    foto: 'contoh',
    brand: 'Livou',
    registerDate: '2026-09-02',
    warna: 'Cream',
    size: 'M',
  },
];

export default function Product() {
  const kolom: KolomPratinjau<BarisProduct>[] = useMemo(
    () => [
      {
        key: 'sourceProduction',
        label: 'Source Production',
        value: (r) => labelDari(SUMBER_PRODUKSI, r.sourceProduction),
        jenis: 'badge',
        filterOptions: SUMBER_PRODUKSI.map((s) => s.label),
      },
      { key: 'kode', label: 'Kode (SKU)', value: (r) => r.kode },
      { key: 'nama', label: 'Nama', value: (r) => r.nama, lebar: 'max-w-52' },
      { key: 'foto', label: 'Foto', value: (r) => r.foto, jenis: 'foto' },
      { key: 'brand', label: 'Brand', value: (r) => r.brand, filterOptions: ['Livou'] },
      { key: 'registerDate', label: 'Register Date', value: (r) => r.registerDate },
      { key: 'warna', label: 'Warna', value: (r) => r.warna, filterOptions: [...WARNA] },
      { key: 'size', label: 'Size', value: (r) => r.size, filterOptions: [...SIZE] },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Nama', get: (r: BarisProduct) => r.nama },
      { label: 'Kode', get: (r: BarisProduct) => r.kode },
      { label: 'Brand', get: (r: BarisProduct) => r.brand },
      { label: 'Warna', get: (r: BarisProduct) => r.warna },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Product" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari produk…"
        itemLabel="produk"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
