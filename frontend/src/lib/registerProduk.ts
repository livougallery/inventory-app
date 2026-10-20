// ===== Jembatan antara JSON /api/register-produk dan bentuk halaman =====
//
// Halaman Register membaca `ProdukRegister` (bentuk yang dipakai bersama form
// Tambah Produksi), sedangkan API mengirim baris tabel apa adanya: `nama_produk`,
// `design_code`, `varian[]`, `marketplaces[]`. Pemetaan dikumpulkan di sini agar
// respons API tetap jelas dan pengelompokan mudah diuji secara deterministik.

import type { ProdukRegister, StatusPasar, Platform } from './produk';
import { PLATFORM } from './produk';
import { TANPA_AKSESORI } from './opsi';
import { urlUnggahan } from './api';
import type { BarisWarna, SpesifikasiAksesori, SpesifikasiKain } from '@/pages/production-fulfillment/data-kanban';

/** Satu varian dari GET /api/register-produk/products/register. */
export interface VarianApi {
  id: number;
  warna: string;
  warna_kode: string | null;
  size: string;
  sku: string;
  stok: number;
  hpp_saat_ini: number;
}

/** Satu produk dari GET /api/register-produk/products/register. */
export interface ProdukApi {
  id: number;
  nama: string;
  kategori: string | null;
  tipe_produksi: string;
  design_code: string | null;
  brand: string | null;
  harga: number;
  created_at: string;
  /**
   * Nama berkas foto utama, relatif ke `/uploads/`.
   *
   * `null` = produknya memang belum punya foto. Itu berbeda dari berkas yang
   * hilang di disk — perbedaan itu tidak bisa dibaca dari sini, dan halaman
   * yang menampilkannya sudah punya penanda sendiri untuk gambar yang gagal
   * dimuat.
   */
  foto_path: string | null;
  varian: VarianApi[];
  marketplaces: { platform: string; terdaftar: boolean; foto_bukti: string | null }[];
  bom: BomApi[];
}

export interface MaterialApi {
  id: number;
  kode_bahan: string | null;
  nama: string;
  tipe: string;
  jenis: string | null;
  satuan: string;
  variants: { id: number; nama_varian: string; stok: number | string; satuan: string }[];
}

export interface BomApi {
  id: number;
  variant_id: number;
  raw_material_id: number | null;
  qty_per_pcs: number;
  no_need: boolean;
  nama: string | null;
  tipe: string | null;
  jenis: string | null;
  satuan: string | null;
  warna: string;
  warna_kode: string | null;
  size: string;
}

/**
 * Map one API product to the production-oriented page shape.
 *
 * BOM decisions belong to a variant (colour + size), not just the product.
 * Keep each material/type/colour combination separate so that a product with
 * two fabrics or a no-need decision on one colour cannot leak into another.
 */
