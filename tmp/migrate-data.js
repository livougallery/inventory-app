/**
 * Migrate existing SQLite data to Supabase PostgreSQL.
 * Run ONCE after schema bootstrap: node tmp/migrate-data.js
 *
 * Reads all rows from SQLite, writes to Supabase with RETURNING.
 * Preserves exact IDs via explicit id column in INSERT.
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { Pool } = require('pg');

const sqlitePath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'database.sqlite');
const sqlite = new Database(sqlitePath);

const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

// Tables in FK-safe order (parents first)
const TABLES = [
  'users',
  'vendors',
  'products',
  'categories',
  'currencies',
  'raw_materials',
  'raw_material_variants',
  'purchase_orders',
  'purchase_order_items',
  'purchase_order_photos',
  'production_batches',
  'product_variants',
  'production_costs',
  'production_deliveries',
  'hpp_history',
  'purchase_imports',
  'shipments',
  'shipment_invoices',
  'material_batches',
  'stock_movements',
  'hpp_formula_templates',
  'hpp_batch_config',
  'product_photos',
  'variant_prices',
  'delivery_expenses',
];

async function migrate() {
  const client = await pg.connect();
  try {
    for (const table of TABLES) {
      // Check if the table exists in SQLite (new tables from schema bootstrap
      // may have no SQLite counterpart — skip those gracefully).
      const exists = sqlite.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%'`
      ).get(table);
      if (!exists) {
        console.log(`  ${table}: absent in SQLite (skipped)`);
        continue;
      }

      // Read from SQLite
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows (skipped)`);
        continue;
      }

      // Get column names from first row
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const colList = cols.map(c => `"${c}"`).join(', ');
      const values = rows.map(r => cols.map(c => r[c]));

      // Batch insert in chunks of 50
      const CHUNK = 50;
      let inserted = 0;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        // Build multi-row INSERT
        const rowPlaceholders = chunk.map((_, ri) =>
          `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
        ).join(', ');
        const flatParams = chunk.flat();
        await client.query(
          `INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders} ON CONFLICT (id) DO NOTHING`,
          flatParams
        );
        inserted += chunk.length;
      }

      console.log(`  ${table}: ${inserted} rows`);
    }

    // Rows were inserted with their original SQLite ids, which does NOT advance
    // the SERIAL sequences — they stay at 1 and the next app-side INSERT fails
    // with a duplicate-key error on the primary key. Fast-forward every
    // sequence to max(id) so subsequent inserts continue after the imported rows.
    console.log('\nResyncing sequences:');
    const seqs = await client.query(`
      SELECT table_name, column_name,
             pg_get_serial_sequence(table_schema || '.' || table_name, column_name) AS seq
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_default LIKE 'nextval%'
    `);
    for (const { table_name, column_name, seq } of seqs.rows) {
      if (!seq) continue;
      const { rows } = await client.query(
        `SELECT COALESCE(MAX("${column_name}"), 0)::int AS mx FROM public."${table_name}"`
      );
      const mx = rows[0].mx;
      // is_called=false when max is 0 so the first generated id is 1, not 2.
      await client.query('SELECT setval($1, $2, $3)', [seq, mx || 1, mx > 0]);
      console.log(`  ${table_name}.${column_name}: setval -> ${mx}`);
    }

    console.log('\nMigration complete!');
  } finally {
    client.release();
    sqlite.close();
    await pg.end();
  }
}

migrate().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
