# Material Feature

Feature module untuk **Master Data Material** (bahan baku).

## Scope

Fitur ini mencakup master data material — tabel `raw_materials` dan
`raw_material_variants`.

**Pembelian material BUKAN bagian fitur ini.** Ia hidup di
`features/purchase-order/` (PO bahan baku, halaman Pembelian Material).
Dulu README ini mendokumentasikan pembelian material di sini lengkap dengan
skema tabelnya; itu tidak pernah dibangun dan dihapus pada tiket 10.

## Struktur Folder

```
features/material/
├── backend/
│   └── routes.js      # Express route handlers + query
└── README.md          # This file
```

Tidak ada `controllers.js`. Pernah ada satu, tapi ia tidak pernah
di-`require` siapa pun dan menanyai tabel (`material_purchases`,
`material_purchase_items`) serta kolom (`kode_material`, `nama_material`,
`harga_beli_rata_rata`) yang **tidak pernah ada di skema mana pun**.
Dihapus pada tiket 10 karena terbaca seperti business-logic layer yang
nyata, padahal ia jebakan.

Logika stok juga tidak di sini: stok adalah akumulasi `material_batches`
dan dikelola `services/fifoService.js`.

## Routes

Di-mount di `/api/materials` (lihat `index.js`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/materials` | `requireAuth` | Daftar material + varian, harga terakhir, foto |
| POST | `/api/materials` | `requireAuth` + CSRF | Buat material |
| PUT | `/api/materials/:id` | `requireAuth` + CSRF | Ubah field deskriptif |
| DELETE | `/api/materials/:id` | `requireAuth` + CSRF | Hapus material (ditolak bila punya riwayat batch) |
| POST | `/api/materials/:id/foto` | `requireAuth` + CSRF | Unggah/ganti foto material |
| DELETE | `/api/materials/:id/foto` | `requireAuth` + CSRF | Hapus foto material |

**Stok tidak bisa diedit lewat API ini.** `stok` adalah akumulasi batch;
mengubahnya langsung akan membuatnya divergen dari
`material_batches.qty_sisa`.

### Foto material

Satu foto utama per material. Mengunggah yang baru **menggantikan** yang lama,
dan berkas lama ikut dihapus — bukan ditambah sebagai baris kedua.

Aturan upload (tipe berkas, batas ukuran, penamaan) hidup di
`services/photoUpload.js`, **berbagi dengan fitur purchase-order**. Jangan
menulis aturan kedua di sini.

- `GET /api/materials` mengembalikan `foto_path` sebagai **string kosong** bila
  tidak ada foto — bukan `null`. Ini sengaja beda dari foto PO (yang memakai
  `null`), karena endpoint ini sudah menormalkannya demikian sejak sebelum
  tiket 11d. Perbedaan itu ditegaskan di `tests/materialPhoto.test.js`.
- Baris foto diurutkan `is_primary DESC, id DESC`. `is_primary` **wajib**
  dihormati: tanpanya, foto yang ditandai utama bisa kalah dari unggahan lain
  hanya karena id-nya lebih kecil.
- **Menghapus material menghapus berkas fotonya**, bukan cuma barisnya.
  `ON DELETE CASCADE` mengurus barisnya saja; berkas di disk tidak. Jalur
  fotonya dibaca **sebelum** material dihapus, karena setelah cascade berjalan
  baris fotonya ikut lenyap dan nama berkasnya tidak bisa dibaca lagi.

### Berkas yang diunggah harus bisa dijangkau

Foto disajikan di `/uploads/<nama berkas>`, di-mount di `index.js`. Dua hal yang
mudah salah dan sudah pernah terjadi:

1. **Mount tidak dipasang.** Sebelum tiket 11c hanya `/assets` yang di-mount,
   sehingga `product_photos` menyimpan jalur berkas sejak lama sementara
   berkasnya tidak pernah bisa ditampilkan.
2. **Mount dipasang setelah middleware SPA dan catch-all.** Maka ia tidak
   pernah dipanggil: permintaan ke `/uploads/…` dijawab lebih dulu oleh
   catch-all dengan `index.html` milik React. Gejalanya halus — berkas
   tersimpan, baris database ada, kolom terisi, gambar tidak pernah muncul.

## Database Tables

### `raw_materials`

Kolom yang dipakai fitur ini:

```sql
CREATE TABLE raw_materials (
  id SERIAL PRIMARY KEY,
  kode_bahan TEXT DEFAULT '',
  nama TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('kain_roll','kain_ecer','aksesoris','cmt_cost')),
  satuan TEXT NOT NULL DEFAULT 'pcs',
  stok REAL NOT NULL DEFAULT 0,
  stok_minimum REAL DEFAULT NULL,
  stok_minimum_at TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Perhatikan: `kode_bahan` dan `nama` — **bukan** `kode_material` dan
`nama_material`. Dua nama terakhir tidak pernah ada.

### `raw_material_variants`

Varian per material (warna, dll). Dikirim sebagai array terstruktur pada
`GET /api/materials`, bukan sebagai string agregat — lihat catatan di
`backend/routes.js` tentang `varian_list`.

## Tipe material

Empat nilai, dipetakan ke label tampilan oleh `TIPE_LABEL` di
`backend/routes.js`:

| Nilai | Label |
|-------|-------|
| `kain_roll` | Fabric Roll |
| `kain_ecer` | Kain (Ecer) |
| `aksesoris` | Aksesoris |
| `cmt_cost` | Product Fulfillment |

Dua hal yang sengaja TIDAK ada, sesuai keputusan spesifikasi:

- **Delivery bukan tipe material.** Ia tipe biaya — `kirim_aksesoris` pada
  `production_costs.tipe_biaya`. Menjadikannya tipe material akan membuatnya
  bisa dipilih sebagai barang.
- **Sample Design belum ada.** Spesifikasi menangguhkannya.

`TIPE_LABEL` diekspor dari `backend/routes.js` dan merupakan SATU-SATUNYA
peta label yang boleh dipakai. Jangan membuat peta kedua — dua peta pasti
drift. Kalau butuh label di tempat lain, impor peta ini atau ambil dari
`tipe_label` yang dikirim API.

**Inkonsistensi lama, sudah dibereskan pada view yang hidup.** Dulu
`views/reports/stock-card.ejs` melabeli `kain_ecer` sebagai "Ecer",
sementara API mengirim "Kain (Ecer)". Sekarang `routes/reports.js`
mengimpor `TIPE_LABEL` dan mengirim `tipe_label` ke view — view tidak
lagi merangkai labelnya sendiri.

**Yang tersisa adalah kode mati.** `views/raw-materials/*` masih menuliskan
tiga ejaan lain ("Kain Ecer", "Kain Ecer (Meteran)"), tapi
`routes/raw-materials.js` **tidak ter-mount** — keempat view itu tidak bisa
dijangkau sama sekali, jadi mereka tidak bisa drift. Dibiarkan karena
menghapusnya di luar ruang lingkup tiket 10; calon tiket tersendiri,
bersama lima rute EJS lain yang bernasib sama.

## Development Notes

- Semua endpoint memakai `requireAuth` (401 JSON, bukan redirect).
- Mutasi dilindungi CSRF lewat `validateToken`.
- `id` divalidasi dengan `parseId` sebelum dipakai — tanpa itu, `/abc`
  diteruskan ke Postgres dan menjawab 500 alih-alih 404.
- Hapus ditolak (409) bila material punya riwayat batch pembelian.

## Testing

`tests/materialsApi.test.js` — seam HTTP JSON, skema `test` terisolasi.

Tambahan `tests/tidakAdaKodeMati.test.js` menjaga agar kode mati yang
dihapus pada tiket 10 tidak muncul kembali.

## Integration

Fitur ini dipakai oleh:

- **Halaman Stok Material** (React, `/stok-material`) — daftar + stok.
- **Form PO bahan baku** (`features/purchase-order/`) — dropdown material
  dan varian per baris item.
- **Produksi** — material dipakai batch produksi lewat `product_bom`.
