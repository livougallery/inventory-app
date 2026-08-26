# Products Feature

Feature module untuk **Manajemen Produk, Variasi, dan BOM (Bill of Materials)**.

## Scope

Fitur ini mencakup:
- Master data produk & variasi
- BOM (Bill of Materials) - resep produksi
- Inventory tracking produk

## Struktur Folder

```
features/products/
├── backend/
│   ├── routes.js      # Express route handlers
│   ├── controllers.js # Business logic layer
│   └── models.js      # Database models
├── frontend/
│   ├── components/    # React components
│   └── views.ejs      # EJS templates (if needed)
├── tests/
│   └── index.test.js  # Unit/integration tests
└── README.md          # This file
```

## Routes

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/produk` | List products | Display product list |
| POST | `/produk` | Create product | Add new product |
| POST | `/produk/update` | Update product | Edit product |
| POST | `/produk/delete` | Delete product | Remove product |
| GET | `/produk/:id/varian` | List variants | Product variants |
| POST | `/produk/varian` | Add variant | Add product variant |
| GET | `/produk/:id/bom` | View BOM | Material requirements |
| POST | `/produk/bom` | Add BOM item | Add material to recipe |

## Database Tables

### `products`
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  kode_produk VARCHAR(50),
  nama_produk VARCHAR(255),
  satuan VARCHAR(50),
  stok INTEGER DEFAULT 0,
  harga_beli DECIMAL(15,2),
  harga_jual DECIMAL(15,2),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### `variants`
```sql
CREATE TABLE variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  kode_varian VARCHAR(50),
  nama_varian VARCHAR(255),
  satuan VARCHAR(50),
  stok INTEGER DEFAULT 0,
  harga_beli DECIMAL(15,2),
  harga_jual DECIMAL(15,2),
  created_at TIMESTAMP
);
```

### `bom_items` (Bill of Materials)
```sql
CREATE TABLE bom_items (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  material_id INTEGER REFERENCES raw_materials(id),
  qty_required DECIMAL(15,3),
  created_at TIMESTAMP
);
```

## Features

### Product Management
- CRUD operations for products
- Multiple variants per product
- Stock tracking at product and variant level

### BOM / Recipe Management
- Define materials needed per product
- Specify quantity required
- Support for multi-level BOM (nested)

### Stock Tracking
- Real-time inventory updates
- Integration with production batches
- Automatic deduction on production

## Future Enhancements

- [ ] Variant combination builder
- [ ] BOM versioning/history
- [ ] Cost calculation based on current material prices
- [ ] Product category/folder organization
- [ ] Barcode/scanner integration
