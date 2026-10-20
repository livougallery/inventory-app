import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProdukRegister } from '@/lib/produk';
import { BRAND_PRODUK, KATEGORI_PRODUK } from '@/lib/opsi';

// ===== Form registrasi produk baru =====
//
// Dipanggil dari tombol "Tambah Produk" di Register Produk. Berbeda dari
// `DetailProduk` (yang MEMBUKA produk yang sudah ada): yang ini mendaftarkan
// produknya, lalu sisanya diisi belakangan di halaman detail.
//
// ENAM FIELD, bukan empat belas (permintaan pemilik, 19 Oktober 2026).
//
// Dulu form ini juga meminta harga, batch, kategori vendor, vendor/CMT, warna,
// ukuran, dan tabel kode varian — satu halaman penuh sebelum satu produk pun
// terdaftar. Yang diminta sekarang persis yang sudah diketahui orang di depan
// barangnya: nama, brand, foto, kategori, kode SKU, tanggal. Sisanya memang
// belum diketahui saat mendaftar — harganya belum diputuskan, warnanya baru
// menyusul, kode varian bahkan belum dibuat. Memaksanya di sini berarti
// mengarang jawaban, dan yang paling sering terjadi: form ditinggalkan di
// tengah jalan.
//
// Varian TIDAK dibuat di sini lagi. Produk lahir tanpa varian, dan variannya
// ditambahkan di halaman detail produk — di sana warnanya sudah terpampang
// bersama kain, aksesoris, dan stoknya, jadi keputusannya diambil di tempat
// yang memang membicarakannya. Ini juga menghapus satu jalur pembentukan
// varian: dulu form ini merakit `spesifikasi.warna` sendiri, dan bentuk
// rakitannya harus persis sama dengan bentuk kiriman API supaya form "Tambah
// Produksi" bisa membacanya. Sekarang jalur itu cuma satu.
//
// Fotonya diunggah SETELAH produknya tersimpan, bukan ikut di dalam POST-nya:
// endpoint unggah butuh id produk, dan id itu baru ada setelah produknya
// dibuat. Kalau unggahannya gagal, produknya tetap terdaftar — pesannya
// muncul di halaman, bukan di form ini, karena yang gagal bukan pendaftarannya.
//
// Bentuk field-nya diambil dari `ProdukRegister`/`SpesifikasiProduksi` di
// `lib/produk.ts`, bukan dikarang. Kalau bentuknya menyimpang sedikit saja,
// produk yang dibuat di sini tidak akan bisa ikut dipakai form "Tambah
// Produksi" yang pengisian otomatisnya membaca spesifikasi itu — dan itu baru
// ketahuan jauh nanti, saat form produksi gagal terisi sendiri.

/**
 * Brand bawaan yang dicoba dipakai lebih dulu kalau ia ada di daftar.
 *
 * LIVOU adalah merek utama grup ini, dan itu sebabnya mockup pemilik
 * menampilkannya terisi. Tetap harus dicek ke daftarnya: nilai bawaan yang
 * tidak ada di pilihan akan tampil sebagai kotak KOSONG — bukan "LIVOU" —
 * karena pilihan kotaknya memang cuma berisi brand yang terdaftar.
 */
const BRAND_UTAMA = BRAND_PRODUK[0];

/**
 * Berapa produk yang boleh dibuat dalam satu sesi.
 *
 * Tanpa batas, satu klik yang salah menumpuk baris di database yang tidak bisa
 * dihapus dari mana pun — halaman ini tidak punya tempat untuk menghapus, jadi
 * semuanya cuma jadi sampah yang harus dibersihkan manual. Batas inilah yang
 * harus diubah kalau owner butuh lebih, bukan dibiarkan menumpuk diam-diam.
 */
export const MAKS_PRODUK_BARU = 3;

/** Yang dikirim ke halaman. `id` dan `registerDate` diisi pemanggil. */
export type DataProdukBaru = Omit<ProdukRegister, 'id' | 'registerDate'>;

