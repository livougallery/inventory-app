import type { CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rupiah } from '@/lib/format';
import { KATEGORI_VENDOR, SIZE, labelDari } from '@/lib/opsi';
import type { KartuRegister, ProdukRegister } from '@/lib/produk';
import type { SpesifikasiKain } from '@/pages/production-fulfillment/data-kanban';

// ===== Detail produk =====
//
// Dibuka dari daftar Register dengan mengklik barisnya. Bentuknya dialog,
// tapi bukan dialog kecil di tengah layar: isinya satu halaman penuh —
// identitas, rencana warna & ukuran, dan bahan yang dibutuhkan.
//
// Kenapa dialog dan bukan halaman sendiri: yang dibuka owner saat presentasi
// adalah satu produk demi satu produk, dan berpindah halaman berarti kehilangan
// posisi di daftar setiap kali. Dialog besar menjaga daftarnya tetap terlihat
// di belakang.
//
// ANIMASINYA SENGAJA TIDAK SEPERTI DIALOG LAIN.
//
// Bawaannya `duration-100` + `zoom-in-95`: seratus milidetik, jadi isinya
// seperti muncul begitu saja — untuk dialog konfirmasi kecil itu memang pas,
// tapi untuk panel sebesar ini terbaca sebagai "pop up tiba-tiba". Di sini
// durasinya 300ms dengan `ease-out`, dan skalanya mulai dari 0.97, sehingga
// panelnya terbaca MEMBESAR dari halaman di belakangnya.
//
// Skalanya dipasang lewat custom property `--tw-enter-scale`, bukan dengan
// menimpa `zoom-in-95` memakai kelas. Dua kelas `zoom-in-*` TIDAK saling
// meniadakan: twMerge hanya menyelesaikan konflik dalam bucket yang sama, dan
// `zoom-in-95` dengan `zoom-in-[0.97]` dianggap dua hal berbeda — keduanya
// lolos ke CSS, lalu yang menang ditentukan urutan di berkas keluaran, bukan
// niat penulisnya. Sudah diuji langsung terhadap twMerge di proyek ini.
// Inline style tidak punya ketidakpastian itu.
//
// RINCIAN WARNA ADA DI SINI, dan itu sebabnya. Di kartu daftar, baris per
// warna dipindahkan ke dialog ini (permintaan pemilik): pada lima kolom kartu
// selebar ~205px, dua baris warna memakan ruang yang membuat kartu setinggi
// foto + teks, dan produk 8 varian tetap menzalim 8 baris. Jadi yang hilang
// dari kartu tidak hilang dari produk — cuma pindah tempat, dan tempatnya di
// sini memang sudah jadi tempat membaca rincian.

