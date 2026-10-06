import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Upload } from 'lucide-react';
import { BadgeDatang } from './KartuPo';
import type { BarisItem, KartuPo, RingkasanDatang, StagePapan } from './data-po';
import {
  KATEGORI,
  bisaEdit,
  bisaTandaiDatang,
  bisaUnggah,
  jenisUntuk,
  kategoriDari,
  kunciItem,
  masterPerKategori,
  ringkasDatang,
  subtotal,
} from './data-po';
import { rupiah } from '@/lib/format';

// ===== Popup kartu PO =====
//
// Isinya persis bentuk yang disepakati owner 25 September 2026, dalam urutan
// yang dia minta: Informasi Pembelian (dengan Kategori dan Jenis), lalu
// Workcode sebagai baris sendiri, lalu Item Material yang bisa diedit langsung
// di barisnya, lalu Dokumen.
//
// Dua bagian yang DIHAPUS dari form pembelian lama dan tidak dibangun ulang di
// sini: "Pembayaran & Dokumen" (semua pembayaran; yang tersisa hanya foto nota
// dan slot bukti bayar) dan "Penerimaan & FIFO". Yang kedua tidak hilang
// datanya — ia punya kerjanya sendiri di stage `receive` papan Production
// Fulfillment. Yang diganti cuma penandaagtannya: satu checkbox per baris.
//
// ===== Isi per tahap (keputusan owner 28 September 2026) =====
//
// Popup ini TIDAK sama persis di kelima tahap, dan itu bukan sekadar variasi
// tampilan:
//
//   - Yang boleh diedit: Informasi Pembelian, Workcode, Item Material — hanya
//     di Proposed, Approved, dan Ordered. Setelah material tiba, isinya jadi
//     catatan, bukan tempat untuk diperbaiki.
//   - Kolom centang "Datang": HANYA di Received. Di tahap lain belum ada yang
//     perlu ditanyakan soal kedatangan, jadi centangnya tidak ada di sana.
//   - Bagian Dokumen: tidak muncul sama sekali di Proposed dan Approved —
//     belum ada invoice untuk diunggah. Baru di Ordered foto bisa diunggah, dan
//     di Received/Completed hanya ditampilkan.
//
// Tiga aturan itu ditegakkan lewat fungsi di `data-po.ts` (`bisaEdit`,
// `bisaTandaiDatang`, `bisaUnggah`), bukan lewat condition yang disalin ke
// setiap Input satu per satu. Alasannya: aturan "hanya di tahap X" yang ditulis
// di sepuluh tempat adalah sepuluh tempat yang bisa lupa diperbarui.

export interface AksiPo {
  /** Buka popup untuk kartu ini — dipakai kartu papan dan baris tabel. */
  buka: (kartuId: string) => void;
  /** Tutup popup. */
  tutup: () => void;
  /** Buka form PO baru. */
  buat: () => void;
  /** Centang "sudah datang" pada satu baris item. */
  tandaiDatang: (kartuId: string, kunci: string, sudah: boolean) => void;
  /** Teruskan kartu ke stage berikutnya. */
  lanjutStage: (kartu: KartuPo) => void;
  /** Tutup kartu setelah semua material datang. */
  selesaikan: (kartu: KartuPo) => void;
  /** Simpan perubahan isian popup kembali ke kartu. */
  simpan: (kartu: KartuPo) => void;
}

// ===== Gabung perubahan =====
//
// Menyalin `{ ...form, ...perubahan }` biasa di sini sebenarnya sudah cukup
// Hasilnya bertipe `KartuPo`, tapi hanya karena TypeScript mengira
// `Partial<KartuPo>` itu sama dengan `KartuPo` bila bentuknya cocok —
// field-nya jadi `string | undefined`, jadi kartu hasil penggabungan bisa
// dipakai sebagai kartu PO yang `id`-nya hilang.
//
// `gabungField` menutup celah itu: hasilnya SELALU `KartuPo`, dan hanya
// field yang disebut yang berubah. Selain itu, ini juga jadi tempat satu untuk
// perubahan besar — misalnya ganti kategori, yang ikut mengosongkan baris item.
function gabungField(kartu: KartuPo, perubahan: Partial<KartuPo>): KartuPo {
  return { ...kartu, ...perubahan } as KartuPo;
}

// ===== Baris tambah (pola Excel) =====
//
// Dipakai ulang bentuknya dari `FormProduksiBaru.tsx:351-380`. Tombolnya jadi
// baris terakhir DI DALAM tabelnya, bukan tombol melayang di atas: yang
// ditambahkan muncul tepat di bawah baris terakhir, dan mata tidak perlu
// menyeberang layar untuk tahu tombol mana milik tabel mana.

