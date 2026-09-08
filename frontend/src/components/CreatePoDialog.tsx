import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { apiJson, withCsrf } from '@/lib/api';
import { rupiah } from '@/lib/format';
import CreatableSelect from '@/components/CreatableSelect';

// ===== Tipe =====

interface MaterialVariant {
  id: number;
  nama_varian: string;
  stok: number | string;
  satuan: string;
}

interface Material {
  id: number;
  nama: string;
  satuan: string;
  /** Array terstruktur; SELALU array (bisa kosong). Lihat /api/materials. */
  variants: MaterialVariant[];
}

interface Vendor {
  id: number;
  nama: string;
  tipe: string;
}

interface Currency {
  id: number;
  kode: string;
  nama: string;
  simbol: string;
}

// Opsi flow transaksi diambil dari server (GET /api/purchase-orders/
// flow-transaksi), bukan ditulis ulang di sini. Daftar yang sama dipakai
// server untuk memvalidasi tulis, jadi menyalinnya ke klien berarti dua
// daftar yang bisa berbeda — dan perbedaannya baru terasa saat form
// menawarkan nilai yang ditolak server. Lihat Vendors.tsx untuk contoh
// duplikasi semacam itu yang terlanjur ada.

// Baris item di form. qty/harga disimpan sebagai string supaya field bisa
// dikosongkan sementara saat diketik ulang tanpa langsung menjadi NaN/0.
interface ItemRow {
  /** Kunci stabil untuk React, bukan index — index akan bergeser saat hapus. */
  key: number;
  rawMaterialId: number | null;
  variantId: number | null;
  qty: string;
  hargaSatuan: string;
}

// ===== Util =====

let nextKey = 1;
const newRow = (): ItemRow => ({
  key: nextKey++,
  rawMaterialId: null,
  variantId: null,
  qty: '',
  hargaSatuan: '',
});

