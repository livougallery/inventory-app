import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
} from '@/components/reui/kanban';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Kartu from './KartuPo';
import PopupPo, { type AksiPo } from './PopupPo';
import type { KartuPo, StagePapan } from './data-po';
import { ringkasDatang, stageKartu, stageSetelah } from './data-po';

// ===== Papan Kanban Material Fulfillment =====
//
// Lima kolom sejajar, lebar 280px, digulir horizontal — pola yang sama dengan
// papan Production Fulfillment, dan alasannya sama: satu kolom = satu tahap,
// jadi yang berguna adalah melihat sebaran kartu sekaligus.
//
// DRAG SENGAJA TIDAK DIPASANG, sama seperti papan production: pindahan kartu di
// sini akibat pekerjaan yang selesai, bukan pilihan, dan `KanbanItem` memasang
// `role="button"` + `aria-roledescription="sortable"` pada pembungkusnya — dua
// perhentian Tab per kartu dan janji seret yang tidak ada. `Kanban`,
// `KanbanBoard`, `KanbanColumn`, dan `KanbanColumnContent` tetap dipakai untuk
// tata letaknya.
//
// SEMUA STATE-nya dipegang oleh halaman (`MaterialFulfillment.tsx`), bukan di
// sini. Alasannya bukan kerapian: tab "Daftar PO" menampilkan data yang sama,
// dan kalau stage + centang "datang" hidup di dalam papan, memindahkan kartu di
// papan tidak mengubah apa yang tertulis di tabel — dua tampilan satu data,
// tapi salah satunya diam.

export interface StatePapanPo {
  /** Stage hasil perpindahan, per id kartu. */
  pindah: Record<string, string>;
  /** Kunci item yang dicentang, per id kartu. */
  datang: Record<string, string[]>;
  /** Kartu hasil suntingan popup, per id kartu. */
  sunting: Record<string, KartuPo>;
  /** Id kartu yang popunya terbuka. */
  terbukaId: string | null;
}

export default function PapanPo({
  stages,
  kartu,
  state,
  aksi,
}: {
  stages: StagePapan[];
  kartu: KartuPo[];
  state: StatePapanPo;
  aksi: AksiPo;
}) {
  const { pindah, datang, sunting, terbukaId } = state;

  // Kartu bawaan + hasil suntingan popup. Kartu BARU dari form belum dibuat —
  // tombol "Pembelian Material" sudah ada di kolom Proposed (owner, 28 Sep),
  // tapi formnya menyusul setelah alurnya disepakati; `aksi.buat` sengaja
  // kosong selama itu, bukan membuat kartu kosong yang diam.
  const semua = useMemo(() => kartu.map((k) => sunting[k.id] ?? k), [kartu, sunting]);

  const kolom = useMemo(
    () =>
      Object.fromEntries(
        stages.map((s) => [
          s.id,
          semua.filter((k) => stageKartu(k.id, semua, pindah, stages) === s.id),
        ])
      ) as Record<string, KartuPo[]>,
    [stages, semua, pindah]
  );

  const kartuTerbuka = terbukaId ? semua.find((k) => k.id === terbukaId) : undefined;
  const stageTerbuka = kartuTerbuka
    ? stages.find((s) => s.id === stageKartu(kartuTerbuka.id, semua, pindah, stages))
    : undefined;
  const stageSetelahTerbuka = stageTerbuka ? stageSetelah(stages, stageTerbuka.id) : undefined;

  return (
    <>
      {/* `onValueChange` sengaja kosong: tidak ada yang bisa dipindahkan dengan
          drag, jadi tidak ada perubahan susunan yang perlu disimpan. Prop ini
          tetap dioper karena `Kanban` mensyaratkannya. */}
      <Kanban value={kolom} onValueChange={() => {}} getItemValue={(k) => k.id}>
        {/* `sm:grid-cols-none` wajib ada, sama seperti papan production.
            Bawaan komponennya papan 3 kolom; `flex` di bawah menang atas
            `grid`, tapi varian `sm:` tidak ikut terhapus oleh tailwind-merge.
            Tanpa dimatikan, begitu seseorang menghapus `flex`, papan langsung
            berubah jadi 3 kolom tanpa ada yang menyadarinya. */}
        <KanbanBoard className="flex items-start gap-3 overflow-x-auto pb-4 sm:grid-cols-none">
          {stages.map((s) => {
            const isi = kolom[s.id] ?? [];
            return (
              <KanbanColumn
                key={s.id}
                value={s.id}
                className="w-[280px] shrink-0 gap-0 rounded-xl border bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {/* Titik warna tahap — ReUI tidak mewarnai kolomnya sendiri,
                        dan contoh resminya pun menambahkan penanda per kolom. */}
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', s.warna)}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs font-semibold">{s.label}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {isi.length}
                  </span>
                </div>

                {/* PO baru dibuat dari kolom Proposed — di situlah usulan
                    lahir, dan di situlah ia harus dimulai. Tombolnya TEPAT DI
                    BAWAH judul kolom, di atas kartu, bukan di bawah deretan
                    kartu: di bawah, ia ikut ter-scroll bersama kartu dan
                    menghilang ke bawah layar begitu kolomnya panjang — persis
                    di saat kolom itu paling butuh diisi. Sama dengan tombol
                    "Tambah Produksi" di papan Production Fulfillment. */}
                {s.id === 'diajukan' && (
                  <div className="px-2 pb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start border border-dashed text-muted-foreground"
                      onClick={aksi.buat}
                    >
                      <Plus /> Pembelian Material
                    </Button>
                  </div>
                )}

                <KanbanColumnContent value={s.id} className="min-h-[140px] gap-2 px-2 pb-2">
                  {isi.map((k) => (
                    <Kartu
                      key={k.id}
                      kartu={k}
                      ringkas={ringkasDatang(k.id, k.items, datang)}
                      onBuka={(kartuDibuka) => aksi.buka(kartuDibuka.id)}
                    />
                  ))}

                  {isi.length === 0 && (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      Belum ada PO di tahap ini.
                    </p>
                  )}
                </KanbanColumnContent>
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      </Kanban>

      <PopupPo
        kartu={kartuTerbuka ?? null}
        stage={stageTerbuka}
        stageBerikutnya={stageSetelahTerbuka}
        onstageDatang={datang}
        aksi={aksi}
        onTutup={() => aksi.tutup()}
      />
    </>
  );
}