export function BarisTambah({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="border-t">
      <td colSpan={colSpan} className="p-0">
        <div className="flex">{children}</div>
      </td>
    </tr>
  );
}

export function TombolTambah({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start rounded-none text-muted-foreground hover:bg-muted/50"
      onClick={onClick}
    >
      <Plus /> {label}
    </Button>
  );
}

let nomorBaris = 9000;

// Diekspor untuk `FormPoBaru.tsx`. Boleh dipakai form baru karena penghitung
// `key`-nya mulai dari 9000, sedangkan `data-po.ts:335` mulai dari 0 — keduanya
// modul-level di berkas berbeda dan tidak akan pernah menghasilkan kunci sama.
export function barisKosong(overrides: Partial<BarisItem> = {}): BarisItem {
  return {
    key: nomorBaris++,
    materialId: null,
    kode: '',
    nama: '',
    varian: '',
    satuan: 'pcs',
    qty: 0,
    harga: 0,
    foto: null,
    ...overrides,
  };
}

// ===== Strip saran material =====
//
// Ini satu-satunya bagian halaman ini yang tidak bisa ditunda, dan alasannya
// bukan kerapian.
//
// Bentuknya: form ini sekaligus mendaftarkan material baru. Kalau nama yang
// diketik tidak dicek terhadap master, "Kain Pleats" dan "Kain Pleat" akan
// menjadi dua material berbeda dalam sebulan, dengan stok terpisah, dan
// tidak ada layar mana pun yang bisa menunjukkan bahwa itu barang yang sama.
//
// Dipasang sebagai `<div>` berisi `<button>`, bukan `<Select>`: yang dipilih
// di sini bukan nilai dari daftar tertutup — namanya tetap boleh diketik bebas,
// dan daftar ini cuma jalan pintas. `onMouseDown` + `preventDefault`, bukan
// `onClick` — tanpa itu, isian di atasnya kehilangan fokus lebih dulu
// (`onBlur` menutup daftarnya) dan kliknya tidak pernah sampai ke tombol.

export function SaranMaterial({
  nama,
  kategori,
  terpakai,
  onPilih,
}: {
  nama: string;
  kategori: string;
  /** Id master yang sudah dipakai baris lain di PO ini. */
  terpakai: number[];
  onPilih: (item: BarisItem) => void;
}) {
  const dipakai = useMemo(() => new Set(terpakai), [terpakai]);

  const saran = useMemo(() => {
    const ketik = nama.trim().toLowerCase();
    if (ketik.length < 3) return [];
    return masterPerKategori(kategori)
      .filter((m) => !dipakai.has(m.id))
      .filter(
        (m) => m.nama.toLowerCase().includes(ketik) || ketik.includes(m.nama.toLowerCase())
      )
      .slice(0, 5);
  }, [nama, kategori, dipakai]);

  if (saran.length === 0) return null;

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
      <p className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        Sudah ada di master — memilihnya mengisi baris, tidak membuat duplikat
      </p>
      {saran.map((m) => (
        <button
          key={m.id}
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            onPilih(
              barisKosong({
                materialId: m.id,
                kode: m.kode_bahan,
                nama: m.nama,
                varian: m.varian_list[0] ?? '',
                satuan: m.satuan,
                foto: m.foto_path,
              })
            );
          }}
        >
          {m.foto_path ? (
            <img
              src={m.foto_path}
              alt=""
              className="h-6 w-6 shrink-0 rounded border object-cover"
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{m.nama}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {m.kode_bahan}
          </span>
        </button>
      ))}
    </div>
  );
}

// ===== Kolom foto =====

/**
 * Sel foto — thumbnail master, atau tombol pilih untuk material yang belum ada.
 *
 * Em dash, BUKAN `<img src="">`: string kosong akan memicu permintaan gagal ke
 * server dan menampilkan ikon gambar rusak di setiap baris yang belum punya
 * foto. Pola yang sama dipakai `StokMaterial.tsx:152-158`.
 *
 * Untuk baris `Baru` selnya adalah tombol. Setelah dipilih, isinya jadi foto
 * master material itu — keputusan owner: satu foto per material, di master,
 * bukan satu foto per PO.
 *
 * `bolehEdit` mati = tahap ini sudah tidak boleh diubah, jadi tombolnya
 * hilang dan selnya hanya menampilkan fotonya saja.
 */
