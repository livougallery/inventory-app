import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { MATA_UANG } from '@/lib/opsi';

// ===== Tabel HPP White Label (pratinjau) =====
//
// Revisi 7 September 2026:
//   - Kolom "Total Design" DIHAPUS. Satu baris = satu design, jadi kolom itu
//     selalu bernilai 1 untuk tiap baris dan tidak menambah informasi.
//     Konsekuensinya nilai logistik (Price/kg, Total kg, Total Payment
//     Logistic) memang BERULANG antar baris dalam satu shipment — itu wajar
//     dan tidak apa-apa: secarig logistik itu nota yang sama. Saat koneksi
//     database nanti, kolom logistik sebaiknya tetap disimpan di tabel
//     terpisah (per shipment) lalu digabung saat dibaca, BUKAN disalin ke
//     tiap baris — supaya koreksi satu kali langsung berlaku ke semua baris.
//   - Ditambah: Currency, Actual IDR Paid (logistik), Actual IDR Paid (produk).
//   - Ditambah: Proof Nota dan Proof Payment, pola sama dengan Production
//     Fulfillment (dua kolom bukti: dokumen dan pembayaran).
//
// Nama berkas sengaja HppPratinjau.tsx, bukan Hpp.tsx: di sistem berkas yang
// tidak membedakan huruf besar-kecil (Windows), "Hpp.tsx" dan "HPP.tsx" adalah
// berkas yang SAMA. Menulis ke Hpp.tsx pernah menimpa halaman HPP lama dan
// menghapus 255 baris kode yang masih dipakai.
//
// Catatan untuk step koneksi nanti: HPP Final/pcs adalah HASIL hitung dari
// logistik + produk + kurs, jadi sebaiknya dihitung server. Menghitungnya di
// klien berarti dua tempat bisa menghasilkan angka berbeda.

export interface BarisHpp {
  id: number;
  // ---- Logistik (satu nota per shipment; berulang antar baris) ----
  codeShipment: string;
  currency: string;
  pricePerKg: number;
  totalKg: number;
  totalPaymentLogistic: number;
  actualIdrPaidLogistic: number;
  proofNotaLogistic: string | null;
  proofPaymentLogistic: string | null;
  // ---- Supplier & produk (satu baris = satu design) ----
  namaSupplier: string;
  totalPcs: number;
  totalPrice: number;
  actualIdrPaidProduct: number;
  skuSupplier: string;
  proofNotaProduct: string | null;
  proofPaymentProduct: string | null;
  // ---- Produk ----
  /** Workcode PDFF — penanda batch produksi. Sebelumnya bernama SKU Product. */
  workcodePdff: string;
  namaProduct: string;
  pcs: number;
  pricePerPcs: number;
  kurs: number;
  gramPerPcs: number;
  hppFinalPerPcs: number;
}

const barisContoh: BarisHpp[] = [
  {
    id: 1,
    // Baris 1 dan 2 berbagi shipment yang sama → nilai logistiknya identik.
    codeShipment: 'SH-CN-2609-002',
    currency: 'CNY',
    pricePerKg: 28000,
    totalKg: 12.5,
    totalPaymentLogistic: 350000,
    actualIdrPaidLogistic: 350000,
    proofNotaLogistic: 'contoh',
    proofPaymentLogistic: 'contoh',
    namaSupplier: 'Guangzhou Fashion Co.',
    totalPcs: 80,
    totalPrice: 4200,
    actualIdrPaidProduct: 9450000,
    skuSupplier: 'GF-MD-2201',
    proofNotaProduct: 'contoh',
    proofPaymentProduct: 'contoh',
    workcodePdff: 'LVU-DRS-02-CRM-B01-WL',
    namaProduct: 'Midi Dress',
    pcs: 50,
    pricePerPcs: 52,
    kurs: 2250,
    gramPerPcs: 250,
    hppFinalPerPcs: 132000,
  },
  {
    id: 2,
    codeShipment: 'SH-CN-2609-002',
    currency: 'CNY',
    pricePerKg: 28000,
    totalKg: 12.5,
    totalPaymentLogistic: 350000,
    actualIdrPaidLogistic: 350000,
    proofNotaLogistic: 'contoh',
    proofPaymentLogistic: 'contoh',
    namaSupplier: 'Guangzhou Fashion Co.',
    totalPcs: 80,
    totalPrice: 4200,
    actualIdrPaidProduct: 9450000,
    skuSupplier: 'GF-TP-1180',
    proofNotaProduct: 'contoh',
    proofPaymentProduct: 'contoh',
    workcodePdff: 'LVU-TOP-11-EBK-B02-WL',
    namaProduct: 'Rowe Tee',
    pcs: 30,
    pricePerPcs: 42,
    kurs: 2250,
    gramPerPcs: 200,
    hppFinalPerPcs: 118000,
  },
  {
    id: 3,
    codeShipment: 'SH-TH-2609-001',
    currency: 'THB',
    pricePerKg: 31000,
    totalKg: 8,
    totalPaymentLogistic: 248000,
    actualIdrPaidLogistic: 248000,
    proofNotaLogistic: 'contoh',
    proofPaymentLogistic: null,
    namaSupplier: 'Bangkok Apparel Ltd.',
    totalPcs: 60,
    totalPrice: 18500,
    actualIdrPaidProduct: 8880000,
    skuSupplier: 'BA-TP-0912',
    proofNotaProduct: 'contoh',
    proofPaymentProduct: 'contoh',
    workcodePdff: 'LVU-TOP-11-EBK-B02-WL',
    namaProduct: 'Rowe Tee',
    pcs: 60,
    pricePerPcs: 95,
    kurs: 480,
    gramPerPcs: 200,
    hppFinalPerPcs: 78000,
  },
  {
    id: 4,
    codeShipment: 'SH-ID-2609-003',
    currency: 'IDR',
    pricePerKg: 15000,
    totalKg: 5.2,
    totalPaymentLogistic: 78000,
    // Mata uang IDR → kurs 1, jadi nilai asli dan Rupiahnya sama.
    actualIdrPaidLogistic: 78000,
    proofNotaLogistic: 'contoh',
    proofPaymentLogistic: 'contoh',
    namaSupplier: 'Supplier Lokal Bandung',
    totalPcs: 40,
    totalPrice: 2400000,
    actualIdrPaidProduct: 2400000,
    skuSupplier: 'SL-BT-0031',
    proofNotaProduct: 'contoh',
    proofPaymentProduct: null,
    workcodePdff: 'LVU-BTM-04-SBK-B01-WL',
    namaProduct: 'Aline Pants',
    pcs: 40,
    pricePerPcs: 60000,
    kurs: 1,
    gramPerPcs: 320,
    hppFinalPerPcs: 79950,
  },
];

