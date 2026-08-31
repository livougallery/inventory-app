import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  Filter,
  ListFilter,
  RotateCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ===== Tipe =====

export type SortDir = 'asc' | 'desc';

export interface ColumnDef<T> {
  /** Key unik kolom, dipakai untuk sort/filter/visibility. */
  key: string;
  /** Judul kolom, tampil di dropdown Sort/Kolom. */
  label: string;
  /** Ambil nilai pembanding dari satu baris (sort & filter). */
  value: (row: T) => string | number | null;
  /** Sediakan opsi bila kolom ini bisa difilter (dropdown nilai unik). */
  filterOptions?: string[];
  /** Cocokkan nilai baris dengan nilai terpilih (default: equality). */
  filterMatch?: (rowValue: string | number | null, selected: string) => boolean;
}

export interface DataTableState<T> {
  /** Baris hasil search/filter/sort, siap dirender. */
  rows: T[];
  /** Kolom yang disembunyikan user via dropdown Kolom. */
  hiddenColumns: Set<string>;
  /** Controls untuk diteruskan ke <DataTableToolbar controls={...} />. */
  controls: DataTableToolbarControls<T>;
}

export interface DataTableToolbarProps<T> {
  /** Data penuh hasil load API (sebelum search/filter/sort). */
  rows: T[];
  columns: ColumnDef<T>[];
  /** Kolom yang dicari oleh search box: label di kiri, fungsi ambil teks di kanan. */
  searchFields: { label: string; get: (row: T) => string }[];
  searchPlaceholder?: string;
  /** Label item, mis. "material" → "12 material". */
  itemLabel?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Slot untuk tombol aksi milik halaman (mis. "+ Tambah" di halaman lain). */
  actions?: React.ReactNode;
  /** Reset juga state internal toolbar (filter/sort) saat tombol refresh ditekan. */
  resetOnRefresh?: boolean;
}

// ===== Util =====

const displayValue = (v: string | number | null) => (v === null ? '' : String(v));

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

// ===== Hook: seluruh state & pipeline tabel =====
// State di sini (search/filter/sort/hidden) dipakai halaman via hook ini dan
// toolbar merender kontrolnya — tidak ada sinkronisasi via onChange, jadi
// tidak ada loop render.

export function useDataTable<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  searchFields: { label: string; get: (row: T) => string }[]
): DataTableState<T> {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleFilterValue = (colKey: string, option: string) => {
    setFilters((prev) => {
      const current = prev[colKey] ?? [];
      const next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      return { ...prev, [colKey]: next };
    });
  };

  const clearFilters = () => setFilters({});

  const toggleColumn = (colKey: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  };

  // Prune nilai filter yang nilainya sudah tidak ada di data — filter
  // "hantu" yang menyembunyikan semua baris tanpa terlihat.
  const prunedFilters = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [key, selected] of Object.entries(filters)) {
      const col = columns.find((c) => c.key === key);
      if (!col?.filterOptions) continue;
      const alive = selected.filter((s) => col.filterOptions!.includes(s));
      if (alive.length) out[key] = alive;
    }
    return out;
  }, [filters, columns]);

  const processed = useMemo(() => {
    let out = rows;

    // 1. Search: semua field yang didaftarkan.
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((row) => searchFields.some((f) => f.get(row).toLowerCase().includes(q)));
    }

    // 2. Filter per kolom.
    for (const [colKey, selected] of Object.entries(prunedFilters)) {
      const col = columns.find((c) => c.key === colKey);
      if (!col) continue;
      const match = col.filterMatch ?? ((v: string | number | null, s: string) => displayValue(v) === s);
      out = out.filter((row) => selected.some((s) => match(col.value(row), s)));
    }

    // 3. Sort.
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const dir = sort.dir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.value(a);
          const vb = col.value(b);
          if (va === null && vb === null) return 0;
          if (va === null) return 1; // null selalu paling bawah
          if (vb === null) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return displayValue(va).localeCompare(displayValue(vb), 'id') * dir;
        });
      }
    }

    return out;
  }, [rows, search, prunedFilters, sort, columns, searchFields]);

  return {
    rows: processed,
    hiddenColumns: hidden,
    controls: {
      search,
      setSearch,
      sort,
      setSort,
      filters,
      toggleFilterValue,
      clearFilters,
      hidden,
      toggleColumn,
      processedRows: processed,
      totalRows: rows.length,
    },
  };
}

// ===== Komponen toolbar =====
// Menerima state dari useDataTable (halaman memanggil hook, toolbar merender kontrol).

