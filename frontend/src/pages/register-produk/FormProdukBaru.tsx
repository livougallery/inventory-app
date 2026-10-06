import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw, Trash2, TriangleAlert, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { KATEGORI_VENDOR, SIZE, WARNA } from '@/lib/opsi';
import { PRODUK_REGISTER, type ProdukRegister } from '@/lib/produk';

// ===== Form registrasi produk baru =====
//
// Dipanggil dari tombol "Tambah Produk" di Register Produk. Berbeda dari
// `DetailProduk` (yang MEMBUKA produk yang sudah ada) dan `FormPoBaru` (yang
// membuat PO): yang ini membuat produk beserta varian warnanya, dan hasilnya
// langsung muncul sebagai kartu di daftar Register.
//
// Bentuk field-nya diambil dari `ProdukRegister`/`SpesifikasiProduksi` di
// `lib/produk.ts`, bukan dikarang. Kalau bentuknya menyimpang sedikit saja,
// produk yang dibuat di sini tidak akan bisa ikut dipakai form "Tambah
// Produksi" yang pengisian otomatisnya membaca spesifikasi itu — dan itu baru
// ketahuan jauh nanti, saat form produksi gagal terisi sendiri.
//
// CATATAN BATASAN: halaman ini masih pratinjau, belum terhubung database.
// Kartu hasil form ini hidup di memori saja — hilang saat halaman di-refresh.
// Ditulis terang-terangan di kaki form supaya tidak disalahartikan sebagai
// data yang sudah tersimpan.

/**
 * Kode warna, DIBACA DARI KATALOG — bukan ditulis ulang di sini.
 *
 * Kode warna masuk ke `kodeVarian` (mis. `LVU-TOP-11-HTP-M`), jadi kode yang
 * dikarang di form akan menghasilkan varian yang tidak cocok dengan
 * katalog untuk warna yang sama. Menyalin pemetaannya jadi daftar konstanta
 * di file ini berarti dua tempat yang harus dijaga bareng — dan diam-diam
 * berbeda begitu katalog ditambah warnanya.
 */
const KODE_WARNA: Record<string, string> = (() => {
  const peta: Record<string, string> = {};
  for (const p of PRODUK_REGISTER) {
    for (const w of p.spesifikasi.warna) peta[w.nama] = w.kode;
  }
  return peta;
})();

/**
 * Kategori produk.
 *
 * Ditulis eksplisit, bukan diambil dari katalog, karena daftar filter di
 * halaman Register dibangun dari kartu yang sedang tampil: kalau kategorinya
 * ikut berubah sendiri setiap ada produk baru, pilihan di menu Filter ikut
 * berubah juga — dan filter yang bergeser sendiri saat tidak ada yang
 * menyentuhnya membuat orang ragu pada filternya sendiri.
 */
const KATEGORI_PRODUK = [
  { value: 'T-Shirt', label: 'T-Shirt' },
  { value: 'Pants', label: 'Pants' },
  { value: 'Dress', label: 'Dress' },
  { value: 'Blouse', label: 'Blouse' },
  { value: 'Outer', label: 'Outer' },
  { value: 'Set', label: 'Set' },
];

/**
 * Berapa produk yang boleh dibuat dalam satu sesi pratinjau.
 *
 * Tanpa batas, satu klik yang salah menumpuk kartu yang tak bisa dihapus dari
 * mana pun — dan halaman ini tidak punya tempat untuk menghapus, jadi
 * semuanya cuma jadi-Noisy. Batas inilah yang harus diubah kalau owner butuh
 * lebih, bukan dibiarkan menumpuk diam-diam.
 */
export const MAKS_PRODUK_BARU = 3;

/** Yang dikirim ke halaman. `id` dan `registerDate` diisi pemanggil. */
export type DataProdukBaru = Omit<ProdukRegister, 'id' | 'registerDate'>;

