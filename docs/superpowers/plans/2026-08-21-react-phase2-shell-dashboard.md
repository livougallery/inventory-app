# React Migration Phase 2 — Shell & Dashboard (shadcn-first) Implementation Plan

> **Goal:** Implementasi React shell layout + dashboard page sebagai bukti konsep migrasi pertama yang fully working

## Architecture Overview

```
Backend: Express + Supabase (unchanged)
        ├── Session + CSRF auth (existing)
        └── JSON API endpoints (/api/*)

Frontend: Vite+React SPA
         ├── Shell Layout (sidebar + top bar)
         ├── Dashboard Page (data visualization)
         └── React Router for navigation
```

## Tech Stack (Existing from Phase 1)

✅ **Already Installed:**
- Vite + React + TypeScript
- Shadcn UI components (initialized)
- Tailwind CSS v4 + Geist font
- Lucide icons
- React Router v7

⚠️ **Need to Add for Phase 2:**
- `@radix-ui/react-dialog` - Modals
- `@radix-ui/react-dropdown-menu` - Dropdowns  
- `@radix-ui/react-separator` - Dividers
- `class-variance-authority` - Already in deps
- `clsx` - Already in deps
- `tailwind-merge` - Already in deps

## Phase 2 Scope

### ✅ What's NOT Included:
- Backend changes (all data via existing JSON API or direct EJS fallback)
- Database schema changes
- Authentication flow changes (uses existing session)
- Role-based access control (handled by backend routes)

### ✅ What WILL Be Implemented:

1. **React Shell Component** (`components/Shell.tsx`)
   - Sidebar navigation matching original layout
   - Top bar with user profile dropdown
   - Responsive mobile menu toggle
   - Active route highlighting

2. **Dashboard Page** (`pages/Dashboard.tsx`)
   - Replicate main dashboard metrics/stats
   - Data fetched from existing backend queries
   - Cards/StatTile components for key metrics

3. **Integration Layer** (`lib/api.ts`)
   - API client functions wrapping `/api/*` endpoints
   - Query parameters handling
   - Error boundary setup

## Implementation Steps

### Step 1: Install Additional Shadcn Components
```bash
cd frontend && npx shadcn@latest add dialog dropdown-menu separator avatar breadcrumb table card
npm install @tanstack/react-query  # For data fetching/cacheing
```

### Step 2: Create Shell Component Structure
```typescript
// components/Shell.tsx
export function Shell({ children }: { children: React.ReactNode }) {
  // Main layout wrapper with sidebar + content area
}
```

### Step 3: Build Dashboard Page
```typescript
// pages/Dashboard.tsx
export default function Dashboard() {
  // Replicate original dashboard view with React components
}
```

### Step 4: Update App Routes
```typescript
// src/App.tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<ProtectedShell><Dashboard /></ProtectedShell>} />
</Routes>
```

### Step 5: Toggle Route in Express
Update `index.js`:
```javascript
const MIGRATED = new Set(['/login', '/']); // Root -> dashboard
app.use((req, res, next) => {
  if (MIGRATED.has(req.path)) {
    return res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
  }
  next();
});
```

### Step 6: Testing & Verification
- [ ] Manual testing in browser
- [ ] Verify all navigation links work
- [ ] Check responsive behavior on mobile
- [ ] Confirm data loads correctly

## Success Criteria

✅ All shell components render without errors
✅ Dashboard displays correct metrics from database
✅ Navigation works between pages
✅ Mobile responsive design functioning
✅ No console errors in browser dev tools

## Files to Create/Modify

**New Files:**
- `frontend/src/components/Shell.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/queryClient.ts`
- `frontend/src/hooks/useAuth.ts`

**Modified Files:**
- `frontend/src/App.tsx` - Add dashboard route
- `index.js` - Add `/` to MIGRATED set
- `frontend/package.json` - Add TanStack Query dependency

## Timeline Estimate

- **Step 1** (Components): 30 mins
- **Step 2** (Shell): 1-2 hours
- **Step 3** (Dashboard): 2-3 hours
- **Step 4-5** (Routing): 30 mins
- **Step 6** (Testing): 1 hour
- **Total**: ~6-8 hours

## Next Phases After This

Phase 3: Vendor Management Page
Phase 4: Product & Raw Materials Pages  
Phase 5: Purchase Orders Module
Phase 6: Production Batch Tracking
Phase 7: HPP Calculation Reports
Phase 8: Final Cleanup & Production Ready

---

*Note: This plan assumes successful completion of Phase 1 foundation.*