export interface DataTableToolbarControls<T> {
  search: string;
  setSearch: (v: string) => void;
  sort: { key: string; dir: SortDir } | null;
  setSort: (s: { key: string; dir: SortDir } | null) => void;
  filters: Record<string, string[]>;
  toggleFilterValue: (colKey: string, option: string) => void;
  clearFilters: () => void;
  hidden: Set<string>;
  toggleColumn: (colKey: string) => void;
  /** Baris hasil olahan — dipakai untuk export. */
  processedRows: T[];
  totalRows: number;
}

export function DataTableToolbar<T>({
  rows,
  columns,
  searchPlaceholder = 'Cari…',
  itemLabel = 'data',
  onRefresh,
  refreshing = false,
  actions,
  resetOnRefresh = false,
  controls,
}: DataTableToolbarProps<T> & { controls: DataTableToolbarControls<T> }) {
  const { search, setSearch, sort, setSort, filters, toggleFilterValue, clearFilters, hidden, toggleColumn, processedRows } = controls;

  const activeFilterCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0);

  const filteredOutCount = rows.length - processedRows.length;

  const handleRefresh = () => {
    if (resetOnRefresh) {
      clearFilters();
      setSort(null);
      setSearch('');
    }
    onRefresh?.();
  };

  const handleExport = () => {
    const visibleCols = columns.filter((c) => !hidden.has(c.key));
    const header = visibleCols.map((c) => c.label);
    const body = processedRows.map((row) => visibleCols.map((c) => c.value(row)));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`export-${stamp}.csv`, [header, ...body]);
  };

  const hasFilterable = columns.some((c) => c.filterOptions);

  return (
    <div className="space-y-3">
      {/* Baris toolbar utama */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Kiri: search */}
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-10"
          />
        </div>

        {/* Kanan: Filter, Sort, Kolom, Export, Refresh, [aksi halaman] */}
        <div className="flex flex-wrap items-center gap-2">
          {hasFilterable && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className={cn(activeFilterCount > 0 && 'border-primary/50 text-primary')}>
                    <Filter className="h-4 w-4" />
                    Filter
                    {activeFilterCount > 0 && (
                      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
                {columns.filter((c) => c.filterOptions).map((col) => {
                  const opts = col.filterOptions!;
                  const selected = filters[col.key] ?? [];
                  return (
                    // Group wajib: Label base-ui melempar error tanpa Menu.Group di atasnya
                    // (MenuGroupContext missing → crash white screen).
                    <DropdownMenuGroup key={col.key}>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{col.label}</DropdownMenuLabel>
                      {opts.map((opt) => (
                        <DropdownMenuCheckboxItem
                          key={opt}
                          checked={selected.includes(opt)}
                          onCheckedChange={() => toggleFilterValue(col.key, opt)}
                        >
                          {opt}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                    </DropdownMenuGroup>
                  );
                })}
                {activeFilterCount > 0 && (
                  <DropdownMenuItem onClick={clearFilters}>
                    <ListFilter className="h-4 w-4" /> Bersihkan semua filter
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className={cn(sort && 'border-primary/50 text-primary')}>
                  {sort?.dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : sort?.dir === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowDownUp className="h-4 w-4" />}
                  Sort
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Urutkan berdasarkan</DropdownMenuLabel>
                {columns.map((col) => {
                  const isCurrent = sort?.key === col.key;
                  const cycleSort = () => {
                    // Klik kolom sama: siklus asc → desc → mati. Kolom lain: mulai asc.
                    if (sort?.key !== col.key) { setSort({ key: col.key, dir: 'asc' }); return; }
                    if (sort.dir === 'asc') { setSort({ key: col.key, dir: 'desc' }); return; }
                    setSort(null);
                  };
                  return (
                    <DropdownMenuItem key={col.key} onClick={cycleSort}>
                      <span className="flex-1">{col.label}</span>
                      {isCurrent && (sort!.dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              {sort && (
                <DropdownMenuItem onClick={() => setSort(null)}>
                  <SlidersHorizontal className="h-4 w-4" /> Tanpa urutan
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className={cn(hidden.size > 0 && 'border-primary/50 text-primary')}>
                  <Columns3 className="h-4 w-4" />
                  Kolom
                  {hidden.size > 0 && <span className="ml-1 text-xs text-muted-foreground">({columns.length - hidden.size}/{columns.length})</span>}
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Tampilkan kolom</DropdownMenuLabel>
                {columns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={!hidden.has(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={handleExport} disabled={processedRows.length === 0}>
            <Download className="h-4 w-4" />
            Export
          </Button>

          {onRefresh && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RotateCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          )}

          {actions}
        </div>
      </div>

      {/* Info filter aktif */}
      {filteredOutCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {filteredOutCount} dari {rows.length} {itemLabel} tersembunyi oleh filter/pencarian.
        </p>
      )}
    </div>
  );
}
