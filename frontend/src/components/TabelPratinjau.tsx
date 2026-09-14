import { useMemo } from 'react';
import {
  DataGrid,
  DataGridContainer,
  DataGridProvider,
  dataGridFeatures,
  type DataGridFeatures,
} from '@/components/reui/data-grid';
import { DataGridTable } from '@/components/reui/data-grid-table';
import { DataGridPagination } from '@/components/reui/data-grid-pagination';
import { DataGridScrollArea } from '@/components/reui/data-grid-scroll-area';
import { DataGridColumnHeader } from '@/components/reui/data-grid-column-header';
import { DataGridColumnVisibility } from '@/components/reui/data-grid-column-visibility';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Download, RotateCw, Filter, ListFilter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rupiah } from '@/lib/format';

// ===== Tabel standar, dirender dengan reui Data Grid =====
//
// Tujuh modul punya bentuk tabel yang sama: daftar baris, banyak kolom,
// filter/sort/cari, dan kolom yang bisa disembunyikan. Menulisnya tujuh kali
// berarti tujuh kesempatan untuk perilaku yang berbeda-beda — dan perbedaannya
// baru terasa saat owner membandingkan dua halaman yang menangani foto atau
// angka dengan cara tidak sama.
//
// Jadi halaman cukup mendeklarasikan kolomnya; yang merender cukup satu.
// Tampilannya sekarang reui Data Grid (dipilih 9 September 2026), menggantikan
// tabel shadcn + DataTableToolbar yang lama.
//
// Dua komponen pembungkus di bawah WAJIB, bukan hiasan:
//   - DataGridContainer memasang `overflow-hidden`, yang memotong lebar tabel
//     di batas kartunya. Tanpa itu tabel melebar keluar <main> dan menutupi
//     sidebar yang posisinya `fixed`.
//   - DataGridScrollArea menyediakan viewport
//     [data-slot="scroll-area-viewport"] — patokan ukur yang dipakai
//     data-grid-table untuk menghitung ruang kosong kolom isian. Tanpa itu
//     pengukurannya salah dan kolom tidak pernah menyusut saat jendela
//     diperkecil.

export type JenisKolom =
  | 'teks'
  | 'foto'
  | 'badge'
  | 'angka'
  | 'uang'
  | 'tanggal'
  | 'centang';

// `T extends object`, bukan `T` bebas: DataGridProvider menuntut
// `DataGridTableInstance<TData>` dengan `TData extends object`. Baris tabel
// berupa primitif (mis. string[]) akan gagal di sini, saat kompilasi — bukan
// gagal diam-diam saat runtime.
export interface KolomPratinjau<T extends object = Record<string, unknown>> {
  key: string;
  label: string;
  value: (row: T) => string | number | null;
  jenis?: JenisKolom;
  filterOptions?: string[];
  /** Warna badge. Tanpa ini badge memakai tampilan netral. */
  warna?: (row: T) => 'netral' | 'hijau' | 'merah' | 'kuning';
  /** Lebar maksimum sel — kolom teks panjang dipotong, bukan melebarkan tabel. */
  lebar?: string;
  /**
   * Sel kustom. Dipakai bila bentuk selnya tidak bisa dinyatakan dengan
   * `jenis` — mis. thumbnail foto asli (bukan penanda), atau tombol aksi
   * per baris. Bila diisi, `jenis`/`warna` diabaikan.
   */
  render?: (row: T) => React.ReactNode;
}

interface TabelPratinjauProps<T extends object> {
  rows: T[];
  columns: KolomPratinjau<T>[];
  searchFields: { label: string; get: (row: T) => string }[];
  searchPlaceholder?: string;
  itemLabel?: string;
  /** Baris kunci untuk React. */
  rowKey: (row: T) => string | number;
  /** Tombol Refresh hanya muncul bila diisi. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Slot tombol aksi milik halaman, mis. "+ Tambah Vendor" / "Buat PO". */
  actions?: React.ReactNode;
  /** Pesan saat tidak ada baris sama sekali (bukan sekadar tak cocok filter). */
  emptyMessage?: string;
  /**
   * Kunci kolom yang TAMPIL sejak awal. Sisanya tetap ada di tabel — dan
   * karena itu tetap tercantum di dropdown "Kolom" — tapi tidak dicentang,
   * jadi tidak ditampilkan sampai user mencentangnya sendiri.
   *
   * Urutannya menentukan urutan kolom: yang disebut di sini tampil lebih
   * dulu, persis sesuai urutannya, lalu sisanya menyusul.
   *
   * Tanpa prop ini perilakunya seperti sebelumnya: semua kolom tampil. Jadi
   * halaman yang tidak memakainya tidak berubah apa-apa.
   *
   * State ini dibaca sekali saat tabel dibuat (initialState). Halaman yang
   * mengubah nilainya saat tabel sudah terpasang HARUS mengganti `key`
   * komponen ini juga, supaya tabelnya dibuat ulang.
   */
  kunciKolomAktif?: string[];
  /**
   * Klik baris. Hanya mouse — reui tidak menyediakan padanan keyboardnya.
   * Halaman yang memasang ini WAJIB tetap menyediakan jalur keyboard lain
   * (mis. tombol detail di kolom Aksi), atau detailnya tidak bisa dijangkau
   * tanpa pointing device.
   */
  onRowClick?: (row: T) => void;
}

