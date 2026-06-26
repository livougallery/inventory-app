const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','finance')),
    nama_lengkap TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    alamat TEXT DEFAULT '',
    kontak TEXT DEFAULT '',
    tipe TEXT NOT NULL CHECK(tipe IN ('produksi','bahan_baku','import')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_produk TEXT NOT NULL,
    kategori TEXT DEFAULT '',
    tipe_produksi TEXT NOT NULL CHECK(tipe_produksi IN ('sendiri','beli_jadi')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warna TEXT NOT NULL,
    size TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    stok INTEGER NOT NULL DEFAULT 0,
    hpp_saat_ini REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS raw_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    tipe TEXT NOT NULL CHECK(tipe IN ('kain_roll','kain_ecer','aksesoris')),
    satuan TEXT NOT NULL DEFAULT 'pcs',
    stok REAL NOT NULL DEFAULT 0,
    stok_minimum REAL DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    no_po TEXT NOT NULL,
    tgl_beli TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected','received')),
    validated_by INTEGER REFERENCES users(id),
    validated_at DATETIME,
    catatan_reject TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    qty REAL NOT NULL,
    harga_satuan REAL NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS production_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    nama_batch TEXT NOT NULL,
    tgl_mulai TEXT NOT NULL,
    tgl_selesai_est TEXT,
    jenis_produksi TEXT NOT NULL CHECK(jenis_produksi IN ('in_house','konveksi','garment')),
    vendor_id INTEGER REFERENCES vendors(id),
    jumlah_dipesan INTEGER NOT NULL,
    jumlah_selesai INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS production_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id),
    tipe_biaya TEXT NOT NULL CHECK(tipe_biaya IN ('kain','aksesoris','jahit','kirim_aksesoris','others')),
    raw_material_id INTEGER REFERENCES raw_materials(id),
    qty_terpakai REAL,
    biaya REAL NOT NULL,
    keterangan TEXT DEFAULT '',
    status_validasi TEXT NOT NULL DEFAULT 'pending' CHECK(status_validasi IN ('pending','validated','rejected')),
    validated_by INTEGER REFERENCES users(id),
    validated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS production_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    tgl_datang TEXT NOT NULL,
    qty_datang INTEGER NOT NULL,
    keterangan TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    tgl_beli TEXT NOT NULL,
    qty INTEGER NOT NULL,
    harga_produk REAL NOT NULL,
    kurs REAL NOT NULL DEFAULT 1,
    logistik REAL NOT NULL DEFAULT 0,
    hpp_per_item REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected','received')),
    validated_by INTEGER REFERENCES users(id),
    validated_at DATETIME,
    catatan_reject TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hpp_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    sumber TEXT NOT NULL CHECK(sumber IN ('produksi','beli_jadi')),
    sumber_id INTEGER NOT NULL,
    komponen_kain REAL NOT NULL DEFAULT 0,
    komponen_aksesoris REAL NOT NULL DEFAULT 0,
    komponen_jahit REAL NOT NULL DEFAULT 0,
    komponen_lain REAL NOT NULL DEFAULT 0,
    hpp_total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
