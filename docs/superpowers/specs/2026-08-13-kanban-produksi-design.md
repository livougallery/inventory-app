# Kanban View — Batch Produksi (Workcode PDFF)

**Tanggal:** 2026-08-13
**Status:** Approved (brainstorming dengan user)
**Prinsip:** Progress pelan-pelan — tahap ini HANYA kanban untuk batch produksi PDFF. Halaman lain tidak disentuh.

## 1. Latar Belakang & Tujuan

Halaman `/production-batches` saat ini menampilkan batch produksi dalam tabel. User ingin menggantinya dengan **tampilan kanban** agar status tiap workcode produksi (PDFF) terlihat sekilas.

**Yang disepakati lewat brainstorming:**

- 1 kartu kanban = 1 baris `production_batches` yang sudah ada (tidak ada entitas baru).
- Isi kartu: Foto produk, Nama produk, SKU dasar, Jumlah variasi.
- Kolom kanban = status batch yang sudah ada di database: `planned` / `in_progress` / `completed` → label **Rencana / Berjalan / Selesai**.
- Klik kartu → **modal popup** berisi daftar variasi + stok (bukan pindah halaman).
- Kanban **mengganti penuh** tampilan tabel (tanpa toggle).
- Data di-preload dari Supabase dalam satu query gabungan saat halaman dibuka (bukan fetch client-side — skala produksi ~2–3 batch baru/minggu tidak butuh itu; lebih sedikit JavaScript = lebih sedikit titik rusak).
- **Zero schema change** — tidak ada migrasi database.
- Tema: **light** (latar abu terang, kartu putih) — kontras tinggi, mudah dibaca ("bahkan anak SD bisa baca"). Tampilan halaman lain belum final dan akan ditata ulang belakangan; kanban tidak perlu menyesuaikan halaman lama.

**Yang TIDAK termasuk tahap ini (eksplisit):**

- Tidak ada drag & drop antar kolom. Perubahan status tetap lewat alur yang sudah ada.
- Tidak ada filter/pencarian di kanban.
- Tidak ada tombol edit/hapus di kartu maupun modal (modal read-only).
- Tidak ada perubahan form buat batch, halaman detail batch, biaya, pengiriman.
- Halaman/menu lain di aplikasi tidak diubah.

## 2. Arsitektur Data

### 2.1 Query index (preload)

`GET /production-batches` menjalankan **satu query gabungan** ke Supabase:

- `production_batches` ⨝ `products` (nama_produk)
- Foto utama per produk: dari `product_photos`, pilih `is_primary DESC, id ASC` (baris pertama per produk).
- SKU dasar per produk: dari `product_variants`, varian pertama urut `id ASC`.
- Jumlah variasi per produk: `COUNT` atas `product_variants`.

Implementasi: query utama batch + produk seperti sekarang, plus subquery/CTE untuk foto utama, SKU dasar, dan jumlah variasi — hasil tetap satu result set per batch. Urut kartu di dalam kolom: `created_at DESC` (sama seperti tabel sekarang).

**Definisi formal:**

- *SKU dasar* = SKU dari variasi dengan `id` terkecil untuk produk tersebut. Ditampilkan di kartu sebagai perwakilan.
- *Foto utama* = foto produk dengan `is_primary=1`; jika tidak ada, foto pertama (`id` terkecil). URL gambar: `/uploads/<file_path>` (pola yang sudah dipakai di `views/products/show.ejs`).

### 2.2 Endpoint modal

`GET /production-batches/:id/variants` — JSON kecil, dipanggil JavaScript hanya saat modal dibuka.

- Response: `{ batch: { id, nama_batch, nama_produk }, variants: [{ sku, warna, size, stok }] }`, variasi urut `warna, size`.
- Batch tidak ditemukan → HTTP 404 JSON.
- Auth: `isAuthenticated` (sama seperti route batch lain).

## 3. Tampilan Kanban

### 3.1 Kolom

Tiga kolom sejajar (desktop), masing-masing dengan header:

| Kolom | Status DB | Aksen warna header |
|---|---|---|
| 🗓 Rencana | `planned` | Abu |
| 🔨 Berjalan | `in_progress` | Amber/kuning |
| ✅ Selesai | `completed` | Hijau |

