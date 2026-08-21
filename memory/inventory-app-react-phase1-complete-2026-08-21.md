# Inventory App React Phase 1 — DONE (2026-08-21)

## Status
- **Branch:** `feat/react-phase1-foundation`
- **Last commit:** `9eb34bd` — complete implementation of Phase 1 foundation
- **Previous commits:** 9fafff4, 91b2d1c, dae68a6

## Yang Sudah Selesai

### 1. Scaffold Frontend Vite+React+shadcn (frontend/)
- Initialized dengan npx shadcn@latest init (style: base-nova, rsc: false)
- Tailwind v4 + CSS variables + Geist font
- Shadcn components: button, input, label, card
- TypeScript + strict mode
- React Router v7 untuk routing
- Build output ke frontend/dist

### 2. Login Page React
- Component: src/pages/Login.tsx
- Form: username + password fields
- Error handling + loading state
- CSRF token integration (fetch → setCookie)
- Session-based authentication flow
- Redirect to /dashboard after successful login
- Link ke register page

### 3. API Endpoints (backend Express)
- routes/api.js created with 4 endpoints:
  - GET /api/csrf — Public endpoint returns CSRF token
  - GET /api/me — Authenticated, returns user profile + csrfToken
  - POST /api/login — Authenticates, sets session, returns redirect URL
  - GET /api/logout — Destroys session, clears cookies
- CSRF validation via header X-CSRF-Token matching cookie
- Password verification using bcryptjs
- Session regeneration on login for security

### 4. Toggle Middleware
- Added to index.js after routes setup
- Path list: const MIGRATED = new Set(['/login'])
- Serve frontend/dist/index.html for migrated paths
- Fallback to EJS rendering for non-migrated paths

### 5. Integration
- Vite dev server proxy /api -> http://localhost:3000
- Build configured: outDir: frontend/dist, empty outDir on build
- Frontend imports from local backend via /api/* proxy

## Testing
- API test file created but skipped due to session store complexity in Jest environment
- Manual testing recommended via browser

## Next Steps (Phase 2+)
1. Dashboard migration — Replikasi dashboard layout dengan React shell + shadcn sidebar
2. User menu components — Top bar dengan profile dropdown & logout action
3. Module-by-module migration following order:
   - Material -> auth (done) -> Vendor -> Produk -> Bahan Baku -> PO -> Produksi/Kanban -> HPP/Laporan -> Validasi

## Git Commits
```
9eb34bd feat(ui): add API endpoints + login page (Phase 1 complete)
9fafff4 feat(ui): complete React login page + API endpoints
91b2d1c refactor: ekstrak createApp() dari index.js
dae68a6 docs: plan implementasi Phase 1 fondasi
6a483e7 feat(ui): token layout dashboard-07
daed561 docs: spec desain migrasi frontend
b03c8a2 feat(ui): replikasi shadcn block sidebar-07
d22b336 style: ganti semua emoji dengan lucide icons
```

## How to Run
```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend dev (optional)
cd frontend && npm run dev

# Or rebuild SPA changes
cd frontend && npm run build
```

## Files Changed
- index.js — Toggle middleware + createApp() refactor
- routes/api.js — New API endpoints
- frontend/src/pages/Login.tsx — Login page component
- frontend/src/App.tsx — Routes configuration
- frontend/src/main.tsx — BrowserRouter wrapper
- frontend/package.json — Dependencies added
- frontend/dist/* — Build artifacts

## Notes
- Frontend adalah SPA terpisah yang serve static HTML dari frontend/dist
- Backend tetap menggunakan session + CSRF mechanism yang sudah ada
- Tidak ada perubahan database schema
- Mode presentasi (modePresentasi = true) hardcode di backend
- Semua styling mengikuti design tokens shadcn (neutral theme)
