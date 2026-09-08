import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { KOTA_NEGARA, LOGISTIK, MATA_UANG } from '@/lib/opsi';

// ===== Tabel White Label (pratinjau) =====
//
// Sembilan kolom sesuai daftar owner 7 September 2026, ditambah Workcode PDFF
// di urutan terakhir pada 8 September. Data contoh, bukan dari database —
// koneksinya menyusul setelah disetujui.
//
// Catatan untuk step koneksi nanti: kolom 7 (Invoice Logistic) dan 8 (Proof
// Payment Logistic) keduanya bertipe FOTO, jadi butuh dua endpoint unggah
// terpisah atau satu endpoint dengan penanda jenis berkas.

export interface BarisWhitelabel {
  id: number;
  codeShipment: string;
  cityCountry: string;
  currency: string;
  logisticName: string;
  noInvoiceLogistic: string;
  dateInvoiceLogistic: string;
  invoiceLogistic: string | null;
  proofPaymentLogistic: string | null;
  /**
   * Workcode PDFF — penanda batch produksi yang memakai barang shipment ini.
   * Ditambah 8 September 2026 sebagai kolom terakhir.
   */
  workcodePdff: string;
}

const barisContoh: BarisWhitelabel[] = [
  {
    id: 1,
    // Kode shipment dibuat sendiri dan bergantung asal negara (spesifikasi
    // owner: "unique kode buatan sendiri tergantung asal negara importnya").
    codeShipment: 'SH-TH-2609-001',
    cityCountry: 'Bangkok-Thailand',
    currency: 'THB',
    logisticName: 'Transindo Global',
    noInvoiceLogistic: 'TG/TH/8842A',
    dateInvoiceLogistic: '2026-09-01',
    invoiceLogistic: 'contoh',
    proofPaymentLogistic: 'contoh',
    workcodePdff: 'LVU-TOP-11-EBK-B01-WL',
  },
  {
    id: 2,
    codeShipment: 'SH-CN-2609-002',
    cityCountry: 'Guangzhou-China',
    currency: 'CNY',
    logisticName: 'MJ Logistics',
    noInvoiceLogistic: 'MJ/CN/2210F',
    dateInvoiceLogistic: '2026-09-03',
    invoiceLogistic: 'contoh',
    proofPaymentLogistic: null,
    workcodePdff: 'LVU-TOP-11-EWH-B02-WL',
  },
  {
    id: 3,
    codeShipment: 'SH-ID-2609-003',
    cityCountry: 'Jakarta-Indonesia',
    currency: 'IDR',
    logisticName: 'Transindo Global',
    noInvoiceLogistic: 'TG/ID/0091C',
    dateInvoiceLogistic: '2026-09-05',
    invoiceLogistic: null,
    proofPaymentLogistic: null,
    workcodePdff: 'LVU-BTM-04-SBK-B01-WL',
  },
];

export default function Whitelabel() {
  const kolom: KolomPratinjau<BarisWhitelabel>[] = useMemo(
    () => [
      { key: 'codeShipment', label: 'Code Shipment', value: (r) => r.codeShipment },
      {
        key: 'cityCountry',
        label: 'City-Country',
        value: (r) => r.cityCountry,
        jenis: 'badge',
        filterOptions: [...KOTA_NEGARA],
      },
      {
        key: 'currency',
        label: 'Currency',
        value: (r) => r.currency,
        jenis: 'badge',
        filterOptions: [...MATA_UANG],
      },
      {
        key: 'logisticName',
        label: 'Logistic Name',
        value: (r) => r.logisticName,
        filterOptions: [...LOGISTIK],
      },
      { key: 'noInvoiceLogistic', label: 'No Invoice Logistic', value: (r) => r.noInvoiceLogistic },
      {
        key: 'dateInvoiceLogistic',
        label: 'Date Invoice Logistic',
        value: (r) => r.dateInvoiceLogistic,
      },
      { key: 'invoiceLogistic', label: 'Invoice Logistic', value: (r) => r.invoiceLogistic, jenis: 'foto' },
      {
        key: 'proofPaymentLogistic',
        label: 'Proof Payment Logistic',
        value: (r) => r.proofPaymentLogistic,
        jenis: 'foto',
      },
      { key: 'workcodePdff', label: 'Workcode PDFF', value: (r) => r.workcodePdff },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Code Shipment', get: (r: BarisWhitelabel) => r.codeShipment },
      { label: 'No Invoice', get: (r: BarisWhitelabel) => r.noInvoiceLogistic },
      { label: 'Logistic', get: (r: BarisWhitelabel) => r.logisticName },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="White Label" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={barisContoh}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari shipment…"
        itemLabel="shipment"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
