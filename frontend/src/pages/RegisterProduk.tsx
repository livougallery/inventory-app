import { useMemo, useState } from 'react';
import { Image as ImageIcon, ListFilter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import BannerPratinjau from '@/components/BannerPratinjau';
import { Badge as BadgeReui } from '@/components/reui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  kartuRegister,
  NAMA_PASAR,
  PRODUK_REGISTER,
  type KartuRegister,
  type Platform,
  type ProdukRegister,
  type StatusPasar,
} from '@/lib/produk';
import { daftarWarna, type WarnaMaster } from '@/lib/warna';
import DetailProduk from './register-produk/DetailProduk';
import FormProdukBaru, { type DataProdukBaru } from './register-produk/FormProdukBaru';
import FormWarnaBaru from './register-produk/FormWarnaBaru';
import IsiWarna from './register-produk/IsiWarna';
import PopupBuktiPasar from './register-produk/PopupBuktiPasar';

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

/**
 * Tab di atas daftar: daftar produk, dan master warna.
 *
 * Dua isinya sengaja BEDA BENTUK. Products menampilkan kartu (ada foto, harga,
 * angka stok); Colour menampilkan tabel dua kolom (nama + kode). Yang dibaca di
 * masing-masing memang berbeda: di Products "produk ini ada berapa", di Colour
 * "warna ini kodenya apa".
 *
 * Keduanya tetap satu halaman karena warna cuma punya arti lewat produk: kode
 * warna masuk ke `kodeVarian` produk, jadi orang yang sedang menyiapkan produk
 * sering perlu menengok daftar kodenya. Dua halaman terpisah memaksa berpindah
 * menu untuk hal yang dipakai bergantian.
 */
