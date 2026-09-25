import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
} from '@/components/reui/kanban';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import KartuFulfillment from './KartuFulfillment';
import PopupKartu, { type AksiStage } from './PopupKartu';
import FormProduksiBaru from './FormProduksiBaru';
import type { DataProduksiBaru, KartuPdff, SiapBahan, StagePapan } from './data-kanban';
import { kartuBaru, stageKartu, stageSetelah } from './data-kanban';

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
//
// PINDAH STAGE lewat popup, bukan lewat geser: approve di Propose, dan tombol
// lanjut di Prepare setelah semua bahan dicentang. Papan menyimpan
// perpindahannya di state; lihat `pindah` di bawah.

export default function PapanFulfillment({
  stages,
  kartu,
  sumber,
}: {
  stages: StagePapan[];
  kartu: KartuPdff[];
  /** Papan mana yang sedang dibuka — menentukan daftar kategori vendor di form. */
  sumber: 'production' | 'whitelabel';
}) {
  const [terbukaId, setTerbukaId] = useState<string | null>(null);
  const [kartuTambahan, setKartuTambahan] = useState<KartuPdff[]>([]);
  const [pindah, setPindah] = useState<Record<string, string>>({});
  const [siapBahan, setSiapBahan] = useState<SiapBahan>({});
  const [formTerbuka, setFormTerbuka] = useState(false);

  // Kartu bawaan + kartu yang baru ditambahkan lewat form.
  const semua = useMemo(() => [...kartu, ...kartuTambahan], [kartu, kartuTambahan]);

  const kolom = useMemo(
    () =>
      Object.fromEntries(
        stages.map((s) => [
          s.id,
          semua.filter((k) => stageKartu(k.id, semua, pindah, stages) === s.id),
        ])
      ) as Record<string, KartuPdff[]>,
    [stages, semua, pindah]
  );

  const kartuTerbuka = terbukaId ? semua.find((k) => k.id === terbukaId) : undefined;
  const stageTerbuka = kartuTerbuka
    ? stages.find((s) => s.id === stageKartu(kartuTerbuka.id, semua, pindah, stages))
    : undefined;
  const stageSetelahTerbuka = stageTerbuka ? stageSetelah(stages, stageTerbuka.id) : undefined;

  const aksi: AksiStage = {
    approve: (k) => {
      // Tujuan diambil dari urutan kolom papan, bukan ditulis 'prepare': papan
      // White Label tidak punya Prepare, kolom setelah Propose di sana Invoice
      // Logistic. Menulis 'prepare' di sini membuat kartunya lenyap dari papan
      // begitu di-approve — tanpa error.
      const tujuan = stageSetelah(stages, 'propose');
      if (tujuan) setPindah((lama) => ({ ...lama, [k.id]: tujuan.id }));
      setTerbukaId(null);
    },
    lanjutStage: (k) => {
      // Sama: tujuan selalu kolom berikutnya DI PAPAN INI. Di papan White Label
      // kolom setelah Prepare tidak ada — kartunya langsung dari Propose ke
      // Invoice Logistic.
      const sekarang = stageKartu(k.id, semua, pindah, stages);
      const tujuan = stageSetelah(stages, sekarang);
      if (tujuan) setPindah((lama) => ({ ...lama, [k.id]: tujuan.id }));
      setTerbukaId(null);
    },
    tandaiBahan: (k, kunci, siap) => {
      setSiapBahan((lama) => {
        const sekarang = new Set(lama[k.id] ?? []);
        if (siap) sekarang.add(kunci);
        else sekarang.delete(kunci);
        return { ...lama, [k.id]: [...sekarang] };
      });
    },
    siapKartu: (k) => siapBahan[k.id] ?? [],
  };

  function tambahProduksi(data: DataProduksiBaru) {
    // Nomor kartu baru diambil dari yang terbesar + 1, bukan dari jumlah kartu:
    // jumlahnya tidak pernah turun, jadi id bisa terpakai dua kali begitu ada
    // kartu yang dihapus.
    const nomorBaru =
      semua.reduce((maks, k) => {
        const n = Number(k.id.replace(/^b-/, ''));
        return Number.isFinite(n) ? Math.max(maks, n) : maks;
      }, 0) + 1;
    setKartuTambahan((lama) => [...lama, kartuBaru(`b-${nomorBaru}`, data, sumber)]);
  }

  return (
    <>
      {/* `onValueChange` sengaja kosong: tidak ada yang bisa dipindahkan dengan
          drag, jadi tidak ada perubahan susunan yang perlu disimpan. Prop ini
          tetap dioper karena `Kanban` mensyaratkannya. */}
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
                  <span className="flex min-w-0 items-center gap-2">
                    {/* Titik warna tahap. ReUI tidak mewarnai kolomnya sendiri —
                        contoh resminya pun menambahkan penanda seperti ini per
                        kolom — jadi warna dipasang di sini, bukan di komponen
                        registry yang akan tertimpa saat diperbarui. */}
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

                <KanbanColumnContent value={s.id} className="min-h-[140px] gap-2 px-2 pb-2">
                  {isi.map((k) => (
                    <KartuFulfillment
                      key={k.id}
                      kartu={k}
                      stageId={s.id}
                      siapBahan={siapBahan}
                      onBuka={(kartuDibuka) => setTerbukaId(kartuDibuka.id)}
                    />
                  ))}

                  {/* Usulan produksi baru dibuat dari kolom Propose — di situlah
                      usulan lahir. Tombolnya di dalam kolom, bukan di toolbar
                      halaman: pemilik yang melihat kolom kosong langsung tahu
                      caranya mengisi, tanpa harus tahu dulu ada toolbar. */}
                  {s.id === 'propose' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start border border-dashed text-muted-foreground"
                      onClick={() => setFormTerbuka(true)}
                    >
                      <Plus /> Tambah Produksi
                    </Button>
                  )}

                  {isi.length === 0 && s.id !== 'propose' && (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      Belum ada kartu di tahap ini.
                    </p>
                  )}
                </KanbanColumnContent>
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      </Kanban>

      <PopupKartu
        kartu={kartuTerbuka ?? null}
        stage={stageTerbuka}
        stageBerikutnya={stageSetelahTerbuka}
        adaPrepare={stages.some((s) => s.id === 'prepare')}
        sumber={sumber}
        siapBahan={siapBahan}
        aksi={aksi}
        onTutup={() => setTerbukaId(null)}
      />

      <FormProduksiBaru
        terbuka={formTerbuka}
        sumber={sumber}
        tujuanApprove={stageSetelah(stages, 'propose')?.label}
        onTutup={() => setFormTerbuka(false)}
        onSimpan={(data) => {
          tambahProduksi(data);
          setFormTerbuka(false);
        }}
      />
    </>
  );
}
