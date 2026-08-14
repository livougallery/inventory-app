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
    if (req.session && req.session.userId) return next();
    if (process.env.AUTO_LOGIN === 'true') {
      try {
        if (await autoLogin(req, res)) return next();
      } catch (err) {
        // DB gagal — jatuh ke redirect login seperti biasa
      }
    }
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
