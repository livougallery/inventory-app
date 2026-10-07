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
  Shirt,
  Truck,
  Table2,
  SquareKanban,
  Calculator,
  PackageCheck,
  ListTree,
  ClipboardList,
  TrendingUp,
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

// ===== Saklar mode presentasi =====
//
// `true`  → sidebar hanya berisi menu pratinjau, terbagi ke dua section:
//           "Master Data" (modul berbentuk tabel) dan "PROGRESS" (papan
//           kanban). Dipakai saat merekam video untuk owner, supaya tidak ada
//           halaman lama yang belum sesuai rancangan baru ikut terlihat.
// `false` → sidebar lengkap seperti semula.
//
// Jumlah entrinya sengaja TIDAK ditulis di sini. Angka seperti "7 modul" sudah
// dua kali meleset begitu satu modul dipecah jadi dua menu — dan tidak ada test
// yang menghitungnya, jadi yang salah cuma komentar yang dibaca orang
// berikutnya. Yang perlu diketahui dari komentar ini adalah BENTUKnya (dua
// section, satu berisi tabel dan satu berisi papan), bukan jumlahnya.
//
// Satu saklar, bukan menghapus menu satu per satu: begitu video selesai,
// cukup balikkan nilai ini dan semua menu lama kembali persis seperti
// sebelumnya — tanpa perlu mengingat apa saja yang tadi disembunyikan.
const MODE_VIDEO = true;

/**
 * Path yang diblokir selama mode video — semua halaman di luar menu pratinjau.
 *
 * Menyembunyikan menu saja tidak cukup: halaman lama tetap bisa dibuka lewat
 * URL, dan saat merekam video itu mudah terjadi tidak sengaja — misal tombol
 * "kembali" di browser. Daftar ini dipakai App.tsx untuk mengalihkannya.
 *
 * `/modul/material-grid` ikut di sini meski bukan halaman lama: rutenya ada di
 * App.tsx dan tidak muncul di sidebar mana pun, jadi tanpa entri ini ia satu-
 * satunya halaman di luar tujuh modul yang masih bisa terbuka di tengah
 * perekaman. Halaman prototipe pembanding memang bukan bagian dari alur yang
 * direkam.
 */
export const PATH_DIBLOKIR_VIDEO: string[] = [
  '/',
  '/stok-material',
  '/pembelian-material',
  '/master-data',
  '/bom',
  '/vendors',
  '/products',
  '/purchase-orders',
  '/production-batches',
  '/hpp',
  '/modul/material-grid',
];

/** Path yang dituju bila membuka halaman yang diblokir saat mode video. */
export const TUJUAN_VIDEO = '/modul/material';

// Mode video aktif diekspor supaya App.tsx memakai SUMBER yang sama untuk
// memutuskan kapan pengalihan dipasang. Kalau masing-masing punya saklar
// sendiri, cepat atau lambat keduanya tidak sinkron.
export const MODE_VIDEO_AKTIF = MODE_VIDEO;

// Modul pratinjau sesuai daftar kolom owner, 7 September 2026 — semuanya
// berbentuk tabel dengan daftar kolom yang panjang, jadi semuanya tinggal di
// "Master Data". Papannya TIDAK di sini: ia dipisah ke `papanProgress` di
// bawah, karena yang dibaca di sana sebaran kartu antar tahap, bukan urutan
// kolom.
const modulBaru: NavItem[] = [
  { path: '/modul/material', label: 'Material', icon: Package, section: 'Master Data' },
  { path: '/modul/product', label: 'Product', icon: Shirt, section: 'Master Data' },
  { path: '/modul/whitelabel', label: 'White Label', icon: Truck, section: 'Master Data' },
  {
    path: '/modul/production-fulfillment-table',
    label: 'Production Fulfillment',
    // Ikon tabel, bukan ikon papan: menu ini membuka 40 kolomnya, dan labelnya
    // sama persis dengan menu di PROGRESS — ikonnyalah yang membedakan keduanya
    // saat sidebar dipindai cepat.
    icon: Table2,
    section: 'Master Data',
  },
  { path: '/modul/hpp-baru', label: 'HPP', icon: Calculator, section: 'Master Data' },
  {
    path: '/modul/hpp-harga-jual',
    label: 'HPP & Harga Jual',
    // Panah naik, bukan kalkulator: kalkulator sudah dipakai "HPP" tepat di
    // atasnya, dan dua ikon yang sama berdempetan membuat barisnya sulit
    // dibedakan saat sidebar dipindai cepat.
    icon: TrendingUp,
    section: 'Master Data',
  },
  { path: '/modul/barang-datang', label: 'Barang Datang', icon: PackageCheck, section: 'Master Data' },
  { path: '/modul/bom-hpp', label: 'BOM + HPP Production', icon: ListTree, section: 'Master Data' },
];

