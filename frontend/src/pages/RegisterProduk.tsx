import { useMemo, useState } from 'react';
import BannerPratinjau from '@/components/BannerPratinjau';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { rupiah } from '@/lib/format';
import { PRODUK_REGISTER, kartuRegister, type KartuRegister } from '@/lib/produk';
import DetailProduk from './register-produk/DetailProduk';

// ===== REGISTER > Register Produk =====
//
// Bentuknya mengikuti cara orang membaca daftar barang yang dijual: satu KARTU
// per produk, bukan satu baris per varian.
//
// Kenapa bukan tabel: halaman ini pernah memakai tabel, dan hasilnya terlihat
// seperti halaman Master Data — yang persis yang tidak diinginkan pemilik. Yang
// membedakan Register dari Master Data bukan pertanyaannya ("produk ini apa?")
// tapi angkanya ("produk ini ada berapa, harganya berapa"), jadi tampilannya
// harus berbeda juga, bukan cuma isi tabelnya.
//
// Kenapa satu kartu per produk: dulu tiap varian jadi baris sendiri, sehingga
// satu produk yang punya delapan varian memakan delapan baris dan mustahil
// dibandingkan. Sekarang varian dikumpulkan DI DALAM kartu — warna dan ukuran
// ditumpuk dalam satu tampilan, persis seperti etalase toko.
//
// Tab "Variant" di POS tidak ikut dipasang: tab itu membedakan KATEGORI barang
// (produk jadi vs bahan), sedangkan di sini yang dibutuhkan cuma produknya.
// Tab kedua yang isinya kosong lebih membingungkan daripada tidak ada tab.
//
// Kolom "Waiting for" sudah dihapus sesuai permintaan pemilik. Barang yang
// masih menunggu tidak hilang dari perhitungan — ia tetap dihitung di Total
// Stock (lihat catatan di lib/produk.ts), supaya angka gudang tetap benar.
//
// Data contoh, belum terhubung database — lihat BannerPratinjau.

/** Tab di atas daftar. Satu isinya sekarang, tapi bentuknya sudah tab. */
const TAB = [{ id: 'products', label: 'Products' }] as const;

/** True kalau kata kunci ada di salah satu teks produk ini. */
function cocok(kartu: KartuRegister, kunci: string): boolean {
  if (kunci === '') return true;
  const q = kunci.toLowerCase();
  return (
    kartu.nama.toLowerCase().includes(q) ||
    kartu.id.toLowerCase().includes(q) ||
    kartu.kode.toLowerCase().includes(q) ||
    kartu.kategori.toLowerCase().includes(q) ||
    kartu.varian.some(
      (v) =>
        v.warna.toLowerCase().includes(q) ||
        v.kodeWarna.toLowerCase().includes(q) ||
        v.kodeVarian.toLowerCase().includes(q) ||
        v.size.toLowerCase().includes(q)
    )
  );
}

export default function RegisterProduk() {
  const [tab, setTab] = useState<(typeof TAB)[number]['id']>('products');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const semua = useMemo(() => kartuRegister(), []);
  const kartu = useMemo(() => semua.filter((k) => cocok(k, cari)), [semua, cari]);

  // Dialog detail membaca SPESIFIKASI produksi (warna, ukuran, bahan), dan itu
  // ada di katalog — bukan di kartu daftar. Kartu cuma untuk tampilannya.
  const produkTerbuka = detailId
    ? PRODUK_REGISTER.find((p) => p.id === detailId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Bentuknya kartu, bukan tabel — jadi banner ikut menyesuaikan kalimatnya,
          supaya yang terbaca bukan "tabel 13 kolom" di halaman yang memang
          tidak punya tabel. */}
      <BannerPratinjau modul="Register Produk" bentuk="kartu" />

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
      <div className="flex flex-wrap items-center gap-3">
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

        <Input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari produk, kode, warna…"
          aria-label="Cari produk"
          className="max-w-xs"
        />
      </div>

      {kartu.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Tidak ada produk yang cocok dengan &quot;{cari}&quot;.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {kartu.map((k) => (
            <KartuProduk key={k.id} kartu={k} onBuka={() => setDetailId(k.id)} />
          ))}
        </div>
      )}

      <DetailProduk produk={produkTerbuka} onTutup={() => setDetailId(null)} />
    </div>
  );
}

/** Satu kartu produk: identitas di atas, varian di tengah, angka stok di bawah. */
function KartuProduk({ kartu, onBuka }: { kartu: KartuRegister; onBuka: () => void }) {
  return (
    <Card
      // Area kliknya SELURUH kartu, bukan cuma tombol kecil — di etalase orang
      // mengklik barangnya, bukan tombolnya. Supaya jalur keyboard tetap ada,
      // div ini diberi `tabIndex` + `role="button"` + handler Enter/Space:
      // `onClick` saja tidak pernah dipicu keyboard, jadi tanpa tiga hal itu
      // produk yang tidak bisa di-pointer akan terkunci di halaman ini.
      role="button"
      tabIndex={0}
      onClick={onBuka}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBuka();
        }
      }}
      className="cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-[10px] text-muted-foreground">
            {kartu.foto ? 'FOTO' : 'No foto'}
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{kartu.nama}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{kartu.kategori}</Badge>
              <span className="text-xs text-muted-foreground">{kartu.id}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="text-lg font-semibold tabular-nums">{rupiah(kartu.harga)}</div>

        {/* Angka di baris varian adalah stok yang BISA DIJUAL, sedangkan
            "Total Stock" di bawah menghitung semuanya — termasuk barang yang
            masih menunggu diproses dan yang sudah terikat pesanan. Zahanya
            memang tidak sama, dan itu keadaan nyata, bukan salah hitung.

            Kalau keduanya ditampilkan tanpa keterangan, orang akan menghitung
            sendiri, menemukan selisih, dan mengira kartu ini rusak. Jadi
            tiap baris diberi label dan kedua total dipisahkan namanya. */}
        <ul className="space-y-1.5">
          {kartu.varian.map((v) => (
            <li key={v.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {v.warna} <span className="text-xs">({v.size})</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-[10px] text-muted-foreground/70">{v.kodeVarian}</span>
                <span className="tabular-nums">{v.stokJual} bisa jual</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="justify-between">
        <span className="text-xs text-muted-foreground">
          {kartu.jumlahWarna} warna • {kartu.jumlahVarian} varian
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {kartu.totalJual} bisa jual • Total Stock {kartu.totalStok}
        </span>
      </CardFooter>
    </Card>
  );
}
