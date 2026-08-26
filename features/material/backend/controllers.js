// Material Controller
// Business logic untuk material master data dan pembelian

const db = require('../../db');

class MaterialController {
  // ==================== MATERIAL MASTER DATA ====================

  static async getMaterials() {
    const result = await db.query(`
      SELECT
        id,
        kode_material,
        nama_material,
        satuan,
        stok,
        harga_beli_rata_rata,
        created_at,
        updated_at
      FROM raw_materials
      ORDER BY nama_material
    `);
    return result.rows;
  }

  static async createMaterial(data) {
    const result = await db.query(`
      INSERT INTO raw_materials (kode_material, nama_material, satuan)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [data.kode_material, data.nama_material, data.satuan]);
    return result.rows[0];
  }

  static async updateMaterial(id, data) {
    const result = await db.query(`
      UPDATE raw_materials
      SET
        kode_material = $1,
        nama_material = $2,
        satuan = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [data.kode_material, data.nama_material, data.satuan, id]);
    return result.rows[0];
  }

  static async deleteMaterial(id) {
    await db.query(`DELETE FROM raw_materials WHERE id = $1`, [id]);
    return true;
  }

  static async getMaterialById(id) {
    const result = await db.query(
      'SELECT * FROM raw_materials WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  // ==================== PEMBELIAN MATERIAL ====================

  static async getPurchaseHistory() {
    const result = await db.query(`
      SELECT
        p.id,
        p.tanggal,
        p.supplier,
        p.total_harga,
        p.status,
        p.catatan,
        COUNT(i.id) as jumlah_item
      FROM material_purchases p
      LEFT JOIN material_purchase_items i ON p.id = i.purchase_id
      GROUP BY p.id
      ORDER BY p.tanggal DESC
    `);
    return result.rows;
  }

  static async createPurchase(data) {
    const result = await db.query(`
      INSERT INTO material_purchases (tanggal, supplier, total_harga, status, catatan)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [data.tanggal, data.supplier, data.total_harga, data.status, data.catatan]);
    return result.rows[0];
  }

  static async updatePurchase(id, data) {
    const result = await db.query(`
      UPDATE material_purchases
      SET
        tanggal = $1,
        supplier = $2,
        total_harga = $3,
        status = $4,
        catatan = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [
      data.tanggal,
      data.supplier,
      data.total_harga,
      data.status,
      data.catatan,
      id
    ]);
    return result.rows[0];
  }

  static async deletePurchase(id) {
    await db.query('DELETE FROM material_purchases WHERE id = $1', [id]);
    // Also delete related items
    await db.query('DELETE FROM material_purchase_items WHERE purchase_id = $1', [id]);
    return true;
  }
}

module.exports = MaterialController;
