import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rupiah } from '@/lib/format';
import type { BarisHpp } from '@/pages/HppPratinjau';
import type { BerkasBukti, KartuPdff, StagePapan } from './data-kanban';
import { JENIS_BUKTI_HPP } from './data-kanban';
import {
  KATEGORI_CMT,
  MARGIN_HARGA_JUAL,
  barisShipmentUntuk,
  gerbangHpp,
  hppProduksi,
  hppWhiteLabel,
  presisiFix,
  type BarisShipmentRingkas,
  type SumberPapan,
} from './hpp';
import { KotakBukti, type AksiStage } from './PopupKartu';

// ===== Stage HPP & Price: satu komponen, dua mode =====
//
// Mode TIDAK ditentukan workcode, tapi PAPAN. Alasannya tercatat di `hpp.ts`:
// dulu akhiran workcode ditulis di dalam `kartuBaru()`, dan usulan yang dibuat
// dari papan White Label mendapat workcode produksi tanpa error apa pun. Jadi
// workcode pernah salah, dan sistemnya sudah tahu itu. Workcode tetap diperiksa
// — tapi hasilnya PERINGATAN, bukan perpindahan mode.
//
// Dua mode, karena dua sumber biaya yang sama sekali berbeda:
//
//   Production   = Σ (kebutuhan × harga FIFO) ÷ pcs jadi. Ongkos jahit ikut,
//                  sebagai baris `cmt_cost` yang dikeluarkan dari tabel bahan
//                  supaya kelihatan bahwa ia bukan kain.
//   White Label  = (beli + kirim) ÷ pcs shipment. Kurs ditampilkan menonjol
//                  karena di situlah kesalahan baca paling sering terjadi di
//                  presentasi: angkanya besar, kursnya kecil, dan mata uangnya
//                  berbeda dari yang tertulis di nota.
//
// HPP Produksi tanpa ongkos jahit tidak dihitung sama sekali — kartu tertahan,
// bukan HPP nol. Keputusan pemilik: "tidak mungkin hpp produksi tidak punya ongkos
// jahit, pasti punya. Kalau masih kosong biarin stuck di hpp." Lihat
// `gerbangHpp()` di `hpp.ts`.
//
// Bukti untuk stage ini hanya hidup di prop `bukti` di bawah, yang disimpan
// caller di bawah kuncinya sendiri. Sengaja BUKAN bagian dari `buktiCutting`:
// `SEMUA_ID_BUKTI` diturunkan dari `JENIS_BUKTI_CUTTING` lalu dipakai
// `ringkasCutting`, jadi menambah id baru di sana akan membuat setiap kartu
// Cutting menuntut bukti yang tidak pernah ada. Lihat `PapanFulfillment.tsx`.

/** Bukti per kartu, per jenis — bentuk yang sama dengan `BuktiCutting`. */
export type BuktiHppPrice = Record<string, Record<string, BerkasBukti[]>>;

/** Isi `BuktiHppPrice` untuk SATU kartu: jenis → daftar berkasnya. */
export type BuktiSatuKartu = Record<string, BerkasBukti[]>;

/**
 * Dua jenis bukti yang wajib ada sebelum kartu boleh keluar dari HPP & Price.
 *
 * Definisinya PINDAH ke `data-kanban.ts` saat tiket 3, dan di sini hanya
 * diteruskan. Bukan kerapian: `temuan.ts` (Finance Validate) juga membaca
 * daftar ini untuk mencari "bukti belum diunggah", dan `temuan.ts` dipanggil
 * dari `PopupKartu.tsx` — berkas yang mengimpor `KotakBukti` dari sini. Kalau
 * daftarnya tetap di sini, `temuan.ts` harus mengimpor berkas component dan
 * terbentuk lingkaran modul yang sudah pernah membuat urutan modul tidak bisa
 * ditentukan.
 *
 * Diekspor ulang dari sini supaya pemanggil lama (smoke test) tidak perlu
 * berubah — satu daftar, satu sumber, dua pintu masuk.
 */
export { JENIS_BUKTI_HPP } from './data-kanban';

