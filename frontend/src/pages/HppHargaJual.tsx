import { useMemo, useState } from 'react';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import BannerPratinjau from '@/components/BannerPratinjau';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rupiah, rupiahPresisi } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TriangleAlert } from 'lucide-react';
import {
  KARTU_PRODUCTION,
  KARTU_WHITELABEL,
  totalPcs,
  type KartuPdff,
} from './production-fulfillment/data-kanban';
import {
  barisShipmentUntuk,
  gerbangHpp,
  hppProduksi,
  MARGIN_HARGA_JUAL,
  type BarisShipmentRingkas,
} from './production-fulfillment/hpp';
import { barisContoh } from './HppPratinjau';

// ===== Halaman "HPP & Harga Jual" (pratinjau, section Report) =====
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
//
// Revisi pemilik 2026-10-08 (tiket `.scratch/hpp-harga-jual/issues/02`):
//   - Halaman pindah ke section REPORT (sidebar paling bawah, setelah
//     Progress) — bukan lagi Master Data.
//   - Kolom "Workcode" → "SKU Produk" (LVU-TOP-17), supaya riwayat HPP
//     lintas batch bisa dibaca per SKU.
//   - Klik baris → popup: tab "Perhitungan HPP" + tab "Riwayat HPP".
//
// KONTRAK RIWAYAT (keputusan pemilik, 2026-10-08): HPP disimpan sebagai
// SNAPSHOT per SKU begitu kartu lanjut dari tahap HPP & Price — titik
// tulisnya `lanjutStage` di `PapanFulfillment.tsx`. Riwayat karena itu fakta
// yang tidak berubah: angkanya pasti sama dengan yang disetujui, bukan hasil
// hitung ulang yang bisa bergerak. App masih pratinjau data contoh, jadi
// `RIWAYAT_CONTOH` di bawah masih contoh — tapi bentuk datanya sudah bentuk
// snapshot yang sama, jadi saat DB tersambung tinggal mengganti sumbernya.

/**
 * SKU produk dari designCode kartu: `CSC-TOP-17` → `LVU-TOP-17`.
 *
 * Pola yang SAMA dengan `skuVarian()` di `data-kanban.ts` (prefix `LVU-` +
 * designCode tanpa `CSC-`), hanya tanpa akhiran warna-ukuran — di sini satu
 * SKU mewakili satu produk, karena itulah butir riwayat HPP-nya. `skuVarian`
 * tidak bisa dipakai (butuh kodeWarna + ukuran), dan `data-kanban.ts` sedang
 * dipegang pekerjaan lain — karena itu helper-nya hidup di sini. Kalau pola
 * SKU di `skuVarian` berubah, ubah juga yang ini.
 */
export function skuProduk(kartu: KartuPdff): string {
  return `LVU-${kartu.detail.designCode.replace(/^CSC-/, '')}`;
}

