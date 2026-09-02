import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building2, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTableToolbar,
  useDataTable,
  type ColumnDef,
} from '@/components/DataTableToolbar';
import { apiJson, withCsrf } from '@/lib/api';

// ===== Tipe data (mengikuti JSON /api/vendors dan skema tabel `vendors`) =====
//
// Kolom nyata: id, nama, alamat, kontak, tipe. Interface lama halaman ini
// memakai `nama_vendor` dan `status: 'active' | 'inactive'` — dua-duanya tidak
// pernah ada di database, jadi keduanya dibuang.

export interface Vendor {
  id: number;
  nama: string;
  alamat: string;
  kontak: string;
  /** Nilai kode di DB. Bukan label tampilan. */
  tipe: 'bahan_baku' | 'produksi' | 'import';
  /** Label tampilan yang dikirim API, mis. "White Label" untuk kode `import`. */
  tipe_label: string;
}

// Nilai kode → label tampilan. Harus sama dengan TIPE_LABEL di
// features/vendor/backend/routes.js: nilai kode tetap `import`, hanya
// labelnya yang "White Label" (spesifikasi keputusan 4 / tiket 04).
const TIPE_OPTIONS = [
  { value: 'bahan_baku', label: 'Bahan Baku' },
  { value: 'produksi', label: 'Produksi' },
  { value: 'import', label: 'White Label' },
] as const;

type TipeValue = (typeof TIPE_OPTIONS)[number]['value'];

