import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Plus, ImagePlus, Trash2, Pencil, Check, Eye, Upload, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogoPlatform } from '@/components/LogoPlatform';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { JENIS_AKSESORI_BOM, KATEGORI_PRODUK } from '@/lib/opsi';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NAMA_PASAR, PLATFORM, type StatusPasar } from '@/lib/produk';
import type { KartuRegister, ProdukRegister, BomProdukRegister } from '@/lib/produk';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { BarisWarna } from '@/pages/production-fulfillment/data-kanban';
import type { WarnaMaster } from '@/lib/warna';
import type { MaterialApi } from '@/lib/registerProduk';

export interface KeputusanBom {
  jenis: string;
  raw_material_id: number | null;
  qty_per_pcs: number;
  no_need: boolean;
}

/**
 * Kolom identitas yang bisa dikirim ke server.
 *
 * Tipe bernama, bukan ditulis ulang di tiap prop: sebelumnya bentuk ini
 * disalin TIGA kali (IsiDetailProduk, PanelKiri, DetailProduk), dan begitu
 * `kategori` ditambahkan di satu tempat, dua salinannya tertinggal — `tsc`
 * menangkapnya, tapi cuma setelah tiga definisi yang seharusnya satu.
 *
 * `kategori`, `register_date`, dan `nama_produk` opsional: pemanggil yang cuma
 * mengirim dua kolom tetap jalan, dan kolom yang tidak dikirim tidak diubah
 * server.
 *
 * `nama_produk` — BUKAN `nama`. Nama field-nya mengikuti kolomnya di database,
 * sama seperti `design_code`. Menamainya `nama` di sini akan membentuk jalur
 * ketiga yang harus diingat-ingat bedanya: `ProdukRegister.nama` (bentuk di
 * halaman), `nama_produk` (bentuk yang dikirim/diterima API), dan di tengahnya
 * fungsi pemetaan yang menukar keduanya. Selama yang menyeberang batas API
 * selalu memakai nama kolomnya, cuma ada satu aturan yang perlu diingat.
 */
export interface IdentitasProduk {
  design_code: string;
  brand: string;
  kategori?: string;
  register_date?: string;
  nama_produk?: string;
}
import PopupBuktiPasar from './PopupBuktiPasar';

// ===== Detail produk — layout resizable 30/70 =====
//
// Dibuka dari daftar Register dengan mengklik kartunya. Bentuknya dialog
// besar dengan dua panel yang bisa di-resize (drag handle di tengah):
// kiri identitas produk, kanan varian & bill of material.
//
// Panel kiri mengikuti pola identitas baku: foto polos (tanpa overlay teks),
// nama produk, daftar field Identitas yang rapi, dan daftar Platform.
// Panel kanan: satu kartu per warna dengan chip material horizontal.
//
// State warna dikelola lokal di PanelKanan (bukan mutasi props langsung):
// tambah/edit/hapus warna memicu onSimpan dengan data baru, dan induk
// yang memutuskan persistensi ke backend.
//
// ANIMASI dialog tetap 300ms ease-out scale-from-0.97 (lihat catatan di
// bawah, dipertahankan dari desain sebelumnya).

const UNIT_AKSESORIS: Record<string, string> = {
  kain: 'm',
  'benang jahit': 'roll',
  'benang obras': 'roll',
  'label brand': 'pcs',
  resleting: 'pcs',
  kancing: 'pcs',
  renda: 'm',
  'hak kait': 'set',
  karet: 'm',
  'kain pelapis': 'm',
};

function unitUntuk(jenis: string): string {
  return UNIT_AKSESORIS[jenis.toLowerCase()] ?? 'pcs';
}

/**
 * Kalimat satu material di dropdown BOM.
 *
 * Dipakai DUA kali — oleh `<SelectItem>` di daftarnya dan oleh `SelectValue`
 * di kotak terpilihnya. Kalau keduanya menyusun kalimatnya sendiri-sendiri,
 * yang terbaca setelah memilih bisa berbeda dari yang barusan dibaca di
 * daftar, dan bedanya baru ketahuan setelah terpilih.
 *
 * `materialId` dari Base UI berupa nilai item apa adanya; nilai yang tidak
 * cocok material mana pun dikembalikan sebagai `null` supaya pemanggilnya
 * yang memutuskan mau menampilkan apa — bukan dicetak sebagai id mentah.
 */
function labelMaterial(material: MaterialApi): string {
  return [
    material.kode_bahan,
    material.nama,
    material.variants.length ? `${material.variants.length} variasi` : null,
    material.satuan,
  ]
    .filter(Boolean)
    .join(' · ');
}

function cariMaterial(materials: MaterialApi[], nilai: unknown): MaterialApi | null {
  return materials.find((material) => String(material.id) === String(nilai)) ?? null;
}

