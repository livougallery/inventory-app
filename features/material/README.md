# Material Feature

Feature module untuk **Manajemen Material & Pembelian Material**.

## Scope

Fitur ini mencakup:
- Master data material (raw materials)
- Pembelian material (material purchases)

## Struktur Folder

```
features/material/
├── backend/
│   ├── routes.js      # Express route handlers
│   ├── controllers.js # Business logic layer
│   └── models.js      # Database models (optional, future)
├── frontend/
│   ├── components/    # React components (future migration)
│   └── views.ejs      # EJS templates (if needed)
├── tests/
│   └── index.test.js  # Unit/integration tests
└── README.md          # This file
```

## Routes

### Material Master Data
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/cek-data/material` | List all materials | Display material table |
| POST | `/cek-data/material` | Create new material | Add material to DB |
| POST | `/cek-data/material/update` | Update material | Edit existing material |
| POST | `/cek-data/material/delete` | Delete material | Remove material |

### Material Purchases
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/cek-data/pembelian-material` | List purchases | Purchase history |
| POST | `/cek-data/pembelian-material` | Create purchase | Add new purchase |
| POST | `/cek-data/pembelian-material/update` | Update purchase | Edit purchase |
| POST | `/cek-data/pembelian-material/delete` | Delete purchase | Remove purchase |

## Database Tables

### `raw_materials`
```sql
CREATE TABLE raw_materials (
  id SERIAL PRIMARY KEY,
  kode_material VARCHAR(50),
  nama_material VARCHAR(255),
  satuan VARCHAR(50),
  stok INTEGER DEFAULT 0,
  harga_beli_rata_rata DECIMAL(15,2),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### `material_purchases`
```sql
CREATE TABLE material_purchases (
  id SERIAL PRIMARY KEY,
  tanggal DATE,
  supplier VARCHAR(255),
  total_harga DECIMAL(15,2),
  status VARCHAR(50),
  catatan TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### `material_purchase_items`
```sql
CREATE TABLE material_purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES material_purchases(id),
  material_id INTEGER REFERENCES raw_materials(id),
  qty INTEGER,
  price_per_unit DECIMAL(15,2)
);
```

## API Services

File: `backend/controllers.js`

### MaterialController
- `getMaterials()` - Retrieve all materials
- `createMaterial(data)` - Insert new material
- `updateMaterial(id, data)` - Update material by ID
- `deleteMaterial(id)` - Delete material
- `getMaterialById(id)` - Get single material

### PurchaseController
- `getPurchaseHistory()` - List all purchases with item count
- `createPurchase(data)` - Insert new purchase
- `updatePurchase(id, data)` - Update purchase
- `deletePurchase(id)` - Delete purchase and related items

## Development Notes

- Semua CRUD operations menggunakan middleware `requireAuth`
- Redirect ke halaman list setelah create/update/delete
- Error handling di try-catch blocks dengan console.error logging
- SQL injection protection via parameterized queries

## Future Enhancements

- [ ] Batch creation for materials
- [ ] Import from CSV/excel
- [ ] Material stock adjustment
- [ ] Purchase order workflow with approval
- [ ] Vendor rating integration

## Integration

This feature integrates with:
- **Auth**: Requires authentication via `requireAuth` middleware
- **Reports**: Purchase history can be used in financial reports
- **Production**: Materials consumed in production batches