export interface SeksiHppPriceProps {
  kartu: KartuPdff;
  /** Papan tempat kartu ini dibuka — penentu mode. */
  sumber: SumberPapan;
  /** Baris shipment. Hanya dibaca di mode White Label. */
  barisHpp: readonly BarisHpp[];
  /**
   * Bukti kalkulasi KARTU INI saja — sudah diambil pemanggil dari `BuktiHppPrice`
   * dengan `bukti[kartu.id]`.
   *
   * Kalau yang dioper di sini peta seluruh kartu, setiap kartu akan menampilkan
   * bukti milik kartu lain — dan `jenisKosong` di bawah ikut membaca peta itu,
   * sehingga kartu tanpa bukti apa pun akan dilaporkan "bukti sudah lengkap".
   */
  bukti: BuktiSatuKartu;
  /** Data stage ini sudah terkunci: bukti tidak bisa ditambah/dihapus. */
  terkunci?: boolean;
  /** Stage berikutnya di papan ini — menentukan label tombol lanjut. */
  tujuan?: StagePapan;
  /**
   * Aksi untuk stage ini: `lanjutStage` sama dengan milik papan, tapi
   * tambah/hapus bukti harus menunjuk store HPP — lihat `AksiBuktiHpp`.
   */
  aksi?: AksiBuktiHpp;
}

/**
 * `KotakBukti` membaca `aksi.tambahBukti` / `aksi.hapusBukti`, bukan milik
 * stage ini.
 *
 * Jadi `KotakBukti` diberi objek yang namanya sama tapi menunjuk handler HPP.
 * Mengoper `AksiStage` langsung di sini akan membuat bukti kalkulasi ikut
 * tersimpan di `buktiCutting` — dan `ringkasCutting` membacanya sebagai syarat
 * keluar dari Cutting, jadi sebuah kartu bisa terlihat sudah lengkap Cutting
 * karena ada bukti HPP. Object itu sengaja dibuat di sini, per pemanggilan,
 * bukan di `AksiStage`: `AksiStage` lalu tetap punya satu jalur untuk Cutting.
 */
type AksiBuktiHpp = Pick<AksiStage, 'lanjutStage'> & {
  tambahBukti: (kartu: KartuPdff, jenis: string, berkas: File) => void;
  hapusBukti: (kartu: KartuPdff, jenis: string, nama: string) => void;
};

