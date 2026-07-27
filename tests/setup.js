/**
 * Test setup: use a dedicated Postgres schema "test" on the same Supabase instance.
 *
 * This file is registered via jest.config.js -> setupFilesAfterEnv, so the Jest
 * globals (beforeAll, beforeEach, afterAll) are available here.
 *
 * Strategy:
 *  - beforeAll: create the "test" schema, bootstrap all tables into it via
 *    db.bootstrapSchema('test'), and pin search_path = test on every pooled
 *    connection so unqualified table names resolve to the test schema.
 *  - beforeEach: TRUNCATE every table in reverse FK order with CASCADE so
 *    sequences reset and cross-table references are cleared.
 *  - afterAll: drop the test schema and close the pool.
 */
require('dotenv').config();
process.env.NODE_ENV = 'test';

const db = require('../db');

// Table list in reverse foreign-key dependency order so that truncating a
// parent table does not violate FK constraints on its children. CASCADE also
// handles the recursive cases, but explicit ordering is clearer and safer.
const TABLES = [
  'delivery_expenses', 'variant_prices', 'product_photos', 'hpp_batch_config',
  'hpp_formula_templates', 'stock_movements', 'material_batches',
  'shipment_invoices', 'shipments', 'purchase_imports', 'hpp_history',
  'production_deliveries', 'production_costs', 'production_batches',
  'purchase_order_photos', 'purchase_order_items', 'purchase_orders',
  'currencies', 'raw_material_variants', 'raw_materials', 'categories',
  'product_variants', 'products', 'vendors', 'users',
];

// Pin search_path = test on every connection the pool hands out. This runs
// once per client (including clients acquired inside db.transaction via
// pool.connect()), guaranteeing unqualified table names resolve to the test
// schema regardless of which pooled connection a query lands on.
db.pool.on('connect', (client) => {
  client.query('SET search_path TO test');
});

beforeAll(async () => {
  // Create a fresh test schema and all tables within it.
  await db.exec('DROP SCHEMA IF EXISTS test CASCADE');
  await db.exec('CREATE SCHEMA test');
  // bootstrapSchema('test') prefixes every CREATE TABLE / INDEX with "test".
  await db.bootstrapSchema('test');
  // Also set search_path for the bootstrap connection itself (already created
  // the schema, but keep it consistent for any ad-hoc queries in beforeAll).
  await db.exec('SET search_path TO test');
});

beforeEach(async () => {
  // Wipe all rows and reset every sequence (RESTART IDENTITY) in reverse FK
  // order. CASCADE clears dependent rows across FK boundaries.
  for (const t of TABLES) {
    await db.query(`TRUNCATE TABLE test.${t} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await db.exec('DROP SCHEMA IF EXISTS test CASCADE');
  await db.close();
});
