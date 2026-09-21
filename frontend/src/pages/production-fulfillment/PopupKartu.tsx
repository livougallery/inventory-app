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
import type { KartuPdff, StagePapan } from './data-kanban';
import {
  bahanKartu,
  jumlahVarian,
  skuVarian,
  totalPcs,
} from './data-kanban';

// ===== Popup detail kartu =====
//
// Tiga seksi, sesuai keputusan owner: informasi produk & proposal, rencana
// warna & ukuran, lalu kebutuhan bahan (BOM). Semuanya diturunkan dari
// `kartu.detail` — tidak ada angka yang diketik ulang di sini.

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

export default function PopupKartu({
  kartu,
  stage,
  onTutup,
}: {
  kartu: KartuPdff | null;
  stage: StagePapan | undefined;
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
            Production proposal • {kartu.workcode}
          </DialogDescription>
        </DialogHeader>
        <IsiPopup kartu={kartu} />
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
 * dan diperiksa tanpa browser. Kalau menyatu, satu-satunya cara memeriksanya
 * adalah membukanya manual di browser, satu kartu demi satu kartu.
 */
export function IsiPopup({ kartu }: { kartu: KartuPdff }) {
  const { detail } = kartu;
  const pcs = totalPcs(kartu);
  const varian = jumlahVarian(kartu);
  const bahan = bahanKartu(kartu);

  return (
    <div className="max-h-[calc(90vh-5rem)] space-y-6 overflow-y-auto px-6 py-5">
          {/* ── Seksi 1 ────────────────────────────────────────────── */}
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

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
              Product and new variations will be registered automatically when this
              proposal is approved.
            </div>
          </section>

          {/* ── Seksi 2 ────────────────────────────────────────────── */}
          <section className="space-y-3">
            <JudulSeksi
              judul="Color & Size Plan"
              keterangan="Satu baris mewakili satu kombinasi warna dan ukuran. Kesiapan bahan diperiksa di tabel bawah."
            />

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs">Color</TableHead>
                    <TableHead className="text-xs">Variant SKU</TableHead>
                    <TableHead className="text-right text-xs">Plan Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.warna.flatMap((w) =>
                    w.pcs.map((p) => (
                      <TableRow key={`${w.kode}-${p.ukuran}`}>
                        <TableCell className="px-3 py-2">{w.nama}</TableCell>
                        <TableCell className="px-3 py-2 font-mono text-xs">
                          {skuVarian(kartu, w.kode, p.ukuran)}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right tabular-nums">
                          {p.qty} pcs
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">{varian} variation rows</span>
              <span className="font-semibold tabular-nums">Total plan {pcs} PCS</span>
            </div>
          </section>

          {/* ── Seksi 3 ────────────────────────────────────────────── */}
          <section className="space-y-3">
            <JudulSeksi
              judul="Material Requirements (BOM)"
              keterangan={`Dihitung dari ${pcs} rencana pcs. Stok diperiksa terhadap persediaan FIFO yang tersedia.`}
            />

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                  {bahan.map((b, i) => (
                    <TableRow key={`${b.material}-${b.varian}-${i}`}>
                      <TableCell className="px-3 py-2">{b.material}</TableCell>
                      <TableCell className="px-3 py-2 text-muted-foreground">
                        {b.varian}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-muted-foreground">
                        {b.berlaku}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs">
                        {b.perPcs}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs">
                        {b.total}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs">
                        {b.fifo}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <BadgeStatus catatan={b.catatan ?? null} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
    </div>
  );
}
