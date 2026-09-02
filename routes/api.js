const express = require('express');
const crypto = require('crypto');
const { body, param } = require('express-validator');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/csrf');

// GET /api/csrf — PUBLIC (tidak perlu login), return CSRF token
// generateToken adalah middleware (membaca res.locals), jadi dipasang
// sebagai middleware dulu, bukan dipanggil dengan satu argumen.
router.get('/csrf', (req, res, next) => {
  generateToken(req, res, next);
}, (req, res) => {
  res.json({ csrfToken: res.locals.csrfToken });
});

// GET /api/me — butuh authenticated session
router.get('/me', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = req.session;
  const csrfToken = generateToken(req);
  
  res.json({
    user: {
      id: user.userId,
      username: user.username,
      nama_lengkap: user.namaLengkap || user.username,
      role: user.role
    },
    modePresentasi: true, // hardcode sesuai index.js
    csrfToken
  });
});

// POST /api/login — body: { username, password }, validasi CSRF, set session
router.post('/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty()
  ],
  async (req, res, next) => {
    try {
      const db = require('../db');
      const { username, password } = req.body;

      // Validate CSRF
      const validated = await validateCSRF(req);
      if (!validated) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }
      
      // Find user
      const result = await db.one(
        'SELECT id, password, nama_lengkap, role FROM users WHERE username = $1',
        [username.toLowerCase()]
      );
      
      if (!result) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }
      
      // Verify password
      const valid = await bcrypt.compare(password, result.password);
      if (!valid) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }
      
      // Set session
      req.session.regenerate((err) => {
        if (err) {
          console.error('[LOGIN ERROR]', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        
        req.session.userId = result.id;
        req.session.username = username.toLowerCase();
        req.session.role = result.role;
        req.session.namaLengkap = result.nama_lengkap;
        
        // Session baru = token CSRF baru juga. generateToken adalah
        // middleware (butuh res.locals), jadi di sini token di-set langsung.
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        const newCsrfToken = req.session.csrfToken;
        
        res.json({
          ok: true,
          redirect: '/dashboard',
          csrfToken: newCsrfToken
        });
      });
    } catch (error) {
      console.error('[LOGIN ERROR]', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Helper: baca satu cookie dari header Cookie tanpa dependency cookie-parser.
function getCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

// Helper: validate CSRF token from header
async function validateCSRF(req) {
  const csrfHeader = req.headers['x-csrf-token'];
  const csrfCookie = getCookie(req, 'csrf-token');

  if (!csrfHeader || !csrfCookie) {
    return false;
  }

  // Check if headers match cookies (CSRF protection)
  return csrfHeader === csrfCookie;
}

// GET /api/logout — destroy session
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[LOGOUT ERROR]', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    res.clearCookie('session');
    res.clearCookie('csrf-token');
    
    res.json({ ok: true, redirect: '/login' });
  });
});

module.exports = router;