/**
 * Register Produk, di section REGISTER.
 *
 * Section sendiri, bukan ikut "Master Data", meski isinya juga daftar produk.
 * Yang dibaca di sini angka yang bergerak tiap hari — stok per varian dan
 * harga jualnya — sedangkan Master Data berisi identitas yang jarang berubah.
 * Menggabungkannya membuat satu section bercampur dua jenis isi, dan yang
 * paling sering dibuka justru terkubur di antara yang paling jarang diubah.
 *
 * Posisinya di antara Master Data dan Progress, sesuai permintaan owner:
 * data induk dulu, lalu pencatatan, baru pekerjaan yang sedang berjalan.
 */
const menuRegister: NavItem[] = [
  {
    path: '/modul/register-produk',
    label: 'Register Produk',
    icon: ClipboardList,
    section: 'Register',
  },
];

/**
 * Papan kanban Production Fulfillment, di section PROGRESS.
 *
 * Judul sectionnya "Progress" (huruf besar-kecilnya diseragamkan dengan
 * "Master Data"), tapi di sidebar tetap terbaca PROGRESS — huruf besarnya
 * dipasang CSS, bukan ditulis di data.
 */
const papanProgress: NavItem[] = [
  {
    path: '/modul/production-fulfillment',
    label: 'Production Fulfillment',
    icon: SquareKanban,
    section: 'Progress',
  },
  {
    path: '/modul/material-fulfillment',
    label: 'Material Fulfillment',
    // Ikon keranjang, bukan papan: bentuknya sama dengan menu di atasnya,
    // dan yang membedakannya di sidebar adalah MENU-nya — isi keduanya
    // Purchase, satu untuk bahan jadi dan satu untuk bahan mentah.
    icon: ShoppingCart,
    section: 'Progress',
  },
];

// Mode video: modul pratinjau dalam tiga section — Master Data (tabel),
// Register (pencatatan produk), dan Progress (papan). Urutannya mengikuti alur
// kerja: data induk dulu, lalu pencatatan, lalu pekerjaan yang sedang berjalan.
const navSectionsVideo: NavSection[] = [
  {
    title: 'Master Data',
    items: modulBaru,
  },
  {
    title: 'Register',
    items: menuRegister,
  },
  {
    title: 'Progress',
    items: papanProgress,
  },
];

const navSections: NavSection[] = MODE_VIDEO
  ? navSectionsVideo
  : [
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
  {
    // Modul tabel sesuai daftar kolom owner, 7 September 2026.
    //
    // Sengaja diletakkan di bagian sendiri: ini PRATINJAU tampilan yang belum
    // terhubung ke database (tiap halaman memasang BannerPratinjau). Dicampur
    // ke grup yang sudah ada akan membuatnya tampak seperti halaman jadi.
    title: 'Modul Baru (Pratinjau)',
    items: modulBaru,
  },
  {
    // Papan kanbannya tetap di section sendiri di sini juga — bukan ikut ke
    // "Modul Baru (Pratinjau)".
    //
    // Dua menu bernama "Production Fulfillment" (tabel dan papan) memang
    // dibedakan oleh sectionnya; digabung ke satu section, keduanya jadi dua
    // baris berlabel sama persis yang berdempetan, dan tidak ada lagi yang
    // memberi tahu mana yang membuka tabel dan mana yang membuka papan.
    title: 'Progress',
    items: papanProgress,
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
