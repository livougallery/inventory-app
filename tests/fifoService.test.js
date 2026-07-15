const db = require('../db');
const Fifo = require('../services/fifoService');

describe('FifoService.deductFifo', () => {
  let rawMatId;

  beforeEach(() => {
    // Reset: drop & recreate tables for isolation
    db.exec('DELETE FROM stock_movements; DELETE FROM material_batches; DELETE FROM raw_materials; DELETE FROM users; DELETE FROM vendors;');
    db.exec(`INSERT INTO vendors (id, nama, tipe) VALUES (1, 'V1', 'bahan_baku')`);
    db.exec(`INSERT INTO users (id, username, password) VALUES (1, 'admin', 'x')`);
    db.exec(`INSERT INTO raw_materials (id, nama, tipe, satuan, stok) VALUES (1, 'Kain A', 'kain_roll', 'm', 0)`);
    rawMatId = 1;
    // Seed 3 batches at different dates
    db.exec(`INSERT INTO material_batches (id, raw_material_id, source_type, source_id, qty_awal, qty_sisa, harga_satuan, tgl_masuk) VALUES
      (1, 1, 'po', 100, 10, 10, 100, '2026-01-01'),
      (2, 1, 'po', 101, 10, 10, 110, '2026-02-01'),
      (3, 1, 'po', 102, 10, 10, 120, '2026-03-01')`);
  });

  test('consumes oldest batch first', () => {
    const used = Fifo.deductFifo(rawMatId, 15, 'production', 50);
    expect(used).toHaveLength(2);
    expect(used[0].batchId).toBe(1);
    expect(used[0].qty).toBe(10);
    expect(used[1].batchId).toBe(2);
    expect(used[1].qty).toBe(5);
    const batches = db.prepare('SELECT id, qty_sisa FROM material_batches ORDER BY id').all();
    expect(batches[0].qty_sisa).toBe(0);   // batch 1 habis
    expect(batches[1].qty_sisa).toBe(5);    // batch 2 sisa 5
    expect(batches[2].qty_sisa).toBe(10);   // batch 3 untouched
  });

  test('throws when stock insufficient', () => {
    expect(() => Fifo.deductFifo(rawMatId, 999, 'production', 50))
      .toThrow(/Stok tidak cukup/);
  });

  test('getStockForMaterial returns SUM(qty_sisa)', () => {
    const s = Fifo.getStockForMaterial(rawMatId);
    expect(s.qty_sisa_total).toBe(30);
    expect(s.batch_count).toBe(3);
  });
});