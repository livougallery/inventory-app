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
}

export default function BannerPratinjau({ modul, jumlahKolom }: BannerPratinjauProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">Pratinjau tampilan — belum terhubung ke database</p>
        <p className="text-amber-800 dark:text-amber-200">
          Tabel {modul}
          {jumlahKolom ? ` (${jumlahKolom} kolom)` : ''} menampilkan data contoh supaya
          urutan kolom dan lebar tabel bisa dinilai dulu. Isinya bukan data transaksi
          yang sebenarnya. Koneksi ke database dikerjakan setelah tampilan disetujui.
        </p>
      </div>
    </div>
  );
}
