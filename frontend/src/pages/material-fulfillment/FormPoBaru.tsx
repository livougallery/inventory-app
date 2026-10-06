import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Trash2, TriangleAlert } from 'lucide-react';
import { apiJson } from '@/lib/api';
import type { Vendor } from '@/pages/Vendors';
import { BarisTambah, TabelItem, TombolTambah } from './PopupPo';
import type { BarisItem, KartuPo } from './data-po';
import { KATEGORI, jenisUntuk } from './data-po';

// ===== Form PO baru =====
//
// Alur membuat PO pertama kali. Berdiri sendiri dari popup, tapi BUKAN
// versinya sendiri: ia memakai `TabelItem`, `BarisTambah`, `TombolTambah`, dan
// `barisKosong` yang sama dengan popup. Itu disengaja — kalau tabel item punya
// dua salinan, keduanya akan berbeda begitu ada yang diubah di satu tempat,
// dan itu persis kelas bug yang paling mahal di halaman ini.
//
// Yang TIDAK ada di sini, dan itu bukan kelupaan:
//
//   - Tombol untuk memindahkan tahap. PO baru SELALU lahir di Proposed
//     (`kartuBaru()` di `data-po.ts:555`), dan majulah lewat popup.
//   - Bagian Dokumen. Tidak ada invoice saat PO masih usulan; bagian itu
//     muncul nanti di tahap Ordered (`bolehUnggah`).
//   - Kolom centang "Datang". Ia cuma hidup di Received, dan `bolehDatang`
//     di bawah sengaja false.

/** Data form yang dipakai `kartuBaru()` — tanpa `id` dan `stage`. */
export type DataPoBaru = Omit<KartuPo, 'id' | 'stage' | 'items'> & { items: BarisItem[] };

const KOSONG = {
  kategori: 'kain',
  jenis: 'Roll',
  noPo: '',
  vendor: '',
  tglPo: '',
  pic: '',
  inisial: '',
  catatan: '',
  workcodes: [] as string[],
  fotoNota: null,
  buktiBayar: null,
} satisfies Omit<DataPoBaru, 'items'>;

/**
 * Berapa PO yang boleh dibuat di satu sesi.
 *
 * Tidak ada batas dari server — PO baru disimpan in-memory dan hilang saat
 * refresh. Tanpa batas, satu klik yang salah (atau papan yang sengaja
 * dicoba diklik-klik) menumpuk puluhan kartu contoh yang tak bisa dihapus
 * dari mana pun. Karena itu form menolak membuat kartu kedua; kalau owner
 * butuh lebih, ini yang harus diubah, bukan diam-diam dibiarkan menumpuk.
 */
const MAKS_BARU = 1;

