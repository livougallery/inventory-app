const db = require('../db');

// Mode presentasi (AUTO_LOGIN=true di .env):
// isi session otomatis dengan user admin supaya semua halaman bisa
// diakses tanpa halaman login. Hapus AUTO_LOGIN dari .env untuk balik normal.
async function autoLogin(req, res) {
  const admin = await db.one(
    'SELECT id, username, nama_lengkap, role FROM users WHERE username = $1',
    ['admin']
  );
  if (!admin) return false;
  req.session.userId = admin.id;
  req.session.username = admin.username;
  req.session.role = admin.role;
  req.session.namaLengkap = admin.nama_lengkap;
  // res.locals.user di index.js sudah dievaluasi sebelum auto-login jalan
  // (session masih kosong), jadi isi ulang di sini supaya sidebar ikut
  // ter-render pada request pertama.
  if (res && res.locals) {
    res.locals.user = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      nama_lengkap: admin.nama_lengkap,
    };
  }
  return true;
}

module.exports = {
  isAuthenticated: async (req, res, next) => {
    console.log('[isAuthenticated] *** START *** sessionId:', req.sessionID);
    console.log('[isAuthenticated] Session keys:', Object.keys(req.session || {}));
    console.log('[isAuthenticated] userId in session:', req.session?.userId);
    console.log('[isAuthenticated] Request path:', req.path);

    if (req.session && req.session.userId) {
      req.user = {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role,
        nama_lengkap: req.session.namaLengkap,
      };
      console.log('[isAuthenticated] ✅ User populated:', req.user);
      return next();
    }

    if (process.env.AUTO_LOGIN === 'true') {
      try {
        console.log('[isAuthenticated] AUTO_LOGIN enabled, checking...');
        if (await autoLogin(req, res)) {
          console.log('[isAuthenticated] ✅ Auto-login success');
          return next();
        }
      } catch (err) {
        console.error('[isAuthenticated] Auto-login failed:', err.message);
      }
    }

    console.log('[isAuthenticated] ❌ No session/user, redirecting to /login');
    res.redirect('/login');
  },
  isGuest: async (req, res, next) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
    if (process.env.AUTO_LOGIN === 'true') {
      try {
        if (await autoLogin(req, res)) return res.redirect('/dashboard');
      } catch (err) {
        // DB gagal — tampilkan halaman login saja
      }
    }
    next();
  }
};
