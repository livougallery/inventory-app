import { rupiah } from '@/lib/format';
import type { BerkasBukti, KartuPdff, Temuan } from './data-kanban';
import {
  JENIS_BUKTI_CUTTING,
  JENIS_BUKTI_HPP,
  JENIS_BUKTI_INVOICE_LOGISTIC,
  JENIS_BUKTI_UPLOAD,
  PAPAN_PRODUCTION,
  PAPAN_WHITELABEL,
  jenisBuktiTahap,
  totalPcs,
} from './data-kanban';
import type { BarisShipmentRingkas, SumberPapan } from './hpp';
import { barisShipmentUntuk, hppProduksi, hppWhiteLabel } from './hpp';

// ===== Temuan Finance Validate =====
//
// Temuan DIHITUNG, bukan disimpan — lihat catatan `Temuan` di `data-kanban.ts`.
// Fungsi di berkas ini menurunkannya dari data yang ada, jadi temuan yang sudah
// tidak berlaku karena datanya diperbaiki hilang sendiri, dan temuan yang masih
// berlaku tidak bisa "kelupaan dihapus". Yang disimpan orang hanyalah id temuan
// yang sudah DITUTUP, dan itulah satu-satunya masukan yang mengubah `terbuka`
// menjadi `tertutup`.
//
// Berkas ini SENGAJA terpisah dari `data-kanban.ts` dan dari `PopupKartu.tsx`:
// ia cuma membaca tipe dan daftar yang sudah ada, jadi bisa dikerjakan paralel
// dengan tiket lain tanpa menyentuh berkas yang sedang dipegang orang lain.
//
// Sumber temuan, sesuai keputusan pemilik:
//
//   1. HPP Produksi tanpa ongkos jahit    → "ongkos jahit belum diisi"
//   2. HPP White Label di bawah biaya beli → "HPP di bawah biaya beli"
//   3. Receive dengan `Sisa` > 0          → "barang belum lengkap datang"
//   4. Upload dengan `jumlahUploadPos` = 0 → "belum ada yang diunggah ke POS"
//   5. Bukti wajib yang kosong            → "bukti belum diunggah"
//
// Dua catatan jujur soal jangkauannya:
//
//   - Nomor 3 BELUM PUNYA SUMBER DATA di model kanban. Stage Receive masih
//     `SeksiBelumAda` (alurnya belum diputuskan pemilik) dan tidak ada field
//     `Sisa` di `KartuPdff`. Pemeriksaannya tetap ditulis di sini lengkap
//     dengan parameternya, supaya begitu model Receive lahir tinggal dioper —
//     dan supaya rumusnya bisa diuji sekarang. Selama pemanggil tidak mengoper
//     `terima`, temuan ini tidak pernah muncul: kartu contoh tidak boleh
//     dituduh "barang belum lengkap" hanya karena datanya belum ada.
//
//   - Nomor 2 adalah PENJAGA, bukan temuan yang bisa muncul hari ini. Rumus
//     HPP White Label adalah `biayaBeli + biayaKirim`, dan ongkos kirim tidak
//     pernah negatif — jadi `HPP < biaya beli` mustahil dari rumus yang benar.
//     Justru itu gunanya: angka HPP yang lebih rendah dari harga belinya
//     pernah benar-benar tertulis di tabel pratinjau (78.000 padahal 152.133),
//     dan tidak ada satu pun pemeriksaan yang menangkapnya. Penjaga ini yang
//     seharusnya menangkap angka seperti itu kalau muncul lagi.

/**
 * Satu varian yang barangnya diterima di stage Receive.
 *
 * Bentuk minimum untuk menghitung `Sisa` — rumusnya dari CONTEXT.md:
 * `Sisa = Plan − (Sudah Datang + Masuk Stok)`. Ketiga angkanya dipisah, bukan
 * satu "sudah datang" gabungan: `Masuk Stok` sudah dikurangi reject, jadi
 * menggabungkannya dengan `Sudah Datang` akan menghitung reject sebagai barang
 * yang tidak pernah datang — dan selisihnya muncul sebagai temuan palsu.
 */