const KOSONG = {
  nama: '',
  brand: 'Livou',
  kategori: '',
  designCode: '',
  batch: '',
  harga: '',
  kategoriVendor: 'inhouse',
  namaVendor: 'Livou',
} satisfies Record<string, string>;

/** Satu pasangan warna + ukuran, beserta kode yang diketik orang. */
interface Varian {
  /** Kunci untuk React: "warna|ukuran". */
  key: string;
  warna: string;
  size: string;
  /**
   * Kode varian. Tanpa nilai = pakai kode bawaan; string kosong = pengguna
   * sengaja mengosongkannya, dan itu tetap tersimpan sebagai kosong.
   */
  kode?: string;
}

/**
 * Buang penanda "dihapus" milik nilai atribut yang baru saja dihapus.
 *
 * Tanpa ini, begitu warna "Hitam" dihapus lalu ditambahkan lagi, varian
 * Hitam akan langsung tampil dalam keadaan dicoret -- padahal tidak ada yang
 * menyentuhnya -- dan tombol "Pulihkan semua" akan ikut memulihkan yang tidak
 * ada hubungannya dengan aksi baru-barusan.
 *
 * Cukup membuang kunci yang menyebut nilai itu. Kunci lain tidak mungkin
 * menunjuk warna atau ukuran yang sudah tidak ada: satu-satunya jalan
 * menyusutkan `warnaDipilih`/`ukuranDipilih` adalah handler yang memanggil
 * fungsi ini juga, jadi tidak ada penanda yang bisa jadi yatim.
 *
 * Murni, di luar komponen: tidak menyentuh state apa pun, jadi bisa dipakai
 * langsung dari penangan peristiwa.
 *
 * Diekspor hanya supaya smoke test bisa memanggil implementasi yang sama
 * persis dengan yang dipakai form -- polanya sama dengan IsiFormProdukBaru di
 * bawah. Fungsi ini tidak pernah muncul di markup hasil render, jadi tanpa
 * exports ini tidak ada satu pun check yang menyentuhnya.
 */
export function buangPenanda(
  penanda: Set<string>,
  nilai: string,
  sisi: 'warna' | 'ukuran'
): Set<string> {
  const hasil = new Set(penanda);
  for (const key of hasil) {
    const [w, s] = key.split('|');
    if (sisi === 'warna' ? w === nilai : s === nilai) hasil.delete(key);
  }
  return hasil;
}

/**
 * Badan form, TANPA `Dialog`.
 *
 * `DialogContent` dirender lewat portal, dan portal tidak ikut muncul di
 * `renderToStaticMarkup` — jadi kalau formnya tidak dipisah, smoke test yang
 * merendernya hanya akan melihat `<div></div>` dan semua pemeriksaan isinya
 * akan lulus karena tidak menemukan apa pun. Pola yang sama dipakai
 * `IsiFormPoBaru` dan `IsiDetailProduk`.
 */
