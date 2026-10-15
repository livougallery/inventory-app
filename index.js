const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcryptjs');
const expressLayouts = require('express-ejs-layouts');

const PORT = process.env.PORT || 3000;

const db = require('./db');
// Diimpor di sini supaya direktori upload-nya DIBUAT saat boot, dan supaya
// jalur yang disajikan di bawah ini persis sama dengan yang dipakai saat
// menyimpan. Dua jalur yang ditulis terpisah bisa berbeda pendapat — dan
// perbedaannya baru terasa sebagai foto yang tersimpan tapi tidak tampil.
const photoUpload = require('./services/photoUpload');

function createApp(options = {}) {
  const app = express();

  // Body parsing middleware (MUST be before auth routes)
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Session middleware - MUST come BEFORE everything
  app.use(session({
    store: options.store || new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'inventory-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set true in production with HTTPS
  }));

  // SPA routes only - exclude login (handled by EJS forms + auth routes)
  const SPA_ROUTES = new Set([
    '/',
    '/master-data',
    '/stok-material',
    '/pembelian-material',
    '/bom',
    '/vendors',
    '/products',
    '/purchase-orders',
    '/production-batches',
    '/hpp',
    // 7 modul pratinjau (daftar kolom owner, 7 September 2026).
    // Wajib didaftarkan di sini: catch-all hanya menyajikan SPA untuk rute
    // yang ada di set ini, jadi rute React yang tidak terdaftar menjawab 404
    // meski sudah ada di App.tsx.
    '/modul/material',
    // Prototipe reui Data Grid (bandingkan dengan /modul/material).
    '/modul/material-grid',
    '/modul/product',
    '/modul/whitelabel',
    // Register Produk — section REGISTER, halaman sendiri (bukan bagian dari
    // /modul/product): yang dibaca di sana angka stok per varian.
    '/modul/register-produk',
    // Papan kanban Production Fulfillment, di section Progress.
    '/modul/production-fulfillment',
    // Tabel 40 kolomnya — halaman TERPISAH sejak papan dipindah ke Progress.
    // Dua rute, bukan satu dengan saklar: keduanya menjawab pertanyaan berbeda.
    '/modul/production-fulfillment-table',
    '/modul/hpp-baru',
    // Hasil HPP per KARTU (10 Production + 8 White Label) — beda butir dari
    // /modul/hpp-baru yang per SHIPMENT.
    '/modul/hpp-harga-jual',
    '/modul/barang-datang',
    '/modul/bom-hpp',
    // Material Fulfillment — halaman yang diisi dari ticket 11e. Tanpa baris ini
    // rute ada di App.tsx tapi dijawab 404, persis seperti yang dicegat
    // tests/spaRoutes.test.js.
    '/modul/material-fulfillment'
  ]);


  try {
    const { generateToken } = require('./middleware/csrf');
    app.use(generateToken);
  } catch (e) {
    console.error('[createApp] CSRF ERROR:', e.message);
    throw e;
  }

  // Error view setup - MUST come before any route handlers
  app.use(expressLayouts);
  app.set('layout', 'layout');
  app.set('layout extractScripts', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // API routes (JSON endpoints) - these should NOT be affected by SPA serving
  app.use('/api/materials', require('./features/material/backend/routes'));
  app.use('/api/negara', require('./features/negara/backend/routes'));
  app.use('/api/vendors', require('./features/vendor/backend/routes'));
  app.use('/api/purchase-orders', require('./features/purchase-order/backend/routes'));
  app.use('/api/currencies', require('./features/currency/backend/routes'));
  app.use('/api', require('./routes/api'));

  // Authentication routes (handles login/register/logout)
  // MUST come before SPA middleware to handle form submissions
  const authRoutes = require('./routes/auth');
  app.use(authRoutes);

  // Serve login page as EJS (alternative to mounted route if needed)
  app.get('/login', (req, res) => {
    res.render('auth/login', {
      user: null,
      currentPath: '/login',
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  });

  // WORKAROUND: Explicit handlers for problematic routes that Express isn't routing properly

  const serveSPA = (req, res, next) => {
    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

    if (require('fs').existsSync(distPath)) {
      return res.sendFile(distPath);
    }
    next();
  };

  // Add explicit handlers for failing routes
  app.get('/master-data', serveSPA);
  app.get('/stok-material', serveSPA);
  app.get('/pembelian-material', serveSPA);
  app.get('/bom', serveSPA);
  app.get('/dashboard', serveSPA); // Add dashboard to serve SPA

  // Berkas yang diunggah (foto nota PO, foto material) — HARUS SEBELUM
  // middleware SPA dan catch-all di bawah.
  //
  // Posisi ini yang menentukan semuanya. Awalnya ia dipasang setelah
  // catch-all, dan akibatnya tidak pernah tercapai: permintaan ke /uploads/
  // lebih dulu dijawab catch-all dengan index.html milik React (404 ber-HTML).
  // Berkasnya tersimpan, baris databasenya ada, kolom fotonya terisi — dan
  // gambarnya tidak pernah muncul. Persis keadaan foto produk hari ini, karena
  // uploads/ tidak pernah di-mount sama sekali sebelum tiket ini.
  //
  // maxAge diset karena nama berkasnya mengandung cap waktu dan bagian acak:
  // nama tertentu tidak pernah berubah isinya, jadi aman di-cache lama. Foto
  // yang diganti mendapat nama baru, bukan isi baru.
  app.use(
    '/uploads',
    express.static(photoUpload.UPLOAD_DIR, {
      maxAge: '30d',
      // Jangan mengizinkan penyajian selain berkas biasa: index bawaan
      // express.static akan mendaftar isi direktori, yang memperlihatkan
      // seluruh nama berkas yang diunggah.
      index: false,
      dotfiles: 'deny',
    })
  );

  // SPA middleware - serves React build for migrated routes ONLY
  // This must come AFTER login route but BEFORE dashboard route

  app.use((req, res, next) => {

    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

    if (!fs.existsSync(distPath)) {
      return next();
    }

    const isMigrated = SPA_ROUTES.has(req.path) ||
                      SPA_ROUTES.has(req.path + '/') ||
                      SPA_ROUTES.has(req.path.replace(/\/$/, ''));


    if (isMigrated) {
      return res.sendFile(distPath);
    }

    next();
  });


  // DASHBOARD ROUTE REMOVED - All routes now handled by React SPA
  // Controller EJS-nya sudah dihapus (tiket 02). Baris commented-out ini
  // sengaja dibiarkan sebagai penjelasan bahwa keputusan "React saja" itu
  // disengaja -- jangan dipulihkan hanya karena `/dashboard` terlihat
  // seperti mau memakai route EJS.
  // (Lihat juga app.get('/dashboard', serveSPA) di atas.)

  // Backend EJS routes (fallback for non-migrated or API endpoints)
  app.use('/purchase-imports', require('./routes/purchase-imports'));
  app.use('/validation', require('./routes/validation'));
  app.use('/reports', require('./routes/reports'));
  app.use('/admin/currencies', require('./routes/currencies'));

  // Serve Vite static assets BEFORE catch-all (MUST have correct MIME types)
  app.use('/assets', express.static(path.join(__dirname, 'frontend/dist/assets')));

  // CATCH-ALL: Serve SPA for any unmatched route that's in SPA_ROUTES
  // This MUST come AFTER all explicit routes including static assets
  app.use((req, res, next) => {

    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

    if (fs.existsSync(distPath)) {
      // Only serve SPA if it's a migrated route
      const isMigrated = SPA_ROUTES.has(req.path) ||
                        SPA_ROUTES.has(req.path + '/') ||
                        SPA_ROUTES.has(req.path.replace(/\/$/, ''));

      if (isMigrated) {
        return res.sendFile(distPath);
      }
    }

    if (fs.existsSync(distPath)) {
      // Only serve SPA if it's a migrated route
      const isMigrated = SPA_ROUTES.has(req.path) ||
                        SPA_ROUTES.has(req.path + '/') ||
                        SPA_ROUTES.has(req.path.replace(/\/$/, ''));

      if (isMigrated) {
        return res.sendFile(distPath);
      }
    }

    next();
  });

  // Error handler (MUST be last)
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Terjadi kesalahan: ' + err.message);
  });

  return app;
}

const app = createApp();

// Seed default users, currencies, HPP templates
async function seedDefaults() {
  const admin = await db.one('SELECT id FROM users WHERE username = $1', ['admin']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.run('INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id',
      ['admin', hash, 'Admin Utama', 'admin']);
    console.log('Default admin: admin / admin123');
  }
  const finance = await db.one('SELECT id FROM users WHERE username = $1', ['finance']);
  if (!finance) {
    const hash = bcrypt.hashSync('finance123', 10);
    await db.run('INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id',
      ['finance', hash, 'Finance', 'finance']);
    console.log('Default finance: finance / finance123');
  }

  // Seed currencies (idempotent via UNIQUE)
  const curCnt = await db.one('SELECT COUNT(*)::int AS c FROM currencies');
  if (curCnt.c === 0) {
    await db.run("INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1, $2, $3, 1) ON CONFLICT (kode) DO NOTHING", ['IDR', 'Indonesian Rupiah', 'Rp']);
    await db.run("INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1, $2, $3, 1) ON CONFLICT (kode) DO NOTHING", ['THB', 'Thai Baht', '฿']);
    await db.run("INSERT INTO currencies (kode, nama, simbol, is_active) VALUES ($1, $2, $3, 1) ON CONFLICT (kode) DO NOTHING", ['CNY', 'Chinese Yuan', '¥']);
  }

  // Seed HPP formula templates
  const hppCnt = await db.one('SELECT COUNT(*)::int AS c FROM hpp_formula_templates');
  if (hppCnt.c === 0) {
    const fjson = '{"mode":"weighted_avg","fields":["biaya","qty_produksi"]}';
    for (const tipe of ['kain', 'aksesoris', 'jahit', 'kirim_aksesoris', 'others']) {
      await db.run('INSERT INTO hpp_formula_templates (tipe_biaya, nama_template, formula_json, is_default) VALUES ($1, $2, $3, 1) ON CONFLICT DO NOTHING',
        [tipe, `Default ${tipe} (Weighted Average)`, fjson]);
    }
  }

  // Contoh resep bahan (BOM) supaya tabel "Material" tidak kosong saat pertama dilihat.
  // Baris ini data contoh — silakan dihapus/diedit lewat form BOM nanti.
  const bomCnt = await db.one('SELECT COUNT(*)::int AS c FROM product_bom');
  if (bomCnt.c === 0) {
    const contoh = [
      [3, 4, 1.5, 'Contoh: kain utama 1.5 Yard per pcs'],   // Rowe Tee LVU-TOP-11-EBK × FP20703
      [3, 5, 1,   'Contoh: 1 label per pcs'],                // Rowe Tee LVU-TOP-11-EBK × Label Livou
      [3, 6, 1,   'Contoh: 1 jasa jahit per pcs'],           // Rowe Tee LVU-TOP-11-EBK × Jahit Konveksi
    ];
    for (const [variant_id, raw_material_id, qty, catatan] of contoh) {
      await db.run('INSERT INTO product_bom (variant_id, raw_material_id, qty_per_pcs, catatan) VALUES ($1, $2, $3, $4)',
        [variant_id, raw_material_id, qty, catatan]);
    }
  }
}

// Boot: create tables, seed defaults, then start server.
// Do NOT start the server if schema bootstrap or seeding fails.
// Boot HANYA saat dijalankan langsung (`npm start` / `node index.js`).
// Saat di-require oleh test: JANGAN bootstrap/seed/listen — tests/setup.js
// sudah bootstrap schema `test`, dan side effect ke DB runtime tidak boleh
// terjadi saat test.
if (require.main === module) {
  (async () => {
    try {
      await db.bootstrapSchema();
      await seedDefaults();
      app.listen(PORT, () => {
        console.log(`[SERVER LISTEN] Listening on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('[FATAL] Boot failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { createApp, app };
