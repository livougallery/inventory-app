import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, Search, Hammer, Package, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// ===== Tipe data (mengikuti JSON /api/materials) =====

interface Material {
  id: number;
  kode_bahan: string | null;
  nama: string;
  tipe: string;
  tipe_label: string;
  satuan: string;
  stok: number | string;
  stok_minimum: number | null;
  varian_list: string;
  harga_terakhir: number | null;
  foto_path: string;
  updated_at: string | null;
}

const TIPE_OPTIONS = [
  { value: 'kain_roll', label: 'Fabric Roll' },
  { value: 'kain_ecer', label: 'Kain (Ecer)' },
  { value: 'aksesoris', label: 'Aksesoris' },
  { value: 'cmt_cost', label: 'Product Fulfillment' },
];

interface MaterialForm {
  kode_bahan: string;
  nama: string;
  tipe: string;
  satuan: string;
  stok_minimum: string;
}

const EMPTY_FORM: MaterialForm = { kode_bahan: '', nama: '', tipe: '', satuan: '', stok_minimum: '' };

// ===== Helper API =====
// Pola untuk halaman React lain: fetch JSON + CSRF fresh sebelum tiap mutasi
// (server merotasi token setelah setiap mutasi berhasil).

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok !== true) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

async function withCsrf(init: RequestInit = {}): Promise<RequestInit> {
  const { csrfToken } = await apiJson<{ csrfToken: string }>('/api/csrf');
  return {
    ...init,
    headers: { ...(init.headers ?? {}), 'x-csrf-token': csrfToken },
  };
}

const rupiah = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

const toNum = (v: number | string | null) => (v === null ? null : Number(v));

// ===== Halaman Master Data =====

