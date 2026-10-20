import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, ListFilter, LoaderCircle, Plus, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react';
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
import { apiJson, unggahFoto, withCsrf } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LogoPlatform } from '@/components/LogoPlatform';
import { BRAND_PRODUK } from '@/lib/opsi';
import {
  kartuRegister,
  NAMA_PASAR,
  type KartuRegister,
  type KelengkapanBom,
  type ProdukRegister,
  type StatusPasar,
} from '@/lib/produk';
import {
  daftarProdukDariApi,
  bodyDariProdukBaru,
  type ProdukApi,
} from '@/lib/registerProduk';
import { type WarnaMaster } from '@/lib/warna';
import type { MaterialApi } from '@/lib/registerProduk';
import type { KeputusanBom } from './register-produk/DetailProduk';
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
// Datanya dari `/api/register-produk/products/register` (produk, varian, stok,
// status marketplace) dan `/api/register-produk/warna` (master warna). Produk
// yang dibuat lewat form Tambah Produk ikut tersimpan ke database, bukan cuma
// hidup di memori sampai halaman dimuat ulang.

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

  // Produk dari database, dan master warna dari database. Dua state terpisah
  // karena keduanya dimuat dari endpoint berbeda dan salah satunya bisa gagal
  // tanpa yang lain ikut kosong.
  const [produk, setProduk] = useState<ProdukRegister[]>([]);
  const [warna, setWarna] = useState<WarnaMaster[]>([]);
  const [materials, setMaterials] = useState<MaterialApi[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  // Berapa produk yang dibuat lewat form DI SESI INI. Bukan `produk.length`:
  // isi database bukan batas sesi, dan menghitungnya begitu membuat halaman
  // berhenti menerima produk baru hanya karena gudangnya sudah banyak isinya.
  const [dibuatSesiIni, setDibuatSesiIni] = useState(0);

  // Galat simpan dipisah per form, bukan satu `galat` bersama. `galat` di atas
  // untuk PEMUATAN, dan pesannya muncul di badan halaman — kalau simpan yang
  // gagal ikut menulis ke situ, pesannya muncul di belakang dialog yang masih
  // terbuka, di tempat yang tidak sedang dilihat orangnya.
  const [menyimpanProduk, setMenyimpanProduk] = useState(false);
  const [galatProduk, setGalatProduk] = useState<string | null>(null);
  const [menyimpanWarna, setMenyimpanWarna] = useState(false);
  const [galatWarna, setGalatWarna] = useState<string | null>(null);

  const muatProduk = useCallback(async () => {
    const json = await apiJson<{ data: ProdukApi[] }>(
      '/api/register-produk/products/register'
    );
    setProduk(daftarProdukDariApi(json.data));
  }, []);

  const muatWarna = useCallback(async () => {
    const json = await apiJson<{ data: WarnaMaster[] }>('/api/register-produk/warna');
    setWarna(json.data);
  }, []);

  const muatMaterials = useCallback(async () => {
    const json = await apiJson<{ data: MaterialApi[] }>('/api/materials');
    setMaterials(json.data);
  }, []);

  /**
   * Muat ulang keduanya, dengan indikator dan pesan galat.
   *
   * Dipakai untuk pemuatan PERTAMA saja. Setelah menyimpan sesuatu, yang
   * dipanggil cukup `muatProduk`/`muatWarna` — menyalakan pemuat penuh di situ
   * membuat seluruh daftar berkedip "Memuat…" padahal isinya sudah ada di
   * layar, dan yang barusan disimpan justru terlihat seperti hilang lalu
   * muncul lagi.
   *
   * Keduanya dimuat BERSAMAAN, bukan berurutan: masing-masing satu perjalanan
   * ke server, dan tidak ada satu pun yang butuh hasil yang lain.
   */
  const muatSemua = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      await Promise.all([muatProduk(), muatWarna(), muatMaterials()]);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setMemuat(false);
    }
  }, [muatProduk, muatWarna, muatMaterials]);

  useEffect(() => {
    muatSemua();
  }, [muatSemua]);

  // Kartu dibangun ulang dari katalog gabungan, bukan disalin per kartu. Kalau
  // kartu hasil form dirakit sendiri di sini, ringkasan per warna dan totalnya
  // dihitung untuk kedua kali — dan dua hitungan itu bisa berbeda tanpa ada
  // yang salah, karena yang kedua tidak pernah diuji.
  //
  // `produkAwal` ikut di sini, bukan menggantikan `produk`: di aplikasi ia
  // selalu kosong (tidak ada pemanggil yang mengisinya), dan gunanya cuma
  // memberi smoke test jalan masuk yang sama dengan yang dipakai data server.
  const katalog = useMemo<ProdukRegister[]>(
    () => [...produk, ...produkAwal],
    [produk, produkAwal]
  );
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
   * Kartu barunya TIDAK dirakit di sini. Yang dikirim cuma body-nya, lalu
   * daftarnya dimuat ulang dari server — jadi bentuk kartu yang muncul setelah
   * menyimpan persis sama dengan bentuk kartu setelah halaman dimuat ulang.
   * Kalau kartunya dirakit lokal, ada dua jalur pembentukan untuk hal yang
   * sama, dan yang satu cuma terpakai sesaat sehingga selisihnya jarang
   * ketahuan.
   *
   * Dialog TIDAK ditutup kalau gagal. Menutupnya berarti menyembunyikan
   * kegagalan di balik form yang hilang, bersama seluruh isian yang sudah
   * diketik — dan orangnya tinggal mengulang dari nol tanpa tahu apa yang
   * salah.
   *
   * `dibuatSesiIni` naik HANYA setelah server menerima. Kalau naik sebelum
   * itu, satu kegagalan tetap memakan jatah batas per sesi.
   */
  async function simpanProduk(data: DataProdukBaru, berkas: File | null) {
    setMenyimpanProduk(true);
    setGalatProduk(null);
    try {
      // Dibaca di luar blok try di bawahnya: nilainya dipakai lagi setelah
      // pengunggahan, dan `const` yang dideklarasikan di dalam `try` tidak
      // bisa dilihat dari luar.
      let dibuat: { id: number } | null = null;
      try {
        const init = await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            bodyDariProdukBaru({
              nama: data.nama,
              kategori: data.kategori,
              designCode: data.spesifikasi.designCode,
              brand: data.brand,
              harga: data.harga,
              warna: data.spesifikasi.warna,
            })
          ),
        });
        const dibuatJson = await apiJson<{ data: { id: number } }>(
          '/api/register-produk/products/register',
          init
        );
        dibuat = dibuatJson.data;
      } catch (e) {
        setGalatProduk(e instanceof Error ? e.message : 'Gagal menyimpan produk');
        return;
      }

      /* Unggahan foto berjalan SETELAH produknya ada, karena endpoint unggah
         membutuhkan id produk dan id itu baru ada setelah POST di atas selesai.

         Kegagalannya DITANGKAP, produknya tidak dibatalkan. Produk yang sudah
         terdaftar tanpa foto masih berguna — foto bisa ditambahkan kapan saja
         dari halaman detail produknya. Membatalkan berarti membuang satu-satunya
         catatan produk ini hanya karena lampirannya gagal, dan itu jauh lebih
         merugikan daripada kartu yang tampil tanpa foto. */
      let fotoGagal: string | null = null;
      if (berkas && dibuat) {
        try {
          await unggahFoto(`/api/register-produk/products/register/${dibuat.id}/foto`, berkas);
        } catch (e) {
          fotoGagal = e instanceof Error ? e.message : 'tidak diketahui';
        }
      }

      setDibuatSesiIni((n) => n + 1);
      setFormTerbuka(false);
      // Dimuat ulang TANPA indikator pemuatan penuh: kembali ke "Memuat…" setelah
      // menyimpan membuat produk yang barusan dibuat terlihat seperti hilang.
      try {
        await muatProduk();
      } catch (e) {
        setGalat(e instanceof Error ? e.message : 'Gagal memuat ulang daftar produk');
      }

      // Ditaruh SETELAH pemuatan ulang: produknya sendiri sudah tampil di daftar,
      // jadi pesan ini terbaca sebagai keterangan tentang kartu yang barusan
      // muncul, bukan sebagai kegagalan menyimpan.
      //
      // Sejak 19 Okt 2026 pesannya MENUNJUK jalan keluarnya (klik foto di
      // dialog detail -> Ganti Foto). Sebelumnya tidak, karena jalan itu memang
      // belum ada: endpoint fotonya cuma dipanggil dari form ini, dan menyuruh
      // orang menekan tombol yang tidak ada lebih buruk daripada diam.
      if (fotoGagal) {
        setGalat(
          `Produk tersimpan, tapi fotonya gagal diunggah (${fotoGagal}). Buka produknya lalu klik kotak fotonya untuk mencoba lagi.`
        );
      }
    } finally {
      /* SELALU hidup lagi, di jalan mana pun keluar dari fungsi ini — termasuk
         `return` di dalam `catch` di atas, dan termasuk kalau pengunggahan
         fotonya yang gagal. Tanpa ini, satu kegagalan menyimpan meninggalkan
         tombolnya berbunyi "Menyimpan…" dan mati selamanya, dengan form yang
         masih terbuka berisi isian yang tidak bisa dikirim ulang. */
      setMenyimpanProduk(false);
    }
  }

  /**
   * Simpan warna dari form "Tambah Warna".
   *
   * Kodenya sudah dirapikan jadi huruf besar oleh formnya (lihat
   * `normalisasiKode`), jadi di sini tidak dirapikan lagi — satu tempat
   * merapikan, bukan dua yang bisa berbeda aturannya.
   *
   * Kembaran kode TIDAK diperiksa di sini lagi: `warna.kode` unik di database,
   * jadi server yang memutuskan, dan balasannya 409 dengan kalimat yang
   * menyebut sebabnya. Pemeriksaan di klien tetap ada di formnya untuk
   * menangkap salah ketik sebelum perjalanan ke server — bukan sebagai
   * pengganti penjagaan di sana.
   */
  async function simpanBom(productId: number, warnaKode: string, keputusan: KeputusanBom[]) {
    const init = await withCsrf({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warna_kode: warnaKode, keputusan }),
    });
    await apiJson(`/api/register-produk/products/register/${productId}/bom`, init);
    await muatProduk();
  }

  async function simpanVarian(
    productId: number,
    warnaKode: string,
    variants: { id?: number; size: string }[],
    warnaKodeBaru?: string,
    hapusSemua = false,
  ) {
    const init = await withCsrf({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warna_kode: warnaKode,
        ...(warnaKodeBaru ? { warna_kode_baru: warnaKodeBaru } : {}),
        variants,
        ...(hapusSemua ? { hapus_semua: true } : {}),
      }),
    });
    await apiJson(`/api/register-produk/products/register/${productId}/variants`, init);
    await muatProduk();
  }

  async function simpanWarna(data: WarnaMaster) {
    setMenyimpanWarna(true);
    setGalatWarna(null);
    try {
      const init = await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode: data.kode, nama: data.nama }),
      });
      await apiJson('/api/register-produk/warna', init);
    } catch (e) {
      setGalatWarna(e instanceof Error ? e.message : 'Gagal menyimpan warna');
      return;
    } finally {
      setMenyimpanWarna(false);
    }

    setFormWarnaTerbuka(false);
    try {
      await muatWarna();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal memuat ulang daftar warna');
    }
  }

  return (
    <div className="space-y-4">
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
        <h1 className="text-2xl font-bold tracking-tight">Register</h1>
      </div>

      {/* Gagal memuat ULANG, padahal isinya sudah ada di layar. Ditaruh di sini
          dan hanya dalam keadaan itu: kegagalan pemuatan PERTAMA ditangani di
          dalam tab, karena di situ yang kosong memang perlu dijelaskan beserta
          jalan keluarnya. Dua pesan untuk satu kegagalan membuat halaman
          terlihat rusak dua kali. */}
      {galat && (produk.length > 0 || warna.length > 0) && (
        <p
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Gagal memuat ulang: {galat} — menampilkan data terakhir yang berhasil dibaca.
        </p>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-3">
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

            <div className="ml-auto flex items-center gap-3">
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
          </div>

          {/* Tiga keadaan berurutan, dan urutannya penting.

              Yang diperiksa lebih dulu adalah APA YANG SEDANG TERJADI, bukan
              apa isinya: halaman yang sedang memuat pertama kali punya
              `semua.length === 0` juga, jadi kalau daftar kosong diperiksa
              duluan, pemuatan yang belum selesai akan berbunyi "Tidak ada
              produk yang cocok dengan pencarian dan filter ini" — pesan yang
              menyalahkan filter padahal filternya belum sempat dipakai.

              Keadaan memuat hanya berlaku saat daftarnya MASIH kosong. Kalau
              ia menimpa daftar yang sudah terisi, menyimpan produk akan
              mengosongkan layar sekejap lalu mengisinya lagi. */}
          {memuat && semua.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Memuat produk…
            </div>
          ) : galat && semua.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
              <p className="mb-3 flex items-center justify-center gap-2 text-sm text-destructive">
                <TriangleAlert className="h-4 w-4" />
                {galat}
              </p>
              <Button variant="outline" size="sm" onClick={muatSemua}>
                Coba lagi
              </Button>
            </div>
          ) : kartu.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              {/* Daftar yang memang kosong dibedakan dari daftar yang tersaring
                  habis. Kalimatnya sama bentuknya, tapi yang pertama
                  menyebutkan tindakannya (tombol Tambah Produk), karena
                  menyarankan "ubah pencarian" di gudang yang belum pernah
                  diisi membuat orang mencari yang tidak ada. */}
              {jumlahFilterAktif > 0
                ? 'Tidak ada produk yang cocok dengan pencarian dan filter ini.'
                : cari.trim()
                  ? `Tidak ada produk yang cocok dengan "${cari}".`
                  : 'Belum ada produk yang terdaftar. Tambahkan yang pertama lewat tombol Tambah Produk.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {/* Lima kolom di layar lebar (permintaan pemilik, 16 Okt 2026):
                  kartunya jadi lebih ramping, dan satu baris memuat lebih banyak
                  produk sekaligus — halaman ini dipakai membandingkan status
                  pendaftaran antar produk, bukan membaca satu produk dalam. */}
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
        warnaMaster={warna}
        materials={materials}
        // Brand: dua sumber, disatukan di sini — brand baku (`BRAND_PRODUK`)
        // dan brand yang sudah dipakai produk lain. Disatukan DI SINI, bukan di
        // dalam panelnya, karena `IsiDetailProduk` meneruskan prop ini apa
        // adanya; kalau penggabungannya dilakukan di bawah, nama propnya
        // ("brand yang sudah dipakai produk lain") tidak lagi cocok dengan
        // isinya, dan pembaca berikutnya salah menyimpulkan dari mana asalnya.
        //
        // Dua sumber itu memang dua-duanya perlu: tanpa brand baku, semua
        // produk yang brandnya masih kosong menghasilkan dropdown KOSONG —
        // persis keluhan pemilik 19 Oktober. Tanpa brand dari produk, sebuah
        // brand lama yang tidak ada di daftar baku tidak bisa dipilih lagi.
        brands={Array.from(new Set([...BRAND_PRODUK, ...produk.map((p) => p.brand)].filter(Boolean)))}
        onSimpanBom={simpanBom}
        onSimpanVarian={simpanVarian}
        onSimpanIdentitas={async (productId, identity) => {
          const init = await withCsrf({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(identity),
          });
          await apiJson(`/api/register-produk/products/register/${productId}`, init);
          await muatProduk();
        }}
        // Jalur unggah yang SAMA dengan form "Tambah Produk" — endpointnya satu
        // (`POST .../register/:id/foto`), jadi tidak ada aturan kedua tentang
        // ukuran/format berkas yang harus dijaga sinkron.
        //
        // Dipanggil dari dialog detail, tempat inilah satu-satunya jalan produk
        // yang terlanjur tersimpan tanpa foto bisa mendapat fotonya.
        onGantiFoto={async (productId, berkas) => {
          await unggahFoto(`/api/register-produk/products/register/${productId}/foto`, berkas);
          await muatProduk();
        }}
        onTutup={() => setDetailId(null)}
      />

      <FormProdukBaru
        terbuka={formTerbuka}
        // Brand: sumber yang SAMA dengan dropdown Brand di dialog detail —
        // brand baku plus brand yang sudah dipakai produk lain. Daftar
        // terpisah untuk brand akan jadi tempat kedua yang harus dijaga
        // sinkron dengan yang pertama.
        //
        // Tanpa `BRAND_PRODUK` di sini, form ini menawarkan dropdown kosong
        // selama belum ada satu pun produk ber-brand — dan begitulah keadaan
        // database saat keluhannya masuk: ketiga produknya ber-brand kosong.
        brands={Array.from(new Set([...BRAND_PRODUK, ...produk.map((p) => p.brand)].filter(Boolean)))}
        // Hitungan SESI INI, bukan `produk.length` — lihat catatan di
        // `dibuatSesiIni`. Isi database bukan batas sesi.
        sudahAda={dibuatSesiIni}
        galat={galatProduk}
        menyimpan={menyimpanProduk}
        onTutup={() => {
          setFormTerbuka(false);
          // Pesan galat lama dibuang saat formnya ditutup. Kalau tidak, form
          // yang dibuka lagi menampilkan kegagalan percobaan sebelumnya di
          // atas isian yang masih kosong — pesan yang menuduh sesuatu yang
          // belum dilakukan.
          setGalatProduk(null);
        }}
        onSimpan={simpanProduk}
      />

      <FormWarnaBaru
        terbuka={formWarnaTerbuka}
        kodeTerpakai={warna}
        galat={galatWarna}
        menyimpan={menyimpanWarna}
        onTutup={() => {
          setFormWarnaTerbuka(false);
          setGalatWarna(null);
        }}
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

        <LencanaKelengkapan kelengkapan={kartu.kelengkapan} />

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2.5 pb-2 pt-8">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              {/* Dua baris, bukan satu: "Oversized Hoodie Kereta" tidak muat
                  satu baris di kartu selebar ini, dan `truncate` akan
                  memotongnya jadi "Oversized Hoodie…" — lebih buruk daripada
                  terbaca dua baris.

                  `data-slot` ada untuk pengujian, bukan gaya. Nama produk
                  dulu bisa ditemukan lewat `h3`, dan itu berhenti benar begitu
                  namanya pindah ke `div` bergradasi ini — smoke test lalu
                  melaporkan "tidak ada kartu" padahal kartunya ada, dan
                  kegagalan yang sebenarnya (deskripsi popup tidak menyebut
                  produk) tenggelam di belakangnya. Hook yang eksplisit tidak
                  ikut berubah saat markupnya dirapikan lagi. */}
              <div
                data-slot="kartu-nama"
                className="line-clamp-2 text-sm font-semibold leading-tight text-white"
              >
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
 * Lencana status kelengkapan BOM di pojok kanan atas foto.
 *
 * DRAFT sampai seluruh jenis aksesoris punya keputusan — dipakai, atau
 * sengaja tidak dipakai ("no need"). Aturannya ada di
 * `fungsiKelengkapanBom` (`lib/produk.ts`), bukan di sini: yang tampil di
 * sini cuma akibatnya, dan halaman ini tidak boleh punya definisi sendiri
 * soal kapan sebuah produk disebut lengkap.
 *
 * Warnanya ditulis eksplisit (`bg-amber-…`), bukan lewat varian badge reui.
 * Sama alasannya dengan pill marketplace di `BarisPasar`: tema project ini
 * tidak punya token `--warning`/`--success`, jadi varian `warning-light`
 * dirender abu-abu tanpa error — lencana yang justru gunanya membedakan
 * keadaan akan terlihat sama saja dengan keadaan lainnya.
 *
 * DRAFT sengaja memakai nada peringatan yang sama dengan banner pratinjau di
 * atas halaman (amber), bukan merah: ini keadaan yang belum selesai, bukan
 * kesalahan. Merah akan membuat seluruh isi database yang BOM-nya belum
 * sempat diisi terlihat rusak.
 */
function LencanaKelengkapan({ kelengkapan }: { kelengkapan: KelengkapanBom }) {
  return (
    <BadgeReui
      variant="outline"
      size="sm"
      radius="full"
      className={cn(
        'absolute right-2 top-2 gap-1 border-transparent shadow-sm backdrop-blur-sm',
        kelengkapan.lengkap
          ? 'bg-green-100/95 text-green-800 dark:bg-green-950/90 dark:text-green-300'
          : 'bg-amber-100/95 text-amber-900 dark:bg-amber-950/90 dark:text-amber-200'
      )}
    >
      {/* Titik status, sama seperti pill marketplace: pada ukuran 10px ikon
          apa pun berubah jadi noda. */}
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          kelengkapan.lengkap ? 'bg-green-600 dark:bg-green-400' : 'bg-amber-500'
        )}
      />
      {kelengkapan.lengkap ? 'COMPLETED' : 'DRAFT'}
    </BadgeReui>
  );
}

/**
 * Satu baris marketplace: logo, nama, pill status, dan tombol bukti.
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
  return (
    <div className="flex items-center gap-2">
      <LogoPlatform platform={status.platform} className="h-4 w-4 shrink-0" />
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
