# Inventory App - Complete Directory Structure

## Overview

Inventory App menggunakan **feature-based architecture** dimana setiap fitur/master data punya folder lengkap yang contain semua komponen terkait. Ini memudahkan:
- **Maintenance**: Temukan & edit file dalam 1 tempat
- **Merge**: Branch worktree rapi saat gabung dengan web divisi lain
- **Scalability**: Mudah tambah fitur baru tanpa konflik

---

## Root Directory

```
inventory-app/
├── features/           # 🎯 FEATURE FOLDERS - Setiap fitur ada di sini
│   ├── material/       # Material & Purchase Materials
│   ├── products/       # Products, Variants, BOM
│   ├── vendors/        # Vendor/Supplier management
│   ├── purchase-orders/ # PO Transactions
│   ├── production/     # Production batches
│   ├── currencies/     # Currency management
│   └── hpp/            # Cost calculation (HPP)
├── public/             # Static assets (CSS, JS, images)
├── views/              # 📄 Server-rendered EJS templates
│   ├── cek-data/       # Master data views
│   ├── error.ejs       # Error layout
│   └── layout.ejs      # Main layout template
├── routes/             # 🔧 Express route modules
│   ├── api.js          # API endpoints
│   ├── auth.js         # Authentication routes
│   ├── currencies.js   # Currency routes
│   ├── dashboard.js    # Dashboard routes
│   ├── hpp.js          # HPP calculation routes
│   ├── production-batches.js
│   ├── products.js
│   ├── purchase-imports.js
│   ├── purchase-orders.js
│   ├── raw-materials.js
│   ├── reports.js
│   ├── validation.js
│   └── vendors.js
├── services/           # 💼 Business logic services
│   ├── inventoryService.js
│   └── ...
├── middleware/         # ⚙️ Express middleware
│   └── csrfProtection.js
├── tmp/                # 🗂️ Temporary files (backups, dumps)
│   └── dump-postgres.js
├── tests/              # 🧪 Test suite
├── scripts/            # 🛠️ Utility scripts
├── data/               # 💾 Local database cache (not source of truth)
├── docs/               # 📚 Documentation
│   ├── STRUCTURE.md    # This file
│   ├── REORGANIZATION-PLAN.md
│   └── specs/          # Feature specifications
├── .env                # Environment variables (gitignored)
├── package.json
├── index.js            # Entry point
└── README.md
```

---

## Feature Structure Detail

Setiap feature folder punya struktur konsisten:

```
features/<feature-name>/
├── backend/
│   ├── routes.js       # Express router configuration
│   ├── controllers.js  # Request handlers / business logic
│   └── models.js       # Database query helpers (optional)
├── frontend/
│   ├── components/     # React components (.tsx/.jsx)
│   │   ├── List.tsx
│   │   ├── Form.tsx
│   │   └── Table.tsx
│   └── hooks/          # Custom React hooks
├── tests/
│   └── index.test.js   # Jest/Mocha tests for this feature
├── migrations/         # Database migrations for this feature (if any)
└── README.md           # Feature-specific documentation
```

---

## Mapping: Old → New Location

### Material Feature
| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| Routes | `/routes/raw-materials.js` | `/features/material/backend/routes.js` | ✅ Created |
| Controllers | N/A | `/features/material/backend/controllers.js` | ✅ Created |
| Views | `/views/cek-data/material.ejs` | Stay in `views/` (server-rendered) | Keep as-is |
| Documentation | N/A | `/features/material/README.md` | ✅ Created |

### Products Feature
| File | Old Location | New Location | Plan |
|------|--------------|--------------|------|
| Routes | `/routes/products.js` | Move to feature | Next |
| Controllers | N/A | Create new | Next |
| Views | `/views/products/` | Stay in `views/` | Keep as-is |

### Purchase Orders
| File | Old Location | New Location | Plan |
|------|--------------|--------------|------|
| Routes | `/routes/purchase-orders.js` | Move to feature | Next |
| Views | `/views/purchase-orders/` | Stay in `views/` | Keep as-is |

