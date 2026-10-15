import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

/**
 * Dua bentuk tab.
 *
 * `default` adalah bentuk yang sudah dipakai lima halaman lain (Products,
 * HPP & Harga Jual, Material Fulfillment, Production Batches, Production
 * Fulfillment) — pil di dalam kotak abu-abu. Bentuk itu TIDAK berubah sedikit
 * pun; kalau berubah, kelima halaman itu ikut berubah tanpa ada yang meminta.
 *
 * `line` adalah bentuk garis bawah (contoh ReUI `c-tabs-2`): tanpa kotak latar,
 * yang menandai tab aktif cuma garis di bawahnya. Dipakai halaman Register
 * Produk, yang tabnya memisahkan dua daftar yang isinya jauh berbeda (kartu
 * produk vs tabel warna) sehingga penanda "kotak" lebih cocok daripada pil.
 */
const tabsListVariants = cva(
  'group/tabs-list inline-flex items-center justify-center text-muted-foreground',
  {
    variants: {
      variant: {
        default: 'h-10 rounded-md bg-muted p-1',
        line: 'h-10 gap-1 rounded-none bg-transparent p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    // `data-variant` dibaca oleh TabsTrigger lewat `group-data-[variant=line]`,
    // jadi variannya tidak perlu dioper turun satu per satu ke tiap trigger.
    data-variant={variant}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // `relative` + kelas `after:*` disiapkan di sini untuk varian garis
      // bawah. Pada varian default garis itu tidak pernah terlihat karena
      // `after:opacity-0` hanya dinyalakan oleh `group-data-[variant=line]`.
      'relative inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      // Varian garis: kotak pil dimatikan seluruhnya (latar + bayangan saat
      // aktif), tingginya dibuat penuh supaya garis bawahnya rata dengan alas
      // baris tab — bukan menggantung setinggi tinggi teksnya saja.
      'group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

// `tabsListVariants` sengaja TIDAK diekspor: yang memakainya cuma TabsList di
// berkas ini. Registry ReUI mengekspornya, tapi tidak ada satu pun pemanggil di
// repo ini — dan ekspor yang tidak dipakai cuma menambah permukaan API yang
// harus dijaga. Tambahkan kalau nanti benar-benar ada yang butuh.
export { Tabs, TabsList, TabsTrigger, TabsContent };
