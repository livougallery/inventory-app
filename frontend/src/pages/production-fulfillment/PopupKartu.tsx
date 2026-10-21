import { useRef, useState } from 'react';
import { ExternalLink, FileText, Paperclip, Plus, X } from 'lucide-react';
import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BadgeStatus } from './KartuFulfillment';
import type {
  BarisBahan,
  BarisPenerimaan,
  BerkasBukti,
  BuktiCutting,
  BuktiReceive,
  BuktiTahapAkhir,
  CatatanKembalikan,
  CuttingPcs,
  DataTahapAkhir,
  KartuPdff,
  Kedatangan,
  KedatanganKartu,
  KembalikanCutting,
  RingkasanBahan,
  RingkasanCutting,
  RingkasanTerima,
  SiapBahan,
  StagePapan,
} from './data-kanban';
import {
  JENIS_BUKTI_CUTTING,
  JENIS_BUKTI_INVOICE_LOGISTIC,
  JENIS_BUKTI_RECEIVE,
  JENIS_BUKTI_UPLOAD,
  barisPenerimaan,
  barisVarian,
  bahanKartu,
  jenisBuktiTahap,
  jumlahVarian,
  masukStokKedatangan,
  ringkasBahan,
  ringkasCutting,
  ringkasTahapBukti,
  ringkasTerima,
  skuVarian,
  totalPcs,
} from './data-kanban';
import { FLOW_TRANSAKSI, LOKASI_TERIMA, SOLUSI, SUMBER_TERIMA, labelDari } from '@/lib/opsi';
import { cn } from '@/lib/utils';
import type { BarisShipmentRingkas, SumberPapan } from './hpp';
import { labelStageAsal, temuanKartu, type BarisTerima } from './temuan';

// ===== Popup detail kartu =====
//
// Isi popup BERGANTUNG STAGE-nya — satu stage, satu daftar pekerjaan. Kartu di
// Propose berisi peninjauan usulan, kartu di Prepare berisi kesiapan bahan.
// Stage yang alurnya belum dibahas dengan pemilik sengaja dikosongkan dengan
// keterangan, bukan diisi tampilan Propose: popup yang isinya sama untuk
// delapan stage membuat pemilik mengira kedelapannya memang sama, dan
// pertanyaan "stage ini harus ngapain" tidak pernah muncul saat presentasi.
//
// Yang tetap sama di semua stage cuma dua blok identitas — informasi produk dan
// rencana warna/ukuran. Tanpa keduanya, popup di stage mana pun tidak bisa
// diketahui milik pekerjaan yang mana.

/**
 * Seksi HPP & Price, ditulis di sini sebagai signature saja.
 *
 * Dipakai `import type` dari `hpp.ts` saja, TIDAK dari `SeksiHppPrice.tsx`:
 * berkas-component itu mengimpor `KotakBukti` dari sini, jadi mengimbalangi
 * di sini membuat modul saling membutuhkan dan urutannya tidak bisa ditentukan.
 * Yang dideklarasikan di bawah ini adalah PARAMETER yang dibutuhkan stage ini —
 * data dan aksi — bukan komponennya. `PapanFulfillment` yang mengikat keduanya,
 * karena hanya berkas itu yang sudah memegang `SeksiHppPrice`.
 *
 * Semua prop di sini opsional kecuali `kartu`: pemanggil yang belum punya
 * render function tetap boleh merender stage lain tanpa-error.
 */
export type RenderSeksiHpp = (props: {
  kartu: KartuPdff;
  sumber: SumberPapan;
  /** Sudah berupa isi satu kartu, bukan peta seluruh kartu. */
  bukti: Record<string, BerkasBukti[]>;
  terkunci: boolean;
  tujuan?: StagePapan;
  aksi?: AksiStage;
}) => React.ReactNode;

export interface AksiStage {
  /** Pindahkan kartu dari Propose ke Prepare. */
  approve: (kartu: KartuPdff) => void;
  /** Tandai satu baris bahan sudah dibeli (tahap Prepare). */
  tandaiBahan: (kartu: KartuPdff, kunci: string, siap: boolean) => void;
  /** Pindahkan kartu dari Prepare ke kolom berikutnya di papan ini. */
  lanjutStage: (kartu: KartuPdff) => void;
  /** Kunci baris bahan yang sudah ditandai siap untuk kartu ini. */
  siapKartu: (kartu: KartuPdff) => string[];
  /** Isi pcs cutting satu varian (tahap Cutting). */
  isiCutting: (kartu: KartuPdff, kunci: string, pcs: number) => void;
  /**
   * Tambah satu berkas bukti cutting (tahap Cutting).
   *
   * Menerima `File`, bukan object yang sudah diurai: pembuatan object URL harus
   * terjadi di satu tempat saja, di dalam `setState`, supaya URL-nya ikut
   * tercatat di state dan bisa di-revoke saat berkasnya dihapus.
   */
  tambahBukti: (kartu: KartuPdff, jenis: string, berkas: File) => void;
  /** Buang satu berkas bukti cutting. */
  hapusBukti: (kartu: KartuPdff, jenis: string, nama: string) => void;
  /**
   * Tambah satu berkas bukti kalkulasi HPP (tahap HPP & Price).
   *
   * Terpisah dari `tambahBukti` dengan sengaja. Keduanya menulis ke state yang
   * berbeda: `tambahBukti` mengisi `buktiCutting`, yang dibaca `ringkasCutting`
   * sebagai syarat keluar dari stage Cutting. Kalau keduanya berbagi satu
   * handler, bukti kalkulasi HPP akan ikut menumpuk di store yang sama, dan
   * kartu Cutting bisa mendapat berkas yang bukan miliknya. Id-nya memang
   * berbeda — `ringkasCutting` tidak akan menghitungnya — tapi "tidak salah
   * hitung" bukan alasan yang cukup untuk menggabungkan dua store yang punya
   * syarat dan masa hidup berbeda.
   */
  tambahBuktiHpp: (kartu: KartuPdff, jenis: string, berkas: File) => void;
  /** Buang satu berkas bukti kalkulasi HPP. */
  hapusBuktiHpp: (kartu: KartuPdff, jenis: string, nama: string) => void;
  /**
   * Kembalikan kartu yang datanya sudah terkunci ke stage Cutting (Q11).
   *
   * `alasan` wajib: jejak yang dicatat setiap kali data dibuka kembali adalah
   * waktu, alasan, dan total pcs saat itu — tanpa alasan, jejaknya cuma
   * mencatat bahwa ada perubahan tanpa menjelaskan kenapa.
   */
  kembalikanCutting: (kartu: KartuPdff, alasan: string) => void;
  /**
   * Ubah satu kolom data tahap akhir (Invoice Logistic / Invoice Product /
   * Upload).
   *
   * Satu handler untuk semua kolom ketiga tahap itu, bukan tiga handler
   * terpisah: yang berbeda cuma nama kolomnya, dan tiga handler berarti tiga
   * tempat yang bisa lupa memakai bentuk penulisan yang sama. Yang menjaga
   * kolom mana yang boleh diubah adalah `terkunci` di layar, bukan jumlah
   * handler.
   *
   * `nilai` sengaja bertipe `string | number | undefined` — `undefined` berarti
   * kolomnya DIKOSONGKAN, bukan diabaikan. Tanpa itu, kotak angka yang dihapus
   * isinya tidak bisa kembali kosong.
   */
  ubahTahap: (kartu: KartuPdff, kolom: keyof DataTahapAkhir, nilai: string | number | undefined) => void;
  /**
   * Tambah satu berkas bukti salah satu dari tiga tahap akhir.
   *
   * Store-nya terpisah dari `tambahBukti` (Cutting) dan `tambahBuktiHpp`, dan
   * alasannya sama dengan yang di HPP: id jenisnya berbeda-beda per tahap, dan
   * kalau semuanya menumpuk di satu store, berkas Invoice Logistic akan
   * terhitung sebagai bukti Upload — tanpa error apa pun.
   */
  tambahBuktiTahap: (kartu: KartuPdff, jenis: string, berkas: File) => void;
  /** Buang satu berkas bukti tahap akhir. */
  hapusBuktiTahap: (kartu: KartuPdff, jenis: string, nama: string) => void;
  /**
   * Tambah satu berkas bukti penerimaan (stage Receive).
   *
   * Store KEEMPAT, terpisah dari tiga yang di atas. Alasannya bukan kerapian:
   * `SeksiFinanceValidate` menggabungkan bukti Cutting + HPP + tiga tahap akhir
   * jadi satu peta untuk menghitung temuan, dan bukti penerimaan yang ikut ke
   * sana akan muncul sebagai "bukti" di tahap yang tidak pernah
   * mengunggahnya — tanpa satu pun pemeriksaan yang gagal.
   */
  tambahBuktiReceive: (kartu: KartuPdff, jenis: string, berkas: File) => void;
  /** Buang satu berkas bukti penerimaan. */
  hapusBuktiReceive: (kartu: KartuPdff, jenis: string, nama: string) => void;
  /**
   * Simpan satu kedatangan barang (stage Receive) — draft atau penerimaan.
   *
   * Yang dikirim adalah SATU baris kedatangan utuh, bukan angka yang tersebar:
   * tanggal, lokasi, sumber, pcs per varian, dan statusnya memang satu
   * peristiwa, dan memecahnya jadi lima handler berarti lima tempat yang bisa
   * lupa salah satunya.
   *
   * `status` menentukan apakah kedatangan ini ikut dihitung sebagai barang
   * masuk. Draft tidak — lihat catatan di `data-kanban.ts`.
   */
  simpanKedatangan: (kartu: KartuPdff, data: Kedatangan) => void;
  /** Buang satu kedatangan — draft yang batal, atau catatan yang salah entri. */
  hapusKedatangan: (kartu: KartuPdff, urut: number) => void;
  /**
   * Tutup satu temuan di Finance Validate.
   *
   * Yang disimpan adalah ID temuan, bukan objeknya. Temuannya DIHITUNG dari
   * data (lihat `temuan.ts`), jadi menyimpan salinannya berarti menyimpan
   * temuan yang bisa basi — dan temuan basi yang masih tersimpan akan terus
   * menahan kartu tanpa alasan yang bisa dilihat di layar.
   *
   * Menutup temuan BUKAN memperbaiki datanya: temuan yang masih berlaku tetap
   * muncul sebagai temuan, dan kalau id-nya sudah ditutup ia tampil berstatus
   * `tertutup` — riwayatnya terlihat, bukan hilang.
   */
  tutupTemuan: (kartu: KartuPdff, id: string) => void;
}

function Sel({ label, nilai }: { label: string; nilai?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{nilai || '—'}</div>
    </div>
  );
}

/**
 * Penanda "belum memilih" untuk `Select` di tahap akhir.
 *
 * Base UI memakai `null` untuk keadaan tidak terkendali, jadi nilai kosong
 * tidak bisa dioper apa adanya — ia akan terbaca sebagai "tak terkendali", dan
 * pilihan yang sudah tersimpan tidak muncul kembali di triggernya. Sentinel ini
 * yang berdiri di tempat "belum dipilih", dan pemetaannya kembali ke `undefined`
 * dilakukan di pemanggilnya. Pola yang sama sudah dipakai `CreatableSelect`.
 */
const NONE_TAHAP = 'none';

function JudulSeksi({ judul, keterangan }: { judul: string; keterangan: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{judul}</h3>
      <p className="text-xs text-muted-foreground">{keterangan}</p>
    </div>
  );
}

/**
 * Sebutan asal usul kartu, dipakai di bawah judul popup.
 *
 * Dipisah dan diekspor karena tempatnya tidak bisa diperiksa dari test: ia
 * hidup di `DialogHeader`, dan `DialogContent` memakai portal yang tidak
 * ikut ter-render di server — lihat catatan `IsiPopup`. Kalau teksnya ditulis
 * langsung di situ, satu-satunya cara memeriksanya adalah membuka popup di
 * browser dan membacanya sendiri, satu papan demi satu papan.
 *
 * Versi sebelumnya menulis "Production proposal" tanpa syarat, jadi kartu
 * White Label menampilkan "Production proposal • PDFF_..._WHLB" — label papan
 * yang salah di atas workcode yang benar, di popup yang paling banyak dibaca
 * saat presentasi.
 */
export function labelSumber(sumber: 'production' | 'whitelabel'): string {
  return sumber === 'whitelabel' ? 'White Label proposal' : 'Production proposal';
}