export interface BarisTerima {
  /** Nama varian, mis. "Black S". */
  varian: string;
  /** Rencana pcs varian ini. */
  plan: number;
  /** Pcs yang sudah datang pada kedatangan-kedatangan sebelumnya. */
  sudahDatang: number;
  /** Pcs yang masuk stok dari kedatangan terakhir — setelah reject. */
  masukStok: number;
}

export interface OpsiTemuan {
  /** Papan tempat kartu ini berada — menentukan bukti mana yang wajib. */
  sumber: SumberPapan;
  /**
   * Bukti yang sudah diunggah untuk KARTU INI saja: jenis → daftar berkasnya.
   *
   * Ketiga store (`buktiCutting`, `buktiHpp`, `buktiTahap`) digabung jadi satu
   * peta oleh pemanggil. Id jenisnya sudah berbeda antar store — lihat catatan
   * di `data-kanban.ts` — jadi tidak ada berkas yang bisa terhitung dua kali.
   */
  bukti?: Record<string, BerkasBukti[]>;
  /** Id temuan yang sudah ditutup orang. Temuan itu tetap tampil, berstatus tertutup. */
  ditutup?: readonly string[];
  /** Baris penerimaan per varian. Kosong = belum ada datanya, bukan "lengkap". */
  terima?: readonly BarisTerima[];
  /** Baris shipment HPP White Label. Hanya dibaca di papan White Label. */
  barisHpp?: readonly BarisShipmentRingkas[];
}

/**
 * Temuan yang wajib diunggah buktinya, per stage asal.
 *
 * Satu daftar per papan, bukan satu daftar untuk keduanya: papan Production
 * tidak punya Invoice Logistic (barangnya dijahit sendiri), dan papan White
 * Label tidak punya Cutting. Menuntut bukti stage yang tidak pernah dilalui
 * kartu akan membuat temuan yang tidak bisa ditutup siapa pun — dan di layar
 * itu terlihat seperti kerusakan, bukan seperti pemeriksaan.
 */
function buktiWajib(
  sumber: SumberPapan,
  flowTransaction: string | undefined
): { stage: string; jenis: readonly { id: string; judul: string }[] }[] {
  const daftar: { stage: string; jenis: readonly { id: string; judul: string }[] }[] = [];
  if (sumber === 'production') {
    daftar.push({ stage: 'cutting', jenis: JENIS_BUKTI_CUTTING });
  } else {
    daftar.push({ stage: 'invoice-logistic', jenis: JENIS_BUKTI_INVOICE_LOGISTIC });
  }
  daftar.push({ stage: 'invoice-product', jenis: jenisBuktiTahap('invoice-product', flowTransaction) });
  daftar.push({ stage: 'hpp-price', jenis: JENIS_BUKTI_HPP });
  daftar.push({ stage: 'upload', jenis: JENIS_BUKTI_UPLOAD });
  return daftar;
}

/**
 * Hitung seluruh temuan satu kartu.
 *
 * Urutannya tetap — temuan yang menahan pekerjaan (ongkos jahit, selisih
 * datang, upload nol) lebih dulu, baru bukti yang belum diunggah — supaya
 * pembaca bertemu hal yang harus DIPUTUSKAN sebelum hal yang harus DIUNGGAH,
 * dan supaya test bisa membandingkan urutannya, bukan cuma isinya.
 *
 * Dipanggil saat kartu ada di Finance Validate; fungsi ini sendiri tidak
 * memeriksa stage kartu, karena yang menentukan boleh-tidaknya memanggil
 * adalah routing di `IsiPopup`.
 */
