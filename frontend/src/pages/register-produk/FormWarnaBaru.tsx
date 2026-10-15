import { useState, type CSSProperties } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalisasiKode, type WarnaMaster } from '@/lib/warna';

// ===== Form warna baru =====
//
// Dipanggil dari tombol "Tambah Warna" di tab Colour. Isinya SENGAJA cuma dua
// field — nama dan kode. Master warna memang tidak punya atribut lain: yang
// disimpan di sana cuma pasangan nama-kode yang dipakai `kodeVarian` produk.
// Field tambahan seperti "keterangan" atau "contoh warna" akan menambah kolom
// yang tidak dibaca siapa pun, lalu terisi separuh dan jadi tebakan saat
// difilter.
//
// DIEKSPOR TERPISAH dari pembungkusnya, mengikuti pola `IsiFormProdukBaru`:
// `DialogContent` hidup di dalam portal, dan portal tidak ikut muncul di
// `renderToStaticMarkup`. Tanpa ekspor terpisah, satu-satunya cara memeriksa
// isi form ini adalah membukanya di browser.

/**
 * Kode warna tidak boleh kembar.
 *
 * Kode ini jadi identitas baris di daftar warna sekaligus masuk ke
 * `kodeVarian` (mis. `LVU-TOP-11-HTP-M`). Dua baris dengan kode sama berarti
 * dua warna yang tampak berbeda di layar ini tapi mustahil dibedakan saat
 * mencocokkan varian — persis jenis kesalahan yang membuat daftar master tidak
 * lagi bisa dipercaya.
 */
function galatKode(kode: string, terpakai: WarnaMaster[]): string | null {
  const bentrok = terpakai.find((w) => w.kode === kode);
  return bentrok ? `Kode ${kode} sudah dipakai warna "${bentrok.nama}".` : null;
}

/**
 * Nama warna juga tidak boleh kembar — dengan kode BERBEDA.
 *
 * Dua baris "Hitam" dengan kode HTP dan BLK bukan dua warna, itu satu warna
 * yang salah ketik. Katalog sendiri sudah memperlakukan nama yang sama sebagai
 * satu warna (lihat `daftarWarna`), jadi membiarkannya masuk akan membuat
 * halaman ini menghitung satu warna sebagai dua.
 */
function galatNama(nama: string, terpakai: WarnaMaster[]): string | null {
  const bentrok = terpakai.find((w) => w.nama.toLowerCase() === nama.toLowerCase());
  return bentrok
    ? `Warna "${nama}" sudah terdaftar dengan kode ${bentrok.kode}.`
    : null;
}

export function IsiFormWarnaBaru({
  kodeTerpakai,
  onSimpan,
  onTutup,
}: {
  /** Warna yang sudah ada, untuk menolak kode/nama kembar. */
  kodeTerpakai: WarnaMaster[];
  onSimpan: (data: WarnaMaster) => void;
  onTutup: () => void;
}) {
  const [nama, setNama] = useState('');
  const [kode, setKode] = useState('');
  const [galat, setGalat] = useState<string | null>(null);

  function simpan() {
    const namaRapi = nama.trim();
    const kodeRapi = normalisasiKode(kode);

    if (!namaRapi) {
      setGalat('Nama warna wajib diisi.');
      return;
    }
    if (!kodeRapi) {
      setGalat('Kode warna wajib diisi.');
      return;
    }

    const gKode = galatKode(kodeRapi, kodeTerpakai);
    if (gKode) {
      setGalat(gKode);
      return;
    }
    const gNama = galatNama(namaRapi, kodeTerpakai);
    if (gNama) {
      setGalat(gNama);
      return;
    }

    onSimpan({ kode: kodeRapi, nama: namaRapi });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        simpan();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="warna-nama">Nama Warna</Label>
        <Input
          id="warna-nama"
          value={nama}
          onChange={(e) => {
            setNama(e.target.value);
            // Pesan galat dibuang begitu ada yang diperbaiki, bukan dibiarkan
            // menggantung sampai tombol Simpan ditekan lagi: pesan yang masih
            // terpampang padahal masalahnya sudah dibereskan membuat orang
            // menekan Simpan dua kali untuk hal yang sama.
            setGalat(null);
          }}
          placeholder="mis. Hitam"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="warna-kode">Kode Warna</Label>
        {/* Huruf besar dipasang saat diketik, bukan saat disimpan.
            Kode masuk ke `kodeVarian` dan dipakai apa adanya, jadi "htp" dan
            "HTP" adalah dua kode berbeda bagi pencocokan teks. Menampilkannya
            huruf besar sambil diketik membuat yang tersimpan sama dengan yang
            terlihat — kalau perapiannya disembunyikan sampai Simpan, kode yang
            tampak "htp" berubah sendiri jadi "HTP" tanpa ada yang mengubahnya. */}
        <Input
          id="warna-kode"
          value={kode}
          onChange={(e) => {
            setKode(normalisasiKode(e.target.value));
            setGalat(null);
          }}
          placeholder="mis. HTP"
          className="font-mono uppercase"
          aria-describedby="warna-kode-bantuan"
        />
        <p id="warna-kode-bantuan" className="text-xs text-muted-foreground">
          Kode pendek huruf besar. Dipakai di kode varian, mis. LVU-TOP-11-HTP-M.
        </p>
      </div>

      {galat && (
        <p className="flex items-center gap-2 text-sm text-red-600" role="alert">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {galat}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onTutup}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  );
}

export default function FormWarnaBaru({
  terbuka,
  kodeTerpakai,
  onTutup,
  onSimpan,
}: {
  terbuka: boolean;
  kodeTerpakai: WarnaMaster[];
  onTutup: () => void;
  onSimpan: (data: WarnaMaster) => void;
}) {
  return (
    <Dialog
      open={terbuka}
      onOpenChange={(buka) => {
        if (!buka) onTutup();
      }}
    >
      {/* Dialog kecil, bukan selebar `FormProdukBaru`: isinya dua field pendek,
          dan dialog lebar untuk dua kotak membuat matanya harus menempuh jarak
          yang tidak perlu. Durasi dan skala masuknya tetap sama dengan dua
          dialog lain di halaman ini supaya terasa satu keluarga. */}
      <DialogContent
        className="duration-300 ease-out sm:max-w-md"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        <DialogHeader>
          <DialogTitle>Tambah Warna</DialogTitle>
          <DialogDescription>
            Warna baru dipakai di kode varian produk.
          </DialogDescription>
        </DialogHeader>
        <IsiFormWarnaBaru
          kodeTerpakai={kodeTerpakai}
          onSimpan={onSimpan}
          onTutup={onTutup}
        />
      </DialogContent>
    </Dialog>
  );
}
