require('dotenv').config();
const { Pool } = require('pg');

class Db {
  constructor() {
    if (!process.env.DATABASE_URL) {
      console.error('[FATAL] DATABASE_URL wajib di-set. Copy .env.example ke .env.');
      process.exit(1);
    }
    // Validate no raw @ in password segment (URL encoding issue)
    const match = process.env.DATABASE_URL.match(/\/\/([^:]+):([^@]+)@/);
    if (match && match[2].includes('@')) {
      console.error('[FATAL] Password di DATABASE_URL mengandung @ — harus URL-encoded (%40).');
      process.exit(1);
    }
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', (err) => {
      console.error('[pg] Unexpected pool error:', err.message);
    });
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async one(text, params) {
    const r = await this.pool.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }

  async run(text, params) {
    const r = await this.pool.query(text, params);
    return {
      rowCount: r.rowCount,
      returningId: r.rows.length ? r.rows[0].id : null,
    };
  }

  // Run multiple statements separated by ; — only for bootstrap/migrations
  async exec(statements) {
    const lines = statements
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const sql of lines) {
      await this.pool.query(sql);
    }
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new Tx(client);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  now() {
    return 'CURRENT_DATE';
  }

  async close() {
    await this.pool.end();
  }
}

class Tx {
  constructor(client) {
    this.client = client;
  }
  async query(text, params) {
    return this.client.query(text, params);
  }
  async one(text, params) {
    const r = await this.client.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }
  async run(text, params) {
    const r = await this.client.query(text, params);
    return {
      rowCount: r.rowCount,
      returningId: r.rows.length ? r.rows[0].id : null,
    };
  }
}

