import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import { type WarnaMaster } from '@/lib/warna';

// ===== REGISTER > Register Produk > tab Colour =====
//
// Master warna: satu baris per warna, isinya cuma nama dan kodenya.
//
// Kenapa tabel, bukan kartu seperti tab Products di sebelahnya: yang dibaca di
// sini daftar KODE — nilai pendek yang dicocokkan huruf per huruf dengan
// `kodeVarian` (mis. `LVU-TOP-11-HTP-M`). Membandingkan kode dalam bentuk
// kartu membuat kolomnya tidak sejajar, dan justru perbandingan itulah gunanya
// halaman ini. Kartu cocok untuk produk (ada foto, harga, angka stok), tabel
// cocok untuk daftar pasangan nama-kode yang tidak punya apa-apa selain itu.
//
// Tabelnya memakai `TabelPratinjau` — pembungkus reui Data Grid yang sama
// dengan halaman Master Data. Bukan tabel shadcn biasa: yang diminta pemilik
// "style-nya kayak Master Data", dan yang membuat dua halaman terasa sekeluarga
// bukan warna atau fontnya, melainkan perangkat yang sama di sekeliling
// tabelnya — kotak cari, dropdown Kolom, tombol Export, header yang bisa
// diurut, dan paginasi. Menulis tabel sendiri di sini berarti dua halaman
// dengan tabel yang perilakunya berbeda halus, dan bedanya baru ketahuan saat
// ada yang membandingkan keduanya.
//
// DIEKSPOR TERPISAH dari halamannya, mengikuti pola `IsiFormProdukBaru` dan
// `IsiPopupHarga`. Alasannya bukan gaya: Radix Tabs hanya me-render tab yang
// SEDANG AKTIF saat render di server. Kalau tabel ini cuma hidup di dalam
// tabnya, satu-satunya cara memeriksanya adalah membuka tabnya dulu.
//
// Datanya dari database: tabel `warna` di Supabase, dibaca lewat
// /api/register-produk/warna. Sejak 16 Okt 2026 halaman ini tidak lagi
// menurunkan daftarnya dari katalog contoh — `warna.kode` unik di sana, dan
// `product_variants.warna_kode` menunjuk ke tabel itu lewat foreign key, jadi
// daftar yang dirakit sendiri di klien tidak bisa dipakai untuk menyimpan apa
// pun.

export function IsiWarna({
  warna,
  onTambahWarna,
}: {
  /**
   * Baris tabel warna, dibaca dari `warna` di database.
   *
   * Diterima sebagai prop, bukan diambil sendiri lewat fetch di dalam sini,
   * karena daftarnya HARUS bertahan saat tab ditutup. Radix Tabs melepas panel
   * yang tidak aktif, jadi state yang hidup di dalam komponen ini akan hilang
   * begitu pemilik menengok tab Products lalu kembali — dan pemuatan ulang
   * yang tidak perlu itu membuat tabel berkedip kosong setiap kali tabnya
   * dibuka. Pemiliknya (`RegisterProduk`) yang menyimpan.
   */
  warna: WarnaMaster[];
  onTambahWarna: () => void;
}) {
  const columns = useMemo<KolomPratinjau<WarnaMaster>[]>(
    () => [
      {
        key: 'nama',
        label: 'Nama Warna',
        value: (w) => w.nama,
        render: (w) => <span className="font-medium">{w.nama}</span>,
      },
      {
        key: 'kode',
        label: 'Kode Warna',
        value: (w) => w.kode,
        // Kode ditulis apa adanya: huruf besarnya bagian dari nilainya, jadi
        // tidak boleh diubah tampilannya. `tabular-nums` supaya kolom kode
        // pendek ini tetap sejajar saat dibandingkan baris per baris.
        render: (w) => (
          <span className="font-mono text-muted-foreground tabular-nums">
            {w.kode}
          </span>
        ),
      },
    ],
    []
  );

  const searchFields = useMemo(
    () => [
      { label: 'Nama Warna', get: (w: WarnaMaster) => w.nama },
      { label: 'Kode Warna', get: (w: WarnaMaster) => w.kode },
    ],
    []
  );

  // Sengaja TIDAK ada `filterOptions`: pilihan filter untuk kedua kolom ini
  // persis sama dengan barisnya sendiri, jadi mencentang "Hitam" cuma
  // menyisakan satu baris — dan menu Filter yang isinya mengulang isi tabel
  // lebih banyak menyesatkan daripada menolong. Toolbar tetap muncul dengan
  // kotak cari, dropdown Kolom, dan Export; yang hilang cuma tombol Filter.
  // Begitu warna sudah terhubung database dan jumlahnya ratusan, filter
  // per kolom baru punya arti.

  return (
    <TabelPratinjau<WarnaMaster>
      rows={warna}
      columns={columns}
      searchFields={searchFields}
      searchPlaceholder="Cari nama atau kode warna…"
      itemLabel="warna"
      rowKey={(w) => w.kode}
      emptyMessage="Belum ada warna. Tambahkan warna pertama lewat tombol Tambah Warna."
      // Tombol tambah duduk di baris toolbar, bukan di atas tabel: itu tempat
      // yang disediakan `TabelPratinjau` untuk aksi milik halaman, dan
      // menaruhnya di situ membuat barisnya sejajar dengan kotak cari dan
      // Kolom — sama seperti aksi di halaman Master Data.
      actions={
        <Button size="sm" onClick={onTambahWarna}>
          <Plus className="h-4 w-4" />
          Tambah Warna
        </Button>
      }
    />
  );
}

export default IsiWarna;