export default function PopupKartu({
  kartu,
  stage,
  stageBerikutnya,
  adaPrepare = true,
  sumber,
  siapBahan,
  cuttingPcs,
  buktiHpp,
  buktiTahap,
  buktiReceive,
  kedatangan,
  renderHpp,
  buktiCutting,
  kembalikan,
  disetujuiCutting,
  sudahLewat,
  temuanTertutup = {},
  terima = [],
  barisHpp = [],
  aksi,
  onTutup,
}: {
  kartu: KartuPdff | null;
  stage: StagePapan | undefined;
  /** Stage setelah yang sekarang — menentukan label tombol lanjut di Prepare. */
  stageBerikutnya: StagePapan | undefined;
  /** Papan ini punya kolom Prepare? Papan White Label tidak punya. */
  adaPrepare?: boolean;
  /**
   * Papan tempat kartu ini dibuka. Dipakai untuk menyebut asal usulnya di
   * bawah judul: kartu White Label yang popupnya berbunyi "Production
   * proposal" membuat pemilik mengira ia sedang melihat usulan produksi biasa
   * — dan popup inilah yang paling banyak dibaca saat presentasi.
   */
  sumber: 'production' | 'whitelabel';
  siapBahan: SiapBahan;
  cuttingPcs: CuttingPcs;
  buktiCutting: BuktiCutting;
  /**
   * Bukti kalkulasi HPP, seluruh kartu.
   *
   * Bentuknya sama persis dengan `BuktiCutting`, dan sengaja ditulis memakai
   * tipe itu dan bukan `BuktiHppPrice` dari `SeksiHppPrice.tsx` — berkas ini
   * tidak boleh mengimpor apa pun dari sana. Yang harus terpisah adalah STATE-nya
   * (`buktiHpp` vs `buktiCutting`), bukan tipe datanya; memisahkan keduanya
   * hanya menghasilkan dua kamus yang harus dijaga tetap sama.
   */
  buktiHpp: BuktiCutting;
  /**
   * Bukti tiga tahap akhir (Invoice Logistic / Invoice Product / Upload),
   * seluruh kartu.
   *
   * Satu store untuk ketiganya, karena id jenis buktinya sudah berbeda per
   * tahap — lihat `JENIS_BUKTI_INVOICE_LOGISTIC` dkk. di `data-kanban.ts`.
   * Yang harus terpisah dari `buktiCutting` dan `buktiHpp` adalah STATE-nya:
   * `ringkasCutting` membaca `buktiCutting` sebagai syarat keluar dari Cutting,
   * jadi berkas dari tahap ini tidak boleh ikut ke sana.
   */
  buktiTahap: BuktiTahapAkhir;
  /**
   * Bukti penerimaan (stage Receive), seluruh kartu.
   *
   * Store keempat, terpisah dari `buktiTahap` — id jenisnya beda
   * (`bukti-terima`, `surat-jalan`), dan `SeksiFinanceValidate` menggabungkan
   * tiga store lain jadi satu peta untuk menghitung temuan. Bergabung di situ
   * membuat foto barang datang terlihat seperti bukti Invoice Logistic.
   */
  buktiReceive: BuktiReceive;
  /** Kedatangan barang per kartu — seluruh kartu, bukan satu kartu. */
  kedatangan: KedatanganKartu;
  /**
   * Seksi HPP & Price, diberikan dari luar sebagai fungsi render.
   *
   * Bukan import langsung ke `SeksiHppPrice`, dan itu bukan kerapian: berkas itu
   * mengimpor `KotakBukti` dari `PopupKartu`, jadi mengimbalangnya di sini
   * membentuk lingkaran modul yang tidak bisa diurai. Fungsi render membalik
   * arahnya — `PapanFulfillment` yang memegang keduanya, dan `PopupKartu` hanya
   * menyatakan apa yang dia butuhkan.
   */
  renderHpp: RenderSeksiHpp;
  /** Riwayat pengembalian per kartu, untuk dibaca `IsiPopup`. */
  kembalikan: KembalikanCutting;
  /** Kartu yang sudah pernah disetujui Cutting — sumber penentu terkunci. */
  disetujuiCutting: Record<string, boolean>;
  /** Stage yang sudah dilewati per kartu — penentu terkunci tiga tahap akhir. */
  sudahLewat: Record<string, string[]>;
  /** Id temuan Finance Validate yang sudah ditutup, per kartu. */
  temuanTertutup?: Record<string, string[]>;
  /** Baris penerimaan per varian — sumber temuan "barang belum lengkap datang". */
  terima?: BarisTerima[];
  /** Baris shipment HPP — sumber penjaga "HPP di bawah biaya beli". */
  barisHpp?: readonly BarisShipmentRingkas[];
  aksi: AksiStage;
  onTutup: () => void;
}) {
  if (!kartu) return null;

  return (
    <Dialog open onOpenChange={(buka) => !buka && onTutup()}>
      <DialogContent className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none">
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-base">
            {stage ? `${stage.label} Fulfillment` : 'Production Fulfillment'}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {labelSumber(sumber)} • {kartu.workcode}
          </DialogDescription>
        </DialogHeader>
        <IsiPopup
          kartu={kartu}
          stage={stage}
          stageBerikutnya={stageBerikutnya}
          adaPrepare={adaPrepare}
          siapBahan={siapBahan}
          cuttingPcs={cuttingPcs}
          buktiCutting={buktiCutting}
          buktiHpp={buktiHpp}
          buktiTahap={buktiTahap}
          buktiReceive={buktiReceive}
          kedatangan={kedatangan}
          // WAJIB diteruskan, dan pernah lupa di sini: `IsiPopup` punya
          // default `sumber = 'production'`, jadi papan White Label yang lupa
          // mengoper prop ini TIDAK error — ia diam-diam memakai aturan
          // Production. Akibatnya kartu WL dituntut bukti Cutting dan ongkos
          // jahit yang tidak pernah dilaluinya. Tidak satu pun pemeriksaan SSR
          // bisa melihat ini: smoke test merender `IsiPopup` LANGSUNG, jadi
          // prop-nya selalu dioper; yang drop cuma jalur pembungkus Dialog.
          // Ketahuan dari verifikasi browser tiket 3, bukan dari unit test.
          sumber={sumber}
          renderHpp={renderHpp}
          kembalikan={kembalikan}
          sudahLewat={sudahLewat[kartu.id] ?? []}
          sudahDisetujui={disetujuiCutting[kartu.id] === true}
          temuanTertutup={temuanTertutup[kartu.id] ?? []}
          terima={terima}
          barisHpp={barisHpp}
          aksi={aksi}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Isi popup, dipisah dari pembungkus `Dialog`.
 *
 * Bukan sekadar kerapian: `DialogContent` memakai portal, dan portal tidak
 * ikut ter-render di server. Dengan isi dipisah begini, bagian yang paling
 * banyak angkanya — tabel rencana warna/ukuran dan tabel BOM — bisa dirender
 * dan diperiksa tanpa browser, untuk TIAP stage. Kalau menyatu, satu-satunya
 * cara memeriksa adalah membukanya manual, satu kartu demi satu kartu.
 */
export function IsiPopup({
  kartu,
  stage,
  stageBerikutnya,
  adaPrepare = true,
  sumber = 'production',
  siapBahan = {},
  cuttingPcs = {},
  buktiCutting = {},
  buktiHpp = {},
  buktiTahap = {},
  buktiReceive = {},
  kedatangan = {},
  renderHpp,
  kembalikan = {},
  sudahLewat = [],
  sudahDisetujui = false,
  temuanTertutup = [],
  terima = [],
  barisHpp = [],
  aksi,
}: {
  kartu: KartuPdff;
  stage?: StagePapan;
  stageBerikutnya?: StagePapan;
  /**
   * Papan tempat popup ini dibuka. forwarded ke seksi HPP & Price sebagai
   * penentu mode — lihat `SeksiHppPrice.tsx`, mode tidak dibaca dari workcode
   * karena workcode pernah salah tanpa error apa pun.
   */
  sumber?: SumberPapan;
  /**
   * Apakah papan ini punya kolom Prepare. Papan White Label tidak punya, jadi
   * teks yang menjanjikan pemeriksaan bahan di Prepare harus hilang di sana —
   * bukan dibiarkan, karena popuplah yang dibaca pemilik saat presentasi.
   */
  adaPrepare?: boolean;
  siapBahan?: SiapBahan;
  cuttingPcs?: CuttingPcs;
  buktiCutting?: BuktiCutting;
  /** Bukti kalkulasi HPP kartu ini saja — sudah diambil `buktiHpp[kartu.id]`. */
  buktiHpp?: BuktiCutting;
  /** Bukti penerimaan, SELURUH kartu — `IsiPopup` yang mengambil milik kartu ini. */
  buktiReceive?: BuktiReceive;
  /**
   * Kedatangan barang, SELURUH kartu.
   *
   * Sama seperti `buktiTahap`: yang dioper pemanggil adalah peta lengkap, dan
   * pengambilan `kedatangan[kartu.id]` terjadi di SATU tempat di sini. Kalau
   * tiap pemanggil mengambil sendiri, ada dua tempat yang bisa lupa — dan
   * popup akan menampilkan riwayat milik kartu lain tanpa ada yang gagal.
   */
  kedatangan?: KedatanganKartu;
  /**
   * Bukti tiga tahap akhir, SELURUH kartu — bukan satu kartu.
   *
   * Sama seperti `buktiHpp` di atas: yang dioper pemanggil adalah peta lengkap,
   * dan `IsiPopup` sendiri yang mengambil `buktiTahap[kartu.id]` sebelum
   * meneruskannya ke seksinya. Itu yang membuat "bukti kartu ini" tidak bisa
   * tertukar dengan "bukti kartu lain" — pengambilannya terjadi di satu tempat.
   */
  buktiTahap?: BuktiTahapAkhir;
  /** Fungsi render dari `PapanFulfillment`; lihat catatan lingkaran modul. */
  renderHpp?: RenderSeksiHpp;
  /** Riwayat pengembalian kartu ini, untuk ditampilkan di stage Cutting. */
  kembalikan?: KembalikanCutting;
  /**
   * Stage yang sudah DILEWATI kartu ini, diurutkan dari yang paling awal.
   *
   * Dipakai aturan owner "terkunci total": begitu kartu pindah stage, isinya
   * tidak bisa diubah lagi — termasuk buktinya, tanpa pengecualian.
   *
   * Diberikan dari luar, BUKAN diturunkan dari `stage`. Alasannya sama persis
   * dengan `sudahDisetujui` di bawah, dan sudah pernah menyakitkan: kartu
   * contoh bawaan `data-kanban.ts` sudah duduk di 'upload' dan 'invoice-product'
   * tanpa pernah melewati apa pun. Kalau terkuncinya diturunkan dari stage,
   * kartu yang justru sedang didemokan ikut membeku — dan di sini lebih parah,
   * karena tiga tahap ini memang tidak punya tombol pembuka sama sekali.
   *
   * CATATAN JUJUR SOAL JANGKAUANNYA: hari ini penjaga yang benar-benar bekerja
   * adalah ROUTING, bukan prop ini. Seksi tiap tahap hanya dirender saat kartu
   * ADA di tahap itu (`bisaInvoiceLogistic` dst.), jadi begitu kartunya pindah,
   * seluruh isiannya ikut hilang dari layar — bentuk terkunci yang paling
   * kuat, karena tidak ada yang bisa diklik sama sekali. Prop ini adalah
   * penjaga KEDUA, dan ia baru akan terpakai begitu ada layar yang menampilkan
   * satu tahap sambil kartunya sudah lewat (mis. tab per tahap di
   * `.scratch/production-fulfillment-tahap/issues/01-view-per-stage.md`).
   * Menulisnya sekarang bukan berarti ia sudah diuji: yang diuji adalah
   * routing-nya.
   */
  sudahLewat?: string[];
  /**
   * Apakah data Cutting kartu ini sudah dikunci karena pernah disetujui (Q11).
   *
   * Diberikan dari luar, BUKAN diturunkan dari `stage`. Kartu contoh bawaan
   * `data-kanban.ts` sudah `stage: 'receive'` tanpa pernah ada approve Cutting
   * untuk mereka — menjadikannya terkunci akan membekukan data yang justru
   * sedang didemokan, dan tidak ada tombol untuk membukanya lagi.
   */
  sudahDisetujui?: boolean;
  /**
   * Id temuan yang sudah ditutup untuk kartu ini.
   *
   * Diberikan dari luar, BUKAN disimpan di dalam popup — sama seperti
   * `sudahDisetujui` di atas. Yang perlu bertahan saat popup ditutup dan
   * dibuka lagi adalah keputusan orangnya, dan itu hidup di papan.
   */
  temuanTertutup?: string[];
  /**
   * Baris penerimaan per varian, untuk temuan "barang belum lengkap datang".
   *
   * Kosong = belum ada datanya, bukan "semuanya lengkap" — dan itu memang
   * keadaan hari ini: stage Receive belum punya model data. Lihat catatan
   * jangkauan di `temuan.ts`.
   */
  terima?: BarisTerima[];
  /**
   * Baris shipment HPP White Label, untuk penjaga "HPP di bawah biaya beli".
   *
   * Dioper terpisah dari `renderHpp` karena temuan dihitung di sini, sedangkan
   * tabel HPP dirender oleh pemanggil. Dua-duanya butuh baris yang sama.
   */
  barisHpp?: readonly BarisShipmentRingkas[];
  aksi?: AksiStage;
}) {
  const pcs = totalPcs(kartu);
  const varian = jumlahVarian(kartu);
  const ringkas = ringkasBahan(kartu, siapBahan);
  const ringkasCut = ringkasCutting(kartu, cuttingPcs, buktiCutting);

  const stageId = stage?.id;
  const bisaApprove = stageId === 'propose';
  const bisaPrepare = stageId === 'prepare';
  const bisaCutting = stageId === 'cutting';
  const bisaReceive = stageId === 'receive';
  const bisaHpp = stageId === 'hpp-price';
  const bisaInvoiceLogistic = stageId === 'invoice-logistic';
  const bisaInvoiceProduct = stageId === 'invoice-product';
  const bisaUpload = stageId === 'upload';
  const bisaFinanceValidate = stageId === 'finance-validate';

  // `KotakBukti` membaca `aksi.tambahBukti` / `aksi.hapusBukti`. `AksiStage`
  // punya sepasang handler itu, tapi keduanya menunjuk store Cutting — kalau
  // diteruskan apa adanya, bukti kalkulasi HPP akan tersimpan di store yang
  // dibaca `ringkasCutting` sebagai syarat keluar dari Cutting. Shim ini
  // meneruskan `lanjutStage` apa adanya dan menukar sisanya ke store HPP.
  const aksiHpp: AksiStage | undefined = aksi && {
    ...aksi,
    tambahBukti: aksi.tambahBuktiHpp,
    hapusBukti: aksi.hapusBuktiHpp,
  };

  // Shim yang sama untuk tiga tahap akhir. Ketiganya berbagi SATU store
  // (`buktiTahap`), karena id jenis buktinya sudah berbeda per tahap — jadi
  // tidak ada risiko satu berkas terhitung dua kali, dan tiga store terpisah
  // hanya menambah tiga jalur yang harus dijaga bentuknya sama.
  const aksiTahap: AksiStage | undefined = aksi && {
    ...aksi,
    tambahBukti: aksi.tambahBuktiTahap,
    hapusBukti: aksi.hapusBuktiTahap,
  };

  // Shim ketiga untuk stage Receive. Store buktinya sendiri lagi, dan
  // `lanjutStage` tetap diteruskan apa adanya — yang menentukan ke mana kartu
  // pindah adalah urutan kolom papan, bukan stage yang sedang dirender.
  const aksiReceive: AksiStage | undefined = aksi && {
    ...aksi,
    tambahBukti: aksi.tambahBuktiReceive,
    hapusBukti: aksi.hapusBuktiReceive,
  };

  // Terkunci HANYA di stage Cutting, dan hanya kalau pernah disetujui. Di
  // stage lain input pcs memang tidak tampil sebagai input, jadi mengunci
  // semuanya tidak akan terlihat.
  const terkunci = bisaCutting && sudahDisetujui;

  /**
   * Apakah kartu sudah melewati salah satu dari tiga tahap akhir.
   *
   * Aturan owner untuk ketiganya "terkunci total, tanpa pengecualian": begitu
   * kartu pindah, isinya tidak bisa diubah — dan BEDA dengan Cutting, di sini
   * tidak ada tombol pembuka sama sekali. Karena itu yang diperiksa bukan
   * `stage` kartu sekarang, melainkan daftar stage yang benar-benar sudah
   * dilewatinya: kartu yang pindah dari Invoice Logistic ke Receive membawa
   * 'invoice-logistic' di daftar itu selamanya.
   */
  const tahapLewat = (id: string) => sudahLewat.includes(id);

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
      <SeksiIdentitas kartu={kartu} />
      <SeksiWarnaUkuran
        kartu={kartu}
        pcs={pcs}
        varian={varian}
        adaTabelBahan={bisaApprove || bisaPrepare}
        modeCutting={bisaCutting}
        cuttingPcs={cuttingPcs[kartu.id] ?? {}}
        terkunci={terkunci}
        aksi={aksi}
      />

      {bisaApprove && (
        <SeksiPropose kartu={kartu} tujuan={stageBerikutnya} adaPrepare={adaPrepare} aksi={aksi} />
      )}
      {bisaPrepare && (
        <SeksiPrepare
          kartu={kartu}
          pcs={pcs}
          ringkas={ringkas}
          tujuan={stageBerikutnya}
          aksi={aksi}
        />
      )}
      {bisaCutting && (
        <SeksiCutting
          kartu={kartu}
          ringkas={ringkasCut}
          tujuan={stageBerikutnya}
          bukti={buktiCutting[kartu.id] ?? {}}
          terkunci={terkunci}
          aksi={aksi}
        />
      )}

      {/* Panel pengembalian TIDAK boleh ikut di dalam SeksiCutting, dan itu bukan
          sekadar kerapian. Kartu yang datanya terkunci ada di stage SESUDAH
          Cutting — Receive — karena mengunci justru yang memindahkannya ke
          sana. Ditaruh di dalam SeksiCutting, panel ini tidak akan pernah
          terlihat sama sekali: bagian itu hanya dirender pada stage 'cutting',
          sedangkan tepat ketika orang perlu membukanya, kartunya sudah tidak
          lagi di sana. Dan tidak ada jalan lain untuknya, karena
          `SeksiBelumAda` menutup stage yang belum punya alur.

          Karena itu ia dirender sendiri, dari approve — di stage manapun.

          Panel ini juga tetap muncul setelah pengembalian, meski datanya
          sudah bisa diedit lagi: justru di situlah jejaknya paling berguna,
          karena sekarang angka yang sedang disunting bisa dibandingkan
          langsung dengan angka yang tercatat. Kalau panelnya ikut hilang
          bersama kuncinya, jejaknya hanya muncul justru di saat tidak ada
          yang perlu membacanya. */}
      {(sudahDisetujui || (kembalikan[kartu.id]?.length ?? 0) > 0) && (
        <PanelKembalikan
          kartu={kartu}
          ringkas={ringkasCut}
          kembalikan={kembalikan[kartu.id] ?? []}
          aksi={aksi}
        />
      )}

      {bisaReceive && (
        <SeksiReceive
          kartu={kartu}
          sumber={sumber}
          ringkas={ringkasTerima(kartu, kedatangan[kartu.id] ?? [])}
          kedatangan={kedatangan[kartu.id] ?? []}
          bukti={buktiReceive[kartu.id] ?? {}}
          tujuan={stageBerikutnya}
          tahap={kartu.tahapAkhir ?? {}}
          aksi={aksiReceive}
        />
      )}

      {bisaHpp &&
        renderHpp?.({
          kartu,
          sumber,
          bukti: buktiHpp[kartu.id] ?? {},
          terkunci: sudahDisetujui,
          tujuan: stageBerikutnya,
          aksi: aksiHpp,
        })}

      {/* Tiga cabang tiket 5. Ditambahkan, bukan menggantikan cabang di atas —
          stage yang sudah punya alur tidak boleh berubah isinya karena ada
          stage baru yang menyusul. */}
      {bisaInvoiceLogistic && (
        <SeksiInvoiceLogistic
          kartu={kartu}
          bukti={buktiTahap[kartu.id] ?? {}}
          terkunci={tahapLewat('invoice-logistic')}
          tujuan={stageBerikutnya}
          aksi={aksiTahap}
        />
      )}
      {bisaInvoiceProduct && (
        <SeksiInvoiceProduct
          kartu={kartu}
          bukti={buktiTahap[kartu.id] ?? {}}
          terkunci={tahapLewat('invoice-product')}
          tujuan={stageBerikutnya}
          aksi={aksiTahap}
        />
      )}
      {bisaUpload && (
        <SeksiUpload
          kartu={kartu}
          bukti={buktiTahap[kartu.id] ?? {}}
          terkunci={tahapLewat('upload')}
          tujuan={stageBerikutnya}
          aksi={aksiTahap}
        />
      )}
      {bisaFinanceValidate && (
        <SeksiFinanceValidate
          kartu={kartu}
          sumber={sumber}
          // Tiga store bukti digabung di sini, sekali. Yang menjaga tidak ada
          // berkas terhitung dua kali adalah id jenisnya yang sudah berbeda
          // antar tahap — bukan pemisahan store di layar ini.
          bukti={{
            ...(buktiCutting[kartu.id] ?? {}),
            ...(buktiHpp[kartu.id] ?? {}),
            ...(buktiTahap[kartu.id] ?? {}),
          }}
          tertutup={temuanTertutup}
          terima={terima}
          barisHpp={barisHpp}
          tujuan={stageBerikutnya}
          aksi={aksi}
        />
      )}

      {!bisaApprove &&
        !bisaPrepare &&
        !bisaCutting &&
        !bisaReceive &&
        !bisaInvoiceLogistic &&
        !bisaInvoiceProduct &&
        !bisaUpload &&
        !bisaFinanceValidate &&
        (!bisaHpp || !renderHpp) && <SeksiBelumAda stage={stage} />}
    </div>
  );
}

// `hpp-price` sengaja TIDAK dikecualikan dari `SeksiBelumAda` seperti tiga
// stage lain di atas. Bedanya: kalau `renderHpp` lupa dioper, seksi ini akan
// kosong total — dan popup kosong tidak pernah dilaporkan sebagai bug, karena
// yang terlihat cuma "kok tabelnya tidak ada?". `SeksiBelumAda` di sini
// menyatakan hal itu di layar: stage ini sudah punya alur, tapi pemanggilnya
// belum menyambungkannya.

// ===== Blok identitas (sama di semua stage) =====

function SeksiIdentitas({ kartu }: { kartu: KartuPdff }) {
  const { detail } = kartu;
  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Product & Proposal Information"
        keterangan="Informasi dasar produksi yang dipakai untuk membuat workcode dan rencana bahan."
      />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Sel label="Product" nilai={kartu.productName} />
        <Sel label="Workcode PDFF" nilai={kartu.workcode} />
        <Sel label="Batch" nilai={kartu.batch} />
        <Sel label="Brand" nilai={kartu.brand} />
        <Sel label="Vendor Category" nilai={kartu.kategoriVendor} />
        <Sel label="Vendor / CMT" nilai={kartu.namaVendor} />
        <Sel label="Product / Design Code" nilai={detail.designCode} />
        <Sel label="Date Request" nilai={kartu.dateRequest} />
        <Sel label="Category" nilai={detail.kategori} />
      </div>
    </section>
  );
}