export function IsiFormProdukBaru({
  onSimpan,
  onTutup,
  sudahAda,
}: {
  onSimpan: (data: DataProdukBaru) => void;
  onTutup: () => void;
  /** Berapa produk baru yang sudah dibuat di sesi ini. */
  sudahAda: number;
}) {
  const [nama, setNama] = useState(KOSONG.nama);
  const [brand, setBrand] = useState(KOSONG.brand);
  const [kategori, setKategori] = useState(KOSONG.kategori);
  const [designCode, setDesignCode] = useState(KOSONG.designCode);
  const [batch, setBatch] = useState(KOSONG.batch);
  const [harga, setHarga] = useState(KOSONG.harga);
  const [kategoriVendor, setKategoriVendor] = useState(KOSONG.kategoriVendor);
  const [namaVendor, setNamaVendor] = useState(KOSONG.namaVendor);

  /* Atribut dulu, baru detail. Warna dan ukuran dipilih sebagai nilai yang
     bisa ditambah/dihapus; semua pasangan keduanya muncul sendiri di tabel
     di bawahnya -- persis seperti di TikTok Shop/Shopee. */
  const [warnaDipilih, setWarnaDipilih] = useState<string[]>([WARNA[0]]);
  const [ukuranDipilih, setUkuranDipilih] = useState<string[]>([SIZE[0]]);
  /* Kode yang diketik orang, per pasangan "warna|ukuran". Satu-satunya
     bagian varian yang tidak bisa diturunkan dari atribut. */
  const [koreksiKode, setKoreksiKode] = useState<Record<string, string>>({});
  /* Varian yang dicoret. Tidak memotong daftar -- menghapus satu baris tidak
     boleh ikut menghapus sebuah warna, karena warnanya masih dipilih di baris
     "Colour" di atas. Varian yang dicoret bisa dipulihkan. */
  const [dihapus, setDihapus] = useState<Set<string>>(new Set());

  const batasTercapai = sudahAda >= MAKS_PRODUK_BARU;

  /* ==== Turunan ==== */

  /* Daftar varian TIDAK disimpan. Ia persis hasil kali silang warna x
     ukuran, jadi menyimpannya berarti ada dua sumber kebenaran yang harus
     dijaga bareng: begitu warna dihapus, salinan yang tersimpan masih punya
     baris untuk warna itu, dan tabel menampilkan varian yang sudah tidak ada.

     Yang benar-benar tidak bisa diturunkan hanya kode yang diketik orang --
     jadi itu satu-satunya yang disimpan, sebagai peta "kunci -> kode". */
  const varianSemua = useMemo<Varian[]>(
    () =>
      warnaDipilih.flatMap((w) =>
        ukuranDipilih.map((s) => ({ key: `${w}|${s}`, warna: w, size: s }))
      ),
    [warnaDipilih, ukuranDipilih]
  );

  const varianTampil = useMemo(
    () =>
      varianSemua
        .filter((v) => !dihapus.has(v.key))
        .map((v) => (koreksiKode[v.key] !== undefined ? { ...v, kode: koreksiKode[v.key] } : v)),
    [varianSemua, dihapus, koreksiKode]
  );

  function kodeBawaan(v: { warna: string; size: string }): string {
    return `${KODE_WARNA[v.warna] ?? v.warna.slice(0, 3).toUpperCase()}-${v.size}`;
  }

  function kodeFinal(v: Varian): string {
    return (v.kode ?? kodeBawaan(v)).trim();
  }

  /* Kode yang diketik user menang; tanpa koreksi, kode diturunkan seperti
     produk lama. Panjang !== 1 berarti ada duplikat: kode kembar membuat dua
     varian berbeda tidak bisa dibedakan. */
  const masalahVarian = useMemo(() => {
    const hitung = new Map<string, number>();
    for (const v of varianTampil) {
      const k = kodeFinal(v);
      if (!k) continue;
      hitung.set(k, (hitung.get(k) ?? 0) + 1);
    }
    const ganda = [...hitung].filter(([, n]) => n > 1).map(([k]) => k);
    const kosong = varianTampil.filter((v) => !kodeFinal(v)).length;
    const hasil: string[] = [];
    if (kosong > 0) hasil.push(`${kosong} varian belum punya kode.`);
    if (ganda.length > 0) hasil.push(`Kode dipakai lebih dari sekali: ${ganda.join(', ')}.`);
    return hasil;
  }, [varianTampil]);

  function ubahKode(key: string, nilai: string) {
    /* String kosong DISIMPAN, bukan dihapus. Mengosongkan kotak adalah koreksi
       yang disengaja: kalau dihapus, isinya balik ke kode bawaan dan user
       tidak pernah bisa membiarkan variannya tanpa kode. */
    setKoreksiKode((lama) => ({ ...lama, [key]: nilai }));
  }

  /**
   * Kenapa form ini belum bisa disimpan.
   *
   * Nama, kategori, dan design code wajib karena tiga hal: nama yang dipakai
   * form produksi untuk mencari produk, kategori untuk filter di kartu, dan
   * design code yang jadi bagian `kodeVarian`. Sisanya boleh kosong — produk
   * yang baru didaftarkan memang belum punya stok.
   *
   * Varian TIDAK wajib sudah terisi stok. Kolom rencana dihapus atas permintaan
   * pemilik: angkanya butuh stok riil, jadi memaksanya di sini berarti
   * mengarang data. Varian yang baru dibuat sengaja berstok nol sampai
   * barangnya benar-benar masuk.
   *
   * Yang tetap dicegat: kode varian kosong atau kembar. Kode yang tidak bisa
   * membedakan dua varian membuat kartu dan pencarian tidak bisa tahu mana
   * yang mana — jauh lebih sulit diperbaiki belakangan daripada dicegat di sini.
   */
  const masalah: string[] = [];
  if (batasTercapai) masalah.push(`Batas ${MAKS_PRODUK_BARU} produk per sesi sudah tercapai`);
  if (!nama.trim()) masalah.push('Nama produk wajib diisi');
  if (!kategori) masalah.push('Kategori wajib dipilih');
  if (!designCode.trim()) masalah.push('Design code wajib diisi');
  if (warnaDipilih.length === 0) masalah.push('Tambahkan minimal satu warna');
  if (ukuranDipilih.length === 0) masalah.push('Tambahkan minimal satu ukuran');
  masalah.push(...masalahVarian);

  function simpan() {
    if (masalah.length > 0) return;
    // Hanya digit yang diambil: "Rp 149.000" dan "149000" berarti hal yang
    // sama, dan `Number("149.000")` bernilai NaN sehingga diam-diam jadi 0 —
    // harga yang hilang tanpa pesan error.
    const angka = Number(harga.replace(/\D/g, ''));

    // Dikelompokkan balik ke bentuk `SpesifikasiProduksi`: warna di luar,
    // ukuran di dalam. Varian sengaja datar, tapi yang disimpan tidak boleh
    // -- bentuk simpanannya sudah dipakai form "Tambah Produksi" untuk mengisi
    // dirinya sendiri, dan bentuk berbeda di sini akan menggagalkannya.
    //
    // Yang disimpan HANYA varian yang masih tampil. Varian yang dicoret
    // tidak ikut -- kalau ikut, produk dapat baris yang tidak pernah dilihat
    // pemiliknya saat mengisi form.
    const perWarna = warnaDipilih
      .map((w) => ({
        nama: w,
        kode: KODE_WARNA[w] ?? w.slice(0, 3).toUpperCase(),
        pcs: ukuranDipilih.flatMap((s) => {
          const v = varianTampil.find((x) => x.key === `${w}|${s}`);
          if (!v) return [];
          return [
            {
              ukuran: s,
              // Stok baru yang didaftarkan memang nol, bukan belum diisi.
              // `pcs: 0` yang nanti FormProduksi baca sebagai "sudah ada
              // kebutuhan 0" -- sama dengan tidak ada, dan jujur soal
              // kenyataannya: belum ada barang.
              qty: 0,
              // Kode koreksi user ikut dibawa. Tanpa ini, hasil ketikan di
              // kolom kode hilang begitu produk disimpan.
              kode: v.kode,
            },
          ];
        }),
      }))
      .filter((w) => w.pcs.length > 0);

    onSimpan({
      nama: nama.trim(),
      brand: brand.trim() || KOSONG.brand,
      kategori,
      harga: angka,
      foto: null,
      spesifikasi: {
        designCode: designCode.trim(),
        kategori,
        batch: batch.trim(),
        kategoriVendor,
        namaVendor: namaVendor.trim(),
        warna: perWarna,
        // BOM dan aksesori sengaja kosong. Produk yang baru didaftarkan belum
        // punya kebutuhan bahan yang disetujui — mengisinya di sini berarti
        // mengarang angka konsumsi yang nanti dipakai menghitung HPP.
        kain: [],
        aksesori: [],
      },
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Identitas ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Identitas produk</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama Produk" wajib>
            <Input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="mis. Oversized Hoodie Kereta"
            />
          </Field>
          <Field label="Brand">
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder={KOSONG.brand}
            />
          </Field>
          <Field label="Kategori" wajib>
            <Select value={kategori} onValueChange={(v) => v !== null && setKategori(v)}>
              <SelectTrigger className="w-full">
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
          <Field label="Harga Jual (Rp)">
            <Input
              value={harga}
              onChange={(e) => setHarga(e.target.value)}
              inputMode="numeric"
              placeholder="mis. 149000"
            />
          </Field>
        </div>
      </section>

      {/* ── Produksi ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Keterangan produksi</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Design Code" wajib>
            <Input
              value={designCode}
              onChange={(e) => setDesignCode(e.target.value)}
              placeholder="mis. LVU-TOP-11"
            />
          </Field>
          <Field label="Batch">
            <Input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="mis. B-05"
            />
          </Field>
          <Field label="Kategori Vendor">
            <Select
              value={kategoriVendor}
              onValueChange={(v) => v !== null && setKategoriVendor(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KATEGORI_VENDOR.production.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="sm:max-w-xs">
          <Field label="Vendor / CMT">
            <Input
              value={namaVendor}
              onChange={(e) => setNamaVendor(e.target.value)}
              placeholder={KOSONG.namaVendor}
            />
          </Field>
        </div>
      </section>

      {/* ── Product attributes ────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Product attributes</h3>
        <p className="text-xs text-muted-foreground">
          Warna dan ukuran sebagai nilai yang bisa ditambah — satu langkah sebelum isi
          detailnya.
        </p>

        <div className="rounded-lg border">
          <BarisAtribut
            label="Colour"
            nilai={warnaDipilih}
            pilihan={WARNA}
            onTambah={(v) => setWarnaDipilih((lama) => [...lama, v])}
            onHapus={(v) => {
              setWarnaDipilih((lama) => lama.filter((x) => x !== v));
              // Penanda "dihapus" ikut dibuang untuk warna ini. Kalau tidak,
              // begitu warna yang sama ditambahkan lagi, variannya langsung
              // tampil dalam keadaan dicoret -- padahal tidak ada yang
              // menyentuhnya.
              setDihapus((lama) => buangPenanda(lama, v, 'warna'));
            }}
          />
          <BarisAtribut
            label="Size"
            nilai={ukuranDipilih}
            pilihan={SIZE}
            onTambah={(v) => setUkuranDipilih((lama) => [...lama, v])}
            onHapus={(v) => {
              setUkuranDipilih((lama) => lama.filter((x) => x !== v));
              setDihapus((lama) => buangPenanda(lama, v, 'ukuran'));
            }}
            batasBawah
          />
        </div>
      </section>

      {/* ── Detail varian ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Detail varian</h3>

        {varianSemua.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Pilih warna dan ukuran dulu di atas.
          </p>
        ) : varianTampil.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Semua {varianSemua.length} varian sudah dihapus.
            </p>
            <Button variant="outline" size="sm" onClick={() => setDihapus(new Set())}>
              Pulihkan semua varian
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {varianTampil.length} varian · {warnaDipilih.length} warna ×{' '}
                {ukuranDipilih.length} ukuran
              </p>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Varian</TableHead>
                    <TableHead className="w-[210px]">Kode varian</TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varianTampil.map((v) => (
                    <TableRow key={v.key}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-x-1.5">
                          <span className="text-accent-foreground font-semibold">Colour:</span>
                          <span>{v.warna}</span>
                          <span className="text-accent-foreground font-semibold">Size:</span>
                          <span>{v.size}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={v.kode ?? kodeBawaan(v)}
                          onChange={(e) => ubahKode(v.key, e.target.value)}
                          aria-label={`Kode varian ${v.warna} ukuran ${v.size}`}
                          placeholder="kode varian"
                          className="font-mono text-xs uppercase"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDihapus((lama) => new Set(lama).add(v.key))}
                          aria-label={`Hapus varian ${v.warna} ukuran ${v.size}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {dihapus.size > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDihapus(new Set())}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Pulihkan {dihapus.size} varian yang dihapus
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            {masalahVarian.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{masalahVarian.join(' ')}</span>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Stok tiap varian diisi terpisah, saat barang benar-benar ada.
            </p>
          </>
        )}
      </section>

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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-[11px] text-muted-foreground">
          {batasTercapai
            ? 'Muat ulang halaman untuk mulai dari awal.'
            : `Bisa menambah ${MAKS_PRODUK_BARU - sudahAda} produk lagi di sesi ini. Data ini belum tersimpan ke database.`}
        </p>
        <div className="flex gap-2">
          {/* Batal hanya menutup. Dulu `onClick={onSimpan}` di sini — satu
              kata yang salah, dan tombol yang paling sering dipakai untuk
              membatalkan justru menjadi cara tercepat membuat produk setengah
              jadi. */}
          <Button variant="outline" onClick={onTutup}>
            Batal
          </Button>
          <Button onClick={simpan} disabled={masalah.length > 0}>
            Simpan Produk
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

/**
 * Satu baris atribut: nama di kiri, nilai terpilih sebagai chip yang bisa
 * dilepas, dan dropdown untuk menambah nilai baru.
 *
 * Nama atribut sengaja berupa teks mati, bukan input: yang diedit adalah
 * nilai, bukan nama atributnya. Kalau nama ikut bisa diedit, atribut baru
 * berarti kode warna dan ukuran baru juga — dan itu bukan bagian form ini.
 */
function BarisAtribut({
  label,
  nilai,
  pilihan,
  onTambah,
  onHapus,
  batasBawah,
}: {
  label: string;
  nilai: string[];
  /** Kandidat nilai yang belum dipakai. */
  pilihan: readonly string[];
  onTambah: (v: string) => void;
  onHapus: (v: string) => void;
  /** Pemisah baris terakhir, supaya kotak tidak punya garis bawah menggantung. */
  batasBawah?: boolean;
}) {
  const belumDipakai = pilihan.filter((p) => !nilai.includes(p));

  return (
    <div
      className={
        'flex flex-wrap items-start gap-3 px-3 py-2.5' +
        (batasBawah ? '' : ' border-b')
      }
    >
      <div className="w-40 shrink-0">
        <span className="block rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
          {label}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {nilai.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 rounded border bg-muted px-2 py-1 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => onHapus(v)}
              aria-label={`Hapus nilai ${label} ${v}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {belumDipakai.length > 0 && (
          <Select value={null} onValueChange={(v) => v !== null && onTambah(v)}>
            <SelectTrigger
              size="sm"
              className="w-auto min-w-36 border-dashed text-xs"
              aria-label={`Tambah nilai ${label}`}
            >
              <SelectValue placeholder="+ Tambah nilai..." />
            </SelectTrigger>
            <SelectContent>
              {belumDipakai.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

export default function FormProdukBaru({
  terbuka,
  onTutup,
  onSimpan,
  sudahAda,
}: {
  terbuka: boolean;
  onTutup: () => void;
  onSimpan: (data: DataProdukBaru) => void;
  /** Berapa produk baru yang sudah dibuat di sesi ini. */
  sudahAda: number;
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
        className="max-h-[92vh] gap-0 p-0 duration-300 ease-out sm:max-w-[900px] grid-rows-[auto_minmax(0,1fr)]"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">Tambah Produk</DialogTitle>
          <DialogDescription className="text-xs">
            Daftarkan produk baru beserta varian warna dan ukurannya.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-5">
          <IsiFormProdukBaru onSimpan={onSimpan} onTutup={onTutup} sudahAda={sudahAda} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
