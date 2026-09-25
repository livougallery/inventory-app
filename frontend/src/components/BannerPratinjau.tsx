import { TriangleAlert } from 'lucide-react';

// ===== Penanda "belum terhubung ke database" =====
//
// Halaman pratinjau menampilkan data contoh. Kalau tidak ada penanda yang
// terlihat, owner bisa mengira angka di layar itu data asli — dan
// menyetujui tampilan berdasarkan angka yang tidak pernah ada di database.
//
// Jadi penanda ini dipasang di setiap halaman pratinjau, bukan disembunyikan
// di pojok. Dipakai juga sebagai pengingat bagi siapa pun yang membuka kode
// ini nanti.

interface BannerPratinjauProps {
  modul: string;
  jumlahKolom?: number;
  /**
   * Bentuk yang ditampilkan halaman ini.
   *
   * Tidak semua halaman memakai tabel, dan kalimat bawaan yang menyebut tabel
   * akan menyesatkan di halaman yang memang tidak punya tabel — banner ini
   * justru yang dibaca pemilik untuk tahu apa yang sedang dilihatnya.
   * `jumlahKolom` diabaikan pada bentuk papan dan kartu.
   */
  bentuk?: 'tabel' | 'papan' | 'kartu';
}

export default function BannerPratinjau({
  modul,
  jumlahKolom,
  bentuk = 'tabel',
}: BannerPratinjauProps) {
  // Kalimat penutup sengaja ditulis SEKALI di sini, bukan diulang di tiap
  // bentuk. Kalimat itu yang paling penting: tanpanya, pemilik bisa saja
  // mengira angka di layar itu data asli. Kalau nanti kalimatnya diubah,
  // semuanya ikut berubah — bukan diam-diam tertinggal di bentuk lain.
  const penutup =
    ' Isinya bukan data transaksi yang sebenarnya. Koneksi ke database dikerjakan setelah tampilan disetujui.';

  const pembuka =
    bentuk === 'papan'
      ? `Papan ${modul} menampilkan data contoh supaya sebaran kartu antar tahap bisa dinilai dulu.`
      : bentuk === 'kartu'
        ? `Daftar ${modul} menampilkan data contoh supaya susunan kartu produknya bisa dinilai dulu.`
        : `Tabel ${modul}${jumlahKolom ? ` (${jumlahKolom} kolom)` : ''} menampilkan data contoh supaya urutan kolom dan lebar tabel bisa dinilai dulu.`;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">Pratinjau tampilan — belum terhubung ke database</p>
        <p className="text-amber-800 dark:text-amber-200">
          {pembuka}
          {penutup}
        </p>
      </div>
    </div>
  );
}
