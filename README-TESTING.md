# Testing Guide - React SPA Pages

## ⚠️ PENTING: Restart Server (PowerShell)

**JANGAN pakai `pkill` di Windows!** Pakai script PowerShell ini:

### Cara 1: Pakai Script
```powershell
cd C:\Users\livou\inventory-app
.\restart-server.ps1
```

### Cara 2: Manual Step by Step
```powershell
# Stop semua process node
Get-Process -Name "node" | Stop-Process -Force

# Wait sebentar
Start-Sleep -Seconds 2

# Start server baru
npm start
```

---

## ✅ Halaman yang Sudah Siap

Semua halaman React SPA sudah berfungsi! Buka browser dan akses:

| No | URL | Halaman | Status |
|----|-----|---------|--------|
| 1 | http://localhost:3000/ | Dashboard | ✅ READY |
| 2 | http://localhost:3000/cek-data | **Master Data** | ✅ READY - Unified table |
| 3 | http://localhost:3000/bom | Bill of Materials | ✅ READY - Recipes |
| 4 | http://localhost:3000/vendors | Vendor Management | ✅ READY |
| 5 | http://localhost:3000/products | Products Catalog | ✅ READY |
| 6 | http://localhost:3000/raw-materials | Raw Materials | ✅ READY |
| 7 | http://localhost:3000/purchase-orders | Purchase Orders | ✅ READY |
| 8 | http://localhost:3000/production-batches | Production Batches | ✅ READY - Kanban |
| 9 | http://localhost:3000/hpp | HPP & Reports | ✅ READY |

---

## 🐛 Troubleshooting: Hanya Beberapa Halaman Muncul

Jika hanya beberapa halaman muncul (misal Production & Materials), kemungkinan penyebab:

### Penyebab 1: Browser Cache
**Solusi:** Hard refresh
```
Ctrl + Shift + R   (Windows)
Cmd + Shift + R    (Mac)
```
Atau buka di Incognito/Private window

### Penyebab 2: Server Belum Restart Properly
**Solusi:** 
```powershell
# Stop server lama
Get-Process node | Where-Object {$_.Path -like "*inventory-app*"} | Stop-Process -Force

# Tunggu 2 detik
Start-Sleep -Seconds 2

# Start server baru
npm start
```

### Penyebab 3: Route Conflict dengan EJS
**Solusi:** Pastikan SPA middleware berjalan sebelum EJS routes (sudah fixed di code)

---

## 🔍 Test Each Page Manually

### 1. Master Data (`/cek-data`)
**Features to test:**
- Filter dropdown: All Types / Raw Materials / Products / Components
- Search box: Try searching "Rowe", "Kain", "FP20703"
- Status badges: Green (In Stock), Orange (Low Stock), Red (Out of Stock)

**Expected:** Single table showing ALL items (materials + products + components)

---

### 2. Bill of Materials (`/bom`)
**Features to test:**
- Product grouping (FP20703 should show all its components: Kain, Label, Benang)
- Quantity per unit (1.5 Yard, 1 Roll, etc.)
- Add Component button → Dialog opens

**Expected:** Recipe relationships displayed clearly

---

### 3. Production Batches (`/production-batches`)
**Features to test:**
- Tab switch: "Kanban Board" vs "List View"
- Progress bars on each batch card
- Create Batch dialog

**Expected:** Visual kanban with 3 columns (Planned / In Progress / Completed)

---

## 📊 Expected Results

✅ **All pages load within 2 seconds**  
✅ **No JavaScript errors in Console (F12)**  
✅ **Responsive design works (resize browser window)**  
✅ **Sidebar navigation highlights current page**  
✅ **Dialog forms open/close correctly**  

---

## 🎯 Quick Test Commands

```powershell
# Test if server running
curl http://localhost:3000/ | Select-Object -First 1

# Test specific route
curl http://localhost:3000/cek-data | Select-String "Master Data"

# Check if port listening
netstat -an | Select-String ":3000.*LISTENING"
```

---

## 🔄 Next Steps After Testing

1. **If all pages work** → Ready for API integration
2. **If specific pages fail** → Note URL + error message for debugging
3. **If styling issues** → Clear cache + hard refresh

---

**GOOD LUCK TESTING!** 🚀

For questions or issues, check:
- Browser Console (F12)
- Server terminal output
- This README file
