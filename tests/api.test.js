require('dotenv').config();
process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const db = require('../db');
const { createApp } = require('../index');

// Inject pool yang sudah di-pin ke schema `test` oleh tests/setup.js.
// Dibungkus PgSession karena express-session butuh store interface
// (get/set/destroy), bukan raw pg Pool; search_path `test` membuat
// PGStore membaca/menulis tabel `session` di schema test.
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const store = new PgSession({ pool: db.pool, tableName: 'session' });

const app = createApp({ store });

async function seedUser() {
  const hash = bcrypt.hashSync('admin123', 10);
  return db.run(
    "INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ['admin', hash, 'Admin Utama', 'admin']
  );
}

describe('createApp smoke', () => {
  it('GET /login masih render EJS (belum ada di MIGRATED)', async () => {
    const request = require('supertest');
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Inventory System');
  });
});