function SelFoto({
  item,
  onPilihFoto,
  bolehEdit,
}: {
  item: BarisItem;
  onPilihFoto: (item: BarisItem) => void;
  bolehEdit: boolean;
}) {
  if (item.foto) {
    return (
      <a
        href={item.foto}
        target="_blank"
        rel="noreferrer"
        title={`Foto ${item.nama || 'material'}`}
        className="inline-block"
      >
        <img
          src={item.foto}
          alt={`Foto ${item.nama || 'material'}`}
          className="h-9 w-9 rounded border object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  if (item.materialId !== null) {
    // Sudah punya master, tapi master itu belum punya foto.
    return <span className="text-muted-foreground">—</span>;
  }

  if (!bolehEdit) {
    // Tahap ini sudah tidak boleh diubah — tombolnya tidak sekadar dimatikan
    // (tombol yang dimatikan di Base UI tetap meneruskan klik ke anak
    // `<label>` di bawahnya), tapi memang tidak dirender sama sekali.
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <button
      type="button"
      aria-label={`Pilih foto ${item.nama || 'material baru'}`}
      onClick={() => onPilihFoto(item)}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted"
    >
      <Upload className="h-3.5 w-3.5" />
    </button>
  );
}

// ===== Tabel item =====

// Diekspor untuk `FormPoBaru.tsx`. Dipakai apa adanya supaya tabel item di form
// dan di popup tidak bisa berbeda bentuk — dua salinan tabel yang nanti
// berbeda adalah cara pasti halaman ini mengotori dirinya sendiri.
export function TabelItem({
  kartu,
  items,
  setItems,
  onstageDatang,
  onPilihFoto,
  onDatang,
  bolehEdit,
  bolehDatang,
}: {
  kartu: KartuPo;
  items: BarisItem[];
  setItems: Dispatch<SetStateAction<BarisItem[]>>;
  onstageDatang: string[];
  onPilihFoto: (item: BarisItem) => void;
  onDatang: (kunci: string, sudah: boolean) => void;
  /** Input dan tombol hapus hidup; ketika mati semua kolom jadi teks. */
  bolehEdit: boolean;
  /** Kolom centang "Datang" tampil. */
  bolehDatang: boolean;
}) {
  function ubah(key: number, perubahan: Partial<BarisItem>) {
    setItems((lama) => lama.map((x) => (x.key === key ? { ...x, ...perubahan } : x)));
  }

  const kunciDatang = new Set(onstageDatang);

  // Id master yang sudah terpakai di PO ini. Dipakai satu kali untuk SEMUA
  // baris sekaligus — kalau dihitung per baris, tiap baris punya salinannya
  // sendiri dan memo `SaranMaterial` tidak pernah menahan render ulang.
  const terpakai = useMemo(
    () => items.map((x) => x.materialId).filter((id): id is number => id !== null),
    [items]
  );

  // Jumlah kolom yang benar-benar dirender. Dihitung, bukan ditulis 10, karena
  // `colSpan` yang melebar melewati jumlah kolom membuat baris itu melebar
  // sendiri — tabel jadi tidak rapi dan kolom Hapus turun satu tingkat.
  const kolom = 8 + (bolehDatang ? 1 : 0) + (bolehEdit ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-14 px-2 py-2 text-left text-xs font-medium">Foto</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Kode</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Nama</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Varian</th>
            <th className="px-2 py-2 text-left text-xs font-medium">Satuan</th>
            <th className="px-2 py-2 text-left text-xs font-medium">Qty</th>
            <th className="px-2 py-2 text-left text-xs font-medium">Harga</th>
            <th className="px-3 py-2 text-right text-xs font-medium">Total</th>
            {/* Kolom "Datang" hanya hidup di Received — lihat `bolehDatang`.
                Yang perlu diperhatikan: kolom yang hilang harus HITUNG
                `colSpan` yang menghilang juga. Kalau tidak, baris kosong jadi
                melebar sendiri (colSpan 10 di tabel 9 kolom) dan kolom Hapus
                bergeser ke kiri tepat di tahap yang paling butuh dibaca rapi. */}
            {bolehDatang && (
              <th className="w-12 px-2 py-2 text-center text-xs font-medium" title="Sudah datang">
                Datang
              </th>
            )}
            {bolehEdit && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.key} className="border-t">
              <td className="px-2 py-1.5">
                <SelFoto item={b} onPilihFoto={onPilihFoto} bolehEdit={bolehEdit} />
              </td>
              <td className="px-3 py-1.5">
                {/* Kode terisi otomatis dari master. Untuk material yang belum
                    ada, kolom ini boleh diketik — kode itu yang akan menjadi
                    kode master baris tersebut. */}
                {b.materialId !== null || !bolehEdit ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.kode || '—'}
                  </span>
                ) : (
                  <Input
                    value={b.kode}
                    onChange={(e) => ubah(b.key, { kode: e.target.value })}
                    placeholder="MT-…"
                    aria-label={`Kode ${b.nama || 'material baru'}`}
                    className="h-8 font-mono text-xs"
                  />
                )}
              </td>
              <td className="px-3 py-1.5">
                <div className="relative">
                  {bolehEdit ? (
                    <Input
                      value={b.nama}
                      onChange={(e) => ubah(b.key, { nama: e.target.value })}
                      placeholder="Kain Rayon"
                      aria-label={`Nama material baris ${b.key}`}
                      className="h-8"
                    />
                  ) : (
                    <span className="text-sm">{b.nama || '—'}</span>
                  )}
                  {b.materialId === null && bolehEdit && (
                    <SaranMaterial
                      nama={b.nama}
                      kategori={kartu.kategori}
                      // Material yang sudah dipakai baris lain disembunyikan
                      // dari daftar saran. Tanpa ini, memilih "Kain Crepe" di
                      // baris kedua setelah memakainya di baris pertama
                      // menghasilkan dua baris untuk satu master — dan
                      // keduanya akan tersimpan jadi satu material baru di
                      // master, karena baris baru tidak punya id untuk
                      // dibandingkan.
                      terpakai={terpakai.filter((id) => id !== b.materialId)}
                      onPilih={(terpilih) =>
                        setItems((lama) => lama.map((x) => (x.key === b.key ? terpilih : x)))
                      }
                    />
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5">
                {bolehEdit ? (
                  <Input
                    value={b.varian}
                    onChange={(e) => ubah(b.key, { varian: e.target.value })}
                    aria-label={`Varian ${b.nama || 'material'}`}
                    className="h-8"
                  />
                ) : (
                  <span className="text-sm">{b.varian || '—'}</span>
                )}
              </td>
              <td className="px-2 py-1.5">
                {bolehEdit ? (
                  <Input
                    value={b.satuan}
                    onChange={(e) => ubah(b.key, { satuan: e.target.value })}
                    aria-label={`Satuan ${b.nama || 'material'}`}
                    className="h-8 w-20"
                  />
                ) : (
                  <span className="text-sm">{b.satuan || '—'}</span>
                )}
              </td>
              <td className="px-2 py-1.5">
                {bolehEdit ? (
                  <Input
                    type="number"
                    min="0"
                    value={b.qty || ''}
                    onChange={(e) => ubah(b.key, { qty: Number(e.target.value) || 0 })}
                    aria-label={`Qty ${b.nama || 'material'}`}
                    className="h-8 w-24"
                  />
                ) : (
                  <span className="text-sm tabular-nums">{b.qty}</span>
                )}
              </td>
              <td className="px-2 py-1.5">
                {bolehEdit ? (
                  <Input
                    type="number"
                    min="0"
                    value={b.harga || ''}
                    onChange={(e) => ubah(b.key, { harga: Number(e.target.value) || 0 })}
                    aria-label={`Harga ${b.nama || 'material'}`}
                    className="h-8 w-28"
                  />
                ) : (
                  <span className="text-sm tabular-nums">{rupiah(b.harga)}</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap tabular-nums">
                {rupiah(b.qty * b.harga)}
              </td>
              {bolehDatang && (
                <td className="px-2 py-1.5 text-center">
                  <Checkbox
                    checked={kunciDatang.has(kunciItem(b))}
                    onCheckedChange={(v) => onDatang(kunciItem(b), v === true)}
                    aria-label={`${b.nama || 'material'} sudah datang`}
                    disabled={b.materialId === null && b.nama.trim() === ''}
                  />
                </td>
              )}
              {bolehEdit && (
                <td className="px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Hapus baris ${b.nama || 'baru'}`}
                    onClick={() => setItems((lama) => lama.filter((x) => x.key !== b.key))}
                  >
                    <Trash2 />
                  </Button>
                </td>
              )}
            </tr>
          ))}

          {items.length === 0 && (
            <tr className="border-t">
              <td colSpan={kolom} className="px-3 py-4 text-center text-xs text-muted-foreground">
                Belum ada material. Tambahkan minimal satu baris.
              </td>
            </tr>
          )}

          {/* Baris tambah ikut hilang saat tidak boleh diedit — bukan hanya
              dimatikan. Alasannya sama seperti tombol hapus: tombol yang
              disabled di Base UI masih bisa diklik, dan satu baris kosong
              yang bisa muncul tanpa bisa dihapus adalah kondisi yang tidak
              bisa dilalui pengguna sama sekali. */}
          {bolehEdit && (
            <BarisTambah colSpan={kolom}>
              <TombolTambah
                label="Tambah Material"
                onClick={() => setItems((lama) => [...lama, barisKosong({ satuan: kategoriDari(kartu.kategori).satuan })])}
              />
            </BarisTambah>
          )}
        </tbody>
        {items.length > 0 && (
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right text-xs font-medium">
                Subtotal
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                {rupiah(subtotal(items))}
              </td>
              <td colSpan={kolom - 8} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ===== Slot foto =====

/**
 * Satu-satunya tempat foto masuk ke server nanti — `Foto Invoice Material`.
 *
 * Pratinjau ini belum mengirim apa pun ke server: fotonya dibaca dari object
 * URL browser. Alasannya sama seperti keputusan Q7 tanggal 24 September —
 * mengunggah ke server tanpa tabel pemilik menghasilkan berkas yatim, dan
 * `db.js` menjalankan `bootstrapSchema()` saat boot sehingga setiap perubahan
 * skema adalah migrasi produksi otomatis.
 */
function SlotFoto({
  judul,
  foto,
  bisaUnggah,
  keterangan,
  onPilih,
}: {
  judul: string;
  foto: string | null;
  /** False = slot tampilan saja, belum ada tombol unggah. */
  bisaUnggah: boolean;
  keterangan: string;
  onPilih?: (berkas: File) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{judul}</p>
      {foto ? (
        <a href={foto} target="_blank" rel="noreferrer" className="inline-block">
          <img
            src={foto}
            alt={judul}
            className="h-28 w-40 rounded border object-cover"
          />
        </a>
      ) : (
        <div className="flex h-28 w-40 flex-col items-center justify-center gap-1 rounded border border-dashed bg-muted/30 px-3 text-center">
          <p className="text-[11px] text-muted-foreground">{keterangan}</p>
        </div>
      )}

      {bisaUnggah && (
        <>
          <Button
            variant="outline"
            size="sm"
            render={
              <label htmlFor={`unggah-${judul.replace(/\s+/g, '-').toLowerCase()}`} className="cursor-pointer">
                <Upload /> Pilih Foto
              </label>
            }
          />
          <input
            id={`unggah-${judul.replace(/\s+/g, '-').toLowerCase()}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const berkas = e.target.files?.[0];
              e.target.value = '';
              if (berkas) onPilih?.(berkas);
            }}
          />
        </>
      )}
    </div>
  );
}

// ===== Popup =====

/**
 * Badan popup, TANPA `Dialog`.
 *
 * Dipisah supaya bisa dirender di server oleh smoke test. `DialogContent`
 * memakai portal, dan portal tidak ikut ter-render di server — kalau popup
 * dirender apa adanya, yang keluar hanya `<div></div>` dan SETIAP pemeriksaan
 * isinya (urutan bagian, kolom harga, gerbang tombol) akan lulus karena tidak
 * menemukan apa pun. Pola yang sama dipakai `IsiPopup` di papan production.
 */
export function IsiPopup({
  kartu,
  stage,
  stageBerikutnya,
  onstageDatang,
  aksi,
}: {
  kartu: KartuPo;
  stage: StagePapan | undefined;
  stageBerikutnya: StagePapan | undefined;
  onstageDatang: Record<string, string[]>;
  aksi: AksiPo;
}) {
  const [sunting, setSunting] = useState<KartuPo | null>(null);
  const [workcodeBaru, setWorkcodeBaru] = useState('');

  // Isian popup tidak pernah ditulis ke kartu sampai tombol Simpan ditekan.
  // Tanpa ini, mengetik di kolom harga akan mengubah kartu di papan seketika,
  // dan tombol "Batal" jadi tidak berarti apa-apa.
  const form = sunting ?? kartu;

  const items = sunting?.items ?? form.items;
  const setItems = (updater: SetStateAction<BarisItem[]>) =>
    setSunting({ ...form, items: typeof updater === 'function' ? updater(items) : updater });

  const ringkas: RingkasanDatang = ringkasDatang(form.id, items, onstageDatang);
  const bisaSelesaikan = stage?.id === 'diterima' && ringkas.lengkap;
  const bisaLanjut = stage?.id !== 'selesai' && items.length > 0;

  // Tiga hak isi per tahap, semuanya dari `data-po.ts` (lihat catatan di atas
  // interface `AksiPo`). Dihitung SEKALI di sini lalu diteruskan ke bawah —
  // bukan dibaca ulang di tiap Input, supaya tidak ada kolom yang diam-diam
  // lupa ikut terkunci kalau aturan-aturannya berubah.
  //
  // `stage === undefined` berarti popup dipanggil tanpa stage (mis. kartu yang
  // tidak ada di papan). Semua fungsi `bisa*` sudah memperlakukan itu sebagai
  // "tidak boleh apa pun" — popup tanpa stage tidak punya tempat yang jelas,
  // jadi ia read-only, bukan editable.
  const bolehEdit = bisaEdit(stage?.id);
  const bolehDatang = bisaTandaiDatang(stage?.id);
  const bolehUnggah = bisaUnggah(stage?.id);
  // Owner: foto invoice "cuman bisa upload di stage dipesan aja" — jadi
  // Received dan Completed tetap MEMBUKA bagian Dokumen (fotonya harus tetap
  // kelihatan), tapi tidak punya tombol Pilih Foto. Karena itu batasnya bukan
  // sama dengan batas `bolehUnggah`: satu menentukan bagian ini ada, satu lagi
  // menentukan isinya masih bisa ditambah.
  const bolehUnggahFoto = bolehUnggah && stage?.id === 'dipesan';

  // Arrow, bukan `function` — fungsi yang di-hoist dibaca TypeScript memakai
  // tipe deklarasinya, bukan tipe yang sudah dipersempit oleh `if (!form)`
  // di atas, jadi `form`-nya kembali jadi bisa `null` di dalamnya.
  const ubahInfo = (perubahan: Partial<KartuPo>) => {
    setSunting(gabungField(form, perubahan));
  };

  return (
    <>
      {/* ===== Informasi Pembelian ===== */}
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Informasi Pembelian
          </p>
          {/* Kolom disabled (bukan disembunyikan) supaya nilai isinya tetap
              terbaca. Menyingkirkan field-nya di tahap read-only membuat PO
              terlihat tidak punya PIC padahal punya — dan di tahap Completed
              nilai itulah satu-satunya sisa informasinya. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-nopo">No. PO</Label>
              <Input
                id="po-nopo"
                value={form.noPo}
                disabled={!bolehEdit}
                onChange={(e) => ubahInfo({ noPo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-vendor">Vendor</Label>
              <Input
                id="po-vendor"
                value={form.vendor}
                disabled={!bolehEdit}
                onChange={(e) => ubahInfo({ vendor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-tgl">Tgl PO</Label>
              <Input
                id="po-tgl"
                value={form.tglPo}
                disabled={!bolehEdit}
                onChange={(e) => ubahInfo({ tglPo: e.target.value })}
                placeholder="26 Sep 2026"
              />
            </div>

            {/* Kategori dan Jenis di SINI, bukan per baris item. Belum pernah ada
                vendor yang menjual dua kategori, jadi nilainya benar per PO —
                dan mengulangnya di tiap baris berarti nilai yang sama ditulis
                delapan kali dan bisa berbeda di baris keempat. */}
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              {bolehEdit ? (
                <Select
                  value={form.kategori}
                  onValueChange={(v) => {
                    // Base UI mengirim `null` kalau pilihannya dibatalkan (mis.
                    // Esc atau klik luar). Kategori tidak boleh kosong — itu yang
                    // membuat baris item boleh disaring dan kolomnya jadi jujur —
                    // jadi nilai lama dibiarkan apa adanya.
                    if (v === null) return;
                    ubahInfo({
                      kategori: v,
                      jenis: jenisUntuk(v)[0] ?? '',
                      // Satu PO = satu kategori, jadi material di baris item yang
                      // tidak lagi sesuai harus ikut dibersihkan — kalau tidak,
                      // kolom Kategori di atas berbohong.
                      items: [],
                    });
                  }}
                >
                  <SelectTrigger id="po-kategori" className="w-full">
                    <SelectValue>
                      {(v: string) => KATEGORI.find((k) => k.value === v)?.label ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {KATEGORI.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // `Select` Base UI tidak punya prop `disabled` di akarnya, jadi
                // tidak bisa "dimatikan" seperti Input. Hasil yang sama dicapai
                // dengan mengganti SelectTrigger dengan Input disabled — bukan
                // sekadar menutup portalnya, yang hanya menambah satu lapisan
                // tak terlihat di atas teks yang sudah tampil.
                <Input
                  id="po-kategori"
                  value={kategoriDari(form.kategori).label}
                  disabled
                  readOnly
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-jenis">Jenis</Label>
              {jenisUntuk(form.kategori).length === 0 ? (
                // Product Fulfillment tidak punya Jenis — keputusan owner
                // 4 September. Fieldnya dikunci kosong, bukan disembunyikan,
                // supaya layout tidak bergeser saat kategorinya diganti.
                <Input id="po-jenis" value="" disabled placeholder="Tidak ada jenis" />
              ) : bolehEdit ? (
                <Select
                  value={form.jenis}
                  onValueChange={(v) => {
                    // Sama seperti Kategori: `null` berarti dibatalkan, bukan
                    // "pilih yang kosong".
                    if (v === null) return;
                    ubahInfo({ jenis: v });
                  }}
                >
                  <SelectTrigger id="po-jenis" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jenisUntuk(form.kategori).map((j) => (
                      <SelectItem key={j} value={j}>
                        {j}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="po-jenis" value={form.jenis} disabled readOnly />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-pic">PIC</Label>
              <Input
                id="po-pic"
                value={form.pic}
                disabled={!bolehEdit}
                onChange={(e) => ubahInfo({ pic: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="po-catatan">Catatan</Label>
              <Input
                id="po-catatan"
                value={form.catatan}
                disabled={!bolehEdit}
                onChange={(e) => ubahInfo({ catatan: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ===== Workcode: satu baris = satu workcode ===== */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Workcode
          </p>
          <p className="text-[11px] text-muted-foreground">
            Satu baris satu workcode. Koneksi ke produksi ditunda — workcode diisi
            manual, dan boleh kosong.
          </p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {form.workcodes.map((w) => (
                  <tr key={w} className="border-t first:border-t-0">
                    <td className="px-3 py-1.5 font-mono text-xs break-all">{w}</td>
                    {/* Kolom tombol ikut hilang, bukan cuma isinya — kalau
                        `<td>`-nya tetap ada, tabel selaras dengan tabel di
                        bawahnya yang kehilangan satu kolom, dan baris workcode
                        terlihat meleset ke kiri. */}
                    {bolehEdit && (
                      <td className="w-10 px-2 py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Hapus workcode ${w}`}
                          onClick={() => ubahInfo({ workcodes: form.workcodes.filter((x) => x !== w) })}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {form.workcodes.length === 0 && (
                  <tr>
                    <td colSpan={bolehEdit ? 2 : 1} className="px-3 py-3 text-center text-xs text-muted-foreground">
                      Belum ada workcode.
                    </td>
                  </tr>
                )}
                {bolehEdit && (
                  <BarisTambah colSpan={2}>
                    <TombolTambah
                      label="Tambah Workcode"
                      onClick={() => {
                        const w = workcodeBaru.trim();
                        if (!w) return;
                        ubahInfo({ workcodes: [...form.workcodes, w] });
                        setWorkcodeBaru('');
                      }}
                    />
                  </BarisTambah>
                )}
              </tbody>
            </table>
          </div>
          {bolehEdit && (
            <Input
              value={workcodeBaru}
              onChange={(e) => setWorkcodeBaru(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const w = workcodeBaru.trim();
                if (!w) return;
                ubahInfo({ workcodes: [...form.workcodes, w] });
                setWorkcodeBaru('');
              }}
              placeholder="PDFF_CSC-TOP-17_B-00_PRDN"
              aria-label="Workcode baru"
              className="h-8 font-mono text-xs"
            />
          )}
        </div>

        {/* ===== Item Material ===== */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Item Material
            </p>
            <BadgeDatang ringkas={ringkas} />
          </div>
          <TabelItem
            kartu={form}
            items={items}
            setItems={setItems}
            onstageDatang={onstageDatang[form.id] ?? []}
            onPilihFoto={(item) => {
              // Pratinjau: foto belum dikirim ke server. Object URL supaya
              // kolomnya terlihat terisi tanpa menyentuh berkas di disk.
              // Saat terhubung ke API, titik ini yang memanggil `unggahFoto()`
              // — dan harus punya tabel pemilik lebih dulu (lihat Q7 di
              // `.scratch/production-fulfillment-tahap/`).
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
            onDatang={(kunci, sudah) => aksi.tandaiDatang(form.id, kunci, sudah)}
            bolehEdit={bolehEdit}
            bolehDatang={bolehDatang}
          />
        </div>

        {/* ===== Dokumen =====
            HILANG SEPENUHNYA di Proposed dan Approved: belum ada invoice untuk
            diunggah, jadi menampilkan dua slot kosong hanya teaches orang bahwa
            ada sesuatu yang belum dikerjakan ketika memang belum apa-apa. Di
            Ordered tombol unggah hidup; di Received dan Completed fotonya tetap
            tampil tapi tidak bisa ditambah — dokumen sudah lengkap waktu PO
            ditutup. */}
        {bolehUnggah && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Dokumen
            </p>
            <p className="text-[11px] text-muted-foreground">
              Section ini dulunya "Pembayaran &amp; Dokumen". Bagian pembayarannya
              dihapus — semua pembelian dalam negeri, dan rekap belanja belum
              menjadi kebutuhan halaman ini.
            </p>
            <div className="flex flex-wrap gap-6">
              <SlotFoto
                judul="Foto Invoice Material"
                foto={form.fotoNota}
                // `bisaUnggah` di sini BUKAN `bolehUnggah`: bagian ini sudah
                // tersaring olehnya, yang menentukan tombolnya adalah apakah
                // tahap ini masih menerima dokumen baru.
                bisaUnggah={bolehUnggahFoto}
                keterangan="Belum ada foto nota"
                onPilih={(berkas) =>
                  ubahInfo({ fotoNota: URL.createObjectURL(berkas) })
                }
              />
              <SlotFoto
                judul="Bukti Pembayaran"
                foto={form.buktiBayar}
                // Slot tampilan saja. Belum ada hubungan ke pembayaran, jadi
                // tidak ada tombol: halaman ini belum boleh jadi tempat
                // mengunggah bukti ke tabel yang belum ada.
                bisaUnggah={false}
                keterangan="Hanya menampilkan foto. Hubungan ke pembayaran dikerjakan nanti."
              />
            </div>
          </div>
        )}

        {/* ===== Aksi ===== */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {stage ? `Tahap: ${stage.label}` : ''}
            {items.length === 0 && ' — belum ada material'}
            {/* Di tahap read-only tidak ada `sunting` sama sekali (semua
                kontrol mati), jadi tanpa baris ini popup terlihat seperti
                sedang menunggu sesuatu — padahal memang sudah selesai dan
                tidak ada yang boleh diubah lagi. */}
            {!bolehEdit && <span> — sudah tidak bisa diubah</span>}
          </p>
          <div className="flex gap-2">
            {sunting && bolehEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  aksi.simpan(form);
                  setSunting(null);
                }}
              >
                Simpan
              </Button>
            )}
            {stageBerikutnya && (
              <Button
                size="sm"
                disabled={!bisaLanjut}
                onClick={() => aksi.lanjutStage({ ...form, items })}
              >
                {stage?.id === 'diajukan' ? 'Setujui' : `Lanjut ke ${stageBerikutnya.label}`}
              </Button>
            )}
            {stage?.id === 'diterima' && (
              <Button
                size="sm"
                disabled={!bisaSelesaikan}
                onClick={() => aksi.selesaikan({ ...form, items })}
              >
                Tandai Selesai
              </Button>
            )}
          </div>
        </div>
    </>
  );
}

/**
 * Judul popup, dipisah supaya bisa diuji dari server.
 *
 * `DialogTitle` hidup di dalam `Dialog`, dan `Dialog` dirender lewat portal
 * yang tidak ikut ter-render di `renderToStaticMarkup`. Kalau judulnya ditulis
 * langsung di sana, tidak ada cara memverifikasinya tanpa membuka popup di
 * browser. Pola yang sama dipakai `labelSumber` di papan production.
 */
export function judulPopup(kartu: KartuPo): string {
  return `${kartu.noPo} — ${kartu.vendor}`;
}

/**
 * Pembungkus `IsiPopup` —argas Popup yang sebenarnya.
 *
 * Satu-satunya tugasnya `Dialog` danestado popup-nya sendiri; seluruh isi
 * ada di `IsiPopup` supaya bisa dirender tanpa portal.
 */
export default function PopupPo({
  kartu,
  stage,
  stageBerikutnya,
  onstageDatang,
  aksi,
  onTutup,
}: {
  kartu: KartuPo | null;
  stage: StagePapan | undefined;
  stageBerikutnya: StagePapan | undefined;
  onstageDatang: Record<string, string[]>;
  aksi: AksiPo;
  onTutup: () => void;
}) {
  return (
    <Dialog
      open={kartu !== null}
      onOpenChange={(buka) => {
        if (buka) return;
        onTutup();
      }}
    >
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-4xl">
        {kartu && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">{judulPopup(kartu)}</DialogTitle>
            </DialogHeader>
            <IsiPopup
              kartu={kartu}
              stage={stage}
              stageBerikutnya={stageBerikutnya}
              onstageDatang={onstageDatang}
              aksi={aksi}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
