import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart } from 'lucide-react';

// ===== Halaman Pembelian Material =====
// Placeholder — fitur pembelian material (PO bahan baku) dikerjakan terpisah,
// setelah skema supplier diputuskan. Lihat BRIEF & diagram pembelian material.

export default function PembelianMaterial() {
  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pembelian Material</h1>
        <p className="text-sm text-muted-foreground">Catatan pembelian bahan baku (PO bahan baku)</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-muted-foreground"><ShoppingCart className="h-8 w-8" /></div>
          <p className="text-sm font-medium">Tabel Pembelian Material belum tersambung</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Bagian ini akan berisi daftar pembelian bahan baku untuk membantu perhitungan HPP.
            Fitur sedang disiapkan.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