/** Satu baris tabel = satu kartu. Semua angka sudah jadi — tidak ada hitungan di render. */
export interface BarisHarga {
  /** `kartu.id` — kunci baris. Bukan workcode: ada kartu ber-workcode sama. */
  id: string;
  produk: string;
  /** SKU produk (LVU-TOP-17) — dari `skuProduk()`; juga kunci riwayat HPP. */
  sku: string;
  /** `kartu.batch` — entri riwayat dengan batch ini ditandai "ini". */
  batch: string;
  /**
   * Kartunya sendiri, bukan cuma id-nya. Popup butuh detail penuh (bahan,
   * warna, ongkos jahit), dan mencarinya ulang lewat id berarti jalur lookup
   * kedua yang bisa gagal tanpa error.
   */
  kartu: KartuPdff;
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
      sku: skuProduk(kartu),
      batch: kartu.batch,
      kartu,
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
      sku: skuProduk(kartu),
      batch: kartu.batch,
      kartu,
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

// ===== Riwayat HPP per SKU =====

/**
 * Satu entri riwayat = satu snapshot HPP saat kartu keluar dari HPP & Price.
 *
 * Bentuknya sengaja persis seperti snapshot yang nanti disimpan ke DB:
 * angka HPP dan harga jual DISIMPAN, bukan dihitung ulang dari kartu lama.
 * Kartu lama bisa saja sudah berubah spesifikasinya; yang benar dibaca di
 * riwayat adalah angka yang disetujui saat itu.
 */
export interface EntriRiwayat {
  batch: string;
  tanggal: string;
  pcs: number;
  hpp: number;
  hargaJual: number;
}

/**
 * Riwayat contoh per SKU. Urutan array = kronologis NAIK (paling lama dulu).
 *
 * Contoh, bukan hasil query — app masih pratinjau. Angka HPP-nya mengikuti
 * mesin `hpp.ts` supaya riwayat dan perhitungan tidak saling bertentangan;
 * batch yang sama dengan batch kartunya (B-00 untuk Elodie, B-01 untuk Luna)
 * ditandai "ini" di popup.
 */
export const RIWAYAT_CONTOH: Record<string, EntriRiwayat[]> = {
  'LVU-TOP-17': [
    { batch: 'B-03', tanggal: '02 Feb 2026', pcs: 170, hpp: 112300, hargaJual: 269520 },
    { batch: 'B-02', tanggal: '11 Mar 2026', pcs: 160, hpp: 106400, hargaJual: 255360 },
    { batch: 'B-01', tanggal: '24 Apr 2026', pcs: 150, hpp: 109120, hargaJual: 261888 },
    { batch: 'B-00', tanggal: '26 May 2026', pcs: 145, hpp: 111900.14, hargaJual: 268560.34 },
  ],
  'LVU-PNT-31': [
    { batch: 'B-02', tanggal: '12 Mar 2026', pcs: 50, hpp: 129400, hargaJual: 310560 },
    { batch: 'B-01', tanggal: '28 Apr 2026', pcs: 45, hpp: 131950, hargaJual: 316680 },
  ],
};

/** Riwayat untuk satu SKU; `[]` kalau SKU-nya belum punya riwayat. */
export function riwayatUntuk(sku: string): EntriRiwayat[] {
  return RIWAYAT_CONTOH[sku] ?? [];
}

/**
 * Delta % HPP terhadap entri sebelumnya (yang lebih lama).
 *
 * Murni tampilan — bukan hitungan HPP, jadi tinggal di halaman ini. Turun
 * memakai U+2212 (minus sungguhan, bukan hyphen): hyphen di angka terbaca
 * seperti tanda hubung dan sulit dibedakan dari pemisah.
 */
export function formatDelta(sekarang: number, sebelumnya: number): string {
  const persen = ((sekarang - sebelumnya) / sebelumnya) * 100;
  const tanda = persen < 0 ? '−' : '+';
  return `${tanda}${Math.abs(persen).toFixed(1).replace('.', ',')}%`;
}

// Format Rupiah halaman ini datang dari `@/lib/format` (aturan satu sumber
// ada di header berkas itu): `rupiah` untuk tampilan, `rupiahPresisi` untuk
// baris "÷" yang butuh 2 desimal.

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
 *
 * Kolom `produk` memakai `render` untuk tombolnya — tapi tombolnya perlu
 * `buka()` dari state halaman, jadi `render` diisi lewat `kolomHarga(buka)`
 * di bawah, bukan konstanta. Bentuk kolomnya sendiri tetap di sini supaya
 * test bisa membacanya.
 */
export function kolomHarga(buka: (r: BarisHarga) => void): KolomPratinjau<BarisHarga>[] {
  return [
    {
      key: 'produk',
      label: 'Produk',
      value: (r) => r.produk,
      lebar: 'max-w-44',
      // TabelPratinjau.onRowClick HANYA mouse (didokumentasikan di berkasnya).
      // Tombol ini jalur keyboard-nya: bisa di-Tab, dibuka dengan Enter/Space,
      // dan `aria-label`-nya menyebut produknya supaya jelas baris mana yang
      // akan dibuka saat dibacakan screen reader.
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            // Jangan ikut memicu onRowClick barisnya — satu klik, satu popup.
            e.stopPropagation();
            buka(r);
          }}
          aria-label={`Buka detail HPP ${r.produk}`}
          className="max-w-44 truncate text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {r.produk}
        </button>
      ),
    },
    { key: 'sku', label: 'SKU Produk', value: (r) => r.sku },
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
}

