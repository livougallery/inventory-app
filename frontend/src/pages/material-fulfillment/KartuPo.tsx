import { cn } from '@/lib/utils';
import type { KartuPo, RingkasanDatang } from './data-po';
import { total } from './data-po';

// ===== Kartu papan =====
//
// Sama seperti kartu Production Fulfillment, kartu ini TIDAK bisa di-drag.
// Pindahnya kartu bukan hasil menggeser, tapi akibat pekerjaan yang selesai —
// dan menggeser berarti menulis sesuatu ke database, sedangkan di pratinjau ini
// tidak ada yang bisa ditulis.
//
// Yang ditampilkan di papan adalah angka yang PALING sering dicari tanpa harus
// membuka kartu: vendor, berapa material, berapa harga. Workcode sengaja tidak
// dijadikan judul — satu PO bisa punya beberapa workcode, dan bastion tiga
// baris kode di kartu akan membuatnya jauh lebih tinggi dari kartu lain di
// kolom yang sama.

export function BadgeDatang({ ringkas }: { ringkas: RingkasanDatang }) {
  if (ringkas.totalBaris === 0) return null;

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center border-transparent px-2 py-0.5 text-[11px] font-medium',
        ringkas.lengkap
          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
      )}
    >
      {ringkas.lengkap
        ? 'Semua material datang'
        : `Material datang ${ringkas.sudah}/${ringkas.totalBaris}`}
    </span>
  );
}

export default function Kartu({
  kartu,
  ringkas,
  onBuka,
}: {
  kartu: KartuPo;
  ringkas: RingkasanDatang;
  onBuka: (kartu: KartuPo) => void;
}) {
  const jumlahMaterial = kartu.items.length;
  const jumlahWorkcode = kartu.workcodes.length;

  return (
    <button
      type="button"
      data-slot="kartu-po"
      data-kartu={kartu.id}
      onClick={() => onBuka(kartu)}
      aria-label={`Buka detail ${kartu.noPo} untuk ${kartu.vendor}`}
      className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm leading-tight font-semibold break-all">
          {kartu.noPo}
        </span>
        {kartu.fotoNota && (
          <span className="shrink-0 text-[10px] text-muted-foreground">Nota</span>
        )}
      </div>

      {/* Vendor adalah inti halaman ini. Satu kartu satu vendor — itu yang
          memisahkan papan ini dari form pembelian lama, dan karena itu ia
          mengisi baris paling atas, bukan workcode. */}
      <div className="text-sm leading-tight font-medium">{kartu.vendor}</div>

      <div className="text-[11px] text-muted-foreground">
        {kartu.kategori === 'kain' ? 'Kain' : kartu.kategori === 'cmt_cost' ? 'Product Fulfillment' : 'Aksesoris'}
        {kartu.jenis ? ` • ${kartu.jenis}` : ''}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <div>
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Material
          </div>
          <div className="text-sm font-semibold tabular-nums">{jumlahMaterial} item</div>
        </div>
        <div>
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Workcode
          </div>
          <div className="text-sm font-semibold tabular-nums">{jumlahWorkcode}</div>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 border-t pt-2">
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Total</span>
        <span className="text-sm font-semibold tabular-nums">
          Rp {total(kartu).toLocaleString('id-ID')}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <BadgeDatang ringkas={ringkas} />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">{kartu.tglPo}</span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
            {kartu.inisial}
          </span>
          <span className="text-[11px] text-muted-foreground">{kartu.pic}</span>
        </span>
      </div>
    </button>
  );
}
