import { useState } from 'react';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
} from '@/components/reui/kanban';
import KartuFulfillment from './KartuFulfillment';
import PopupKartu from './PopupKartu';
import type { KartuPdff, StagePapan } from './data-kanban';

// ===== Papan Kanban =====
//
// Delapan kolom sejajar, lebih lebar dari layar, jadi digulir horizontal.
// Satu kolom = satu tahap. Itu sebabnya papan ini tidak punya baris tab:
// kalau tahap jadi tab, yang terlihat hanya satu kolom terisi dan tujuh kolom
// kosong — dan gunanya papan (melihat sebaran sekaligus) hilang.
//
// Lebar kolom 280px. Di ruang konten ~1600px itu berarti ~5 kolom terlihat,
// sisanya digulir. Angka di header kolom yang memberi tahu sisanya ada berapa.
//
// DRAG SENGAJA TIDAK DIPASANG — dan itu bukan sekadar tidak memanggil
// `KanbanItemHandle`. `KanbanItem` sendiri tidak dipakai, karena komponen itu
// memasang `role="button"`, `tabindex="0"`, dan `aria-roledescription="sortable"`
// pada pembungkusnya. Akibatnya, di dalamnya lahir dua masalah sekaligus:
// tombol di dalam tombol (HTML yang tidak sah), dan dua perhentian Tab per
// kartu — satu di antaranya mengumumkan "sortable" padahal tidak ada yang bisa
// digeser, dan tidak melakukan apa pun saat ditekan Enter.
//
// Karena itu kartunya berdiri sendiri: satu elemen `<button>` yang benar-benar
// membuka popup, satu perhentian Tab, dan tidak ada janji drag yang tidak ada.
// `Kanban`/`KanbanBoard`/`KanbanColumn`/`KanbanColumnContent` tetap dipakai
// untuk tata letaknya. `KanbanOverlay` juga tidak dipakai: lapisan bayangan itu
// hanya muncul saat ada yang diseret, dan tidak ada yang bisa diseret.

export default function PapanFulfillment({
  stages,
  kartu,
}: {
  stages: StagePapan[];
  kartu: KartuPdff[];
}) {
  const [terbuka, setTerbuka] = useState<KartuPdff | null>(null);

  const kolom = Object.fromEntries(
    stages.map((s) => [s.id, kartu.filter((k) => k.stage === s.id)])
  ) as Record<string, KartuPdff[]>;

  const stageDari = (id: string) => stages.find((s) => s.id === id);

  return (
    <>
      {/* `onValueChange` sengaja kosong: tidak ada yang bisa dipindahkan, jadi
          tidak ada perubahan susunan yang perlu disimpan. Prop ini tetap
          dioper karena `Kanban` mensyaratkannya. */}
      <Kanban value={kolom} onValueChange={() => {}} getItemValue={(k) => k.id}>
        {/* `sm:grid-cols-none` wajib ada, meski kelihatannya mubazir.
            Bawaan komponennya `grid auto-rows-fr gap-4 sm:grid-cols-3` —
            papan 3 kolom. `flex` di bawah ini menang atas `grid`, tapi
            `sm:grid-cols-3` TIDAK ikut terhapus: tailwind-merge hanya
            menyelesaikan konflik dalam bucket yang sama, dan varian `sm:`
            dianggap terpisah. Sekarang ia tidak berpengaruh (template kolom
            tidak berlaku pada flex), tapi begitu seseorang menghapus `flex`,
            papan langsung berubah jadi 3 kolom tanpa ada yang menyadarinya.
            Karena itu dimatikan terang-terangan. */}
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
                  <span className="truncate text-xs font-semibold">{s.label}</span>
                  <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {isi.length}
                  </span>
                </div>

                <KanbanColumnContent value={s.id} className="min-h-[140px] gap-2 px-2 pb-2">
                  {isi.map((k) => (
                    <KartuFulfillment key={k.id} kartu={k} onBuka={setTerbuka} />
                  ))}
                </KanbanColumnContent>
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      </Kanban>

      <PopupKartu
        kartu={terbuka}
        stage={terbuka ? stageDari(terbuka.stage) : undefined}
        onTutup={() => setTerbuka(null)}
      />
    </>
  );
}