/** Tanggal hari ini sebagai `YYYY-MM-DD`, bentuk yang sama dengan `registerDate`. */
function tanggalHariIni(): string {
  // Dipotong dari ISO, bukan dirakit dari getDate()/getMonth(): perakitan
  // manual gampang salah di angka bulan (Januari = 0) dan di nol di depan.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Badan form, TANPA `Dialog`.
 *
 * `DialogContent` dirender lewat portal, dan portal tidak ikut muncul di
 * `renderToStaticMarkup` — jadi kalau formnya tidak dipisah, smoke test yang
 * merendernya hanya akan melihat `<div></div>` dan semua pemeriksaan isinya
 * akan lulus karena tidak menemukan apa pun. Pola yang sama dipakai
 * `IsiFormPoBaru` dan `IsiDetailProduk`.
 *
 * `brands` dan `onSimpan` sengaja WAJIB, bukan opsional dengan bawaan kosong:
 * form yang tidak menerima daftar brand akan menampilkan kotak brand yang
 * kosong, dan itu bentuk paling halus dari form yang tidak bisa dipakai.
 */
export function IsiFormProdukBaru({
  brands,
  onSimpan,
  onTutup,
  sudahAda,
  galat,
  menyimpan = false,
}: {
  /**
   * Brand yang sudah dipakai produk lain, dari halaman.
   *
   * Boleh KOSONG — dan itu keadaan nyata, bukan cuma kasus uji: database yang
   * belum punya satu produk pun tidak punya brand untuk ditawarkan. Kotaknya
   * karena itu jatuh ke isian bebas saat daftarnya kosong; lihat `pakaiPilihan`.
   */
  brands: string[];
  /**
   * `berkas` dipisah dari `data` karena keduanya menempuh jalan yang berbeda:
   * `data` dikirim sebagai JSON, `berkas` sebagai multipart setelah produknya
   * punya id. Menggabungkannya jadi satu parameter berarti salah satu bentuk
   * harus dipaksa masuk ke bentuk yang lain.
   */
  onSimpan: (data: DataProdukBaru, berkas: File | null) => void;
  onTutup: () => void;
  /** Berapa produk baru yang sudah dibuat di sesi ini. */
  sudahAda: number;
  /** Galat dari server saat menyimpan. Ditampilkan di dalam formnya. */
  galat?: string | null;
  /** Sedang mengirim ke server: tombolnya mati supaya tidak terkirim dua kali. */
  menyimpan?: boolean;
}) {
  const [nama, setNama] = useState('');
  const [kategori, setKategori] = useState('');
  const [designCode, setDesignCode] = useState('');
  const [berkas, setBerkas] = useState<File | null>(null);

  /* Pilihan brand: yang sudah dipakai produk lain, dirapikan dari duplikat dan
     dari yang kosong. Brand kosong BUKAN pilihan — ia catatan lama yang belum
     pernah diisi, dan menawarkannya sebagai pilihan berarti menawarkan
     "kosong" sebagai sebuah merek. */
  const pilihanBrand = useMemo(
    () => Array.from(new Set(brands.filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [brands]
  );

  /* Tanpa satu pun brand yang diketahui, kotak pilihannya tidak punya isi dan
     formnya jadi buntu tanpa penjelasan — persis kegagalan yang dulu terjadi
     pada master warna. Karena itu kotaknya jatuh ke isian bebas; lihat
     pemakaian `pakaiPilihan` di bawah. */
  const pakaiPilihan = pilihanBrand.length > 0;

  const [brand, setBrand] = useState(() => {
    if (pilihanBrand.length === 0) return BRAND_UTAMA;
    return pilihanBrand.includes(BRAND_UTAMA) ? BRAND_UTAMA : pilihanBrand[0];
  });

  /* Tanggal pendaftaran: dihitung SEKALI saat formnya dibuka, bukan tiap
     render. Form yang dibiarkan terbuka melewati tengah malam tidak boleh
     berubah tanggal di depan matanya — angka yang bergerak sendiri membuat
     orang ragu apakah isiannya ikut berubah. */
  const [tanggal] = useState(tanggalHariIni);

  /* Pratinjau foto. Object URL-nya dibuat di penangan perubahan, BUKAN saat
     render: render bisa dijalankan berkali-kali, dan setiap object URL yang
     dibuat di sana menahan berkasnya di memori tanpa pernah dilepas. */
  const [pratinjau, setPratinjau] = useState<string | null>(null);

  useEffect(() => {
    // Yang dilepas cuma URL terakhir. URL sebelumnya sudah dilepas oleh
    // `gantiBerkas` saat digantikan — melepasnya lagi di sini tidak
    // berpengaruh (revoke pada URL yang sudah dilepas tidak error), tapi
    // daftar URL lama tidak disimpan karena tidak ada yang membutuhkannya.
    return () => {
      if (pratinjau) URL.revokeObjectURL(pratinjau);
    };
  }, [pratinjau]);

  function gantiBerkas(f: File | null) {
    setPratinjau((lama) => {
      if (lama) URL.revokeObjectURL(lama);
      return f ? URL.createObjectURL(f) : null;
    });
    setBerkas(f);
  }

  const batasTercapai = sudahAda >= MAKS_PRODUK_BARU;

  /**
   * Kenapa form ini belum bisa disimpan.
   *
   * Nama, kategori, dan design code tetap wajib karena tiga hal: nama yang
   * dipakai form produksi untuk mencari produk, kategori untuk filter di
   * kartu, dan design code yang jadi bagian kode varian. Brand tidak masuk
   * daftar ini karena kotaknya sudah selalu terisi — pilihan maupun isian
   * bebasnya berangkat dari nilai bawaan. Foto juga tidak wajib: produk bisa
   * difoto belakangan.
   *
   * Yang WAJIB-ISI tidak lagi menghasilkan pesan. Kotak kuningnya dulu muncul
   * begitu form dibuka — tiga baris teguran untuk form yang belum sempat
   * disentuh — dan itu terbaca sebagai kesalahan padahal cuma keadaan awal
   * (permintaan pemilik, 19 Oktober 2026). Tanda bintang di label sudah
   * mengatakan mana yang wajib, dan tombol Simpan yang mati sudah mengatakan
   * bahwa formnya belum lengkap; pesannya cuma mengulang keduanya.
   *
   * Batas per sesi BUKAN bagian dari daftar wajib-isi, dan itu satu-satunya
   * yang pesannya tetap ditampilkan. Tombol yang mati karena batas tidak bisa
   * dijelaskan oleh tanda bintang mana pun, dan form yang tombolnya mati tanpa
   * alasan persis kegagalan "buntu tanpa penjelasan" yang halaman ini sudah
   * pernah alami.
   */
  const masalah: string[] = [];
  if (batasTercapai) {
    masalah.push(
      `Batas ${MAKS_PRODUK_BARU} produk per sesi sudah tercapai. Muat ulang halaman untuk mulai dari awal.`
    );
  }

  const belumLengkap = !nama.trim() || !kategori || !designCode.trim();

  function simpan() {
    if (masalah.length > 0 || belumLengkap) return;

    onSimpan(
      {
        nama: nama.trim(),
        // Brand kosong jatuh ke bawaan: kolomnya `NOT NULL DEFAULT ''` di
        // database, dan merek yang kosong membuat penyaringan per brand di
        // halaman ini tidak pernah cocok dengan apa pun.
        brand: brand.trim() || BRAND_UTAMA,
        kategori,
        // Harga 0 = belum ditetapkan, bukan gratis. Halaman ini tidak
        // menampilkan harga di mana pun sejak 15 Oktober 2026 (pindah ke
        // dialog detail), jadi angka 0 di sini tidak pernah terbaca sebagai
        // "harganya nol" — yang butuh harga akan mengisinya saat produknya
        // dibuka.
        harga: 0,
        // Fotonya BELUM ada saat baris ini dibuat. Yang mengisinya adalah
        // pengunggahan sesudah produknya tersimpan, dan hasilnya baru
        // terbaca setelah daftarnya dimuat ulang dari server.
        foto: null,
        spesifikasi: {
          designCode: designCode.trim(),
          kategori,
          // Batch, vendor, dan warna sengaja kosong: ketiganya belum diketahui
          // saat produk didaftarkan, dan variannya dibuat di halaman detail.
          // Mengisinya di sini berarti mengarang jawaban.
          batch: '',
          kategoriVendor: '',
          namaVendor: '',
          warna: [],
          // BOM dan aksesori juga kosong. Produk yang baru didaftarkan belum
          // punya kebutuhan bahan yang disetujui — mengisinya di sini berarti
          // mengarang angka konsumsi yang nanti dipakai menghitung HPP.
          kain: [],
          aksesori: [],
        },
      },
      berkas
    );
  }

  return (
    <div className="space-y-5">
      {/* Enam isian, satu kolom — persis urutan di mockup. Sengaja tidak
          dibagi jadi beberapa bagian berjudul: dengan enam isian, judul
          bagiannya cuma menambah baris tanpa menambah keterangan. */}
      <div className="space-y-3">
        <Field label="Nama Produk" wajib>
          <Input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="mis. Oversized Hoodie Kereta"
            aria-label="Nama Produk"
          />
        </Field>

        <Field label="Brand">
          {pakaiPilihan ? (
            /* Pilihan, bukan ketikan bebas. Brand yang diketik tangan
               bercabang jadi banyak ejaan untuk satu merek yang sama
               ("Livou", "livou", "Livou "), dan itu merembet ke mana-mana:
               penyaringan dan pengelompokan per brand jadi tidak pernah
               cocok. Isinya diambil dari brand produk yang sudah ada, jadi
               pilihannya bertambah sendiri begitu ada produk dengan brand
               baru.

               Tanpa `value` yang cocok dengan salah satu item, Base UI
               mencetak nilai apa adanya — jadi nilai bawaannya WAJIB berasal
               dari daftarnya sendiri (lihat `useState` di atas). */
            <Select value={brand} onValueChange={(v) => setBrand(v ?? '')}>
              <SelectTrigger className="w-full" aria-label="Brand">
                <SelectValue placeholder="Pilih brand">{(v) => v || null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pilihanBrand.map((namaBrand) => (
                  <SelectItem key={namaBrand} value={namaBrand}>
                    {namaBrand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            /* Belum ada satu produk pun, jadi belum ada brand yang bisa
               ditawarkan. Isian bebas di sini bukan kemunduran: brand pertama
               yang diketik orang inilah yang mengisi daftar pilihannya untuk
               produk-produk berikutnya. */
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder={BRAND_UTAMA}
              aria-label="Brand"
            />
          )}
        </Field>

        <Field label="Foto">
          <div className="space-y-2">
            {/* `file:` pada kelas Input sudah ada di komponennya (lihat
                components/ui/input.tsx), jadi tombol "Choose File"-nya ikut
                gaya yang sama tanpa disetel ulang di sini. */}
            <Input
              type="file"
              accept="image/*"
              aria-label="Foto"
              onChange={(e) => gantiBerkas(e.target.files?.[0] ?? null)}
            />
            {pratinjau && (
              <div className="flex items-center gap-3">
                {/* Foto produk dipotret potret (4:5) — pratinjaunya memakai
                    proporsi yang sama supaya yang terlihat di sini sama
                    dengan yang nanti tampil di kartu. */}
                <div className="aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={pratinjau} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{berkas?.name}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => gantiBerkas(null)}
                    className="mt-1 h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="mr-1 h-3 w-3" />
                    Batalkan foto ini
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Field>

        <Field label="Kategori" wajib>
          <Select value={kategori} onValueChange={(v) => v !== null && setKategori(v)}>
            <SelectTrigger className="w-full" aria-label="Kategori">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {KATEGORI_PRODUK.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Kode SKU / Design Code" wajib>
          <Input
            value={designCode}
            onChange={(e) => setDesignCode(e.target.value)}
            placeholder="mis. LVU-TOP-11"
            aria-label="Kode SKU / Design Code"
          />
        </Field>

        <Field label="Date Registered">
          {/* Tanggalnya dari server, bukan dari sini: `created_at` diisi
              database saat barisnya dibuat, dan itulah tanggal yang tampil di
              kartu. Kolom ini menampilkan tanggal itu apa adanya supaya orang
              tahu produk ini akan tercatat tanggal berapa — ia TIDAK dikirim
              ke server. `readOnly` + `disabled`, bukan salah satu saja:
              keduanya menutup jalan yang berbeda (mengetik vs. memfokuskan
              dan mengubah nilainya). */}
          <Input value={tanggal} readOnly disabled aria-label="Date Registered" />
        </Field>
      </div>

      {/* ── Kaki ──────────────────────────────────────────────────── */}
      {masalah.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <ul className="list-inside list-disc space-y-0.5">
            {masalah.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Galat dari server, di ATAS tombolnya.
          Ditaruh di dalam form, bukan di badan halaman: dialog ini menutupi
          halamannya, jadi pesan yang muncul di belakangnya tidak akan terbaca
          oleh orang yang sedang menatap form -- dan isian yang sudah diketik
          ikut hilang kalau dialognya keburu ditutup. */}
      {galat && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{galat}</span>
        </div>
      )}

      {/* Kaki form: tombol saja.

          Dulu ada baris hitungan di sebelah kiri ("Bisa menambah 3 produk lagi
          di sesi ini. Varian dan bahan diisi setelahnya..."). Ia dibuang 19
          Oktober 2026 atas permintaan pemilik: yang dibutuhkan orang di layar
          ini cuma tombolnya, dan penjelasan sisa pekerjaan justru terbaca
          seolah ada langkah tambahan yang harus diselesaikan sekarang.
          Yang tetap tampil hanya peringatan batas, karena ia menjelaskan
          tombol yang mati; lihat `masalah` di atas. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <div className="flex gap-2">
          {/* Batal hanya menutup. Dulu `onClick={onSimpan}` di sini — satu
              kata yang salah, dan tombol yang paling sering dipakai untuk
              membatalkan justru menjadi cara tercepat membuat produk setengah
              jadi. */}
          <Button variant="outline" onClick={onTutup} disabled={menyimpan}>
            Batal
          </Button>
          {/* Mati selama pengiriman. Tanpa itu, dua klik cepat mengirim dua
              POST dan mendaftarkan produk yang sama dua kali — dan tidak ada
              yang bisa menghapusnya dari halaman ini. */}
          <Button onClick={simpan} disabled={batasTercapai || belumLengkap || menyimpan}>
            {menyimpan ? 'Menyimpan…' : 'Simpan Produk'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Satu pasang label + isian, dengan tanda untuk yang wajib. */
function Field({
  label,
  wajib,
  children,
}: {
  label: string;
  wajib?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">
        {label}
        {wajib && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function FormProdukBaru({
  terbuka,
  brands,
  onTutup,
  onSimpan,
  sudahAda,
  galat,
  menyimpan,
}: {
  terbuka: boolean;
  /** Brand yang sudah dipakai produk lain — isi pilihan kotak Brand. */
  brands: string[];
  onTutup: () => void;
  onSimpan: (data: DataProdukBaru, berkas: File | null) => void;
  /** Berapa produk baru yang sudah dibuat di sesi ini. */
  sudahAda: number;
  /** Galat dari server saat menyimpan. */
  galat?: string | null;
  /** Sedang mengirim ke server. */
  menyimpan?: boolean;
}) {
  return (
    <Dialog
      open={terbuka}
      onOpenChange={(buka) => {
        if (!buka) onTutup();
      }}
    >
      {/* Satu halaman penuh, dan isinya yang menggulir — pola yang sama dengan
          `DetailProduk`: `grid-rows-[auto_minmax(0,1fr)]` menjaga baris judul
          tetap dan baris isi menyusut, jadi form yang panjang tidak mendorong
          dialog melewati tinggi layar. Animasi 300ms `ease-out` dari skala 0.97
          juga sama, supaya kedua dialog di halaman ini terasa satu keluarga
          dan bukan ditempel. */}
      <DialogContent
        className="max-h-[92vh] gap-0 p-0 duration-300 ease-out sm:max-w-[520px] grid-rows-[auto_minmax(0,1fr)]"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">Tambah Produk</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-5">
          {/* `key` dari daftar brand: begitu produk pertama selesai dimuat
              (atau daftarnya berubah), isi formnya dibangun ulang dari nol.
              Tanpa itu, form yang dibuka SEBELUM brand-nya tiba akan
              menyimpan nilai bawaan dari keadaan lamanya -- brand yang tidak
              ada di pilihan mana pun. */}
          <IsiFormProdukBaru
            key={brands.join(',')}
            brands={brands}
            onSimpan={onSimpan}
            onTutup={onTutup}
            sudahAda={sudahAda}
            galat={galat}
            menyimpan={menyimpan}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
