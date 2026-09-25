import { useMemo, useState } from 'react';
import BannerPratinjau from '@/components/BannerPratinjau';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import { Button } from '@/components/ui/button';
import { SIZE, WARNA } from '@/lib/opsi';
import { PRODUK_REGISTER, barisRegister, type BarisRegister } from '@/lib/produk';
import DetailProduk from './register-produk/DetailProduk';

// ===== REGISTER > Register Produk =====
//
// Bentuknya mengikuti daftar produk ala POS yang dikirim owner: satu baris per
// VARIAN, lengkap dengan harga dan angka stoknya. Yang membedakannya dari
// halaman Product di Master Data bukan datanya — dua-duanya produk — tapi
// pertanyaannya:
//
//   - Product (Master Data)  : "produk ini apa?" — identitas, warna, ukuran.
//   - Register Produk        : "varian ini ada berapa dan harganya berapa?" —
//                              angka yang bergerak tiap hari.
//
// Tab "Variant" di POS tidak ikut dipasang. Di POS itu tab yang berbeda
// KATEGORI barang (produk jadi vs bahan), sedangkan di sini yang dibutuhkan
// cuma daftar produknya — tab kedua yang isinya kosong lebih membingungkan
// daripada tidak ada tab sama sekali.
//
// Data contoh, belum terhubung database — lihat BannerPratinjau.

/** Tab di atas daftar. Satu isinya sekarang, tapi bentuknya sudah tab. */
const TAB = [{ id: 'products', label: 'Products' }] as const;

/**
 * Kolom yang tampil sejak awal, mengikuti susunan POS owner.
 *
 * Dipisah dari tabel dan dipakai DUA tempat — daftar di bawah dan angka yang
 * ditulis banner. Dulu keduanya ditulis terpisah, jadi banner mengclaiming 15
 * kolom padahal yang tampil 13: ia menghitung seluruh kolom termasuk yang
 * disembunyikan. Satu daftar = tidak bisa lagi berbeda pendapat.
 */
const KOLOM_AKTIF = [
  'productId',
  'nama',
  'foto',
  'kategori',
  'kodeVarian',
  'warna',
  'size',
  'harga',
  'stokMasuk',
  'stokJual',
  'menunggu',
  'totalStok',
  'nilaiSisa',
];