export function IsiDetailProduk({
  produk,
  kartu,
  warnaMaster,
  materials,
  brands,
  onSimpanBom,
  onSimpanVarian,
  onSimpanIdentitas,
  onGantiFoto,
}: {
  produk: ProdukRegister;
  kartu?: KartuRegister | null;
  warnaMaster: WarnaMaster[];
  materials: MaterialApi[];
  /**
   * Brand yang sudah dipakai produk lain, untuk melengkapi pilihan dropdownnya.
   *
   * Ini SUDAH gabungan brand database + brand baku (`BRAND_PRODUK`), disatukan
   * di `RegisterProduk.tsx` — bukan daftar mentah dari database. Kalau
   * penggabungannya dilakukan di sini, `PanelKanan` yang tidak memakainya tetap
   * menerima prop yang isinya berbeda dari namanya.
   */
  brands: string[];
  onSimpanBom: (warnaKode: string, keputusan: KeputusanBom[]) => Promise<void>;
  onSimpanVarian: (productId: number, warnaKode: string, variants: { id?: number; size: string }[], warnaKodeBaru?: string, hapusSemua?: boolean) => Promise<void>;
  /**
   * Simpan identitas produk. Satu jalur untuk keempat kolom.
   *
   * Dulu cuma `design_code` + `brand` yang lewat sini, sedangkan kategori dan
   * tanggal daftar tampil sebagai teks mati. Pemilik meminta keduanya bisa
   * disunting langsung seperti SKU dan Brand (19 Okt 2026), jadi jalurnya
   * dilebarkan — BUKAN ditambah jalur kedua. Dua endpoint untuk kolom-kolom
   * yang berdampingan di satu daftar berarti satu tombol Simpan yang memanggil
   * dua permintaan, dan satu di antaranya bisa gagal separuh.
   *
   * `kategori` dan `register_date` boleh tidak ada: pemanggil lama yang cuma
   * mengirim dua kolom tetap jalan, dan yang tidak dikirim tidak diubah.
   */
  onSimpanIdentitas: (
    productId: number,
    identity: IdentitasProduk
  ) => Promise<void>;
  /**
   * Unggah foto utama produk. Jalur yang sama dengan unggahan di form "Tambah
   * Produk" (`POST .../register/:id/foto`).
   *
   * Sampai 19 Okt 2026 endpoint itu cuma dipanggil dari form itu, jadi produk
   * yang terlanjur tersimpan tanpa foto tidak punya jalan mendapat fotonya —
   * dan kegagalan unggah saat membuat produk meninggalkan produk yang tidak
   * bisa diperbaiki dari mana pun. Jalur kedua ini yang menutupnya.
   */
  onGantiFoto: (productId: number, berkas: File) => Promise<void>;
}) {
  return (
    // `orientation` — BUKAN `direction`: react-resizable-panels v4 mengganti
    // namanya, dan `direction` yang tidak dikenal cuma jatuh jadi atribut DOM
    // (panelnya tetap horizontal, tapi tsc menolak seluruh build).
    <ResizablePanelGroup orientation="horizontal" className="min-h-[60vh] max-md:flex-col">
      <div className="block border-b p-4 md:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identitas</p>
        <p className="font-semibold">{produk.nama}</p>
        <p className="text-sm text-muted-foreground">{produk.spesifikasi.designCode} · {produk.brand}</p>
      </div>
      {/* ── Panel kiri: identitas ─────────────────────────────── */}
      {/* Ukuran WAJIB string persen. Di v4 angka polos dibaca sebagai PIKSEl,
          jadi `defaultSize={30}` = panel selebar 30px yang kolaps jadi garis —
          bukan 30% seperti di v2/v3. Lihat catatan di components/ui/resizable.tsx. */}
      <ResizablePanel defaultSize="30%" minSize="22%" className="min-w-0 max-md:hidden">
        <PanelKiri
          produk={produk}
          kartu={kartu}
          brands={brands}
          onSimpanIdentitas={onSimpanIdentitas}
          onGantiFoto={onGantiFoto}
        />
      </ResizablePanel>

      {/*
        Gagangnya digambar sebagai `::before` milik handle-nya sendiri, bukan
        sebagai <span> di dalamnya: penanda "sedang diseret" di v4 TIDAK
        dipancarkan sebagai atribut (`data-dragging` yang lama tidak pernah
        ada, jadi seluruh kelas `data-[dragging=true]:…` mati tanpa error).
        Yang bisa dipakai cuma `:active`, dan `:active` menempel di elemen
        yang ditekan — bukan di anaknya. Karena itu status diam, hover, dan
        seret harus berada di elemen yang sama: handle-nya.

        Bentuk gambarannya sama dengan prototipe yang disetujui owner.
      */}
      <ResizableHandle className="hidden before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:z-10 before:h-6 before:w-1 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-muted-foreground/25 before:transition-all before:duration-300 before:ease-[cubic-bezier(0.32,0.72,0,1)] hover:before:h-8 hover:before:bg-muted-foreground/50 active:before:h-12 active:before:w-1.5 active:before:bg-primary motion-reduce:before:transition-none md:block" />

      {/* ── Panel kanan: varian & BOM ─────────────────────────── */}
      <ResizablePanel defaultSize="70%" minSize="40%" className="min-w-0">
        <PanelKanan
          produk={produk}
          warnaMaster={warnaMaster}
          materials={materials}
          onSimpanBom={onSimpanBom}
          onSimpanVarian={onSimpanVarian}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/* ================= Panel kiri ================= */

function PanelKiri({
  produk,
  kartu,
  brands,
  onSimpanIdentitas,
  onGantiFoto,
}: {
  produk: ProdukRegister;
  kartu?: KartuRegister | null;
  brands: string[];
  onSimpanIdentitas: (productId: number, identity: IdentitasProduk) => Promise<void>;
  onGantiFoto: (productId: number, berkas: File) => Promise<void>;
}) {
  const sp = produk.spesifikasi;
  const [buktiTerbuka, setBuktiTerbuka] = useState<StatusPasar | null>(null);
  /* Foto: pratinjau layar penuh + pemilih berkas.

     Dua state, bukan satu: `berkasFoto` adalah berkas yang DIPILIH dan belum
     tentu jadi apa-apa sampai orangnya menekan Unggah, sedangkan `pratinjau`
     adalah gambar layar penuh yang cuma untuk dilihat. Menggabungkannya berarti
     "melihat foto" dan "mengganti foto" memakai satu state yang sama, dan
     menutup pratinjau ikut membatalkan berkas yang sedang menunggu diunggah. */
  const [pratinjauTerbuka, setPratinjauTerbuka] = useState(false);
  const [berkasFoto, setBerkasFoto] = useState<File | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState(produk.nama);
  const [designCode, setDesignCode] = useState(sp.designCode);
  const [brand, setBrand] = useState(produk.brand);
  const [kategori, setKategori] = useState(produk.kategori);
  /* Tanggal daftar sebagai teks `YYYY-MM-DD`, sama seperti yang dicetak server.
     Bukan `Date`: `<input type="date">` bertukar dalam bentuk string itu, dan
     mengubahnya jadi objek cuma menambah satu perjalanan bolak-balik yang bisa
     menggeser tanggalnya sehari karena zona waktu. */
  const [registerDate, setRegisterDate] = useState(produk.registerDate);
  const [menyimpanIdentitas, setMenyimpanIdentitas] = useState(false);
  const [galatIdentitas, setGalatIdentitas] = useState<string | null>(null);

  /* Lima kolom identitas SELALU berupa isian, bukan teks yang baru bisa
     disunting setelah menekan "Edit identitas".

     Tombolnya dulu memisahkan "melihat" dari "mengubah", dan pemisahan itu
     tidak membeli apa pun di sini: yang dijaga cuma kolom-kolom pendek, dan
     harganya satu klik tambahan setiap kali seseorang ingin membetulkan
     ejaan. Yang benar-benar perlu dijaga bukan modenya, melainkan agar
     perubahan tidak terkirim tanpa disadari — dan itu dipegang baris
     Simpan/Batal di bawah, yang hanya muncul saat isinya benar-benar
     berbeda dari yang tersimpan.

     Dibandingkan apa adanya, TANPA `.trim()`: spasi di ujung tetap
     perbedaan yang terlihat orang di kotaknya, jadi ia harus memunculkan
     tombol simpannya juga. Yang dirapikan saat menyimpan adalah nilai yang
     dikirim, bukan syarat munculnya tombol. */
  const identitasBerubah =
    nama !== produk.nama ||
    designCode !== sp.designCode ||
    brand !== produk.brand ||
    kategori !== produk.kategori ||
    registerDate !== produk.registerDate;

  /* Pilihan brand: brand baku, brand yang sudah dipakai produk lain, ditambah
     brand produk ini sendiri, diurutkan. Dibuang yang kosong — brand belum
     diisi bukan pilihan.

     `Set` merapikan duplikat, dan itu memang perlu: brand produk ini ikut
     disisipkan tanpa dicek dulu apakah ia sudah ada di daftarnya.

     Brand produk ini WAJIB ikut, juga saat ia tidak ada di dua sumber lain.
     Tanpa itu, sebuah produk yang brandnya sudah tidak dipakai produk mana pun
     akan tampil sebagai kotak kosong di produknya sendiri — dan satu klik
     Simpan sesudahnya akan mengganti brandnya jadi pilihan pertama daftar,
     diam-diam, tanpa pernah ada yang mengetik apa pun. */
  const pilihanBrand = Array.from(
    new Set([...brands, produk.brand].filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  /* Pilihan kategori: daftar baku, ditambah kategori produk ini kalau ia tidak
     ada di sana. Alasannya sama persis dengan brand di atas — dan di data
     nyata ini bukan kasus teoretis: tiga produk yang ada berkategori 'Atasan'
     dan 'Top', dua nama yang tidak ada di `KATEGORI_PRODUK` (lihat catatan di
     `opsi.ts`). Tanpa penyisipan ini, membuka salah satu produk itu lalu
     menekan Simpan akan mengubah kategorinya jadi 'T-Shirt'. */
  const pilihanKategori = useMemo(() => {
    const daftar = KATEGORI_PRODUK.map((k) => k.value as string);
    return daftar.includes(produk.kategori) || !produk.kategori
      ? daftar
      : [produk.kategori, ...daftar];
  }, [produk.kategori]);

  async function simpanIdentitas() {
    if (!nama.trim()) {
      setGalatIdentitas('Nama produk wajib diisi.');
      return;
    }
    if (!designCode.trim() || !brand.trim()) {
      setGalatIdentitas('SKU Produk dan Brand wajib diisi.');
      return;
    }
    setMenyimpanIdentitas(true);
    setGalatIdentitas(null);
    try {
      await onSimpanIdentitas(Number(produk.id), {
        // Nama SELALU ikut dikirim, bukan cuma saat berubah: server memperlakukan
        // field yang tidak dikirim sebagai "jangan diubah", dan mengirimkannya
        // apa adanya tidak mengubah apa pun. Yang dihindari dengan mengirim
        // sebagian adalah bentuk kedua dari jalur ini — dan bentuk kedua selalu
        // jadi tempat bug bersembunyi.
        nama_produk: nama.trim(),
        design_code: designCode.trim(),
        brand: brand.trim(),
        // Kategori dan tanggal TIDAK di-`trim()` jadi `|| undefined`: kategori
        // kosong adalah pilihan yang sah (produk lama boleh belum berkategori),
        // dan mengirim `undefined` berarti "jangan diubah" — beda dari string
        // kosong yang berarti "kosongkan".
        kategori,
        register_date: registerDate,
      });
      /* Diisi dengan nilai yang BARU DISIMPAN, bukan yang diketik.

         Yang dikirim sudah dirapikan (`trim()`), sedangkan kotaknya masih
         memuat spasi yang tadi diketik. Kalau dibiarkan, baris Simpan/Batal
         tetap muncul setelah penyimpanan berhasil — seolah perubahannya
         belum masuk — padahal yang tersisa cuma spasi yang tidak pernah
         ikut tersimpan. */
      setNama(nama.trim());
      setDesignCode(designCode.trim());
      setBrand(brand.trim());
    } catch (error) {
      setGalatIdentitas(error instanceof Error ? error.message : 'Gagal menyimpan identitas produk.');
    } finally {
      setMenyimpanIdentitas(false);
    }
  }

  function batalEditIdentitas() {
    setNama(produk.nama);
    setDesignCode(sp.designCode);
    setBrand(produk.brand);
    setKategori(produk.kategori);
    setRegisterDate(produk.registerDate);
    setGalatIdentitas(null);
  }

  /* Ganti foto: berkas dipilih lewat menu, lalu pratinjaunya muncul di bingkai
     foto sebelum apa pun dikirim. Unggahannya baru jalan saat tombol Unggah
     ditekan — memilih berkas tidak boleh langsung menulis ke server, karena
     menu itu juga memuat "Lihat Foto" yang cuma untuk melihat. */
  function pilihBerkasFoto(berkas: File | null) {
    if (!berkas) return;
    setBerkasFoto(berkas);
    setGalatIdentitas(null);
  }

  async function unggahFotoProduk() {
    if (!berkasFoto) return;
    setMenyimpanIdentitas(true);
    setGalatIdentitas(null);
    try {
      await onGantiFoto(Number(produk.id), berkasFoto);
      setBerkasFoto(null);
      // Dikosongkan supaya memilih berkas yang SAMA dua kali berturut-turut tetap
      // memicu onChange. Tanpa ini, "ganti foto" dengan berkas yang barusan
      // gagal terunggah tidak melakukan apa-apa — dan itu terbaca seperti
      // tombolnya rusak.
      if (inputFoto.current) inputFoto.current.value = '';
    } catch (error) {
      setGalatIdentitas(error instanceof Error ? error.message : 'Gagal mengunggah foto.');
    } finally {
      setMenyimpanIdentitas(false);
    }
  }
  // Status platform lokal — upload screenshot mengisi fotoBukti + tandai terdaftar.
  const [pasar, setPasar] = useState<StatusPasar[]>(kartu?.pasar ?? []);

  function simpanBukti(fotoDataUrl: string) {
    if (!buktiTerbuka) return;
    setPasar(
      pasar.map((s) =>
        s.platform === buktiTerbuka.platform
          ? { ...s, terdaftar: true, fotoBukti: fotoDataUrl }
          : s
      )
    );
    setBuktiTerbuka(null);
  }

  return (
    <div className="h-full space-y-5 overflow-y-auto p-5">
      {/* Foto 4:5 — potret, tingginya lebih dari lebarnya. Bukan 4:3 yang
          melebar ke samping: yang dibutuhkan foto produk pakaian justru
          proporsi potret, sama seperti bingkai katalognya. `mx-auto` menjaga
          lebarnya tidak ikut menarik seluruh panel saat panelnya lebar.

          Sejak 19 Okt 2026 bingkainya bisa DIKLIK dan membuka menu: "Lihat
          Foto" kalau fotonya ada, "Ganti Foto" selalu. Pemilik memintanya
          begitu ("kalau foto mungkin pas di klik bisa pilih mau lihat foto
          produk atau diganti fotonya") — dan itu sekaligus menutup lubang yang
          lama: sampai hari ini tidak ada satu pun jalan mengganti foto produk
          yang sudah terdaftar, karena endpoint unggahnya cuma dipanggil dari
          form "Tambah Produk".

          Elemennya <button>, bukan <div onClick>: papan tik dan pembaca layar
          tidak bisa menekan div. Tombolnya juga TIDAK dimatikan saat fotonya
          kosong — menu "Ganti Foto"-nya justru satu-satunya cara produk tanpa
          foto mendapat fotonya. */}
      <div className="mx-auto w-full max-w-[22rem] space-y-2">
        <FotoProduk
          produk={produk}
          berkasBaru={berkasFoto}
          onLihat={() => setPratinjauTerbuka(true)}
          onPilihBerkas={() => inputFoto.current?.click()}
        />
        <input
          ref={inputFoto}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Berkas foto produk"
          onChange={(event) => pilihBerkasFoto(event.target.files?.[0] ?? null)}
        />

        {/* Baris Unggah/Batal cuma muncul saat ada berkas yang menunggu.
            Selalu menampilkannya berarti dua tombol yang tidak melakukan apa-apa
            pada hampir semua pembukaan dialog. */}
        {berkasFoto && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setBerkasFoto(null);
                if (inputFoto.current) inputFoto.current.value = '';
              }}
              disabled={menyimpanIdentitas}
            >
              Batal
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={unggahFotoProduk}
              disabled={menyimpanIdentitas}
            >
              <Check className="mr-1 h-3 w-3" />
              {menyimpanIdentitas ? 'Mengunggah…' : 'Unggah Foto'}
            </Button>
          </div>
        )}
      </div>

      {/* Identitas — daftar label/nilai rapi */}
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identitas
        </h4>
        <dl className="divide-y divide-border rounded-lg border">
          {/* Baris pertama: Nama Produk.
              Sebelumnya nama berdiri sebagai <h3> di atas daftar, dan pemilik
              meminta ia ikut masuk ke tabel (19 Okt 2026) — nama memang satu
              dari identitas produk, jadi memisahkannya membuat daftarnya
              terbaca sebagai "identitas minus nama".

              Bisa disunting seperti kolom lain sejak hari yang sama ("nama
              produk ... kalau di klik bisa langsung edit"). Dulu baris ini
              sengaja teks mati dengan alasan "yang tidak bisa disimpan jangan
              dibuat terlihat bisa disimpan" — alasan itu GUGUR begitu endpoint
              PUT-nya ikut menerima `nama_produk`, dan sekarang justru
              sebaliknya: kolom wajib yang tidak bisa dibetulkan ejaannya.

              Tidak ikut dikosongkan: nama produk NOT NULL di database. Server
              menolak string kosong sebagai 400 dengan pesan yang jelas (lihat
              routes.js), dan tombol Simpan di bawah ikut mati. */}
          <BarisIsian label="Nama Produk">
            <Input
              value={nama}
              onChange={(event) => setNama(event.target.value)}
              aria-label="Nama Produk"
              className="h-7 text-sm"
            />
          </BarisIsian>

          {/* Empat kolom yang bisa disunting — lihat catatan di
              `identitasBerubah`. Labelnya di kiri seperti baris `Field` lain,
              isiannya di kanan, supaya daftarnya tetap terbaca sebagai satu
              kolom label-nilai. */}
          <BarisIsian label="SKU Produk">
            <Input
              value={designCode}
              onChange={(event) => setDesignCode(event.target.value)}
              aria-label="SKU Produk"
              className="h-7 text-sm"
            />
          </BarisIsian>
          <BarisIsian label="Brand">
            {/* Pilihan, bukan ketikan bebas.
                Brand yang diketik tangan bercabang jadi banyak ejaan untuk satu
                merek yang sama ("Livou", "livou", "Livou "), dan itu merembet ke
                mana-mana: penyaringan dan pengelompokan per brand jadi tidak
                pernah cocok. Isinya gabungan brand baku (`BRAND_PRODUK`) dengan
                brand yang sudah dipakai produk lain, jadi pilihannya bertambah
                sendiri begitu ada produk dengan brand baru.

                Nilai produk ini sendiri selalu ikut disertakan: kalau brandnya
                sudah tidak dipakai produk lain, ia tetap muncul dan tetap bisa
                disimpan ulang tanpa terpaksa berpindah merek. */}
            <Select value={brand} onValueChange={(value) => setBrand(value ?? '')}>
              <SelectTrigger aria-label="Brand" className="h-7 w-full text-sm">
                <SelectValue placeholder="Pilih brand">{(value) => value || null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pilihanBrand.map((nama) => (
                  <SelectItem key={nama} value={nama}>{nama}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </BarisIsian>
          <BarisIsian label="Kategori">
            {/* Kategori produk ini selalu ada di daftarnya, juga saat namanya
                tidak dikenal `KATEGORI_PRODUK` — lihat `pilihanKategori`. */}
            <Select value={kategori} onValueChange={(value) => setKategori(value ?? '')}>
              <SelectTrigger aria-label="Kategori" className="h-7 w-full text-sm">
                <SelectValue placeholder="Pilih kategori">{(value) => value || null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pilihanKategori.map((nama) => (
                  <SelectItem key={nama} value={nama}>{nama}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </BarisIsian>
          <BarisIsian label="Registered">
            {/* Date picker, bukan kotak teks: tanggal yang diketik tangan gampang
                salah bentuk, dan yang tersimpan harus satu bentuk (`YYYY-MM-DD`)
                karena kolom `created_at` di database bertipe TIMESTAMP.

                TIDAK dikunci. "Registered" dulu memang tanggal server dan
                ditampilkan sebagai teks mati; pemilik meminta ia bisa disunting
                seperti kolom lain (19 Okt 2026), dan yang dikirim ke server
                memang tanggalnya saja — jam-menit-detiknya dibiarkan apa
                adanya. */}
            <Input
              type="date"
              value={registerDate}
              onChange={(event) => setRegisterDate(event.target.value)}
              aria-label="Registered"
              className="h-7 text-sm"
            />
          </BarisIsian>

          {/* Galat identitas DAN galat unggah foto, di luar blok Simpan/Batal.

              Dulu pesannya berada DI DALAM blok itu, dan sejak foto ikut
              memakai `galatIdentitas` (19 Okt 2026) penempatan itu jadi salah:
              unggahan foto yang gagal tidak mengubah satu pun kolom identitas,
              jadi `identitasBerubah` tetap false — bloknya tidak dirender, dan
              pesan "Gagal mengunggah foto" tidak pernah muncul di mana pun.
              Kegagalannya jadi senyap persis di layar yang menjelaskannya.

              Tombolnya tetap di dalam blok: yang perlu ditahan supaya tidak
              muncul tanpa guna cuma tombolnya, bukan pesannya. */}
          {galatIdentitas && (
            <div className="px-4 py-2">
              <p role="alert" className="text-xs text-destructive">{galatIdentitas}</p>
            </div>
          )}
          {/* Simpan/Batal cuma muncul saat ada yang berubah. Selalu
              menampilkannya berarti dua tombol yang tidak melakukan apa-apa
              pada hampir semua pembukaan dialog — dan tombol yang biasanya
              diam lama-lama tidak dibaca lagi. */}
          {identitasBerubah && (
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2">
              <Button variant="outline" size="sm" onClick={batalEditIdentitas} disabled={menyimpanIdentitas}>
                Batal
              </Button>
              <Button
                size="sm"
                onClick={simpanIdentitas}
                disabled={menyimpanIdentitas || !nama.trim() || !designCode.trim() || !brand.trim()}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {menyimpanIdentitas ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          )}
          {kartu && (
            <Field
              label="Varian"
              nilai={`${kartu.jumlahWarna} warna · ${kartu.jumlahVarian} varian`}
            />
          )}
        </dl>
      </section>

      {/* Platform — baris vertikal, satu per platform */}
      {kartu && (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Platform
          </h4>
          <div className="space-y-2">
            {PLATFORM.map((p) => {
              const st = pasar.find((s) => s.platform === p);
              if (!st) return null;
              return (
                <BarisPlatform
                  key={p}
                  status={st}
                  onBuka={() => setBuktiTerbuka(st)}
                />
              );
            })}
          </div>
        </section>
      )}

      <PopupBuktiPasar
        terbuka={buktiTerbuka !== null}
        produk={produk.nama}
        status={buktiTerbuka}
        onTutup={() => setBuktiTerbuka(null)}
        onSimpan={simpanBukti}
      />

      {/* Pratinjau layar penuh. `produk.foto` sengaja, BUKAN berkas yang
          menunggu diunggah: menu "Lihat Foto" membaca yang tersimpan di server
          — yang barusan dipilih sudah terlihat di bingkainya sendiri, dan
          menyamakan keduanya membuat "lihat" dan "pratinjau unggahan" jadi dua
          hal yang tidak bisa dibedakan lagi. */}
      <Dialog open={pratinjauTerbuka} onOpenChange={(buka) => !buka && setPratinjauTerbuka(false)}>
        <DialogContent
          className="duration-300 ease-out sm:max-w-3xl"
          style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
        >
          <DialogHeader>
            <DialogTitle>{produk.nama}</DialogTitle>
          </DialogHeader>
          {produk.foto ? (
            <img
              src={produk.foto}
              alt={`Foto produk ${produk.nama}`}
              className="max-h-[75vh] w-full rounded-md border object-contain"
            />
          ) : (
            /* Kotak kosong yang menjelaskan dirinya sendiri, bukan <img> dengan
               src kosong: src kosong memicu permintaan gagal ke server dan
               menampilkan ikon gambar rusak — terbaca seperti berkasnya hilang,
               padahal memang belum pernah ada. */
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-md border border-dashed bg-muted/40">
              <p className="text-sm text-muted-foreground">Produk ini belum punya foto.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Bingkai foto produk, sekaligus tombol pembuka menunya.
 *
 * Isinya bisa berupa berkas yang BARU DIPILIH (pratinjau sebelum diunggah) atau
 * foto yang sudah tersimpan. Yang baru menang, karena ia yang sedang ditunggu
 * keputusannya — dan bingkai yang tetap menampilkan foto lama setelah orangnya
 * memilih berkas baru terbaca seperti pemilihannya tidak masuk.
 *
 * Object URL-nya dibuat di `useEffect` lalu DILEPAS saat berkasnya berganti
 * atau komponennya dilepas. Melepasnya penting: setiap object URL menahan
 * berkasnya di memori sampai dilepas, dan dialog ini bisa dibuka-tutup
 * berkali-kali untuk produk yang berbeda-beda.
 */
function FotoProduk({
  produk,
  berkasBaru,
  onLihat,
  onPilihBerkas,
}: {
  produk: ProdukRegister;
  berkasBaru: File | null;
  onLihat: () => void;
  onPilihBerkas: () => void;
}) {
  const [pratinjau, setPratinjau] = useState<string | null>(null);

  useEffect(() => {
    if (!berkasBaru) {
      setPratinjau(null);
      return;
    }
    const url = URL.createObjectURL(berkasBaru);
    setPratinjau(url);
    return () => URL.revokeObjectURL(url);
  }, [berkasBaru]);

  const tampil = pratinjau ?? produk.foto;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Foto produk"
        render={
          <button
            type="button"
            className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        {tampil ? (
          <img src={tampil} alt={produk.nama} className="h-full w-full object-cover" />
        ) : (
          'FOTO'
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-44">
        <DropdownMenuItem onClick={onLihat} disabled={!produk.foto}>
          <Eye />
          Lihat Foto
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPilihBerkas}>
          <Upload />
          Ganti Foto
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Satu baris platform: logo + nama + badge status. */
function BarisPlatform({
  status,
  onBuka,
}: {
  status: StatusPasar;
  onBuka: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <LogoPlatform platform={status.platform} className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-sm font-medium">{NAMA_PASAR[status.platform]}</span>
      {status.terdaftar ? (
        <span className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            ● Registered
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBuka} title="Lihat bukti">
            <ImagePlus className="h-4 w-4" />
          </Button>
        </span>
      ) : (
        /* Belum terdaftar: badge dashed yang BISA DIKLIK untuk upload.
           Tombolnya tidak disembunyikan — tombol yang hilang membuat alur
           upload tidak bisa dinilai. Lihat PopupBuktiPasar. */
        <button
          onClick={onBuka}
          className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          ○ Not registered
        </button>
      )}
    </div>
  );
}

/* ================= Panel kanan ================= */

function PanelKanan({
  produk,
  warnaMaster,
  materials,
  onSimpanBom,
  onSimpanVarian,
}: {
  produk: ProdukRegister;
  warnaMaster: WarnaMaster[];
  materials: MaterialApi[];
  onSimpanBom: (warnaKode: string, keputusan: KeputusanBom[]) => Promise<void>;
  onSimpanVarian: (productId: number, warnaKode: string, variants: { id?: number; size: string }[], warnaKodeBaru?: string, hapusSemua?: boolean) => Promise<void>;
}) {
  const sp = produk.spesifikasi;
  const daftarWarna = sp.warna;
  const [modeTambah, setModeTambah] = useState(false);
  const [jenisEdit, setJenisEdit] = useState<{ warnaKode: string; jenis: string } | null>(null);
  const [sedangSimpan, setSedangSimpan] = useState(false);
  const [galatSimpan, setGalatSimpan] = useState<string | null>(null);
  const [warnaEdit, setWarnaEdit] = useState<BarisWarna | null>(null);

  /**
   * Keputusan bahan yang dibuat di kartu varian SEBELUM variannya ada.
   *
   * `product_bom` menggantung pada `variant_id`, dan varian baru lahir saat
   * Simpan. Jadi keputusan yang dipilih lebih dulu ditahan di sini, lalu
   * dikirim setelah variannya tersimpan — kalau dikirim lebih awal, server
   * menolak karena warnanya belum punya varian sama sekali.
   *
   * Kuncinya warnaKode, sama seperti keputusan yang sudah tersimpan, supaya
   * keduanya bisa dibaca dengan cara yang sama.
   */
  const [keputusanBaru, setKeputusanBaru] = useState<Record<string, Record<string, KeputusanBom>>>({});

  async function simpanVarian(
    warnaKode: string,
    variants: { id?: number; size: string }[],
    warnaKodeBaru?: string,
    hapusSemua = false,
  ) {
    await onSimpanVarian(Number(produk.id), warnaKode, variants, warnaKodeBaru, hapusSemua);
    setGalatSimpan(null);
    setModeTambah(false);
    setWarnaEdit(null);
  }

  async function hapusWarna(warna: BarisWarna) {
    if (!window.confirm(`Hapus warna ${warna.nama} beserta semua size dari produk ini?`)) return;
    setSedangSimpan(true);
    setGalatSimpan(null);
    try {
      await simpanVarian(warna.kode, [], undefined, true);
    } catch (error) {
      setGalatSimpan(error instanceof Error ? error.message : 'Gagal menghapus warna');
    } finally {
      setSedangSimpan(false);
    }
  }

  async function simpanEditVarian(warnaAwal: BarisWarna | null, ubah: BarisWarna) {
    setSedangSimpan(true);
    setGalatSimpan(null);
    try {
      const existing = warnaAwal?.pcs ?? [];
      const variants = ubah.pcs.map((item) => ({
        ...(existing.find((prior) => prior.ukuran === item.ukuran)?.variantId != null
          ? { id: existing.find((prior) => prior.ukuran === item.ukuran)!.variantId }
          : {}),
        size: item.ukuran,
      }));
      await simpanVarian(warnaAwal?.kode ?? ubah.kode, variants, ubah.kode);

      // Bahan yang dipilih sebelum variannya ada baru bisa dikirim sekarang,
      // setelah variannya lahir. Warnanya sengaja `ubah.kode` (warna TUJUAN),
      // bukan `warnaAwal.kode`: `simpanVarian` sudah memindahkan variannya ke
      // warna tujuan, jadi keputusan yang dikirim ke warna asal tidak akan
      // menemukan varian apa pun di sana.
      //
      // Dikirim LENGKAP untuk semua jenis, bukan hanya yang barusan diubah:
      // endpoint BOM menghapus seluruh baris satu warna lalu menulis ulang dari
      // daftar yang dikirim. Mengirim sebagian berarti menghapus sisanya.
      const tertunda = keputusanBaru[ubah.kode];
      if (tertunda && Object.keys(tertunda).length) {
        const lengkap = JENIS_AKSESORI_BOM.map(
          (jenis) => tertunda[jenis.value] ?? keputusanAwal(ubah.kode, jenis.value)
        );
        await onSimpanBom(ubah.kode, lengkap);
        setKeputusanBaru((sebelum) => {
          const sisa = { ...sebelum };
          delete sisa[ubah.kode];
          return sisa;
        });
      }
    } catch (error) {
      setGalatSimpan(error instanceof Error ? error.message : 'Gagal menyimpan varian');
    } finally {
      setSedangSimpan(false);
    }
  }

  function keputusanAwal(warnaKode: string, jenis: string): KeputusanBom {
    const variantSizes = produk.spesifikasi.warna.find((w) => w.kode === warnaKode)?.pcs.map((p) => p.ukuran) ?? [];
    const rows = (produk.bom ?? []).filter((b) => b.jenis === jenis && b.warna_kode === warnaKode && variantSizes.includes(b.size));
    const row = rows[0];
    return row
      ? { jenis, raw_material_id: row.no_need ? null : row.raw_material_id, qty_per_pcs: row.qty_per_pcs, no_need: row.no_need }
      : { jenis, raw_material_id: null, qty_per_pcs: 0, no_need: false };
  }

  async function simpanKeputusan(warnaKode: string, keputusan: KeputusanBom[]) {
    setSedangSimpan(true);
    setGalatSimpan(null);
    try {
      await onSimpanBom(warnaKode, keputusan);
      setJenisEdit(null);
    } catch (error) {
      setGalatSimpan(error instanceof Error ? error.message : 'Gagal menyimpan BOM');
    } finally {
      setSedangSimpan(false);
    }
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-amber-700">
          Varian &amp; Bill of material
        </h3>
        {/* c-button-18: outline + icon di kiri, untuk aksi Add Item */}
        <Button variant="outline" size="sm" onClick={() => setModeTambah(true)} disabled={modeTambah || !warnaMaster.some((warna) => !daftarWarna.some((dipakai) => dipakai.kode === warna.kode))}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {galatSimpan && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{galatSimpan}</p>}
      {daftarWarna.map((w) => (
        warnaEdit?.kode === w.kode ? (
          <KartuWarnaEdit
            key={w.kode}
            warnaMaster={warnaMaster}
            warnaTerpakai={daftarWarna.filter((item) => item.kode !== w.kode).map((item) => item.kode)}
            warnaAwal={w}
            sedangSimpan={sedangSimpan}
            materials={materials}
            produk={produk}
            decisions={keputusanBaru[w.kode]}
            onDecision={(k, warnaKode) =>
              setKeputusanBaru((sebelum) => ({
                ...sebelum,
                [warnaKode]: { ...(sebelum[warnaKode] ?? {}), [k.jenis]: k },
              }))
            }
            onBatal={() => setWarnaEdit(null)}
            onSimpan={(ubah) => simpanEditVarian(w, ubah)}
          />
        ) : (
          <KartuWarna
            key={w.kode}
            produk={produk}
            warna={w}
            materials={materials}
            sedangSimpan={sedangSimpan}
            sedangEdit={jenisEdit?.warnaKode === w.kode ? jenisEdit.jenis : null}
            onMulaiEdit={(jenis) => setJenisEdit({ warnaKode: w.kode, jenis })}
            onBatalEdit={() => setJenisEdit(null)}
            onMulaiEditVarian={() => setWarnaEdit(w)}
            onSimpanBom={(keputusan) => simpanKeputusan(w.kode, [...JENIS_AKSESORI_BOM.map((j) => {
              const prior = keputusanAwal(w.kode, j.value);
              return j.value === keputusan.jenis ? keputusan : prior;
            })])}
            onHapus={() => hapusWarna(w)}
          />
        )
      ))}

      {modeTambah && (
        <KartuWarnaEdit
          warnaMaster={warnaMaster}
          warnaTerpakai={daftarWarna.map((item) => item.kode)}
          warnaAwal={null}
          sedangSimpan={sedangSimpan}
          materials={materials}
          produk={produk}
          onDecision={(k, warnaKode) =>
            setKeputusanBaru((sebelum) => ({
              ...sebelum,
              [warnaKode]: { ...(sebelum[warnaKode] ?? {}), [k.jenis]: k },
            }))
          }
          onBatal={() => setModeTambah(false)}
          onSimpan={(ubah) => simpanEditVarian(null, ubah)}
        />
      )}
    </div>
  );
}

/**
 * Satu kartu warna: nama + size di kiri, chip material horizontal di kanan.
 *
 * Diekspor hanya untuk smoke test — di aplikasi ia selalu dirender lewat
 * `PanelKanan` di dalam dialog, dan `DialogContent` memakai portal yang tidak
 * ikut ter-render di server. Tanpa export ini, check atas chip bahan hanya
 * bisa lewat halaman utuh, yang tidak pernah sampai ke dialognya.
 */
export function KartuWarna({
  produk,
  warna,
  materials,
  sedangSimpan,
  sedangEdit,
  onMulaiEdit,
  onBatalEdit,
  onMulaiEditVarian,
  onSimpanBom,
  onHapus,
}: {
  produk: ProdukRegister;
  warna: BarisWarna;
  materials: MaterialApi[];
  sedangSimpan: boolean;
  /** Jenis yang popover editnya sedang terbuka. */
  sedangEdit: string | null;
  onMulaiEdit: (jenis: string) => void;
  onBatalEdit: () => void;
  onMulaiEditVarian: () => void;
  onSimpanBom: (keputusan: KeputusanBom) => void;
  onHapus: () => void;
}) {
  const [menuBuka, setMenuBuka] = useState(false);

  // Kotak yang tampil untuk warna ini, sudah diurutkan.
  //
  // Kain (roll/ecer) didahulukan di antara kotak yang setara, karena ia bahan
  // pokoknya — tapi aturan "no need ke belakang" berlaku untuk semua kategori,
  // termasuk kain yang sudah diputuskan tidak dipakai.
  //
  // Disusun sebagai satu daftar lalu diurutkan, bukan dua kelompok yang masing-
  // masing diurutkan sendiri: kalau kain dan aksesori diurutkan terpisah, kain
  // yang "no need" tetap duduk di depan aksesori yang dipakai — persis yang
  // dikeluhkan pemilik.
  const bom = produk.bom ?? [];
  const kotak = JENIS_AKSESORI_BOM.filter((jenis) => {
    const kain = jenis.value === 'roll' || jenis.value === 'ecer';
    if (kain) return true;
    // Hanya aksesori yang punya keputusan ATAU punya material di master yang
    // tampil — jenis yang belum pernah diputuskan dan tidak punya satu pun
    // bahan di master cuma jadi kotak "Pilih bahan" yang tidak menunjuk apa-apa.
    //
    // Aturan ini TIDAK diubah pada 19 Okt 2026; yang diperbaiki adalah API-nya.
    // Kotak "no need" memang selalu dirender kalau barisnya ada, tapi barisnya
    // hilang di perjalanan: `jenis` baris no-need dulu dibaca dari join ke
    // `raw_materials`, dan baris itu memang tidak menunjuk material apa pun —
    // jadi barisnya sampai ke sini dengan jenis kosong dan tidak cocok dengan
    // kotak mana pun. Keputusan yang tersimpan lalu terbaca sebagai "Pilih
    // bahan".
    const rows = bom.filter((row) => row.jenis === jenis.value && row.warna_kode === warna.kode);
    return rows.length > 0 || materials.some((material) => material.jenis === jenis.value);
  })
    .map((jenis, indeks) => ({
      jenis,
      indeks,
      baris: bom.filter((row) => row.jenis === jenis.value && row.warna_kode === warna.kode),
    }))
    .sort(
      (a, b) =>
        URUTAN_KEADAAN[keadaanKotak(a.baris)] - URUTAN_KEADAAN[keadaanKotak(b.baris)] ||
        a.indeks - b.indeks
    )
    .map((item) => item.jenis);

  // Kain untuk warna ini + semua aksesori produk
  return (
    <div className="relative rounded-2xl border-2 p-4">
      {/* Menu ⋮ — Edit / Delete */}
      <div className="absolute right-2 top-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setMenuBuka(!menuBuka)}
        >
          ⋮
        </Button>
        {menuBuka && (
          <div className="absolute right-0 top-8 z-10 w-28 rounded-md border bg-background py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                setMenuBuka(false);
                onMulaiEditVarian();
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-muted"
              onClick={() => {
                setMenuBuka(false);
                onHapus();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {/* Kiri: nama warna + size */}
        <div className="min-w-[110px] space-y-2">
          <div className="font-bold">{warna.nama}</div>
          <div className="flex flex-col gap-1.5">
            {warna.pcs.map((p) => (
              <span key={p.ukuran} className="rounded-md border px-3 py-1 text-center text-sm">
                {p.ukuran}
              </span>
            ))}
          </div>
        </div>

        {/* Kanan: chip material — satu baris horizontal, flex-grow mengisi */}
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {kotak.map((jenis) => (
            <ChipBahan
              key={jenis.value}
              jenis={jenis}
              warnaKode={warna.kode}
              bom={bom}
              materials={materials}
              sedangSimpan={sedangSimpan}
              popoverTerbuka={sedangEdit === jenis.value}
              onBuka={() => onMulaiEdit(jenis.value)}
              onTutup={onBatalEdit}
              onSimpanBom={onSimpanBom}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Urutan kotak bahan di dalam satu kartu warna.
 *
 * Permintaan pemilik (20 Okt 2026): "kalau pilih materialnya no need di sini
 * jadi urutan paling belakang aja, jadi cuman perlu lihat material yang memang
 * dipakai". Jadi yang sudah diputuskan "tidak diperlukan" didorong ke ujung
 * kanan, dan bagian depan baris hanya berisi bahan yang benar-benar dipakai.
 *
 * "Belum diputuskan" sengaja TIDAK ikut ke belakang. Kotak yang belum dijawab
 * justru yang paling perlu dilihat — menyembunyikannya di ujung kanan membuat
 * bahan yang lupa diisi terlihat sama dengan bahan yang sudah selesai.
 *
 * Urutannya stabil: jenis yang berada di kelompok yang sama tetap mengikuti
 * urutan baku `JENIS_AKSESORI_BOM`, supaya posisi kotak tidak melompat-lompat
 * hanya karena satu keputusan berubah.
 */
const URUTAN_KEADAAN = { dipakai: 0, belum: 1, 'no-need': 2 } as const;

function keadaanKotak(rows: BomProdukRegister[]): keyof typeof URUTAN_KEADAAN {
  const baris = rows[0];
  if (!baris) return 'belum';
  // Baris yang keputusannya berbeda antar-size belum bisa disebut "dipakai"
  // maupun "no need" — ia ditandai sendiri di dalam kotaknya.
  if (baris.no_need) return 'no-need';
  return baris.raw_material_id == null ? 'belum' : 'dipakai';
}

/**
 * Keputusan bahan satu warna yang sudah tersimpan, diiris per jenis.
 *
 * `produk.bom` menyimpan satu baris per (varian × jenis), sedangkan keputusan
 * berlaku per warna. Baris pertama yang cocok dipakai sebagai wakil; ukuran
 * yang tidak konsisten sudah ditandai sendiri di dalam kotaknya.
 */
function keputusanPerJenis(
  warnaKode: string,
  bom: BomProdukRegister[],
  ukuranWarna: string[]
): Record<string, KeputusanBom> {
  const hasil: Record<string, KeputusanBom> = {};
  for (const row of bom) {
    if (row.warna_kode !== warnaKode) continue;
    if (ukuranWarna.length && !ukuranWarna.includes(row.size)) continue;
    if (!row.jenis || hasil[row.jenis]) continue;
    hasil[row.jenis] = {
      jenis: row.jenis,
      raw_material_id: row.no_need ? null : row.raw_material_id,
      qty_per_pcs: row.qty_per_pcs,
      no_need: row.no_need,
    };
  }
  return hasil;
}

/**
 * Daftar bahan untuk kartu varian yang sedang diisi.
 *
 * Beda dari kotak di kartu warna biasa: di sini yang dibutuhkan bukan "melihat
 * tujuh kotak besar", tapi "menjawab yang perlu dijawab sambil mengisi warna
 * dan size". Jadi ketujuhnya ditulis sebagai baris ringkas yang menampilkan
 * jawabannya, dengan popover yang sama seperti di kartu warna.
 *
 * Yang menentukan kotak mana yang tampil tetap aturan yang sama: kain selalu
 * tampil, aksesori hanya kalau sudah punya keputusan atau ada bahannya di
 * master — kalau tidak, jawabannya tidak akan bisa disimpan ke mana pun.
 */
function BahanVarian({
  warnaKode,
  materials,
  decisions,
  onDecision,
  sedangSimpan = false,
  idAkarsa,
}: {
  warnaKode: string;
  materials: MaterialApi[];
  /** Keputusan yang sudah tersimpan untuk warna ini. */
  decisions: Record<string, KeputusanBom>;
  /** Keputusan yang barusan dibuat di kartu ini, belum tersimpan. */
  onDecision?: (keputusan: KeputusanBom, warnaKode: string) => void;
  sedangSimpan?: boolean;
  /**
   * Pembeda id isian antar-kartu. Dua kartu edit bisa terbuka bersamaan (satu
   * kartu warna, satu kartu Add), dan keduanya merender isian dengan id yang
   * sama — label "Kebutuhan / pcs" lalu menunjuk ke isian kartu yang salah.
   */
  idAkarsa: string;
}) {
  const [buka, setBuka] = useState<string | null>(null);
  // Keputusan yang dibuat di kartu ini MENANG atas yang tersimpan: begitu
  // dipilih, barisnya harus langsung menunjukkan pilihan barunya.
  const [lokal, setLokal] = useState<Record<string, KeputusanBom>>({});
  const semua = { ...decisions, ...lokal };

  const tampil = JENIS_AKSESORI_BOM.filter((jenis) => {
    if (jenis.value === 'roll' || jenis.value === 'ecer') return true;
    return semua[jenis.value] != null || materials.some((m) => m.jenis === jenis.value);
  });

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        Bahan
      </p>
      {tampil.map((jenis) => {
        const keputusan = semua[jenis.value] ?? null;
        const material = keputusan ? cariMaterial(materials, keputusan.raw_material_id) : null;
        const ringkas = keputusan?.no_need
          ? 'Tidak diperlukan'
          : material
            ? `${material.nama} · ${keputusan!.qty_per_pcs} ${material.satuan}`
            : keputusan
              ? `Bahan #${keputusan.raw_material_id} · ${keputusan.qty_per_pcs}`
              : 'Pilih bahan';

        return (
          <Popover
            key={jenis.value}
            open={buka === jenis.value}
            onOpenChange={(o) => setBuka(o ? jenis.value : null)}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-muted"
                >
                  <span className="w-24 shrink-0 font-medium">{jenis.label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{ringkas}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              }
            />
            <PopoverContent align="start" className="w-80">
              <p className="text-sm font-semibold">
                {jenis.label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  semua size warna ini
                </span>
              </p>
              <EditKeputusanBom
                compact
                idAkarsa={`${idAkarsa}-${jenis.value}`}
                jenis={jenis.value}
                initial={
                  keputusan ?? {
                    jenis: jenis.value,
                    raw_material_id: null,
                    qty_per_pcs: 0,
                    no_need: false,
                  }
                }
                materials={materials.filter((m) => m.jenis === jenis.value)}
                busy={sedangSimpan}
                onCancel={() => setBuka(null)}
                onSave={(k) => {
                  setLokal((sebelum) => ({ ...sebelum, [k.jenis]: k }));
                  onDecision?.(k, warnaKode);
                  setBuka(null);
                }}
              />
            </PopoverContent>
          </Popover>
        );
      })}
      <p className="pt-1 text-[11px] text-muted-foreground">
        Bahan disimpan bersama variannya saat Simpan ditekan.
      </p>
    </div>
  );
}

/**
 * Satu kotak bahan di dalam kartu warna.
 *
 * Baris pertamanya SELALU nama kategori bahannya ("Label", "Roll", "Renda"),
 * bukan nama material yang barusan dipilih. Sebelumnya nama material itulah
 * yang dipakai sebagai judul, dan akibatnya kategori bahannya hilang begitu
 * ada pilihan: yang terbaca cuma "Label Brand Livou" tanpa keterangan ia
 * menjawab kotak yang mana — padahal justru kategori itulah yang memberi tahu
 * kotak ini soal apa. Nama materialnya turun ke baris kedua, bersama
 * kebutuhannya.
 *
 * Rincian variasi materialnya ikut tampil di sini, bukan hanya di dalam
 * popupnya: yang perlu dilihat untuk memutuskan justru varian mana yang
 * tersedia, dan membukanya satu per satu cuma untuk membacanya membuat
 * membandingkan dua bahan jadi pekerjaan bolak-balik.
 */
function ChipBahan({
  jenis,
  warnaKode,
  bom,
  materials,
  sedangSimpan,
  popoverTerbuka,
  onBuka,
  onTutup,
  onSimpanBom,
}: {
  jenis: { value: string; label: string };
  warnaKode: string;
  bom: BomProdukRegister[];
  materials: MaterialApi[];
  sedangSimpan: boolean;
  /** Popover edit kotak ini sedang terbuka. */
  popoverTerbuka: boolean;
  onBuka: () => void;
  onTutup: () => void;
  onSimpanBom: (keputusan: KeputusanBom) => void;
}) {
  const rows = bom.filter((row) => row.jenis === jenis.value && row.warna_kode === warnaKode);
  const baris = rows[0];
  const inconsistent = rows.some(
    (row) =>
      row.no_need !== baris?.no_need ||
      row.raw_material_id !== baris?.raw_material_id ||
      row.qty_per_pcs !== baris?.qty_per_pcs
  );
  // Varian dibaca dari master material, bukan dari baris BOM: baris BOM
  // menyimpan bahannya, sedangkan varian yang tersedia hidup di master dan
  // bisa berubah tanpa BOM-nya ikut disimpan ulang.
  const material = materials.find((m) => m.id === baris?.raw_material_id) ?? null;
  const keputusan = baris?.no_need
    ? 'Tidak diperlukan'
    : baris
      ? [baris.nama, `${baris.qty_per_pcs} ${baris.satuan ?? ''}`.trim()].filter(Boolean).join(' · ')
      : 'Pilih bahan';

  const awal: KeputusanBom = baris
    ? {
        jenis: jenis.value,
        raw_material_id: baris.no_need ? null : baris.raw_material_id,
        qty_per_pcs: baris.qty_per_pcs,
        no_need: baris.no_need,
      }
    : { jenis: jenis.value, raw_material_id: null, qty_per_pcs: 0, no_need: false };

  return (
    <Popover open={popoverTerbuka} onOpenChange={(buka) => (buka ? onBuka() : onTutup())}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="min-w-[168px] flex-1 rounded-xl border p-4 text-left hover:bg-muted/50 data-[popup-open]:ring-2 data-[popup-open]:ring-primary/40"
          >
            <div className="text-[15px] font-bold">
              {jenis.label}
              {baris?.no_need && !inconsistent ? ' · No need' : ''}
            </div>
            <div
              className={
                'mt-1 text-sm ' + (inconsistent ? 'text-amber-700' : 'text-muted-foreground')
              }
            >
              {inconsistent ? 'Perlu disamakan — keputusan berbeda antar-size' : keputusan}
            </div>
            {material && material.variants.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {material.variants.map((variasi) => (
                  <span
                    key={variasi.id}
                    className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {variasi.nama_varian} ({variasi.stok})
                  </span>
                ))}
              </div>
            )}
          </button>
        }
      />
      {/* Form mengambang menempel di kotaknya sendiri, bukan blok yang
          menggantikan seluruh kartu: warna ini, size-nya, dan kotak bahan
          lainnya tetap terbaca selama satu keputusan disunting. Ini permintaan
          pemilik 20 Okt 2026 — "cukup yang kayak kebuka kecil aja di kartu
          material yg sama... ga perlu kyk halaman baru gini". */}
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-semibold">
          {jenis.label}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            semua size warna ini
          </span>
        </p>
        <EditKeputusanBom
          compact
          jenis={jenis.value}
          initial={awal}
          materials={materials.filter((m) => m.jenis === jenis.value)}
          busy={sedangSimpan}
          onCancel={onTutup}
          onSave={onSimpanBom}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Kartu warna dalam mode edit: dropdown warna dan size editable inline.
 *
 * Diekspor hanya untuk smoke test, alasannya sama dengan `KartuWarna`: di
 * aplikasi ia selalu muncul di dalam dialog, dan `DialogContent` memakai portal
 * yang tidak ikut `renderToStaticMarkup`. Tanpa export ini, slot bahan di kartu
 * varian tidak bisa diperiksa sama sekali tanpa membuka browsernya.
 */
export function KartuWarnaEdit({
  warnaMaster,
  warnaAwal,
  warnaTerpakai = [],
  sedangSimpan = false,
  /** Jenis yang belum punya bahan — dipakai untuk menampilkan baris pilihan bahan. */
  materials = [],
  produk,
  decisions,
  onDecision,
  onBatal,
  onSimpan,
}: {
  warnaMaster: WarnaMaster[];
  /** null = tambah baru; BarisWarna = edit yang sudah ada (pre-filled). */
  warnaAwal: BarisWarna | null;
  warnaTerpakai?: string[];
  sedangSimpan?: boolean;
  materials?: MaterialApi[];
  /**
   * Bahan yang sudah tersimpan untuk produk ini, dipakai untuk menampilkan
   * jawaban yang sudah ada saat kartu edit dibuka.
   */
  produk?: ProdukRegister;
  /**
   * Keputusan bahan untuk warna yang sedang diisi.
   *
   * Disimpan di sini, bukan langsung dikirim ke server, karena pada saat
   * menambah warna barunya belum punya varian sama sekali — dan `product_bom`
   * menggantung pada `variant_id` (ON DELETE CASCADE). Keputusan yang dibuat
   * sebelum variannya lahir harus ditahan dulu, lalu baru bisa dikirim setelah
   * variannya tersimpan. `PanelKanan` yang mengurus pengiriman itu.
   */
  decisions?: Record<string, KeputusanBom>;
  /** Warna yang sedang diisi ikut dikirim: keputusannya menempel pada warna. */
  onDecision?: (keputusan: KeputusanBom, warnaKode: string) => void;
  onBatal: () => void;
  onSimpan: (w: BarisWarna) => Promise<void> | void;
}) {
  const [warna, setWarna] = useState(warnaAwal?.kode ?? '');
  const [sizes, setSizes] = useState<string[]>(
    warnaAwal ? warnaAwal.pcs.map((p) => p.ukuran) : ['S']
  );
  // Index size yang sedang di-edit inline (null = tidak ada)
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [errorSimpan, setErrorSimpan] = useState<string | null>(null);

  async function simpan() {
    const w = warnaMaster.find((x) => x.kode === warna);
    const namaWarna = w?.nama ?? warna;
    const normalizedSizes = sizes.map((size) => size.trim()).filter(Boolean);
    if (!warna || !normalizedSizes.length) {
      setErrorSimpan('Pilih warna dan isi minimal satu size.');
      return;
    }
    if (new Set(normalizedSizes.map((size) => size.toLocaleLowerCase())).size !== normalizedSizes.length) {
      setErrorSimpan('Size tidak boleh berulang.');
      return;
    }
    const hasil: BarisWarna = {
      nama: namaWarna,
      kode: warna,
      pcs: normalizedSizes.map((ukuran) => {
        const existing = warnaAwal?.pcs.find((item) => item.ukuran === ukuran);
        return { ukuran, qty: existing?.qty ?? 0, kode: existing?.kode, variantId: existing?.variantId };
      }),
    };
    setErrorSimpan(null);
    try {
      await onSimpan(hasil);
    } catch (error) {
      setErrorSimpan(error instanceof Error ? error.message : 'Gagal menyimpan perubahan varian.');
    }
  }

  function mulaiEditSize(i: number) {
    setEditIdx(i);
    setEditVal(sizes[i]);
  }

  function selesaiEditSize() {
    if (editIdx !== null) {
      const v = editVal.trim();
      if (v) {
        setSizes(sizes.map((s, j) => (j === editIdx ? v : s)));
      } else {
        // Kosong = hapus size itu
        setSizes(sizes.filter((_, j) => j !== editIdx));
      }
    }
    setEditIdx(null);
    setEditVal('');
  }

  return (
    <div className="rounded-2xl border-2 border-dashed bg-muted/30 p-4">
      <div className="flex gap-4">
        <div className="min-w-[150px] space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Warna
            </label>
            <select
              value={warna}
              onChange={(e) => setWarna(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Pilih warna…</option>
              {warnaMaster
                .filter((w) => !warnaTerpakai.includes(w.kode) || w.kode === warnaAwal?.kode)
                .map((w) => (
                  <option key={w.kode} value={w.kode}>{w.nama}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Size
            </label>
            {/* Size menumpuk ke BAWAH; klik untuk edit inline */}
            <div className="flex flex-col gap-2">
              {sizes.map((s, i) => (
                editIdx === i ? (
                  <input
                    key={i}
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={selesaiEditSize}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') selesaiEditSize();
                      if (e.key === 'Escape') {
                        setEditIdx(null);
                        setEditVal('');
                      }
                    }}
                    className="rounded-md border bg-background px-3 py-1.5 text-center text-sm font-semibold outline-none ring-2 ring-primary"
                  />
                ) : (
                  <button
                    key={i}
                    className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                    onClick={() => mulaiEditSize(i)}
                    title="Klik untuk edit"
                  >
                    {s}
                  </button>
                )
              ))}
            </div>
            <button
              className="mt-2 w-full rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              onClick={() => {
                setSizes([...sizes, '']);
                setEditIdx(sizes.length);
                setEditVal('');
              }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* Bahan untuk warna ini — bisa diisi SEKARANG, tanpa menunggu varian
            disimpan lebih dulu.
            Permintaan pemilik (20 Okt 2026): "saat add new variasi harusnya
            tetap muncul materialnya, jadi ga perlu tunggu di simpan dulu. Jadi
            bisa langsung sekalian pilih material yg diperlukan".

            Keputusannya menempel pada WARNA, jadi isian ini baru berarti setelah
            warna dipilih. Sebelum itu ia mengatakannya, bukan menampilkan
            kotak-kotak kosong yang tidak akan tersimpan ke mana pun. */}
        <div className="min-w-0 flex-1">
          {warna ? (
            <BahanVarian
              warnaKode={warna}
              materials={materials}
              decisions={{
                ...keputusanPerJenis(
                  warna,
                  produk?.bom ?? [],
                  produk?.spesifikasi.warna.find((w) => w.kode === warna)?.pcs.map((p) => p.ukuran) ?? []
                ),
                ...(decisions ?? {}),
              }}
              onDecision={onDecision}
              sedangSimpan={sedangSimpan}
              idAkarsa={`varian-${warnaAwal?.kode ?? 'baru'}`}
            />
          ) : (
            <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Pilih warna dulu — bahannya mengikuti warna.
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={onBatal} title="Batal">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
        <Button onClick={simpan} disabled={!warna || sedangSimpan}>
          {sedangSimpan ? 'Menyimpan…' : 'Simpan varian'}
        </Button>
      </div>
      {errorSimpan && <p role="alert" className="mt-3 text-sm text-destructive">{errorSimpan}</p>}
    </div>
  );
}

/**
 * Editor satu keputusan BOM dari master material.
 *
 * Diekspor hanya supaya smoke test bisa merendernya langsung: di aplikasi ia
 * selalu muncul di dalam `KartuWarna` setelah satu kotak diklik, dan klik itu
 * tidak ada di `renderToStaticMarkup`. Pola yang sama dipakai `buangPenanda`
 * di `FormProdukBaru`.
 */
export function EditKeputusanBom({
  jenis,
  initial,
  materials,
  busy,
  onCancel,
  onSave,
  compact = false,
  idAkarsa,
}: {
  jenis: string;
  initial: KeputusanBom;
  materials: MaterialApi[];
  busy: boolean;
  onCancel: () => void;
  onSave: (decision: KeputusanBom) => void;
  /**
   * Versi rapat untuk popover di dalam kotak bahan.
   *
   * Isinya sama persis — dua isian, centang, dan dua tombol. Yang berbeda cuma
   * bingkai dan susunannya: tanpa bingkai sendiri (popover sudah punya), tanpa
   * judul (judulnya ada di kepala popover), dan isiannya ditumpuk ke bawah
   * karena lebarnya cuma 320px.
   */
  compact?: boolean;
  /**
   * Awalan id isian. Dua editor bisa Terbuka bersamaan — satu di kartu warna,
   * satu di kartu Add — dan id yang sama membuat label salah menunjuk isian.
   * Default ke `jenis` supaya pemanggil lama (dan smoke test) tidak berubah.
   */
  idAkarsa?: string;
}) {
  const idDasar = idAkarsa ?? jenis;
  const [materialId, setMaterialId] = useState(initial.raw_material_id == null ? '' : String(initial.raw_material_id));
  const [quantity, setQuantity] = useState(initial.qty_per_pcs ? String(initial.qty_per_pcs) : '');
  const [noNeed, setNoNeed] = useState(initial.no_need);
  const [error, setError] = useState<string | null>(null);
  const unit = materials.find((material) => String(material.id) === materialId)?.satuan || unitUntuk(jenis);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (noNeed) {
      onSave({ jenis, raw_material_id: null, qty_per_pcs: 0, no_need: true });
      return;
    }
    if (!materialId || !quantity || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      setError('Pilih material dan isi kebutuhan per pcs lebih dari 0, atau pilih No need.');
      return;
    }
    onSave({ jenis, raw_material_id: Number(materialId), qty_per_pcs: Number(quantity), no_need: false });
  }

  return (
    <form
      onSubmit={submit}
      className={
        compact
          ? 'space-y-3'
          : 'rounded-2xl border-2 border-dashed bg-muted/30 p-4'
      }
    >
      {!compact && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h4 className="font-semibold">Edit {JENIS_AKSESORI_BOM.find((option) => option.value === jenis)?.label ?? jenis}</h4>
            <p className="text-sm text-muted-foreground">Keputusan ini berlaku untuk semua size pada warna tersebut.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={busy} aria-label="Batal edit BOM">×</Button>
        </div>
      )}
      <div
        className={
          compact
            ? 'space-y-3'
            : 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)]'
        }
      >
        <div className="space-y-2">
          <label htmlFor={`material-${idDasar}`} className="text-sm font-medium">Material</label>
          <Select value={materialId} onValueChange={(value) => {
            setMaterialId(value ?? '');
            setNoNeed(false);
          }}>
            <SelectTrigger id={`material-${idDasar}`} className="w-full">
              {/* Fungsi child — tanpa ini Base UI mencetak NILAI item apa
                  adanya, yaitu id materialnya: yang muncul di kotak terpilih
                  cuma "1", "2", "3". Id itu memang nilai yang benar, tapi ia
                  tidak berarti apa pun bagi yang membacanya. */}
              <SelectValue placeholder={materials.length ? 'Pilih material' : 'Material belum tersedia'}>
                {(value) => {
                  const material = cariMaterial(materials, value);
                  return material ? labelMaterial(material) : null;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {materials.map((material) => (
                <SelectItem key={material.id} value={String(material.id)}>
                  {labelMaterial(material)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label htmlFor={`qty-${idDasar}`} className="text-sm font-medium">Kebutuhan / pcs</label>
          <div className="flex items-center gap-2">
            <input
              id={`qty-${idDasar}`}
              type="number"
              min="0.000001"
              step="any"
              inputMode="decimal"
              value={quantity}
              disabled={noNeed}
              onChange={(event) => setQuantity(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:bg-muted"
              placeholder="mis. 0.25"
            />
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
        </div>
      </div>
      <label
        className={
          'flex w-fit cursor-pointer items-center gap-2 text-sm ' + (compact ? '' : 'mt-4')
        }
      >
        <input
          type="checkbox"
          checked={noNeed}
          onChange={(event) => {
            setNoNeed(event.target.checked);
            if (event.target.checked) {
              setMaterialId('');
              setQuantity('');
            }
          }}
          className="size-4 accent-primary"
        />
        Tidak diperlukan (No need)
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className={'flex justify-end gap-2 ' + (compact ? '' : 'mt-4')}>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Batal</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan keputusan'}</Button>
      </div>
    </form>
  );
}

export default function DetailProduk({
  produk,
  kartu,
  warnaMaster,
  materials,
  brands,
  onSimpanBom,
  onSimpanVarian,
  onSimpanIdentitas,
  onGantiFoto,
  onTutup,
}: {
  /** Produk yang dibuka. `null` = dialog tertutup. */
  produk: ProdukRegister | null;
  /** Ringkasan stok per warna. Tanpa ini, rinciannya tidak tampil. */
  kartu?: KartuRegister | null;
  warnaMaster: WarnaMaster[];
  materials: MaterialApi[];
  /** Brand yang sudah dipakai produk lain, untuk dropdown Brand di panel kiri. */
  brands: string[];
  onSimpanBom: (productId: number, warnaKode: string, keputusan: KeputusanBom[]) => Promise<void>;
  onSimpanVarian: (productId: number, warnaKode: string, variants: { id?: number; size: string }[], warnaKodeBaru?: string, hapusSemua?: boolean) => Promise<void>;
  onSimpanIdentitas: (productId: number, identity: IdentitasProduk) => Promise<void>;
  onGantiFoto: (productId: number, berkas: File) => Promise<void>;
  onTutup: () => void;
}) {
  return (
    <Dialog
      open={produk !== null}
      onOpenChange={(buka) => {
        if (!buka) onTutup();
      }}
    >
      <DialogContent
        className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none grid-rows-[auto_minmax(0,1fr)]"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        {produk && (
          <>
            <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
              <DialogTitle className="text-lg">{produk.nama}</DialogTitle>
              {/* Tanpa DialogDescription: judulnya sudah menyebut produknya, dan
                  baris "Detail produk — varian & bill of material" itu cuma
                  mengulang apa yang terlihat di layar. Base UI memakai
                  deskripsi untuk aria-describedby; tanpa simpulnya atribut itu
                  tidak dipasang sama sekali, jadi tidak ada rujukan menggantung. */}
            </DialogHeader>

            <div className="min-h-0 overflow-hidden">
              <IsiDetailProduk
                produk={produk}
                kartu={kartu}
                warnaMaster={warnaMaster}
                materials={materials}
                brands={brands}
                onSimpanBom={(warnaKode, keputusan) => onSimpanBom(Number(produk.id), warnaKode, keputusan)}
                onSimpanVarian={onSimpanVarian}
                onSimpanIdentitas={onSimpanIdentitas}
                onGantiFoto={onGantiFoto}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Satu pasang label-nilai di daftar identitas. */
function Field({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{nilai}</dd>
    </div>
  );
}

/**
 * Satu baris identitas yang isinya disunting langsung.
 *
 * Bentuknya sengaja sama dengan `Field` di atasnya — label kecil di kiri,
 * nilai di kanan — supaya baris yang bisa disunting dan yang tidak tetap
 * terbaca sebagai satu daftar, bukan dua kelompok yang berbeda.
 *
 * `<dt>`/`<dd>` dipertahankan karena barisnya masih berada di dalam `<dl>`:
 * daftar definisi yang isinya berhenti jadi pasangan istilah-nilai akan
 * kehilangan hubungan labelnya untuk pembaca layar, dan `aria-label` di
 * isiannya tidak menggantikan hubungan itu.
 */
function BarisIsian({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="w-full max-w-[13rem]">{children}</dd>
    </div>
  );
}