export default function SeksiHppPrice({
  kartu,
  sumber,
  barisHpp,
  bukti,
  terkunci = false,
  tujuan,
  aksi,
}: SeksiHppPriceProps) {
  const ongkosJahit = kartu.detail.ongkosJahit;

  // Baris shipment dicari di sini, sekali, lalu dipakai oleh gerbang DAN oleh isi
  // tabel — supaya angka yang ditampilkan dan angka yang menentukan boleh-lanjut
  // tidak mungkin berbeda.
  const { baris: shipment, produkAmbigu } =
    sumber === 'whitelabel'
      ? barisShipmentUntuk(kartu, barisHpp)
      : { baris: null, produkAmbigu: null };

  const gerbang = gerbangHpp(kartu, sumber, ongkosJahit, shipment ?? undefined);

  // Dua sebab kenapa kartu tertahan, ditampilkan terpisah karena perbaikannya
  // berbeda: satu "datanya belum ada", satu lagi "datanya ambigu dan orang
  // harus memutuskan". Digabung jadi satu kalimat, pembacanya dikirim ke tempat
  // yang salah.
  const alasan = produkAmbigu
    ? `Ada lebih dari satu baris shipment untuk "${produkAmbigu}". HPP sengaja dikosongkan — angka kartu yang lain lebih berbahaya daripada tidak ada angka.`
    : gerbang.alasan;

  // Gate HANYA pada HPP yang sudah bisa dihitung — sama seperti `gerbangHpp()`
  // yang dipakai di dua mode. Bukti di stage ini ditampilkan dan dilaporkan
  // statusnya, tapi tidak menahan kartu: kontrak tiket 4 tidak meminta dua
  // bukti itu sebagai syarat, dan menjadikannya syarat tanpa diminta akan
  // menahan kartu yang HPP-nya sudah benar tanpa penjelasan apa pun. Kalau
  // nanti pemilik mau membuktinya jadi syarat, itu satu kondisi di bawah ini.
  const bolehLanjut = gerbang.bolehLanjut && produkAmbigu === null;

  // Status bukti dibaca dari kotak yang sama dengan yang dirender di bawah, jadi
  // tidak mungkin berbeda: kalau salah satu jenis kosong, kartu itu belum punya
  // dua bukti walaupun tombol tetap aktif.
  const jenisKosong = JENIS_BUKTI_HPP.filter((j) => (bukti[j.id]?.length ?? 0) === 0);

  let status: string;
  if (alasan) {
    status = alasan;
  } else if (jenisKosong.length > 0) {
    status = `HPP sudah dihitung. Bukti belum lengkap: ${jenisKosong.map((j) => j.judul).join(' dan ')}.`;
  } else {
    status = 'HPP dan harga jual sudah dihitung, bukti kalkulasi sudah lengkap.';
  }

  return (
    <section className="space-y-3">
      <JudulSeksi
        judul="HPP & Price"
        keterangan={
          sumber === 'production'
            ? 'Bahan dari BOM kartu ini + ongkos jahit, dibagi barang jadi yang masuk stok.'
            : 'Beli + kirim dari satu shipment, dibagi pcs shipment. Kurs ikut menentukan.'
        }
      />

      {gerbang.peringatan && <Peringatan>{gerbang.peringatan}</Peringatan>}

      {sumber === 'production' ? (
        <ModeProduction kartu={kartu} ongkosJahit={ongkosJahit} />
      ) : (
        <ModeWhiteLabel kartu={kartu} shipment={shipment} produkAmbigu={produkAmbigu} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {JENIS_BUKTI_HPP.map((j) => (
          <KotakBukti
            key={j.id}
            jenis={j.id}
            judul={j.judul}
            keterangan={j.keterangan}
            terima={j.terima}
            sudahAda={(bukti[j.id]?.length ?? 0) > 0}
            berkas={bukti[j.id] ?? []}
            aksi={aksi}
            kartu={kartu}
            terkunci={terkunci}
          />
        ))}
      </div>

      <RingkasanHarga hpp={gerbang.hpp} sellingPrice={gerbang.sellingPrice} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-[240px] flex-1 space-y-1">
          <div className="text-xs font-medium">Kelengkapan stage ini</div>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
        <Button disabled={!bolehLanjut} onClick={() => aksi?.lanjutStage(kartu)}>
          Lanjut ke {tujuan?.label ?? 'stage berikutnya'}
        </Button>
      </div>
    </section>
  );
}

// ===== Production: tabel bahan + ongkos jahit =====

function ModeProduction({
  kartu,
  ongkosJahit,
}: {
  kartu: KartuPdff;
  ongkosJahit: { perPcs: number } | undefined;
}) {
  const hasil = hppProduksi(kartu, ongkosJahit);

  // Ongkos jahit dikeluarkan dari tabel dan diberi blok sendiri. Membiarkannya
  // sebagai baris terakhir di antara kain membuat ia terbaca sebagai satu meter
  // kain lagi.
  const bahan = hasil.baris.filter((b) => b.kategori !== KATEGORI_CMT);
  const jahit = hasil.baris.filter((b) => b.kategori === KATEGORI_CMT);
  const biayaJahit = presisiFix(jahit.reduce((s, b) => s + (b.biaya ?? 0), 0));

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>Varian</TableHead>
            <TableHead className="text-right">Kebutuhan/pcs</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Harga FIFO</TableHead>
            <TableHead className="text-right">Biaya</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bahan.map((b, i) => (
            <TableRow key={b.material + '|' + b.varian + '|' + i}>
              <TableCell>{b.material}</TableCell>
              <TableCell className="text-muted-foreground">{b.varian}</TableCell>
              <TableCell className="text-right tabular-nums">{b.perPcs}</TableCell>
              <TableCell className="text-right tabular-nums">{b.totalUsage}</TableCell>
              <TableCell className="text-right tabular-nums">
                {b.harga === null ? 'Belum dicatat' : rupiah(b.harga)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {b.biaya === null ? '—' : rupiah(b.biaya)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 font-medium">
            <TableCell colSpan={5} className="text-right text-muted-foreground">
              Subtotal bahan
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {rupiah(hasil.totalBiaya - biayaJahit)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {/* Ongkos jahit sebagai blok sendiri, bukan baris tabel — itu ongkos, bukan
          bahan, dan pemisahnya harus terlihat sebelum angkanya dijumlahkan. */}
      <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Ongkos jahit ({KATEGORI_CMT})
        </div>
        {jahit.length > 0 ? (
          <>
            <div className="mt-1 text-xs text-muted-foreground">
              {rupiah(ongkosJahit?.perPcs ?? 0)}/pcs × {hasil.jumlahPcsJadi} pcs jadi
            </div>
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Biaya jahit</span>
              <span className="tabular-nums font-medium">{rupiah(biayaJahit)}</span>
            </div>
          </>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">
            Belum diisi. Tanpa ongkos jahit, HPP produksi sengaja tidak dihitung — bukan
            dianggap nol.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">
          Total biaya · {hasil.jumlahPcsJadi} pcs jadi
        </span>
        <span className="tabular-nums font-semibold">{rupiah(hasil.totalBiaya)}</span>
      </div>

      {hasil.tanpaHarga.length > 0 && (
        <Peringatan>
          {hasil.tanpaHarga.length} material belum punya harga FIFO, jadi biayanya belum
          dihitung: {hasil.tanpaHarga.join(', ')}.
        </Peringatan>
      )}
    </div>
  );
}

// ===== White Label: beli + kirim + kurs =====

function ModeWhiteLabel({
  kartu,
  shipment,
  produkAmbigu,
}: {
  kartu: KartuPdff;
  /** Bentuk sempit dari `BarisHpp` — yang dikembalikan `barisShipmentUntuk()`. */
  shipment: BarisShipmentRingkas | null;
  produkAmbigu: string | null;
}) {
  if (produkAmbigu) {
    return (
      <Peringatan>
        Ada lebih dari satu baris shipment untuk "{produkAmbigu}", jadi HPP tidak ditampilkan.
      </Peringatan>
    );
  }

  if (!shipment) {
    return (
      <Peringatan>
        Belum ada baris shipment untuk "{kartu.productName}". HPP White Label dihitung dari nota
        pembelian dan ongkos kirim, jadi tanpa baris itu tidak ada angka yang bisa ditampilkan.
      </Peringatan>
    );
  }

  const { biayaBeli, biayaKirim, hpp } = hppWhiteLabel(shipment);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {shipment.codeShipment} · {shipment.namaSupplier}
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Angka label="Harga beli" nilai={rupiah(shipment.actualIdrPaidProduct)} />
          <Angka label="Ongkos kirim" nilai={rupiah(shipment.actualIdrPaidLogistic)} />
          <Angka label="Total pcs" nilai={String(shipment.totalPcs)} />
        </dl>

        {/* Kurs dapat blok sendiri, bukan sekadar satu baris lagi: itu angka
            yang membuat angka rupiah di atas berubah kalau salah baca, dan di
            presentasi justru kurs yang paling sering ditanya. */}
        <div className="mt-3 flex items-baseline justify-between rounded-md bg-muted px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Kurs {shipment.currency}
          </span>
          <span className="tabular-nums text-lg font-semibold">
            1 {shipment.currency} = {rupiah(shipment.kurs)}
          </span>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Komponen</TableHead>
            <TableHead className="text-right">Perhitungan</TableHead>
            <TableHead className="text-right">Per pcs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Biaya beli</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {rupiah(shipment.actualIdrPaidProduct)} ÷ {shipment.totalPcs}
            </TableCell>
            <TableCell className="text-right tabular-nums">{rupiah(biayaBeli)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Biaya kirim</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {rupiah(shipment.actualIdrPaidLogistic)} ÷ {shipment.totalPcs}
            </TableCell>
            <TableCell className="text-right tabular-nums">{rupiah(biayaKirim)}</TableCell>
          </TableRow>
          <TableRow className="font-medium">
            <TableCell>HPP</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {rupiah(biayaBeli)} + {rupiah(biayaKirim)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{rupiah(hpp)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// ===== Hasil: HPP dan harga jual =====

function RingkasanHarga({ hpp, sellingPrice }: { hpp: number | null; sellingPrice: number | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          HPP per pcs
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {hpp === null ? 'Belum bisa dihitung' : rupiah(hpp)}
        </div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Harga jual
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {sellingPrice === null ? '—' : rupiah(sellingPrice)}
        </div>
        {hpp !== null && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            HPP × {String(MARGIN_HARGA_JUAL).replace('.', ',')} (margin global)
          </div>
        )}
      </div>
    </div>
  );
}

function Angka({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium">{nilai}</dd>
    </div>
  );
}

function Peringatan({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function JudulSeksi({ judul, keterangan }: { judul: string; keterangan: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{judul}</h3>
      <p className="text-xs text-muted-foreground">{keterangan}</p>
    </div>
  );
}