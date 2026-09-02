import { Fragment, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Hammer,
  FileText,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles?: string[]; // Optional role-based visibility
  /** Nama tampilan di breadcrumb bila berbeda dari label sidebar. */
  breadcrumb?: string;
  /** Section induk untuk breadcrumb (mis. "Master Data"). */
  section?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [{ path: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Master Data',
    items: [
      {
        path: '/stok-material',
        label: 'Stok Material',
        icon: Package,
        section: 'Master Data',
      },
      {
        path: '/pembelian-material',
        label: 'Pembelian Material',
        icon: ShoppingCart,
        section: 'Master Data',
      },
      {
        path: '/bom',
        label: 'Bill of Materials',
        icon: FileText,
        roles: ['admin', 'production'],
        section: 'Master Data',
      },
      {
        path: '/vendors',
        label: 'Vendor Management',
        icon: Users,
        roles: ['admin', 'purchasing'],
        section: 'Master Data',
      },
    ],
  },
  {
    title: 'Produksi',
    items: [
      {
        path: '/products',
        label: 'Products',
        icon: Package,
        roles: ['admin', 'production'],
        section: 'Produksi',
      },
      {
        path: '/purchase-orders',
        label: 'Purchase Orders',
        icon: ShoppingCart,
        roles: ['admin', 'purchasing'],
        section: 'Produksi',
      },
      {
        path: '/production-batches',
        label: 'Production Batches',
        icon: Hammer,
        roles: ['admin', 'production'],
        section: 'Produksi',
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        path: '/hpp',
        label: 'HPP & Reports',
        icon: FileText,
        roles: ['admin', 'finance'],
        section: 'Finance',
      },
    ],
  },
];

// Breadcrumb statis per path — cukup untuk halaman level satu.
function breadcrumbFor(pathname: string): { label: string; to?: string }[] {
  if (pathname === '/') return [{ label: 'Dashboard' }];
  for (const section of navSections) {
    for (const item of section.items) {
      if (item.path === pathname) {
        const crumbs: { label: string; to?: string }[] = [];
        // Section tanpa route sendiri — teks biasa, bukan link (tidak menipu user).
        if (item.section) crumbs.push({ label: item.section });
        crumbs.push({ label: item.breadcrumb ?? item.label });
        return crumbs;
      }
    }
  }
  return [{ label: 'Halaman', to: '/' }];
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const crumbs = breadcrumbFor(location.pathname);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col fixed inset-y-0 border-r bg-card transition-[width] duration-200',
          collapsed ? 'w-14' : 'w-64'
        )}
      >
        <div className={cn('flex h-14 items-center border-b shrink-0', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-6 w-6 shrink-0 text-primary" />
            {!collapsed && <span className="truncate">Inventory System</span>}
          </Link>
        </div>

        <nav className="flex-1 overflow-auto py-4">
          {navSections.map((section, si) => (
            <div key={section.title ?? `s${si}`}>
              {si > 0 && <Separator className="my-3" />}
              {section.title && !collapsed && (
                <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              <div className={cn('space-y-1', collapsed ? 'px-1.5' : 'px-3')}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                        collapsed ? 'justify-center px-2' : 'px-3',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 h-14 flex items-center gap-2 border-b bg-card px-4">
        <div className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <span>Inventory</span>
        </div>
      </header>

      {/* Main area: top bar + content */}
      <div
        className={cn(
          'flex-1 min-w-0 flex flex-col transition-[padding] duration-200',
          collapsed ? 'md:pl-14' : 'md:pl-64'
        )}
      >
        {/* Top bar: collapse + breadcrumb */}
        <div className="hidden md:flex h-12 items-center gap-2 border-b bg-card px-4 sticky top-0 z-40">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                // Fragment: ol hanya boleh berisi li — BreadcrumbItem/Separator keduanya <li>.
                <Fragment key={`${c.label}-${i}`}>
                  {i > 0 && <BreadcrumbSeparator><ChevronRight className="h-3.5 w-3.5" /></BreadcrumbSeparator>}
                  <BreadcrumbItem>
                    {c.to && i < crumbs.length - 1 ? (
                      <BreadcrumbLink render={<Link to={c.to} />}>{c.label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{c.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Page Content */}
        <main className="flex-1 min-w-0 p-4 md:p-6 pt-14 md:pt-4">{children}</main>
      </div>
    </div>
  );
}
