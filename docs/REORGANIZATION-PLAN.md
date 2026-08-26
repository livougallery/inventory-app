# Inventory App Reorganization Plan

## Problem Statement

Saat ini struktur folder inventory-app tercampur antara:
- **Routes** (backend) di `/routes/`
- **Views/EJS** (templates) di `/views/`
- **React Frontend** di `/frontend/src/views/`
- **Services/API** di `/services/` dan `/middleware/`

Ini akan menyebabkan kebingungan saat merge dengan web divisi lain karena:
1. File-file untuk satu fitur tersebar di beberapa folder
2. Branch worktree jadi tidak rapi
3. Sulit locate file saat troubleshooting atau enhancement

## Solution: Feature-Based Structure

Setiap fitur/master data akan punya **1 folder lengkap** yang berisi semua komponen terkait:
```
features/<feature-name>/
├── backend/
│   ├── routes.js          # Route handlers
│   ├── services.js        # Business logic / database operations
│   └── controllers.js     # Controller functions
├── frontend/
│   ├── component.tsx      # React components
│   └── views.ejs          # EJS templates (jika ada server-rendered)
├── tests/
│   └── index.test.js      # Tests khusus fitur ini
└── README.md              # Dokumentasi fitur
```

## Current Features Mapping

### 1. Material Management (Master Data - MATERIAL)
- Backend: `/routes/cek-data.js`, `/routes/raw-materials.js`
- Views: `/views/cek-data/material.ejs`, `pembelian-material.ejs`, `_table.ejs`
- Tables: `raw_materials`, `material_purchases`

### 2. Product Management (Master Data - PRODUK)
- Backend: `/routes/products.js`
- Tables: `products`, `variants`, `bom_items`

### 3. Vendor/Supplier Management (Master Data - VENDOR)
- Backend: `/routes/vendors.js`
- Tables: `vendors`

### 4. Purchase Orders (Transaksi - PO)
- Backend: `/routes/purchase-orders.js`
- Tables: `purchase_orders`, `purchase_order_items`

### 5. Production Batches (Transaksi - PRODUKSI)
- Backend: `/routes/production-batches.js`
- Tables: `production_batches`, `production_batch_variants`

### 6. Currency Management
- Backend: `/routes/currencies.js`
- Tables: `currencies`

### 7. HPP Calculation
- Backend: `/routes/hpp.js`
- Tables: `hpp_view` (computed view)

### 8. Reports & Validation
- Backend: `/routes/reports.js`, `/routes/validation.js`

## Reorganization Steps

### Phase 1: Create Feature Folders
1. Create `/features/material/` folder
2. Move all material-related files into it
3. Update imports/references

### Phase 2: Create Transaksi Folders
4. Create `/features/purchase-orders/` folder
5. Create `/features/production/` folder
6. Consolidate related files

### Phase 3: Cleanup Root Directory
7. Remove redundant files from root
8. Update main app initialization
9. Update documentation

## Benefits

✅ **Branch Worktree Rapi** - setiap branch fokus pada 1 fitur
✅ **Easy to Merge** - struktur konsisten dengan web divisi lain
✅ **Find Files Fast** - semua file dalam 1 folder per fitur
✅ **Clear Ownership** - bisa assign 1 developer per feature folder
✅ **Scalable** - mudah tambah fitur baru tanpa merusak struktur

## Migration Command Strategy

Untuk minim conflicts:
1. Gunakan `git mv` untuk rename/move
2. Commit tiap step kecil
3. Test setelah setiap major move
4. Keep backward compatibility refs if needed

## Rollback Plan

Jika ada masalah:
1. Git reset ke commit sebelum reorg
2. Manual restore dari git history
3. Restart reorg dengan approach lebih conservative
