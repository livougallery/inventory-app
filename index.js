console.log('=== INDEX.JS START ===');
// Clear module cache to force reload after code changes
console.log('[INIT] Clearing require cache...');
for (const key in require.cache) {
  delete require.cache[key];
}
console.log('[INIT] Cache cleared, reloading modules...');

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
  console.log('[createApp] Starting');
  const app = express();

  // DEBUG: Log ALL requests for debugging
  app.use((req, res, next) => {
    console.log(`⚡ ${req.method} ${req.path}`);
    next();
  });

  // Body parsing middleware (MUST be before auth routes)
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  console.log('[createApp] Body parsing middleware added');

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
  console.log('[createApp] Session middleware added');

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
    '/hpp'
  ]);
  console.log('[createApp] SPA_ROUTES created (no /login):', SPA_ROUTES.size);
  console.log('[createApp] SPA_ROUTES created (no /login):', SPA_ROUTES.size);
  console.log('[createApp] /dashboard in SPA_ROUTES?', SPA_ROUTES.has('/dashboard'));

  console.log('[createApp] About to load CSRF middleware...');

  try {
    const { generateToken } = require('./middleware/csrf');
    console.log('[createApp] CSRF loaded successfully');
    app.use(generateToken);
    console.log('[createApp] CSRF middleware applied');
  } catch (e) {
    console.error('[createApp] CSRF ERROR:', e.message);
    throw e;
  }

  // Error view setup - MUST come before any route handlers
  console.log('[createApp] Setting up EJS layouts...');
  app.use(expressLayouts);
  app.set('layout', 'layout');
  app.set('layout extractScripts', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  console.log('[createApp] EJS layout setup complete');

  // API routes (JSON endpoints) - these should NOT be affected by SPA serving
  console.log('[createApp] Loading API routes...');
  app.use('/api/materials', require('./features/material/backend/routes'));
  app.use('/api/negara', require('./features/negara/backend/routes'));
  app.use('/api/vendors', require('./features/vendor/backend/routes'));
  app.use('/api', require('./routes/api'));
  console.log('[createApp] API routes registered');

  // Authentication routes (handles login/register/logout)
  // MUST come before SPA middleware to handle form submissions
  console.log('[createApp] Registering auth routes...');
  const authRoutes = require('./routes/auth');
  app.use(authRoutes);
  console.log('[createApp] ✅ Auth routes registered with router:', typeof authRoutes);

  // Serve login page as EJS (alternative to mounted route if needed)
  console.log('[createApp] Setting up login route...');
  app.get('/login', (req, res) => {
    res.render('auth/login', {
      user: null,
      currentPath: '/login',
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  });
  console.log('[createApp] Login route registered');

  // WORKAROUND: Explicit handlers for problematic routes that Express isn't routing properly
  console.log('[createApp] Adding explicit catch-all handler for unmatched paths...');

  const serveSPA = (req, res, next) => {
    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

    if (require('fs').existsSync(distPath)) {
      console.log(`[EXPLICIT SERVE] Serving SPA for ${req.path}`);
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
  console.log('[createApp] Explicit handlers added for /master-data, /bom, and /dashboard');

  // SPA middleware - serves React build for migrated routes ONLY
  // This must come AFTER login route but BEFORE dashboard route
  console.log('[createApp] About to add SPA middleware...');

  app.use((req, res, next) => {
    console.log(`[SPA EXEC] Intercepted: ${req.method} ${req.path}`);

    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

    if (!fs.existsSync(distPath)) {
      console.log(`[SPA EXEC] ERROR: Cannot find dist at ${distPath}`);
      return next();
    }

    const isMigrated = SPA_ROUTES.has(req.path) ||
                      SPA_ROUTES.has(req.path + '/') ||
                      SPA_ROUTES.has(req.path.replace(/\/$/, ''));

    console.log(`[SPA EXEC] SPA_ROUTES.size=${SPA_ROUTES.size}, exact=${SPA_ROUTES.has(req.path)}, withSlash=${SPA_ROUTES.has(req.path + '/')}, strip=${SPA_ROUTES.has(req.path.replace(/\/$/, ''))}`);

    if (isMigrated) {
      console.log(`[SPA SERVING] Sending ${req.path}`);
      return res.sendFile(distPath);
    }

    console.log(`[SPA NOT MATCH] Passing to next()`);
    next();
  });

  console.log('[createApp] SPA middleware added SUCCESSFULLY');

  // DASHBOARD ROUTE REMOVED - All routes now handled by React SPA
  console.log('[createApp] Dashboard EJS route REMOVED - served by React SPA only');
  // app.use('/dashboard', require('./routes/dashboard')); // DISABLED

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
    console.log(`[CATCH-ALL] ${req.method} ${req.path}`);

    const fs = require('fs');
    const pathModule = require('path');
    const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

    if (fs.existsSync(distPath)) {
      // Only serve SPA if it's a migrated route
      const isMigrated = SPA_ROUTES.has(req.path) ||
                        SPA_ROUTES.has(req.path + '/') ||
                        SPA_ROUTES.has(req.path.replace(/\/$/, ''));

      if (isMigrated) {
        console.log(`[CATCH-ALL SERVING SPA] ${req.path}`);
        return res.sendFile(distPath);
      }
    }

    if (fs.existsSync(distPath)) {
      // Only serve SPA if it's a migrated route
      const isMigrated = SPA_ROUTES.has(req.path) ||
                        SPA_ROUTES.has(req.path + '/') ||
                        SPA_ROUTES.has(req.path.replace(/\/$/, ''));

      if (isMigrated) {
        console.log(`[CATCH-ALL SERVING SPA] ${req.path}`);
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
  console.log('[BOOT] require.main === module is TRUE');
  (async () => {
    try {
      console.log('[BOOT] Starting bootstrap...');
      await db.bootstrapSchema();
      console.log('[BOOT] Schema ready, about to call seedDefaults');
      await seedDefaults();
      console.log('[BOOT] Seeding done, about to listen on PORT', PORT);
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
