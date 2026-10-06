import { useMemo, useState } from 'react';
import { ListFilter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import BannerPratinjau from '@/components/BannerPratinjau';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { rupiah } from '@/lib/format';
import { PRODUK_REGISTER, kartuRegister, type KartuRegister, type ProdukRegister } from '@/lib/produk';
import DetailProduk from './register-produk/DetailProduk';
import FormProdukBaru, { type DataProdukBaru } from './register-produk/FormProdukBaru';

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
// dibandingkan. Sekarang varian dikumpulkan DI DALAM kartu — warnanya diringkas
// per warna, dan rincian warnanya dibuka lagi di dialog detail, persis seperti
// etalase toko: yang penting untuk dilihat sekilas ada di muka, sisanya di
// balik klik.
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

/**
 * Kolom yang bisa disaring — sama gaya dengan Master Data Product, supaya
 * kebiasaan owner di satu halaman berlaku juga di halaman ini.
 *
 * Warna disaring dari `warnaRingkas`, bukan dari `varian`: yang tampil di
 * kartu adalah per warna, jadi jangan sampai filter menawarkan "Hitam (M)"
 * dan "Hitam (L)" sebagai dua pilihan berbeda untuk satu hal yang sama.
 */
export function kolomFilter(semua: KartuRegister[]) {
  const unik = (ambil: (k: KartuRegister) => string[]) => [
    ...new Set(semua.flatMap(ambil)),
  ].sort((a, b) => a.localeCompare(b, 'id'));

  return [
    {
      key: 'kategori',
      label: 'Kategori',
      get: (k: KartuRegister) => k.kategori,
      options: unik((k) => [k.kategori]),
    },
    {
      key: 'brand',
      label: 'Brand',
      get: (k: KartuRegister) => k.brand,
      options: unik((k) => [k.brand]),
    },
    {
      key: 'warna',
      label: 'Warna',
      // Satu warna dihitung SATU KALI per produk: produk yang punya Hitam di
      // S dan M tetap punya satu pilihan "Hitam", bukan dua.
      get: (k: KartuRegister) => k.warnaRingkas.map((w) => w.warna),
      options: unik((k) => k.warnaRingkas.map((w) => w.warna)),
    },
  ];
}

export default function RegisterProduk({
  produkAwal = [],
}: {
  /**
   * Produk hasil form, kalau pemanggil sudah punya.
   *
   * Ada supaya halaman bisa di-render dengan produk dari form TANPA browser:
   * seluruh smoke test repo ini hanya bisa melihat `renderToStaticMarkup`, dan
   * tanpa seam ini mustahil membuktikan produk yang baru disimpan benar-benar
   * muncul sebagai kartu di daftar — bukan hanya bahwa `kartuRegister()`
   * benar saat dipanggil langsung.
   *
   * Itu bukan check sepele. Kalau `katalog` dikembalikan lagi ke
   * `PRODUK_REGISTER` saja, seluruh logika formnya masih benar dan tidak ada
   * satu pun type yang gagal — formnya tetap menyimpan, kartu tetap punya
   * bentuk yang benar, dan tidak ada yang muncul di layar. Banknya kosongkan,
   * dan test yang hanya memanggil `kartuRegister` tetap hijau.
   *
   * Kosong di aplikasi: halaman ini tidak punya pemanggil lain.
   */
  produkAwal?: ProdukRegister[];
} = {}) {
  const [tab, setTab] = useState<(typeof TAB)[number]['id']>('products');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [filter, setFilter] = useState<Record<string, string[]>>({});
  const [formTerbuka, setFormTerbuka] = useState(false);

  // Produk hasil form "Tambah Produk". Terpisah dari `PRODUK_REGISTER` (konstanta
  // contoh) dan AWALNYA KOSONG — jadi data contoh utuh, dan yang dibuat user
  // tinggal di memori sampai halaman dimuat ulang (keputusan owner 28 Sep 2026:
  // "UI dulu", belum menyentuh database).
  const [baru, setBaru] = useState<ProdukRegister[]>(produkAwal);

  // Kartu dibangun ulang dari katalog gabungan, bukan disalin per kartu. Kalau
  // kartu hasil form dirakit sendiri di sini, ringkasan per warna dan totalnya
  // dihitung untuk kedua kali — dan dua hitungan itu bisa berbeda tanpa ada
  // yang salah, karena yang kedua tidak pernah diuji.
  const katalog = useMemo<ProdukRegister[]>(() => [...PRODUK_REGISTER, ...baru], [baru]);
  const semua = useMemo(() => kartuRegister(katalog), [katalog]);
  const kolom = useMemo(() => kolomFilter(semua), [semua]);

  // Pencarian + filter digabung di sini, bukan di `useDataTable`. Hook itu
  // dibangun untuk baris tabel dan prosesnya memakai kolom yang punya
  // `filterMatch`; bentuknya sudah tidak cocok untuk kartu, dan menyalin
  // pipeline-nya berarti dua tempat yang harus dijaga bareng.
  const kartu = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return semua.filter((k) => {
      if (q) {
        const ketemuTeks =
          k.nama.toLowerCase().includes(q) ||
          k.id.toLowerCase().includes(q) ||
          k.kode.toLowerCase().includes(q) ||
          k.kategori.toLowerCase().includes(q) ||
          k.brand.toLowerCase().includes(q) ||
          // Dicocokkan ke `varian`, bukan ke `warnaRingkas`: yang dicari tetap
          // boleh ukuran ATAU kode varian. Ringkasnya per warna, jadi
          // pencarian ukuran seperti "XL" tidak menemukan apa pun.
          k.varian.some(
            (v) =>
              v.warna.toLowerCase().includes(q) ||
              v.kodeWarna.toLowerCase().includes(q) ||
              v.kodeVarian.toLowerCase().includes(q) ||
              v.size.toLowerCase().includes(q)
          );
        if (!ketemuTeks) return false;
      }

      // Filter: semua kolom terpilih harus cocok (AND antar kolom), dan
      // di dalam satu kolom cukup salah satu opsi (OR).
      for (const c of kolom) {
        const dipilih = filter[c.key] ?? [];
        if (!dipilih.length) continue;
        const nilai = c.get(k);
        const punya = Array.isArray(nilai) ? nilai : [nilai];
        if (!dipilih.some((d) => punya.includes(d))) return false;
      }

      return true;
    });
  }, [semua, cari, filter, kolom]);

  const jumlahFilterAktif = Object.values(filter).reduce((n, a) => n + a.length, 0);
  const tersembunyi = semua.length - kartu.length;

  const toggleFilter = (key: string, opsi: string) =>
    setFilter((prev) => {
      const sekarang = prev[key] ?? [];
      const berikut = sekarang.includes(opsi)
        ? sekarang.filter((o) => o !== opsi)
        : [...sekarang, opsi];
      const salin = { ...prev };
      // Kolom tanpa pilihan dihapus, bukan disimpan sebagai array kosong —
      // supaya hitungan filter aktif tidak menyimpan "0" yang tak terlihat.
      if (berikut.length) salin[key] = berikut;
      else delete salin[key];
      return salin;
    });

  // Dialog detail membaca SPESIFIKASI produksi (warna, ukuran, bahan) dari
  // katalog, dan stok gudang per warna dari kartu daftar — dua sumber
  // berbeda, jadi keduanya dicari lewat `detailId` yang sama.
  //
  // Dicari di `semua`, bukan di `kartu` (hasil pencarian/filter): produk yang
  // sedang dibuka tidak boleh hilang dari dialognya sendiri hanya karena
  // diketikkan sesuatu di kotak cari.
  const kartuTerbuka = detailId ? (semua.find((k) => k.id === detailId) ?? null) : null;
  const produkTerbuka = detailId
    ? (katalog.find((p) => p.id === detailId) ?? null)
    : null;

  /**
   * Simpan produk dari form.
   *
   * Id-nya dari penghitung modul-level, bukan `Date.now()`: dua produk yang
   * dibuat dalam milidetik yang sama akan mendapat id kembar, dan id kembar
   * membuat `kartuTerbuka` membuka dua kartu berbeda sekaligus — atau
   * salah satunya. Sama seperti `MaterialFulfillment.tsx`.
   *
   * Tanggal daftar memakai hari ini, dibaca dari jam lokal mesin — bukan
   * `toISOString()`, yang mengembalikan UTC. Aturan GMT+7 antara pukul 00.00
   * dan 07.00 sudah "besok" menurut UTC, jadi produk yang didaftarkan pagi
   * bisa terbaca mundur satu hari.
   */
  function simpanProduk(data: DataProdukBaru) {
    const hariIni = new Date();
    const tgl = [
      hariIni.getFullYear(),
      String(hariIni.getMonth() + 1).padStart(2, '0'),
      String(hariIni.getDate()).padStart(2, '0'),
    ].join('-');

    setBaru((lama) => [
      ...lama,
      {
        ...data,
        id: `PRD-BARU-${lama.length + 1}`,
        registerDate: tgl,
      },
    ]);
    setFormTerbuka(false);
  }

  return (
    <div className="space-y-4">
      {/* Bentuknya kartu, bukan tabel — jadi banner ikut menyesuaikan kalimatnya,
          supaya yang terbaca bukan "tabel 13 kolom" di halaman yang memang
          tidak punya tabel. */}
      <BannerPratinjau modul="Register Produk" bentuk="kartu" />

      {/* Judul halaman saja. Tombol "Tambah Produk" TIDAK lagi di baris ini:
          pemilik memintanya ditukar dengan hitungan jumlah produk, dan
          bagian kirinya dipertahankan utuh — judul di atas, subjudul di
          bawahnya, tanpa apa pun di sisi kanan.

          Alasannya bukan sekadar ruang yang jadi lebih lega. Dua hal yang tadinya
          berbagi baris ini berubah dengan cara yang berbeda: judulnya tidak
          pernah berubah, sementara hitungan berubah setiap kali produk ditambah
          atau filter dipakai. Meletakkan keduanya sebaris membuat mata
          membandingkan dua hal yang salah satunya statis — di baris paling atas
          halaman, yang paling sering dibaca. Yang statis ke atas, yang berubah
          ke bawah. */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Register Produk</h1>
        <p className="text-sm text-muted-foreground">
          Stok per varian dan harga jual — yang bergerak setiap hari
        </p>
      </div>

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

        {/* Pencarian + filter, urutan yang sama dengan Master Data Product: ketik
            dulu, baru persempit. owner sudah terbiasa dengan pasangan ini, dan
            mengubah urutannya di sini justru jadi satu tempat lagi yang harus
            diingat. */}
        <div className="relative w-full max-w-xs sm:w-auto">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari produk, kode, warna…"
            aria-label="Cari produk"
            className="pl-8"
          />
        </div>

        {/* Satu tombol Filter, dengan submenu per kolom — persis seperti Master
            Data Product. `DropdownMenuGroup` membungkus isi menu karena Base UI
            menuntut begitu; tanpa itu seluruh halaman putih. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="gap-2">
                <ListFilter className="h-4 w-4" />
                Filter
                {jumlahFilterAktif > 0 && (
                  <Badge className="ml-0.5 h-5 min-w-5 px-1 tabular-nums">
                    {jumlahFilterAktif}
                  </Badge>
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Saring daftar
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {kolom.map((c) => (
              <DropdownMenuSub key={c.key}>
                <DropdownMenuSubTrigger>
                  {c.label}
                  {(filter[c.key] ?? []).length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {filter[c.key].length}
                    </span>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {c.options.length === 0 ? (
                    <DropdownMenuItem disabled>Tidak ada pilihan</DropdownMenuItem>
                  ) : (
                    c.options.map((o) => (
                      <DropdownMenuCheckboxItem
                        key={o}
                        checked={(filter[c.key] ?? []).includes(o)}
                        onCheckedChange={() => toggleFilter(c.key, o)}
                      >
                        {o}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
            {jumlahFilterAktif > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => setFilter({})}
                    className="justify-center font-medium"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Bersihkan semua filter
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hitungan hasil + tombol "Tambah Produk", satu baris — pertukaran yang
          diminta pemilik: yang tadinya tertulis "4 produk" sekarang berdiri
          berdampingan dengan tombol, dan tombol yang tadinya ada di baris
          judul turun ke baris ini.

          Hitungan tidak hilang, hanya pindah baris. Dia tetap ada karena tanpa
          dia cara satu-satunya untuk tahu filter sedang bekerja adalah menghitung
          kartu sendiri — dan kalau kebetulan jumlahnya sama seperti biasanya,
          orang menyimpulkan filternya tidak jalan.

          Tombolnya di kanan karena itu tempat yang selalu dijangkau ibu jari
          kanan, dan "tambah" adalah aksi yang paling sering diulang di halaman
          ini — bukan "cari", yang sudah punya kotak dan jadi urusan keyboard. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          {tersembunyi > 0
            ? `Menampilkan ${kartu.length} dari ${semua.length} produk`
            : `${semua.length} produk`}
        </p>
        <Button onClick={() => setFormTerbuka(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah Produk
        </Button>
      </div>

      {kartu.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {jumlahFilterAktif > 0
            ? 'Tidak ada produk yang cocok dengan pencarian dan filter ini.'
            : `Tidak ada produk yang cocok dengan "${cari}".`}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {kartu.map((k) => (
            <KartuProduk key={k.id} kartu={k} onBuka={() => setDetailId(k.id)} />
          ))}
        </div>
      )}

      <DetailProduk
        produk={produkTerbuka}
        kartu={kartuTerbuka}
        onTutup={() => setDetailId(null)}
      />

      <FormProdukBaru
        terbuka={formTerbuka}
        sudahAda={baru.length}
        onTutup={() => setFormTerbuka(false)}
        onSimpan={simpanProduk}
      />
    </div>
  );
}

/**
 * Satu kartu produk: foto potret 3:4, nama, harga, dua angka, lalu kaki.
 *
 * Rasionya 3:4, bukan 9:16. Pada lima kolom, kartu hanya ~205px di laptop
 * 1366 dan ~314px di monitor 1920 — dan 9:16 di lebar itu membuat fotonya
 * setinggi ~410px/~614px, sehingga kartu menjulur dan hanya ±4 produk yang
 * terlihat sekali lihat. Itu menegasikan keluhan aslinya ("kegedean bgt").
 * 3:4 memotongnya jadi ~273px/~419px, dan efek sampingnya bagus: ruang di
 * bawah foto bertambah, sehingga label penuh "Total Stock" muat lagi —
 * sedangkan pada 9:16 labelnya HARUS dipendekkan jadi "Total" supaya tidak
 * terpotong, dan "Total Stock" persis string yang diuji smoke test.
 *
 * Baris per warna TIDAK ada di sini — sudah pindah ke dialog detail
 * (permintaan pemilik). Di lebar lima kolom, dua baris warna memakan ruang
 * yang membuat kartu setinggi foto + teks, dan produk 8 varian tetap
 * menzalim 8 baris. Rinciannya tidak hilang: dialog detail membukanya, dan
 * `warnaRingkas` masih utuh untuk pencarian maupun filter.
 */
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
      // `gap-0 p-0` menempelkan foto ke tepi kartu; bawaan Card menyisakan
      // padding yang membuat foto melayang di dalam kotak.
      //
      // Tekanannya `scale(0.97)` dengan `transform-origin` di tengah: kartu
      // adalah elemen yang diklik, jadi ia boleh memberi umpan balik, tapi
      // jarak 3% itu cukup untuk terasa hidup tanpa membuat kartu terlihat
      // bergeser dari tetangganya. `motion-reduce` mematikan transisinya
      // seluruhnya — bukan hanya durasinya, karena transformasi tanpa transisi
      // tetap jadi perubahan posisi yang tidak diumumkan.
      className="cursor-pointer gap-0 p-0 transition-[transform,box-shadow] duration-200 ease-out hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/* Foto SELURUH lebar kartu, bukan kotak kecil di sebelah nama.
          Lebarnya seragam di semua kartu, jadi dua produk bisa dibandingkan
          sekilas tanpa ada yang lebih besar dari yang lain. Teks placeholder-nya
          sengaja kecil: kalau lebih besar dari isi kartu, yang dinilai jadi
          placeholder-nya, bukan kartunya. */}
      <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
        {kartu.foto ? 'FOTO' : '—'}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="min-w-0">
          {/* Dua baris, bukan satu: "Oversized Hoodie Kereta" tidak muat satu
              baris di 205px, dan `truncate` akan memotongnya jadi "Oversized
              Hoodie…" — lebih buruk daripada terbaca dua baris. */}
          <div className="line-clamp-2 text-sm font-medium leading-tight">{kartu.nama}</div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {kartu.kategori}
          </div>
        </div>

        {/* `text-nowrap` supaya "Rp 649.000" tidak pecah jadi dua baris pada
            kartu selebar 205px — satu harga yang terbaca lebih berguna
            daripada dua potongan yang harus disusun ulang di kepala. */}
        <div className="text-nowrap text-sm font-semibold tabular-nums">
          {rupiah(kartu.harga)}
        </div>

        {/* Dua angka, dan keduanya tetap BEDA namanya. Baris warna di
            dialog menjumlah ke "bisa jual"; "Total Stock" adalah isi gudang
            seluruhnya, termasuk yang terikat pesanan dan yang masih menunggu
            diproses. Rowe Tee mis.: 205 + 165 = 370 yang bisa dijual, dari 400
            yang ada. Kalau keduanya sama-sama disebut "total", orang akan
            menghitung sendiri, menemukan selisih, lalu mengira kartu ini
            rusak — jadi pemisahan namanya itu bagian dari angkanya, bukan
            hiasan. */}
        <div className="mt-auto flex items-end justify-between gap-2">
          <AngkaBesar nilai={kartu.totalJual} label="bisa jual" />
          <AngkaBesar nilai={kartu.totalStok} label="Total Stock" />
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">
            {kartu.jumlahWarna} warna · {kartu.jumlahVarian} varian
          </span>
        </div>
      </div>
    </Card>
  );
}

/**
 * Satu angka besar dengan label kecilnya.
 *
 * `tabular-nums` dipakai karena angka-angka ini dibandingkan MELINTAR kartu:
 * membandingkan "400" dengan "85" yang angka nolnya bergeser membuat
 * perbandingannya lambat dan mudah salah baca.
 */
function AngkaBesar({ nilai, label }: { nilai: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-semibold leading-none tabular-nums">{nilai}</span>
      <span className="mt-1 text-[10px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}