export function IsiDetailProduk({
  produk,
  kartu,
}: {
  produk: ProdukRegister;
  /**
   * Ringkasan stok per warna. Opsional supaya produk bisa tetap dirender
   * tanpa kartu —dialog ini dibaca dari dua tempat, dan pemeriksa smoke test
   * memang merendernya langsung dari katalog saja.
   */
  kartu?: KartuRegister | null;
}) {
  const sp = produk.spesifikasi;

  const totalPcs = sp.warna.reduce(
    (s, w) => s + w.pcs.reduce((a, p) => a + p.qty, 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* ── Identitas ─────────────────────────────────────────────── */}
      <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="flex h-40 items-center justify-center rounded-xl border bg-muted/40 text-xs text-muted-foreground">
          {produk.foto ? 'FOTO PRODUK' : 'Belum ada foto'}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{produk.kategori}</Badge>
            <Badge variant="secondary">{produk.brand}</Badge>
          </div>

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Product ID" nilai={produk.id} />
            <Field label="Design Code" nilai={sp.designCode} />
            <Field label="Batch" nilai={sp.batch} />
            <Field
              label="Vendor Category"
              nilai={labelDari(KATEGORI_VENDOR.production, sp.kategoriVendor)}
            />
            <Field label="Vendor / CMT" nilai={sp.namaVendor} />
            <Field label="Register Date" nilai={produk.registerDate} />
            <Field label="Harga Jual" nilai={rupiah(produk.harga)} />
            <Field label="Total Rencana" nilai={`${totalPcs} PCS`} />
            {/* Dua angka ini SUMBER-nya berbeda dari "Total Rencana" di
                atasnya, dan itu bukan kebetulan. `totalPcs` menjumlah rencana
                produksi dari katalog; `totalStok`/`totalJual` menjumlah gudang.
                Keduanya boleh berbeda jauh untuk produk yang sama, jadi
                meletakkan keduanya di satu daftar tanpa nama yang membedakan
                akan menyesatkan. */}
            {kartu && (
              <>
                <Field label="Total Stock" nilai={`${kartu.totalStok} pcs`} />
                <Field label="Bisa Jual" nilai={`${kartu.totalJual} pcs`} />
              </>
            )}
          </dl>
        </div>
      </div>

      {/* ── Stok per warna ─────────────────────────────────────────
          Pindah dari kartu daftar ke sini. Satu baris per warna, dengan
          ukuran di dalamnya — bukan satu baris per varian, karena itu
          kembali ke masalah yang membuat kartu lama tidak bisa dipakai. */}
      {kartu && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Stok per Warna</h3>
            <p className="text-xs text-muted-foreground">
              {kartu.jumlahWarna} warna · {kartu.jumlahVarian} varian (warna × ukuran)
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 py-2 text-xs">Warna</TableHead>
                  <TableHead className="px-3 py-2 text-xs">Ukuran</TableHead>
                  <TableHead className="px-3 py-2 text-right text-xs">Bisa Jual</TableHead>
                  <TableHead className="px-3 py-2 text-right text-xs">Total Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kartu.warnaRingkas.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="px-3 py-2">{w.warna}</TableCell>
                    <TableCell className="px-3 py-2 text-muted-foreground">
                      {w.size}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {w.stokJual}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {w.stokTotal}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium hover:bg-transparent">
                  <TableCell className="px-3 py-2" colSpan={2}>
                    Total
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">
                    {kartu.totalJual}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">
                    {kartu.totalStok}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* ── Rencana warna & ukuran ────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Color &amp; Size Plan</h3>
          <p className="text-xs text-muted-foreground">
            {sp.warna.length} warna • total {totalPcs} PCS
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3 py-2 text-xs">Color</TableHead>
                <TableHead className="px-3 py-2 text-xs">Code</TableHead>
                {SIZE.map((u) => (
                  <TableHead key={u} className="px-3 py-2 text-xs">
                    {u}
                  </TableHead>
                ))}
                <TableHead className="px-3 py-2 text-xs">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sp.warna.map((w) => {
                const qty = (u: string) => w.pcs.find((p) => p.ukuran === u)?.qty ?? 0;
                const total = w.pcs.reduce((a, p) => a + p.qty, 0);
                return (
                  <TableRow key={w.kode}>
                    <TableCell className="px-3 py-2">{w.nama}</TableCell>
                    <TableCell className="px-3 py-2 text-muted-foreground">
                      {w.kode}
                    </TableCell>
                    {SIZE.map((u) => (
                      <TableCell key={u} className="px-3 py-2 tabular-nums">
                        {qty(u) || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    ))}
                    <TableCell className="px-3 py-2 font-medium tabular-nums">
                      {total}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ── Bahan (BOM) ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Material Requirements (BOM)</h3>
          <p className="text-xs text-muted-foreground">
            Kebutuhan bahan per pcs. Kain dihitung per warna, aksesori untuk semua varian.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3 py-2 text-xs">Jenis</TableHead>
                <TableHead className="px-3 py-2 text-xs">Material</TableHead>
                <TableHead className="px-3 py-2 text-xs">Berlaku</TableHead>
                <TableHead className="px-3 py-2 text-xs">Qty / Pcs</TableHead>
                <TableHead className="px-3 py-2 text-xs">Stok</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sp.kain.map((k) => (
                <TableRow key={k.nama}>
                  <TableCell className="px-3 py-2">
                    <Badge variant="outline">Kain</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">{k.nama}</TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {Object.keys(k.perWarna).length} warna
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">
                    {/* Kain bisa punya pemakaian berbeda per warna; yang sama
                        ditampilkan sekali supaya kolomnya tidak penuh angka
                        yang berulang.

                        Tanpa warna sama sekali, kolomnya dibiarkan kosong.
                        `seragam([])` bernilai true (vakum), lalu
                        `Object.values(...)[0]?.perPcs ?? 0` menghasilkan 0 —
                        dan "0 m" terbaca sebagai "kain ini tidak terpakai",
                        padahal yang benar "pemakaiannya belum dicatat".
                        Dua keadaan berbeda itu tidak boleh tampil sama. */}
                    {pemakaianKain(k)}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Stok nilai={Object.values(k.perWarna).map((v) => v.tersedia)} />
                  </TableCell>
                </TableRow>
              ))}

              {sp.aksesori.map((a) => (
                <TableRow key={a.nama}>
                  <TableCell className="px-3 py-2">
                    <Badge variant="outline">Aksesori</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">{a.nama}</TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {a.berlaku}
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">
                    {a.perPcs} {a.satuan}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Stok nilai={[a.tersedia]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
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
      {/* Satu halaman penuh, dan isinya yang menggulir — bukan dialognya yang
          memanjang keluar layar. `grid-rows-[auto_minmax(0,1fr)]` yang membuat
          itu: baris pertama setinggi judulnya, baris kedua mengambil sisanya
          dan boleh menyusut (`minmax(0,1fr)`, bukan `1fr` — tanpa `minmax`
          isinya yang panjang mendorong dialognya melewati batas tinggi). */}
      <DialogContent
        className="max-h-[92vh] gap-0 p-0 duration-300 ease-out sm:max-w-[1100px] grid-rows-[auto_minmax(0,1fr)]"
        style={{ '--tw-enter-scale': '0.97' } as CSSProperties}
      >
        {produk && (
          <>
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle className="text-lg">{produk.nama}</DialogTitle>
              <DialogDescription className="text-xs">
                Detail produk dan rencana produksinya.
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto px-6 py-5">
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
    <div className="space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{nilai}</dd>
    </div>
  );
}

/**
 * Pemakaian kain per pcs, atau '—' kalau belum ada warnanya.
 *
 * Dipisah dari JSX-nya supaya aturan "kosong berarti belum dicatat, bukan nol"
 * bisa dibaca di satu tempat — dan supaya tidak perlu memanggil `Object.values`
 * dua kali hanya untuk menanyakan hal yang sama.
 */
function pemakaianKain(k: SpesifikasiKain): string {
  const perWarna = Object.values(k.perWarna);
  if (perWarna.length === 0) return '—';
  const angka = perWarna.map((v) => v.perPcs);
  return seragam(angka) ? `${angka[0]} ${k.satuan}` : 'beda per warna';
}

/** Semua angka sama? Dipakai untuk memutuskan kolom kain menampilkan angka atau ringkasan. */
function seragam(angka: (number | undefined)[]): boolean {
  return angka.every((n) => n === angka[0]);
}

/**
 * Stok beberapa warna sekaligus.
 *
 * `undefined` ditampilkan sebagai "Belum dicatat", BUKAN 0 — dan itu bedanya
 * penting: nol berarti bahannya habis, belum dicatat berarti tidak ada yang
 * tahu. Menyamakan keduanya membuat produk yang stoknya belum diinput tampak
 * kekurangan bahan.
 */
function Stok({ nilai }: { nilai: (number | undefined)[] }) {
  if (nilai.every((n) => n === undefined)) {
    return <span className="text-xs text-muted-foreground">Belum dicatat</span>;
  }
  const terendah = nilai.filter((n): n is number => n !== undefined).sort((a, b) => a - b)[0] ?? 0;
  const habis = terendah === 0;

  return (
    <span className="flex items-center gap-2">
      <span className="tabular-nums">{terendah.toLocaleString('id-ID')}</span>
      {habis && (
        <Badge variant="destructive" className="whitespace-nowrap">
          Habis
        </Badge>
      )}
      {nilai.length > 1 && (
        <span className="text-[11px] text-muted-foreground">terendah</span>
      )}
    </span>
  );
}
