import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Package, ShoppingCart, Hammer, FileText, Settings, UserCircle2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles?: string[]; // Optional role-based visibility
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/cek-data', label: 'Material & Products', icon: Package },
  { path: '/vendors', label: 'Vendor Management', icon: Users },
  { path: '/products', label: 'Produk', icon: Package },
  { path: '/raw-materials', label: 'Bahan Baku', icon: Package },
  { path: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
  { path: '/production-batches', label: 'Batch Produksi', icon: Hammer },
  { path: '/hpp', label: 'HPP & Reports', icon: FileText },
];

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const user = { name: 'Admin Utama', role: 'Administrator' };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 border-r bg-card">
        <div className="flex h-14 items-center border-b px-4 shrink-0">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <span>Inventory System</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-auto py-4">
          <div className="space-y-1 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <Separator className="my-3" />

          <div className="px-3">
            <button className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 h-14 flex items-center gap-4 border-b bg-card px-4">
        <div className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <span>Inventory</span>
        </div>
      </header>

      {/* Top Bar in main content area */}
      <div className="flex items-center justify-between mb-6 px-2">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Inventory Dashboard
        </h1>

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <UserCircle2 className="h-8 w-8 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.role}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}