async function bootstrapSchema(schemaName) {
  // When schemaName is provided (e.g. 'test'), prefix all CREATE TABLE/INDEX
  // with that schema. When undefined or 'public', no prefix (use search_path).
  const pfx = schemaName && schemaName !== 'public' ? `"${schemaName}".` : '';
  const t = (name) => `${pfx}${name}`;

  if (pfx) {
    await db.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  }

  await db.exec(`
    -- Session store for connect-pg-simple. That store does not create its own
    -- table unless createTableIfMissing is set, so it is provisioned here with
    -- the rest of the schema (shape must match connect-pg-simple/table.sql).
    CREATE TABLE IF NOT EXISTS ${t('session')} (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${t('users')} (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','finance')),
      nama_lengkap TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('vendors')} (
      id SERIAL PRIMARY KEY,
      nama TEXT NOT NULL,
      alamat TEXT DEFAULT '',
      kontak TEXT DEFAULT '',
      tipe TEXT NOT NULL CHECK(tipe IN ('produksi','bahan_baku','import')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('products')} (
      id SERIAL PRIMARY KEY,
      nama_produk TEXT NOT NULL,
      kategori TEXT DEFAULT '',
      tipe_produksi TEXT NOT NULL CHECK(tipe_produksi IN ('sendiri','beli_jadi')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      harga_jual_default REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ${t('product_variants')} (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES ${t('products')}(id) ON DELETE CASCADE,
      warna TEXT NOT NULL,
      size TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      stok INTEGER NOT NULL DEFAULT 0,
      hpp_saat_ini REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      gram_per_pcs REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ${t('categories')} (
      id SERIAL PRIMARY KEY,
      nama TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('raw_materials')} (
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

    CREATE TABLE IF NOT EXISTS ${t('raw_material_variants')} (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES ${t('raw_materials')}(id) ON DELETE CASCADE,
      nama_varian TEXT NOT NULL,
      stok REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      satuan TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ${t('currencies')} (
      id SERIAL PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      simbol TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Lookup negara asal pembelian (white label). Mengikuti bentuk currencies:
    -- id SERIAL, nama unik, flag aktif, timestamp. Nama unik supaya tidak ada
    -- "China" / "CHINA" — keunikan itu ditegakkan case-insensitive lewat index
    -- di bawah, bukan lewat UNIQUE biasa yang hanya membandingkan persis.
    CREATE TABLE IF NOT EXISTS ${t('negara')} (
      id SERIAL PRIMARY KEY,
      nama TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Lookup lokasi barang (tiket 11f). Mengikuti bentuk currencies/negara:
    -- id SERIAL, nama unik case-insensitive lewat index di bawah, flag aktif,
    -- timestamp. Dua nilai saja: Gudang (Livou HQ Office) dan Konveksi.
    CREATE TABLE IF NOT EXISTS ${t('locations')} (
      id SERIAL PRIMARY KEY,
      nama TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('purchase_orders')} (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL REFERENCES ${t('vendors')}(id),
      no_po TEXT NOT NULL,
      tgl_beli TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected','received')),
      validated_by INTEGER REFERENCES ${t('users')}(id),
      validated_at TIMESTAMP,
      catatan_reject TEXT,
      created_by INTEGER NOT NULL REFERENCES ${t('users')}(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      currency_id INTEGER REFERENCES ${t('currencies')}(id),
      kurs_amount REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ${t('purchase_order_items')} (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES ${t('purchase_orders')}(id) ON DELETE CASCADE,
      raw_material_id INTEGER NOT NULL REFERENCES ${t('raw_materials')}(id),
      qty REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      variant_id INTEGER REFERENCES ${t('raw_material_variants')}(id)
    );

    CREATE TABLE IF NOT EXISTS ${t('purchase_order_photos')} (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES ${t('purchase_orders')}(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('production_batches')} (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES ${t('products')}(id),
      nama_batch TEXT NOT NULL,
      tgl_mulai TEXT NOT NULL,
      tgl_selesai_est TEXT,
      jenis_produksi TEXT NOT NULL CHECK(jenis_produksi IN ('in_house','konveksi','garment')),
      vendor_id INTEGER REFERENCES ${t('vendors')}(id),
      jumlah_dipesan INTEGER NOT NULL,
      jumlah_selesai INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('production_costs')} (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES ${t('production_batches')}(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES ${t('product_variants')}(id),
      tipe_biaya TEXT NOT NULL CHECK(tipe_biaya IN ('kain','aksesoris','jahit','kirim_aksesoris','others')),
      raw_material_id INTEGER REFERENCES ${t('raw_materials')}(id),
      qty_terpakai REAL,
      biaya REAL NOT NULL,
      keterangan TEXT DEFAULT '',
      status_validasi TEXT NOT NULL DEFAULT 'pending' CHECK(status_validasi IN ('pending','validated','rejected')),
      validated_by INTEGER REFERENCES ${t('users')}(id),
      validated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      batch_source TEXT NOT NULL DEFAULT 'inventory'
    );

    CREATE TABLE IF NOT EXISTS ${t('production_deliveries')} (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES ${t('production_batches')}(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES ${t('product_variants')}(id),
      tgl_datang TEXT NOT NULL,
      qty_datang INTEGER NOT NULL,
      keterangan TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('hpp_history')} (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES ${t('product_variants')}(id),
      sumber TEXT NOT NULL CHECK(sumber IN ('produksi','beli_jadi')),
      sumber_id INTEGER NOT NULL,
      komponen_kain REAL NOT NULL DEFAULT 0,
      komponen_aksesoris REAL NOT NULL DEFAULT 0,
      komponen_jahit REAL NOT NULL DEFAULT 0,
      komponen_lain REAL NOT NULL DEFAULT 0,
      hpp_total REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('purchase_imports')} (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES ${t('product_variants')}(id),
      vendor_id INTEGER NOT NULL REFERENCES ${t('vendors')}(id),
      tgl_beli TEXT NOT NULL,
      qty INTEGER NOT NULL,
      harga_produk REAL NOT NULL,
      kurs REAL NOT NULL DEFAULT 1,
      logistik REAL NOT NULL DEFAULT 0,
      hpp_per_item REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected','received')),
      validated_by INTEGER REFERENCES ${t('users')}(id),
      validated_at TIMESTAMP,
      catatan_reject TEXT,
      created_by INTEGER NOT NULL REFERENCES ${t('users')}(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('shipments')} (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      tgl_kirim TEXT NOT NULL,
      freight_forwarder TEXT DEFAULT '',
      logistic_invoice_no TEXT DEFAULT '',
      price_per_kg REAL NOT NULL DEFAULT 0,
      total_kg REAL NOT NULL DEFAULT 0,
      total_pcs INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','validated','rejected')),
      validated_by INTEGER REFERENCES ${t('users')}(id),
      validated_at TIMESTAMP,
      catatan_reject TEXT,
      created_by INTEGER NOT NULL REFERENCES ${t('users')}(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('shipment_invoices')} (
      id SERIAL PRIMARY KEY,
      shipment_id INTEGER NOT NULL REFERENCES ${t('shipments')}(id) ON DELETE CASCADE,
      variant_id INTEGER NOT NULL REFERENCES ${t('product_variants')}(id),
      supplier_name TEXT NOT NULL,
      supplier_invoice_no TEXT DEFAULT '',
      sku_supplier TEXT DEFAULT '',
      qty INTEGER NOT NULL,
      harga_per_pcs REAL NOT NULL,
      currency_id INTEGER NOT NULL REFERENCES ${t('currencies')}(id),
      kurs REAL NOT NULL DEFAULT 1,
      subtotal_idr REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      berat_aktual REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ${t('material_batches')} (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES ${t('raw_materials')}(id),
      source_type TEXT NOT NULL,
      source_id INTEGER,
      qty_awal REAL NOT NULL,
      qty_sisa REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      tgl_masuk TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('stock_movements')} (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES ${t('raw_materials')}(id),
      movement_type TEXT NOT NULL CHECK(movement_type IN ('masuk','keluar','adjustment')),
      qty REAL NOT NULL,
      batch_id INTEGER REFERENCES ${t('material_batches')}(id),
      ref_type TEXT,
      ref_id INTEGER,
      tgl TEXT NOT NULL,
      keterangan TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES ${t('users')}(id)
    );

    CREATE TABLE IF NOT EXISTS ${t('hpp_formula_templates')} (
      id SERIAL PRIMARY KEY,
      tipe_biaya TEXT NOT NULL,
      nama_template TEXT NOT NULL,
      formula_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('hpp_batch_config')} (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER UNIQUE NOT NULL REFERENCES ${t('production_batches')}(id) ON DELETE CASCADE,
      formula_json TEXT NOT NULL,
      updated_by INTEGER REFERENCES ${t('users')}(id),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('product_photos')} (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES ${t('products')}(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES ${t('product_variants')}(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('variant_prices')} (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER UNIQUE NOT NULL REFERENCES ${t('product_variants')}(id) ON DELETE CASCADE,
      harga_jual REAL NOT NULL,
      berlaku_at TEXT NOT NULL,
      updated_by INTEGER REFERENCES ${t('users')}(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Foto bahan baku (untuk kolom Foto di tabel view Material).
    CREATE TABLE IF NOT EXISTS ${t('raw_material_photos')} (
      id SERIAL PRIMARY KEY,
      raw_material_id INTEGER NOT NULL REFERENCES ${t('raw_materials')}(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${t('delivery_expenses')} (
      id SERIAL PRIMARY KEY,
      tgl TEXT NOT NULL,
      kategori TEXT NOT NULL CHECK(kategori IN ('kain','aksesoris','sample','lainnya')),
      keterangan TEXT DEFAULT '',
      nominal REAL NOT NULL,
      ref_type TEXT,
      ref_id INTEGER,
      created_by INTEGER REFERENCES ${t('users')}(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Resep bahan (BOM) per varian produk: berapa bahan dibutuhkan untuk 1 pcs jadi.
    -- Dibuat untuk tabel view "Material" di menu Cek Data.
    CREATE TABLE IF NOT EXISTS ${t('product_bom')} (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES ${t('product_variants')}(id) ON DELETE CASCADE,
      raw_material_id INTEGER NOT NULL REFERENCES ${t('raw_materials')}(id),
      qty_per_pcs REAL NOT NULL DEFAULT 0,
      catatan TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_photos_product ON ${t('product_photos')}(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_photos_variant ON ${t('product_photos')}(variant_id);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON ${t('session')}(expire);

    -- Keunikan nama negara tanpa mempermasalahkan huruf besar-kecil. Nama index
    -- tidak boleh diawali skema: Postgres menolak nama index yang dikualifikasi,
    -- dan letaknya sudah ditentukan oleh skema tabelnya.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_negara_nama ON ${t('negara')}(LOWER(nama));

    -- Sama dengan negara: nama index TIDAK boleh diawali skema, dan keunikan
    -- case-insensitive ini yang membuat "Gudang" dan "GUDANG" tidak bisa hidup
    -- berdampingan. Itu alasan utama lokasi berupa lookup, bukan teks bebas.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_nama ON ${t('locations')}(LOWER(nama));
  `);

  // Migrasi kolom tambahan (idempotent) — untuk tabel yang sudah terlanjur dibuat
  // sebelum kolomnya ada. Nilai: Livou Transfer, Saldo Shopee, Reimbursement,
  // Deposit Cash, Saldo Lalamove.
  //
  // `ADD COLUMN IF NOT EXISTS`, bukan CREATE TABLE: tabel `purchase_imports`
  // sudah ada di database produksi berisi 2 baris, dan CREATE TABLE IF NOT
  // EXISTS tidak menambah kolom ke tabel yang sudah ada.
  //
  // `negara_id` sengaja NULLABLE dan tanpa backfill: dua baris historis tidak
  // punya negara, dan keduanya cukup menyimpan NULL (lihat spesifikasi
  // keputusan 7 — baris id 1 berstatus rejected dan dibiarkan apa adanya).
  await db.exec(`
    ALTER TABLE ${t('purchase_orders')} ADD COLUMN IF NOT EXISTS flow_transaksi TEXT DEFAULT '';
    ALTER TABLE ${t('purchase_imports')}
      ADD COLUMN IF NOT EXISTS negara_id INTEGER REFERENCES ${t('negara')}(id);

    -- ===== Tiket 11f: lokasi barang =====
    -- Nullable dan TANPA backfill: semua 7 material hari ini tidak punya
    -- lokasi, dan menebaknya lebih buruk daripada mengosongkannya.
    ALTER TABLE ${t('raw_materials')}
      ADD COLUMN IF NOT EXISTS lokasi_id INTEGER REFERENCES ${t('locations')}(id);

    -- ===== Tiket 11e: kategori + jenis =====
    -- CATATAN: jangan pakai backtick di komentar SQL ini — komentar ini hidup
    -- di dalam template literal JS, dan satu backtick mengakhiri stringnya
    -- lebih awal. Baris inilah yang pernah membuat db.js gagal di-parse.
    --
    -- jenis murni aditif dan nullable — aman.
    ALTER TABLE ${t('raw_materials')} ADD COLUMN IF NOT EXISTS jenis TEXT;

    -- tipe TETAP jadi kolom Kategori (tiga nilai baru), bukan diganti kolom
    -- lain. Menambah kolom kategori terpisah akan membuat dua sumber
    -- kebenaran untuk satu hal — drift yang justru dihapus tiket 10 — karena
    -- TIPE_LABEL dan EDITABLE_FIELDS (dan view EJS yang masih hidup) semua
    -- membaca kolom tipe.
    --
    -- Nilai lama diselamatkan dulu ke tipe_asli SEBELUM ditulis ulang, supaya
    -- jalan pulangnya ada: tanpa ini, migrasi yang meleset tidak bisa
    -- dikembalikan kecuali dari backup.
    ALTER TABLE ${t('raw_materials')} ADD COLUMN IF NOT EXISTS tipe_asli TEXT;
    UPDATE ${t('raw_materials')} SET tipe_asli = tipe WHERE tipe_asli IS NULL;
  `);

  // Ganti CHECK `tipe` dari empat nilai lama ke tiga nilai baru.
  //
  // DROP dan ADD harus satu transaksi: kalau dipisah, baris yang sudah ada
  // sempat melanggar constraint baru dan Postgres menolak.
  //
  // Nama constraint dicari, bukan ditebak. CREATE TABLE menuliskannya inline
  // sehingga Postgres menamainya sendiri, dan nama itu berubah bila tabelnya
  // berada di skema berbeda (skema `test` vs produksi) — menebak
  // 'raw_materials_tipe_check' akan gagal di salah satunya.
  // Isi dua lokasi. Idempoten berkat ON CONFLICT — seeding ini tidak boleh
  // menggandakan baris pada boot kedua.
  await db.exec(`
    INSERT INTO ${t('locations')} (nama) VALUES
      ('Gudang (Livou HQ Office)'), ('Konveksi')
    ON CONFLICT DO NOTHING;
  `);

  // Pindahkan `tipe` ke tiga nilai baru.
  //
  // Urutannya TIDAK bisa dibalik dan harus SATU transaksi:
  //   - UPDATE dulu → melanggar CHECK lama (kain_roll ditolak untuk 'kain').
  //   - DROP+ADD CHECK dulu → melanggar CHECK baru (baris masih 'kain_roll').
  // Keduanya gagal sendiri-sendiri; bersama-sama berhasil.
  //
  // Nama constraint dicari, bukan ditebak: CREATE TABLE menuliskannya inline
  // sehingga Postgres yang menamai, dan namanya beda antara skema `test` dan
  // produksi. Nama constraint juga TIDAK boleh diawali skema — jebakan yang
  // sama dengan index.
  const cek = await db.query(`
    SELECT c.conname FROM pg_constraint c
     JOIN pg_class r ON r.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE r.relname = 'raw_materials' AND n.nspname = $1
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%kain_roll%'
  `, [schemaName && schemaName !== 'public' ? schemaName : 'public']);

  for (const baris of cek.rows) {
    await db.exec(`
      BEGIN;
      ALTER TABLE ${t('raw_materials')} DROP CONSTRAINT "${baris.conname}";
      UPDATE ${t('raw_materials')} SET tipe = 'kain'
       WHERE tipe IN ('kain_roll', 'kain_ecer');
      ALTER TABLE ${t('raw_materials')}
        ADD CONSTRAINT raw_materials_tipe_check CHECK(tipe IN ('kain','aksesoris','cmt_cost'));
      COMMIT;
    `);
  }

  // Backfill jenis. Hanya untuk kain, karena itu satu-satunya pemetaan yang
  // mekanis: kain_roll → roll, kain_ecer → ecer.
  //
  // Aksesoris TIDAK di-backfill. Jenis aksesoris tidak bisa ditebak dari
  // `tipe` — "Kancing Test" kebetulan bisa, tetapi "Tmp" (id 7) tidak
  // memberi tahu apa pun. Menebak di sini akan mengisi kolom dengan nilai
  // yang terlihat sah padahal karangan, dan karangan lebih sulit ditemukan
  // daripada NULL.
  //
  // cmt_cost juga tidak di-backfill: Product Fulfillment memang tidak punya
  // Jenis (keputusan owner 4 September).
  //
  // `tipe_asli` yang jadi acuan, bukan `tipe` — setelah backfill kategori di
  // atas, nilai 'kain_roll' sudah tidak ada lagi di `tipe`.
  await db.exec(`
    UPDATE ${t('raw_materials')} SET jenis = 'roll'
     WHERE jenis IS NULL AND tipe_asli = 'kain_roll';
    UPDATE ${t('raw_materials')} SET jenis = 'ecer'
     WHERE jenis IS NULL AND tipe_asli = 'kain_ecer';
  `);

  // Koreksi data yang diminta owner, 4 September:
  //   > material label livou tolong perbaiki harusnya jenis label
  //
  // "Label Livou" (id 5) tersimpan sebagai kain_roll — label yang salah
  // masuk kategori kain. Ini koreksi kesalahan input, bukan pemetaan
  // mekanis, karenanya ditulis terpisah dan di-assert per id.
  await db.exec(`
    UPDATE ${t('raw_materials')} SET tipe = 'aksesoris', jenis = 'label'
     WHERE id = 5 AND nama = 'Label Livou';
  `);

  // CHECK untuk `jenis`: daftar tetap, dan Jenis terikat pada kategori.
  // 'roll'/'ecer' hanya untuk kain; tujuh nilai aksesoris hanya untuk
  // aksesoris; cmt_cost tidak punya Jenis sama sekali.
  //
  // Dicari lalu diganti, bukan cuma ditambah: kalau cuma ADD, boot kedua
  // menambah constraint kedua dengan nama lain dan keduanya berlaku.
  const cekJenis = await db.query(`
    SELECT c.conname FROM pg_constraint c
     JOIN pg_class r ON r.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE r.relname = 'raw_materials' AND n.nspname = $1
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%jenis%'
  `, [schemaName && schemaName !== 'public' ? schemaName : 'public']);

  for (const baris of cekJenis.rows) {
    await db.exec(`ALTER TABLE ${t('raw_materials')} DROP CONSTRAINT "${baris.conname}"`);
  }
  await db.exec(`
    ALTER TABLE ${t('raw_materials')}
      ADD CONSTRAINT raw_materials_jenis_check CHECK(
        jenis IS NULL OR
        (tipe = 'kain' AND jenis IN ('roll','ecer')) OR
        (tipe = 'aksesoris' AND jenis IN ('hak kait','kancing','resleting','karet','label','renda','kain pelapis'))
      );
  `);
}

const db = new Db();
db.bootstrapSchema = bootstrapSchema;
module.exports = db;