/** Field pencarian — cukup dua yang benar-benar dipakai mencari di sini. */
export const cariHarga: { label: string; get: (r: BarisHarga) => string }[] = [
  { label: 'Produk', get: (r) => r.produk },
  { label: 'SKU Produk', get: (r) => r.sku },
];

// ===== Isi popup: perhitungan + riwayat =====

/** Kotak alasan untuk kartu tertahan — menggantikan tabel, bukan tabel kosong. */
function AlasanTertahan({ teks }: { teks: string | null }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{teks ?? 'HPP belum bisa dihitung.'}</p>
    </div>
  );
}

/** Garis bagi "total ÷ pcs" — 2 desimal, karena HPP-nya memang berdesimal. */
function GarisBagi({ kiri, kanan }: { kiri: string; kanan: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm">
      <span className="text-muted-foreground">{kiri}</span>
      <span className="font-medium tabular-nums">{kanan}</span>
    </div>
  );
}

/** Tab "Perhitungan HPP" mode Production: tabel bahan + ongkos jahit. */
function PerhitunganProduction({ kartu, hpp }: { kartu: KartuPdff; hpp: number }) {
  // Mesin yang sama dengan halaman; dihitung ulang di sini bukan untuk
  // mendapat angka berbeda, tapi supaya baris rinciannya ikut tampil —
  // `gerbangHpp()` hanya mengembalikan HPP akhirnya.
  const hasil = hppProduksi(kartu, kartu.detail.ongkosJahit);

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>Varian</TableHead>
            <TableHead>Berlaku</TableHead>
            <TableHead className="text-right">Kebutuhan</TableHead>
            <TableHead className="text-right">Harga FIFO</TableHead>
            <TableHead className="text-right">Biaya</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasil.baris.map((b, i) => (
            <TableRow key={`${b.material}-${b.varian}-${i}`}>
              <TableCell>{b.material}</TableCell>
              <TableCell>{b.varian}</TableCell>
              <TableCell>{b.berlaku}</TableCell>
              <TableCell className="text-right tabular-nums">
                {`${b.totalUsage.toLocaleString('id-ID')} ${b.satuan}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {b.harga === null ? 'Belum dicatat' : rupiah(b.harga)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {b.biaya === null ? '—' : rupiah(b.biaya)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/50 font-medium">
            <TableCell colSpan={5}>Total biaya bahan + ongkos jahit</TableCell>
            <TableCell className="text-right tabular-nums">{rupiah(hasil.totalBiaya)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <GarisBagi
        kiri={`Total biaya ÷ ${hasil.jumlahPcsJadi} pcs jadi`}
        kanan={`${rupiah(hasil.totalBiaya)} ÷ ${hasil.jumlahPcsJadi} = ${rupiahPresisi(hpp)}`}
      />
    </div>
  );
}

/** Tab "Perhitungan HPP" mode White Label: pembelian + ongkos kirim shipment. */
function PerhitunganWhiteLabel({ shipment, hpp }: { shipment: BarisShipmentRingkas; hpp: number }) {
  const total = shipment.actualIdrPaidProduct + shipment.actualIdrPaidLogistic;

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Komponen</TableHead>
            <TableHead>Sumber</TableHead>
            <TableHead className="text-right">Jumlah</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Pembelian produk (actual IDR)</TableCell>
            <TableCell>{shipment.codeShipment}</TableCell>
            <TableCell className="text-right tabular-nums">
              {rupiah(shipment.actualIdrPaidProduct)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Ongkos kirim (actual IDR)</TableCell>
            <TableCell>{shipment.codeShipment}</TableCell>
            <TableCell className="text-right tabular-nums">
              {rupiah(shipment.actualIdrPaidLogistic)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-muted/50 font-medium">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right tabular-nums">{rupiah(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <GarisBagi
        kiri={`Total ÷ ${shipment.totalPcs} pcs shipment`}
        kanan={`${rupiah(total)} ÷ ${shipment.totalPcs} = ${rupiahPresisi(hpp)}`}
      />
      <p className="text-xs text-muted-foreground">
        Shipment {shipment.codeShipment} · {shipment.namaSupplier}
      </p>
    </div>
  );
}

/** Tab "Riwayat HPP": daftar snapshot per SKU, batch kartu ini ditandai "ini". */
function DaftarRiwayat({ sku, batch }: { sku: string; batch: string }) {
  const riwayat = riwayatUntuk(sku);

  if (riwayat.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Belum ada riwayat HPP untuk SKU ini.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {riwayat.map((e, i) => {
        const ini = e.batch === batch;
        // Delta dibanding entri SEBELUMNYA (yang lebih lama) — urutan array
        // memang kronologis naik. Entri paling tua tidak punya pembanding.
        const sebelumnya = i > 0 ? riwayat[i - 1].hpp : null;
        return (
          <div
            key={`${e.batch}-${e.tanggal}`}
            className={cn(
              'grid gap-x-4 gap-y-1 rounded-lg border p-3 text-sm sm:grid-cols-[7rem_8rem_5rem_1fr_1fr_auto] sm:items-center',
              ini && 'border-foreground/30 bg-muted/40'
            )}
          >
            <div className="flex items-center gap-2 font-mono font-semibold">
              {e.batch}
              {ini && (
                <Badge variant="secondary" className="px-1.5 text-[10px] uppercase">
                  ini
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground">{e.tanggal}</div>
            <div className="tabular-nums">{e.pcs} pcs</div>
            <div className="tabular-nums">
              {rupiah(e.hpp)}
              <div className="text-[11px] text-muted-foreground">HPP/pcs</div>
            </div>
            <div className="tabular-nums">
              {rupiah(e.hargaJual)}
              <div className="text-[11px] text-muted-foreground">Harga jual</div>
            </div>
            <div className="sm:justify-self-end">
              {sebelumnya === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Badge
                  variant={e.hpp > sebelumnya ? 'secondary' : 'default'}
                  className="tabular-nums"
                >
                  {formatDelta(e.hpp, sebelumnya)}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Riwayat tersimpan begitu kartu melewati tahap HPP &amp; Price, jadi angkanya tidak berubah
        lagi.
      </p>
    </div>
  );
}

/**
 * Isi popup, dipisah dari pembungkus `Dialog` dan DIEKSPOR.
 *
 * Wajib dipisah: `DialogContent` memakai portal, dan portal tidak ter-render
 * di server — tanpa pemisahan ini satu-satunya cara memeriksa isinya adalah
 * membuka manual satu kartu demi satu kartu. Pola yang sama dipakai
 * `IsiPopup` di `PopupKartu.tsx`.
 *
 * `tabAwal` ada karena Radix Tabs hanya me-render tab yang AKTIF saat SSR:
 * tanpa prop ini, isi tab Riwayat tidak pernah muncul di markup dan check-nya
 * hijau tanpa memeriksa apa pun.
 */
export function IsiPopupHarga({
  baris,
  tabAwal = 'perhitungan',
}: {
  baris: BarisHarga;
  tabAwal?: 'perhitungan' | 'riwayat';
}) {
  const hpp = baris.hpp;
  const riwayat = riwayatUntuk(baris.sku);

  // Dua hitungan yang sama dengan halaman, dipanggil dari mesin yang sama —
  // bukan rumus yang ditulis ulang di sini.
  const produksi =
    baris.sumber === 'Production' ? hppProduksi(baris.kartu, baris.kartu.detail.ongkosJahit) : null;
  const shipment =
    baris.sumber === 'White Label' ? barisShipmentUntuk(baris.kartu, barisContoh).baris : null;

  const totalBiaya = produksi
    ? produksi.totalBiaya
    : shipment
      ? shipment.actualIdrPaidProduct + shipment.actualIdrPaidLogistic
      : null;
  const subTotal = produksi
    ? `÷ ${produksi.jumlahPcsJadi} pcs`
    : shipment
      ? `÷ ${shipment.totalPcs} pcs`
      : null;

  return (
    <div className="flex flex-col">
      <div className="border-b px-6 py-4 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-base font-medium">{baris.produk}</span>
          <Badge variant="outline" className="font-mono">
            {baris.sku}
          </Badge>
          <Badge variant="outline">{baris.sumber}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Batch <span className="font-medium text-foreground">{baris.batch}</span>
          </span>
          <span>·</span>
          <span>{baris.pcs} pcs</span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            Status
            <Badge variant={baris.status === 'Terhitung' ? 'default' : 'secondary'}>{baris.status}</Badge>
          </span>
        </div>
      </div>

      <div className="space-y-4 px-6 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">HPP / pcs</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {hpp === null ? '—' : rupiah(hpp)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {baris.sumber === 'Production' ? 'biaya bahan ÷ pcs jadi' : 'beli + kirim ÷ pcs'}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Harga Jual</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {baris.hargaJual === null ? '—' : rupiah(baris.hargaJual)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              HPP × {String(MARGIN_HARGA_JUAL).replace('.', ',')}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Total biaya batch ini</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {totalBiaya === null ? '—' : rupiah(totalBiaya)}
            </div>
            {subTotal && <div className="text-[11px] text-muted-foreground">{subTotal}</div>}
          </div>
        </div>

        <Tabs defaultValue={tabAwal}>
          <TabsList>
            <TabsTrigger value="perhitungan">Perhitungan HPP</TabsTrigger>
            <TabsTrigger value="riwayat">Riwayat HPP ({riwayat.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="perhitungan">
            {hpp === null ? (
              <AlasanTertahan teks={baris.keterangan} />
            ) : baris.sumber === 'Production' ? (
              <PerhitunganProduction kartu={baris.kartu} hpp={hpp} />
            ) : shipment ? (
              <PerhitunganWhiteLabel shipment={shipment} hpp={hpp} />
            ) : (
              <AlasanTertahan teks={baris.keterangan} />
            )}
          </TabsContent>
          <TabsContent value="riwayat">
            <DaftarRiwayat sku={baris.sku} batch={baris.batch} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Pembungkus `Dialog` — dipakai halaman.
 *
 * `DialogTitle` WAJIB di dalam `DialogContent` (base-ui: di luar itu melempar
 * "DialogRootContext is missing" — sudah pernah kejadian). Judulnya sr-only
 * karena judul yang terlihat sudah ada di header `IsiPopupHarga`.
 */
export function PopupHarga({
  baris,
  onTutup,
}: {
  baris: BarisHarga | null;
  onTutup: () => void;
}) {
  if (!baris) return null;

  return (
    <Dialog open onOpenChange={(buka) => !buka && onTutup()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-[980px]">
        <DialogTitle className="sr-only">Detail HPP {baris.produk}</DialogTitle>
        <div className="overflow-y-auto">
          <IsiPopupHarga baris={baris} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HppHargaJual() {
  // Baris disusun sekali: `susunBaris()` membaca data statis, jadi hasilnya
  // sama di setiap render — dan `useMemo` menjaga referensinya stabil supaya
  // tabelnya tidak dianggap berubah.
  const baris = useMemo(() => susunBaris(), []);
  const [dipilih, setDipilih] = useState<BarisHarga | null>(null);
  const kolom = useMemo(() => kolomHarga(setDipilih), []);

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="HPP & Harga Jual" jumlahKolom={kolom.length} />
      <TabelPratinjau
        rows={baris}
        columns={kolom}
        searchFields={cariHarga}
        searchPlaceholder="Cari produk atau SKU…"
        itemLabel="hasil HPP"
        rowKey={(r) => r.id}
        onRowClick={setDipilih}
      />
      <PopupHarga baris={dipilih} onTutup={() => setDipilih(null)} />
    </div>
  );
}
