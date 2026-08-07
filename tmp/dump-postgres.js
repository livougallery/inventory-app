/**
 * Dump the live Supabase Postgres database to plain SQL.
 *
 *   node tmp/dump-postgres.js
 *
 * Writes tmp/pg-schema.sql (DDL, via information_schema) and tmp/pg-data.sql
 * (INSERT statements in FK-safe order, plus setval for every sequence).
 *
 * Use this instead of tmp/dump-sqlite.js — the SQLite file is no longer the
 * source of truth. Both outputs contain real rows and bcrypt password hashes:
 * they are gitignored, and should be copied off this machine for backup only.
 *
 * pg_dump is not installed here, so the DDL is reconstructed from catalog
 * metadata. It covers columns, types, defaults, NOT NULL, primary keys, foreign
 * keys, unique constraints and indexes — enough to rebuild the database. Check
 * triggers and CHECK constraints are also emitted. Prefer real pg_dump if it
 * ever becomes available.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (.env missing?)');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

// FK-safe order (parents first), mirroring tmp/migrate-data.js. Tables found in
// the database but absent from this list are appended after it.
const PREFERRED_ORDER = [
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

// The session store table is runtime state, not business data.
const EXCLUDE = new Set(['session']);

function ident(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(value, dataType) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'::bytea`;
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value) || (typeof value === 'object' && dataType === 'jsonb')) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const stamp = new Date().toISOString();

  const { rows: tableRows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const allTables = tableRows.map((r) => r.table_name).filter((t) => !EXCLUDE.has(t));
  const ordered = [
    ...PREFERRED_ORDER.filter((t) => allTables.includes(t)),
    ...allTables.filter((t) => !PREFERRED_ORDER.includes(t)),
  ];

  // ---- schema ---------------------------------------------------------------
  const schemaLines = [
    `-- Supabase Postgres schema dump`,
    `-- Generated ${stamp} by tmp/dump-postgres.js (reconstructed from catalog)`,
    '',
  ];

  // Sequences must exist before the tables whose DEFAULT calls nextval() on
  // them. Ownership is attached afterwards, once the tables are there.
  const { rows: seqList } = await pool.query(
    `SELECT s.relname AS sequence_name,
            c.relname AS table_name,
            a.attname AS column_name
     FROM pg_class s
     JOIN pg_namespace n ON n.oid = s.relnamespace AND n.nspname = 'public'
     LEFT JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
     LEFT JOIN pg_class c ON c.oid = d.refobjid
     LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid
     WHERE s.relkind = 'S'
     ORDER BY s.relname`
  );
  const sequences = seqList.filter((s) => !s.table_name || !EXCLUDE.has(s.table_name));

  schemaLines.push('-- sequences (created before tables: column DEFAULTs call nextval on them)');
  for (const s of sequences) {
    schemaLines.push(`CREATE SEQUENCE IF NOT EXISTS ${ident(s.sequence_name)} AS integer;`);
  }
  schemaLines.push('');

  for (const table of ordered) {
    const { rows: cols } = await pool.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length,
              numeric_precision, numeric_scale, is_nullable, column_default,
              is_identity, identity_generation
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );

    const defs = cols.map((c) => {
      let type = c.data_type;
      if (type === 'character varying' && c.character_maximum_length) {
        type = `varchar(${c.character_maximum_length})`;
      } else if (type === 'character' && c.character_maximum_length) {
        type = `char(${c.character_maximum_length})`;
      } else if (type === 'numeric' && c.numeric_precision) {
        type = c.numeric_scale
          ? `numeric(${c.numeric_precision},${c.numeric_scale})`
          : `numeric(${c.numeric_precision})`;
      } else if (type === 'ARRAY') {
        type = `${c.udt_name.replace(/^_/, '')}[]`;
      } else if (type === 'USER-DEFINED') {
        type = c.udt_name;
      }

      let line = `  ${ident(c.column_name)} ${type}`;
      if (c.is_identity === 'YES') {
        line += ` GENERATED ${c.identity_generation} AS IDENTITY`;
      } else if (c.column_default !== null) {
        line += ` DEFAULT ${c.column_default}`;
      }
      if (c.is_nullable === 'NO') line += ' NOT NULL';
      return line;
    });

    // Table-level constraints, rendered from pg_constraint so the printed text
    // is exactly what Postgres itself reports.
    const { rows: cons } = await pool.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def, contype
       FROM pg_constraint
       WHERE conrelid = $1::regclass
       ORDER BY CASE contype WHEN 'p' THEN 0 WHEN 'u' THEN 1
                             WHEN 'c' THEN 2 ELSE 3 END, conname`,
      [`public.${ident(table)}`]
    );
    for (const c of cons) {
      defs.push(`  CONSTRAINT ${ident(c.conname)} ${c.def}`);
    }

    schemaLines.push(`-- table: ${table}`);
    schemaLines.push(`CREATE TABLE ${ident(table)} (`);
    schemaLines.push(defs.join(',\n'));
    schemaLines.push(');');

    const { rows: idx } = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
         AND indexname NOT IN (
           SELECT conname FROM pg_constraint WHERE conrelid = $2::regclass
         )
       ORDER BY indexname`,
      [table, `public.${ident(table)}`]
    );
    for (const i of idx) {
      // pg_indexes qualifies the table as public.<t>; keep the dump
      // search_path-relative like the CREATE TABLE statements above, so it can
      // be restored into any schema (including a scratch one for verification).
      schemaLines.push(`${i.indexdef.replace(/ ON public\./, ' ON ')};`);
    }
    schemaLines.push('');
  }

  const { rows: views } = await pool.query(
    `SELECT table_name, view_definition FROM information_schema.views
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  for (const v of views) {
    schemaLines.push(`-- view: ${v.table_name}`);
    schemaLines.push(`CREATE OR REPLACE VIEW ${ident(v.table_name)} AS`);
    schemaLines.push(`${v.view_definition.trim().replace(/;$/, '')};`);
    schemaLines.push('');
  }

  // Tie each sequence back to its column so it is dropped with the table and
  // so setval/currval resolve the same way they do in the live database.
  schemaLines.push('-- sequence ownership');
  for (const s of sequences) {
    if (!s.table_name || !s.column_name) continue;
    schemaLines.push(
      `ALTER SEQUENCE ${ident(s.sequence_name)} OWNED BY ${ident(s.table_name)}.${ident(s.column_name)};`
    );
  }
  schemaLines.push('');

  const schemaPath = path.join(__dirname, 'pg-schema.sql');
  fs.writeFileSync(schemaPath, schemaLines.join('\n'), 'utf8');

  // ---- data -----------------------------------------------------------------
  const dataLines = [
    `-- Supabase Postgres data dump`,
    `-- Generated ${stamp} by tmp/dump-postgres.js`,
    '-- Tables in FK-safe order; load after pg-schema.sql.',
    '',
  ];
  let totalRows = 0;
  const perTable = [];

  for (const table of ordered) {
    const { rows, fields } = await pool.query(`SELECT * FROM ${ident(table)}`);
    const typeByName = {};
    for (const f of fields) typeByName[f.name] = f.dataTypeID === 3802 ? 'jsonb' : null;

    perTable.push({ table, count: rows.length });
    totalRows += rows.length;
    dataLines.push(`-- Data for ${table}${rows.length === 0 ? ' (empty)' : ''}`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => literal(row[c], typeByName[c]));
      dataLines.push(
        `INSERT INTO ${ident(table)} (${cols.map(ident).join(',')}) VALUES (${vals.join(',')});`
      );
    }
    dataLines.push('');
  }

  // Explicit ids do not advance a SERIAL sequence, so a restored database would
  // collide on its first INSERT without these. Same failure mode as the bug
  // fixed in 43cf298.
  dataLines.push('-- Advance sequences past the restored ids');
  for (const s of sequences) {
    if (!s.table_name || !s.column_name) continue;
    dataLines.push(
      `SELECT setval(pg_get_serial_sequence('${s.table_name}', '${s.column_name}'), ` +
        `COALESCE((SELECT MAX(${ident(s.column_name)}) FROM ${ident(s.table_name)}), 1), true);`
    );
  }
  dataLines.push('');

  const dataPath = path.join(__dirname, 'pg-data.sql');
  fs.writeFileSync(dataPath, dataLines.join('\n'), 'utf8');

  console.log(`Schema : ${schemaPath} (${ordered.length} tables, ${views.length} views)`);
  console.log(`Data   : ${dataPath} (${totalRows} rows, ${sequences.length} sequences)`);
  console.log('');
  for (const { table, count } of perTable) {
    if (count > 0) console.log(`  ${String(count).padStart(5)}  ${table}`);
  }
  const empty = perTable.filter((t) => t.count === 0).map((t) => t.table);
  if (empty.length) console.log(`\n  empty: ${empty.join(', ')}`);
}

main()
  .catch((err) => {
    console.error('Dump failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
