import { useMemo } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import {
  KARTU_PRODUCTION,
  KARTU_WHITELABEL,
  totalPcs,
} from './production-fulfillment/data-kanban';
import { barisShipmentUntuk, gerbangHpp } from './production-fulfillment/hpp';
import { barisContoh } from './HppPratinjau';

// ===== Halaman "HPP & Harga Jual" (pratinjau) =====
//
// HPP hari ini tersebar di empat permukaan dengan butir yang berbeda-beda:
// papan (popup per kartu, harus diklik satu per satu), tabel 40 kolom (kolom
// `hpp`/`sellingPrice` tenggelam di antara 40 kolom), `/modul/hpp-baru` (per
// SHIPMENT, dan cuma White Label), dan Register Produk (harga jualnya literal,
// bukan dari `hpp.ts`). Tidak ada satu tempat pun yang menjawab "semua produk,
// HPP-nya berapa".
//
// Halaman ini menutup itu: SATU BARIS PER KARTU — 10 kartu Production + 8
// kartu White Label — dengan angka dari `gerbangHpp()`, mesin yang sama dengan
// popup kartu. Karena itu angkanya tidak mungkin berbeda dari yang dilihat di
// papan.
//
// Halaman ini TIDAK menghitung ulang apa pun. Kalau rumusnya perlu berubah,
// yang diubah `production-fulfillment/hpp.ts` — bukan berkas ini. Menyalin
// rumusnya ke sini akan membuat dua tempat bisa berbeda pendapat tanpa ada
// yang salah di layar.
//
// Nama berkas sengaja HppHargaJual.tsx, BUKAN Hpp.tsx/HPP.tsx: di sistem
// berkas yang tidak membedakan huruf besar-kecil (Windows), "Hpp.tsx" dan
// "HPP.tsx" adalah berkas yang SAMA — menulis ke Hpp.tsx pernah menimpa
// halaman HPP lama (255 baris) yang masih di-import App.tsx.
//
// Keputusan pemilik yang mengikat halaman ini:
//   - Kartu yang HPP-nya belum bisa dihitung tetap DITAMPILKAN berstatus
//     "Tertahan" beserta alasannya — justru itu yang perlu ditindak.
//   - Kolom angkanya `—`, BUKAN 0. 0 terbaca sebagai "produk ini gratis" dan
//     akan ikut disetujui tanpa ada yang merasa salah.
//   - Baris = KARTU, bukan workcode unik: dua kartu boleh ber-workcode sama,
//     dan menggabungkannya akan menyembunyikan salah satunya.

/** Satu baris tabel = satu kartu. Semua angka sudah jadi — tidak ada hitungan di render. */
export interface BarisHarga {
  /** `kartu.id` — kunci baris. Bukan workcode: ada kartu ber-workcode sama. */
  id: string;
  produk: string;
  workcode: string;
  /** Label TAMPILAN ('Production' / 'White Label'), bukan kode internal. */
  sumber: 'Production' | 'White Label';
  pcs: number;
  /** `null` kalau HPP belum bisa dihitung — JANGAN diubah jadi 0. */
  hpp: number | null;
  /** HPP × margin global; ikut `null` saat HPP-nya `null`. */
  hargaJual: number | null;
  status: 'Terhitung' | 'Tertahan';
  /** Alasan saat tertahan, `null` saat terhitung. */
  keterangan: string | null;
}

/**
 * Susun seluruh baris dari kartu + gerbang HPP.
 *
 * Fungsi terpisah dari komponennya supaya smoke test bisa memanggilnya
 * langsung — tabelnya dipaginasi 10 baris, jadi baris ke-11 dan seterusnya
 * (semua kartu White Label, termasuk Luna Pants) tidak pernah masuk markup
 * SSR. Angka yang hanya diperiksa lewat markup halaman 1 akan hijau tanpa
 * menguji apa pun.
 */
