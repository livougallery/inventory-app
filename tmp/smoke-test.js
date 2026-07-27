/**
 * Smoke-test: end-to-end verification of the Supabase PostgreSQL migration.
 *
 * Run from the project root with Supabase reachability:
 *   node tmp/smoke-test.js
 *
 * Prerequisites:
 *   - .env with a valid DATABASE_URL (password URL-encoded)
 *   - App has been booted at least once (index.js seeds users + currencies)
 *
 * This script CANNOT run in the sandbox (Supabase host unreachable).
 * It is validated by `node --check` only here; the user runs it live.
 */
require('dotenv').config();

const db = require('../db');

let passed = 0;
let failed = 0;
const results = [];

function ok(name, detail) {
  passed++;
  results.push({ status: 'PASS', name, detail });
  console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, err) {
  failed++;
  results.push({ status: 'FAIL', name, detail: err.message });
  console.log(`  [FAIL] ${name} — ${err.message}`);
}

async function assert(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail);
  } catch (err) {
    fail(name, err);
  }
}

async function main() {
  console.log('=== Smoke Test: Supabase PostgreSQL Migration ===\n');

  // Step 1: Bootstrap schema (idempotent — safe to re-run)
  console.log('Step 1: Bootstrap schema (public)');
  await assert('db.bootstrapSchema() completes', async () => {
    await db.bootstrapSchema();
    return 'tables ensured in public schema';
  });

  // Step 2: Seeded admin user exists
  console.log('\nStep 2: Seeded data checks');
  await assert('admin user seeded', async () => {
    const row = await db.one('SELECT id FROM users WHERE username = $1', ['admin']);
    if (!row) throw new Error('admin user not found — run index.js boot first');
    return `id=${row.id}`;
  });

  // Step 3: Currencies seeded (3 rows)
  await assert('currencies seeded (3 rows)', async () => {
    const row = await db.one('SELECT COUNT(*)::int AS c FROM currencies');
    const count = parseInt(row.c, 10);
    if (count !== 3) throw new Error(`expected 3 currencies, got ${count}`);
    return `count=${count}`;
  });

  // Step 4: Round-trip via temporary test_smoke table
  console.log('\nStep 3: Round-trip INSERT/SELECT (test_smoke)');
  await assert('test_smoke round-trip', async () => {
    await db.exec('DROP TABLE IF EXISTS test_smoke');
    await db.exec('CREATE TEMP TABLE test_smoke (id SERIAL PRIMARY KEY, val TEXT NOT NULL)');
    const ins = await db.run('INSERT INTO test_smoke (val) VALUES ($1) RETURNING id', ['x']);
    const id = ins.returningId;
    if (!id) throw new Error('INSERT did not return id');
    const row = await db.one('SELECT val FROM test_smoke WHERE id = $1', [id]);
    if (row.val !== 'x') throw new Error(`expected val="x", got "${row.val}"`);
    return `inserted id=${id}, read back val="${row.val}"`;
  });

  // Step 5: Transaction atomicity
  console.log('\nStep 4: Transaction (commit + rollback)');
  await assert('transaction commits atomically', async () => {
    await db.exec('DROP TABLE IF EXISTS test_tx');
    await db.exec('CREATE TEMP TABLE test_tx (id SERIAL PRIMARY KEY, val TEXT NOT NULL)');
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO test_tx (val) VALUES ($1) RETURNING id', ['a']);
      await tx.query('SELECT COUNT(*)::int AS c FROM test_tx');
    });
    const row = await db.one('SELECT COUNT(*)::int AS c FROM test_tx');
    const count = parseInt(row.c, 10);
    if (count !== 1) throw new Error(`expected 1 row after commit, got ${count}`);
    return `rows after commit=${count}`;
  });

  await assert('transaction rolls back on error', async () => {
    await db.exec('DROP TABLE IF EXISTS test_tx2');
    await db.exec('CREATE TEMP TABLE test_tx2 (id SERIAL PRIMARY KEY, val TEXT NOT NULL)');
    let threw = false;
    try {
      await db.transaction(async (tx) => {
        await tx.run('INSERT INTO test_tx2 (val) VALUES ($1) RETURNING id', ['b']);
        throw new Error('intentional rollback');
      });
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new Error('transaction did not throw');
    const row = await db.one('SELECT COUNT(*)::int AS c FROM test_tx2');
    const count = parseInt(row.c, 10);
    if (count !== 0) throw new Error(`expected 0 rows after rollback, got ${count}`);
    return `rows after rollback=${count}`;
  });

  // Step 6: Cleanup
  console.log('\nStep 5: Cleanup');
  await assert('cleanup drops temp tables', async () => {
    await db.exec('DROP TABLE IF EXISTS test_smoke');
    await db.exec('DROP TABLE IF EXISTS test_tx');
    await db.exec('DROP TABLE IF EXISTS test_tx2');
    return 'temp tables dropped';
  });

  await db.close();

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\nFAILED tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.detail}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL TESTS PASSED');
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error('Fatal error:', err.message);
  try { await db.close(); } catch (e) { /* ignore */ }
  process.exit(1);
});
