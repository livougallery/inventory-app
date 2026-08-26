import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Search, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface RawMaterial {
  id: number;
  name: string;
  code: string;
  unit: string;
  currentStock: number;
  reorderPoint: number;
  unitPrice: string;
  supplier: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

// Sample data - will be replaced with API call
const sampleMaterials: RawMaterial[] = [
  { id: 1, name: 'Kain Cotton Combed 30s', code: 'KC-30S-BEW', unit: 'Yard', currentStock: 500, reorderPoint: 100, unitPrice: 'Rp 25.000', supplier: 'PT Textile Indo', status: 'in_stock' },
  { id: 2, name: 'Kain Spunlace Non-Woven', code: 'SN-001-WHT', unit: 'Kg', currentStock: 15, reorderPoint: 50, unitPrice: 'Rp 45.000', supplier: 'CV Materials Jaya', status: 'low_stock' },
  { id: 3, name: 'Benang Polyster 40s', code: 'BP-40S-RED', unit: 'Pojong', currentStock: 0, reorderPoint: 20, unitPrice: 'Rp 120.000', supplier: 'UD Thread Co', status: 'out_of_stock' },
  { id: 4, name: 'Label Paper Premium', code: 'LP-PRM-WHT', unit: 'Roll', currentStock: 80, reorderPoint: 30, unitPrice: 'Rp 75.000', supplier: 'PT Label Nusantara', status: 'in_stock' },
  { id: 5, name: 'Zipper Plastic #5', code: 'ZP-005-CLR', unit: 'PCS', currentStock: 2500, reorderPoint: 500, unitPrice: 'Rp 150', supplier: 'CV Zipper Abadi', status: 'in_stock' },
];

export default function RawMaterials() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMaterials = sampleMaterials.filter(
    (material) =>
      material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.supplier.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockCount = filteredMaterials.filter(m => m.status === 'low_stock' || m.status === 'out_of_stock').length;

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Raw Materials</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Material
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Materials</CardTitle>
            <div className="h-4 w-4 rounded bg-blue-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleMaterials.length}</div>
            <p className="text-xs text-muted-foreground">All categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <div className="h-4 w-4 rounded bg-green-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rp 8.5M</div>
            <p className="text-xs text-muted-foreground">Inventory value</p>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search materials by name, code, or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Materials List */}
      <Card>
        <CardHeader>
          <CardTitle>Material Inventory ({filteredMaterials.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Material Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="font-mono font-medium text-sm">{material.code}</TableCell>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{material.unit}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{material.currentStock}</span>
                      {material.currentStock <= material.reorderPoint && (
                        <span className="text-xs text-orange-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Low
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{material.unitPrice}</TableCell>
                  <TableCell className="text-muted-foreground">{material.supplier}</TableCell>
                  <TableCell>
                    {material.status === 'in_stock' && (
                      <Badge variant="default">In Stock</Badge>
                    )}
                    {material.status === 'low_stock' && (
                      <Badge variant="secondary">Low Stock</Badge>
                    )}
                    {material.status === 'out_of_stock' && (
                      <Badge variant="destructive">Out of Stock</Badge>
                    )}
                  </TableCell>
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
