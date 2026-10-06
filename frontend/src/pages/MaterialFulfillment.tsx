import { useMemo, useState } from 'react';
import BannerPratinjau from '@/components/BannerPratinjau';
import TabelPratinjau, { type KolomPratinjau } from '@/components/TabelPratinjau';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PapanPo, { type StatePapanPo } from './material-fulfillment/PapanPo';
import FormPoBaru from './material-fulfillment/FormPoBaru';
import type { AksiPo } from './material-fulfillment/PopupPo';
import type { KartuPo, StagePapan } from './material-fulfillment/data-po';
import {
  KARTU_PO,
  PAPAN_PO,
  kartuBaru,
  ringkasDatang,
  stageKartu,
} from './material-fulfillment/data-po';

// ===== Halaman Material Fulfillment: PROGRESS > Material Fulfillment =====
//
// Dua tampilan, satu data:
//
//   - PAPAN menjawab "PO mana yang sedang di tahap mana" — dibaca sambil
//     bergerak, sering, dan yang penting justru sebarannya.
//   - DAFTAR PO menjawab "udah dikirim belum vendor X?" — pertanyaan yang
//     paling sering muncul setiap hari, dan sifatnya melintas kolom. Papan
//     menjawabnya buruk: mata harus menyapu mendatar lima kartu di lima kolom
//     untuk tahu jawabannya. Tabel menjawabnya dalam satu baris.
//
// Karena itu STATE-nya dipegang halaman ini, bukan di dalam papan. Kalau
// `pindah` dan `datang` hidup di PapanPo, memindahkan kartu di papan tidak
// mengubah apa yang tertulis di tabel — dua tampilan satu data, tapi salah
// satunya menampilkan angka basi. State yang sama juga yang membuat satu PO
// yang sama bisa dibuka dari papan maupun dari tabel.

/** Bentuk baris tabel: kartu PO + turunannya yang sudah dihitung. */
interface BarisPo extends KartuPo {
  stage_label: string;
  material: string;
  workcode: string;
  /** "sudah/total" — disimpan sbg teks supaya kolom bisa menampilkannya. */
  datang: string;
  total_po: number;
}

/**
 * Label tahap untuk kolom "Stage" di tab "Daftar PO".
 *
 * Dipisah dari komponen supaya HANYA ADA SATI definisi yang bisa diuji.
 * Sebelumnya ekspresinya ditulis inline di dalam `useMemo`, dan smoke test
 * menulis ulang salinannya sendiri lalu memeriksa salinan itu — hasilnya hijau
 * walau komponennya masih berbahasa Indonesia (28 Sep). Smoke test sekarang
 * mengimpor fungsi ini, bukan meniruinya.
 *
 * Fallback-nya label kolom pertama, jadi ia ikut bahasa label yang lain:
 * kartu yang stage-nya tidak ada di papan akan tampil "Proposed", bukan
 * "Diajukan" sendirian di tengah tabel yang sisanya Bahasa Inggris.
 */
export function labelStage(
  id: string,
  semua: KartuPo[],
  pindah: Record<string, string>,
  stages: StagePapan[]
): string {
  // Catatan: cabang "??" di bawah praktis tak terjangkau. stageKartu()
  // selalu mengembalikan id yang ada di stages (kalau tidak, stages[0].id),
  // jadi find() selalu berhasil. Menulis test yang mengubah fallback ini
  // menjadi "Diajukan" lalu berharap check-nya merah tidak berhasil — check
  // itu hijau apa adanya (mutasi 8 dan 9, 28 Sep). Yang bisa diuji cuma
  // stages kosong, yang mengembalikan "-".
  return (
    stages.find((s) => s.id === stageKartu(id, semua, pindah, stages))?.label ?? stages[0]?.label ?? '-'
  );
}

/**
 * Gabung tiga sumber kartu jadi satu daftar: contoh bawaan, hasil form
 * "Pembelian Material", dan hasil suntingan popup.
 *
 * Suntingan menang atas kartu aslinya — popup menyunting kartu yang sudah ada,
 * bukan membuat kartu baru. Kartu hasil form TIDAK punya `sunting` sampai popup
 * menyimpan, dan itu benar: ia sudah utuh sejak form ditutup.
 *
 * Dipisah dari komponen dan DI-EKSPOR supaya smoke test memakai definisi yang
 * sama. Ini akar bug "tombol Pembelian Material diam": `semua` dulu hanya
 * diturunkan dari `KARTU_PO`, sehingga kartu hasil form tidak punya tempat
 * muncul. Kalau test menulis ulang `[...KARTU_PO, ...baru]` di dalam dirinya,
 * test itu lulus walau kodenya masih salah (28 Sep).
 */
export function gabungKartu(
  bawaan: KartuPo[],
  baru: KartuPo[],
  sunting: Record<string, KartuPo>
): KartuPo[] {
  return [...bawaan, ...baru].map((k) => sunting[k.id] ?? k);
}

