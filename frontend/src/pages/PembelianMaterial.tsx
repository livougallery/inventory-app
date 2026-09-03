import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ShoppingCart,
  LoaderCircle,
  TriangleAlert,
  Receipt,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTableToolbar,
  useDataTable,
  type ColumnDef,
} from '@/components/DataTableToolbar';
import CreatePoDialog from '@/components/CreatePoDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { apiJson, withCsrf } from '@/lib/api';
import { rupiah, toNum } from '@/lib/format';

// ===== Tipe data (mengikuti JSON /api/purchase-orders) =====

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

// Detail: PO lengkap dengan baris itemnya.
//
// vendor_id, currency_id, dan kurs_amount ikut dikirim GET /:id supaya form
// ubah (tiket 07) bisa mengisi nilai yang sudah tersimpan tanpa menebak-nebak.
//
// catatan_reject dan validator_name dikirim mulai tiket 08: alasan penolakan
// harus bisa dibaca orang yang membuat PO. Tanpa alasan yang bisa dibaca
// ulang, ia cuma melihat status "Ditolak" tanpa tahu apa yang salah.
interface PurchaseOrderDetail extends PurchaseOrder {
  vendor_id: number | null;
  currency_id?: number | null;
  kurs_amount?: number | string | null;
  catatan_reject?: string | null;
  validator_name?: string | null;
  items: Array<{
    id: number;
    qty: number | string;
    harga_satuan: number | string;
    subtotal: number | string;
    material_nama: string | null;
    satuan: string | null;
    raw_material_id?: number | null;
    variant_id?: number | null;
  }>;
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

  // Dialog buat PO (tiket 06).
  const [createOpen, setCreateOpen] = useState(false);

  // Ubah & hapus PO (tiket 07).
  //
  // Hanya PO berstatus `pending` yang boleh diubah atau dihapus — yang sudah
  // divalidasi barangnya sudah masuk stok. Penjagaan yang sesungguhnya ada di
  // server (409); penyembunyian tombol di sini hanya kenyamanan, bukan
  // pengaman. Halaman yang sudah terbuka bisa saja basi.
  const [editPo, setEditPo] = useState<PurchaseOrderDetail | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Gagal mengambil detail saat tombol Ubah ditekan — ditampilkan di daftar,
  // karena dialog belum terbuka.
  const [editError, setEditError] = useState<string | null>(null);

  // Validasi & penolakan (tiket 08).
  //
  // Tombolnya TIDAK disembunyikan berdasarkan role: klien tidak tahu role
  // siapa pun (tidak ada endpoint /api/me), dan menebak dari data yang sudah
  // dimuat akan memberi dua sumber kebenaran. Server yang memegang aturannya
  // — non-finance dijawab 403, dan pesannya ditampilkan di sini. Pola ini
  // sama dengan tiket 07: penjagaan ada di server, penyembunyian tombol
  // hanya kenyamanan.
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  // Kegagalan validasi ditampilkan di daftar, bukan menghilang diam-diam:
  // 409 berarti PO sudah diputuskan orang lain, dan itu perlu diketahui.
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Ubah: detail PO diambil dulu supaya form bisa mengisi nilai yang sudah
  // tersimpan (termasuk vendor_id dan per-baris item). Daftar tidak mengirim
  // itu semua, jadi harus dibaca ulang.
  const openEdit = useCallback(async (o: PurchaseOrder) => {
    setEditError(null);
    try {
      const json = await apiJson<{ data: PurchaseOrderDetail }>(`/api/purchase-orders/${o.id}`);
      setEditPo(json.data);
      setEditOpen(true);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Gagal memuat data PO');
    }
  }, []);

  // Hapus. Pesan penolakan dari server ditampilkan apa adanya — misalnya
  // "barangnya sudah tercatat di stok" jauh lebih berguna dari "gagal".
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const init = await withCsrf({ method: 'DELETE' });
      await apiJson(`/api/purchase-orders/${deleteTarget.id}`, init);
      setDeleteTarget(null);
      // Muat ulang daftar sekaligus menutup dialog detail kalau PO yang
      // dihapus sedang terbuka di situ.
      if (detailId === deleteTarget.id) closeDetail();
      await loadOrders();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Gagal menghapus purchase order');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, detailId, loadOrders]);

