const { autoLogin } = require('./auth');

// Middleware JSON API — pasangan untuk isAuthenticated/role yang dipakai
// halaman EJS. Bedanya: yang ini menjawab JSON, bukan redirect atau render.
// Halaman EJS bergantung pada perilaku redirect-and-render milik yang lama,
// jadi keduanya hidup berdampingan dan tidak saling menggantikan.

// Bentuk req.user yang sama dengan yang diisi isAuthenticated.
function userFromSession(session) {
  return {
    id: session.userId,
    username: session.username,
    role: session.role,
    nama_lengkap: session.namaLengkap,
  };
}

// True kalau ada session; kalau belum, coba AUTO_LOGIN (mode presentasi)
// seperti isAuthenticated. Dipakai requireAuth dan requireRole supaya
// keduanya punya kontrak 401 yang persis sama, walau dipasang sendirian.
async function hasSession(req, res) {
  if (req.session && req.session.userId) return true;
  if (process.env.AUTO_LOGIN === 'true') {
    try {
      if (await autoLogin(req, res)) return true;
    } catch (err) {
      console.error('[apiAuth] AUTO_LOGIN gagal:', err.message);
    }
  }
  return false;
}

// 401 JSON bila belum login; kalau tidak, lanjut dan isi req.user.
async function requireAuth(req, res, next) {
  if (await hasSession(req, res)) {
    req.user = userFromSession(req.session);
    return next();
  }
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// Pasangan JSON untuk role(...). Versi EJS mengarahkan ke /login saat belum
// login dan me-render error.ejs saat role salah; yang ini menjawab 401/403
// JSON supaya klien React bisa menanganinya.
function requireRole(...roles) {
  return (req, res, next) => {
    (async () => {
      if (!(await hasSession(req, res))) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      if (!roles.includes(req.session.role)) {
        return res.status(403).json({ ok: false, error: 'Akses ditolak.' });
      }
      return next();
    })().catch(next);
  };
}

module.exports = { requireAuth, requireRole };
