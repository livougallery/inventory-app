import { ImageOff } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NAMA_PASAR, type StatusPasar } from '@/lib/produk';

// ===== Popup bukti pendaftaran marketplace =====
//
// Dibuka dari tombol kotak kecil di tiap baris marketplace pada kartu produk.
// Isinya SENGAJA cuma gambar: tombolnya ada untuk menjawab satu pertanyaan
// ("buktinya mana?"), dan teks penjelasan di sekeliling gambar justru
// memperlambat jawaban itu.
//
// ====== BELUM ADA SUMBER DATANYA ======
// `fotoBukti` saat ini SELALU null di seluruh katalog — lihat catatan di
// `StatusPasar`, lib/produk.ts. Yang belum diputuskan bukan bentuk fotonya
// (satu gambar per produk per platform), melainkan TABEL MANA yang menyimpannya.
// Sampai itu diputuskan, popup ini menampilkan keadaan kosongnya dengan jujur —
// bukan menyembunyikan tombolnya, karena tombol yang hilang membuat alurnya
// tidak bisa dinilai sama sekali.
//
// DIEKSPOR TERPISAH dari pembungkusnya, mengikuti pola `IsiFormProdukBaru`:
// `DialogContent` hidup di portal, dan portal tidak ikut muncul di
// `renderToStaticMarkup` — jadi isinya tidak bisa diperiksa lewat render server
// kalau tidak dipisah.

export function IsiBuktiPasar({
  produk,
  status,
}: {
  produk: string;
  status: StatusPasar;
}) {
  const platform = NAMA_PASAR[status.platform];

  return (
    <div className="space-y-4">
      {status.fotoBukti ? (
        <img
          src={status.fotoBukti}
          alt={`Bukti pendaftaran ${produk} di ${platform}`}
          className="max-h-[70vh] w-full rounded-md border object-contain"
        />
      ) : (
        // Kotak kosong yang menjelaskan dirinya sendiri, bukan <img> dengan src
        // kosong: src kosong memicu permintaan gagal ke server dan menampilkan
        // ikon gambar rusak — terbaca seperti berkasnya hilang, padahal memang
        // belum pernah ada.
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 text-center">
          <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Belum ada foto bukti.</p>
          <p className="max-w-xs px-6 text-xs text-muted-foreground">
            Foto bukti pendaftaran {produk} di {platform} belum diunggah.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PopupBuktiPasar({
  terbuka,
  produk,
  status,
  onTutup,
}: {
  terbuka: boolean;
  /** Nama produk — dipakai di judul dan di alt gambar. */
  produk: string;
  /** Status platform yang dibuka. `null` = tidak ada yang dibuka. */
  status: StatusPasar | null;
  onTutup: () => void;
}) {
  // Tidak dirender sama sekali saat tertutup. Bukan sekadar optimasi: tanpa ini
  // judulnya membaca `status.platform` pada nilai null.
  if (!status) return null;

  return (
    <Dialog
      open={terbuka}
      onOpenChange={(buka) => {
        if (!buka) onTutup();
      }}
    >
      <DialogContent
        className="duration-300 ease-out sm:max-w-lg"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        <DialogHeader>
          <DialogTitle>Bukti Pendaftaran — {NAMA_PASAR[status.platform]}</DialogTitle>
          <DialogDescription>
            {produk} · {status.terdaftar ? 'Terdaftar' : 'Belum terdaftar'}
          </DialogDescription>
        </DialogHeader>
        <IsiBuktiPasar produk={produk} status={status} />
      </DialogContent>
    </Dialog>
  );
}
