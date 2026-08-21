const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcryptjs');
const expressLayouts = require('express-ejs-layouts');

const PORT = process.env.PORT || 3000;

const db = require('./db');

function createApp(options = {}) {
  const app = express();
  // Session store: pakai pool yang di-inject saat test (search_path sudah
  // ter-pin ke schema `test` oleh tests/setup.js), buat PgSession baru
  // untuk runtime.
  const store = options.store || new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session'
  });

  // Create separate app instance for login SPA - NO MIDDLEWARE
  const loginApp = require('express')();
  const distPath = path.join(__dirname, 'frontend/dist/index.html');

  loginApp.get('/login', (req, res) => {
    console.log('[LOGIN SPA] Serving React build');
    return res.sendFile(distPath);
  });

  // Mount SPA app at root level with highest priority
  app.use((req, res, next) => {
    if (req.path === '/login' || req.path.startsWith('/login/')) {
      console.log('[PRIORITY ROUTE] Serving React SPA at /login');
      const fs = require('fs');
      const pathModule = require('path');
      const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');
      if (fs.existsSync(distPath)) {
        return res.sendFile(distPath);
      }
    }
    next();
  });

  // Share session user to all views
  app.use((req, res, next) => {
    res.locals.user = req.session.userId ? {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      nama_lengkap: req.session.namaLengkap || req.session.username
    } : null;
    res.locals.currentPath = req.path;
    next();
  });

  // Share session user to all views
  app.use((req, res, next) => {
    res.locals.user = req.session.userId ? {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      nama_lengkap: req.session.namaLengkap || req.session.username
    } : null;
    res.locals.currentPath = req.path;
    next();
  });

  const { generateToken } = require('./middleware/csrf');
  app.use(generateToken);

  // Error view
  app.use(expressLayouts);
  app.set('layout', 'layout');
  app.set('layout extractScripts', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // API routes (JSON endpoints)
  app.use('/api', require('./routes/api'));

  // Catch-all for debugging - MUST be last
  app.use((req, res, next) => {
    console.log('[DEBUG] Route matched:', req.method, req.path);
    if (req.path === '/login') {
      console.log('[DEBUG] Serving React SPA');
      const path = require('path');
      return res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
    }
    next();
  });

  // Routes
  app.use('/', require('./routes/auth'));

  // Serve React SPA at / for migrated pages (will expand Phase 2)
  app.get('/', (req, res) => {
    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');
    if (fs.existsSync(distPath)) {
      console.log('[SPA ROUTE] Serving React SPA at root /');
      return res.sendFile(distPath);
    }
    // Fallback: redirect to dashboard (EJS)
    res.redirect('/dashboard');
  });
  app.use('/dashboard', require('./routes/dashboard'));
  app.use('/vendors', require('./routes/vendors'));
  app.use('/products', require('./routes/products'));
  app.use('/raw-materials', require('./routes/raw-materials'));
  app.use('/purchase-orders', require('./routes/purchase-orders'));
  app.use('/production-batches', require('./routes/production-batches'));
  app.use('/purchase-imports', require('./routes/purchase-imports'));
  app.use('/hpp', require('./routes/hpp'));
  app.use('/validation', require('./routes/validation'));
  app.use('/reports', require('./routes/reports'));
  app.use('/admin/currencies', require('./routes/currencies'));
  app.use('/cek-data', require('./routes/cek-data'));

  // Error handler
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
        console.log(`Server running at http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('[FATAL] Boot failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { createApp, app };
