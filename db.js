require('dotenv').config();
const { Pool } = require('pg');

class Db {
  constructor() {
    if (!process.env.DATABASE_URL) {
      console.error('[FATAL] DATABASE_URL wajib di-set. Copy .env.example ke .env.');
      process.exit(1);
    }
    // Validate no raw @ in password segment (URL encoding issue)
    const match = process.env.DATABASE_URL.match(/\/\/([^:]+):([^@]+)@/);
    if (match && match[2].includes('@')) {
      console.error('[FATAL] Password di DATABASE_URL mengandung @ — harus URL-encoded (%40).');
      process.exit(1);
    }
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', (err) => {
      console.error('[pg] Unexpected pool error:', err.message);
    });
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async one(text, params) {
    const r = await this.pool.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }

  async run(text, params) {
    const r = await this.pool.query(text, params);
    return {
      rowCount: r.rowCount,
      returningId: r.rows.length ? r.rows[0].id : null,
    };
  }

  // Run multiple statements separated by ; — only for bootstrap/migrations
  async exec(statements) {
    const lines = statements
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const sql of lines) {
      await this.pool.query(sql);
    }
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new Tx(client);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  now() {
    return 'CURRENT_DATE';
  }

  async close() {
    await this.pool.end();
  }
}

class Tx {
  constructor(client) {
    this.client = client;
  }
  async query(text, params) {
    return this.client.query(text, params);
  }
  async one(text, params) {
    const r = await this.client.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }
  async run(text, params) {
    const r = await this.client.query(text, params);
    return {
      rowCount: r.rowCount,
      returningId: r.rows.length ? r.rows[0].id : null,
    };
  }
}

const db = new Db();
module.exports = db;
