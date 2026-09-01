import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShoppingCart, LoaderCircle, TriangleAlert, Receipt } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTableToolbar,
  useDataTable,
  type ColumnDef,
} from '@/components/DataTableToolbar';
import { apiJson } from '@/lib/api';
import { rupiah, toNum } from '@/lib/format';

// ===== Tipe data (mengikuti JSON /api/purchase-orders) =====

interface PurchaseOrderItem {
  id: number;
  qty: number;
  harga_satuan: number;
  subtotal: number;
  material_nama: string | null;
  satuan: string | null;
}

interface PurchaseOrder {
  id: number;
  no_po: string;
  tgl_beli: string;
  status: string;
  status_label: string;
  vendor_nama: string | null;
  creator_name: string | null;
  total: number | string;
}

// Detail: PO lengkap dengan baris itemnya. Field validasi (catatan_reject,
// validator_name) sengaja tidak diminta — itu ranah tiket 07.
interface PurchaseOrderDetail extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

// Hanya WARNA badge yang hidup di klien; labelnya datang dari `status_label`
// yang dikirim server (konvensi StokMaterial: server mengirim `*_label`,
// halaman merendernya). Jadi tidak ada dua tabel label yang bisa drift.
const STATUS_CLASS: Record<string, string> = {
  pending: 'border-transparent bg-yellow-100 text-yellow-800',
  validated: 'border-transparent bg-green-100 text-green-800',
  rejected: 'border-transparent bg-red-100 text-red-800',
  received: 'border-transparent bg-blue-100 text-blue-800',
};

// statusLabel dipakai sebagai jatuh balik bila server belum mengirim
// status_label, supaya barisnya tidak menjadi mustahil difilter.
const StatusBadge = ({ status, statusLabel }: { status: string; statusLabel?: string }) => (
  <Badge className={STATUS_CLASS[status]}>{statusLabel ?? status}</Badge>
);

// ===== Halaman Pembelian Material =====