export default function MasterData() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog tambah/edit
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MaterialForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog hapus
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await apiJson<{ data: Material[] }>('/api/materials');
      setMaterials(json.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const filtered = materials.filter((m) => {
    const q = searchTerm.toLowerCase();
    return (
      m.nama.toLowerCase().includes(q) ||
      (m.kode_bahan ?? '').toLowerCase().includes(q) ||
      m.varian_list.toLowerCase().includes(q)
    );
  });

  const outOfStock = materials.filter((m) => (toNum(m.stok) ?? 0) <= 0).length;
  const noPurchaseYet = materials.filter((m) => m.harga_terakhir === null).length;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditingId(m.id);
    setForm({
      kode_bahan: m.kode_bahan ?? '',
      nama: m.nama,
      tipe: m.tipe,
      satuan: m.satuan,
      stok_minimum: m.stok_minimum === null ? '' : String(m.stok_minimum),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.nama.trim() || !form.tipe || !form.satuan.trim()) {
      setFormError('Nama, tipe, dan satuan wajib diisi');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        kode_bahan: form.kode_bahan.trim() || null,
        nama: form.nama.trim(),
        tipe: form.tipe,
        satuan: form.satuan.trim(),
        stok_minimum: form.stok_minimum.trim() === '' ? null : Number(form.stok_minimum),
      };
      await apiJson(
        editingId === null ? '/api/materials' : `/api/materials/${editingId}`,
        await withCsrf({
          method: editingId === null ? 'POST' : 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
      setFormOpen(false);
      await loadMaterials();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await apiJson(`/api/materials/${deleting.id}`, await withCsrf({ method: 'DELETE' }));
      setDeleting(null);
      await loadMaterials();
    } catch (e) {
      // Pesan dari server (mis. masih dipakai pembelian/BOM) ditampilkan di dialog.
      setDeleting({ ...deleting });
      setFormError(e instanceof Error ? e.message : 'Gagal menghapus');
      setDeleteBusy(false);
    }
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Master Data</h1>
          <p className="text-sm text-muted-foreground">Kelola data induk material dan item lainnya</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Material
        </Button>
      </div>

      <Tabs defaultValue="material">
        <TabsList className="mb-4">
          <TabsTrigger value="material">Material</TabsTrigger>
          <TabsTrigger value="produk">Produk</TabsTrigger>
          <TabsTrigger value="komponen">Komponen</TabsTrigger>
        </TabsList>

        {/* ===== Tab Material ===== */}
        <TabsContent value="material" className="mt-0 space-y-4">
          {/* Ringkasan (dari data nyata) */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Material</CardTitle>
                <Hammer className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{materials.length}</div>
                <p className="text-xs text-muted-foreground">Bahan baku terdaftar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Stok Habis</CardTitle>
                <TriangleAlert className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{outOfStock}</div>
                <p className="text-xs text-muted-foreground">Material dengan stok ≤ 0</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Belum Ada Pembelian</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{noPurchaseYet}</div>
                <p className="text-xs text-muted-foreground">Belum punya harga terakhir</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabel */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <CardTitle>Data Material ({filtered.length})</CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari kode, nama, atau varian…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat data…
                </div>
              ) : loadError ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-red-600 mb-3">{loadError}</p>
                  <Button variant="outline" size="sm" onClick={loadMaterials}>Coba lagi</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Varian</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Harga Terakhir</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                          {materials.length === 0
                            ? 'Belum ada material. Klik "Tambah Material" untuk memulai.'
                            : 'Tidak ada yang cocok dengan pencarian.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono font-medium text-sm">{m.kode_bahan ?? '—'}</TableCell>
                          <TableCell className="font-medium">{m.nama}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{m.tipe_label}</Badge>
                          </TableCell>
                          <TableCell>{m.satuan}</TableCell>
                          <TableCell className="max-w-48 truncate text-muted-foreground" title={m.varian_list}>
                            {m.varian_list || '—'}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{Number(m.stok).toLocaleString('id-ID')}</span>
                            {(toNum(m.stok) ?? 0) <= 0 && (
                              <Badge variant="destructive" className="ml-2">Habis</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {m.harga_terakhir === null ? (
                              <span className="text-muted-foreground" title="Belum pernah ada pembelian">—</span>
                            ) : (
                              rupiah(Number(m.harga_terakhir))
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(m)} title="Edit">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setFormError(null); setDeleting(m); }} title="Hapus">
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab belum tersambung ===== */}
        <TabsContent value="produk" className="mt-0">
          <PlaceholderTab icon={<Package className="h-8 w-8" />} label="Produk" />
        </TabsContent>
        <TabsContent value="komponen" className="mt-0">
          <PlaceholderTab icon={<FileText className="h-8 w-8" />} label="Komponen" />
        </TabsContent>
      </Tabs>

      {/* Dialog Tambah/Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId === null ? 'Tambah Material' : `Edit — ${form.nama}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="kode_bahan">Kode Bahan</Label>
              <Input
                id="kode_bahan"
                placeholder="mis. KB-001 (boleh kosong)"
                value={form.kode_bahan}
                onChange={(e) => setForm({ ...form, kode_bahan: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nama">Nama Material *</Label>
              <Input
                id="nama"
                placeholder="mis. Kain Cotton Combed"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipe">Tipe *</Label>
                <select
                  id="tipe"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.tipe}
                  onChange={(e) => setForm({ ...form, tipe: e.target.value })}
                >
                  <option value="">— pilih —</option>
                  {TIPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="satuan">Satuan *</Label>
                <Input
                  id="satuan"
                  placeholder="mis. Roll, Yard, PCS"
                  value={form.satuan}
                  onChange={(e) => setForm({ ...form, satuan: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stok_minimum">Stok Minimum</Label>
              <Input
                id="stok_minimum"
                type="number"
                min="0"
                placeholder="mis. 50 (boleh kosong)"
                value={form.stok_minimum}
                onChange={(e) => setForm({ ...form, stok_minimum: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Stok tidak diedit di sini — stok mengikuti akumulasi pembelian &amp; produksi.
            </p>
            {formError && (
              <p className="text-sm text-red-600" role="alert">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>Batal</Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <LoaderCircle className="h-4 w-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi hapus */}
      <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus material?</DialogTitle>
          </DialogHeader>
          {deleting && (
            <p className="text-sm text-muted-foreground">
              {deleting.nama} ({deleting.kode_bahan ?? 'tanpa kode'}) akan dihapus permanen beserta variannya.
            </p>
          )}
          {formError && (
            <p className="text-sm text-red-600" role="alert">{formError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleteBusy}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy && <LoaderCircle className="h-4 w-4 mr-2 animate-spin" />}
              Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlaceholderTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="text-muted-foreground">{icon}</div>
        <p className="text-sm font-medium">Data {label.toLowerCase()} belum tersambung</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Bagian ini akan menyusul di gelombang migrasi berikutnya. Untuk sekarang, kelola material di tab Material.
        </p>
      </CardContent>
    </Card>
  );
}