export function produkDariApi(p: ProdukApi): ProdukRegister {
  const perWarna = new Map<string, BarisWarna>();
  const stok: Record<string, number> = {};
  const variantIds: Record<string, number> = {};
  const bomGroups = new Map<string, { id: number; jenis: string; warnaKode: string; warna: string; nama: string; satuan: string; qty: number; noNeed: boolean }>();

  for (const v of p.varian) {
    const kode = v.warna_kode ?? '';
    const key = kode || v.warna;
    const existing = perWarna.get(key);
    const ukuran = { ukuran: v.size, qty: 0, kode: v.sku, variantId: v.id };
    if (existing) existing.pcs.push(ukuran);
    else perWarna.set(key, { nama: v.warna, kode, pcs: [ukuran] });
    if (kode) {
      stok[`${kode}|${v.size}`] = Number(v.stok || 0);
      variantIds[`${kode}|${v.size}`] = v.id;
    }
  }

  // One display row represents one material choice per colour. The server
  // repeats that choice for every size; collapsing exact repeats is safe only
  // after checking the choice is identical across all the sizes.
  //
  // Rows without `jenis` are NOT dropped any more.
  //
  // Two kinds of row arrive without it, and both must survive this loop:
  // no-need rows written before `product_bom` stored `jenis` on the row itself
  // (the API joins `raw_materials` for it, and a no-need row points at no
  // material, so the join comes back empty — dropping them here is exactly what
  // made a saved no-need decision read as never saved), and rows whose material
  // has no `jenis` in the master.
  //
  // The old rows cannot be recovered — the category was never written down, and
  // guessing it from an id or a row order would be inventing data. They keep an
  // empty `jenis` and so match no card: the card reads "Pilih bahan" again, the
  // owner decides once more, and that save stores the category properly.
  for (const row of p.bom ?? []) {
    const kode = row.warna_kode ?? '';
    const materialKey = row.no_need ? 'no-need' : String(row.raw_material_id ?? `missing-${row.id}`);
    const key = `${kode}\u0000${row.jenis ?? ''}`;
    const signature = `${materialKey}\u0000${Number(row.qty_per_pcs || 0)}\u0000${row.no_need}`;
    const groupKey = `${key}\u0000${signature}`;
    const group = bomGroups.get(groupKey);
    if (group) {
      continue;
    }
    bomGroups.set(groupKey, {
      id: row.id, jenis: row.jenis ?? '', warnaKode: kode, warna: row.warna,
      nama: row.no_need ? TANPA_AKSESORI : (row.nama ?? ''), satuan: row.satuan ?? '',
      qty: Number(row.qty_per_pcs || 0), noNeed: row.no_need,
    });
  }

  const kainPerPilihan = new Map<string, SpesifikasiKain>();
  const aksesoriPerPilihan = new Map<string, SpesifikasiAksesori>();
  for (const row of bomGroups.values()) {
    if (row.jenis === 'roll' || row.jenis === 'ecer') {
      // Existing production interfaces have no `jenis` field on fabric; keep
      // each material choice separate and only expose its own colour quantity.
      kainPerPilihan.set(`${row.warnaKode}:${row.jenis}:${row.id}`, {
        nama: row.nama,
        satuan: row.satuan,
        perWarna: row.noNeed || !row.warnaKode ? {} : { [row.warnaKode]: { perPcs: row.qty } },
      });
      continue;
    }
    const key = `${row.warnaKode}:${row.jenis}:${row.id}`;
    aksesoriPerPilihan.set(key, {
      nama: row.nama,
      varian: '',
      berlaku: row.warna || row.warnaKode,
      perPcs: row.qty,
      satuan: row.satuan,
      jenis: row.jenis,
    });
  }

  const pasar: StatusPasar[] = PLATFORM.map((platform) => {
    const baris = p.marketplaces.find((m) => m.platform === platform);
    return {
      platform: platform as Platform,
      terdaftar: baris?.terdaftar ?? false,
      fotoBukti: baris?.foto_bukti ?? null,
    };
  });

  return {
    id: String(p.id),
    nama: p.nama,
    brand: p.brand ?? '',
    registerDate: String(p.created_at ?? '').slice(0, 10),
    kategori: p.kategori ?? '',
    // URL berkasnya, bukan nama berkasnya. Bentuk `ProdukRegister.foto` sudah
    // dipakai sebagai `src` gambar di kartu maupun di dialog detail, jadi
    // menerjemahkan nama → URL adalah tugas perbatasan ini — kalau namanya
    // yang dikirim, tiap tempat yang menampilkannya harus tahu sendiri soal
    // `/uploads/`, dan satu yang lupa akan menampilkan gambar rusak.
    //
    // Digabung LEWAT `urlUnggahan()`, bukan disusun di sini, supaya prefixnya
    // cuma ditulis di satu tempat (lihat catatan di lib/api.ts).
    foto: urlUnggahan(p.foto_path) || null,
    harga: Number(p.harga || 0),
    stok,
    pasar,
    bom: p.bom ?? [],
    variantIds,
    spesifikasi: {
      designCode: p.design_code ?? '',
      kategori: p.kategori ?? '',
      batch: '',
      kategoriVendor: '',
      namaVendor: '',
      warna: [...perWarna.values()],
      kain: [...kainPerPilihan.values()],
      aksesori: [...aksesoriPerPilihan.values()],
    },
  };
}

/** Seluruh daftar sekaligus. */
export function daftarProdukDariApi(rows: ProdukApi[]): ProdukRegister[] {
  return rows.map(produkDariApi);
}

/** Body POST /products/register dari data form "Tambah Produk". */
export function bodyDariProdukBaru(data: {
  nama: string;
  kategori: string;
  designCode: string;
  brand: string;
  harga: number;
  /**
   * Warna beserta ukurannya.
   *
   * BOLEH KOSONG, dan sejak 19 Oktober 2026 itu memang keadaan normalnya:
   * form "Tambah Produk" cuma mengisi identitas produknya, dan variannya
   * ditambahkan setelahnya di halaman detail. Produk tanpa satu pun varian
   * adalah produk yang sah — server melewati blok variannya dan tetap
   * membuat produknya.
   */
  warna: { nama: string; kode: string; pcs: { ukuran: string; kode?: string }[] }[];
}): Record<string, unknown> {
  const warnaKode: Record<string, string> = {};
  const varian: { warna: string; size: string; sku: string; stok: number }[] = [];
  for (const w of data.warna) {
    if (w.kode) warnaKode[w.nama] = w.kode;
    for (const p of w.pcs) {
      varian.push({
        warna: w.nama,
        size: p.ukuran,
        sku: p.kode || `${data.designCode}-${w.kode}-${p.ukuran}`,
        stok: 0,
      });
    }
  }
  return {
    nama_produk: data.nama,
    kategori: data.kategori,
    design_code: data.designCode,
    brand: data.brand,
    tipe_produksi: 'sendiri',
    harga: data.harga,
    varian,
    warna_kode: warnaKode,
  };
}