Header menampilkan nama kolom + emoji + jumlah kartu dalam kolom. Kolom kosong menampilkan teks "Belum ada batch" (bukan tampilan error).

Di layar kecil (mobile), kolom ditumpuk vertikal: Rencana di atas, lalu Berjalan, lalu Selesai.

### 3.2 Kartu

Urutan baca atas-ke-bawah, foto sebagai pusat perhatian:

1. **Foto produk** — memenuhi lebar kartu, rasio kotak, `object-fit: cover`. Produk tanpa foto → placeholder 👕 di area foto (kartu tidak rusak).
2. **Nama produk** — tebal, ukuran paling besar di bagian teks.
3. **SKU dasar** — kecil, abu-abu, font monospace.
4. **Badge variasi** — di paling bawah, contoh: `👕 3 variasi`. Produk tanpa variasi → `👕 0 variasi`.

Kartu putih di atas latar abu terang kolom, sudut membulat, bayangan halus; hover memberi feedback ringan (bayangan/naik sedikit) sebagai isyarat kartu bisa diklik. Tombol "+ Buat Batch" yang sudah ada tetap tampil di header halaman (hanya untuk role admin, seperti sekarang).

### 3.3 Modal detail

Klik kartu mana pun membuka modal:

- Judul: nama produk; sub-judul: SKU dasar + jumlah variasi; tombol tutup ✕.
- Tabel variasi: kolom **SKU · Warna · Size · Stok** (data dari endpoint §2.2).
- State modal: loading singkat saat fetch, pesan error + tombol coba lagi jika fetch gagal, pesan "Belum ada variasi" jika kosong.
- Tombol **"Buka Detail Batch →"** di bawah tabel → link ke halaman detail yang sudah ada (`/production-batches/:id`).
- Tutup modal: klik ✕, klik area backdrop, atau tekan Esc.
- Modal murni read-only.

Modal dibangun dengan markup EJS di halaman yang sama + sedikit JavaScript vanilla untuk fetch & isi tabel (pola app ini: server-rendered, tanpa framework frontend).

## 4. Error Handling

| Kondisi | Perilaku |
|---|---|
| Produk tanpa foto | Placeholder 👕 di area foto kartu |
| Produk tanpa variasi | Badge `👕 0 variasi`; modal menampilkan pesan "Belum ada variasi" |
| Endpoint `/variants` gagal / jaringan error | Pesan error di dalam modal + tombol coba lagi |
| Batch tidak ditemukan (endpoint) | HTTP 404 JSON |

## 5. Testing

Jest sudah tersedia (konfigurasi `jest.config.js` + `tests/setup.js`, schema `test` terisolasi). Test baru:

1. **Query index** — mengembalikan batch lengkap dengan foto utama, SKU dasar, dan jumlah variasi yang benar (termasuk kasus: produk tanpa foto, produk tanpa variasi, beberapa produk dengan beberapa foto/variasi).
2. **Endpoint `/variants`** — mengembalikan JSON sesuai kontrak; variasi terurut; batch tidak dikenal → 404.

## 6. File yang Berubah

| File | Perubahan |
|---|---|
| `routes/production-batches.js` | Query index diperluas (foto/SKU dasar/jumlah variasi); tambah endpoint `GET /:id/variants` |
| `views/production-batches/index.ejs` | Ditulis ulang menjadi kanban (kolom + kartu + modal) |
| `tests/` | Test baru untuk query index & endpoint variants |

Tidak ada file baru di luar itu; tidak ada migrasi database; tidak ada dependency baru.

## 7. Maintainability (permintaan user)

Atasan mungkin minta ubah tampilan nanti — dirancang supaya murah diubah:

- Semua tampilan kartu/kolom ada di satu file template (`index.ejs`) + CSS inline di layout; geser/ganti ukuran/warna = edit satu file.
- Menambah info baru di kartu = tambah kolom di query gabungan, tanpa migrasi (skema tidak berubah).
- Tanpa framework frontend — HTML/CSS murni, mudah dibongkar siapa pun.
- Satu-satunya permintaan yang sedikit lebih besar: menambah kolom kanban baru di luar status (mis. per vendor) — tetap hanya perubahan pengelompokan, bukan rombakan.
