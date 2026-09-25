import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { KATEGORI_VENDOR, PIC, SIZE } from '@/lib/opsi';
import { cariProduk, namaProduk, type SpesifikasiProduksi } from '@/lib/produk';
import type {
  BarisWarna,
  DataProduksiBaru,
  SpesifikasiAksesori,
  SpesifikasiKain,
} from './data-kanban';

// ===== Form "Tambah Produksi" =====
//
// Letaknya di kolom Propose, karena di situlah usulan produksi lahir. Kartu
// yang dibuat di sini BELUM disetujui — ia naik ke kolom setelah Propose
// setelah di-approve lewat popupnya (Prepare di papan Production, Invoice
// Logistic di papan White Label), sama seperti kartu contoh yang sudah ada.
//
// Tiga bagian, mengikuti urutan kerja: identitas produk, rencana warna &
// ukuran, lalu bahan yang dibutuhkan. Bagian bahan tidak boleh kosong: tanpa
// satu baris bahan pun, daftar bahannya tidak punya isi.
//
// Nilai awal beberapa baris sengaja sudah terisi supaya alurnya bisa
// diperagakan tanpa mengetik panjang. Semuanya bisa diubah.

const UKURAN = [...SIZE];

interface WarnaForm {
  key: number;
  nama: string;
  kode: string;
  /** Qty per ukuran. String supaya field bisa dikosongkan saat diketik ulang. */
  pcs: Record<string, string>;
}
/**
 * Jenis bahan.
 *
 * Nilainya sengaja "kain"/"aksesori", mengikuti keluarga `raw_materials.tipe`
 * di halaman Stok Material — bukan kosakata baru yang cuma hidup di form ini.
 */
type JenisBahan = 'kain' | 'aksesori';

/**
 * Satu baris bahan di form.
 *
 * Kain dan aksesori dulu dua daftar terpisah dengan dua tombol tambah. Setelah
 * dibandingkan, bentuk fieldnya ternyata persis sama — yang benar-benar berbeda
 * adalah cara barisnya menjadi baris BOM nanti: kain dihitung per warna,
 * aksesori satu angka untuk semua varian (lihat `bahanKartu` di data-kanban.ts).
 * Jadi jenisnya disimpan sebagai kolom di barisnya, bukan sebagai dua tabel.
 */
interface BahanForm {
  key: number;
  jenis: JenisBahan;
  nama: string;
  perPcs: string;
  satuan: string;
  tersedia: string;
}

/** Satuan bawaan tiap jenis, dipakai saat baris dibuat dan saat jenisnya ditukar. */
const SATUAN_BAWAAN: Record<JenisBahan, string> = { kain: 'm', aksesori: 'pcs' };

const JENIS_BAHAN: { value: JenisBahan; label: string }[] = [
  { value: 'kain', label: 'Kain' },
  { value: 'aksesori', label: 'Aksesori' },
];

let nomorBaris = 1;
const barisKosong = <T,>(isi: Omit<T, 'key'>): T => ({ key: nomorBaris++, ...isi }) as T;

const awalWarna: WarnaForm[] = [
  barisKosong<WarnaForm>({ nama: 'Black', kode: 'BLK', pcs: { S: '20', M: '25', L: '20', XL: '' } }),
];

const awalBahan: BahanForm[] = [
  barisKosong<BahanForm>({
    jenis: 'kain',
    nama: 'Kain Rayon',
    perPcs: '1.5',
    satuan: 'm',
    tersedia: '120',
  }),
  barisKosong<BahanForm>({
    jenis: 'aksesori',
    nama: 'Label Brand',
    perPcs: '1',
    satuan: 'pcs',
    tersedia: '500',
  }),
];

