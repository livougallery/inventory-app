const express = require('express');
console.log('[AUTH ROUTE] Loaded');
const router = express.Router();
console.log('[AUTH ROUTE] Router initialized');

// DEBUG: Log all routes on this router
router.use((req, res, next) => {
  console.log(`[AUTH ROUTER] ${req.method} ${req.path}`);
  next();
});
const bcrypt = require('bcryptjs');
const db = require('../db');
const { isGuest, isAuthenticated } = require('../middleware/auth');

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null, layout: false });
});

// REMOVE isGuest - allow re-login if needed
router.post('/login', async (req, res) => {
  console.log('========== [POST /login] START ==========');
  console.log('[POST /login] Request body:', req.body);
  console.log('[POST /login] Session before:', req.session?.userId);
  console.log('[POST /login] User agent:', req.get('user-agent'));

  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('auth/login', { error: 'Username dan password harus diisi', layout: false });
  }

  const user = await db.one('SELECT * FROM users WHERE username = $1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('auth/login', { error: 'Username atau password salah', layout: false });
  }

  // SET SESSION
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.namaLengkap = user.nama_lengkap;

  console.log('[POST /login] ✅ Session SET:', {
    userId: req.session.userId,
    username: req.session.username,
    role: req.session.role
  });

  // CRITICAL: Decide redirect destination
  const destination = '/'; // ALWAYS redirect to root for SPA
  console.log(`[POST /login] 🔀 Will redirect to: ${destination}`);
  console.log(`[POST /login] 💡 Note: '/' will be handled by SPA middleware`);

  // Render SPA with client-side navigation to dashboard
  // This avoids server-side redirect issues with POST requests
  const distPath = require('path').join(__dirname, '../frontend/dist/index.html');
  if (require('fs').existsSync(distPath)) {
    console.log(`[POST /login] 📄 Serving SPA index.html from: ${distPath}`);
    return res.sendFile(distPath);
  }

  // Fallback to redirect if SPA files not found
  console.log(`[POST /login] ⚠️ SPA not found, fallback redirect to ${destination}`);
  res.redirect(destination);
});

router.get('/register', isGuest, async (req, res) => {
  res.render('auth/register', { error: null, layout: false });
});

router.post('/register', isGuest, async (req, res) => {
  const { username, password, nama_lengkap, role } = req.body;
  if (!username || !password || !nama_lengkap) {
    return res.render('auth/register', { error: 'Semua field harus diisi', layout: false });
  }
  if (password.length < 6) {
    return res.render('auth/register', { error: 'Password minimal 6 karakter', layout: false });
  }
  const existing = await db.one('SELECT id FROM users WHERE username = $1', [username]);
  if (existing) {
    return res.render('auth/register', { error: 'Username sudah digunakan', layout: false });
  }
  const hash = bcrypt.hashSync(password, 10);
  await db.run('INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [username, hash, nama_lengkap, role || 'admin']);
  res.redirect('/login');
});

router.get('/logout', isAuthenticated, async (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
