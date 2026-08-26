import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Search, Package, Hammer, FileText } from 'lucide-react';
import { useState } from 'react';

interface MaterialOrProduct {
  id: number;
  code: string;
  name: string;
  type: 'material' | 'product' | 'component';
  category: string;
  unit: string;
  stock: number;
  lastUpdated: string;
}

// Sample data - will be replaced with API call
const sampleData: MaterialOrProduct[] = [
  // Raw Materials
  { id: 1, code: 'KC-30S-BEW', name: 'Kain Cotton Combed 30s', type: 'material', category: 'Kain', unit: 'Yard', stock: 500, lastUpdated: '2024-01-15' },
  { id: 2, code: 'SN-001-WHT', name: 'Kain Spunlace Non-Woven', type: 'material', category: 'Kain', unit: 'Kg', stock: 15, lastUpdated: '2024-01-16' },
  { id: 3, code: 'BP-40S-RED', name: 'Benang Polyster 40s', type: 'material', category: 'Benang', unit: 'Pojong', stock: 0, lastUpdated: '2024-01-17' },
  { id: 4, code: 'LP-PRM-WHT', name: 'Label Paper Premium', type: 'material', category: 'Label', unit: 'Roll', stock: 80, lastUpdated: '2024-01-18' },

  // Products
  { id: 5, code: 'FP20703', name: 'Rowe Tee LVU-TOP-11-EBK', type: 'product', category: 'T-Shirt', unit: 'PCS', stock: 150, lastUpdated: '2024-01-19' },
  { id: 6, code: 'FP20704', name: 'Rowe Polo Classic', type: 'product', category: 'Polo', unit: 'PCS', stock: 85, lastUpdated: '2024-01-20' },
  { id: 7, code: 'FP20705', name: 'Rowe Hoodie Premium', type: 'product', category: 'Hoodie', unit: 'PCS', stock: 12, lastUpdated: '2024-01-21' },

  // Components/Accessories
  { id: 8, code: 'ZP-005-CLR', name: 'Zipper Plastic #5', type: 'component', category: 'Aksesoris', unit: 'PCS', stock: 2500, lastUpdated: '2024-01-22' },
];

export default function MaterialAndProducts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredData = sampleData.filter((item) => {
    const matchesSearch = item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || item.type === filterType;

    return matchesSearch && matchesType;
  });

  const materialCount = sampleData.filter(i => i.type === 'material').length;
  const productCount = sampleData.filter(i => i.type === 'product').length;
  const componentCount = sampleData.filter(i => i.type === 'component').length;

  const getStatusBadge = (stock: number) => {
    if (stock === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    } else if (stock < 20) {
      return <Badge variant="secondary">Low Stock</Badge>;
    }
    return <Badge variant="default">In Stock</Badge>;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'material':
        return <Hammer className="h-4 w-4 mr-1" />;
      case 'product':
        return <Package className="h-4 w-4 mr-1" />;
      case 'component':
        return <FileText className="h-4 w-4 mr-1" />;
    }
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Master Data - Material & Products</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Raw Materials</CardTitle>
            <Hammer className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{materialCount}</div>
            <p className="text-xs text-muted-foreground">Inventory materials</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productCount}</div>
            <p className="text-xs text-muted-foreground">Finished goods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Components</CardTitle>
            <FileText className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{componentCount}</div>
            <p className="text-xs text-muted-foreground">Accessories & others</p>
          </CardContent>
        </Card>
      </div>

      {/* Unified Master Data Table with Tab Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>All Master Items ({filteredData.length})</CardTitle>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code, name, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-auto"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="material">Raw Materials</option>
                <option value="product">Products</option>
                <option value="component">Components</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTypeIcon(item.type)}
                      <Badge variant={
                        item.type === 'material' ? 'outline' :
                        item.type === 'product' ? 'default' : 'secondary'
                      }>
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-medium text-sm">{item.code}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.category}</Badge>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>
                    <span className="font-medium">{item.stock.toLocaleString()}</span>
                  </TableCell>
                  <TableCell>{getStatusBadge(item.stock)}</TableCell>
                  <TableCell className="text-muted-foreground">{item.lastUpdated}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
