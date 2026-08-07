/**
 * Fast-forward every SERIAL sequence in the public schema to MAX(id).
 *
 * Needed after tmp/migrate-data.js imports rows with their original SQLite ids:
 * explicit id values do not advance a sequence, so the next app-side INSERT
 * collides with an existing primary key (duplicate key value violates ...).
 *
 * Idempotent — safe to re-run. Run from the project root:
 *   node tmp/resync-sequences.js
 */
require('dotenv').config({ quiet: true });

const db = require('../db');

async function main() {
  const seqs = await db.query(`
    SELECT table_name, column_name,
           pg_get_serial_sequence(table_schema || '.' || table_name, column_name) AS seq
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval%'
    ORDER BY table_name
  `);

  let changed = 0;
  for (const { table_name, column_name, seq } of seqs.rows) {
    if (!seq) continue;
    const { rows } = await db.query(
      `SELECT COALESCE(MAX("${column_name}"), 0)::int AS mx FROM public."${table_name}"`
    );
    const mx = rows[0].mx;
    const before = await db.one(`SELECT last_value::int AS lv, is_called FROM ${seq}`);
    // is_called=false when the table is empty so the first generated id is 1.
    const target = mx || 1;
    const called = mx > 0;
    await db.query('SELECT setval($1, $2, $3)', [seq, target, called]);
    if (before.lv !== target || before.is_called !== called) {
      changed++;
      console.log(`  ${table_name}.${column_name}: ${before.lv} -> ${target}`);
    }
  }

  console.log(`\n${changed} sequence(s) resynced, ${seqs.rows.length} checked.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Resync failed:', e.message);
    process.exit(1);
  });
