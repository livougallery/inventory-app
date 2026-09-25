import { useRef, useState } from 'react';
import { ExternalLink, FileText, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
  BerkasBukti,
  BuktiCutting,
  CuttingPcs,
  KartuPdff,
  RingkasanBahan,
  RingkasanCutting,
  SiapBahan,
  StagePapan,
} from './data-kanban';
import {
  JENIS_BUKTI_CUTTING,
  barisVarian,
  bahanKartu,
  jumlahVarian,
  ringkasBahan,
  ringkasCutting,
  skuVarian,
  totalPcs,
} from './data-kanban';

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
}

function Sel({ label, nilai }: { label: string; nilai?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{nilai || '—'}</div>
    </div>
  );
}

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
  buktiCutting,
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
  aksi: AksiStage;
  onTutup: () => void;
}) {
  if (!kartu) return null;

  return (
    <Dialog open onOpenChange={(buka) => !buka && onTutup()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-[900px]">
        <DialogHeader className="border-b px-6 py-4">
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
  siapBahan = {},
  cuttingPcs = {},
  buktiCutting = {},
  aksi,
}: {
  kartu: KartuPdff;
  stage?: StagePapan;
  stageBerikutnya?: StagePapan;
  /**
   * Apakah papan ini punya kolom Prepare. Papan White Label tidak punya, jadi
   * teks yang menjanjikan pemeriksaan bahan di Prepare harus hilang di sana —
   * bukan dibiarkan, karena popuplah yang dibaca pemilik saat presentasi.
   */
  adaPrepare?: boolean;
  siapBahan?: SiapBahan;
  cuttingPcs?: CuttingPcs;
  buktiCutting?: BuktiCutting;
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

  return (
    <div className="max-h-[calc(90vh-5rem)] space-y-6 overflow-y-auto px-6 py-5">
      <SeksiIdentitas kartu={kartu} />
      <SeksiWarnaUkuran
        kartu={kartu}
        pcs={pcs}
        varian={varian}
        adaTabelBahan={bisaApprove || bisaPrepare}
        modeCutting={bisaCutting}
        cuttingPcs={cuttingPcs[kartu.id] ?? {}}
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
        <SeksiCutting kartu={kartu} ringkas={ringkasCut} tujuan={stageBerikutnya} bukti={buktiCutting[kartu.id] ?? {}} aksi={aksi} />
      )}
      {!bisaApprove && !bisaPrepare && !bisaCutting && <SeksiBelumAda stage={stage} />}
    </div>
  );
}

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
            ? 'Satu baris mewakili satu kombinasi warna dan ukuran. Isi pcs yang benar-benar sudah dipotong.'
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
  aksi,
}: {
  kartu: KartuPdff;
  ringkas: RingkasanCutting;
  tujuan?: StagePapan;
  bukti: Record<string, BerkasBukti[]>;
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
          {ringkas.lengkap
            ? `Cutting selesai dicatat. Kartu boleh masuk ${tujuan?.label ?? 'stage berikutnya'}.`
            : 'Kartu baru bisa lanjut setelah tiap varian punya pcs cutting dan kedua bukti terunggah.'}
        </p>

        <div className="flex justify-end">
          <Button disabled={!ringkas.lengkap} onClick={() => aksi?.lanjutStage(kartu)}>
            {label}
          </Button>
        </div>
      </div>
    </section>
  );
}

function KotakBukti({
  jenis,
  judul,
  keterangan,
  terima,
  sudahAda,
  berkas,
  aksi,
  kartu,
}: {
  jenis: string;
  judul: string;
  keterangan: string;
  terima: string;
  sudahAda: boolean;
  berkas: BerkasBukti[];
  aksi?: AksiStage;
  kartu: KartuPdff;
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus ${b.nama}`}
                  onClick={() => aksi?.hapusBukti(kartu, jenis, b.nama)}
                >
                  <X />
                </Button>
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
      <Button
        variant={sudahAda ? 'outline' : 'secondary'}
        size="sm"
        className="w-full"
        onClick={() => input.current?.click()}
      >
        {sudahAda ? 'Tambah berkas lain' : 'Unggah'}
      </Button>
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
