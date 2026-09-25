import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { KartuPdff, RingkasanBahan, SiapBahan } from './data-kanban';
import { kekurangan, jumlahVarian, ringkasBahan, totalPcs } from './data-kanban';

// ===== Kartu papan =====
//
// Kartu ini sengaja TIDAK bisa di-drag. Pindahnya kartu bukan hasil menggeser,
// tapi akibat pekerjaan yang selesai — dan itu keputusan owner, bukan
// keterbatasan: menggeser kartu berarti menulis sesuatu ke database, sedangkan
// di pratinjau ini tidak ada yang bisa ditulis. `KanbanItem` karena itu tidak
// dipakai sama sekali; alasannya lengkap di `PapanFulfillment.tsx`.
//
// Badge status stok TIDAK disimpan di data — ia dihitung dari BOM lewat
// `kekurangan()`. Jadi tidak mungkin ada kartu bertanda "Ready" yang isinya
// masih kurang.

/**
 * Badge status bahan. Warnanya mengikuti `badgeVariants` dari shadcn supaya
 * senada dengan badge lain di aplikasi, tapi elemennya `<span>`, bukan
 * `<Badge>` bawaan.
 *
 * Alasannya bukan selera: `Badge` bawaan merender `<div>`, dan badge ini hidup
 * di dalam kartu yang seluruhnya satu elemen `<button>` — `<div>` di dalam
 * `<button>` bukan HTML yang sah. `IsiPopup` memakai komponen yang sama di
 * dalam sel tabel, jadi satu bentuk yang aman di kedua tempat.
 */
export function BadgeStatus({ catatan }: { catatan: string | null }) {
  return (
    <span
      className={cn(
        badgeVariants({ variant: catatan ? 'destructive' : 'secondary' }),
        'w-fit border-transparent px-2 py-0.5 text-[11px]',
        // "Ready" ditahan hijau seperti mockup owner — varian `secondary`
        // bawaan berwarna kelabu, dan di papan yang penuh kartu, hijau yang
        // tegas lebih cepat terbaca daripada kelabu.
        //
        // Warna hover-nya ditulis ULANG, bukan dibiarkan mewarisi
        // `hover:bg-secondary/80` dari varian. Tanpa itu, mengarahkan kursor ke
        // badge "Ready" mengubah latarnya jadi kelabu sementara teksnya tetap
        // hijau — kebalikan dari alasan hijau itu dipilih. `tailwind-merge`
        // tidak menyelesaikannya sendiri: `bg-green-100` dan
        // `hover:bg-secondary/80` beda varian, jadi keduanya ikut terpasang dan
        // yang menang saat hover adalah aturan variannya.
        !catatan &&
          'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-950'
      )}
    >
      {catatan ? `Not Enough — ${catatan}` : 'Ready'}
    </span>
  );
}

/**
 * Badge kesiapan bahan untuk kartu yang sedang di stage Prepare.
 *
 * Bedanya dengan `BadgeStatus` penting: `BadgeStatus` menjawab "stoknya cukup
 * atau tidak", badge ini menjawab "barangnya sudah dibeli atau belum". Di stage
 * Prepare yang menentukan kartu boleh jalan adalah yang kedua.
 */
export function BadgeSiap({ ringkas }: { ringkas: RingkasanBahan }) {
  return (
    <span
      className={cn(
        badgeVariants({ variant: 'secondary' }),
        'w-fit border-transparent px-2 py-0.5 text-[11px]',
        // Sama seperti `BadgeStatus`: warna hover ditulis ulang supaya override
        // warnanya tidak hilang saat kursor melintas.
        ringkas.lengkap
          ? 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-950'
          : 'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-950'
      )}
    >
      {ringkas.lengkap ? 'Bahan siap semua' : `Bahan ${ringkas.siap}/${ringkas.total} siap`}
    </span>
  );
}

function IsiKartu({
  kartu,
  stageId,
  siapBahan,
}: {
  kartu: KartuPdff;
  /** Stage tempat kartu ini SEDANG berada, bukan stage bawaannya. */
  stageId: string;
  siapBahan?: SiapBahan;
}) {
  const pcs = totalPcs(kartu);
  const varian = jumlahVarian(kartu);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm leading-tight font-semibold">{kartu.productName}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{kartu.brand}</span>
      </div>

      <div className="font-mono text-[11px] leading-tight break-all text-muted-foreground">
        {kartu.workcode}
      </div>

      <div className="text-[11px] text-muted-foreground">
        Batch {kartu.batch} • {kartu.kategoriVendor} • {kartu.namaVendor}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <div>
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Plan Qty</div>
          <div className="text-sm font-semibold tabular-nums">{pcs} PCS</div>
        </div>
        <div>
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Variations</div>
          <div className="text-sm font-semibold tabular-nums">{varian} rows</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {stageId === 'prepare' && siapBahan ? (
          // Di Prepare yang perlu terlihat dari papan adalah progres membeli
          // bahannya, bukan status stok. Rinciannya ada di popup, per baris.
          //
          // Yang dipakai `stageId` — stage tempat kartu SEDANG berada — bukan
          // `kartu.stage`. Kartu yang baru di-approve masih membawa stage
          // bawaan `propose`, jadi memakai field itu akan menampilkan badge
          // stok di kolom Prepare, dan progres bahannya tidak pernah terlihat.
          <BadgeSiap ringkas={ringkasBahan(kartu, siapBahan)} />
        ) : (
          <BadgeStatus catatan={kekurangan(kartu)} />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">Request {kartu.dateRequest}</span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
            {kartu.inisial}
          </span>
          <span className="text-[11px] text-muted-foreground">{kartu.pic}</span>
        </span>
      </div>
    </>
  );
}

export default function KartuFulfillment({
  kartu,
  stageId,
  siapBahan,
  onBuka,
}: {
  kartu: KartuPdff;
  stageId: string;
  siapBahan?: SiapBahan;
  onBuka: (kartu: KartuPdff) => void;
}) {
  return (
    <button
      type="button"
      data-slot="kartu-fulfillment"
      data-kartu={kartu.id}
      onClick={() => onBuka(kartu)}
      aria-label={`Buka detail ${kartu.productName}`}
      className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <IsiKartu kartu={kartu} stageId={stageId} siapBahan={siapBahan} />
    </button>
  );
}
