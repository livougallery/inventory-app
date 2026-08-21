# Inventory App - React Phase 3: Core Pages Migration

**Date:** 2026-08-21  
**Status:** Planning phase for vendor/product/raw material pages  

---

## Phase 2 Summary

Phase 2 successfully established:
- ✅ Shell layout with sidebar navigation
- ✅ Dashboard page with stat cards
- ✅ Shadcn UI component library
- ✅ Production build pipeline
- ✅ Express route serving SPA at `/` and `/login`

---

## Phase 3 Goals

Migrate three core EJS pages to React:

### 1. Vendor Management (`/vendors`)
**Current EJS structure:**
- Table listing all vendors
- Search/filter functionality
- Add/Edit/Delete actions
- Modal form for vendor creation

**React implementation:**
```typescript
// Vendors.tsx
- DataTable component with shadcn table
- VendorFormDialog for create/edit (shadcn Dialog)
- Search input bar
- Action buttons (Add, Edit, Delete)
```

### 2. Product List (`/products`)
**Current EJS structure:**
- Product grid/table view
- Variants management
- Stock quantity display
- Add/Edit product modal

**React implementation:**
```typescript
// Products.tsx
- Tab切换 between "Produk" dan "Varian" view
- ProductCard grid layout (shadcn Card)
- Stock status indicator (low stock badge)
- Quick edit inline editing
```

### 3. Raw Materials (`/raw-materials`)
**Current EJS structure:**
- Material inventory table
- Unit price tracking
- Reorder point alerts
- BOM (Bill of Materials) reference links

**React implementation:**
```typescript
// RawMaterials.tsx
- MaterialTable with sortable columns
- Price format currency display
- Low stock warning rows (red highlight)
- BOM link icons
```

---

## Implementation Pattern

Each page follows this pattern:

### Step 1: Create Component Structure
```typescript
// frontend/src/pages/Vendors.tsx
import { Shell } from '@/components/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export default function Vendors() {
  return (
    <Shell>
      {/* Page header + search */}
      {/* Data table */}
      {/* Pagination */}
    </Shell>
  );
}
```

### Step 2: Install Required Shadcn Components
```bash
npx shadcn@latest add input pagination sheet context-menu
```

### Step 3: Update Routes
```typescript
// App.tsx
import Vendors from './pages/Vendors';
import Products from './pages/Products';
import RawMaterials from './pages/RawMaterials';

<Routes>
  <Route path="/vendors" element={<Vendors />} />
  <Route path="/products" element={<Products />} />
  <Route path="/raw-materials" element={<RawMaterials />} />
</Routes>
```

---

## API Integration Layer (Phase 3b)

After creating static UI components, add TanStack Query:

```typescript
// hooks/useVendors.ts
export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const res = await fetch('/api/vendors');
      return res.json();
    },
  });
}
```

Update components to use:
```typescript
const { data: vendors, isLoading } = useVendors();

if (isLoading) return <div>Loading...</div>;

return (
  <Table>
    <TableBody>
      {vendors.map(vendor => <TableRow key={vendor.id}>...</TableRow>)}
    </TableBody>
  </Table>
);
```

---

## Testing Strategy

### Unit Tests (Jest + React Testing Library)
```typescript
// tests/Vendors.test.tsx
describe('Vendors page', () => {
  test('renders vendor table', () => {
    render(<Vendors />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  test('shows loading state', () => {
    render(<Vendors />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
```

### E2E Tests (Cypress/Playwright)
```typescript
// cypress/e2e/vendors.cy.ts
it('can search and filter vendors', () => {
  cy.visit('/vendors');
  cy.get('[data-testid="search-input"]').type('ABC Corp');
  // Verify filtered results
});
```

---

## Success Criteria

Phase 3 complete when:
- [ ] All 3 pages (`/vendors`, `/products`, `/raw-materials`) rendered correctly
- [ ] TypeScript builds without errors
- [ ] Navigation from Shell works
- [ ] Responsive on mobile (sidebar collapsible)
- [ ] No console errors in browser dev tools
- [ ] Matches original EJS functionality visually

---

## Estimated Timeline

| Day | Task |
|-----|------|
| Day 1 | Vendor page (table + dialog + form) |
| Day 2 | Products page (grid + variants tab) |
| Day 3 | Raw materials page (sortable table + alerts) |
| Day 4 | API integration layer (TanStack Query) |
| Day 5 | Testing + Polish |

---

## Dependencies

- **Must complete first:** Phase 2 Shell layout verified
- **Required packages:** `@tanstack/react-query`, `lucide-react`, shadcn components
- **Blockers:** None (parallel work possible if needed)
