import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Hammer, Package, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTableToolbar,
  useDataTable,
  type ColumnDef,
} from '@/components/DataTableToolbar';
import { apiJson, urlUnggahan } from '@/lib/api';
import { rupiah, toNum } from '@/lib/format';

// ===== Tipe data (mengikuti JSON /api/materials) =====

export interface Material {
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
  // Nama berkas foto material (tiket 11d). String KOSONG bila belum ada foto —
  // sengaja beda dari PO yang memakai null, karena endpoint /api/materials
  // menormalkannya dengan `|| ''` sejak sebelum tiket ini. Mengubahnya jadi
  // null akan merusak klien yang sudah ada.
  foto_path: string;
  updated_at: string | null;
  // ===== PRATINJAU TIKET 11e / 11f — BUKAN DATA NYATA =====
  // Nilai dua kolom ini diisi contoh di klien. Lihat blok "PRATINJAU" di
  // bawah sebelum memercayai isinya.
  jenis?: string | null;
  lokasi_nama?: string | null;
}

// ==========================================================================
// PRATINJAU TIKET 11e (Jenis) DAN 11f (Lokasi) — HAPUS BLOK INI SETELAH
// KEDUA KOLOM DIBACAKAN DARI API.
//
// Sengaja tidak menyentuh database: db.js menjalankan bootstrapSchema() saat
// boot, jadi mengubah skema berarti migrasi produksi otomatis. Tahap ini cuma
// memperlihatkan wujud kolomnya supaya bisa dinilai dulu, dengan nol risiko
// ke data. yang sebenarnya nanti: server yang mengirim `jenis` dan
// `lokasi_nama` (syarat tiket: nama lokasi diputuskan server-side).
//
// Nilai contohnya DITURUNKAN DARI KATEGORI ASLI tiap baris, bukan diacak.
// Tujuannya supaya pratinjau ini memperlihatkan aturan yang sudah disepakati
// — terutama bahwa Product Fulfillment (cmt_cost) TIDAK punya Jenis —
// bukan sekadar deretan teks yang kebetulan terisi.
// ==========================================================================

// Urutan sesuai daftar owner, 4 September 2026 (tiket 11e). Kain Pelapis
// sengaja di bawah Aksesoris meski namanya mengandung "Kain".
const JENIS_CONTOH: Record<string, string[]> = {
  kain: ['Roll', 'Ecer'],
  aksesoris: ['Hak Kait', 'Kancing', 'Resleting', 'Karet', 'Label', 'Renda', 'Kain Pelapis'],
};

const LOKASI_CONTOH = ['Gudang (Livou HQ Office)', 'Konveksi'];

// Keluarga kategori hari ini: kain_roll / kain_ecer / aksesoris / cmt_cost.
// Setelah tiket 11e, `tipe` menjadi tiga nilai — pemetaan ini ikut disederhanakan.
function keluargaKategori(tipe: string): 'kain' | 'aksesoris' | 'cmt_cost' {
  if (tipe === 'cmt_cost') return 'cmt_cost';
  return tipe.startsWith('kain') ? 'kain' : 'aksesoris';
}

function contohJenis(m: Material, indeks: number): string | null {
  const keluarga = keluargaKategori(m.tipe);
  // Product Fulfillment tidak punya Jenis — keputusan owner 4 September.
  // Ditampilkan sebagai em dash, persis seperti yang akan terjadi pada data
  // nyata nanti.
  if (keluarga === 'cmt_cost') return null;
  if (keluarga === 'kain') return m.tipe === 'kain_ecer' ? 'Ecer' : 'Roll';
  const daftar = JENIS_CONTOH.aksesoris;
  return daftar[indeks % daftar.length];
}

// Satu-satunya tempat nilai contoh disuntikkan. Menyambungkan ke database
// nanti cukup dengan menghapus pemanggilan ini.
function denganContoh(baris: Material[]): Material[] {
  return baris.map((m, i) => ({
    ...m,
    jenis: contohJenis(m, i),
    lokasi_nama: LOKASI_CONTOH[i % LOKASI_CONTOH.length],
  }));
}

const JENIS_OPTIONS = [...JENIS_CONTOH.kain, ...JENIS_CONTOH.aksesoris];

// ===== Halaman Stok Material =====