export function susunBaris(): BarisHarga[] {
  const produksi: BarisHarga[] = KARTU_PRODUCTION.map((kartu) => {
    const g = gerbangHpp(kartu, 'production', kartu.detail.ongkosJahit);
    return {
      id: kartu.id,
      produk: kartu.productName,
      workcode: kartu.workcode,
      sumber: 'Production',
      pcs: totalPcs(kartu),
      hpp: g.hpp,
      hargaJual: g.sellingPrice,
      status: g.bolehLanjut ? 'Terhitung' : 'Tertahan',
      keterangan: g.alasan,
    };
  });

  const whiteLabel: BarisHarga[] = KARTU_WHITELABEL.map((kartu) => {
    const { baris: shipment, produkAmbigu } = barisShipmentUntuk(kartu, barisContoh);
    const g = gerbangHpp(kartu, 'whitelabel', undefined, shipment ?? undefined);

    // Ambigu berarti ada LEBIH DARI SATU baris shipment yang cocok. Gerbang
    // mengosongkan HPP-nya (angka kartu lain lebih berbahaya daripada tidak
    // ada angka), tapi alasannya beda dari "belum ada data": di sini datanya
    // ADA dan orang harus memutuskan mana yang benar. Kalimatnya sengaja sama
    // persis dengan `SeksiHppPrice.tsx` — dua halaman yang menyebut masalah
    // yang sama dengan kata berbeda akan terbaca sebagai dua masalah.
    const boleh = g.bolehLanjut && produkAmbigu === null;
    return {
      id: kartu.id,
      produk: kartu.productName,
      workcode: kartu.workcode,
      sumber: 'White Label',
      pcs: totalPcs(kartu),
      hpp: g.hpp,
      hargaJual: g.sellingPrice,
      status: boleh ? 'Terhitung' : 'Tertahan',
      keterangan: produkAmbigu
        ? `Ada lebih dari satu baris shipment untuk "${produkAmbigu}". HPP sengaja dikosongkan — angka kartu yang lain lebih berbahaya daripada tidak ada angka.`
        : g.alasan,
    };
  });

  return [...produksi, ...whiteLabel];
}

/**
 * Kolom tabel.
 *
 * Konstanta modul-level, bukan `useMemo` di dalam komponen: referensinya sudah
 * stabil tanpa itu, dan smoke test bisa membandingkan bentuknya (urutan,
 * jenis, filterOptions, lebar) tanpa merender komponennya.
 *
 * `filterOptions` di `sumber` dan `status` adalah satu-satunya "filter" yang
 * dipasang — mesin Filter milik `TabelPratinjau` menangani sisanya, jadi tidak
 * ada state filter yang perlu ditulis di sini.
 */
export const kolomHarga: KolomPratinjau<BarisHarga>[] = [
  { key: 'produk', label: 'Produk', value: (r) => r.produk, lebar: 'max-w-44' },
  { key: 'workcode', label: 'Workcode', value: (r) => r.workcode },
  {
    key: 'sumber',
    label: 'Sumber',
    value: (r) => r.sumber,
    jenis: 'badge',
    filterOptions: ['Production', 'White Label'],
  },
  { key: 'pcs', label: 'Pcs', value: (r) => r.pcs, jenis: 'angka' },
  // `null` dirender `—` oleh kolom `uang`; jangan pernah menggantinya jadi 0.
  { key: 'hpp', label: 'HPP / pcs', value: (r) => r.hpp, jenis: 'uang' },
  { key: 'hargaJual', label: 'Harga Jual', value: (r) => r.hargaJual, jenis: 'uang' },
  {
    key: 'status',
    label: 'Status',
    value: (r) => r.status,
    jenis: 'badge',
    filterOptions: ['Terhitung', 'Tertahan'],
    warna: (r) => (r.status === 'Terhitung' ? 'hijau' : 'kuning'),
  },
  { key: 'keterangan', label: 'Keterangan', value: (r) => r.keterangan, lebar: 'max-w-72' },
];

/** Field pencarian — cukup dua yang benar-benar dipakai mencari di sini. */
export const cariHarga: { label: string; get: (r: BarisHarga) => string }[] = [
  { label: 'Produk', get: (r) => r.produk },
  { label: 'Workcode', get: (r) => r.workcode },
];

export default function HppHargaJual() {
  // Baris disusun sekali: `susunBaris()` membaca data statis, jadi hasilnya
  // sama di setiap render — dan `useMemo` menjaga referensinya stabil supaya
  // tabelnya tidak dianggap berubah.
  const baris = useMemo(() => susunBaris(), []);

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="HPP & Harga Jual" jumlahKolom={kolomHarga.length} />
      <TabelPratinjau
        rows={baris}
        columns={kolomHarga}
        searchFields={cariHarga}
        searchPlaceholder="Cari produk atau workcode…"
        itemLabel="hasil HPP"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