### Production Batches
| File | Old Location | New Location | Plan |
|------|--------------|--------------|------|
| Routes | `/routes/production-batches.js` | Move to feature | Next |
| Kanban UI | `/frontend/src/views/production-batches/` | Frontend only | Already organized |

---

## Development Workflow

### Adding a New Feature

1. Create folder structure:
```bash
mkdir -p features/new-feature/backend
mkdir -p features/new-feature/frontend/components
mkdir -p features/new-feature/tests
```

2. Create boilerplate files:
```bash
touch features/new-feature/backend/routes.js
touch features/new-feature/backend/controllers.js
touch features/new-feature/README.md
```

3. Update main app (`index.js`) to import the feature routes:
```javascript
const newFeatureRoutes = require('./features/new-feature/backend/routes');
app.use('/', newFeatureRoutes);
```

4. Document in `features/new-feature/README.md`

5. Add test coverage in `features/new-feature/tests/index.test.js`

### Working on Existing Features

1. Navigate to feature folder:
```bash
cd features/material
```

2. Make changes to backend or frontend files

3. Test the feature:
```bash
npm start
# Then visit http://localhost:3000/cek-data/material
```

4. Run tests if available:
```bash
npm test
```

---

## Git Workflow Recommendations

### For Clean Worktrees

**Recommended branch naming:**
```
feature/material-crud-enhancement
feature/product-variants-ui
feature/purchase-order-workflow
bugfix/hpp-calculation-error
chore/refactor-material-service
```

**Commit message convention:**
```
feat(material): add bulk upload from CSV
feat(products): implement variant builder
fix(hpp): correct rounding in cost calculation
docs(material): update API documentation
refactor(production): simplify batch creation logic
```

**When creating worktree:**
```bash
# Create isolated worktree for specific feature
git worktree add ../worktrees/material-feature -b feature/material-worktree

# Or use Claude Code worktree command
/worktree --project=inventory-app --branch=feature/material-crud
```

---

## Merge Strategy with Web Divisi Lain

Ketika merge dengan web divisi lain (misalnya Finance, HR, Sales):

### Pre-Merge Checklist

1. **Structure Alignment** ✅
   - Semua web divisi pakai struktur sama: `features/`
   - Routing pattern konsisten

2. **Code Organization**
   - Setiap fitur punya dokumentasi lengkap
   - Tests untuk critical paths
   - Clear ownership per feature

3. **Database Schema**
   - Use namespaces or prefixes: `inventory_`, `finance_`, `hr_`
   - Separate schemas per domain

4. **API Contracts**
   - Shared API gateway pattern
   - RESTful conventions consistent across domains

### Merge Steps

1. Create `apps/` monorepo structure:
```
apps/
├── inventory/
│   └── [current structure]
├── finance/
├── hr/
├── sales/
shared/
├── components/     # Shared UI components
├── lib/            # Common utilities
└── types/          # TypeScript shared types
```

2. Each divisi maintains its own branch in same repo

3. Daily sync via pull requests

4. CI/CD pipeline for automated testing on each branch

---

## Benefits Summary

✅ **Find Files Fast** - Material CRUD? All in `features/material/`  
✅ **Clean Branches** - Git worktree hanya touch relevant files  
✅ **Easy Merge** - Structure predictable when combining with other divisi  
✅ **Team Collaboration** - Assign different developers per feature folder  
✅ **Reduced Conflicts** - Less code overlap between teams  
✅ **Maintainable** - Clear boundaries and responsibilities  

---

## Migration Progress

### Completed ✅
- [x] Material feature structure created
- [x] Controllers extracted
- [x] README documentation written

### In Progress 🔄
- [ ] Products feature migration
- [ ] Purchase orders migration
- [ ] Production batches migration

### Pending ⏳
- [ ] Vendors feature migration
- [ ] Currencies feature migration
- [ ] HPP feature migration
- [ ] Reports feature migration
- [ ] Validation feature migration
- [ ] Remove old routes files after migration