export default function StokMaterial() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const json = await apiJson<{ data: Material[] }>('/api/materials');
      // HAPUS denganContoh() saat tiket 11e/11f disambungkan ke database.
      setMaterials(denganContoh(json.data));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // Opsi filter kategori: nilai unik dari data, dihitung sekali per perubahan data.
  const kategoriOptions = useMemo(
    () => [...new Set(materials.map((m) => m.tipe_label))].sort((a, b) => a.localeCompare(b, 'id')),
    [materials]
  );

  const columns: ColumnDef<Material>[] = useMemo(
    () => [
      // Foto diletakkan pertama: baris tabel material paling mudah dikenali
      // dari wujudnya, dan kolom ini tidak bisa diurut atau difilter
      // (nilainya cuma "ada" atau "tidak ada"), jadi menaruhnya di ujung
      // hanya membuatnya tersembunyi di balik scroll.
      { key: 'foto', label: 'Foto', value: (m) => (m.foto_path ? 'ada' : null) },
      { key: 'kode_bahan', label: 'Kode', value: (m) => m.kode_bahan },
      { key: 'nama', label: 'Nama', value: (m) => m.nama },
      { key: 'tipe', label: 'Kategori', value: (m) => m.tipe_label, filterOptions: kategoriOptions },
      { key: 'jenis', label: 'Jenis', value: (m) => m.jenis ?? null, filterOptions: JENIS_OPTIONS },
      { key: 'lokasi', label: 'Lokasi', value: (m) => m.lokasi_nama ?? null, filterOptions: LOKASI_CONTOH },
      { key: 'satuan', label: 'Satuan', value: (m) => m.satuan },
      { key: 'varian', label: 'Varian', value: (m) => m.varian_list || null },
      { key: 'stok', label: 'Stok', value: (m) => toNum(m.stok) },
      { key: 'harga_terakhir', label: 'Harga Terakhir', value: (m) => m.harga_terakhir },
    ],
    [kategoriOptions]
  );

  const searchFields = useMemo(
    () => [
      { label: 'Nama', get: (m: Material) => m.nama },
      { label: 'Kode', get: (m: Material) => m.kode_bahan ?? '' },
      { label: 'Varian', get: (m: Material) => m.varian_list },
    ],
    []
  );

  // Pipeline search/filter/sort hidup di hook — identitas stabil, tanpa loop render.
  const table = useDataTable(materials, columns, searchFields);
  const visible = table.rows;
  const hidden = table.hiddenColumns;
  const { controls } = table;

  const outOfStock = materials.filter((m) => (toNum(m.stok) ?? 0) <= 0).length;
  const noPurchaseYet = materials.filter((m) => m.harga_terakhir === null).length;

  // Render satu kolom dari sebuah baris (dipakai body; header pakai daftar yang sama).
  const renderCell = (m: Material, key: string) => {
    switch (key) {
      case 'foto':
        return (
          <TableCell key={key}>
            {m.foto_path ? (
              // Thumbnail, bukan gambar utuh — tinggi baris tabel tidak boleh
              // berubah-ubah tergantung ada tidaknya foto.
              <a
                href={urlUnggahan(m.foto_path)}
                target="_blank"
                rel="noreferrer"
                title={`Foto ${m.nama}`}
              >
                <img
                  src={urlUnggahan(m.foto_path)}
                  alt={`Foto ${m.nama}`}
                  className="h-9 w-9 rounded border object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              // Em dash, BUKAN <img> dengan src kosong: itu akan memicu
              // permintaan gagal ke server dan menampilkan ikon gambar rusak
              // di setiap baris yang belum punya foto — yang hari ini semua.
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        );
      case 'kode_bahan':
        return <TableCell key={key} className="font-mono font-medium text-sm">{m.kode_bahan ?? '—'}</TableCell>;
      case 'nama':
        return <TableCell key={key} className="font-medium">{m.nama}</TableCell>;
      case 'tipe':
        return (
          <TableCell key={key}>
            <Badge variant="outline">{m.tipe_label}</Badge>
          </TableCell>
        );
      case 'jenis':
        return (
          <TableCell key={key} className="max-w-40 truncate" title={m.jenis ?? ''}>
            {m.jenis || '—'}
          </TableCell>
        );
      case 'lokasi':
        return (
          <TableCell key={key} className="whitespace-nowrap text-muted-foreground">
            {m.lokasi_nama || '—'}
          </TableCell>
        );
      case 'satuan':
        return <TableCell key={key}>{m.satuan}</TableCell>;
      case 'varian':
        return (
          <TableCell key={key} className="max-w-48 truncate text-muted-foreground" title={m.varian_list}>
            {m.varian_list || '—'}
          </TableCell>
        );
      case 'stok':
        return (
          <TableCell key={key}>
            <span className="font-medium">{Number(m.stok).toLocaleString('id-ID')}</span>
            {(toNum(m.stok) ?? 0) <= 0 && <Badge variant="destructive" className="ml-2">Habis</Badge>}
          </TableCell>
        );
      case 'harga_terakhir':
        return (
          <TableCell key={key}>
            {m.harga_terakhir === null ? (
              <span className="text-muted-foreground" title="Belum pernah ada pembelian">—</span>
            ) : (
              rupiah(Number(m.harga_terakhir))
            )}
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Stok Material</h1>
        <p className="text-sm text-muted-foreground">Ringkasan stok bahan baku terkini</p>
        {/* HAPUS bersama blok PRATINJAU. Sengaja mencolok: kolom Jenis dan
            Lokasi hari ini berisi nilai contoh, dan tanpa penanda ini tidak
            ada cara membedakannya dari data asli. */}
        <p className="mt-2 inline-flex rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Pratinjau: kolom <strong className="mx-1">Jenis</strong> dan{' '}
          <strong className="mx-1">Lokasi</strong> berisi nilai contoh, belum dari database.
        </p>
      </div>

      {/* Ringkasan (dari data nyata) */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Stok Material ({visible.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTableToolbar
            rows={materials}
            columns={columns}
            searchFields={searchFields}
            searchPlaceholder="Cari kode, nama, atau varian…"
            itemLabel="material"
            onRefresh={loadMaterials}
            refreshing={loading}
            resetOnRefresh
            controls={controls}
          />

          {loading && materials.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat data…
            </div>
          ) : loadError && materials.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600 mb-3">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadMaterials}>Coba lagi</Button>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={visibleColumns.length || 1} className="text-center py-10 text-sm text-muted-foreground">
                          {materials.length === 0
                            ? 'Belum ada material terdaftar.'
                            : 'Tidak ada yang cocok dengan pencarian/filter.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((m) => (
                        <TableRow key={m.id}>
                          {visibleColumns.map((c) => renderCell(m, c.key))}
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
    </>
  );
}