export function temuanKartu(kartu: KartuPdff, opsi: OpsiTemuan): Temuan[] {
  const { sumber, bukti = {}, ditutup = [], terima = [], barisHpp = [] } = opsi;
  const temuan: Temuan[] = [];

  const push = (t: Omit<Temuan, 'status'>) => {
    temuan.push({ ...t, status: ditutup.includes(t.id) ? 'tertutup' : 'terbuka' });
  };

  // 1. HPP Produksi tanpa ongkos jahit.
  //
  // Yang diperiksa `tanpaOngkosJahit` dari `hppProduksi()` — bukan
  // `kartu.detail.ongkosJahit` langsung — supaya temuan ini memakai pemeriksaan
  // yang sama dengan gerbang HPP & Price. Dua pemeriksaan terpisah untuk hal
  // yang sama bisa berbeda pendapat tanpa ada yang gagal.
  if (sumber === 'production') {
    const hasil = hppProduksi(kartu, kartu.detail.ongkosJahit);
    if (hasil.tanpaOngkosJahit) {
      push({
        id: 'hpp-price:ongkos-jahit',
        label: 'Ongkos jahit belum diisi',
        detail:
          'Belum ada baris cmt_cost (ongkos jahit) untuk kartu ini, jadi HPP produksi tidak bisa dihitung.',
        stage: 'hpp-price',
      });
    }
  }

  // 2. HPP White Label di bawah biaya beli — penjaga, lihat catatan di atas.
  if (sumber === 'whitelabel') {
    const { baris } = barisShipmentUntuk(kartu, barisHpp);
    if (baris) {
      const hasil = hppWhiteLabel(baris);
      if (hasil.hpp < hasil.biayaBeli) {
        push({
          id: 'hpp-price:hpp-bawah-beli',
          label: 'HPP di bawah biaya beli',
          detail: `HPP ${rupiah(hasil.hpp)}/pcs lebih rendah dari biaya beli ${rupiah(
            hasil.biayaBeli
          )}/pcs. Angka ini tidak mungkin benar.`,
          stage: 'hpp-price',
        });
      }
    }
  }

  // 3. Receive: Sisa > 0 per varian.
  //
  // Satu temuan per varian, bukan satu temuan gabungan: yang perlu ditindak
  // adalah variannya, dan "berapa" yang diminta pemilik cuma masuk akal
  // per varian — total kekurangan 12 pcs tidak memberi tahu varian mana yang
  // harus dikejar.
  for (const t of terima) {
    const sisa = t.plan - (t.sudahDatang + t.masukStok);
    if (sisa > 0) {
      push({
        id: `receive:${t.varian}`,
        label: 'Barang belum lengkap datang',
        detail: `Varian ${t.varian}: plan ${t.plan} pcs, sudah datang ${t.sudahDatang} + masuk stok ${t.masukStok} = ${
          t.sudahDatang + t.masukStok
        } pcs. Sisa ${sisa} pcs.`,
        stage: 'receive',
      });
    }
  }

  // 4. Upload: jumlahUploadPos = 0.
  //
  // HANYA 0, bukan `undefined`. `undefined` berarti kotaknya belum pernah
  // diisi, dan itu belum tentu salah — sedangkan 0 adalah pernyataan sah yang
  // disengaja ("belum ada yang masuk POS"). Aturan ini ditulis di
  // `DataTahapAkhir.jumlahUploadPos` di `data-kanban.ts`; memeriksa keduanya di
  // sini akan membuat temuan yang tidak bisa dibedakan dari "belum diisi".
  if (kartu.tahapAkhir?.jumlahUploadPos === 0) {
    push({
      id: 'upload:jumlah-pos',
      label: 'Belum ada yang diunggah ke POS',
      detail: `Jumlah Upload POS 0 dari plan ${totalPcs(kartu)} pcs.`,
      stage: 'upload',
    });
  }

  // 5. Bukti wajib yang kosong.
  for (const { stage, jenis } of buktiWajib(sumber, kartu.tahapAkhir?.flowTransaction)) {
    for (const j of jenis) {
      if ((bukti[j.id]?.length ?? 0) === 0) {
        push({
          id: `${stage}:${j.id}`,
          label: 'Bukti belum diunggah',
          detail: `${j.judul} belum diunggah.`,
          stage,
        });
      }
    }
  }

  return temuan;
}

// ===== Label stage asal =====

const LABEL_STAGE: Record<string, string> = Object.fromEntries(
  [...PAPAN_PRODUCTION, ...PAPAN_WHITELABEL].map((s) => [s.id, s.label])
);

/**
 * Nama stage asal temuan untuk ditampilkan.
 *
 * Diambil dari `PAPAN_PRODUCTION`/`PAPAN_WHITELABEL` yang sama dengan yang
 * dipakai papan, bukan dari peta label yang ditulis ulang di sini: label stage
 * yang berubah di papan harus ikut berubah di daftar temuan, dan dua peta
 * terpisah tidak akan saling memberi tahu.
 */
export function labelStageAsal(id: string): string {
  return LABEL_STAGE[id] ?? id;
}