export default function RegisterProduk() {
  const [tab, setTab] = useState<(typeof TAB)[number]['id']>('products');
  const [detailId, setDetailId] = useState<string | null>(null);

  const baris = useMemo(() => barisRegister(), []);

  const produkTerbuka = detailId
    ? PRODUK_REGISTER.find((p) => p.id === detailId) ?? null
    : null;

  const kolom: KolomPratinjau<BarisRegister>[] = useMemo(
    () => [
      { key: 'productId', label: 'Product ID', value: (r) => r.productId },
      { key: 'nama', label: 'Product name', value: (r) => r.nama, lebar: 'max-w-52' },
      { key: 'foto', label: 'Images', value: (r) => r.foto, jenis: 'foto' },
      { key: 'kategori', label: 'Category', value: (r) => r.kategori },
      { key: 'kodeVarian', label: 'Variant code', value: (r) => r.kodeVarian, lebar: 'max-w-44' },
      { key: 'warna', label: 'Color', value: (r) => r.warna, filterOptions: [...WARNA] },
      { key: 'size', label: 'Size', value: (r) => r.size, filterOptions: [...SIZE] },
      { key: 'harga', label: 'Selling price', value: (r) => r.harga, jenis: 'uang' },
      { key: 'stokMasuk', label: 'Total stock in', value: (r) => r.stokMasuk, jenis: 'angka' },
      { key: 'stokJual', label: 'Sellable stock', value: (r) => r.stokJual, jenis: 'angka' },
      { key: 'menunggu', label: 'Waiting for', value: (r) => r.menunggu, jenis: 'angka' },
      { key: 'totalStok', label: 'Total stock', value: (r) => r.totalStok, jenis: 'angka' },
      { key: 'nilaiSisa', label: 'Total remaining value', value: (r) => r.nilaiSisa, jenis: 'uang' },
      {
        key: 'brand',
        label: 'Brand',
        value: (r) => r.brand,
        filterOptions: [...new Set(PRODUK_REGISTER.map((p) => p.brand))],
      },
      { key: 'registerDate', label: 'Register date', value: (r) => r.registerDate, jenis: 'tanggal' },
      {
        key: 'aksi',
        label: 'Aksi',
        value: () => '',
        // Tombol detail per baris, sebagai jalan masuk yang terlihat.
        //
        // TIDAK tampil sejak awal: daftar ini mengikuti susunan POS owner, dan
        // di situ tidak ada kolom aksi. Tersedia lewat dropdown "Kolom" bagi
        // yang menginginkan tombolnya.
        //
        // Catatan jujur soal keyboard: `onRowClick` reui hanya menangani MOUSE,
        // jadi tanpa kolom ini detailnya hanya bisa dibuka dengan pointing
        // device. Kolomnya sengaja TIDAK dinyalakan sejak awal supaya susunan
        // kolomnya tetap sama dengan POS; menyalakannya menggeser tampilan dari
        // yang diminta owner. Ini trade-off yang dipilih sadar, bukan yang
        // terlewat.
        render: (r) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              // Tanpa stopPropagation, klik tombol ikut memicu onRowClick
              // barisnya — detailnya terbuka, tertutup, lalu terbuka lagi.
              e.stopPropagation();
              setDetailId(r.productId);
            }}
          >
            Detail
          </Button>
        ),
      },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Product name', get: (r: BarisRegister) => r.nama },
      { label: 'Product ID', get: (r: BarisRegister) => r.productId },
      { label: 'Design code', get: (r: BarisRegister) => r.kode },
      { label: 'Color', get: (r: BarisRegister) => r.warna },
      { label: 'Size', get: (r: BarisRegister) => r.size },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Register Produk" jumlahKolom={KOLOM_AKTIF.length} />

      {/* Tab di atas daftar. Dipasang walau isinya baru satu: begitu kategori
          kedua datang, yang berubah hanya daftar isinya — bukan tata letaknya.
          Tabnya sendiri belum menyaring apa pun (satu-satunya tab selalu
          terpilih), dan itu tidak menyesatkan karena tidak ada tab lain yang
          bisa diklik.

          `role="tablist"` + `role="tab"` dipakai, bukan `aria-pressed`, supaya
          terbaca sebagai tab oleh pembaca layar dan bisa dinavigasi. Catatan:
          `components/ui/tabs.tsx` yang terpasang tidak cocok di sini — ia
          terpasang untuk menyaring isi daftar, sedangkan ini bersifat tab
          kategori dan belum memfilter apa pun. Kalau nanti tab kedua benar-benar
          menyaring, pindah ke Tabs bawaan. */}
      <div role="tablist" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {TAB.map((t) => (
          <Button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            variant={tab === t.id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <TabelPratinjau
        rows={baris}
        columns={kolom}
        searchFields={searchFields}
        searchPlaceholder="Cari produk, kode, atau warna…"
        itemLabel="produk"
        rowKey={(r) => r.id}
        onRowClick={(r) => setDetailId(r.productId)}
        // Kolom yang tampil sejak awal: `KOLOM_AKTIF` (lihat catatan di atas).
        // Sisanya (Brand, Register date, Aksi) tetap ada dan bisa dicentang
        // lewat dropdown "Kolom" — daftar ala POS dibaca cepat, jadi yang
        // tampil harus yang menjawab "stoknya berapa, harganya berapa".
        kunciKolomAktif={KOLOM_AKTIF}
      />

      <DetailProduk produk={produkTerbuka} onTutup={() => setDetailId(null)} />
    </div>
  );
}