export default function MaterialFulfillment({
  kartuAwal = [],
}: {
  /**
   * Kartu awal hasil form, kalau pemanggil sudah punya.
   *
   * Ada supaya halaman bisa di-render dengan kartu baru TANPA browser: seluruh
   * smoke test repo ini cuma bisa melihat `renderToStaticMarkup`, dan tanpa
   * seam ini mustahil membuktikan bahwa kartu hasil form benar-benar muncul di
   * papan — bukan hanya bahwa `gabungKartu()` benar saat dipanggil langsung.
   *
   * Itu bukan check sepele. Mutasi 12 (`semua` kembali ke `KARTU_PO` saja) dan
   * mutasi 13 (papan meneruskan `KARTU_PO`, bukan `semua`) dua-duanya hijau
   * pada test yang hanya memanggil `gabungKartu` — padahal masing-masing
   * mengembalikan halaman ke keadaan tepat sebelum tombolnya hidup. Keduanya
   * baru ketahuan lewat render halaman utuh (28 Sep).
   *
   * Kosong di aplikasi: halaman ini tidak punya pemanggil lain.
   */
  kartuAwal?: KartuPo[];
} = {}) {
  const [state, setState] = useState<StatePapanPo>({
    pindah: {},
    datang: {},
    sunting: {},
    terbukaId: null,
  });

  const { pindah, datang, sunting } = state;

  // Kartu hasil form "Pembelian Material". Terpisah dari `KARTU_PO` (konstanta
  // contoh) dan AWALNYA KOSONG — jadi data contoh utuh, dan yang dibuat user
  // tinggal di memori sampai halaman dimuat ulang (keputusan owner 28 Sep 2026:
  // "UI dulu", belum menyentuh database).
  const [baru, setBaru] = useState<KartuPo[]>(kartuAwal);
  const [formTerbuka, setFormTerbuka] = useState(false);

  // Kartu effektif = bawaan + hasil form + hasil suntingan popup. Dipakai kedua
  // tab, jadi mengedit harga di popup langsung mengubah angka di tabel juga.
  //
  // `gabungKartu` (bukan inline) supaya smoke test bisa memanggil definisi
  // yang sama. Versi sebelumnya menulis `[...KARTU_PO, ...baru]` langsung di
  // sini; test yang menulis ulang ungkapan itu akan memeriksa salinannya, bukan
  // kode yang dipakai kartu — persis jebakan yang sudah pernah kejadian di
  // `labelStage` (28 Sep).
  const semua = useMemo(
    () => gabungKartu(KARTU_PO, baru, sunting),
    [baru, sunting]
  );

  const aksi: AksiPo = useMemo(
    () => ({
      buka: (kartuId) => setState((lama) => ({ ...lama, terbukaId: kartuId })),
      tutup: () => setState((lama) => ({ ...lama, terbukaId: null })),
      // Tombol "Pembelian Material" di kolom Proposed. Dulu ini stub kosong
      // karena `semua` tidak punya tempat untuk kartu baru (lihat catatan di
      // atas) — sekarang formnya sudah ada.
      buat: () => setFormTerbuka(true),
      tandaiDatang: (kartuId, kunci, sudah) =>
        setState((lama) => {
          const sekarang = new Set(lama.datang[kartuId] ?? []);
          if (sudah) sekarang.add(kunci);
          else sekarang.delete(kunci);
          return { ...lama, datang: { ...lama.datang, [kartuId]: [...sekarang] } };
        }),
      lanjutStage: (k) =>
        setState((lama) => {
          const sekarang = stageKartu(k.id, semua, lama.pindah, PAPAN_PO);
          const i = PAPAN_PO.findIndex((s) => s.id === sekarang);
          const tujuan = PAPAN_PO[i + 1];
          return tujuan
            ? { ...lama, pindah: { ...lama.pindah, [k.id]: tujuan.id }, terbukaId: null }
            : lama;
        }),
      selesaikan: (k) =>
        setState((lama) => ({
          ...lama,
          pindah: { ...lama.pindah, [k.id]: 'selesai' },
          terbukaId: null,
        })),
      simpan: (k) =>
        setState((lama) => ({ ...lama, sunting: { ...lama.sunting, [k.id]: k } })),
    }),
    [semua]
  );

  const baris = useMemo<BarisPo[]>(
    () =>
      semua.map((k) => {
        const ringkas = ringkasDatang(k.id, k.items, datang);
        return {
          ...k,
          stage_label: labelStage(k.id, semua, pindah, PAPAN_PO),
          material: k.items
            .filter((b) => b.nama.trim() !== '')
            .map((b) => (b.varian ? `${b.nama} ${b.varian}` : b.nama))
            .join(', '),
          workcode: k.workcodes.join(', '),
          datang: `${ringkas.sudah}/${ringkas.totalBaris}`,
          total_po: k.items.reduce((s, b) => s + b.qty * b.harga, 0),
        };
      }),
    [semua, pindah, datang]
  );

  const kategoriLabel = (r: BarisPo) =>
    r.kategori === 'kain' ? 'Kain' : r.kategori === 'cmt_cost' ? 'Product Fulfillment' : 'Aksesoris';

  const columns = useMemo<KolomPratinjau<BarisPo>[]>(
    () => [
      { key: 'no_po', label: 'No. PO', value: (r) => r.noPo },
      {
        key: 'vendor',
        label: 'Vendor',
        value: (r) => r.vendor,
        filterOptions: [...new Set(baris.map((r) => r.vendor))].sort((a, b) =>
          a.localeCompare(b, 'id')
        ),
      },
      {
        key: 'kategori',
        label: 'Kategori',
        value: kategoriLabel,
        jenis: 'badge',
        filterOptions: ['Kain', 'Aksesoris', 'Product Fulfillment'],
      },
      { key: 'jenis', label: 'Jenis', value: (r) => r.jenis || null },
      { key: 'material', label: 'Material', value: (r) => r.material, lebar: 'max-w-72' },
      { key: 'workcode', label: 'Workcode', value: (r) => r.workcode, lebar: 'max-w-64' },
      {
        key: 'stage',
        label: 'Tahap',
        value: (r) => r.stage_label,
        jenis: 'badge',
        filterOptions: PAPAN_PO.map((s) => s.label),
      },
      {
        key: 'datang',
        label: 'Material Datang',
        value: (r) => Number(r.datang.split('/')[0]),
        render: (r) => {
          const [sudah, totalBaris] = r.datang.split('/').map(Number);
          return (
            <span className="whitespace-nowrap tabular-nums">
              <span className="font-medium">{sudah}</span>
              <span className="text-muted-foreground">/{totalBaris}</span>
            </span>
          );
        },
      },
      { key: 'tgl_po', label: 'Tgl PO', value: (r) => r.tglPo },
      { key: 'total', label: 'Total', value: (r) => r.total_po, jenis: 'uang' },
      { key: 'pic', label: 'PIC', value: (r) => r.pic },
    ],
    [baris]
  );

  const searchFields = useMemo(
    () => [
      { label: 'No. PO', get: (r: BarisPo) => r.noPo },
      { label: 'Vendor', get: (r: BarisPo) => r.vendor },
      { label: 'Material', get: (r: BarisPo) => r.material },
      { label: 'Workcode', get: (r: BarisPo) => r.workcode },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <BannerPratinjau modul="Material Fulfillment" bentuk="papan" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Material Fulfillment</h1>
          <p className="text-sm text-muted-foreground">
            Pembelian material per vendor — satu kartu untuk satu PO
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {PAPAN_PO.length} tahap • {semua.length} PO
          {/* Angka ini bukan lagi "contoh" begitu ada kartu dari form. dulu
              jumlah selalu konstan; sekarang tidak, dan memanggilnya "contoh"
              setelah form dipakai akan berbohong. */}
          {baru.length > 0 && ` (${baru.length} dari form)`}
        </p>
      </div>

      <Tabs defaultValue="papan">
        <TabsList>
          <TabsTrigger value="papan">Papan</TabsTrigger>
          <TabsTrigger value="daftar">Daftar PO</TabsTrigger>
        </TabsList>

        <TabsContent value="papan" className="mt-4">
          {/* `semua`, bukan `KARTU_PO` — papan harus menampilkan kartu hasil
              form. (Dulu `KARTU_PO` diteruskan langsung di sini, jadi
              meskipun `semua` sudah punya kartu baru, papan tetap tidak akan
              menampilkannya. Dua tempat, satu sumber.) */}
          <PapanPo stages={PAPAN_PO} kartu={semua} state={state} aksi={aksi} />
        </TabsContent>

        <TabsContent value="daftar" className="mt-4">
          <TabelPratinjau
            rows={baris}
            columns={columns}
            searchFields={searchFields}
            searchPlaceholder="Cari no. PO, vendor, material, atau workcode…"
            itemLabel="PO"
            rowKey={(r) => r.id}
            onRowClick={(r) => aksi.buka(r.id)}
            emptyMessage="Belum ada PO."
          />
        </TabsContent>
      </Tabs>

      <FormPoBaru
        terbuka={formTerbuka}
        sudahAda={baru.length > 0}
        onTutup={() => setFormTerbuka(false)}
        onSimpan={(data) => {
          // Id dari penghitung modul-level, bukan acak: `Date.now()` bisa
          // kembar kalau dua PO dibuat dalam milidetik yang sama, dan id kembar
          // membuat dua kartu berbagi satu state `pindah`/`datang` — satu
          // centang material untuk keduanya.
          setBaru((lama) => [...lama, kartuBaru(`po-baru-${lama.length + 1}`, data)]);
          setFormTerbuka(false);
        }}
      />
    </div>
  );
}
