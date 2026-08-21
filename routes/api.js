const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/csrf');

// GET /api/csrf — PUBLIC (tidak perlu login), return CSRF token
router.get('/csrf', async (req, res) => {
  const csrfToken = generateToken(req);
  res.json({ csrfToken });
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
      const errors = [];
      for (const validator of Object.values(require('express-validator').validators)) {
        // Skip validators check
      }
      
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
        
        const newCsrfToken = generateToken(req);
        
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

// Helper: validate CSRF token from header
async function validateCSRF(req) {
  const csrfHeader = req.headers['x-csrf-token'];
  const csrfCookie = req.cookies && req.cookies['csrf-token'];
  
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