  // Validasi: setujui PO pending, barangnya masuk stok.
  //
  // Semua efek stok dilakukan server di dalam satu transaksi; halaman ini
  // tidak menghitung apa pun. Konfirmasi dipakai karena stok tidak bisa
  // dikembalikan lewat UI ini — membatalkan PO yang sudah divalidasi bukan
  // bagian tiket ini (lihat "Out of scope" di issue 08).
  const confirmValidate = useCallback(async () => {
    if (validatingId === null) return;
    setActionError(null);
    try {
      const init = await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await apiJson(`/api/purchase-orders/${validatingId}/validate`, init);
      setValidatingId(null);
      // Detail yang sedang terbuka ikut dimuat ulang supaya badge dan
      // daftar aksinya berubah tanpa reload halaman (AC tiket).
      if (detailId === validatingId) await openDetail(validatingId);
      await loadOrders();
    } catch (e) {
      setValidatingId(null);
      setActionError(e instanceof Error ? e.message : 'Gagal memvalidasi purchase order');
    }
  }, [validatingId, detailId, openDetail, loadOrders]);

  // Tolak: alasan wajib dikirim, karena penolakan tanpa penjelasan membuat
  // pembuat PO menebak-nebak apa yang salah.
  const confirmReject = useCallback(async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    setRejectError(null);
    try {
      const init = await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan: rejectReason.trim() }),
      });
      await apiJson(`/api/purchase-orders/${rejectTarget.id}/reject`, init);
      setRejectTarget(null);
      setRejectReason('');
      if (detailId === rejectTarget.id) await openDetail(rejectTarget.id);
      await loadOrders();
    } catch (e) {
      // Pesan server ditampilkan apa adanya: 409 menjelaskan PO sudah
      // diputuskan, 403 menjelaskan role tidak berhak. Keduanya bisa
      // ditindaklanjuti, berbeda dari "gagal" generik.
      setRejectError(e instanceof Error ? e.message : 'Gagal menolak purchase order');
    } finally {
      setRejecting(false);
    }
  }, [rejectTarget, rejectReason, detailId, openDetail, loadOrders]);

  // Opsi filter status: nilai unik dari data, dihitung sekali per perubahan data.
  const statusOptions = useMemo(
    () => [...new Set(orders.map((o) => o.status_label))].sort((a, b) => a.localeCompare(b, 'id')),
    [orders]
  );

  // Kolom aksi hanya berisi untuk PO pending. Kolomnya tetap dikirim untuk
  // semua baris supaya lebar tabel tidak berubah-ubah; isinya yang kosong.
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
      { key: 'aksi', label: 'Aksi', value: () => '' },
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
      case 'aksi':
        return (
          <TableCell key={key} className="text-right">
            {o.status === 'pending' ? (
              <div className="flex justify-end gap-1">
                {/* Validasi: hijau, karena ini tindakan yang diharapkan.
                    Urutan sengaja: validasi, tolak, ubah, hapus — dari yang
                    paling sering ke yang paling jarang. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionError(null);
                    setValidatingId(o.id);
                  }}
                  aria-label={`Validasi ${o.no_po}`}
                  title="Validasi: masukkan barang ke stok"
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRejectError(null);
                    setRejectReason('');
                    setRejectTarget(o);
                  }}
                  aria-label={`Tolak ${o.no_po}`}
                  title="Tolak purchase order"
                >
                  <X className="h-4 w-4 text-orange-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  // stopPropagation WAJIB: baris tabel membuka dialog detail
                  // pada klik. Tanpa ini satu klik memicu dua dialog
                  // bertumpuk — edit sekaligus detail.
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(o);
                  }}
                  aria-label={`Ubah ${o.no_po}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteError(null);
                    setDeleteTarget(o);
                  }}
                  aria-label={`Hapus ${o.no_po}`}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ) : null}
          </TableCell>
        );
      default:
        return null;
    }
  };

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pembelian Material</h1>
          <p className="text-sm text-muted-foreground">Catatan pembelian bahan baku (PO bahan baku)</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Buat PO
        </Button>
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
                {detail.validator_name && (
                  <span className="text-muted-foreground">
                    · Diputuskan oleh {detail.validator_name}
                  </span>
                )}
              </div>

              {/* Alasan penolakan: inti dari penolakan itu sendiri. Status
                  "Ditolak" tanpa alasan tidak memberi tahu pembuat PO apa
                  yang harus diperbaiki. */}
              {detail.status === 'rejected' && detail.catatan_reject && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-800">Alasan penolakan</p>
                  <p className="mt-1 text-sm text-red-900">{detail.catatan_reject}</p>
                </div>
              )}

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

              {/* Aksi validasi di dalam dialog detail, bukan cuma di baris
                  tabel. Inilah tempat keputusan diambil: finance membuka PO
                  untuk MEMERIKSA itemnya dulu, baru menyetujui. Kalau
                  aksinya cuma ada di baris, ia harus menutup dialog ini dan
                  mencari barisnya lagi — alur yang tiket maksud justru
                  terputus. */}
              {detail.status === 'pending' && (
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRejectError(null);
                      setRejectReason('');
                      setRejectTarget(detail);
                    }}
                  >
                    <X className="mr-1 h-4 w-4 text-orange-600" />
                    Tolak
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setValidatingId(detail.id);
                    }}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Validasi
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Gagal mengambil detail saat tombol Ubah ditekan. Ditampilkan di sini
          karena dialog belum terbuka, jadi pesannya tidak boleh hilang diam-diam. */}
      {editError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {editError}
        </p>
      )}

      {/* Kegagalan validasi. Sengaja tidak ditaruh di dalam dialog
          konfirmasi: dialognya sudah ditutup lebih dulu, jadi pesan di
          dalamnya tidak akan pernah terlihat. Kasus yang paling mungkin:
          409 karena PO baru saja divalidasi orang lain di tab/jendela lain,
          atau 403 karena akun ini bukan finance. */}
      {actionError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {/* Dialog buat PO. Daftar dimuat ulang setelah berhasil, supaya PO baru
          langsung muncul di tabel tanpa reload halaman. */}
      <CreatePoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadOrders}
      />

      {/* Dialog ubah PO — komponen yang sama dengan create, dibedakan oleh
          prop editPo. Sengaja tidak dibuat komponen terpisah: validasi dan
          hitung subtotal tidak boleh punya dua versi. */}
      <CreatePoDialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditPo(null);
        }}
        onCreated={loadOrders}
        editPo={editPo}
      />

      {/* Konfirmasi validasi. Dikonfirmasi karena barangnya langsung masuk
          stok dan tidak ada tombol batal di UI ini. */}
      <AlertDialog
        open={validatingId !== null}
        onOpenChange={(v) => {
          if (!v) setValidatingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validasi purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              Purchase order{' '}
              <span className="font-mono font-medium">
                {orders.find((o) => o.id === validatingId)?.no_po}
              </span>{' '}
              akan disetujui dan seluruh itemnya masuk ke stok material.
              Tindakan ini tidak bisa dibatalkan dari halaman ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => {
              e.preventDefault();
              confirmValidate();
            }}>
              Validasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alasan penolakan. Alasan WAJIB: PO yang ditolak tanpa penjelasan
          membuat pembuatnya menebak-nebak apa yang salah, padahal kebanyakan
          penolakan terjadi karena hal sepele yang mudah diperbaiki. */}
      <AlertDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => {
          if (!v) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              Purchase order{' '}
              <span className="font-mono font-medium">{rejectTarget?.no_po}</span>{' '}
              akan ditolak. Stok tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="alasan-tolak">Alasan penolakan</Label>
            <Textarea
              id="alasan-tolak"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Misal: harga di atas kesepakatan, mohon dicek ulang"
              rows={3}
            />
            {rejectError && (
              <p className="text-sm text-red-600" role="alert">
                {rejectError}
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Cegah dialog menutup sendiri sebelum permintaan selesai:
                // kalau server menolak (409/403), pesannya harus tetap
                // terbaca di dalam dialog.
                e.preventDefault();
                confirmReject();
              }}
              disabled={rejecting || rejectReason.trim() === ''}
            >
              {rejecting ? 'Menolak…' : 'Tolak PO'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konfirmasi hapus. Nomor PO disebut di kalimat konfirmasinya, karena
          menghapus PO yang salah tidak bisa dibatalkan. */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              Purchase order{' '}
              <span className="font-mono font-medium">{deleteTarget?.no_po}</span>{' '}
              akan dihapus beserta seluruh itemnya. Tindakan ini tidak bisa
              dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <p className="text-sm text-red-600" role="alert">
              {deleteError}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Cegah dialog menutup sendiri sebelum penghapusan selesai:
                // kalau server menolak, pesannya harus tetap terlihat.
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