/** Angka > 0, selain itu null — supaya field yang dikosongkan tidak jadi 0 diam-diam. */
function angka(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/**
 * Angka termasuk NOL, untuk kolom STOK.
 *
 * Stok satu-satunya kolom di form ini yang nol-nya berarti: "barangnya habis"
 * adalah keadaan yang nyata, dan membedakannya dari "belum dicatat" justru
 * gunanya perbaikan ini. `angka()` menolak nol, jadi memakainya di sini membuat
 * stok yang benar-benar kosong ikut terbaca "Belum dicatat" — dua keadaan yang
 * berbeda jadi tampak sama, persis kebalikan dari yang mau dicapai.
 *
 * Yang dikosongkan tetap null: itu memang belum dicatat, dan `bahanKartu()`
 * menampilkannya sebagai "Belum dicatat" tanpa badge merah.
 */
function angkaStok(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Kode warna cadangan kalau pemilik hanya mengetik namanya. */
function kodeDari(nama: string): string {
  return nama.trim().replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

/**
 * Kode warna yang dijamin belum dipakai baris lain.
 *
 * Kode warna dipakai sebagai KUNCI di `perWarna` (lihat `pisahBahan`), jadi dua
 * kode yang sama membuat satu baris menimpa baris lain — kainnya kehilangan
 * satu spek warna, jumlah baris BOM di papan diam-diam berkurang, dan SKU
 * variannya jadi kembar. Tidak ada error di mana pun; yang terlihat cuma kartu
 * dengan satu warna lebih sedikit daripada yang tadi diketik.
 *
 * Dua warna berbeda bisa jatuh ke kode yang sama dengan mudah: "Black" dan
 * "Blackberry" sama-sama jadi "BLA" kalau kolom Code dikosongkan. Karena itu
 * bentrokan diselesaikan bertahap:
 *
 *   1. kode apa adanya, kalau belum dipakai
 *   2. diperpanjang dari nama aslinya ("BLA" -> "BLAC") — hasilnya masih
 *      terbaca sebagai singkatan warnanya, bukan angka tempelan
 *   3. baru diberi nomor urut, untuk nama yang hurufnya sudah habis dipakai
 *
 * Kode yang dikembalikan LANGSUNG dicatat ke `dipakai`. Itu disengaja: versi
 * sebelumnya mengembalikannya begitu saja dan menyerahkan pencatatannya ke
 * pemanggil, sehingga lupa satu baris `.add()` mengembalikan bug aslinya tanpa
 * satu pun tanda. Sekarang tidak ada cara memakainya salah — pemeriksaan dan
 * pencatatannya satu paket.
 *
 * Diekspor supaya bisa diperiksa langsung: `pisahBahan` menerima kode apa
 * adanya, jadi satu-satunya penjaga bentrokan ada di sini — dan penjaga yang
 * tidak bisa dipanggil dari test tidak bisa dibuktikan bekerja.
 */
export function kodeUnik(nama: string, kodeEksplisit: string, dipakai: Set<string>): string {
  const dasar = kodeEksplisit.trim() || kodeDari(nama) || 'WRN';
  const pilih = (kandidat: string) => {
    dipakai.add(kandidat);
    return kandidat;
  };
  if (!dipakai.has(dasar)) return pilih(dasar);

  const huruf = nama.trim().replace(/[^A-Za-z]/g, '').toUpperCase();
  for (let n = dasar.length + 1; n <= huruf.length; n++) {
    const kandidat = huruf.slice(0, n);
    if (!dipakai.has(kandidat)) return pilih(kandidat);
  }

  for (let i = 2; ; i++) {
    const kandidat = `${dasar}${i}`;
    if (!dipakai.has(kandidat)) return pilih(kandidat);
  }
}

function inisialDari(nama: string): string {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

/** Tanggal hari ini sebagai yyyy-mm-dd, untuk nilai awal Date Request. */
function hariIni(): string {
  const d = new Date();
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

/**
 * Singkatan bulan yang dipakai kartu di papan — "Sep", bukan "Sept".
 *
 * Ditulis sebagai daftar, bukan lewat `toLocaleDateString('en-GB')`: bentuk
 * keluaran locale itu berubah mengikuti versi ICU, dan untuk September ia
 * menghasilkan "Sept" — satu huruf lebih panjang dari setiap kartu contoh di
 * papan yang sama. Kartu baru dan kartu lama lalu berdampingan di satu kolom
 * dengan gaya tanggal yang berbeda. Daftar ini membuat keluarannya tidak
 * bergantung pada locale mesin mana pun.
 */
const BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Ubah 2026-09-15 jadi 15 Sep 2026 — bentuk yang dipakai kartu di papan.
 *
 * Yang tidak berbentuk `yyyy-mm-dd` dikembalikan apa adanya, TIDAK diganti
 * tanggal hari ini: mengarang tanggal lebih berbahaya daripada menampilkan
 * nilai yang jelas salah. Karena itu pemanggilnya wajib memastikan tanggalnya
 * terisi — lihat pemeriksaannya di `simpan()`.
 */
function tanggalTampil(iso: string): string {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!cocok) return iso;
  const [, tahun, bulan, hari] = cocok;
  const nama = BULAN_SINGKAT[Number(bulan) - 1];
  return nama ? `${hari} ${nama} ${tahun}` : iso;
}

// ===== Pengisian otomatis dari Register Produk =====
//
// Memilih produk yang sudah terdaftar mengisi seluruh form ini, dan semuanya
// tetap bisa diubah setelahnya. Tujuannya memperpendek pengisian: yang biasanya
// diketik ulang (kode desain, kategori, rencana warna per ukuran, daftar bahan)
// sudah ada di Register, dan mengetiknya lagi hanya menambah kesempatan salah.
//
// Bentuk keluarannya `WarnaForm`/`BahanForm` — bentuk STATE FORM, bukan bentuk
// katalog. Konversinya sengaja lewat fungsi ini, bukan disebar di dalam
// komponennya: satu tempat yang bisa diperiksa, dan satu tempat yang salah
// kalau bentuk salah satunya berubah.
//
// Fungsi ini TIDAK menyentuh `dateRequest` dan `pic`: keduanya bukan sifat
// produk melainkan keputusan orang yang mengisi form hari itu, dan mengisinya
// dari katalog berarti menebak. Nilai awalnya sudah terisi (hari ini, PIC
// pertama), jadi formnya tetap lengkap tanpa ditebak.

/** Isi baris warna & bahan dari spesifikasi produk Register. */
export function isiDariProduk(sp: SpesifikasiProduksi): {
  warna: WarnaForm[];
  bahan: BahanForm[];
} {
  const warna: WarnaForm[] = sp.warna.map((w) =>
    barisKosong<WarnaForm>({
      nama: w.nama,
      kode: w.kode,
      // Ukuran yang tidak direncanakan dikosongkan, bukan diisi "0" — sama
      // seperti baris awal form ini, dan `angka()` memperlakukan keduanya
      // sama saja saat dihitung.
      pcs: Object.fromEntries(
        UKURAN.map((u) => {
          const qty = w.pcs.find((p) => p.ukuran === u)?.qty ?? 0;
          return [u, qty > 0 ? String(qty) : ''];
        })
      ),
    })
  );

  const bahan: BahanForm[] = [
    ...sp.kain.map((k) => {
      const pemakaian = Object.values(k.perWarna).map((v) => v.perPcs);
      const stok = Object.values(k.perWarna)
        .map((v) => v.tersedia)
        .filter((n): n is number => n !== undefined);

      return barisKosong<BahanForm>({
        jenis: 'kain' as const,
        nama: k.nama,
        // Satu baris kain di form ini cuma punya SATU angka pemakaian dan SATU
        // angka stok, sedangkan kain di Register boleh berbeda per warna.
        // Arah pembulatannya sengaja dipilih yang paling aman untuk badge
        // kekurangan: pemakaian diambil yang TERBESAR dan stok yang TERKECIL,
        // supaya kebutuhan bahan tidak pernah tampak lebih kecil daripada
        // kenyataan. Menampilkan kekurangan yang ternyata tidak ada hanya
        // merepotkan; tidak menampilkan yang ada membuat produksi kekurangan
        // bahan — dan gate Prepare tidak menahannya.
        // Kain tanpa satu pun warna di `perWarna` dikosongkan, bukan diisi
        // angka hasil `Math.max()` dari daftar kosong: `Math.max()` tanpa
        // argumen mengembalikan `-Infinity`, dan `String(-Infinity)` adalah
        // teks "-Infinity" yang akan mengendap di field qty sebagai nilai yang
        // terlihat seperti angka. Field kosong ditolak `pisahBahan()` seperti
        // baris setengah terisi lainnya — gagal dengan berisik, bukan tersimpan
        // sebagai angka karangan.
        perPcs: pemakaian.length ? String(Math.max(...pemakaian)) : '',
        satuan: k.satuan,
        tersedia: stok.length ? String(Math.min(...stok)) : '',
      });
    }),
    ...sp.aksesori.map((a) =>
      barisKosong<BahanForm>({
        jenis: 'aksesori' as const,
        nama: a.nama,
        perPcs: String(a.perPcs),
        satuan: a.satuan,
        tersedia: a.tersedia === undefined ? '' : String(a.tersedia),
      })
    ),
  ];

  return { warna, bahan };
}

/**
 * Label kategori vendor untuk kode ini di papan yang sedang dibuka, atau ''
 * bila kodenya tidak ada di daftar papan itu.
 *
 * Katalog Register berisi produk PRODUKSI (inhouse/konveksi/garment), sedangkan
 * papan White Label memakai daftar lain (china/thailand/indonesia). Mengisi
 * kategori produksi ke papan White Label menghasilkan dropdown yang menampilkan
 * nilai di luar pilihannya — terlihat seperti terisi, padahal tidak sah.
 *
 * Yang tidak cocok dibiarkan kosong dan dipilih sendiri oleh penggunanya, bukan
 * ditebak.
 *
 * Yang dikembalikan LABEL, bukan kodenya: `Select` kategori vendor di form ini
 * menyimpan label (`value={o.label}`), jadi state-nya berisi "Konveksi", bukan
 * "konveksi". Mengembalikan kode di sini membuat dropdownnya kosong tanpa error
 * — terlihat seperti pengisian otomatisnya tidak bekerja.
 */
export function vendorCocok(
  kode: string,
  opsi: readonly { value: string; label: string }[]
): string {
  return opsi.find((o) => o.value === kode)?.label ?? '';
}

/**
 * Baris "tambah" di kaki tabel.
 *
 * Dulu tiap daftar punya tombolnya sendiri di atas tabel — "+ Warna", "+ Kain",
 * "+ Aksesori" — dan ketiganya melayang di kanan judul, jauh dari baris yang
 * akan ditambahi. Sekarang tombolnya jadi baris terakhir DI DALAM tabelnya:
 * yang ditambah muncul tepat di bawah baris yang diklik, dan mata tidak perlu
 * menyeberang layar untuk tahu tombol mana milik daftar mana.
 *
 * `colSpan` wajib sejumlah kolom tabelnya supaya barisnya selebar tabel.
 */
function BarisTambah({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr className="border-t">
      <td colSpan={colSpan} className="p-0">
        <div className="flex">{children}</div>
      </td>
    </tr>
  );
}

/** Satu tombol tambah di dalam `BarisTambah`. */
function TombolTambah({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start rounded-none text-muted-foreground hover:bg-muted/50"
      onClick={onClick}
    >
      <Plus /> {label}
    </Button>
  );
}

/**
 * Daftar saran nama produk di bawah isian Product Name.
 *
 * Dipasang sebagai `<div>` berisi `<button>`, bukan `<select>` atau combobox:
 * yang dipilih di sini bukan nilai dari daftar tertutup — namanya tetap boleh
 * diketik bebas, dan daftar ini cuma jalan pintas.
 *
 * `onMouseDown` + `preventDefault`, bukan `onClick`: tanpa itu, isian di
 * atasnya kehilangan fokus lebih dulu (`onBlur` menutup daftarnya), dan kliknya
 * tidak pernah sampai ke tombol ini. Gejalanya khas — daftarnya berkedip lalu
 * hilang, dan pilihannya tidak pernah masuk.
 */
function SaranProduk({
  saran,
  onPilih,
}: {
  saran: string[];
  onPilih: (nama: string) => void;
}) {
  if (saran.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md">
      <p className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        Produk terdaftar — memilih salah satu mengisi form di bawah
      </p>
      {saran.map((n) => (
        <button
          key={n}
          type="button"
          className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            onPilih(n);
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ===== Kedua tabel, dipisah dari pembungkus `Dialog` =====
//
// Alasannya sama dengan `IsiPopup` di PopupKartu.tsx: `DialogContent` memakai
// portal, dan portal tidak ikut ter-render di server. Selama tabelnya menyatu
// di dalam form, satu-satunya cara memeriksa letak tombol tambahnya adalah
// membuka dialognya di browser — dan justru itu yang paling mudah salah tanpa
// ketahuan: `colSpan` yang tidak cocok dengan jumlah kolom tidak memunculkan
// error apa pun, hanya tabel yang tampak pincang.
//
// Yang dipisah cuma tabelnya, bukan state-nya: nilai dan pengubahnya tetap
// dipegang form, dioper ke sini sebagai prop.

export function TabelWarna({
  warna,
  setWarna,
}: {
  warna: WarnaForm[];
  setWarna: Dispatch<SetStateAction<WarnaForm[]>>;
}) {
  function ubah(key: number, ubah: Partial<WarnaForm>) {
    setWarna((lama) => lama.map((w) => (w.key === key ? { ...w, ...ubah } : w)));
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium">Color</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Code</th>
            {UKURAN.map((u) => (
              <th key={u} className="px-2 py-2 text-left text-xs font-medium">
                {u}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {warna.map((w) => (
            <tr key={w.key} className="border-t">
              <td className="px-3 py-2">
                <Input
                  value={w.nama}
                  onChange={(e) => ubah(w.key, { nama: e.target.value })}
                  placeholder="Black"
                  aria-label="Nama warna"
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  value={w.kode}
                  onChange={(e) => ubah(w.key, { kode: e.target.value })}
                  placeholder={kodeDari(w.nama) || 'BLK'}
                  aria-label="Kode warna"
                  className="w-20"
                />
              </td>
              {UKURAN.map((u) => (
                <td key={u} className="px-2 py-2">
                  <Input
                    inputMode="numeric"
                    value={w.pcs[u] ?? ''}
                    onChange={(e) => ubah(w.key, { pcs: { ...w.pcs, [u]: e.target.value } })}
                    placeholder="0"
                    aria-label={`Qty ${u} untuk ${w.nama || 'warna baru'}`}
                    className="w-16"
                  />
                </td>
              ))}
              <td className="px-2 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hapus warna ${w.nama || 'baru'}`}
                  disabled={warna.length === 1}
                  onClick={() => setWarna((lama) => lama.filter((x) => x.key !== w.key))}
                >
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}

          {/* Tambah warna = baris baru di bawah, tepat setelah baris terakhir.
              `colSpan` = 1 (Color) + 1 (Code) + jumlah ukuran + 1 (tombol
              hapus). */}
          <BarisTambah colSpan={UKURAN.length + 3}>
            <TombolTambah
              label="Tambah Warna"
              onClick={() =>
                setWarna((lama) => [
                  ...lama,
                  barisKosong<WarnaForm>({
                    nama: '',
                    kode: '',
                    pcs: { S: '', M: '', L: '', XL: '' },
                  }),
                ])
              }
            />
          </BarisTambah>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pemilih jenis bahan di dalam baris tabel.
 *
 * Memakai `Select` yang sama dengan field lain di dialog ini — bukan `<select>`
 * bawaan — supaya tinggi dan bentuknya seragam dengan baris di atasnya.
 *
 * `SelectValue` memakai function child, bukan teks polos: tanpa itu base-ui
 * menampilkan nilai mentahnya (`kain`, huruf kecil semua), dan itu bukan yang
 * ditulis di kolomnya.
 */
function PilihJenis({
  nilai,
  onUbah,
  namaBaris,
}: {
  nilai: JenisBahan;
  onUbah: (j: JenisBahan) => void;
  namaBaris: string;
}) {
  return (
    <Select value={nilai} onValueChange={(v) => onUbah(v as JenisBahan)}>
      <SelectTrigger size="sm" className="w-28" aria-label={`Jenis bahan ${namaBaris}`}>
        <SelectValue>
          {(v: JenisBahan) => JENIS_BAHAN.find((j) => j.value === v)?.label ?? v}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {JENIS_BAHAN.map((j) => (
          <SelectItem key={j.value} value={j.value}>
            {j.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TabelBahan({
  bahan,
  setBahan,
}: {
  bahan: BahanForm[];
  setBahan: Dispatch<SetStateAction<BahanForm[]>>;
}) {
  function ubah(key: number, ubah: Partial<BahanForm>) {
    setBahan((lama) => lama.map((x) => (x.key === key ? { ...x, ...ubah } : x)));
  }

  /**
   * Tukar jenis baris, sekalian menyesuaikan satuannya.
   *
   * Satuannya ikut bertukar HANYA kalau masih satuan bawaan jenis lama. Kalau
   * pemilik sudah mengetik satuan sendiri — "yard", misalnya — angka itu yang
   * dipakai, dan menimpanya dengan bawaan baru akan menghapus ketikan yang
   * sengaja dilakukan.
   */
  function ubahJenis(key: number, jenis: JenisBahan) {
    setBahan((lama) =>
      lama.map((x) =>
        x.key === key
          ? {
              ...x,
              jenis,
              satuan: x.satuan === SATUAN_BAWAAN[x.jenis] ? SATUAN_BAWAAN[jenis] : x.satuan,
            }
          : x
      )
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium">Jenis</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Material</th>
            <th className="px-2 py-2 text-left text-xs font-medium">Qty / Pcs</th>
            <th className="px-2 py-2 text-left text-xs font-medium">Satuan</th>
            <th className="px-2 py-2 text-left text-xs font-medium">Stok Tersedia</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {bahan.map((b) => (
            <tr key={b.key} className="border-t">
              <td className="px-3 py-2">
                <PilihJenis
                  nilai={b.jenis}
                  onUbah={(j) => ubahJenis(b.key, j)}
                  namaBaris={b.nama || 'baru'}
                />
              </td>
              <td className="px-3 py-2">
                <Input
                  value={b.nama}
                  onChange={(e) => ubah(b.key, { nama: e.target.value })}
                  placeholder={b.jenis === 'kain' ? 'Kain Rayon' : 'Label Brand'}
                  aria-label="Nama bahan"
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  inputMode="decimal"
                  value={b.perPcs}
                  onChange={(e) => ubah(b.key, { perPcs: e.target.value })}
                  placeholder={b.jenis === 'kain' ? '1.5' : '1'}
                  aria-label={`Pemakaian per pcs ${b.nama || 'bahan baru'}`}
                  className="w-20"
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  value={b.satuan}
                  onChange={(e) => ubah(b.key, { satuan: e.target.value })}
                  aria-label={`Satuan ${b.nama || 'bahan baru'}`}
                  className="w-16"
                />
              </td>
              <td className="px-2 py-2">
                <Input
                  inputMode="decimal"
                  value={b.tersedia}
                  onChange={(e) => ubah(b.key, { tersedia: e.target.value })}
                  placeholder={b.jenis === 'kain' ? '120' : '500'}
                  aria-label={`Stok tersedia ${b.nama || 'bahan baru'}`}
                  className="w-24"
                />
              </td>
              <td className="px-2 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hapus bahan ${b.nama || 'baru'}`}
                  onClick={() => setBahan((lama) => lama.filter((x) => x.key !== b.key))}
                >
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}

          {bahan.length === 0 && (
            <tr className="border-t">
              <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted-foreground">
                Belum ada bahan. Tambahkan minimal satu baris.
              </td>
            </tr>
          )}

          {/* Satu tombol tambah untuk semua bahan — kain dan aksesori tidak lagi
              dipisah jadi dua daftar dengan dua tombol. Jenisnya dipilih di
              barisnya sendiri, jadi tidak perlu memutuskan dulu di atas. */}
          <BarisTambah colSpan={6}>
            <TombolTambah
              label="Tambah Material"
              onClick={() =>
                setBahan((lama) => [
                  ...lama,
                  barisKosong<BahanForm>({
                    jenis: 'kain',
                    nama: '',
                    perPcs: '',
                    satuan: SATUAN_BAWAAN.kain,
                    tersedia: '',
                  }),
                ])
              }
            />
          </BarisTambah>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pisahkan baris form jadi kain dan aksesori untuk kartunya.
 *
 * Satu daftar baris di form, dua bentuk keluaran — dan bedanya nyata, bukan
 * sekadar beda label:
 *
 *   kain     → kebutuhan & stok PER WARNA, karena tiap warna dipotong dari
 *              gulungannya sendiri
 *   aksesori → satu angka untuk semua varian
 *
 * Karena itu penggabungan di form hanya menyatukan tampilannya, bukan artinya.
 * Baris kain yang salah jatuh ke cabang aksesori tidak memunculkan error apa
 * pun: di Prepare ia cuma muncul "All variations" dengan satu stok untuk semua
 * warna, dan angkanya terlihat masuk akal. Itu sebabnya fungsi ini dipisah dan
 * diekspor — supaya percabangannya bisa diperiksa, bukan cuma dilihat.
 *
 * Baris yang namanya kosong atau qty-nya tidak masuk akal dilewati, bukan
 * dianggap nol — baris setengah terisi itu wajar saat orang mengetik.
 *
 * Aturan yang sama berlaku untuk STOK, tapi akibatnya berbeda. Baris dengan stok
 * kosong TETAP ikut: kebutuhannya nyata dan tetap harus dihitung. Yang tidak
 * boleh adalah mengubah stok kosong jadi 0 — `angka('')` mengembalikan null,
 * dan `?? 0` di situ membuat kartunya langsung bertanda merah "Not Enough —
 * Short 145 pcs" seolah stoknya habis, padahal tidak ada yang tahu stoknya
 * berapa. Untuk baris kain angka itu bahkan menular ke SEMUA warna lewat
 * `perWarna`. Jadi yang dioper adalah `undefined`, dan `bahanKartu()` yang
 * memutuskan tampilannya ("Belum dicatat") — lihat `push()` di sana.
 *
 * Kode warna dipakai sebagai KUNCI `perWarna`, jadi pemanggilnya wajib
 * memastikan kodenya unik. Dua kode yang sama membuat satu entri menimpa entri
 * lain tanpa error — form menjaganya lewat `kodeUnik()`.
 */
export function pisahBahan(
  bahan: BahanForm[],
  barisWarna: BarisWarna[]
): { kain: SpesifikasiKain[]; aksesori: SpesifikasiAksesori[] } {
  const kain: SpesifikasiKain[] = [];
  const aksesori: SpesifikasiAksesori[] = [];

  for (const b of bahan) {
    const nama = b.nama.trim();
    const perPcs = angka(b.perPcs);
    if (nama === '' || perPcs === null) continue;
    const tersedia = angkaStok(b.tersedia) ?? undefined;

    if (b.jenis === 'kain') {
      // Satu pemakaian per pcs berlaku untuk semua warna, jadi tiap kode warna
      // mendapat angka yang sama. Stoknya juga sama — ini stok bahan, bukan
      // stok per warna.
      const perWarna: Record<string, { perPcs: number; tersedia?: number }> = {};
      for (const w of barisWarna) perWarna[w.kode] = { perPcs, tersedia };
      kain.push({ nama, satuan: b.satuan, perWarna });
    } else {
      aksesori.push({
        nama,
        varian: '—',
        berlaku: 'All variations',
        perPcs,
        satuan: b.satuan,
        tersedia,
      });
    }
  }

  return { kain, aksesori };
}

export default function FormProduksiBaru({
  terbuka,
  sumber,
  tujuanApprove,
  onTutup,
  onSimpan,
}: {
  terbuka: boolean;
  sumber: 'production' | 'whitelabel';
  /**
   * Label kolom setelah Propose di papan yang sedang dibuka. Di papan White
   * Label bukan Prepare — usulan di sana langsung ke Invoice Logistic.
   */
  tujuanApprove?: string;
  onTutup: () => void;
  onSimpan: (data: DataProduksiBaru) => void;
}) {
  const [productName, setProductName] = useState('');
  const [designCode, setDesignCode] = useState('');
  const [kategori, setKategori] = useState('');
  const [batch, setBatch] = useState('B-04');
  const [kategoriVendor, setKategoriVendor] = useState('');
  const [namaVendor, setNamaVendor] = useState('Livou');
  const [dateRequest, setDateRequest] = useState(hariIni());
  const [pic, setPic] = useState<string>(PIC[0]);
  const [warna, setWarna] = useState<WarnaForm[]>(awalWarna);
  const [bahan, setBahan] = useState<BahanForm[]>(awalBahan);
  const [error, setError] = useState('');
  const [saranTerbuka, setSaranTerbuka] = useState(false);
  /**
   * Nama produk yang terakhir mengisi form ini secara otomatis.
   *
   * Disimpan supaya pengguna tahu kenapa formnya tiba-tiba terisi — tanpa
   * penanda, angka yang muncul sendiri di form sepanjang ini terbaca seperti
   * ketikan sendiri, dan itu berbahaya saat yang mengisi tidak sadar angkanya
   * dari katalog. Dikosongkan begitu salah satu field diubah sendiri.
   */
  const [terisiDari, setTerisiDari] = useState('');

  const opsiVendor = KATEGORI_VENDOR[sumber === 'production' ? 'production' : 'white_label'];

  // Saran nama produk dari katalog Register. Dipakai hanya sebagai daftar
  // saran: nama yang belum terdaftar tetap boleh diketik apa adanya, karena
  // form ini juga dipakai untuk usulan yang produknya memang belum ada di
  // Register.
  const saran = useMemo(() => namaProduk(), []);

  /**
   * Isi seluruh form dari produk Register yang namanya cocok.
   *
   * Dipanggil saat pengguna memilih saran atau mengetik nama yang persis sama,
   * BUKAN saat mengetik sebagian — mengisi form di tengah pengetikan berarti
   * menimpa apa yang sudah diisi pengguna berdasarkan nama yang kebetulan
   * berawalan sama.
   *
   * Yang dikembalikan: true kalau ada yang terisi, supaya pemanggilnya bisa
   * memberi tahu pengguna bahwa formnya berubah. Pengisian yang diam-diam
   * berbahaya di form sepanjang ini — angkanya terlihat seperti ketikan sendiri.
   */
  function isiOtomatis(nama: string) {
    const produk = cariProduk(nama);
    if (!produk) {
      // Namanya berubah jadi tidak terdaftar, tapi form masih memegang angka
      // produk SEBELUMNYA. Membiarkan begitu berarti ada yang sedang membuat
      // produksi "Rowe Tee 2" sementara warna, ukuran, dan bahannya masih
      // angka Rowe Tee — dan penandanya masih menyebut Rowe Tee, jadi
      // ketidakcocokannya tidak kelihatan. Mengosongkan form lebih jujur:
      // isinya hilang, tapi tidak pernah disalahartikan sebagai milik produk
      // yang sedang diketik.
      //
      // Hanya kalau form sebelumnya memang diisi otomatis. Kalau belum, isi
      // formnya milik pengguna sendiri, dan mengosongkannya di sini berarti
      // menghapus kerjakannya.
      if (terisiDari !== '') {
        setDesignCode('');
        setKategori('');
        setKategoriVendor('');
        setNamaVendor('Livou');
        setWarna(awalWarna);
        setBahan(awalBahan);
        setTerisiDari('');
      }
      return false;
    }

    const sp = produk.spesifikasi;
    const { warna: warnaBaru, bahan: bahanBaru } = isiDariProduk(sp);

    setDesignCode(sp.designCode);
    // Kategori diambil dari `produk.kategori`, bukan `sp.kategori` yang isinya
    // sama persis. Dua-duanya ada di model, dan mengambil yang satu di sini
    // sementara daftar Register membaca yang lain berarti: begitu katalog
    // nanti punya produk yang kategorinya berbeda di dua tempat, tabel
    // menampilkan satu dan form mengisi yang lain — tanpa error apa pun.
    // Yang jadi rujukan adalah yang dilihat pengguna di daftar.
    setKategori(produk.kategori);
    setBatch(sp.batch);
    setKategoriVendor(vendorCocok(sp.kategoriVendor, opsiVendor));
    setNamaVendor(sp.namaVendor);
    setWarna(warnaBaru);
    setBahan(bahanBaru);
    setError('');
    setTerisiDari(produk.nama);
    return true;
  }

  /**
   * Setter yang sekaligus menghapus penanda "terisi otomatis".
   *
   * Dipakai untuk SETIAP field yang boleh diubah manual. Kenapa dibungkus,
   * bukan mengandalkan `isiOtomatis` saja: penandanya ada supaya pengguna
   * tahu angka di form datang dari katalog, bukan dari ketikan sendiri. Begitu
   * ada satu angka yang diubah manual, penanda itu sudah tidak jujur — dia
   * masih menyebut produk katalog padahal isinya campuran. Menghapus
   * penandanya lebih jujur daripada menebak produk mana yang sebagian
   * isinya masih cocok.
   *
   * Penanda tidak dihapus waktu program mengisi sendiri, karena di situ
   * `terisiDari` baru ikut ditulis; pemanggil memakai setter ASLI di sana.
   */
  function tulisManual<T>(set: Dispatch<SetStateAction<T>>) {
    return (nilai: SetStateAction<T>) => {
      setTerisiDari('');
      set(nilai);
    };
  }

  const setDesignCodeManual = tulisManual(setDesignCode);
  const setKategoriManual = tulisManual(setKategori);
  const setBatchManual = tulisManual(setBatch);
  const setKategoriVendorManual = tulisManual(setKategoriVendor);
  const setNamaVendorManual = tulisManual(setNamaVendor);
  const setWarnaManual = tulisManual(setWarna);
  const setBahanManual = tulisManual(setBahan);

  /**
   * Dipanggil tiap kali nama produk berubah.
   *
   * Pengisian hanya terjadi saat namanya BENAR-BENAR cocok dengan produk yang
   * terdaftar — dicek lewat `cariProduk`, bukan lewat kecocokan awalan.
   */
  function ubahNama(v: string) {
    setProductName(v);
    isiOtomatis(v);
  }

  // Total rencana pcs — angka yang sama dengan yang nanti tampil di kartu,
  // dihitung dari baris varian, bukan diketik terpisah.
  const totalPcs = warna.reduce(
    (s, w) => s + UKURAN.reduce((a, u) => a + (angka(w.pcs[u] ?? '') ?? 0), 0),
    0
  );

  function reset() {
    setProductName('');
    setDesignCode('');
    setKategori('');
    setBatch('B-04');
    setKategoriVendor('');
    setNamaVendor('Livou');
    setDateRequest(hariIni());
    setPic(PIC[0]);
    setWarna(awalWarna);
    setBahan(awalBahan);
    setError('');
    setSaranTerbuka(false);
    setTerisiDari('');
  }

  function simpan() {
    if (productName.trim() === '') return setError('Product Name wajib diisi.');
    if (designCode.trim() === '') return setError('Product / Design Code wajib diisi.');
    if (kategoriVendor === '') return setError('Vendor Category wajib dipilih.');
    if (totalPcs === 0) return setError('Isi qty minimal satu ukuran — total rencana masih 0 pcs.');
    // Field Date Request bertipe `date` bisa dikosongkan, dan kartu tanpa
    // tanggal akan menampilkan "Request " dengan nilai kosong di papan. Karena
    // `tanggalTampil()` sengaja TIDAK mengarang tanggal, yang kosong harus
    // ditolak di sini — bukan ditambal diam-diam.
    if (dateRequest.trim() === '') return setError('Date Request wajib diisi.');

    const barisWarna: BarisWarna[] = [];
    // Kode yang sudah terpakai di form ini, supaya dua warna berbeda tidak
    // mendapat kode yang sama — lihat `kodeUnik`.
    const kodeDipakai = new Set<string>();
    for (const w of warna) {
      const nama = w.nama.trim();
      if (nama === '') continue;
      const pcs = UKURAN.map((u) => ({ ukuran: u, qty: angka(w.pcs[u] ?? '') ?? 0 })).filter(
        (p) => p.qty > 0
      );
      if (pcs.length === 0) continue;
      // `kodeUnik` mencatat kodenya sendiri — jangan ditambahkan lagi di sini.
      const kode = kodeUnik(nama, w.kode, kodeDipakai);
      barisWarna.push({ nama, kode, pcs });
    }
    if (barisWarna.length === 0) {
      return setError('Isi minimal satu warna beserta qty per ukurannya.');
    }

    const { kain: kainSiap, aksesori: aksesoriSiap } = pisahBahan(bahan, barisWarna);

    if (kainSiap.length === 0 && aksesoriSiap.length === 0) {
      return setError('Isi minimal satu bahan.');
    }

    // Label sengaja TIDAK diisi dari form ini: stok label dicatat per ukuran di
    // gudang, dan mengarang angkanya di sini akan membuat badge "Ready" muncul
    // berdasarkan stok yang tidak pernah ada. Selama belum dicatat, barisnya
    // dilewati — lihat komentar di bahanKartu().
    const labelTersedia: Record<string, number> = {};

    onSimpan({
      productName: productName.trim(),
      designCode: designCode.trim(),
      kategori: kategori.trim() || '—',
      batch: batch.trim() || 'B-00',
      kategoriVendor,
      namaVendor: namaVendor.trim() || '—',
      dateRequest: tanggalTampil(dateRequest),
      pic,
      inisial: inisialDari(pic) || '—',
      warna: barisWarna,
      labelTersedia,
      aksesori: aksesoriSiap,
      kain: kainSiap,
    });
    reset();
  }

  return (
    <Dialog
      open={terbuka}
      onOpenChange={(buka) => {
        if (!buka) {
          reset();
          onTutup();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle className="text-base">Tambah Produksi</DialogTitle>
          <DialogDescription className="text-xs">
            Usulan baru di stage Propose. Kartunya pindah ke {tujuanApprove ?? 'stage berikutnya'}{' '}
            setelah di-approve.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            simpan();
          }}
        >
          {/* ── Identitas produk ─────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="baru-nama">Product Name</Label>
              {/* Isian + daftar saran, bukan dropdown tertutup.
                  Nama produk yang belum terdaftar di Register tetap boleh
                  diketik: form ini juga tempat usulan yang produknya memang
                  belum ada. Daftar saran cuma mempercepat yang sudah ada —
                  memilihnya mengisi seluruh form di bawahnya.

                  `onBlur` yang menutup daftarnya, bukan `onChange`: menutup
                  saat mengetik membuat saran hilang begitu satu huruf
                  terketik, dan justru di saat itulah daftarnya dibutuhkan. */}
              <div className="relative">
                <Input
                  id="baru-nama"
                  value={productName}
                  onChange={(e) => ubahNama(e.target.value)}
                  onBlur={() => setSaranTerbuka(false)}
                  onFocus={() => setSaranTerbuka(true)}
                  placeholder="Celeste Dress"
                  autoComplete="off"
                />
                {saranTerbuka && productName.trim() !== '' && (
                  <SaranProduk
                    saran={saran.filter((n) =>
                      n.toLowerCase().includes(productName.trim().toLowerCase())
                    )}
                    onPilih={(n) => {
                      // Lewat `ubahNama`, bukan `setProductName` langsung:
                      // memilih saran dan mengetik nama yang sama persis harus
                      // mengisi form dengan cara yang sama.
                      ubahNama(n);
                      setSaranTerbuka(false);
                    }}
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-kode">Product / Design Code</Label>
              <Input
                id="baru-kode"
                value={designCode}
                onChange={(e) => setDesignCodeManual(e.target.value)}
                placeholder="CSC-DRS-31"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-kategori">Category</Label>
              <Input
                id="baru-kategori"
                value={kategori}
                onChange={(e) => setKategoriManual(e.target.value)}
                placeholder="Dress"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-batch">Batch</Label>
              <Input
                id="baru-batch"
                value={batch}
                onChange={(e) => setBatchManual(e.target.value)}
                placeholder="B-04"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-vendor-kategori">Vendor Category</Label>
              <Select
                value={kategoriVendor}
                onValueChange={(v) => setKategoriVendorManual(v ?? '')}
              >
                <SelectTrigger id="baru-vendor-kategori" className="w-full">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {opsiVendor.map((o) => (
                    <SelectItem key={o.value} value={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-vendor">Vendor / CMT</Label>
              <Input
                id="baru-vendor"
                value={namaVendor}
                onChange={(e) => setNamaVendorManual(e.target.value)}
                placeholder="Livou"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-tanggal">Date Request</Label>
              <Input
                id="baru-tanggal"
                type="date"
                value={dateRequest}
                onChange={(e) => setDateRequest(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baru-pic">PIC</Label>
              <Select value={pic} onValueChange={(v) => setPic(v ?? PIC[0])}>
                <SelectTrigger id="baru-pic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIC.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Rencana warna & ukuran ───────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Color &amp; Size Plan</h3>
              <p className="text-xs text-muted-foreground">
                Isi qty per ukuran. Total rencana {totalPcs} PCS.
              </p>
            </div>

            <TabelWarna warna={warna} setWarna={setWarnaManual} />
          </section>

          {/* ── Bahan ────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Material Requirements (BOM)</h3>
              <p className="text-xs text-muted-foreground">
                Bahan yang dibutuhkan produksi ini. Stok tersedia dipakai untuk menandai baris
                yang masih kurang.
              </p>
            </div>

            <TabelBahan bahan={bahan} setBahan={setBahanManual} />
          </section>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {/* Penanda bahwa formnya terisi dari katalog, bukan diketik.
              Tanpa ini, angka yang muncul sendiri di form sepanjang ini
              terbaca seperti ketikan sendiri — dan yang mengisi jadi tidak
              tahu bahwa angkanya masih bisa (dan mungkin perlu) disesuaikan. */}
          {terisiDari && (
            <p className="text-xs text-muted-foreground">
              Terisi otomatis dari produk <span className="font-medium">{terisiDari}</span> di
              Register. Semua isian di atas masih bisa diubah.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onTutup();
              }}
            >
              Batal
            </Button>
            <Button type="submit">Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
