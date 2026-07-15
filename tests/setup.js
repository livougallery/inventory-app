const fs = require('fs');
const path = require('path');

// Use temporary DB to avoid clobbering dev/prod data
const tmpDir = path.join(__dirname, '..', 'data');
const tmpDb = path.join(tmpDir, 'test.sqlite');
if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);

process.env.NODE_ENV = 'test';
// Jest's module loader ignores require.cache mutations, so we redirect db.js
// to the temp DB via the DB_PATH env var (db.js checks this first).
process.env.DB_PATH = tmpDb;
const dbModulePath = require.resolve('../db');
const tmpConn = require('better-sqlite3')(tmpDb);
require.cache[dbModulePath] = {
  exports: tmpConn
};
// Force db.js to load against the temp path (runs schema migrations once).
require('../db');
