const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const methodOverride = require('method-override');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

const db = require('./db');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: 'inventory-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

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
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routes/auth'));
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

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Terjadi kesalahan: ' + err.message);
});

// Seed default users
const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!admin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, nama_lengkap, role) VALUES (?, ?, ?, ?)')
    .run('admin', hash, 'Admin Utama', 'admin');
  console.log('Default admin: admin / admin123');
}
const finance = db.prepare('SELECT id FROM users WHERE username = ?').get('finance');
if (!finance) {
  const hash = bcrypt.hashSync('finance123', 10);
  db.prepare('INSERT INTO users (username, password, nama_lengkap, role) VALUES (?, ?, ?, ?)')
    .run('finance', hash, 'Finance', 'finance');
  console.log('Default finance: finance / finance123');
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
