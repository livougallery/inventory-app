const db = require('../db');
const Fifo = require('../services/fifoService');

describe('FifoService.deductFifo', () => {
  let rawMatId;

  beforeEach(async () => {
    // Seed with explicit schema prefix + explicit IDs. The global beforeEach
    // (tests/setup.js) already truncated every table and reset sequences, so
    // inserting id=1, 2, 3 is deterministic.
    await db.query(`INSERT INTO test.vendors (id, nama, tipe) VALUES (1, 'V1', 'bahan_baku')`);
    await db.query(`INSERT INTO test.users (id, username, password) VALUES (1, 'admin', 'x')`);
    await db.query(`INSERT INTO test.raw_materials (id, nama, tipe, satuan, stok) VALUES (1, 'Kain A', 'kain_roll', 'm', 0)`);
    rawMatId = 1;
    // Seed 3 batches at different dates (oldest first by tgl_masuk).
    await db.query(`INSERT INTO test.material_batches (id, raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk) VALUES
      (1, 1, 'po', 100, 10, 10, 100, '2026-01-01'),
      (2, 1, 'po', 101, 10, 10, 110, '2026-02-01'),
      (3, 1, 'po', 102, 10, 10, 120, '2026-03-01')`);
  });

  test('consumes oldest batch first', async () => {
    const used = await Fifo.deductFifo(rawMatId, 15, 'production', 50);
    expect(used).toHaveLength(2);
    expect(parseInt(used[0].batchId)).toBe(1);
    expect(parseFloat(used[0].qty)).toBe(10);
    expect(parseInt(used[1].batchId)).toBe(2);
    expect(parseFloat(used[1].qty)).toBe(5);
    const r = await db.query('SELECT id, qty_sisa FROM test.material_batches ORDER BY id');
    const batches = r.rows;
    expect(parseFloat(batches[0].qty_sisa)).toBe(0);   // batch 1 habis
    expect(parseFloat(batches[1].qty_sisa)).toBe(5);    // batch 2 sisa 5
    expect(parseFloat(batches[2].qty_sisa)).toBe(10);  // batch 3 untouched
  });

  test('throws when stock insufficient', async () => {
    await expect(Fifo.deductFifo(rawMatId, 999, 'production', 50))
      .rejects.toThrow(/Stok tidak cukup/);
  });

  test('getStockForMaterial returns SUM(qty_sisa)', async () => {
    const s = await Fifo.getStockForMaterial(rawMatId);
    expect(parseFloat(s.qty_sisa_total)).toBe(30);
    expect(parseInt(s.batch_count)).toBe(3);
  });
});
