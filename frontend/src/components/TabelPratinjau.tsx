import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DataTableToolbar,
  useDataTable,
  type ColumnDef,
} from '@/components/DataTableToolbar';
import { rupiah } from '@/lib/format';

// ===== Tabel untuk halaman pratinjau =====
//
// Tujuh modul punya bentuk tabel yang sama: daftar baris, banyak kolom,
// filter/sort/cari, dan kolom yang bisa disembunyikan. Menulisnya tujuh kali
// berarti tujuh kesempatan untuk perilaku yang berbeda-beda — dan perbedaannya
// baru terasa saat owner membandingkan dua halaman yang menangani foto atau
// angka dengan cara tidak sama.
//
// Jadi halaman cukup mendeklarasikan kolomnya; yang merender cukup satu.

export type JenisKolom =
  | 'teks'
  | 'foto'
  | 'badge'
  | 'angka'
  | 'uang'
  | 'tanggal'
  | 'centang';

export interface KolomPratinjau<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null;
  jenis?: JenisKolom;
  filterOptions?: string[];
  /** Warna badge. Tanpa ini badge memakai tampilan netral. */
  warna?: (row: T) => 'netral' | 'hijau' | 'merah' | 'kuning';
  /** Lebar maksimum sel — kolom teks panjang dipotong, bukan melebarkan tabel. */
  lebar?: string;
}

interface TabelPratinjauProps<T> {
  rows: T[];
  columns: KolomPratinjau<T>[];
  searchFields: { label: string; get: (row: T) => string }[];
  searchPlaceholder?: string;
  itemLabel?: string;
  /** Baris kunci untuk React. */
  rowKey: (row: T) => string | number;
}

// Warna badge mengikuti token tema, bukan warna hardcoded — supaya badge
// tetap terbaca di mode gelap.
const WARNA_BADGE = {
  netral: 'outline',
  hijau: 'default',
  merah: 'destructive',
  kuning: 'secondary',
} as const;

export default function TabelPratinjau<T>({
  rows,
  columns,
  searchFields,
  searchPlaceholder,
  itemLabel,
  rowKey,
}: TabelPratinjauProps<T>) {
  // Kolom diubah ke bentuk yang diminta DataTableToolbar. Di-memo supaya
  // identitasnya stabil dan tidak memicu loop render di dalam hook.
  const defs: ColumnDef<T>[] = useMemo(
    () =>
      columns.map((c) => ({
        key: c.key,
        label: c.label,
        value: c.value,
        filterOptions: c.filterOptions,
      })),
    [columns]
  );

  const table = useDataTable(rows, defs, searchFields);
  const visible = table.rows;
  const hidden = table.hiddenColumns;
  const tampil = columns.filter((c) => !hidden.has(c.key));

  const renderCell = (row: T, kolom: KolomPratinjau<T>) => {
    const nilai = kolom.value(row);
    const kelasLebar = kolom.lebar ?? '';

    switch (kolom.jenis) {
      case 'foto': {
        const ada = nilai !== null && nilai !== '';
        return (
          <TableCell key={kolom.key}>
            {ada ? (
              // Pratinjau: belum ada berkas asli, jadi ditampilkan penanda
              // kotak, bukan <img> dengan src kosong — itu akan memicu
              // permintaan gagal ke server di setiap baris.
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground"
                title="Foto (pratinjau)"
              >
                FOTO
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        );
      }
      case 'badge': {
        if (nilai === null || nilai === '') {
          return (
            <TableCell key={kolom.key}>
              <span className="text-muted-foreground">—</span>
            </TableCell>
          );
        }
        const warna = kolom.warna?.(row) ?? 'netral';
        return (
          <TableCell key={kolom.key}>
            <Badge variant={WARNA_BADGE[warna]} className="whitespace-nowrap">
              {String(nilai)}
            </Badge>
          </TableCell>
        );
      }
      case 'angka':
        return (
          <TableCell key={kolom.key} className="text-right tabular-nums">
            {nilai === null || nilai === '' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              Number(nilai).toLocaleString('id-ID')
            )}
          </TableCell>
        );
      case 'uang':
        return (
          <TableCell key={kolom.key} className="whitespace-nowrap tabular-nums">
            {nilai === null || nilai === '' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              rupiah(Number(nilai))
            )}
          </TableCell>
        );
      case 'centang': {
        // Kolom "sudah divalidasi/diupload". Nilainya dikirim sebagai string
        // karena `value` pada ColumnDef hanya boleh string/angka/null —
        // boolean tidak masuk tipe itu (terbukti: tsc menolaknya).
        const ya = nilai === 'ya' || nilai === 1 || nilai === 'true';
        return (
          <TableCell key={kolom.key}>
            <Badge variant={ya ? 'default' : 'outline'}>{ya ? 'Ya' : 'Belum'}</Badge>
          </TableCell>
        );
      }
      default:
        return (
          <TableCell
            key={kolom.key}
            className={kelasLebar ? `${kelasLebar} truncate` : undefined}
            title={nilai === null ? undefined : String(nilai)}
          >
            {nilai === null || nilai === '' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              String(nilai)
            )}
          </TableCell>
        );
    }
  };

  return (
    <div className="space-y-4">
      <DataTableToolbar
        controls={table.controls}
        rows={rows}
        columns={defs}
        searchFields={searchFields}
        searchPlaceholder={searchPlaceholder}
        itemLabel={itemLabel}
      />

      <Card>
        <CardContent className="p-0">
          {/* Tabel lebar (modul Production punya 40 kolom) harus menggulir di
              dalam kartunya sendiri, bukan melebarkan seluruh halaman. */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {tampil.map((c) => (
                    <TableHead
                      key={c.key}
                      className={
                        c.jenis === 'angka'
                          ? 'whitespace-nowrap text-right'
                          : 'whitespace-nowrap'
                      }
                    >
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(tampil.length, 1)}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Tidak ada baris yang cocok.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((row) => (
                    <TableRow key={rowKey(row)}>
                      {tampil.map((c) => renderCell(row, c))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