const TAB = [
  { id: 'products', label: 'Products' },
  { id: 'colour', label: 'Colour' },
] as const;

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
  const [formWarnaTerbuka, setFormWarnaTerbuka] = useState(false);

  // Bukti pendaftaran yang sedang dibuka: produk + platformnya. Satu state,
  // bukan dua, supaya keduanya tidak mungkin menunjuk kombinasi yang berbeda.
  const [bukti, setBukti] = useState<{ produk: string; status: StatusPasar } | null>(null);

  // Produk hasil form "Tambah Produk". Terpisah dari `PRODUK_REGISTER` (konstanta
  // contoh) dan AWALNYA KOSONG — jadi data contoh utuh, dan yang dibuat user
  // tinggal di memori sampai halaman dimuat ulang (keputusan owner 28 Sep 2026:
  // "UI dulu", belum menyentuh database).
  const [baru, setBaru] = useState<ProdukRegister[]>(produkAwal);

  // Warna tambahan dari form "Tambah Warna", TERPISAH dari warna turunan
  // katalog — dua sumber dengan aturan berbeda: yang turunan tidak bisa
  // dihapus, yang diketik bisa. Menyatukannya jadi satu array akan membuat
  // "warna dari katalog" dan "warna yang baru dibuat" tidak bisa dibedakan lagi.
  //
  // Disimpan di SINI, bukan di dalam `IsiWarna`: Radix Tabs melepas panel yang
  // tidak aktif, jadi state yang hidup di dalam tabnya akan hilang begitu
  // pemilik menengok tab Products lalu kembali.
  const [warnaBaru, setWarnaBaru] = useState<WarnaMaster[]>([]);

  const warna = useMemo<WarnaMaster[]>(() => {
    const peta = new Map<string, WarnaMaster>();
    for (const w of [...daftarWarna(), ...warnaBaru]) {
      if (!peta.has(w.kode)) peta.set(w.kode, w);
    }
    return [...peta.values()];
  }, [warnaBaru]);

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

  /**
   * Simpan warna dari form "Tambah Warna".
   *
   * Kodenya sudah dirapikan jadi huruf besar oleh formnya (lihat
   * `normalisasiKode`), jadi di sini tidak dirapikan lagi — satu tempat
   * merapikan, bukan dua yang bisa berbeda aturannya.
   */
  function simpanWarna(data: WarnaMaster) {
    setWarnaBaru((lama) => [...lama, data]);
    setFormWarnaTerbuka(false);
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

      {/* Tab Products / Colour, bentuk garis bawah — contoh ReUI `c-tabs-2`.
          Dipasang lewat `components/ui/tabs.tsx`, yang varian `line`-nya
          ditambahkan untuk halaman ini; lima halaman lain tetap memakai varian
          `default` yang lama, jadi bentuk pil di sana tidak ikut berubah.

          Sebelumnya di sini ada tablist buatan sendiri dari dua Button, dengan
          catatan "kalau nanti tab kedua benar-benar menyaring, pindah ke Tabs
          bawaan". Tab kedua sudah datang, jadi catatan itu dijalankan. Tabs
          bawaan juga membawa yang tidak bisa ditiru tombol biasa: panah
          kiri/kanan untuk berpindah tab, dan `role="tabpanel"` yang menautkan
          isi ke tabnya untuk pembaca layar. */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as (typeof TAB)[number]['id'])}
      >
        {/* `w-full` dari contoh ReUI-nya dipertahankan supaya barisnya selebar
            halaman, tapi isinya dibuat rata KIRI, bukan rata tengah seperti
            contohnya. Contoh itu hidup di kotak selebar `max-w-xs`, dan di
            sana rata tengah memang yang benar. Di sini tabnya milik satu
            halaman penuh — rata tengah akan menaruh dua tab menggantung di
            tengah layar lebar, terpisah dari judul dan isinya, sementara rata
            kiri sejajar dengan judul di atasnya. */}
        <TabsList variant="line" className="w-full justify-start">
          {TAB.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Pencarian + filter ikut ke DALAM tab Products, bukan tinggal di baris
            tab. Kalau keduanya dibiarkan di luar, ia akan ikut terlihat saat tab
            Colour dibuka — dan kotak "Cari produk, kode, warna…" di atas tabel
            warna menjanjikan pencarian yang tidak dilakukannya. Yang tidak
            menyaring apa pun lebih baik tidak terlihat. */}
        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {kartu.map((k) => (
                <KartuProduk
                  key={k.id}
                  kartu={k}
                  onBuka={() => setDetailId(k.id)}
                  onBukti={(status) => setBukti({ produk: k.nama, status })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Master warna. Isinya cuma nama + kode — lihat catatan di IsiWarna. */}
        <TabsContent value="colour" className="mt-4">
          <IsiWarna warna={warna} onTambahWarna={() => setFormWarnaTerbuka(true)} />
        </TabsContent>
      </Tabs>

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

      <FormWarnaBaru
        terbuka={formWarnaTerbuka}
        // Seluruh warna yang sudah ada, termasuk yang baru dibuat di sesi ini —
        // kalau cuma warna katalog yang dikirim, kode yang baru saja dipakai
        // bisa dimasukkan dua kali.
        kodeTerpakai={warna}
        onTutup={() => setFormWarnaTerbuka(false)}
        onSimpan={simpanWarna}
      />

      <PopupBuktiPasar
        terbuka={bukti !== null}
        produk={bukti?.produk ?? ''}
        status={bukti?.status ?? null}
        onTutup={() => setBukti(null)}
      />
    </div>
  );
}

/**
 * Satu kartu produk: foto potret 3:4 dengan nama/kategori/kode di kakinya,
 * tiga baris marketplace, lalu jumlah warna dan varian.
 *
 * Kenapa harga dan dua angka stok TIDAK lagi di sini (permintaan pemilik,
 * 15 Okt 2026): kartu ini dibaca untuk menjawab "produk ini sudah bisa dijual
 * di mana", bukan "stoknya berapa". Angka stok tetap ada — pindah ke dialog
 * detail, yang memang tempat membacanya, dan di sana angkanya punya ruang
 * untuk disebut lengkap ("bisa jual" vs "Total Stock") tanpa berebut tempat
 * dengan baris marketplace.
 *
 * Kenapa tiga baris marketplace selalu lengkap, termasuk yang "Not
 * registered": yang dicari pemilik di sini justru yang BELUM didaftarkan.
 * Menyembunyikannya akan membuat kartu produk yang belum lengkap terlihat
 * sama dengan yang sudah lengkap — persis kebalikan dari gunanya.
 */
function KartuProduk({
  kartu,
  onBuka,
  onBukti,
}: {
  kartu: KartuRegister;
  onBuka: () => void;
  onBukti: (status: StatusPasar) => void;
}) {
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
      className="cursor-pointer gap-0 overflow-hidden p-0 transition-[transform,box-shadow] duration-200 ease-out hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/* Foto SELURUH lebar kartu, dengan keterangan menempel di kakinya.
          Keterangannya DI ATAS foto (`absolute`), bukan di bawahnya: pada
          empat kolom, satu baris teks yang turun ke bawah foto membuat tinggi
          kartu bergeser satu baris setiap kali nama produknya panjang — dan
          kartu yang tingginya berbeda-beda dalam satu baris grid membuat
          baris marketplace di sebelahnya tidak sejajar.

          Gradien gelapnya wajib, bukan hiasan: nama produk ditulis putih di
          atas foto yang isinya bisa apa saja, dan tanpa gradien foto berwarna
          terang membuat namanya hilang. Gradiennya `to-t` dari hitam 80% ke
          transparan — cukup gelap untuk teks putih, cukup pendek untuk tidak
          menutupi fotonya. */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted/40">
        {kartu.foto ? (
          // Pratinjau: belum ada berkas asli, jadi ditampilkan penanda teks.
          // <img> dengan src kosong akan memicu permintaan gagal ke server.
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-muted-foreground">
            FOTO
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            —
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2.5 pb-2 pt-8">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              {/* Dua baris, bukan satu: "Oversized Hoodie Kereta" tidak muat
                  satu baris di kartu selebar ini, dan `truncate` akan
                  memotongnya jadi "Oversized Hoodie…" — lebih buruk daripada
                  terbaca dua baris. */}
              <div className="line-clamp-2 text-sm font-semibold leading-tight text-white">
                {kartu.nama}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-white/70">
                {kartu.kategori}
              </div>
            </div>
            {/* Kode desain di kanan, sejajar dengan kaki namanya. `shrink-0`
                supaya kode yang panjang mendorong namanya menyempit, bukan
                terpotong sendiri — kode inilah yang dipakai mencocokkan
                produk, jadi ia yang tidak boleh hilang. */}
            <div className="shrink-0 text-[10px] font-medium text-white/90 tabular-nums">
              {kartu.kode}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        {/* Baris marketplace. Tiap baris: ikon platform, namanya, lalu status
            dan tombol bukti di kanan. */}
        <div className="flex flex-col gap-1">
          {kartu.pasar.map((s) => (
            <BarisPasar key={s.platform} status={s} onBukti={() => onBukti(s)} />
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">
            {kartu.jumlahWarna} warna · {kartu.jumlahVarian} varian
          </span>
        </div>
      </div>
    </Card>
  );
}

/**
 * Lencana platform: huruf awal di kotak berwarna khas platformnya.
 *
 * Warnanya SENGAJA hardcoded, bukan token tema — oranye Shopee dan hijau
 * Shopify adalah warna merek, dan lencana yang ikut berubah warna saat tema
 * berganti berhenti jadi pengenal. Karena itu teksnya tetap putih dan kotaknya
 * diberi `aria-hidden`: yang membacakan nama platform untuk pembaca layar
 * adalah teks di sebelahnya, bukan huruf di lencana ini.
 */
const LENCANA_PASAR: Record<Platform, { huruf: string; kelas: string }> = {
  shopee: { huruf: 'S', kelas: 'bg-[#EE4D2D]' },
  tiktok: { huruf: 'T', kelas: 'bg-black' },
  shopify: { huruf: 'S', kelas: 'bg-[#5E8E3E]' },
};

/**
 * Satu baris marketplace: lencana, nama, pill status, dan tombol bukti.
 *
 * Tombol buktinya SELALU ada, juga saat "Not registered". Bukan kelalaian:
 * foto bukti dan status pendaftaran itu dua hal terpisah — bukti bisa sudah
 * diunggah sebelum statusnya diperbarui, dan menyembunyikan tombolnya membuat
 * berkas yang ada jadi tidak bisa dijangkau sama sekali.
 *
 * Tombolnya `stopPropagation`: seluruh kartu ini area klik untuk membuka
 * detail, jadi tanpa itu menekan tombol bukti akan membuka dua hal sekaligus —
 * popup bukti DAN dialog detail produk.
 */
function BarisPasar({
  status,
  onBukti,
}: {
  status: StatusPasar;
  onBukti: () => void;
}) {
  const lencana = LENCANA_PASAR[status.platform];

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white',
          lencana.kelas
        )}
      >
        {lencana.huruf}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">
        {NAMA_PASAR[status.platform]}
      </span>

      {/* Pill status memakai badge reui, tapi warnanya ditulis eksplisit —
          bukan varian `success-outline` bawaannya.

          Alasannya konkret, bukan selera: tema project ini TIDAK punya token
          `--success` (lihat `src/index.css` — hanya primary/secondary/muted/
          accent/destructive). Varian `success-outline` di badge reui memakai
          `text-success-foreground`, dan karena token itu tidak ada, Tailwind v4
          membuangnya diam-diam. Hasilnya "Registered" dan "Not registered"
          tampil sebagai dua pill abu-abu yang sama persis — persis informasi
          yang paling penting di kartu ini, hilang tanpa error.

          Pasangan `bg-green-100 text-green-800` + varian gelapnya mengikuti
          pill status yang sudah dipakai di halaman lain (KartuPo,
          KartuFulfillment, Dashboard), jadi warnanya juga tidak karangan
          sendiri di sini. */}
      <BadgeReui
        variant="outline"
        size="sm"
        radius="full"
        className={cn(
          'gap-1 border-transparent',
          status.terdaftar
            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {/* Titik status, bukan ikon: pada ukuran 10px ikon apa pun berubah jadi
            noda. Titiknya `aria-hidden` karena statusnya sudah terbaca dari
            teks di sebelahnya. */}
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status.terdaftar ? 'bg-green-600 dark:bg-green-400' : 'bg-muted-foreground/50'
          )}
        />
        {status.terdaftar ? 'Registered' : 'Not registered'}
      </BadgeReui>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Lihat foto bukti ${NAMA_PASAR[status.platform]}`}
        title={`Lihat foto bukti ${NAMA_PASAR[status.platform]}`}
        className="shrink-0 text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onBukti();
        }}
      >
        <ImageIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