// Turunan dari TIPE_OPTIONS, jadi label tidak bisa drift dari opsi yang
// ditampilkan. Dipakai SelectValue untuk mengubah kode jadi teks tampilan.
const tipeLabel: Record<TipeValue, string> = Object.fromEntries(
  TIPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<TipeValue, string>;

// ===== Form tambah/ubah =====

interface VendorFormState {
  nama: string;
  alamat: string;
  kontak: string;
  tipe: TipeValue;
}

const emptyForm: VendorFormState = { nama: '', alamat: '', kontak: '', tipe: 'bahan_baku' };

// ===== Halaman Vendor =====

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dialog: null = tertutup. 'create' = tambah, objek Vendor = ubah.
  const [dialog, setDialog] = useState<null | 'create' | Vendor>(null);
  const [form, setForm] = useState<VendorFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await apiJson<{ data: Vendor[] }>('/api/vendors');
      setVendors(json.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // Opsi filter tipe: selalu ketiganya, bukan nilai unik dari data — supaya
  // filter "Produksi" bisa dipilih walau di live DB belum ada vendor produksi.
  const tipeFilterOptions = useMemo(
    () => [...TIPE_OPTIONS.map((o) => o.label)].sort((a, b) => a.localeCompare(b, 'id')),
    []
  );

  const columns: ColumnDef<Vendor>[] = useMemo(
    () => [
      { key: 'nama', label: 'Nama Vendor', value: (v) => v.nama },
      { key: 'alamat', label: 'Alamat', value: (v) => v.alamat || null },
      { key: 'kontak', label: 'Kontak', value: (v) => v.kontak || null },
      {
        key: 'tipe',
        label: 'Tipe',
        // `tipe_label` dari server (konvensi StokMaterial), dengan jatuh balik
        // ke peta klien. Fallback ini menjaga badge dan opsi filter tetap dari
        // satu sumber: kalau server belum mengirim label, barisnya tidak
        // menjadi mustahil difilter.
        value: (v) => v.tipe_label ?? tipeLabel[v.tipe] ?? v.tipe,
        filterOptions: tipeFilterOptions,
      },
    ],
    [tipeFilterOptions]
  );

  const searchFields = useMemo(
    () => [
      { label: 'Nama', get: (v: Vendor) => v.nama },
      // `alamat` nullable di DB (TEXT DEFAULT ''), sementara useDataTable
      // memanggil .toLowerCase() langsung pada hasil get. Baris lama dengan
      // alamat NULL akan melempar saat mencari tanpa lindungan ini.
      { label: 'Alamat', get: (v: Vendor) => v.alamat ?? '' },
    ],
    []
  );

  const table = useDataTable(vendors, columns, searchFields);
  const visible = table.rows;
  const hidden = table.hiddenColumns;
  const { controls } = table;

  // ===== Simpan & hapus =====

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setDialog('create');
  };

  const openEdit = (vendor: Vendor) => {
    setForm({
      nama: vendor.nama,
      alamat: vendor.alamat ?? '',
      kontak: vendor.kontak ?? '',
      tipe: vendor.tipe,
    });
    setFormError(null);
    setDialog(vendor);
  };

  const closeDialog = () => {
    setDialog(null);
    setFormError(null);
  };

  const saveVendor = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = dialog !== null && dialog !== 'create';
      const path = isEdit ? `/api/vendors/${dialog.id}` : '/api/vendors';
      const method = isEdit ? 'PUT' : 'POST';

      // Token CSRF fresh tiap mutasi: server merotasi token setelah setiap
      // mutasi berhasil.
      const init = await withCsrf({
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: form.nama,
          alamat: form.alamat,
          kontak: form.kontak,
          tipe: form.tipe,
        }),
      });

      await apiJson(path, init);
      closeDialog();
      await loadVendors();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Gagal menyimpan vendor');
    } finally {
      setSaving(false);
    }
  };

  const deleteVendor = async (vendor: Vendor) => {
    // Konfirmasi dua langkah: hapus vendor menolak kalau masih dipakai
    // transaksi, tapi kalau tidak dipakai ia langsung hilang.
    if (!window.confirm(`Hapus vendor "${vendor.nama}"?`)) return;
    try {
      const init = await withCsrf({ method: 'DELETE' });
      await apiJson(`/api/vendors/${vendor.id}`, init);
      await loadVendors();
    } catch (e) {
      // Pesan penolakan dari server menyebut jumlah dan lokasi pemakaian.
      window.alert(e instanceof Error ? e.message : 'Gagal menghapus vendor');
    }
  };

  // ===== Render =====

  const renderCell = (v: Vendor, key: string) => {
    switch (key) {
      case 'nama':
        return (
          <TableCell key={key} className="font-medium">
            {v.nama}
          </TableCell>
        );
      case 'alamat':
        return (
          <TableCell key={key} className="max-w-56 truncate text-muted-foreground" title={v.alamat}>
            {v.alamat || '—'}
          </TableCell>
        );
      case 'kontak':
        return <TableCell key={key}>{v.kontak || '—'}</TableCell>;
      case 'tipe':
        return (
          <TableCell key={key}>
            <Badge variant="outline">{v.tipe_label ?? tipeLabel[v.tipe] ?? v.tipe}</Badge>
          </TableCell>
        );
      default:
        return null;
    }
  };

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));
  const dialogTitle = dialog === 'create' ? 'Tambah Vendor' : 'Ubah Vendor';

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor</h1>
          <p className="text-sm text-muted-foreground">Daftar vendor bahan baku, produksi, dan white label</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah Vendor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Semua Vendor ({visible.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTableToolbar
            rows={vendors}
            columns={columns}
            searchFields={searchFields}
            searchPlaceholder="Cari nama atau alamat…"
            itemLabel="vendor"
            onRefresh={loadVendors}
            refreshing={loading}
            resetOnRefresh
            controls={controls}
          />

          {loading && vendors.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat data…
            </div>
          ) : loadError && vendors.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-3 flex items-center justify-center gap-2 text-sm text-red-600">
                <TriangleAlert className="h-4 w-4" /> {loadError}
              </p>
              <Button variant="outline" size="sm" onClick={loadVendors}>
                Coba lagi
              </Button>
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
                        <TableHead key={c.key}>{c.label}</TableHead>
                      ))}
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={visibleColumns.length + 1}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          {vendors.length === 0 ? (
                            <span className="flex flex-col items-center gap-2">
                              <Building2 className="h-6 w-6" />
                              Belum ada vendor terdaftar.
                            </span>
                          ) : (
                            'Tidak ada vendor yang cocok dengan pencarian/filter.'
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((v) => (
                        <TableRow key={v.id}>
                          {visibleColumns.map((c) => renderCell(v, c.key))}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(v)}
                                aria-label={`Ubah ${v.nama}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteVendor(v)}
                                aria-label={`Hapus ${v.nama}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
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

      {/* Dialog tambah/ubah */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              Tipe menentukan di mana vendor ini muncul pada dropdown transaksi.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveVendor();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="vendor-nama">Nama</Label>
              <Input
                id="vendor-nama"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="Nama vendor"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-tipe">Tipe</Label>
              <Select
                value={form.tipe}
                onValueChange={(value) => setForm({ ...form, tipe: value as TipeValue })}
              >
                <SelectTrigger id="vendor-tipe" className="w-full">
                  {/* Fungsi child: tanpa ini, SelectValue menampilkan nilai
                      mentah ("bahan_baku"), bukan label Indonesianya. */}
                  <SelectValue>{(value) => tipeLabel[value as TipeValue] ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-alamat">Alamat</Label>
              <Input
                id="vendor-alamat"
                value={form.alamat}
                onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                placeholder="Alamat (opsional)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-kontak">Kontak</Label>
              <Input
                id="vendor-kontak"
                value={form.kontak}
                onChange={(e) => setForm({ ...form, kontak: e.target.value })}
                placeholder="Kontak (opsional)"
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" disabled={saving || form.nama.trim() === ''}>
                {saving ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
