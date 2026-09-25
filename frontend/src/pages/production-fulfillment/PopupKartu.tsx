import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { BarisBahan, KartuPdff, RingkasanBahan, SiapBahan, StagePapan } from './data-kanban';
import {
  bahanKartu,
  jumlahVarian,
  ringkasBahan,
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
  aksi?: AksiStage;
}) {
  const pcs = totalPcs(kartu);
  const varian = jumlahVarian(kartu);
  const ringkas = ringkasBahan(kartu, siapBahan);

  const stageId = stage?.id;
  const bisaApprove = stageId === 'propose';
  const bisaPrepare = stageId === 'prepare';

  return (
    <div className="max-h-[calc(90vh-5rem)] space-y-6 overflow-y-auto px-6 py-5">
      <SeksiIdentitas kartu={kartu} />
      <SeksiWarnaUkuran kartu={kartu} pcs={pcs} varian={varian} adaTabelBahan={bisaApprove || bisaPrepare} />

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
      {!bisaApprove && !bisaPrepare && <SeksiBelumAda stage={stage} />}
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

// ===== Blok rencana warna & ukuran (sama di semua stage) =====
//
// Lebar kolomnya dipatok, bukan dibiarkan meregang. Sebelumnya tabel ini
// `table-auto` selebar dialog: dengan tiga kolom tanpa lebar, "Variant SKU"
// berakhir di tengah dan "Plan Qty" terdorong ke ujung kanan, sehingga dua
// angka yang seharusnya dibaca berdampingan terpisah setengah layar. Sisa
// lebarnya kini diisi kolom porsi, bukan dibiarkan kosong.

function SeksiWarnaUkuran({
  kartu,
  pcs,
  varian,
  adaTabelBahan,
}: {
  kartu: KartuPdff;
  pcs: number;
  varian: number;
  /**
   * Apakah popup ini juga menampilkan tabel BOM di bawah. Hanya Propose dan
   * Prepare yang punya — enam stage lain isinya sengaja dikosongkan.
   *
   * Tanpa penjagaan ini, popup Cutting/Receive/Upload menulis "Kesiapan bahan
   * diperiksa di tabel bawah" tepat di atas panel yang berbunyi "Belum ada isi
   * khusus untuk stage ini": janji yang tidak ada tabelnya, di layar yang
   * dibaca pemilik saat presentasi.
   */
  adaTabelBahan: boolean;
}) {
  const baris = kartu.detail.warna.flatMap((w) =>
    w.pcs.map((p) => ({ warna: w.nama, kode: w.kode, ukuran: p.ukuran, qty: p.qty }))
  );

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="Color & Size Plan"
        keterangan={
          adaTabelBahan
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
              <TableHead className="w-24 text-right text-xs">Plan Qty</TableHead>
              <TableHead className="w-32 text-xs">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {baris.map((b) => {
              const persen = pcs > 0 ? Math.round((b.qty / pcs) * 100) : 0;
              return (
                <TableRow key={`${b.kode}-${b.ukuran}`}>
                  <TableCell className="px-3 py-2">{b.warna}</TableCell>
                  <TableCell className="px-3 py-2 text-muted-foreground">{b.ukuran}</TableCell>
                  <TableCell className="truncate px-3 py-2 font-mono text-xs">
                    {skuVarian(kartu, b.kode, b.ukuran)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">{b.qty} pcs</TableCell>
                  <TableCell className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-foreground/40"
                          style={{ width: `${persen}%` }}
                        />
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {persen}%
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-muted-foreground">{varian} variation rows</span>
        <span className="font-semibold tabular-nums">Total plan {pcs} PCS</span>
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