// ===== Blok rencana warna & ukuran =====
//
// Dua mode, karena isi tabelnya memang berbeda maksudnya per stage:
//
//   * mode Cutting : kolom "Plan Qty" diganti jadi kotak isi "Cutting Pcs".
//                    Plan SENGAJA tidak ikut tampil. Yang dipakai di sini bukan
//                    lagi rencana produksi, melainkan hasil potong yang sudah
//                    terjadi — dan memamerkan angka rencana tepat di sebelahnya
//                    membuat orang membandingkan dua hal yang memang tidak
//                    harus sama. Selisih antara rencana dan hasil potong itu
//                    urusan stage berikutnya (Receive), bukan Cutting.
//   * mode plan    : kolom Plan Qty, seperti semula.
//
// Dan Share DIHAPUS untuk semua stage. Kolom itu menampilkan persentase porsi
// tiap varian terhadap total plan — angka turunan dari kolom Plan Qty itu
// sendiri. Setelah plan tidak tampil di Cutting, kolomnya tidak punya sumber
// angka lagi di sana.
//
// Lebar kolomnya dipatok, bukan dibiarkan meregang. Sebelumnya tabel ini
// `table-auto` selebar dialog: dengan tiga kolom tanpa lebar, "Variant SKU"
// berakhir di tengah dan "Plan Qty" terdorong ke ujung kanan, sehingga dua
// angka yang seharusnya dibaca berdampingan terpisah setengah layar.

