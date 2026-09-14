require('dotenv').config({ quiet: true });
const db = require('../db');
(async () => {
  const r = await db.query(`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
           pg_size_pretty(pg_tablespace_size('pg_default')) AS ts_size
  `);
  console.log('DATABASE SIZE :', r.rows[0].db_size);
  console.log('TABLESPACE    :', r.rows[0].ts_size);

  const t = await db.query(`
    SELECT c.relname,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 8
  `);
  console.log('\nTERBESAR:');
  for (const row of t.rows) console.log('  ', row.total.padStart(10), row.relname);
  process.exit(0);
})();
