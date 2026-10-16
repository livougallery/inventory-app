import { useState, type CSSProperties } from 'react';
import { Plus, ImagePlus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { NAMA_PASAR, PLATFORM, type StatusPasar } from '@/lib/produk';
import type { KartuRegister, ProdukRegister } from '@/lib/produk';
import type { SpesifikasiKain } from '@/pages/production-fulfillment/data-kanban';
import PopupBuktiPasar from './PopupBuktiPasar';

// ===== Detail produk — layout resizable 30/70 =====
//
// Dibuka dari daftar Register dengan mengklik kartunya. Bentuknya dialog
// besar dengan dua panel yang bisa di-resize (drag handle di tengah):
// kiri identitas produk, kanan varian & bill of material.
//
// Panel kiri mengikuti pola identitas baku: foto polos (tanpa overlay teks),
// nama produk, daftar field Identitas yang rapi, dan daftar Platform.
// Panel kanan: satu kartu per warna dengan chip material horizontal.
//
// ANIMASI dialog tetap 300ms ease-out scale-from-0.97 (lihat catatan di
// bawah, dipertahankan dari desain sebelumnya).

export function IsiDetailProduk({
  produk,
  kartu,
}: {
  produk: ProdukRegister;
  kartu?: KartuRegister | null;
}) {
  const sp = produk.spesifikasi;

  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-[60vh]">
      {/* ── Panel kiri: identitas ─────────────────────────────── */}
      <ResizablePanel defaultSize={30} minSize={22}>
        <PanelKiri produk={produk} kartu={kartu} />
      </ResizablePanel>

      <ResizableHandle className="w-px bg-border transition-colors hover:bg-primary data-[dragging=true]:bg-primary">
        <span className="absolute left-1/2 top-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-all hover:h-12 hover:bg-primary data-[dragging=true]:h-16 data-[dragging=true]:bg-primary" />
      </ResizableHandle>

      {/* ── Panel kanan: varian & BOM ─────────────────────────── */}
      <ResizablePanel defaultSize={70} minSize={40}>
        <PanelKanan produk={produk} kartu={kartu} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/* ================= Panel kiri ================= */

function PanelKiri({
  produk,
  kartu,
}: {
  produk: ProdukRegister;
  kartu?: KartuRegister | null;
}) {
  const sp = produk.spesifikasi;
  const [buktiTerbuka, setBuktiTerbuka] = useState<StatusPasar | null>(null);

  return (
    <div className="h-full space-y-5 overflow-y-auto p-5">
      {/* Foto polos 4:3 — tanpa overlay teks nama/SKU. Nama dan SKU ada di
          Identitas di bawah, jadi overlay di atas foto cuma mengulang. */}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 text-xs text-muted-foreground">
        {produk.foto ? (
          <img src={produk.foto} alt={produk.nama} className="h-full w-full object-cover" />
        ) : (
          'FOTO'
        )}
      </div>

      <h3 className="text-base font-semibold">{produk.nama}</h3>

      {/* Identitas — daftar label/nilai rapi */}
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identitas
        </h4>
        <dl className="divide-y divide-border rounded-lg border">
          <Field label="SKU / Design code" nilai={sp.designCode} />
          <Field label="Brand" nilai={produk.brand} />
          <Field label="Kategori" nilai={produk.kategori} />
          <Field label="Registered" nilai={produk.registerDate} />
          {kartu && (
            <Field
              label="Varian"
              nilai={`${kartu.jumlahWarna} warna · ${kartu.jumlahVarian} varian`}
            />
          )}
        </dl>
      </section>

      {/* Platform — baris vertikal, satu per platform */}
      {kartu && (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Platform
          </h4>
          <div className="space-y-2">
            {PLATFORM.map((p) => {
              const st = kartu.pasar.find((s) => s.platform === p);
              if (!st) return null;
              return (
                <BarisPlatform
                  key={p}
                  status={st}
                  onBuka={() => setBuktiTerbuka(st)}
                />
              );
            })}
          </div>
        </section>
      )}

      <PopupBuktiPasar
        terbuka={buktiTerbuka !== null}
        produk={produk.nama}
        status={buktiTerbuka}
        onTutup={() => setBuktiTerbuka(null)}
      />
    </div>
  );
}

/** Satu baris platform: logo + nama + badge status. */
function BarisPlatform({
  status,
  onBuka,
}: {
  status: StatusPasar;
  onBuka: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-bold">
        {NAMA_PASAR[status.platform].charAt(0)}
      </span>
      <span className="flex-1 text-sm font-medium">{NAMA_PASAR[status.platform]}</span>
      {status.terdaftar ? (
        <span className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            ● Registered
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBuka} title="Lihat bukti">
            <ImagePlus className="h-4 w-4" />
          </Button>
        </span>
      ) : (
        /* Belum terdaftar: badge dashed yang BISA DIKLIK untuk upload.
           Tombolnya tidak disembunyikan — tombol yang hilang membuat alur
           upload tidak bisa dinilai. Lihat PopupBuktiPasar. */
        <button
          onClick={onBuka}
          className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          ○ Not registered
        </button>
      )}
    </div>
  );
}

/* ================= Panel kanan ================= */

function PanelKanan({
  produk,
  kartu,
}: {
  produk: ProdukRegister;
  kartu?: KartuRegister | null;
}) {
  const sp = produk.spesifikasi;
  const [modeTambah, setModeTambah] = useState(false);

  return (
    <div className="h-full space-y-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-amber-700">
          Varian &amp; Bill of material
        </h3>
        {/* c-button-18: outline + icon di kiri, untuk aksi Add Item */}
        <Button variant="outline" size="sm" onClick={() => setModeTambah(true)} disabled={modeTambah}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {sp.warna.map((w) => (
        <KartuWarna key={w.kode} produk={produk} warnaKode={w.kode} warnaNama={w.nama} />
      ))}

      {modeTambah && (
        <KartuWarnaBaru produk={produk} onBatal={() => setModeTambah(false)} onSimpan={() => setModeTambah(false)} />
      )}
    </div>
  );
}

/** Satu kartu warna: nama + size di kiri, chip material horizontal di kanan. */
function KartuWarna({
  produk,
  warnaKode,
  warnaNama,
}: {
  produk: ProdukRegister;
  warnaKode: string;
  warnaNama: string;
}) {
  const sp = produk.spesifikasi;
  const warna = sp.warna.find((w) => w.kode === warnaKode);
  const [modeEdit, setModeEdit] = useState(false);

  if (!warna) return null;

  if (modeEdit) {
    return (
      <KartuWarnaEdit
        produk={produk}
        warnaKode={warnaKode}
        onBatal={() => setModeEdit(false)}
        onSimpan={() => setModeEdit(false)}
      />
    );
  }

  // Kain untuk warna ini + semua aksesori produk
  const kainWarna = sp.kain.filter((k) => k.perWarna[warnaKode]);

  return (
    <div className="relative rounded-2xl border-2 p-4">
      <div className="flex gap-4">
        {/* Kiri: nama warna + size */}
        <div className="min-w-[110px] space-y-2">
          <div className="font-bold">{warnaNama}</div>
          <div className="flex flex-col gap-1.5">
            {warna.pcs.map((p) => (
              <span key={p.ukuran} className="rounded-md border px-3 py-1 text-center text-sm">
                {p.ukuran}
              </span>
            ))}
          </div>
        </div>

        {/* Kanan: chip material — satu baris horizontal, flex-grow mengisi */}
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {kainWarna.map((k) => {
            const pakai = k.perWarna[warnaKode];
            return (
              <div key={k.nama} className="min-w-[168px] flex-1 rounded-xl border p-4">
                <div className="text-[15px] font-bold">Kain</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {k.nama} {warnaNama} · {pakai.perPcs} {k.satuan}
                </div>
              </div>
            );
          })}
          {sp.aksesori.map((a) => (
            <div key={a.nama} className="min-w-[168px] flex-1 rounded-xl border p-4">
              <div className="text-[15px] font-bold">{a.nama}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {a.varian} · {a.perPcs} {a.satuan}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Kartu tambah varian baru (mode edit penuh). */
function KartuWarnaBaru({
  produk,
  onBatal,
  onSimpan,
}: {
  produk: ProdukRegister;
  onBatal: () => void;
  onSimpan: () => void;
}) {
  return (
    <KartuWarnaEdit produk={produk} warnaKode="" onBatal={onBatal} onSimpan={onSimpan} baru />
  );
}

/** Kartu warna dalam mode edit: dropdown warna, size editable, 10 chip aksesoris. */
function KartuWarnaEdit({
  produk,
  warnaKode,
  onBatal,
  onSimpan,
  baru = false,
}: {
  produk: ProdukRegister;
  warnaKode: string;
  onBatal: () => void;
  onSimpan: () => void;
  baru?: boolean;
}) {
  const sp = produk.spesifikasi;
  const [warna, setWarna] = useState(warnaKode);
  const [sizes, setSizes] = useState<string[]>(() => {
    const w = sp.warna.find((x) => x.kode === warnaKode);
    return w ? w.pcs.map((p) => p.ukuran) : ['S'];
  });

  return (
    <div className="rounded-2xl border-2 border-dashed bg-muted/30 p-4">
      <div className="flex gap-4">
        <div className="min-w-[150px] space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Warna
            </label>
            <select
              value={warna}
              onChange={(e) => setWarna(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Pilih warna…</option>
              {sp.warna.map((w) => (
                <option key={w.kode} value={w.kode}>{w.nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Size
            </label>
            <div className="flex flex-col gap-2">
              {sizes.map((s, i) => (
                <button
                  key={i}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                  onClick={() => {
                    const v = prompt('Edit size:', s);
                    if (v) setSizes(sizes.map((x, j) => (j === i ? v : x)));
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              className="mt-2 w-full rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              onClick={() => setSizes([...sizes, '–'])}
            >
              + Add
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Jenis aksesoris
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <ChipEdit jenis="Kain" />
            {sp.aksesori.map((a) => (
              <ChipEdit key={a.nama} jenis={a.nama} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={onBatal} title="Batal">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
        <Button onClick={onSimpan} disabled={!warna} className="bg-zinc-900 text-white hover:bg-zinc-800">
          Save
        </Button>
      </div>
    </div>
  );
}

/** Satu chip aksesoris dalam mode edit. */
function ChipEdit({ jenis }: { jenis: string }) {
  const [nama, setNama] = useState('no need');
  const butuh = nama !== 'no need';

  return (
    <div className={`min-w-[196px] shrink-0 rounded-xl border bg-background p-3 ${butuh ? '' : 'border-dashed opacity-60'}`}>
      <div className="mb-2 text-[13px] font-bold text-muted-foreground">{jenis}</div>
      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Nama</label>
      <select
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        className="mb-2 w-full rounded-md border bg-background px-2 py-1 text-xs"
      >
        <option value="no need">no need</option>
        <option>{jenis} Standar</option>
      </select>
      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Varian</label>
      <select disabled={!butuh} className="mb-2 w-full rounded-md border bg-background px-2 py-1 text-xs disabled:bg-muted">
        <option>—</option>
      </select>
      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
        Kebutuhan / pcs
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          disabled={!butuh}
          placeholder="0"
          className="w-full rounded-md border bg-background px-2 py-1 text-xs disabled:bg-muted"
        />
        <span className="text-xs font-semibold text-muted-foreground">pcs</span>
      </div>
    </div>
  );
}

export default function DetailProduk({
  produk,
  kartu,
  onTutup,
}: {
  /** Produk yang dibuka. `null` = dialog tertutup. */
  produk: ProdukRegister | null;
  /** Ringkasan stok per warna. Tanpa ini, rinciannya tidak tampil. */
  kartu?: KartuRegister | null;
  onTutup: () => void;
}) {
  return (
    <Dialog
      open={produk !== null}
      onOpenChange={(buka) => {
        if (!buka) onTutup();
      }}
    >
      <DialogContent
        className="max-h-[92vh] gap-0 p-0 duration-300 ease-out sm:max-w-[1100px] grid-rows-[auto_minmax(0,1fr)]"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        {produk && (
          <>
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle className="text-lg">{produk.nama}</DialogTitle>
              <DialogDescription className="text-xs">
                Detail produk — varian &amp; bill of material.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-hidden">
              <IsiDetailProduk produk={produk} kartu={kartu} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Satu pasang label-nilai di daftar identitas. */
function Field({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{nilai}</dd>
    </div>
  );
}

/**
 * Pemakaian kain per pcs, atau '—' kalau belum ada warnanya.
 * (Dipertahankan untuk kompatibilitas; tampilan baru memakai chip per warna.)
 */
function pemakaianKain(k: SpesifikasiKain): string {
  const perWarna = Object.values(k.perWarna);
  if (perWarna.length === 0) return '—';
  const angka = perWarna.map((v) => v.perPcs);
  return seragam(angka) ? `${angka[0]} ${k.satuan}` : 'beda per warna';
}

/** Semua angka sama? */
function seragam(angka: (number | undefined)[]): boolean {
  return angka.every((n) => n === angka[0]);
}