function inisialDari(nama: string): string {
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Badan form, TANPA `Dialog`.
 *
 * Sama seperti `IsiPopup`: `DialogContent` dirender lewat portal, dan portal
 * tidak ikut muncul di `renderToStaticMarkup`. Kalau form-nya tidak dipisah,
 * smoke test yang merendernya hanya akan melihat `<div></div>` dan semua
 * pemeriksaan isinya akan lulus karena tidak menemukan apa pun.
 */
export function IsiFormPoBaru({
  onSimpan,
  sudahAda,
}: {
  onSimpan: (data: DataPoBaru) => void;
  /** Sudah ada PO baru di sesi ini — form berhenti menerima Input baru. */
  sudahAda: boolean;
}) {
  const [kategori, setKategori] = useState(KOSONG.kategori);
  const [jenis, setJenis] = useState(KOSONG.jenis);
  const [noPo, setNoPo] = useState('');
  const [vendor, setVendor] = useState('');
  const [tglPo, setTglPo] = useState('');
  const [pic, setPic] = useState('');
  const [catatan, setCatatan] = useState('');
  const [workcodes, setWorkcodes] = useState<string[]>([]);
  const [workcodeBaru, setWorkcodeBaru] = useState('');
  const [items, setItems] = useState<BarisItem[]>([]);

  // Vendor diambil dari master, bukan diketik. Satu PO = satu vendor (aturan 1
  // di `data-po.ts`), jadi daftar ini juga membatasi: satu PO tidak bisa punya
  // dua vendor berbeda, dan namanya tidak bisa salah ketik lalu tidak
  // nyambung ke tabel vendors.
  const [vendorList, setVendorList] = useState<Vendor[] | null>(null);
  const [vendorGagal, setVendorGagal] = useState<string | null>(null);

  const muatVendor = useCallback(async () => {
    setVendorGagal(null);
    try {
      const json = await apiJson<{ data: Vendor[] }>('/api/vendors');
      setVendorList(json.data);
    } catch (e) {
      setVendorList(null);
      setVendorGagal(e instanceof Error ? e.message : 'Gagal memuat daftar vendor');
    }
  }, []);

  useEffect(() => {
    void muatVendor();
  }, [muatVendor]);

  // Kategori menentukan isi baris item (aturan 2 di `data-po.ts`). Mengganti
  // kategori mengosongkan baris dan me-reset jenis — kalau tidak, satu PO bisa
  // diam-diam punya material dari dua kategori, dan kolom "Kategori" di atas
  // jadi berbohong.
  function gantiKategori(v: string | null) {
    if (v === null) return;
    setKategori(v);
    setJenis(jenisUntuk(v)[0] ?? '');
    setItems([]);
  }

  // Kartu sementara untuk `TabelItem`, yang butuh `kartu.kategori` (untuk satuan
  // bawaan dan saringan master) dan `kartu.id` (untuk kunci centang datang).
  // Id-nya konstan dan tidak pernah ikut disimpan.
  const kartuSementara = useMemo<KartuPo>(
    () => ({
      id: 'po-baru',
      stage: 'diajukan',
      kategori,
      jenis,
      noPo,
      vendor,
      tglPo,
      pic,
      inisial: inisialDari(pic),
      catatan,
      workcodes,
      items,
      fotoNota: null,
      buktiBayar: null,
    }),
    [kategori, jenis, noPo, vendor, tglPo, pic, catatan, workcodes, items]
  );

  function tambahWorkcode() {
    const w = workcodeBaru.trim();
    if (!w) return;
    setWorkcodes((lama) => [...lama, w]);
    setWorkcodeBaru('');
  }

  const jenisOpsi = jenisUntuk(kategori);

  // Tanpa item, PO-nya belum berarti apa-apa: tidak ada yang bisa datang, dan
  // popup-nya sendiri menolak membuka tahap berikutnya (`bisaLanjut` di
  // `PopupPo.tsx:648` memakai `items.length > 0`). Jadi form menolak lebih
  // awal, di tempat yang masih bisa dibatalkan.
  const alasanTidakBisaSimpan = sudahAda
    ? `Sudah ada ${MAKS_BARU} PO baru di sesi ini. Muat ulang halaman untuk mulai lagi.`
    : !noPo.trim() || !vendor
      ? 'No. PO dan Vendor wajib diisi.'
      : items.length === 0
        ? 'Tambahkan minimal satu baris material.'
        : null;

  return (
    <div className="space-y-3">
      {/* ===== Informasi Pembelian ===== */}
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Informasi Pembelian
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={kategori} onValueChange={gantiKategori}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KATEGORI.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baru-jenis">Jenis</Label>
            {jenisOpsi.length === 0 ? (
              // Product Fulfillment tidak punya Jenis — keputusan owner
              // 4 September. Field dikunci kosong, bukan disembunyikan, supaya
              // layout tidak bergeser saat kategorinya diganti.
              <Input id="baru-jenis" value="" disabled placeholder="Tidak ada jenis" />
            ) : (
              <Select value={jenis} onValueChange={(v) => v !== null && setJenis(v)}>
                <SelectTrigger id="baru-jenis" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jenisOpsi.map((j) => (
                    <SelectItem key={j} value={j}>
                      {j}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baru-nopo">No. PO</Label>
            <Input
              id="baru-nopo"
              value={noPo}
              onChange={(e) => setNoPo(e.target.value)}
              placeholder="PO-2026-0009"
            />
          </div>

          {/* Vendor: dari master, bukan teks bebas. */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="baru-vendor">Vendor</Label>
            {vendorGagal ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" />
                <span className="flex-1">
                  Gagal memuat vendor: {vendorGagal}.{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void muatVendor()}
                  >
                    Coba lagi
                  </button>
                </span>
              </div>
            ) : (
              <Select value={vendor} onValueChange={(v) => v !== null && setVendor(v)}>
                <SelectTrigger id="baru-vendor" className="w-full">
                  <SelectValue placeholder={vendorList === null ? 'Memuat vendor…' : 'Pilih vendor'} />
                </SelectTrigger>
                <SelectContent>
                  {(vendorList ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.nama}>
                      {v.nama}
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        {v.tipe_label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baru-tgl">Tgl PO</Label>
            <Input
              id="baru-tgl"
              value={tglPo}
              onChange={(e) => setTglPo(e.target.value)}
              placeholder="28 Sep 2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="baru-pic">PIC</Label>
            <Input id="baru-pic" value={pic} onChange={(e) => setPic(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="baru-catatan">Catatan</Label>
            <Input
              id="baru-catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ===== Workcode ===== */}
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Workcode
        </p>
        <p className="text-[11px] text-muted-foreground">
          Satu baris satu workcode. Boleh kosong — koneksi ke produksi ditunda.
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              {workcodes.map((w) => (
                <tr key={w} className="border-t first:border-t-0">
                  <td className="px-3 py-1.5 font-mono text-xs break-all">{w}</td>
                  <td className="w-10 px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Hapus workcode ${w}`}
                      onClick={() => setWorkcodes((lama) => lama.filter((x) => x !== w))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
              {workcodes.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    Belum ada workcode.
                  </td>
                </tr>
              )}
              <BarisTambah colSpan={2}>
                <TombolTambah label="Tambah Workcode" onClick={tambahWorkcode} />
              </BarisTambah>
            </tbody>
          </table>
        </div>
        <Input
          value={workcodeBaru}
          onChange={(e) => setWorkcodeBaru(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            tambahWorkcode();
          }}
          placeholder="PDFF_CSC-TOP-17_B-00_PRDN"
          aria-label="Workcode baru"
          className="h-8 font-mono text-xs"
        />
      </div>

      {/* ===== Item Material ===== */}
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Item Material
        </p>
        <TabelItem
          kartu={kartuSementara}
          items={items}
          setItems={setItems}
          onstageDatang={[]}
          onPilihFoto={(item) => {
            // Sama seperti popup: pratinjau lokal, belum menyentuh server.
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.onchange = () => {
              const berkas = input.files?.[0];
              if (!berkas) return;
              setItems((lama) =>
                lama.map((x) =>
                  x.key === item.key ? { ...x, foto: URL.createObjectURL(berkas) } : x
                )
              );
            };
            input.click();
          }}
          onDatang={() => {}}
          // Selalu boleh diedit: form ini memang untuk menyusun PO baru, dan
          // belum ada tahap yang bisa dibaca. `bolehDatang` sengaja false —
          // centang "Datang" hanya hidup di Received, dan PO yang baru dibuat
          // belum pernah sampai sana.
          bolehEdit
          bolehDatang={false}
        />
      </div>

      {alasanTidakBisaSimpan && (
        <p className="text-xs text-muted-foreground">{alasanTidakBisaSimpan}</p>
      )}

      {/* Baris aksi. Tombol SIMPAN TIDAK memakai `disabled` — di Base UI tombol
          yang disabled masih bisa diklik, dan klik itu akan menelan formnya
          tanpa memberi tahu. Yang dilakukan di sini adalah MENYEMBUNYIKAN
          tombol dan menuliskan alasannya, jadi tidak ada jalan yang terlihat
          tapi tidak berlaku. */}
      {!alasanTidakBisaSimpan && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() =>
              onSimpan({
                kategori,
                jenis,
                noPo: noPo.trim(),
                vendor,
                tglPo: tglPo.trim(),
                pic: pic.trim(),
                inisial: inisialDari(pic),
                catatan: catatan.trim(),
                workcodes,
                items,
                fotoNota: null,
                buktiBayar: null,
              })
            }
          >
            Buat PO
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Judul form, dipisah supaya bisa diuji dari server.
 *
 * Alasan yang sama seperti `judulPopup`: `DialogTitle` hidup di dalam `Dialog`
 * yang dirender lewat portal, jadi tidak ada cara memverifikasinya tanpa
 * membuka form di browser.
 */
export function judulFormPo(): string {
  return 'Pembelian Material Baru';
}

/**
 * Pembungkus `IsiFormPoBaru` — form yang sebenarnya.
 *
 * Satu-satunya tugasnya `Dialog` dan state buka/tutup; seluruh isi ada di
 * `IsiFormPoBaru` supaya bisa dirender tanpa portal.
 */
export default function FormPoBaru({
  terbuka,
  sudahAda,
  onTutup,
  onSimpan,
}: {
  terbuka: boolean;
  /** Sudah ada PO baru di sesi ini. */
  sudahAda: boolean;
  onTutup: () => void;
  onSimpan: (data: DataPoBaru) => void;
}) {
  return (
    <Dialog
      open={terbuka}
      onOpenChange={(buka) => {
        if (buka) return;
        onTutup();
      }}
    >
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base">{judulFormPo()}</DialogTitle>
        </DialogHeader>
        <IsiFormPoBaru onSimpan={onSimpan} sudahAda={sudahAda} />
      </DialogContent>
    </Dialog>
  );
}