export default function HppPratinjau() {
  // Urutan kolom mengikuti alur kerja, bukan urutan daftar awal:
  //   1. Shipment (dari mana)
  //   2. Logistik (ongkos kirim) + buktinya
  //   3. Supplier & nota produk + buktinya
  //   4. Produk per design
  //   5. Hasil akhir (HPP)
  // Alasannya: tiap kelompok menjawab satu pertanyaan, dan HPP Final — angka
  // yang paling dicari — diletakkan paling kanan sebagai kesimpulan.
  const kolom: KolomPratinjau<BarisHpp>[] = useMemo(
    () => [
      // ---- 1. Shipment ----
      { key: 'codeShipment', label: 'Code Shipment', value: (r) => r.codeShipment },
      {
        key: 'currency',
        label: 'Currency',
        value: (r) => r.currency,
        jenis: 'badge',
        filterOptions: [...MATA_UANG],
      },

      // ---- 2. Logistik ----
      { key: 'pricePerKg', label: 'Price/kg', value: (r) => r.pricePerKg, jenis: 'uang' },
      // Berat bisa desimal, jadi tidak dibulatkan ke bilangan bulat.
      { key: 'totalKg', label: 'Total kg', value: (r) => r.totalKg, jenis: 'angka' },
      { key: 'totalPaymentLogistic', label: 'Total Payment Logistic', value: (r) => r.totalPaymentLogistic, jenis: 'uang' },
      { key: 'actualIdrPaidLogistic', label: 'Actual IDR Paid (Logistic)', value: (r) => r.actualIdrPaidLogistic, jenis: 'uang' },
      { key: 'proofNotaLogistic', label: 'Proof Nota Logistic', value: (r) => r.proofNotaLogistic, jenis: 'foto' },
      { key: 'proofPaymentLogistic', label: 'Proof Payment Logistic', value: (r) => r.proofPaymentLogistic, jenis: 'foto' },

      // ---- 3. Supplier & nota produk ----
      { key: 'namaSupplier', label: 'Nama Supplier', value: (r) => r.namaSupplier, lebar: 'max-w-44' },
      { key: 'skuSupplier', label: 'SKU Supplier', value: (r) => r.skuSupplier },
      { key: 'totalPcs', label: 'Total Pcs', value: (r) => r.totalPcs, jenis: 'angka' },
      { key: 'totalPrice', label: 'Total Price', value: (r) => r.totalPrice, jenis: 'angka' },
      { key: 'actualIdrPaidProduct', label: 'Actual IDR Paid (Product)', value: (r) => r.actualIdrPaidProduct, jenis: 'uang' },
      { key: 'proofNotaProduct', label: 'Proof Nota Product', value: (r) => r.proofNotaProduct, jenis: 'foto' },
      { key: 'proofPaymentProduct', label: 'Proof Payment Product', value: (r) => r.proofPaymentProduct, jenis: 'foto' },

      // ---- 4. Produk per design ----
      { key: 'workcodePdff', label: 'Workcode PDFF', value: (r) => r.workcodePdff },
      { key: 'namaProduct', label: 'Nama Product', value: (r) => r.namaProduct, lebar: 'max-w-40' },
      { key: 'pcs', label: 'Pcs', value: (r) => r.pcs, jenis: 'angka' },
      { key: 'pricePerPcs', label: 'Price/pcs', value: (r) => r.pricePerPcs, jenis: 'angka' },
      { key: 'kurs', label: 'Kurs', value: (r) => r.kurs, jenis: 'angka' },
      { key: 'gramPerPcs', label: 'Gram/pcs', value: (r) => r.gramPerPcs, jenis: 'angka' },

      // ---- 5. Hasil ----
      { key: 'hppFinalPerPcs', label: 'HPP Final/pcs', value: (r) => r.hppFinalPerPcs, jenis: 'uang' },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Code Shipment', get: (r: BarisHpp) => r.codeShipment },
      { label: 'Workcode PDFF', get: (r: BarisHpp) => r.workcodePdff },
      { label: 'Nama Product', get: (r: BarisHpp) => r.namaProduct },
      { label: 'Nama Supplier', get: (r: BarisHpp) => r.namaSupplier },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="HPP White Label" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari shipment atau SKU…"
        itemLabel="baris HPP"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