export default function PembelianMaterial() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Detail: id yang sedang dibuka, null = dialog tertutup. Item diambil dari
  // endpoint detail saat dibuka, karena daftar tidak mengirimkannya.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await apiJson<{ data: PurchaseOrder[] }>('/api/purchase-orders');
      setOrders(json.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const openDetail = useCallback(async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const json = await apiJson<{ data: PurchaseOrderDetail }>(`/api/purchase-orders/${id}`);
      setDetail(json.data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Gagal memuat detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setDetailError(null);
  };

  // Opsi filter status: nilai unik dari data, dihitung sekali per perubahan data.
  const statusOptions = useMemo(
    () => [...new Set(orders.map((o) => o.status_label))].sort((a, b) => a.localeCompare(b, 'id')),
    [orders]
  );

  const columns: ColumnDef<PurchaseOrder>[] = useMemo(
    () => [
      { key: 'no_po', label: 'No. PO', value: (o) => o.no_po },
      { key: 'vendor', label: 'Vendor', value: (o) => o.vendor_nama ?? '' },
      { key: 'tgl_beli', label: 'Tanggal', value: (o) => o.tgl_beli },
      { key: 'total', label: 'Total', value: (o) => toNum(o.total) ?? 0 },
      {
        key: 'status',
        label: 'Status',
        value: (o) => o.status_label,
        filterOptions: statusOptions,
      },
      { key: 'creator', label: 'Dibuat Oleh', value: (o) => o.creator_name ?? '' },
    ],
    [statusOptions]
  );

  const searchFields = useMemo(
    () => [
      { label: 'No. PO', get: (o: PurchaseOrder) => o.no_po },
      // vendor_nama nullable (LEFT JOIN): baris dengan vendor yang sudah
      // dihapus akan melempar di useDataTable tanpa lindungan ini.
      { label: 'Vendor', get: (o: PurchaseOrder) => o.vendor_nama ?? '' },
    ],
    []
  );

  // Pipeline search/filter/sort hidup di hook — identitas stabil, tanpa loop render.
  const table = useDataTable(orders, columns, searchFields);
  const visible = table.rows;
  const hidden = table.hiddenColumns;
  const { controls } = table;

  const totalNilai = orders.reduce((sum, o) => sum + (toNum(o.total) ?? 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  // Render satu kolom dari sebuah baris (dipakai body; header pakai daftar yang sama).
  const renderCell = (o: PurchaseOrder, key: string) => {
    switch (key) {
      case 'no_po':
        return <TableCell key={key} className="font-mono font-medium text-sm">{o.no_po}</TableCell>;
      case 'vendor':
        return <TableCell key={key} className="font-medium">{o.vendor_nama || '—'}</TableCell>;
      case 'tgl_beli':
        return <TableCell key={key}>{o.tgl_beli}</TableCell>;
      case 'total':
        return <TableCell key={key} className="text-right whitespace-nowrap">{rupiah(toNum(o.total) ?? 0)}</TableCell>;
      case 'status':
        return (
          <TableCell key={key}>
            <StatusBadge status={o.status} statusLabel={o.status_label} />
          </TableCell>
        );
      case 'creator':
        return <TableCell key={key} className="text-muted-foreground">{o.creator_name || '—'}</TableCell>;
      default:
        return null;
    }
  };

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pembelian Material</h1>
        <p className="text-sm text-muted-foreground">Catatan pembelian bahan baku (PO bahan baku)</p>
      </div>

      {/* Ringkasan (dari data nyata) */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Purchase Order</CardTitle>
            <Receipt className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground">PO bahan baku tercatat</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Nilai</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rupiah(totalNilai)}</div>
            <p className="text-xs text-muted-foreground">Jumlah seluruh PO</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Menunggu Validasi</CardTitle>
            <TriangleAlert className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">PO berstatus Pending</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pembelian ({visible.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTableToolbar
            rows={orders}
            columns={columns}
            searchFields={searchFields}
            searchPlaceholder="Cari no. PO atau vendor…"
            itemLabel="PO"
            onRefresh={loadOrders}
            refreshing={loading}
            resetOnRefresh
            controls={controls}
          />

          {loading && orders.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat data…
            </div>
          ) : loadError && orders.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600 mb-3">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadOrders}>Coba lagi</Button>
            </div>
          ) : (
            <>
              {loadError && (
                <p className="text-sm text-red-600" role="alert">
                  Gagal memuat ulang: {loadError} — menampilkan data terakhir.
                </p>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((c) => (
                        <TableHead key={c.key} className={c.key === 'total' ? 'text-right' : undefined}>
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleColumns.length || 1} className="text-center py-10 text-sm text-muted-foreground">
                          {orders.length === 0
                            ? 'Belum ada pembelian material tercatat.'
                            : 'Tidak ada yang cocok dengan pencarian/filter.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((o) => (
                        <TableRow
                          key={o.id}
                          onClick={() => openDetail(o.id)}
                          // Baris bisa dibuka dengan keyboard juga, bukan hanya
                          // klik mouse — tanpa ini detail sama sekali tidak
                          // bisa dijangkau tanpa pointing device.
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(o.id);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Lihat detail ${o.no_po}`}
                          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {visibleColumns.map((c) => renderCell(o, c.key))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog detail: daftar item milik satu PO. */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {detail ? `Detail ${detail.no_po}` : 'Detail Purchase Order'}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.vendor_nama || '—'} · ${detail.tgl_beli}`
                : 'Memuat data purchase order…'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat detail…
            </div>
          )}

          {detailError && !detailLoading && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 mb-3">{detailError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => detailId !== null && openDetail(detailId)}
              >
                Coba lagi
              </Button>
            </div>
          )}

          {detail && !detailLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <StatusBadge status={detail.status} statusLabel={detail.status_label} />
                <span className="text-muted-foreground">
                  Dibuat oleh {detail.creator_name || '—'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Harga Satuan</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                          Purchase order ini belum memiliki item.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detail.items.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">{it.material_nama || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{it.satuan || '—'}</TableCell>
                          <TableCell className="text-right">{Number(it.qty).toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-right">{rupiah(Number(it.harga_satuan))}</TableCell>
                          <TableCell className="text-right font-medium">{rupiah(Number(it.subtotal))}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">Total</span>
                <span className="text-base font-bold">{rupiah(toNum(detail.total) ?? 0)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
