# How to Test All React Pages

## Server Setup

```bash
npm start
```

Server akan running di **http://localhost:3000**

---

## Manual Testing URL List

Buka browser (Chrome/Edge/Firefox) dan test setiap URL ini:

### ✅ Main Dashboard
- **URL:** http://localhost:3000/
- **What to see:** Dashboard dengan 6 stat cards
- **Expected:** Stats cards showing Total Products, Active Vendors, dll

### ✅ Master Data (Unified Table)
- **URL:** http://localhost:3000/cek-data
- **What to see:** Single table showing ALL items (materials + products + components)
- **Features to test:**
  - Filter dropdown: "All Types" / "Raw Materials" / "Products" / "Components"
  - Search box: Type "Rowe", "Kain", atau "FP20703"
  - Status badges: Green = In Stock, Orange = Low Stock, Red = Out of Stock

### ✅ Bill of Materials
- **URL:** http://localhost:3000/bom
- **What to see:** Recipe relationships between products and materials
- **Features to test:**
  - Product grouping (FP20703 shows all its components)
  - Quantity per unit display (1.5 Yard, 1 Roll, etc.)
  - Add Component button opens dialog form

### ✅ Vendor Management
- **URL:** http://localhost:3000/vendors
- **What to see:** Vendor list with search and CRUD actions
- **Features to test:**
  - Edit/Delete buttons work
  - Status badges (Active/Inactive)
  - Search by vendor name

### ✅ Products Catalog
- **URL:** http://localhost:3000/products
- **What to see:** Product grid/table with variant tabs
- **Features to test:**
  - Tab switch: "Produk" vs "Varian"
  - Stock level warnings
  - Category badges

### ✅ Raw Materials
- **URL:** http://localhost:3000/raw-materials
- **What to see:** Material inventory with stock tracking
- **Features to test:**
  - Low stock alerts (orange/red highlight)
  - Unit price display
  - Supplier information

### ✅ Purchase Orders
- **URL:** http://localhost:3000/purchase-orders
- **What to see:** PO workflow management
- **Features to test:**
  - Status filter dropdown (Pending/Approved/Processing/etc.)
  - Create PO dialog
  - Color-coded status badges

### ✅ Production Batches (Kanban)
- **URL:** http://localhost:3000/production-batches
- **What to see:** Kanban board view
- **Features to test:**
  - Tab switch: "Kanban Board" vs "List View"
  - Progress bars on each batch card
  - Create Batch dialog

### ✅ HPP & Reports
- **URL:** http://localhost:3000/hpp
- **What to see:** Cost calculation records
- **Features to test:**
  - Calculate HPP modal
  - Import/Export buttons
  - Average HPP stat card

---

## Quick Troubleshooting

If pages show "Cannot GET" or blank screen:

1. **Check if server is running:**
   ```bash
   curl http://localhost:3000/ | head -1
   ```
   Should return HTML content, not error

2. **Restart server:**
   ```bash
   pkill -f "node index.js"
   sleep 1
   npm start
   ```

3. **Clear browser cache:**
   - Chrome/Edge: `Ctrl+Shift+R` (hard refresh)
   - Or open in Incognito/Private mode

4. **Check console errors:**
   - Press `F12` → Console tab
   - Look for any red errors

---

## Expected Behavior

✅ All pages should load within 2 seconds  
✅ No JavaScript errors in browser console  
✅ Responsive design works (try resizing window)  
✅ Navigation sidebar highlights current page  
✅ Dialog forms open/close correctly  

---

## Next Steps After Testing

1. If all pages working: Ready for integration with real backend API
2. If issues found: Report specific URL + error message + screenshot

---

**GOOD LUCK TESTING!** 🚀
