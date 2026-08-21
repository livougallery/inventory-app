import { Shell } from '@/components/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Edit, Trash2, Plus, Search, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface Product {
  id: number;
  name: string;
  sku: string;
  stock: number;
  price: string;
  category: string;
  status: 'active' | 'inactive';
}

// Sample data - will be replaced with API call
const sampleProducts: Product[] = [
  { id: 1, name: 'Rowe Tee LVU-TOP-11-EBK', sku: 'FP20703', stock: 150, price: 'Rp 125.000', category: 'T-Shirt', status: 'active' },
  { id: 2, name: 'Rowe Polo Classic', sku: 'FP20704', stock: 85, price: 'Rp 145.000', category: 'Polo', status: 'active' },
  { id: 3, name: 'Rowe Hoodie Premium', sku: 'FP20705', stock: 12, price: 'Rp 225.000', category: 'Hoodie', status: 'active' },
  { id: 4, name: 'Rowe Cap Baseball', sku: 'FP20706', stock: 200, price: 'Rp 85.000', category: 'Accessory', status: 'active' },
];

export default function Products() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = sampleProducts.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = filteredProducts.filter((p) => p.stock < 20);

  return (
    <Shell>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Product Management</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Search & Filter */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleProducts.length}</div>
            <p className="text-xs text-muted-foreground">All categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockProducts.length}</div>
            <p className="text-xs text-muted-foreground">Need reorder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="h-4 w-4 rounded-full bg-green-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sampleProducts.filter((p) => p.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">In catalog</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <div className="h-4 w-4 rounded-md bg-blue-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(sampleProducts.map((p) => p.category)).size}
            </div>
            <p className="text-xs text-muted-foreground">Product types</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Products & Variants */}
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="products">Produk</TabsTrigger>
          <TabsTrigger value="variants">Varian</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Product Catalog ({filteredProducts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Product</th>
                      <th className="text-left py-3 px-4 font-medium">SKU</th>
                      <th className="text-left py-3 px-4 font-medium">Category</th>
                      <th className="text-left py-3 px-4 font-medium">Stock</th>
                      <th className="text-left py-3 px-4 font-medium">Price</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-right py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{product.name}</td>
                        <td className="py-3 px-4 text-muted-foreground">{product.sku}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{product.category}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          {product.stock}
                          {product.stock < 20 && (
                            <span className="ml-2 text-orange-600 text-xs">⚠️ Low</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium">{product.price}</td>
                        <td className="py-3 px-4">
                          <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                            {product.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variants">
          <Card>
            <CardHeader>
              <CardTitle>Product Variants</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage sizes, colors, and other variants for each product
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No variants defined yet</p>
                <Button variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variant Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
