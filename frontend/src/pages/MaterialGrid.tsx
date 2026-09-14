import { useMemo, useState } from 'react';
import {
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table';
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
import { DataGridColumnVisibility } from '@/components/reui/data-grid-column-visibility';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { rupiah } from '@/lib/format';
import BannerPratinjau from '@/components/BannerPratinjau';
import { FLOW_TRANSAKSI, JENIS_MATERIAL, KATEGORI_MATERIAL, labelDari } from '@/lib/opsi';
import { barisContoh, type BarisMaterial } from '@/pages/Material';

// ===== Prototipe: tabel Material langsung dengan reui Data Grid =====
//
// CATATAN 9 September 2026: Data Grid sudah dipilih dan semua tabel lain
// sekarang memakainya lewat `TabelPratinjau`. Halaman ini ditinggalkan
// sebagai contoh pemakaian Data Grid secara LANGSUNG — tanpa adapter —
// berguna untuk menguji opsi tableLayout sebelum diputuskan
// dipakai bersama. Bukan lagi satu-satunya pemakai Data Grid.
//
// Alasan Data Grid, bukan DataTableToolbar:
//   1. Berbasis TanStack Table — pustaka standar, dokumentasinya luas, jadi
//      perubahan tampilan nanti tidak bergantung pada kode yang hanya ada di
//      project ini.
//   2. Kolom bisa diubah ukurannya, di-pin, dipindah, dan disembunyikan
//      langsung dari header — tanpa menulis ulang komponen tabel.
//   3. Gratis (lisensi reui tier Free). Komponen `table` di reui.io butuh
//      license key berbayar; `data-grid` tidak.

const EMPTY_CELL = <span className="text-muted-foreground">—</span>;

/** Penanda kotak untuk kolom foto: belum ada berkas asli di pratinjau. */
const FOTO_BOX = (
  <span className="inline-flex h-8 w-8 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">
    FOTO
  </span>
);

export default function MaterialGrid() {
  const [data] = useState<BarisMaterial[]>(barisContoh);

  const columns = useMemo<ColumnDef<DataGridFeatures, BarisMaterial, unknown>[]>(
    () => [
      { accessorKey: 'tanggal', header: 'Date Transaction' },
      { accessorKey: 'workcode', header: 'Workcode' },
      {
        accessorKey: 'kategori',
        header: 'Category',
        cell: ({ row }) => (
          <Badge variant="outline">
            {labelDari(KATEGORI_MATERIAL, row.original.kategori)}
          </Badge>
        ),
      },
      {
        accessorKey: 'jenis',
        header: 'Jenis',
        cell: ({ row }) =>
          labelDari(JENIS_MATERIAL[row.original.kategori] ?? [], row.original.jenis),
      },
      { accessorKey: 'nama', header: 'Nama' },
      {
        accessorKey: 'foto',
        header: 'Foto',
        cell: ({ row }) => (row.original.foto ? FOTO_BOX : EMPTY_CELL),
      },
      { accessorKey: 'variasi', header: 'Variasi' },
      {
        accessorKey: 'qty',
        header: 'Qty',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {Number(row.original.qty).toLocaleString('id-ID')}
          </span>
        ),
      },
      { accessorKey: 'unit', header: 'Unit' },
      {
        accessorKey: 'hargaPerUnit',
        header: 'Price/Unit',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {rupiah(Number(row.original.hargaPerUnit))}
          </span>
        ),
      },
      { accessorKey: 'supplier', header: 'Supplier' },
      { accessorKey: 'pic', header: 'PIC' },
      {
        accessorKey: 'flowTransaction',
        header: 'Flow Transaction',
        cell: ({ row }) => (
          <Badge variant="secondary">
            {labelDari(FLOW_TRANSAKSI, row.original.flowTransaction)}
          </Badge>
        ),
      },
      { accessorKey: 'lokasi', header: 'Lokasi Barang' },
      {
        accessorKey: 'proofOfInvoice',
        header: 'Proof of Invoice',
        cell: ({ row }) => (row.original.proofOfInvoice ? FOTO_BOX : EMPTY_CELL),
      },
      {
        accessorKey: 'mutasiSs',
        header: 'Mutasi SS',
        cell: ({ row }) => (row.original.mutasiSs ? FOTO_BOX : EMPTY_CELL),
      },
      {
        accessorKey: 'financeValidation',
        header: 'Finance Validation',
        cell: ({ row }) => row.original.financeValidation || EMPTY_CELL,
      },
    ],
    []
  );

  // TanStack v9 membangun tabel lewat hook `useTable`, bukan
  // `new ReactTable(...)`. `dataGridFeatures` wajib dikirim: fitur Data Grid
  // (pin, resize, pindah kolom) dibaca dari situ, dan tanpa itu header tidak
  // punya menu untuk mengaturnya.
  const table = useTable<DataGridFeatures, BarisMaterial>({
    data,
    columns,
    // Row model ikut `features`, bukan jadi opsi terpisah — beda dari v8
    // yang menaruhnya di tingkat atas.
    features: tableFeatures({
      ...dataGridFeatures,
      sortedRowModel: createSortedRowModel(),
      filteredRowModel: createFilteredRowModel(),
      paginatedRowModel: createPaginatedRowModel(),
    }),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  return (
    // DataGridProvider membungkus SEMUA kontrol, bukan cuma tabelnya:
    // DataGridColumnVisibility memanggil useDataGrid(), dan hook itu melempar
    // "must be used within a DataGridProvider" bila dipanggil di luar context.
    <DataGridProvider table={table} recordCount={data.length}>
      <div className="space-y-4">
        <BannerPratinjau modul="Material (Data Grid)" jumlahKolom={columns.length} />

        <div className="flex items-center gap-2">
          <Input
            defaultValue=""
            onChange={(e) => table.setGlobalFilter(e.target.value)}
            placeholder="Cari material…"
            className="max-w-xs"
          />
          <DataGridColumnVisibility
            table={table}
            trigger={<Button variant="outline" size="sm">Kolom</Button>}
          />
          <Button variant="outline" size="sm" onClick={() => table.resetSorting()}>
            Reset urutan
          </Button>
        </div>

        {/* DataGridContainer + DataGridScrollArea WAJIB: container memasang
            `overflow-hidden` supaya lebar tabel (yang dihitung dari jumlah
            kolom) dipotong di batas kartu, bukan melebar keluar <main> dan
            menutupi sidebar. ScrollArea menyediakan viewport
            [data-slot="scroll-area-viewport"] yang dipakai data-grid-table
            untuk MENGUKUR ruang kosong — tanpanya pengukuran salah dan
            kolom isian tidak pernah menyusut saat jendela diperkecil. */}
        <DataGridContainer className="rounded-md border">
          <DataGrid
            table={table}
            recordCount={data.length}
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
            <DataGridPagination sizes={[5, 10, 20]} />
          </DataGrid>
        </DataGridContainer>
      </div>
    </DataGridProvider>
  );
}