function SeksiWarnaUkuran({
  kartu,
  pcs,
  varian,
  adaTabelBahan,
  modeCutting = false,
  cuttingPcs = {},
  terkunci = false,
  aksi,
}: {
  kartu: KartuPdff;
  pcs: number;
  varian: number;
  /**
   * Apakah popup ini juga menampilkan tabel BOM di bawah. Hanya Propose dan
   * Prepare yang punya — stage lain isinya sengaja dikosongkan.
   *
   * Tanpa penjagaan ini, popup Cutting/Receive/Upload menulis "Kesiapan bahan
   * diperiksa di tabel bawah" tepat di atas panel yang berbunyi "Belum ada isi
   * khusus untuk stage ini": janji yang tidak ada tabelnya, di layar yang
   * dibaca pemilik saat presentasi.
   */
  adaTabelBahan: boolean;
  /** Stage Cutting: kolom Plan Qty diganti jadi input Cutting Pcs. */
  modeCutting?: boolean;
  cuttingPcs?: Record<string, number>;
  /**
   * Data Cutting sudah disetujui, jadi pcs-nya tidak boleh diubah (Q11).
   *
   * Yang dinonaktifkan adalah INPUT-nya, bukan tombolnya. Kalau tombol yang
   * dinonaktifkan, fokus tetap ke input dan ketikan berikutnya masih masuk —
   * pola yang sama sudah dipakai untuk input unggah bukti di `KotakBukti`.
   */
  terkunci?: boolean;
  buktiCutting?: BuktiCutting;
  aksi?: AksiStage;
}) {
  const baris = barisVarian(kartu);
  const totalCutting = baris.reduce((s, b) => s + (cuttingPcs[b.kunci] ?? 0), 0);

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul={modeCutting ? 'Color & Size' : 'Color & Size Plan'}
        keterangan={
          modeCutting
            ? terkunci
              ? 'Data ini sudah disetujui dan terkunci. Buka lagi lewat tombol "Kembalikan ke Cutting" di bagian bawah — setiap kali dibuka, alasannya dicatat.'
              : 'Satu baris mewakili satu kombinasi warna dan ukuran. Isi pcs yang benar-benar sudah dipotong.'
            : adaTabelBahan
              ? 'Satu baris mewakili satu kombinasi warna dan ukuran. Kesiapan bahan diperiksa di tabel bawah.'
              : 'Satu baris mewakili satu kombinasi warna dan ukuran.'
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-36 text-xs">Color</TableHead>
              <TableHead className="w-16 text-xs">Size</TableHead>
              <TableHead className="text-xs">Variant SKU</TableHead>
              <TableHead className={`text-right text-xs ${modeCutting ? 'w-36' : 'w-24'}`}>
                {modeCutting ? 'Cutting Pcs' : 'Plan Qty'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {baris.map((b) => {
              const kunci = b.kunci;
              return (
                <TableRow key={kunci}>
                  <TableCell className="px-3 py-2">{b.warna}</TableCell>
                  <TableCell className="px-3 py-2 text-muted-foreground">{b.ukuran}</TableCell>
                  <TableCell className="truncate px-3 py-2 font-mono text-xs">
                    {skuVarian(kartu, b.kode, b.ukuran)}
                  </TableCell>
                  {modeCutting ? (
                    <TableCell className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Cutting pcs ${b.warna} ${b.ukuran}`}
                        className="h-8 text-right tabular-nums"
                        value={cuttingPcs[kunci] ?? ''}
                        placeholder="—"
                        disabled={terkunci}
                        onChange={(e) => {
                          const mentah = e.target.value.trim();
                          // Kosong DIBEDAKAN dari 0, dan itu yang membuat gerbang
                          // bisa dihitung. Kotak yang dikosongkan berarti "belum diisi" —
                          // varian ini belum dipotong. Angka 0 berarti sudah diisi
                          // dan hasilnya memang nol, dan itu keputusan sah yang
                          // harus bisa dinyatakan. Kalau keduanya disamakan, satu
                          // saja varian yang memang tidak dipotong membuat
                          // gerbang tidak akan pernah terbuka.
                          if (mentah === '') {
                            aksi?.isiCutting(kartu, kunci, NaN);
                            return;
                          }
                          const n = Number(mentah);
                          aksi?.isiCutting(kartu, kunci, Number.isFinite(n) && n >= 0 ? n : NaN);
                        }}
                      />
                    </TableCell>
                  ) : (
                    <TableCell className="px-3 py-2 text-right tabular-nums">{b.qty} pcs</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-muted-foreground">{varian} variation rows</span>
        {modeCutting ? (
          <span className="font-semibold tabular-nums">Total cutting {totalCutting} PCS</span>
        ) : (
          <span className="font-semibold tabular-nums">Total plan {pcs} PCS</span>
        )}
      </div>
    </section>
  );
}

// ===== Stage Propose =====

function SeksiPropose({
  kartu,
  tujuan,
  adaPrepare,
  aksi,
}: {
  kartu: KartuPdff;
  /** Stage setelah Propose di papan ini — di White Label bukan Prepare. */
  tujuan?: StagePapan;
  /** Papan ini punya kolom Prepare? Kalau tidak, jangan menjanjikannya. */
  adaPrepare: boolean;
  aksi?: AksiStage;
}) {
  const [konfirmasi, setKonfirmasi] = useState(false);
  // Tujuan approve mengikuti kolom berikutnya di papan ini. Menulis "Prepare"
  // tetap akan salah di papan White Label, yang langsung menuju Invoice
  // Logistic — dan teks popup adalah satu-satunya tempat pemilik melihat ke
  // mana kartunya akan pindah sebelum menekan tombolnya.
  const namaTujuan = tujuan?.label ?? 'stage berikutnya';

  return (
    <>
      <section className="space-y-3">
        <JudulSeksi
          judul="Material Requirements (BOM)"
          keterangan={
            adaPrepare
              ? 'Perkiraan bahan untuk usulan ini. Stoknya diperiksa ulang saat kesiapan bahan dikerjakan di stage Prepare.'
              : 'Perkiraan bahan untuk usulan ini. Barang white label dibeli utuh dari vendor, jadi tidak ada pemeriksaan kesiapan bahan setelah ini.'
          }
        />
        <TabelBahan kartu={kartu} />
      </section>

      <section className="space-y-3">
        <JudulSeksi
          judul="Approval"
          keterangan={`Usulan ini belum masuk produksi. Menyetujuinya memindahkan kartu ke stage ${namaTujuan}.`}
        />

        {konfirmasi ? (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
            <p className="text-xs text-amber-900 dark:text-amber-100">
              Setujui <span className="font-semibold">{kartu.productName}</span>? Produk dan
              variannya didaftarkan otomatis, lalu kartunya pindah ke {namaTujuan}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setKonfirmasi(false)}>
                Batal
              </Button>
              <Button size="sm" onClick={() => aksi?.approve(kartu)}>
                Ya, Approve
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <p className="max-w-md text-xs text-muted-foreground">
              Produk dan varian baru didaftarkan otomatis begitu usulan ini disetujui.
            </p>
            <Button onClick={() => setKonfirmasi(true)}>Approve</Button>
          </div>
        )}
      </section>
    </>
  );
}

// ===== Stage Prepare =====

function SeksiPrepare({
  kartu,
  pcs,
  ringkas,
  tujuan,
  aksi,
}: {
  kartu: KartuPdff;
  pcs: number;
  ringkas: RingkasanBahan;
  /** Stage berikutnya di papan ini — di papan White Label bukan Cutting. */
  tujuan?: StagePapan;
  aksi?: AksiStage;
}) {
  const persen = ringkas.total > 0 ? Math.round((ringkas.siap / ringkas.total) * 100) : 0;
  // Label tombol mengikuti kolom berikutnya yang benar-benar ada di papan ini.
  // Menulis "Mulai Cutting" tetap akan salah di papan White Label, yang tidak
  // punya Cutting — kolom setelah Prepare di sana Invoice Logistic.
  const label = `Lanjut ke ${tujuan?.label ?? 'stage berikutnya'}`;

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Material Requirements (BOM)"
        keterangan={`Dihitung dari ${pcs} rencana pcs. Centang tiap baris yang barangnya sudah benar-benar dibeli.`}
      />

      <TabelBahan kartu={kartu} denganCentang aksi={aksi} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-[240px] flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Material readiness</span>
            <span className="tabular-nums text-muted-foreground">
              {ringkas.siap}/{ringkas.total} baris siap
            </span>
          </div>
          <Progress value={persen} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {ringkas.lengkap
              ? `Semua bahan sudah siap. Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
              : `Kartu baru bisa lanjut setelah semua baris bahan siap.` +
                (ringkas.kurang > 0
                  ? ` ${ringkas.kurang} baris masih di bawah stok tersedia.`
                  : '')}
          </p>
        </div>
        <Button disabled={!ringkas.lengkap} onClick={() => aksi?.lanjutStage(kartu)}>
          {label}
        </Button>
      </div>
    </section>
  );
}

// ===== Stage Cutting =====
//
// Daftar pekerjaan Cutting: pcs hasil potong per varian (lewat tabel di atas)
// plus dua bukti unggah. Keduanya WAJIB, dan gerbangnya sama bentuknya dengan
// Prepare: tombol lanjut mati sampai syaratnya terpenuhi.
//
// Keputusan owner 25 September 2026: kedua bukti wajib. Yang dituangkan di sini
// adalah bentuk presentation-nya, belum penyimpanan — berkasnya dibaca browser
// dan ditampilkan sebagai object URL, tidak dikirim ke server. Alasannya sudah
// ada di catatan grilling 24 Sep: mengunggah ke server tanpa tabel pemilik
// menghasilkan berkas yatim, yang sudah punya tiketnya sendiri.

function SeksiCutting({
  kartu,
  ringkas,
  tujuan,
  bukti,
  terkunci,
  aksi,
}: {
  kartu: KartuPdff;
  ringkas: RingkasanCutting;
  tujuan?: StagePapan;
  bukti: Record<string, BerkasBukti[]>;
  /** Data sudah disetujui: input dan bukti terkunci, tombol Lanjut hilang. */
  terkunci: boolean;
  aksi?: AksiStage;
}) {
  const persenBukti = ringkas.totalBukti > 0 ? Math.round((ringkas.bukti / ringkas.totalBukti) * 100) : 0;
  const persenVarian = ringkas.total > 0 ? Math.round((ringkas.terisi / ringkas.total) * 100) : 0;
  const label = `Lanjut ke ${tujuan?.label ?? 'stage berikutnya'}`;

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Bukti Cutting"
        keterangan="Dua bukti wajib sebelum kartu boleh lanjut. Berkas belum dikirim ke server — baru ditampilkan di peramban."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {JENIS_BUKTI_CUTTING.map((j) => (
          <KotakBukti
            key={j.id}
            jenis={j.id}
            judul={j.judul}
            keterangan={j.keterangan}
            terima={j.terima}
            sudahAda={(bukti[j.id] ?? []).length > 0}
            berkas={bukti[j.id] ?? []}
            terkunci={terkunci}
            aksi={aksi}
            kartu={kartu}
          />
        ))}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Pcs cutting per varian</span>
              <span className="tabular-nums text-muted-foreground">
                {ringkas.terisi}/{ringkas.total} terisi
              </span>
            </div>
            <Progress value={persenVarian} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Bukti terkumpul</span>
              <span className="tabular-nums text-muted-foreground">
                {ringkas.bukti}/{ringkas.totalBukti} jenis
              </span>
            </div>
            <Progress value={persenBukti} className="h-2" />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {terkunci
            ? 'Data ini sudah disetujui dan tercatat. Untuk mengubahnya, kembalikan dulu ke Cutting — alasannya ikut dicatat.'
            : ringkas.lengkap
              ? `Cutting selesai dicatat. Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
              : 'Kartu baru bisa lanjut setelah tiap varian punya pcs cutting dan kedua bukti terunggah.'}
        </p>

        {/* Saat terkunci, tombol Lanjut DIHILANGKAN, bukan dimatikan. Data
            sudah tercatat dan kartu sudah ada di stage berikutnya — tombol
            yang masih ada di sini hanya menjalankan perpindahan yang sama
            untuk kedua kalinya, dan tidak ada gunanya. Panel pengembaliannya
            dirender IsiPopup, bukan di sini; lihat catatan di sana. */}
        {!terkunci && (
          <div className="flex justify-end">
            <Button disabled={!ringkas.lengkap} onClick={() => aksi?.lanjutStage(kartu)}>
              {label}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ===== Tiga tahap akhir: Invoice Logistic, Invoice Product, Upload =====
//
// Ketiganya TIDAK punya perhitungan. Yang diisi orang cuma tanggal, satu
// pilihan, satu angka, dan berkas — jadi bentuk ketiganya sama, dan yang
// berbeda cuma daftar buktinya.
//
// DUA KOREKSI OWNER YANG DITEGASKAN DI SINI, karena keduanya pernah salah
// dibaca dan salah baca itu tidak memunculkan error apa pun:
//
//   1. `jumlahUploadPos` = ANGKA (berapa PCS yang sudah masuk POS). Ia bukan
//      hitungan berkas, dan berbeda dari `proofUploadEcommerce` (screenshot
//      sudah tayang di marketplace) dan `uploadPos` (screenshot sudah masuk
//      POS). Tiga field ini tidak boleh saling menggantikan.
//
//   2. `flowTransaction` menentukan BUKTI MANA yang muncul — dua jalur, field
//      berbeda. Keduanya tidak pernah dirender bersamaan: dua kotak sekaligus
//      membuat orang mengunggah ke tempat yang salah tanpa ada yang menahan,
//      dan Finance Validate tidak akan bisa tahu mana yang seharusnya ada.
//
// GERBANGNYA SAMA BENTUKNYA dengan Prepare dan Cutting: tombol lanjut mati
// sampai isian wajibnya lengkap, dan alasannya ditulis di layar. Untuk
// `jumlahUploadPos`, yang dituntut adalah TERISI — bukan lebih dari nol. Angka
// 0 adalah pernyataan yang sah ("belum ada yang masuk POS"), dan justru itu
// yang dilaporkan sebagai temuan di Finance Validate; kalau 0 ikut menahan
// kartu di sini, temuan itu tidak akan pernah bisa muncul.

/**
 * Satu kolom isian di tahap akhir.
 *
 * Saat `terkunci`, isiannya TIDAK dirender sama sekali dan diganti teks biasa —
 * bukan `disabled`. Aturan owner untuk tiga tahap ini "terkunci total, tidak
 * ada pengecualian": tidak ada tombol pembuka seperti "Kembalikan ke Cutting"
 * di Q11. Kotak yang masih ada tapi mati tetap terlihat seperti sesuatu yang
 * bisa dinyalakan lagi, dan di layar presentasi itu janji yang tidak ada.
 */
function KolomTahap({
  label,
  terkunci,
  teks,
  children,
}: {
  label: string;
  terkunci: boolean;
  /** Nilai yang ditampilkan saat terkunci — sudah berbentuk label, bukan kode. */
  teks: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {terkunci ? (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{teks || '—'}</div>
      ) : (
        children
      )}
    </div>
  );
}

/** Daftar isian yang masih kurang, untuk ditulis di baris status. */
function kurangTahap(
  jenis: readonly { id: string; judul: string }[],
  bukti: Record<string, BerkasBukti[]>,
  wajib: { nama: string; terisi: boolean }[]
): string[] {
  return [
    ...wajib.filter((w) => !w.terisi).map((w) => w.nama),
    ...jenis.filter((j) => (bukti[j.id]?.length ?? 0) === 0).map((j) => j.judul),
  ];
}

function SeksiInvoiceLogistic({
  kartu,
  bukti,
  terkunci,
  tujuan,
  aksi,
}: {
  kartu: KartuPdff;
  bukti: Record<string, BerkasBukti[]>;
  terkunci: boolean;
  tujuan?: StagePapan;
  aksi?: AksiStage;
}) {
  const tahap = kartu.tahapAkhir ?? {};
  const kode = tahap.kodeShipmentLivou ?? '';
  const tanggal = tahap.dateInvoiceLogistic ?? '';
  const ringkas = ringkasTahapBukti(bukti, 'invoice-logistic');
  const kurang = kurangTahap(JENIS_BUKTI_INVOICE_LOGISTIC, bukti, [
    { nama: 'Kode shipment', terisi: kode.trim() !== '' },
    { nama: 'Tanggal invoice logistic', terisi: tanggal !== '' },
  ]);
  const bolehLanjut = kurang.length === 0;

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Invoice Logistic"
        keterangan="Nota dan pembayaran ongkos kirim shipment ini. Barang white label datang utuh dari vendor luar negeri, jadi yang dicatat di sini adalah logistiknya."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KolomTahap label="Kode Shipment Livou" terkunci={terkunci} teks={kode}>
          <Input
            aria-label="Kode shipment Livou"
            placeholder="SH-CN-2609-002"
            value={kode}
            onChange={(e) => aksi?.ubahTahap(kartu, 'kodeShipmentLivou', e.target.value)}
          />
        </KolomTahap>

        <KolomTahap label="Tanggal Invoice Logistic" terkunci={terkunci} teks={tanggal}>
          <Input
            type="date"
            aria-label="Tanggal invoice logistic"
            value={tanggal}
            onChange={(e) =>
              aksi?.ubahTahap(kartu, 'dateInvoiceLogistic', e.target.value || undefined)
            }
          />
        </KolomTahap>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {JENIS_BUKTI_INVOICE_LOGISTIC.map((j) => (
          <KotakBukti
            key={j.id}
            jenis={j.id}
            judul={j.judul}
            keterangan={j.keterangan}
            terima={j.terima}
            sudahAda={(bukti[j.id]?.length ?? 0) > 0}
            berkas={bukti[j.id] ?? []}
            terkunci={terkunci}
            aksi={aksi}
            kartu={kartu}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <div className="text-xs font-medium">Kelengkapan stage ini</div>
          <p className="text-xs text-muted-foreground">
            {terkunci
              ? 'Data ini sudah lewat tahapnya dan tidak bisa diubah lagi.'
              : bolehLanjut
                ? `Invoice logistic lengkap (${ringkas.terisi}/${ringkas.total} bukti). Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
                : `Belum lengkap: ${kurang.join(', ')}.`}
          </p>
        </div>
        {!terkunci && (
          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>
            Lanjut ke {tujuan?.label ?? 'stage berikutnya'}
          </Button>
        )}
      </div>
    </section>
  );
}

function SeksiInvoiceProduct({
  kartu,
  bukti,
  terkunci,
  tujuan,
  aksi,
}: {
  kartu: KartuPdff;
  bukti: Record<string, BerkasBukti[]>;
  terkunci: boolean;
  tujuan?: StagePapan;
  aksi?: AksiStage;
}) {
  const tahap = kartu.tahapAkhir ?? {};
  const kode = tahap.kodeShipmentLivou ?? '';
  const tanggal = tahap.dateInvoiceProduct ?? '';
  const flow = tahap.flowTransaction ?? '';
  const solusi = tahap.solution ?? '';

  // Daftar bukti mengikuti jalur yang dipilih. Tanpa jalur, bukti ketiganya
  // belum diketahui — jadi yang dituntut baru invoice-nya saja, bukan bukti
  // yang mungkin bukan milik kartu ini.
  const jenis = jenisBuktiTahap('invoice-product', flow);
  const ringkas = ringkasTahapBukti(bukti, 'invoice-product', flow);
  const kurang = kurangTahap(jenis, bukti, [
    { nama: 'Kode shipment', terisi: kode.trim() !== '' },
    { nama: 'Tanggal invoice product', terisi: tanggal !== '' },
    { nama: 'Flow transaksi', terisi: flow !== '' },
  ]);
  const bolehLanjut = kurang.length === 0;

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Invoice Product"
        keterangan="Invoice produk, plus ke mana barangnya dibayar. Pilihan flow menentukan bukti mana yang wajib diunggah."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KolomTahap label="Kode Shipment Livou" terkunci={terkunci} teks={kode}>
          <Input
            aria-label="Kode shipment Livou"
            placeholder="SH-CN-2609-002"
            value={kode}
            onChange={(e) => aksi?.ubahTahap(kartu, 'kodeShipmentLivou', e.target.value)}
          />
        </KolomTahap>

        <KolomTahap label="Tanggal Invoice Product" terkunci={terkunci} teks={tanggal}>
          <Input
            type="date"
            aria-label="Tanggal invoice product"
            value={tanggal}
            onChange={(e) =>
              aksi?.ubahTahap(kartu, 'dateInvoiceProduct', e.target.value || undefined)
            }
          />
        </KolomTahap>

        <KolomTahap label="Flow Transaksi" terkunci={terkunci} teks={labelDari(FLOW_TRANSAKSI, flow)}>
          <Select
            value={flow || NONE_TAHAP}
            onValueChange={(v) =>
              aksi?.ubahTahap(kartu, 'flowTransaction', v === NONE_TAHAP ? undefined : String(v))
            }
          >
            <SelectTrigger aria-label="Flow transaksi" className="w-full">
              {/* Fungsi child: tanpa ini base-ui menampilkan nilai mentahnya
                  (`livou_transfer` dengan garis bawah), dan itu bukan yang
                  ditulis di kolomnya. Pola sama dengan pemilih jenis bahan. */}
              <SelectValue>
                {(v: string) => (v === NONE_TAHAP ? 'Belum dipilih' : labelDari(FLOW_TRANSAKSI, v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_TAHAP}>Belum dipilih</SelectItem>
              {FLOW_TRANSAKSI.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </KolomTahap>

        <KolomTahap label="Solution" terkunci={terkunci} teks={labelDari(SOLUSI, solusi)}>
          <Select
            value={solusi || NONE_TAHAP}
            onValueChange={(v) =>
              aksi?.ubahTahap(kartu, 'solution', v === NONE_TAHAP ? undefined : String(v))
            }
          >
            <SelectTrigger aria-label="Solution" className="w-full">
              <SelectValue>
                {(v: string) => (v === NONE_TAHAP ? 'Belum dipilih' : labelDari(SOLUSI, v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_TAHAP}>Belum dipilih</SelectItem>
              {SOLUSI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </KolomTahap>
      </div>

      {/* Bukti yang dirender mengikuti `jenis` di atas — SATU daftar, bukan dua
          blok yang masing-masing menyembunyikan diri. Kalau bloknya ditulis dua
          kali lalu salah satunya disembunyikan, tidak ada yang menjamin daftar
          yang dihitung untuk gerbang sama dengan yang terlihat di layar. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {jenis.map((j) => (
          <KotakBukti
            key={j.id}
            jenis={j.id}
            judul={j.judul}
            keterangan={j.keterangan}
            terima={j.terima}
            sudahAda={(bukti[j.id]?.length ?? 0) > 0}
            berkas={bukti[j.id] ?? []}
            terkunci={terkunci}
            aksi={aksi}
            kartu={kartu}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <div className="text-xs font-medium">Kelengkapan stage ini</div>
          <p className="text-xs text-muted-foreground">
            {terkunci
              ? 'Data ini sudah lewat tahapnya dan tidak bisa diubah lagi.'
              : bolehLanjut
                ? `Invoice product lengkap (${ringkas.terisi}/${ringkas.total} bukti). Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
                : `Belum lengkap: ${kurang.join(', ')}.`}
          </p>
        </div>
        {!terkunci && (
          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>
            Lanjut ke {tujuan?.label ?? 'stage berikutnya'}
          </Button>
        )}
      </div>
    </section>
  );
}

function SeksiUpload({
  kartu,
  bukti,
  terkunci,
  tujuan,
  aksi,
}: {
  kartu: KartuPdff;
  bukti: Record<string, BerkasBukti[]>;
  terkunci: boolean;
  tujuan?: StagePapan;
  aksi?: AksiStage;
}) {
  const tahap = kartu.tahapAkhir ?? {};
  const jumlah = tahap.jumlahUploadPos;
  const terisi = jumlah !== undefined;
  const ringkas = ringkasTahapBukti(bukti, 'upload');
  const kurang = kurangTahap(JENIS_BUKTI_UPLOAD, bukti, [
    // Yang dituntut TERISI, bukan lebih dari nol — lihat catatan di atas.
    { nama: 'Jumlah upload POS', terisi },
  ]);
  const bolehLanjut = kurang.length === 0;
  // Jumlah plan dipakai sebagai PEMBANDING di layar, bukan sebagai syarat:
  // "98 dari 160 pcs" langsung terbaca, sedangkan "98" sendirian tidak
  // memberi tahu apa pun. Angkanya dari `totalPcs()` yang sama dengan yang
  // dipakai seluruh papan, jadi tidak ada angka kedua yang bisa berbeda.
  const rencana = totalPcs(kartu);

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Upload"
        keterangan="Produk sudah tayang di marketplace dan sudah masuk POS. Angka dan dua bukti di bawah mengukur hal yang berbeda."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KolomTahap
          label="Jumlah Upload POS (pcs)"
          terkunci={terkunci}
          teks={terisi ? `${jumlah} pcs` : ''}
        >
          <div className="space-y-1">
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              aria-label="Jumlah upload POS"
              placeholder="—"
              value={terisi ? String(jumlah) : ''}
              onChange={(e) => {
                const mentah = e.target.value.trim();
                // Kosong DIBEDAKAN dari 0, sama seperti input pcs Cutting:
                // kotak yang dikosongkan berarti "belum diisi", angka 0 berarti
                // sudah diisi dan hasilnya memang nol.
                if (mentah === '') {
                  aksi?.ubahTahap(kartu, 'jumlahUploadPos', undefined);
                  return;
                }
                const n = Number(mentah);
                if (Number.isFinite(n) && n >= 0) aksi?.ubahTahap(kartu, 'jumlahUploadPos', n);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Berapa pcs yang sudah masuk POS — bukan jumlah berkas. Plan kartu ini{' '}
              {rencana} pcs.
            </p>
          </div>
        </KolomTahap>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {JENIS_BUKTI_UPLOAD.map((j) => (
          <KotakBukti
            key={j.id}
            judul={j.judul}
            jenis={j.id}
            keterangan={j.keterangan}
            terima={j.terima}
            sudahAda={(bukti[j.id]?.length ?? 0) > 0}
            berkas={bukti[j.id] ?? []}
            terkunci={terkunci}
            aksi={aksi}
            kartu={kartu}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <div className="text-xs font-medium">Kelengkapan stage ini</div>
          <p className="text-xs text-muted-foreground">
            {terkunci
              ? 'Data ini sudah lewat tahapnya dan tidak bisa diubah lagi.'
              : bolehLanjut
                ? `Upload lengkap (${ringkas.terisi}/${ringkas.total} bukti). Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
                : `Belum lengkap: ${kurang.join(', ')}.`}
          </p>
        </div>
        {!terkunci && (
          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>
            Lanjut ke {tujuan?.label ?? 'stage berikutnya'}
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * Stage penutup: daftar temuan dari seluruh tahap sebelumnya.
 *
 * Bukan sekadar halaman ringkasan — ini satu-satunya tempat yang boleh menahan
 * kartu karena kesalahan yang terjadi di stage LAIN. Keputusan pemilik: kalau
 * ada selisih, kartu tetap nyangkut di sini, dan yang bisa dilanjutkan cuma
 * kartu yang temuannya sudah ditutup. Karena itu tombolnya tidak disembunyikan
 * saat masih ada temuan — ia ditampilkan MATI, supaya terbaca "belum boleh",
 * bukan "tidak ada tombolnya".
 *
 * Temuan tertutup TETAP tampil dengan statusnya, sesuai keputusan pemilik:
 * riwayatnya harus terlihat, supaya "tidak pernah ada masalah" bisa dibedakan
 * dari "masalahnya sudah selesai".
 */
function SeksiFinanceValidate({
  kartu,
  sumber,
  bukti,
  tertutup,
  terima,
  barisHpp,
  tujuan,
  aksi,
}: {
  kartu: KartuPdff;
  sumber: SumberPapan;
  /** Bukti SEMUA tahap kartu ini, sudah digabung pemanggil. */
  bukti: Record<string, BerkasBukti[]>;
  /** Id temuan yang sudah ditutup. */
  tertutup: string[];
  terima: BarisTerima[];
  barisHpp: readonly BarisShipmentRingkas[];
  tujuan?: StagePapan;
  aksi?: AksiStage;
}) {
  const temuan = temuanKartu(kartu, {
    sumber,
    bukti,
    ditutup: tertutup,
    terima,
    barisHpp,
  });
  const terbuka = temuan.filter((t) => t.status === 'terbuka');
  const bolehLanjut = terbuka.length === 0;

  let status: string;
  if (temuan.length === 0) {
    status = 'Tidak ada temuan. Kartu boleh lanjut.';
  } else if (bolehLanjut) {
    status = `Semua ${temuan.length} temuan sudah ditutup. Kartu boleh lanjut.`;
  } else {
    status = `Masih ada ${terbuka.length} temuan belum ditutup: ${terbuka
      .map((t) => t.label)
      .join(', ')}.`;
  }

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Finance Validate"
        keterangan="Stage penutup. Kartu tidak pernah mundur, dan baru boleh lanjut setelah semua temuannya ditutup."
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium">
            Daftar temuan ({terbuka.length} terbuka dari {temuan.length})
          </div>
          {terbuka.length > 0 && (
            <span
              className={cn(
                badgeVariants({ variant: 'destructive' }),
                'border-transparent px-2 py-0.5 text-[11px]'
              )}
            >
              Kartu tertahan
            </span>
          )}
        </div>

        {temuan.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Tidak ada temuan dari tahap sebelumnya.
          </div>
        ) : (
          <ul className="space-y-2">
            {temuan.map((t) => (
              <li
                key={t.id}
                data-temuan={t.id}
                data-status={t.status}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t.label}</span>
                    <span
                      className={cn(
                        badgeVariants({ variant: 'outline' }),
                        'px-2 py-0 text-[11px] font-normal'
                      )}
                    >
                      {labelStageAsal(t.stage)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.detail}</p>
                </div>

                {t.status === 'terbuka' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    data-tutup-temuan={t.id}
                    onClick={() => aksi?.tutupTemuan(kartu, t.id)}
                  >
                    Tutup temuan
                  </Button>
                ) : (
                  <span
                    className={cn(
                      badgeVariants({ variant: 'secondary' }),
                      'border-transparent px-2 py-0.5 text-[11px]',
                      'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                    )}
                  >
                    Tertutup
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <div className="text-xs font-medium">Kelengkapan stage ini</div>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
        <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>
          {tujuan ? `Lanjut ke ${tujuan.label}` : 'Selesaikan validasi'}
        </Button>
      </div>
    </section>
  );
}

/**
 * Panel data terkunci: ringkasan angka, riwayat pengembalian, dan tombol
 * "Kembalikan ke Cutting" (Q11).
 *
 * Hanya dirender saat `terkunci` — kalau tidak, panel ini akan menawarkan
 * tombol untuk membuka data yang belum pernah ditutup, dan jejaknya jadi
 * catatan pengembalian untuk sesuatu yang tidak dikembalikan.
 *
 * Alasan WAJIB diisi sebelum tombol konfirmasi hidup. Jejak yang dicatat
 * setiap kali data dibuka kembali adalah waktu, alasan, dan total pcs saat itu;
 * tanpa alasan, jejaknya cuma berbunyi "ada perubahan" tanpa menjelaskan
 * kenapa, dan itu tidak menolong siapa pun yang membacanya.
 */
function PanelKembalikan({
  kartu,
  ringkas,
  kembalikan,
  aksi,
}: {
  kartu: KartuPdff;
  ringkas: RingkasanCutting;
  kembalikan: CatatanKembalikan[];
  aksi?: AksiStage;
}) {
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [alasan, setAlasan] = useState('');
  const alasanCukup = alasan.trim().length > 0;
  // Ditutup di akhir, dan alasannya ikut dibuang — membuka panel lagi
  // tidak boleh mewarisi alasan yang sudah pernah dikonfirmasi di panel
  // sebelumnya.
  const tutup = () => {
    setKonfirmasi(false);
    setAlasan('');
  };

  return (
    <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Data Cutting terkunci</p>
          <p className="text-xs text-muted-foreground">
            {ringkas.terisi}/{ringkas.total} varian terisi · total {ringkas.totalPcs} pcs ·{' '}
            {ringkas.bukti}/{ringkas.totalBukti} bukti
          </p>
        </div>
        {!konfirmasi && (
          <Button variant="outline" size="sm" onClick={() => setKonfirmasi(true)}>
            Kembalikan ke Cutting
          </Button>
        )}
      </div>

      {kembalikan.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Riwayat dikembalikan</p>
          <ul className="space-y-1.5">
            {[...kembalikan].reverse().map((k, i) => (
              <li
                // Waktu + posisi: `i` berasal dari `reverse()`, jadi urutannya
                // sudah terbalik. Dua entri dengan waktu sama tetap punya key beda.
                key={`${k.waktu}-${i}`}
                className="space-y-0.5 rounded bg-background px-2 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular-nums text-muted-foreground">{formatWaktu(k.waktu)}</span>
                  <span className="tabular-nums">{k.totalPcs} pcs saat itu</span>
                </div>
                <p className="text-muted-foreground">{k.alasan}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {konfirmasi && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Kartu akan kembali ke stage Cutting dan pcs-nya bisa diubah lagi. Angka saat ini
            ({ringkas.totalPcs} pcs) dan alasan ini ikut dicatat.
          </p>
          <Input
            aria-label="Alasan mengembalikan ke Cutting"
            placeholder="Alasan pengembalian"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={tutup}>
              Batal
            </Button>
            <Button
              size="sm"
              disabled={!alasanCukup}
              onClick={() => {
                aksi?.kembalikanCutting(kartu, alasan.trim());
                tutup();
              }}
            >
              Ya, Kembalikan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Waktu ISO jadi yang enak dibaca, dalam zona waktu lokal.
 *
 * `toLocaleString` tanpa opsi kedua memakai zona waktu mesin, jadi angka yang
 * sama bisa tampil berbeda di laptop dan laptop berikutnya — dan catatan ini
 * justru dipakai untuk membandingkan "kapan angka ini berubah".
 */
function formatWaktu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function KotakBukti({
  jenis,
  judul,
  keterangan,
  terima,
  sudahAda,
  berkas,
  aksi,
  kartu,
  terkunci = false,
}: {
  jenis: string;
  judul: string;
  keterangan: string;
  terima: string;
  sudahAda: boolean;
  berkas: BerkasBukti[];
  /**
   * Hanya dua handler yang dipakai komponen ini.
   *
   * Bukan `AksiStage` penuh, karena pemanggil stage HPP memang harus menyimpan
   * buktinya di store yang BERBEDA dari `buktiCutting` — lihat `AksiBuktiHpp`
   * di `SeksiHppPrice.tsx`. Kalau prop ini menuntut `AksiStage`, pemanggil itu
   * dipaksa mengoper objek yang menunjuk store Cutting, dan bukti kalkulasi
   * berakhir tersimpan di sana. Persempit ke yang benar-benar dibaca membuat
   * pemanggil kedua tidak perlu berbohong soal store mana yang dia pakai.
   */
  aksi?: {
    tambahBukti: (kartu: KartuPdff, jenis: string, berkas: File) => void;
    hapusBukti: (kartu: KartuPdff, jenis: string, nama: string) => void;
  };
  kartu: KartuPdff;
  /** Bukti sudah disetujui: tidak bisa ditambah, tidak bisa dihapus. */
  terkunci?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${
        sudahAda ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {sudahAda ? (
          <FileText className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
        ) : (
          <Paperclip className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{judul}</div>
          <div className="text-xs text-muted-foreground">{keterangan}</div>
        </div>
      </div>

      {berkas.length > 0 && (
        <ul className="space-y-1.5">
          {berkas.map((b) => (
            <li key={b.nama} className="space-y-1 rounded bg-background px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                {b.tipe.startsWith('image/') ? (
                  // Pratinjau, bukan sekadar nama berkas: untuk "foto SS register"
                  // isi fotonya justru satu-satunya yang perlu diperiksa sebelum
                  // kartu boleh lanjut, jadi menampilkan namanya saja tidak
                  // memberi user apa pun untuk diverifikasi.
                  <img
                    src={b.url}
                    alt={b.nama}
                    className="size-10 shrink-0 rounded border object-cover"
                  />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{b.nama}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {(b.ukuran / 1024).toFixed(0)} KB
                </span>
                {/* PDF (dan berkas apa pun) tidak bisa dirender di sini, jadi
                    dibuka di tab baru. Dirender sebagai <a>, bukan <button>
                    dengan onClick: ini memang tautan, dan sebagai tautan
                    user bisa klik tengah atau "open in new tab" seperti pada
                    berkas biasa. Base UI menyediakan `render` untuk ini. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={`Buka ${b.nama}`}
                  render={<a href={b.url} target="_blank" rel="noopener noreferrer" />}
                >
                  <ExternalLink />
                </Button>
                {!terkunci && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Hapus ${b.nama}`}
                    onClick={() => aksi?.hapusBukti(kartu, jenis, b.nama)}
                  >
                    <X />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Input file disembunyikan, tombol yang mengetik label-nya. Pola yang
          sama dipakai di halaman Pembelian Material, dan alasannya sama:
          `disabled` harus dipasang pada INPUT-nya, bukan pada Button — kalau
          Button yang dinonaktifkan, klik tetap diteruskan ke input dan
          berkas kedua lolos masuk tanpa terlihat. */}
      {terkunci ? (
        <p className="text-xs text-muted-foreground">
          Bukti ini sudah tercatat dan tidak bisa diubah.
        </p>
      ) : (
        <Button
          variant={sudahAda ? 'outline' : 'secondary'}
          size="sm"
          className="w-full"
          onClick={() => input.current?.click()}
        >
          {sudahAda ? 'Tambah berkas lain' : 'Unggah'}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={terima}
        className="hidden"
        aria-label={`Unggah ${judul}`}
        onChange={(e) => {
          const dipilih = Array.from(e.target.files ?? []);
          // Dikosongkan setelah dipakai supaya berkas yang sama bisa dipilih
          // ulang — tanpa ini, memilih berkas yang sama dua kali tidak memicu
          // onChange, jadi tombolnya terlihat tidak bekerja.
          e.target.value = '';
          for (const f of dipilih) aksi?.tambahBukti(kartu, jenis, f);
        }}
      />
    </div>
  );
}

// ===== Stage Receive (tiket 6) =====
//
// Bentuknya mengikuti mockup owner 24 September 2026, dan yang paling penting
// dipertahankan dari mockup itu bukan tata letaknya, melainkan SATU data:
// popup ini adalah FORM, sedangkan halaman `/modul/barang-datang` adalah
// DAFTAR dari data yang sama (Q6). Karena itu tidak ada satu pun angka di sini
// yang disimpan di dalam komponen ini — semuanya dibaca dari `kedatangan` yang
// hidup di papan, supaya popup dan halaman tidak bisa menampilkan dua angka
// berbeda untuk barang yang sama.
//
// Empat angka di atas, tiga tab di bawah, dan formulir per varian di tab
// kedua. Yang TIDAK dipakai dari mockup: tab "Dokumen" dan "Masalah" diisi
// ringkasan yang memang sudah ada datanya (bukti, dan temuan Finance
// Validate) — tab kosong dengan judul menggoda lebih buruk daripada tidak ada
// tab sama sekali, karena pemilik akan mengkliknya saat presentasi.

const LABEL_STATUS_TERIMA: Record<Kedatangan['status'], string> = {
  draft: 'Draft',
  final: 'Tersimpan',
};

function SeksiReceive({
  kartu,
  sumber,
  ringkas,
  kedatangan,
  bukti,
  tujuan,
  tahap,
  aksi,
}: {
  kartu: KartuPdff;
  sumber: SumberPapan;
  ringkas: RingkasanTerima;
  kedatangan: Kedatangan[];
  bukti: Record<string, BerkasBukti[]>;
  tujuan?: StagePapan;
  /** Isi tahap akhir kartu — dibaca untuk gerbang Q9 (Solution + Log). */
  tahap: DataTahapAkhir;
  aksi?: AksiStage;
}) {
  // Draft yang sedang diisi. Satu saja per kartu: dua draft sekaligus berarti
  // dua angka yang sama-sama "belum disimpan", dan tidak ada cara tahu mana
  // yang dipakai saat penerimaannya disimpan.
  const draft = kedatangan.find((k) => k.status === 'draft');

  const baris = barisPenerimaan(kartu, ringkas, draft);
  const lengkap = baris.every((b) => b.sisa === 0);
  const solusi = tahap.solution ?? '';
  const logSolusi = (tahap.logSolution ?? '').trim();
  const adaSolusi = solusi !== '' && logSolusi !== '';
  const bolehLanjut = lengkap || adaSolusi;

  const [draftBaru, setDraftBaru] = useState(false);
  // Ditutup sendiri oleh yang memakainya. Dipisah dari `draftBaru` karena
  // formulirnya kini terbuka sejak awal: tanpa penanda ini, tombol silang
  // tidak bisa menutupnya — syarat "masih ada sisa" tetap benar, jadi
  // formulirnya muncul lagi seketika dan tombolnya terasa rusak.
  const [formDitutup, setFormDitutup] = useState(false);
  // Formulirnya TERBUKA sejak awal selama masih ada yang perlu diterima.
  //
  // Mockup owner menggambarnya terbuka — lengkap dengan badge 'Receipt #3' —
  // dan stage ini memang ada untuk mencatat kedatangan. Membiarkannya di balik
  // satu klik membuat tabel per variannya, yang justru inti mockup itu, tidak
  // terlihat sampai ada yang menekan tombol; yang terlihat lebih dulu cuma
  // ringkasan dan riwayat.
  //
  // Kartu yang sudah penuh tetap tertutup: di sana tidak ada lagi yang bisa
  // dicatat, dan tombol "Catat Barang Datang"-nya memang sudah mati.
  const terbuka = !formDitutup && (draftBaru || Boolean(draft) || ringkas.sisa > 0);

  // Nomor kedatangan berikutnya dihitung SETIAP render, bukan disimpan di
  // state formulir. Kalau ia ikut jadi nilai awal `useState`, nomornya
  // terhitung sekali saat komponen lahir — dan kedatangan kedua yang dicatat
  // tanpa menutup popup akan memakai nomor yang sama, lalu menimpa yang
  // pertama lewat pencocokan `urut`. Tidak ada yang gagal; yang terlihat cuma
  // "kok riwayatnya cuma satu?".
  const urutBaru = kedatangan.reduce((m, k) => Math.max(m, k.urut), 0) + 1;

  const [form, setForm] = useState<Kedatangan>(() => ({
    urut: 0,
    tanggal: new Date().toISOString().slice(0, 10),
    lokasi: LOKASI_TERIMA[0].value,
    sumber: SUMBER_TERIMA[0].value,
    datang: {},
    reject: {},
    keterangan: '',
    dicatatOleh: '',
    status: 'draft',
  }));

  const jenisBukti = JENIS_BUKTI_RECEIVE.filter(
    (j) => j.id !== 'surat-jalan' || sumber === 'whitelabel'
  );

  return (
    <section className="space-y-4">
      <JudulSeksi
        judul="Penerimaan Barang"
        keterangan={
          sumber === 'whitelabel'
            ? 'Barang datang dari vendor luar negeri. Kesesuaiannya diukur terhadap surat jalan — papan ini tidak punya Cutting.'
            : 'Barang datang dari hasil cutting. Kesesuaiannya diukur terhadap hasil cutting, bukan surat jalan.'
        }
      />

      {/* Empat kartu angka. Susunannya mengikuti mockup: Plan → Masuk Stok →
          Sisa → Kedatangan. Yang dibaca lebih dulu adalah "berapa yang
          direncanakan", baru "berapa yang sudah masuk" — bukan sebaliknya. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KartuAngka label="Plan" nilai={`${ringkas.plan} pcs`} />
        <KartuAngka
          label="Masuk Stok"
          nilai={`${ringkas.masukStok} pcs`}
          keterangan={`${ringkas.persen}% dari plan`}
          nada={ringkas.masukStok > 0 ? 'hijau' : 'netral'}
        />
        <KartuAngka
          label="Sisa"
          nilai={`${ringkas.sisa} pcs`}
          // Kartu ini hanya menjumlahkan kedatangan yang sudah TERSIMPAN,
          // sedangkan tabel di bawah menghitung draft yang sedang diisi
          // (sengaja — supaya sisanya bergerak saat diketik). Dua angka "Sisa"
          // di satu layar tanpa keterangan terbaca seperti salah hitung, jadi
          // keterangannya muncul justru hanya saat keduanya memang berbeda.
          keterangan={draft ? 'belum termasuk draft di bawah' : undefined}
          nada={ringkas.sisa > 0 ? 'kuning' : 'hijau'}
        />
        <KartuAngka
          label="Kedatangan"
          nilai={`${ringkas.jumlahKedatangan}×`}
          keterangan={ringkas.terakhir ? `terakhir ${formatTanggal(ringkas.terakhir)}` : 'belum ada'}
        />
      </div>

      {/* Tombol catat. Hanya muncul saat formulirnya sedang tertutup — baik
          karena sudah penuh, maupun karena yang memakainya menutupnya sendiri.
          Menekannya membuka kembali yang tadi ditutup, bukan membuat formulir
          kedua: isian yang belum disimpan tidak boleh hilang karena satu klik
          yang tidak sengaja. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {ringkas.jumlahKedatangan > 0
              ? `${ringkas.jumlahKedatangan} kedatangan tercatat`
              : 'Barang belum pernah datang'}
          </span>
          {draft && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Draft belum disimpan
            </span>
          )}
        </div>
        {!terbuka && (
          <Button
            onClick={() => {
              setFormDitutup(false);
              setDraftBaru(true);
            }}
            disabled={ringkas.sisa === 0}
            title={
              ringkas.sisa === 0
                ? 'Semua varian sudah terpenuhi — tidak ada yang perlu dicatat lagi.'
                : undefined
            }
          >
            <Plus /> Catat Barang Datang
          </Button>
        )}
      </div>

      {/* Formulir penerimaan — hanya saat terbuka. Semua isiannya masuk ke
          `form` lokal dan baru naik ke papan saat tombol Simpan ditekan. */}
      {terbuka && (
        <div className="space-y-3 rounded-lg border-2 border-blue-200 p-3 dark:border-blue-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Catat Barang Datang</span>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Receipt #{draft?.urut ?? urutBaru}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Tutup formulir penerimaan"
              onClick={() => {
                // Menutup formulir TIDAK membuang apa pun — ia hanya
                // menyembunyikannya, dan tombol "Catat Barang Datang" membuka
                // kembali isian yang sama.
                //
                // Sebelumnya tombol silang ini sekaligus menghapus draft yang
                // tersimpan. Karena formulirnya kini terbuka sejak awal, satu
                // klik tidak sengaja akan menghapus catatan yang sudah dibuat —
                // dan yang terlihat cuma riwayat yang menyusut, tanpa pesan apa
                // pun. Membuang draft harus jadi tindakan tersendiri, bukan
                // akibat sampingan dari menutup jendela.
                setDraftBaru(false);
                setFormDitutup(true);
              }}
            >
              <X />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Tanggal Datang</div>
              <Input
                type="date"
                aria-label="Tanggal datang"
                value={draft?.tanggal ?? form.tanggal}
                onChange={(e) => {
                  const v = e.target.value;
                  if (draft) aksi?.simpanKedatangan(kartu, { ...draft, tanggal: v });
                  else setForm((f) => ({ ...f, tanggal: v }));
                }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Lokasi Terima</div>
              <Select
                value={draft?.lokasi ?? form.lokasi}
                onValueChange={(v) => {
                  const nilai = String(v);
                  if (draft) aksi?.simpanKedatangan(kartu, { ...draft, lokasi: nilai });
                  else setForm((f) => ({ ...f, lokasi: nilai }));
                }}
              >
                <SelectTrigger aria-label="Lokasi terima" className="w-full">
                  <SelectValue>
                    {(v: string) => labelDari(LOKASI_TERIMA, v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOKASI_TERIMA.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Ke Mana Barangnya</div>
              <Select
                value={draft?.sumber ?? form.sumber}
                onValueChange={(v) => {
                  const nilai = String(v);
                  if (draft) aksi?.simpanKedatangan(kartu, { ...draft, sumber: nilai });
                  else setForm((f) => ({ ...f, sumber: nilai }));
                }}
              >
                <SelectTrigger aria-label="Ke mana barangnya" className="w-full">
                  <SelectValue>
                    {(v: string) => labelDari(SUMBER_TERIMA, v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SUMBER_TERIMA.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabelPenerimaan
            baris={baris}
            sumber={sumber}
            datang={draft?.datang ?? form.datang}
            reject={draft?.reject ?? form.reject}
            onUbah={(kunci, kolom, nilai) => {
              // Dua jalur tulis yang sengaja dipisah: begitu draft-nya ada di
              // papan, tiap ketikan langsung naik ke sana — supaya angka di
              // empat kartu atas ikut bergerak saat diketik. Sebelum ada
              // draft, ketikannya masih di komponen ini, dan draft-nya baru
              // lahir saat Simpan Draft ditekan.
              const dasar: Kedatangan = draft ?? form;
              const isi = { ...(kolom === 'datang' ? dasar.datang : dasar.reject) };
              if (nilai === undefined) delete isi[kunci];
              else isi[kunci] = nilai;
              const baru =
                kolom === 'datang' ? { ...dasar, datang: isi } : { ...dasar, reject: isi };
              if (draft) aksi?.simpanKedatangan(kartu, baru);
              else setForm(baru);
            }}
          />

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Keterangan Reject <span className="font-normal">(opsional)</span>
            </div>
            <Textarea
              aria-label="Keterangan reject"
              rows={2}
              placeholder="Mis. dua pcs jahitan miring, dikembalikan ke konveksi."
              value={draft?.keterangan ?? form.keterangan}
              onChange={(e) => {
                const v = e.target.value;
                if (draft) aksi?.simpanKedatangan(kartu, { ...draft, keterangan: v });
                else setForm((f) => ({ ...f, keterangan: v }));
              }}
            />
          </div>

          {/* Bukti penerimaan. Memakai KotakBukti yang sama dengan tahap lain —
              unggah, pratinjau foto, dan buka di tab baru sudah diurus di sana,
              dan menyalinnya berarti aturan "nama kembar tidak dihitung dua
              kali" punya versi kedua yang bisa berbeda. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {jenisBukti.map((j) => (
              <KotakBukti
                key={j.id}
                jenis={j.id}
                judul={j.judul}
                keterangan={j.keterangan}
                terima={j.terima}
                sudahAda={(bukti[j.id]?.length ?? 0) > 0}
                berkas={bukti[j.id] ?? []}
                aksi={aksi}
                kartu={kartu}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Simpan Draft tidak menghitung barang sebagai masuk stok — angka di atas baru bergerak
              setelah Simpan Penerimaan.
            </p>
            <div className="flex gap-2">
              {/* Membuang draft jadi tindakan TERSENDIRI, bukan akibat sampingan
                  dari menutup formulir. Tombolnya hanya ada kalau memang ada
                  draft yang tersimpan — sebelum ini, satu-satunya cara
                  membuangnya adalah tombol silang, dan itu sekarang cuma
                  menyembunyikan. */}
              {draft && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    aksi?.hapusKedatangan(kartu, draft.urut);
                    setDraftBaru(false);
                  }}
                >
                  Buang Draft
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  // `urut` diambil dari `draft ?? urutBaru`, bukan dari `form`:
                  // formulir baru belum punya nomor sampai disimpan, dan
                  // menulis `form.urut` yang masih 0 membuat kedatangan
                  // pertamanya menimpa baris yang salah.
                  const isi: Kedatangan = {
                    ...(draft ?? form),
                    urut: draft?.urut ?? urutBaru,
                    status: 'draft',
                  };
                  aksi?.simpanKedatangan(kartu, isi);
                  setDraftBaru(false);
                }}
              >
                Simpan Draft
              </Button>
              <Button
                onClick={() => {
                  const isi: Kedatangan = {
                    ...(draft ?? form),
                    urut: draft?.urut ?? urutBaru,
                    status: 'final',
                  };
                  aksi?.simpanKedatangan(kartu, isi);
                  setDraftBaru(false);
                }}
              >
                Simpan Penerimaan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Gerbang keluar (Q9). Dua jalan, dan keduanya ditulis apa adanya di
          layar: barangnya lengkap, ATAU selisihnya sudah diputuskan. Selisih
          yang belum diputuskan menahan kartu — bukan karena angkanya kurang,
          melainkan karena tidak ada yang bisa menindaklanjuti angka yang tidak
          dijelaskan. */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Kelengkapan penerimaan</span>
          <span className="tabular-nums text-muted-foreground">
            {ringkas.masukStok}/{ringkas.plan} pcs ({ringkas.persen}%)
          </span>
        </div>
        <Progress value={ringkas.persen} className="h-2" />

        <p className="text-xs text-muted-foreground">
          {lengkap
            ? `Semua varian terpenuhi. Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
            : adaSolusi
              ? `Selisih ${ringkas.sisa} pcs sudah diputuskan (${labelDari(SOLUSI, solusi)}). Kartu boleh lanjut.`
              : `Sisa ${ringkas.sisa} pcs. Kartu boleh lanjut kalau semua varian terpenuhi, atau selisihnya sudah diputuskan di bawah.`}
        </p>

        {/* Pemutus selisih. Ditampilkan hanya saat memang ada selisih yang
            menghalangi — kalau semua varian sudah penuh, kolom ini cuma
            meminta orang mengisi sesuatu yang tidak dibutuhkan. */}
        {!lengkap && (
          <div className="grid gap-3 sm:grid-cols-2">
            <KolomTahap
              label="Solution"
              terkunci={false}
              teks={labelDari(SOLUSI, solusi)}
            >
              <Select
                value={solusi || NONE_TAHAP}
                onValueChange={(v) =>
                  aksi?.ubahTahap(kartu, 'solution', v === NONE_TAHAP ? undefined : String(v))
                }
              >
                <SelectTrigger aria-label="Solution" className="w-full">
                  <SelectValue>
                    {(v: string) =>
                      v === NONE_TAHAP ? 'Belum dipilih' : labelDari(SOLUSI, v)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_TAHAP}>Belum dipilih</SelectItem>
                  {SOLUSI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </KolomTahap>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Log Solution</div>
              <Textarea
                aria-label="Log solution"
                rows={2}
                placeholder="Mis. kekurangan 2 pcs dikirim menyusul minggu depan."
                value={tahap.logSolution ?? ''}
                onChange={(e) =>
                  aksi?.ubahTahap(kartu, 'logSolution', e.target.value || undefined)
                }
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>
            Lanjut ke {tujuan?.label ?? 'stage berikutnya'}
          </Button>
        </div>
      </div>

      {/* Riwayat kedatangan — tabel yang sama dengan mockup, termasuk kolom
          "Dicatat Oleh". */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">Riwayat Kedatangan</div>
        {kedatangan.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Belum ada barang yang datang untuk workcode ini.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs">Receipt</TableHead>
                  <TableHead className="text-xs">Tanggal</TableHead>
                  <TableHead className="text-xs">Lokasi</TableHead>
                  <TableHead className="text-right text-xs">Datang</TableHead>
                  <TableHead className="text-right text-xs">Reject</TableHead>
                  <TableHead className="text-right text-xs">Masuk Stok</TableHead>
                  <TableHead className="text-xs">Dicatat Oleh</TableHead>
                  <TableHead className="w-16 text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...kedatangan]
                  .sort((a, b) => b.urut - a.urut)
                  .map((k) => {
                    const masuk = Object.keys({ ...k.datang, ...k.reject }).reduce(
                      (s, kunci) => s + masukStokKedatangan(k, kunci),
                      0
                    );
                    const datang = Object.values(k.datang).reduce((s, n) => s + n, 0);
                    const reject = Object.values(k.reject).reduce((s, n) => s + n, 0);
                    return (
                      <TableRow key={k.urut}>
                        <TableCell className="px-3 py-2 font-mono text-xs">#{k.urut}</TableCell>
                        <TableCell className="px-3 py-2 text-xs">
                          {formatTanggal(k.tanggal)}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-xs">
                          {labelDari(LOKASI_TERIMA, k.lokasi)}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right text-xs tabular-nums">
                          {datang}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right text-xs tabular-nums">
                          {reject > 0 ? (
                            <span className="font-semibold text-destructive">{reject}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                          {masuk}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-xs">
                          {k.dicatatOleh || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              k.status === 'draft'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            )}
                          >
                            {LABEL_STATUS_TERIMA[k.status]}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}

        {draft && (
          <p className="text-xs text-muted-foreground">
            Keterangan draft: {draft.keterangan || '—'}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Tabel penerimaan per varian — kolomnya persis mockup owner.
 *
 * `Masuk Stok` dan `Sisa` TIDAK bisa diketik: keduanya turunan. Mengizinkan
 * orang mengetiknya berarti angka yang tersimpan bisa tidak sama dengan
 * `Datang − Reject`, dan tidak ada pemeriksaan yang bisa tahu mana yang benar.
 */
function TabelPenerimaan({
  baris,
  sumber,
  datang,
  reject,
  onUbah,
}: {
  baris: BarisPenerimaan[];
  sumber: SumberPapan;
  datang: Record<string, number>;
  reject: Record<string, number>;
  onUbah: (kunci: string, kolom: 'datang' | 'reject', nilai: number | undefined) => void;
}) {
  const totalDatang = baris.reduce((s, b) => s + b.datang, 0);
  const totalReject = baris.reduce((s, b) => s + b.reject, 0);
  const totalMasuk = baris.reduce((s, b) => s + b.masuk, 0);
  const totalSisa = baris.reduce((s, b) => s + b.sisa, 0);

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="text-xs">Warna</TableHead>
            <TableHead className="w-14 text-xs">Size</TableHead>
            <TableHead className="text-right text-xs">Plan</TableHead>
            <TableHead className="text-right text-xs">Sudah Datang</TableHead>
            <TableHead className="w-24 text-right text-xs">Datang Sekarang</TableHead>
            <TableHead className="w-20 text-right text-xs">Reject</TableHead>
            <TableHead className="text-right text-xs">Masuk Stok</TableHead>
            <TableHead className="text-right text-xs">Sisa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baris.map((b) => (
            <TableRow key={b.kunci}>
              <TableCell className="px-3 py-1.5 text-xs">{b.warna}</TableCell>
              <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">
                {b.ukuran}
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right text-xs tabular-nums">
                {b.plan}
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                {b.sudahDatang}
              </TableCell>
              <TableCell className="px-2 py-1">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Datang sekarang ${b.warna} ${b.ukuran}`}
                  className="h-8 text-right tabular-nums"
                  value={datang[b.kunci] ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    // Kosong DIBEDAKAN dari 0 — sama seperti input pcs di
                    // Cutting. Kosong berarti "belum diisi", 0 berarti "memang
                    // tidak ada yang datang di varian ini".
                    const mentah = e.target.value.trim();
                    if (mentah === '') {
                      onUbah(b.kunci, 'datang', undefined);
                      return;
                    }
                    const n = Number(mentah);
                    onUbah(b.kunci, 'datang', Number.isFinite(n) && n >= 0 ? n : undefined);
                  }}
                />
              </TableCell>
              <TableCell className="px-2 py-1">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Reject ${b.warna} ${b.ukuran}`}
                  className="h-8 text-right tabular-nums"
                  value={reject[b.kunci] ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const mentah = e.target.value.trim();
                    if (mentah === '') {
                      onUbah(b.kunci, 'reject', undefined);
                      return;
                    }
                    const n = Number(mentah);
                    onUbah(b.kunci, 'reject', Number.isFinite(n) && n >= 0 ? n : undefined);
                  }}
                />
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                {b.masuk}
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right text-xs tabular-nums">
                {b.sisa === 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-400">0</span>
                ) : (
                  b.sisa
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {/* Total di baris kaki, bukan di atas: yang dibaca setelah mengetik
            adalah jumlahnya, dan jumlah di atas memaksa mata bolak-balik.

            Labelnya "Total (termasuk draft)" — bukan sekadar "Total". Angka di
            baris ini ikut menghitung yang sedang diketik, sedangkan kartu
            "Sisa" di atas hanya menghitung yang sudah disimpan; tanpa penanda
            ini, dua angka berbeda di satu layar terbaca seperti salah hitung,
            dan yang dicurigai lebih dulu adalah tabelnya. */}
        <TableBody>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell colSpan={3} className="px-3 py-2 text-xs font-semibold">
              Total
              <span className="ml-1 font-normal text-muted-foreground">(termasuk draft)</span>
            </TableCell>
            <TableCell />
            <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
              {totalDatang}
            </TableCell>
            <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
              {totalReject > 0 ? (
                <span className="text-destructive">{totalReject}</span>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
              {totalMasuk}
            </TableCell>
            <TableCell className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
              {totalSisa}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {sumber === 'whitelabel' && (
        <p className="border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          Kesesuaian di papan ini diukur terhadap surat jalan vendor, bukan hasil cutting.
        </p>
      )}
    </div>
  );
}

/** Satu kartu angka di atas popup Receive. */
function KartuAngka({
  label,
  nilai,
  keterangan,
  nada = 'netral',
}: {
  label: string;
  nilai: string;
  keterangan?: string;
  nada?: 'netral' | 'hijau' | 'kuning';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        nada === 'hijau' && 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20',
        nada === 'kuning' && 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
      )}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{nilai}</div>
      {keterangan && <div className="text-[11px] text-muted-foreground">{keterangan}</div>}
    </div>
  );
}

/**
 * Tanggal ISO (`2026-09-15`) jadi `15 Sep 2026`.
 *
 * Ditulis sendiri, tidak memakai `toLocaleDateString`: string `YYYY-MM-DD`
 * diurai sebagai UTC oleh `Date`, jadi di mesin berzona +7 hasilnya bisa
 * mundur sehari — dan tanggal terima yang mundur sehari adalah kesalahan yang
 * tidak terlihat salah.
 */
function formatTanggal(iso: string): string {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!cocok) return iso || '—';
  const [, tahun, bulan, hari] = cocok;
  const nama = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ][Number(bulan) - 1];
  return `${Number(hari)} ${nama} ${tahun}`;
}

// ===== Stage yang belum punya alur =====

function SeksiBelumAda({ stage }: { stage?: StagePapan }) {
  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">Belum ada isi khusus untuk stage ini</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {stage ? `Stage ${stage.label}` : 'Stage ini'} belum punya daftar pekerjaan yang
          disepakati, jadi popupnya sengaja dikosongkan — bukan diisi dengan tampilan Propose.
          Isinya ditentukan setelah alur tiap stage dibahas dengan pemilik.
        </p>
      </div>
    </section>
  );
}

// ===== Tabel bahan (BOM) =====
//
// Satu tabel untuk dua keperluan: peninjauan di Propose (tanpa centang) dan
// kesiapan bahan di Prepare (dengan centang). Sengaja tidak dipisah — dua tabel
// berarti dua tempat yang bisa berbeda soal pembulatan angka dan urutan baris,
// dan yang paling mudah berbeda diam-diam adalah kolom "Qty / Pcs".

function TabelBahan({
  kartu,
  denganCentang = false,
  aksi,
}: {
  kartu: KartuPdff;
  denganCentang?: boolean;
  aksi?: AksiStage;
}) {
  const bahan = bahanKartu(kartu);
  const kunciSiap = new Set(aksi?.siapKartu(kartu) ?? []);
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {denganCentang && <TableHead className="w-12 text-xs">Siap</TableHead>}
            <TableHead className="text-xs">Material</TableHead>
            <TableHead className="text-xs">Variant</TableHead>
            <TableHead className="text-xs">Applies To</TableHead>
            <TableHead className="text-right text-xs">Qty / Pcs</TableHead>
            <TableHead className="text-right text-xs">Total Need</TableHead>
            <TableHead className="text-right text-xs">FIFO Sum</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bahan.map((b) => (
            <BarisBahanTabel
              key={b.kunci}
              baris={b}
              denganCentang={denganCentang}
              siap={kunciSiap.has(b.kunci)}
              onTandai={(v) => aksi?.tandaiBahan(kartu, b.kunci, v)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BarisBahanTabel({
  baris: b,
  denganCentang,
  siap,
  onTandai,
}: {
  baris: BarisBahan;
  denganCentang: boolean;
  siap: boolean;
  onTandai: (siap: boolean) => void;
}) {
  return (
    <TableRow>
      {denganCentang && (
        <TableCell className="px-3 py-2">
          <Checkbox
            checked={siap}
            aria-label={`Tandai ${b.material} ${b.berlaku} sudah dibeli`}
            onCheckedChange={(v) => onTandai(!!v)}
          />
        </TableCell>
      )}
      <TableCell className="px-3 py-2">{b.material}</TableCell>
      <TableCell className="px-3 py-2 text-muted-foreground">{b.varian}</TableCell>
      <TableCell className="px-3 py-2 text-muted-foreground">{b.berlaku}</TableCell>
      <TableCell className="px-3 py-2 text-right font-mono text-xs">{b.perPcs}</TableCell>
      <TableCell className="px-3 py-2 text-right font-mono text-xs">{b.total}</TableCell>
      <TableCell className="px-3 py-2 text-right font-mono text-xs">{b.fifo}</TableCell>
      <TableCell className="px-3 py-2">
        <BadgeStatus catatan={b.catatan ?? null} />
      </TableCell>
    </TableRow>
  );
}