// Warna badge mengikuti token tema, bukan warna hardcoded — supaya badge
// tetap terbaca di mode gelap.
const WARNA_BADGE = {
  netral: 'outline',
  hijau: 'default',
  merah: 'destructive',
  kuning: 'secondary',
} as const;

const KOSONG = <span className="text-muted-foreground">—</span>;

/** Penanda kotak untuk kolom foto. */
const FOTO_BOX = (
  <span className="inline-flex h-8 w-8 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">
    FOTO
  </span>
);

function toCsvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Anti formula-injection: sel berawalan =,+,-,@ diprefiks kutip tunggal
  // agar Excel/Sheets tidak mengevaluasinya.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  // Angka: prefiks kutip agar nol depan tidak dipotong Excel (mis. kode "0012").
  else if (s !== '' && !Number.isNaN(Number(s)) && /^\d/.test(s)) s = `'${s}`;
  const needsQuote = /[",\n\r]/.test(s);
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map(toCsvCell).join(',')).join('\r\n');
  // BOM di depan agar Excel membaca UTF-8 dengan benar (U+FEFF, eksplisit via escape).
  const blob = new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TabelPratinjau<T extends object>({
  rows,
  columns,
  searchFields,
  searchPlaceholder,
  itemLabel,
  onRefresh,
  refreshing = false,
  actions,
  emptyMessage,
  kunciKolomAktif,
  onRowClick,
}: TabelPratinjauProps<T>) {
  // ===== Kolom yang tampil sejak awal vs. yang disembunyikan =====
  //
  // `kunciKolomAktif` diubah jadi dua hal yang dibutuhkan TanStack:
  //   - columnVisibility: false untuk kolom di luar daftar (default true)
  //   - columnOrder: kolom aktif lebih dulu, sesuai urutannya, lalu sisanya
  //
  // Keduanya harus diisi. columnVisibility saja membuat kolom tak aktif hilang
  // dari pandangan TETAPI urutannya tetap urutan deklarasi — jadi kolom yang
  // tercentang terakhir di daftar akan muncul menggantung di tengah tabel,
  // dikelilingi ruang kosong.
  const { visibilitasAwal, urutanAwal } = useMemo(() => {
    if (!kunciKolomAktif) return { visibilitasAwal: undefined, urutanAwal: undefined };

    const aktif = new Set(kunciKolomAktif);
    const semuaKunci = columns.map((c) => c.key);

    const visibilitas: Record<string, boolean> = {};
    for (const k of semuaKunci) visibilitas[k] = aktif.has(k);

    // Kolom aktif mengikuti URUTAN di `kunciKolomAktif`, bukan urutan
    // deklarasi: halaman sudah menyusunnya sesuai alur kerja.
    const urutan = [
      ...kunciKolomAktif.filter((k) => visibilitas[k] !== undefined),
      ...semuaKunci.filter((k) => !aktif.has(k)),
    ];

    return { visibilitasAwal: visibilitas, urutanAwal: urutan };
  }, [columns, kunciKolomAktif]);

  const columnsTanStack = useMemo<ColumnDef<DataGridFeatures, T, unknown>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        // `accessorFn` bukan `accessorKey`: nilai diformat berdasar `jenis`
        // (uang, angka, badge), dan accessorKey hanya bisa menunjuk field.
        accessorFn: (row: T) => c.value(row),
        // Header memakai komponen reui: dari situ user bisa sort, pin, dan
        // pindah kolom langsung di header.
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={c.label} />
        ),
        // `headerTitle` di meta — bukan sekadar hiasan. getColumnHeaderLabel
        // (dipakai dropdown "Kolom", menu pin, dan menu pindah kolom) hanya
        // bisa membaca string: ia memakai meta.headerTitle, lalu
        // columnDef.header kalau itu string, lalu JATUH ke column.id. Karena
        // `header` di sini sebuah komponen, tanpa meta ini semua menu itu
        // menampilkan kunci mentah — "workcodePdff", bukan "Workcode PDFF".
        meta: { headerTitle: c.label },
        // Nilai kosong SELALU di bawah, di kedua arah urutan.
        //
        // Ini mempertahankan perilaku useDataTable lama, yang menaruh null
        // paling bawah secara eksplisit. Tanpa penanganan di sini, TanStack
        // mengubah null jadi "" lewat `toString`, lalu "" menang atas teks
        // apa pun — sehingga PO yang belum diputuskan justru memuncaki
        // urutan naik, berlawanan dengan kolom tanggal di sebelahnya (lihat
        // catatan di PembelianMaterial.tsx).
        //
        // `sortUndefined: 'last'` TIDAK cukup: opsi itu hanya memeriksa
        // `value === undefined` (lihat createSortedRowModel.js), sedangkan
        // kolom di sini mengembalikan `null`. Jadi ditulis sendiri.
        sortingFn: (
          rowA: { getValue: (id: string) => unknown },
          rowB: { getValue: (id: string) => unknown },
          columnId: string
        ) => {
          const a = rowA.getValue(columnId);
          const b = rowB.getValue(columnId);
          const aKosong = a === null || a === undefined || a === '';
          const bKosong = b === null || b === undefined || b === '';
          if (aKosong && bKosong) return 0;
          if (aKosong) return 1;
          if (bKosong) return -1;
          // Angka diurut secara numerik, bukan sebagai teks — "100" tidak
          // boleh kalah dari "20".
          if (c.jenis === 'angka' || c.jenis === 'uang') {
            return Number(a) - Number(b);
          }
          return String(a).localeCompare(String(b), 'id');
        },
        // DataGridColumnFilter mengirim LARRAY nilai terpilih, sedangkan
        // accessorFn menghasilkan nilai TUNGGAL. FilterFn bawaan
        // `arrIncludesSome` mengasumsikan nilai baris ikut berupa array, jadi
        // di sini ditulis sendiri: baris lolos bila nilainya ada di pilihan.
        filterFn: (row, columnId, filterValue) => {
          if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
          return filterValue.includes(row.getValue(columnId));
        },
        cell: ({ row }) => renderCell(row.original, c),
      })),
    [columns]
  );

  // Pencarian mengikuti `searchFields` yang dideklarasikan halaman, bukan
  // semua kolom — sama seperti DataTableToolbar yang lama.
  const globalFilterFn = useMemo(
    () => (row: { original: T }, _columnId: string, filterValue: unknown) => {
      const q = String(filterValue ?? '').trim().toLowerCase();
      if (!q) return true;
      return searchFields.some((f) =>
        String(f.get(row.original) ?? '')
          .toLowerCase()
          .includes(q)
      );
    },
    [searchFields]
  );

  const table = useTable<DataGridFeatures, T>({
    data: rows,
    columns: columnsTanStack,
    features: dataGridFeatures,
    globalFilterFn,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      // Dua kunci ini HANYA disertakan bila `kunciKolomAktif` diberikan.
      //
      // Jangan dikirim sebagai `undefined`: initialState digabung ke state
      // awal, jadi kunci yang ADA tapi berisi undefined MENIMPA default
      // TanStack — bukan diabaikan. Akibatnya `table.state.columnOrder` jadi
      // undefined, dan reui membacanya (`d.length` di DataGridColumnHeader)
      // lalu melempar "Cannot read properties of undefined" — yang karena
      // tidak ada error boundary, mengosongkan seluruh halaman. Gejalanya
      // muncul di enam halaman yang TIDAK memakai prop ini, sementara
      // Production Fulfillment (yang memang mengisinya) tampak baik-baik saja.
      ...(visibilitasAwal ? { columnVisibility: visibilitasAwal } : {}),
      ...(urutanAwal ? { columnOrder: urutanAwal } : {}),
    },
  });

  const jumlahTerfilter = table.getFilteredRowModel().rows.length;

  // ===== Filter per kolom =====
  // Nilai terpilih disimpan sebagai LARRAY di state TanStack, lalu dicocokkan
  // oleh `filterFn` di atas. Disimpan di TanStack (bukan useState sendiri)
  // supaya resetColumnFilters() membersihkan semuanya sekaligus.

  // Daftar filter mengikuti semua kolom yang punya opsi — termasuk yang
  // sedang disembunyikan, karena menyaring baris berdasar kolom yang tak
  // terlihat itu sah dan kadang justru yang diinginkan.
  //
  // Urutannya mengikuti urutan tabel saat ini, bukan urutan deklarasi. Kalau
  // tidak, dengan 40 kolom yang diteruskan, dropdown filter akan dipenuhi
  // kolom yang sedang tidak tampil lebih dulu — dan kolom yang baru saja
  // dicentang user ada entah di mana di dasar daftar.
  const kolomBisaFilter = useMemo(() => {
    const urutanTabel = table.getVisibleLeafColumns().map((c) => c.id);
    const bisaFilter = columns.filter((c) => c.filterOptions?.length);
    const tampilDulu = bisaFilter.filter((c) => urutanTabel.includes(c.key));
    const sisanya = bisaFilter.filter((c) => !urutanTabel.includes(c.key));
    return [...tampilDulu, ...sisanya];
    // `columnVisibility` ikut jadi dependency: mencentang kolom di dropdown
    // "Kolom" mengubah daftar yang tampil, dan urutan filter harus mengikuti.
    // `table` sendiri sengaja tidak dicantumkan — lihat catatan di
    // `jumlahFilterAktif` di bawah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, table.state.columnVisibility]);

  // Bergantung pada `columnFilters`, BUKAN `table`: objek table dibentuk
  // ulang tiap render, jadi menjadikannya dependency akan menghitung ulang
  // terus-menerus dan berisiko loop.
  const jumlahFilterAktif = useMemo(
    () =>
      kolomBisaFilter.reduce((n, c) => {
        const v = table.getColumn(c.key)?.getFilterValue();
        return n + (Array.isArray(v) ? v.length : 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, 0),
    [kolomBisaFilter, table.state.columnFilters]
  );

  const toggleFilter = (key: string, option: string) => {
    const col = table.getColumn(key);
    if (!col) return;
    const current = new Set(
      Array.isArray(col.getFilterValue())
        ? (col.getFilterValue() as string[])
        : []
    );
    if (current.has(option)) current.delete(option);
    else current.add(option);
    col.setFilterValue(current.size ? Array.from(current) : undefined);
  };

  const bersihkanFilterKolom = (key: string) => {
    table.getColumn(key)?.setFilterValue(undefined);
  };

  const handleExport = () => {
    // Yang diekspor mengikuti kolom yang TAMPIL, dalam urutan yang tampil —
    // bukan semua kolom yang dideklarasikan.
    //
    // Sebelum ada `kunciKolomAktif`, dua-duanya sama saja. Sekarang halaman
    // bisa meneruskan 40 kolom sekaligus dan cuma menampilkan 11: kalau ekspor
    // tetap memakai `columns`, berkas CSV-nya berisi 29 kolom yang sedang
    // disembunyikan user, dan urutannya tidak sama dengan yang dilihat di
    // layar. Jadi diambil dari keadaan tabel saat ini.
    const tampil = table.getVisibleLeafColumns();
    const indeksKolom = new Map(columns.map((c) => [c.key, c]));
    const header = tampil.map((col) => indeksKolom.get(col.id)?.label ?? col.id);
    const body = table
      .getFilteredRowModel()
      .rows.map((row) =>
        tampil.map((col) => indeksKolom.get(col.id)?.value(row.original) ?? null)
      );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`export-${itemLabel ?? 'data'}-${stamp}.csv`, [header, ...body]);
  };

  return (
    <DataGridProvider table={table} recordCount={jumlahTerfilter}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              defaultValue=""
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder ?? 'Cari…'}
              className="pl-9"
            />
          </div>

          {/* SATU tombol Filter, bukan satu tombol per kolom.
              Dulu sempat dipasang per kolom — hasilnya toolbar dipenuhi
              tombol "Filter Category", "Filter Unit", "Filter Scope" yang
              masing-masing hanya berguna sesekali. Pola yang benar: pilih
              kolom dulu lewat submenu, baru centang nilainya. */}
          {kolomBisaFilter.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      jumlahFilterAktif > 0 && 'border-primary/50 text-primary'
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    Filter
                    {jumlahFilterAktif > 0 && (
                      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {jumlahFilterAktif}
                      </span>
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent
                align="start"
                className="max-h-80 w-56 overflow-y-auto"
              >
                {kolomBisaFilter.map((c) => {
                  const selected = new Set(
                    Array.isArray(table.getColumn(c.key)?.getFilterValue())
                      ? (table.getColumn(c.key)!.getFilterValue() as string[])
                      : []
                  );
                  return (
                    <DropdownMenuSub key={c.key}>
                      <DropdownMenuSubTrigger>
                        <span className="flex-1">{c.label}</span>
                        {selected.size > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {selected.size}
                          </span>
                        )}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                        {c.filterOptions!.map((o) => (
                          <DropdownMenuCheckboxItem
                            key={o}
                            checked={selected.has(o)}
                            onCheckedChange={() => toggleFilter(c.key, o)}
                          >
                            {o}
                          </DropdownMenuCheckboxItem>
                        ))}
                        {selected.size > 0 && (
                          <DropdownMenuCheckboxItem
                            checked={false}
                            onCheckedChange={() => bersihkanFilterKolom(c.key)}
                          >
                            <span className="text-muted-foreground">
                              Bersihkan
                            </span>
                          </DropdownMenuCheckboxItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })}
                {jumlahFilterAktif > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => table.resetColumnFilters()}>
                      <ListFilter className="h-4 w-4" /> Bersihkan semua filter
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DataGridColumnVisibility
            table={table}
            trigger={
              <Button variant="outline" size="sm">
                Kolom
              </Button>
            }
          />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Reset urutan dan filter, supaya "Refresh" benar-benar
                // mengembalikan tabel ke keadaan awal seperti toolbar lama
                // (resetOnRefresh).
                table.resetSorting();
                table.resetColumnFilters();
                table.setGlobalFilter('');
                onRefresh();
              }}
              disabled={refreshing}
            >
              <RotateCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
          )}

          {actions}
        </div>

        <DataGridContainer className="rounded-md border">
          <DataGrid
            table={table}
            recordCount={jumlahTerfilter}
            emptyMessage={emptyMessage ?? 'Tidak ada baris yang cocok.'}
            onRowClick={onRowClick}
            tableLayout={{
              columnsResizable: true,
              columnsPinnable: true,
              columnsMovable: true,
              columnsVisibility: true,
              headerSticky: true,
              stripped: true,
              width: 'auto',
            }}
          >
            <DataGridScrollArea>
              <DataGridTable />
            </DataGridScrollArea>
            <DataGridPagination sizes={[5, 10, 20, 50]} />
          </DataGrid>
        </DataGridContainer>
      </div>
    </DataGridProvider>
  );
}

// ===== Render sel =====
// Bentuknya sengaja dipertahankan sama persis dengan versi tabel shadcn yang
// lama, supaya tujuh halaman tidak perlu diubah saat mesinnya diganti.

function renderCell<T extends object>(row: T, kolom: KolomPratinjau<T>) {
  const nilai = kolom.value(row);
  const kosong = nilai === null || nilai === '';
  const kelasLebar = kolom.lebar ?? '';

  // Sel kustom menang lebih dulu: halaman yang butuh markup sendiri tidak
  // perlu memilih salah satu `jenis` yang hampir cocok.
  if (kolom.render) return kolom.render(row);

  switch (kolom.jenis) {
    case 'foto':
      // Pratinjau: belum ada berkas asli, jadi ditampilkan penanda kotak,
      // bukan <img> dengan src kosong — itu akan memicu permintaan gagal ke
      // server di setiap baris.
      return kosong ? KOSONG : FOTO_BOX;
    case 'badge': {
      if (kosong) return KOSONG;
      const warna = kolom.warna?.(row) ?? 'netral';
      return (
        <Badge variant={WARNA_BADGE[warna]} className="whitespace-nowrap">
          {String(nilai)}
        </Badge>
      );
    }
    case 'angka':
      return kosong ? (
        KOSONG
      ) : (
        <span className="tabular-nums">
          {Number(nilai).toLocaleString('id-ID')}
        </span>
      );
    case 'uang':
      return kosong ? (
        KOSONG
      ) : (
        <span className="whitespace-nowrap tabular-nums">
          {rupiah(Number(nilai))}
        </span>
      );
    case 'centang': {
      // Kolom "sudah divalidasi/diupload". Nilainya dikirim sebagai string
      // karena `value` hanya boleh string/angka/null — boolean tidak masuk
      // tipe itu (terbukti: tsc menolaknya).
      const ya = nilai === 'ya' || nilai === 1 || nilai === 'true';
      return (
        <Badge variant={ya ? 'default' : 'outline'}>{ya ? 'Ya' : 'Belum'}</Badge>
      );
    }
    default:
      return kosong ? (
        KOSONG
      ) : (
        <span
          className={kelasLebar ? `${kelasLebar} block truncate` : undefined}
          title={String(nilai)}
        >
          {String(nilai)}
        </span>
      );
  }
}
