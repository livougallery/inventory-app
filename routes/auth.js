const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { isGuest, isAuthenticated } = require('../middleware/auth');

router.get('/login', isGuest, (req, res) => {
  res.render('auth/login', { error: null });
});

router.post('/login', isGuest, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('auth/login', { error: 'Username dan password harus diisi' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('auth/login', { error: 'Username atau password salah' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.namaLengkap = user.nama_lengkap;
  res.redirect('/dashboard');
});

router.get('/register', isGuest, (req, res) => {
  res.render('auth/register', { error: null });
});

router.post('/register', isGuest, (req, res) => {
  const { username, password, nama_lengkap, role } = req.body;
  if (!username || !password || !nama_lengkap) {
    return res.render('auth/register', { error: 'Semua field harus diisi' });
  }
  if (password.length < 6) {
    return res.render('auth/register', { error: 'Password minimal 6 karakter' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.render('auth/register', { error: 'Username sudah digunakan' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password, nama_lengkap, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, nama_lengkap, role || 'admin');
  res.redirect('/login');
});

router.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