const toNumber = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Total dalam mata uang PO. Kalau currency bukan IDR, simbolnya dipakai —
// menampilkan "Rp" untuk nilai THB akan salah.
const formatMoney = (amount: number, currency: Currency | null) => {
  if (!currency || currency.kode === 'IDR') return rupiah(amount);
  return `${currency.simbol} ${amount.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
};

// ===== Komponen =====

// Satu komponen menangani create DAN edit (tiket 06 dan 07). Sengaja tidak
// dipisah: validasi, hitung subtotal, dan render baris item tidak boleh punya
// dua versi yang bisa berbeda pendapat. Yang membedakan hanya sumber nilai
// awal dan endpoint yang dipanggil saat menyimpan.
export interface EditablePo {
  id: number;
  vendor_id: number | null;
  no_po: string;
  tgl_beli: string;
  currency_id?: number | null;
  kurs_amount?: number | string | null;
  /** Sumber dana. '' bila belum diisi — kolomnya opsional. */
  flow_transaksi?: string | null;
  items?: Array<{
    // Sengaja boleh undefined: baris dari API bisa saja tidak mengirim field
    // ini, dan form harus tetap terbuka dengan dropdown kosong daripada crash.
    raw_material_id?: number | null;
    variant_id?: number | null;
    qty?: number | string | null;
    harga_satuan?: number | string | null;
  }>;
}

interface CreatePoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah PO tersimpan, supaya daftar dimuat ulang. */
  onCreated: () => void;
  /** Kalau diisi, dialog jadi mode ubah untuk PO ini. */
  editPo?: EditablePo | null;
}

export default function CreatePoDialog({ open, onOpenChange, onCreated, editPo = null }: CreatePoDialogProps) {
  const isEdit = editPo !== null;
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState<number | null>(null);
  const [noPo, setNoPo] = useState('');
  const [tglBeli, setTglBeli] = useState('');
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [kurs, setKurs] = useState('1');
  const [rows, setRows] = useState<ItemRow[]>([newRow()]);
  const [flowTransaksi, setFlowTransaksi] = useState<string>('');
  // Opsi flow transaksi ikut dimuat bersama opsi form lain. Gagal dimuat tidak
  // boleh menutup form: PO tetap bisa dibuat tanpa sumber dana, karena 11 PO
  // yang sudah ada pun tidak punya nilai ini.
  const [flowOptions, setFlowOptions] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Validasi hanya ditampilkan setelah tombol Simpan ditekan. */
  const [submitted, setSubmitted] = useState(false);

  // Opsi dropdown dimuat saat dialog dibuka, bukan saat halaman dimuat —
  // halaman daftar tidak perlu data ini sebelum form benar-benar dipakai.
  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      // allSettled, bukan all: vendor dan material WAJIB untuk mengisi PO, tapi
      // currency OPSIONAL (kurs default 1). Dengan Promise.all, kegagalan
      // endpoint currency saja akan menggagalkan seluruh form padahal PO tetap
      // bisa dibuat tanpanya.
      const [vendorRes, materialRes, currencyRes, flowRes] = await Promise.allSettled([
        // Hanya vendor bahan baku: vendor white label tidak pernah beli material
        // (spesifikasi keputusan 6 / tiket 04).
        apiJson<{ data: Vendor[] }>('/api/vendors?tipe=bahan_baku'),
        apiJson<{ data: Material[] }>('/api/materials'),
        apiJson<{ data: Currency[] }>('/api/currencies'),
        apiJson<{ data: string[] }>('/api/purchase-orders/flow-transaksi'),
      ]);

      if (vendorRes.status === 'rejected') throw vendorRes.reason;
      if (materialRes.status === 'rejected') throw materialRes.reason;

      setVendors(vendorRes.value.data);
      setMaterials(materialRes.value.data);
      // Currency dan flow transaksi OPSIONAL, jadi keduanya gagal sendiri-sendiri
      // tanpa menutup form — beda dengan vendor dan material yang wajib. PO
      // tetap bisa dibuat dengan mata uang default (IDR, kurs 1) dan tanpa
      // sumber dana.
      setCurrencies(currencyRes.status === 'fulfilled' ? currencyRes.value.data : []);
      setFlowOptions(flowRes.status === 'fulfilled' ? flowRes.value.data : []);
    } catch (e) {
      setOptionsError(e instanceof Error ? e.message : 'Gagal memuat data form');
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadOptions();
  }, [open, loadOptions]);

  // Form diisi ulang tiap kali dibuka: kosong untuk PO baru, atau nilai PO
  // yang ada untuk mode ubah. Tanpa ini, PO berikutnya akan mewarisi isian
  // sebelumnya.
  useEffect(() => {
    if (!open) return;

    if (editPo) {
      setVendorId(editPo.vendor_id);
      setNoPo(editPo.no_po ?? '');
      setTglBeli(editPo.tgl_beli ?? '');
      setCurrencyId(editPo.currency_id ?? null);
      setKurs(editPo.kurs_amount != null ? String(editPo.kurs_amount) : '1');
      // `?? ''` menormalkan null jadi string kosong. Field ini dideklarasikan
      // nullable di EditablePo karena API memang bisa mengirim NULL untuk PO
      // lama, sedangkan state dropdownnya bertipe string — normalisasi
      // dilakukan sekali di sini supaya seluruh form di bawahnya hanya perlu
      // menangani satu keadaan, bukan dua.
      setFlowTransaksi(editPo.flow_transaksi ?? '');
      // Baris item dari detail PO. Dezimal dari Postgres dikembalikan sebagai
      // string oleh pg, jadi ditampilkan apa adanya tanpa diubah ke angka.
      setRows(
        editPo.items && editPo.items.length > 0
          ? editPo.items.map((it) => ({
              key: nextKey++,
              // `?? null`, bukan nilai apa adanya: field bisa saja tidak
              // dikirim, dan ItemRow menuntut null bukan undefined supaya
              // perbandingan di bawahnya tidak perlu menangani dua keadaan.
              rawMaterialId: it.raw_material_id ?? null,
              variantId: it.variant_id ?? null,
              qty: it.qty != null ? String(it.qty) : '',
              hargaSatuan: it.harga_satuan != null ? String(it.harga_satuan) : '',
            }))
          : [newRow()]
      );
    } else {
      setVendorId(null);
      setNoPo('');
      setTglBeli(new Date().toISOString().split('T')[0]);
      setCurrencyId(null);
      setKurs('1');
      setRows([newRow()]);
      setFlowTransaksi('');
    }
    setFormError(null);
    setSubmitted(false);
  }, [open, editPo]);

  // ===== Baris item =====

  const updateRow = (key: number, patch: Partial<ItemRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Mengganti material WAJIB mengosongkan varian: varian milik material
        // lama tidak berlaku lagi, dan server akan menolaknya (400). Mengosongkan
        // di sini mencegah pengguna mengirim kombinasi yang pasti gagal.
        if (patch.rawMaterialId !== undefined && patch.rawMaterialId !== r.rawMaterialId) {
          next.variantId = null;
        }
        return next;
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (key: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const variantsOf = useMemo(() => {
    const map = new Map<number, MaterialVariant[]>();
    for (const m of materials) map.set(m.id, m.variants ?? []);
    return map;
  }, [materials]);

  // ===== Validasi =====

  const rowProblems = useMemo(
    () =>
      rows.map((r) => ({
        material: r.rawMaterialId === null,
        qty: toNumber(r.qty) === null,
        harga: toNumber(r.hargaSatuan) === null,
      })),
    [rows]
  );

  const isValid =
    vendorId !== null &&
    noPo.trim() !== '' &&
    tglBeli.trim() !== '' &&
    rows.length > 0 &&
    rowProblems.every((p) => !p.material && !p.qty && !p.harga);

  const rowSubtotal = (r: ItemRow) => {
    const qty = toNumber(r.qty);
    const harga = toNumber(r.hargaSatuan);
    return qty !== null && harga !== null ? qty * harga : 0;
  };

  const total = rows.reduce((sum, r) => sum + rowSubtotal(r), 0);

  const selectedCurrency = currencies.find((c) => c.id === currencyId) ?? null;
  const kursNumber = toNumber(kurs);

  // ===== Simpan =====

  const submit = async () => {
    setSubmitted(true);
    if (!isValid) return;

    setSaving(true);
    setFormError(null);
    try {
      const init = await withCsrf({
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: vendorId,
          no_po: noPo.trim(),
          tgl_beli: tglBeli,
          currency_id: currencyId,
          kurs_amount: kursNumber,
          // '' dikirim apa adanya saat dropdown dikosongkan — server
          // memperlakukannya sebagai "tidak diisi", bukan sebagai nilai.
          flow_transaksi: flowTransaksi,
          items: rows.map((r) => ({
            raw_material_id: r.rawMaterialId,
            // null dikirim apa adanya; server menyimpannya sebagai NULL.
            variant_id: r.variantId,
            qty: toNumber(r.qty),
            harga_satuan: toNumber(r.hargaSatuan),
          })),
        }),
      });

      await apiJson(
        isEdit ? `/api/purchase-orders/${editPo.id}` : '/api/purchase-orders',
        init
      );
      onOpenChange(false);
      onCreated();
    } catch (e) {
      // Pesan dari server ditampilkan apa adanya. Tiket 07 mensyaratkan ini:
      // penolakan karena PO sudah divalidasi harus menjelaskan alasannya
      // (stok sudah tercatat), bukan diganti pesan generik.
      setFormError(e instanceof Error ? e.message : 'Gagal menyimpan purchase order');
    } finally {
      setSaving(false);
    }
  };

  const showError = (condition: boolean) => submitted && condition;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Ubah ${editPo.no_po}` : 'Buat Purchase Order'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Ubah catatan pembelian bahan baku. Item diganti sebagai satu set.'
              : 'Catat pembelian bahan baku. Subtotal tiap baris dihitung server.'}
          </DialogDescription>
        </DialogHeader>

        {optionsLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Menyiapkan form…
          </div>
        )}

        {optionsError && !optionsLoading && (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-red-600">{optionsError}</p>
            <Button variant="outline" size="sm" onClick={loadOptions}>
              Coba lagi
            </Button>
          </div>
        )}

        {!optionsLoading && !optionsError && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {/* ===== Header PO ===== */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="po-vendor">Vendor</Label>
                <CreatableSelect
                  id="po-vendor"
                  value={vendorId}
                  onChange={setVendorId}
                  options={vendors.map((v) => ({ id: v.id, label: v.nama }))}
                  placeholder="Pilih vendor"
                  namaEntitas="vendor"
                  endpoint="/api/vendors"
                  // Tipe vendor dikirim tetap `bahan_baku` karena form ini
                  // hanya memuat vendor bahan baku (lihat loadOptions). Field
                  // wajib di server, jadi tidak boleh dibiarkan kosong.
                  fieldTambahan={[{ name: 'tipe', label: 'tipe', defaultValue: 'bahan_baku', fixed: true }]}
                  onCreated={loadOptions}
                />
                {showError(vendorId === null) && (
                  <p className="text-xs text-red-600">Vendor wajib dipilih</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-nomor">No. PO</Label>
                <Input
                  id="po-nomor"
                  value={noPo}
                  onChange={(e) => setNoPo(e.target.value)}
                  placeholder="PO-001"
                />
                {showError(noPo.trim() === '') && (
                  <p className="text-xs text-red-600">No. PO wajib diisi</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-tanggal">Tanggal</Label>
                <Input
                  id="po-tanggal"
                  type="date"
                  value={tglBeli}
                  onChange={(e) => setTglBeli(e.target.value)}
                />
                {showError(tglBeli.trim() === '') && (
                  <p className="text-xs text-red-600">Tanggal wajib diisi</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-flow">Flow Transaksi</Label>
                <Select
                  value={flowTransaksi === '' ? 'none' : flowTransaksi}
                  // `v` bisa null: base-ui mengirim null saat pilihan
                  // dibatalkan, bukan cuma string. Tanpa penjaga ini,
                  // TypeScript menolaknya — dan dengan tepat, karena
                  // menyimpan null ke state string akan membuat perbandingan
                  // `flowTransaksi === ''` di atas gagal mendeteksi keadaan
                  // kosong.
                  onValueChange={(v) => setFlowTransaksi(!v || v === 'none' ? '' : v)}
                >
                  <SelectTrigger id="po-flow" className="w-full">
                    {/* Nilainya sudah label tampilan, jadi tidak perlu peta
                        kode→label seperti dropdown vendor. */}
                    <SelectValue placeholder="Belum diisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belum diisi</SelectItem>
                    {flowOptions.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sumber dana untuk PO ini.
                </p>
              </div>
            </div>

            {/* ===== Currency & kurs ===== */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="po-currency">Currency</Label>
                <Select
                  value={currencyId === null ? null : String(currencyId)}
                  onValueChange={(v) => {
                    // 'none' → kurs dikembalikan ke 1, karena kurs hanya
                    // bermakna untuk mata uang asing.
                    if (v === 'none') {
                      setCurrencyId(null);
                      setKurs('1');
                    } else {
                      setCurrencyId(Number(v));
                    }
                  }}
                >
                  <SelectTrigger id="po-currency" className="w-full">
                    <SelectValue placeholder="IDR (default)">
                      {(value) => {
                        if (!value || value === 'none') return 'IDR (default)';
                        const c = currencies.find((x) => String(x.id) === String(value));
                        return c ? `${c.kode} — ${c.nama}` : 'IDR (default)';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">IDR — Rupiah (default)</SelectItem>
                    {currencies.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.kode} — {c.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-kurs">Kurs</Label>
                <Input
                  id="po-kurs"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={kurs}
                  onChange={(e) => setKurs(e.target.value)}
                  disabled={currencyId === null}
                />
                <p className="text-xs text-muted-foreground">
                  {currencyId === null
                    ? 'Kurs hanya dipakai untuk mata uang asing.'
                    : 'Nilai 1 unit mata uang asing dalam Rupiah.'}
                </p>
                {showError(currencyId !== null && kursNumber === null) && (
                  <p className="text-xs text-red-600">Kurs harus angka lebih dari 0</p>
                )}
              </div>
            </div>

            {/* ===== Item ===== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Item</Label>
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="mr-1 h-4 w-4" /> Tambah Item
                </Button>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => {
                  const problems = rowProblems[index];
                  const rowVariants = row.rawMaterialId === null
                    ? []
                    : variantsOf.get(row.rawMaterialId) ?? [];
                  // Nol varian adalah keadaan NORMAL hari ini — semua 7 material
                  // di database live punya nol varian. Dropdown dinonaktifkan dan
                  // diberi keterangan; barisnya tetap bisa dipakai dan tetap bisa
                  // disimpan.
                  const noVariants = rowVariants.length === 0;

                  return (
                    <div
                      key={row.key}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:items-end"
                    >
                      <div className="space-y-1 sm:col-span-4">
                        <Label className="text-xs" htmlFor={`material-${row.key}`}>
                          Material
                        </Label>
                        <CreatableSelect
                          id={`material-${row.key}`}
                          value={row.rawMaterialId}
                          onChange={(id) => updateRow(row.key, { rawMaterialId: id })}
                          options={materials.map((m) => ({ id: m.id, label: m.nama }))}
                          placeholder="Pilih material"
                          namaEntitas="material"
                          endpoint="/api/materials"
                          // `tipe` dan `satuan` wajib di server (400 kalau
                          // kosong), jadi keduanya ditanyakan di sini —
                          // kalau tidak, material baru selalu gagal dibuat
                          // dengan pesan yang tidak jelas asalnya.
                          fieldTambahan={[
                            {
                              name: 'tipe',
                              label: 'Tipe',
                              options: [
                                { value: 'kain_roll', label: 'Fabric Roll' },
                                { value: 'kain_ecer', label: 'Kain (Ecer)' },
                                { value: 'aksesoris', label: 'Aksesoris' },
                                { value: 'cmt_cost', label: 'Product Fulfillment' },
                              ],
                            },
                            { name: 'satuan', label: 'Satuan', defaultValue: 'pcs' },
                          ]}
                          onCreated={loadOptions}
                        />
                        {showError(problems.material) && (
                          <p className="text-xs text-red-600">Material wajib dipilih</p>
                        )}
                      </div>

                      <div className="space-y-1 sm:col-span-3">
                        <Label className="text-xs" htmlFor={`variant-${row.key}`}>
                          Varian (opsional)
                        </Label>
                        <Select
                          value={row.variantId === null ? 'none' : String(row.variantId)}
                          onValueChange={(v) =>
                            updateRow(row.key, { variantId: v === 'none' ? null : Number(v) })
                          }
                          // Dropdown tanpa isi akan terlihat rusak, jadi
                          // dinonaktifkan saat material tidak punya varian.
                          disabled={noVariants}
                        >
                          <SelectTrigger id={`variant-${row.key}`} className="w-full">
                            {/* Fungsi child WAJIB: tanpa ini SelectValue
                                menampilkan nilai mentah ("902"), bukan nama
                                variannya. Pola sama dengan Vendors.tsx. */}
                            <SelectValue placeholder="Tanpa varian">
                              {(value) => {
                                if (!value || value === 'none') return 'Tanpa varian';
                                const v = rowVariants.find((x) => String(x.id) === String(value));
                                return v ? v.nama_varian : 'Tanpa varian';
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Tanpa varian</SelectItem>
                            {rowVariants.map((v) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.nama_varian}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {noVariants && (
                          <p className="text-xs text-muted-foreground">
                            Material ini belum punya varian
                          </p>
                        )}
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs" htmlFor={`qty-${row.key}`}>
                          Qty
                        </Label>
                        <Input
                          id={`qty-${row.key}`}
                          type="number"
                          step="any"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                          className="text-right"
                        />
                        {showError(problems.qty) && (
                          <p className="text-xs text-red-600">Qty harus &gt; 0</p>
                        )}
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs" htmlFor={`harga-${row.key}`}>
                          Harga Satuan
                        </Label>
                        <Input
                          id={`harga-${row.key}`}
                          type="number"
                          step="any"
                          min="0"
                          value={row.hargaSatuan}
                          onChange={(e) => updateRow(row.key, { hargaSatuan: e.target.value })}
                          className="text-right"
                        />
                        {showError(problems.harga) && (
                          <p className="text-xs text-red-600">Harga harus &gt; 0</p>
                        )}
                      </div>

                      <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                        <span className="text-xs text-muted-foreground sm:hidden">Subtotal</span>
                        <span className="text-sm font-medium whitespace-nowrap">
                          {formatMoney(rowSubtotal(row), selectedCurrency)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length === 1}
                          aria-label={`Hapus item ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===== Total ===== */}
            <div className="flex flex-col items-end gap-1 border-t pt-3">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium">Total PO</span>
                <span className="text-lg font-bold">
                  {formatMoney(total, selectedCurrency)}
                </span>
              </div>
              {/* Nilai Rupiah ditampilkan terpisah, bukan menggantikan total:
                  total PO tercatat dalam mata uang yang dipilih. */}
              {selectedCurrency && selectedCurrency.kode !== 'IDR' && kursNumber !== null && (
                <span className="text-xs text-muted-foreground">
                  ≈ {rupiah(total * kursNumber)} (kurs {kursNumber.toLocaleString('id-ID')})
                </span>
              )}
            </div>

            {formError && (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
