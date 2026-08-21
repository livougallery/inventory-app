import { Shell } from '@/components/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Search, Package, FileText, Download, Upload } from 'lucide-react';
import { useState } from 'react';

interface BOMItem {
  id: number;
  productCode: string;
  productName: string;
  variant: string;
  rawMaterialCode: string;
  rawMaterialName: string;
  qtyPerUnit: number;
  unit: string;
  status: 'active' | 'draft' | 'archived';
}

// Sample data - will be replaced with API call
const sampleBOM: BOMItem[] = [
  // Rowe Tee LVU-TOP-11-EBK recipes
  { id: 1, productCode: 'FP20703', productName: 'Rowe Tee LVU-TOP-11-EBK', variant: 'XL / Black', rawMaterialCode: 'KC-30S-BEW', rawMaterialName: 'Kain Cotton Combed 30s', qtyPerUnit: 1.5, unit: 'Yard', status: 'active' },
  { id: 2, productCode: 'FP20703', productName: 'Rowe Tee LVU-TOP-11-EBK', variant: 'XL / Black', rawMaterialCode: 'LP-PRM-WHT', rawMaterialName: 'Label Paper Premium', qtyPerUnit: 1, unit: 'Roll', status: 'active' },
  { id: 3, productCode: 'FP20703', productName: 'Rowe Tee LVU-TOP-11-EBK', variant: 'XL / Black', rawMaterialCode: 'BP-40S-RED', rawMaterialName: 'Benang Polyster 40s', qtyPerUnit: 1, unit: 'Pojong', status: 'active' },

  // Additional variants of same product
  { id: 4, productCode: 'FP20703', productName: 'Rowe Tee LVU-TOP-11-EBK', variant: 'L / White', rawMaterialCode: 'KC-30S-BEW', rawMaterialName: 'Kain Cotton Combed 30s', qtyPerUnit: 1.4, unit: 'Yard', status: 'active' },
];

export default function BOM() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [showDialog, setShowDialog] = useState(false);

  const filteredBOM = sampleBOM.filter((item) => {
    const matchesSearch = item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.rawMaterialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.variant.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesProduct = selectedProduct === 'all' || item.productCode === selectedProduct;

    return matchesSearch && matchesProduct;
  });

  const uniqueProducts = Array.from(new Set(sampleBOM.map(item => item.productCode)));

  const getProductStats = (productCode: string) => {
    return {
      components: sampleBOM.filter(item => item.productCode === productCode).length,
      totalQty: sampleBOM
        .filter(item => item.productCode === productCode)
        .reduce((acc, curr) => acc + curr.qtyPerUnit, 0),
    };
  };

  return (
    <Shell>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Bill of Materials (BOM)</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => alert('Import functionality')}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={() => alert('Export functionality')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Component
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add BOM Component</DialogTitle>
                <DialogDescription>
                  Add a raw material component to a product's Bill of Materials.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Product</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                    {uniqueProducts.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Variant</label>
                  <Input placeholder="XL / Black" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Raw Material</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                    <option>Select material...</option>
                    <option>KC-30S-BEW - Kain Cotton Combed 30s</option>
                    <option>LP-PRM-WHT - Label Paper Premium</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Quantity per Unit</label>
                  <Input type="number" placeholder="1.5" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Unit</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                    <option>Yard</option>
                    <option>Pcs</option>
                    <option>Roll</option>
                    <option>Kg</option>
                    <option>Pojong</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                <Button>Add Component</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueProducts.length}</div>
            <p className="text-xs text-muted-foreground">With BOM defined</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Components</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleBOM.length}</div>
            <p className="text-xs text-muted-foreground">BOM records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Recipes</CardTitle>
            <span className="h-4 w-4 rounded-full bg-green-500"></span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sampleBOM.filter(b => b.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">Ready for production</p>
          </CardContent>
        </Card>
      </div>

      {/* BOM List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>BOM Records ({filteredBOM.length})</CardTitle>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product or material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-auto"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="all">All Products</option>
                {uniqueProducts.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Component Type</TableHead>
                <TableHead>Raw Material</TableHead>
                <TableHead>Qty per Unit</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBOM.map((bom) => {
                const stats = getProductStats(bom.productCode);
                return (
                  <TableRow key={bom.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold">{bom.productName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{bom.productCode}</p>
                        {stats.components > 1 && (
                          <Badge variant="outline">{stats.components} components</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{bom.variant}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{bom.rawMaterialCode}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{bom.rawMaterialName}</TableCell>
                    <TableCell className="font-bold text-primary">{bom.qtyPerUnit.toFixed(2)}</TableCell>
                    <TableCell>{bom.unit}</TableCell>
                    <TableCell>
                      <Badge variant={
                        bom.status === 'active' ? 'default' :
                        bom.status === 'draft' ? 'secondary' : 'outline'
                      }>
                        {bom.status.charAt(0).toUpperCase() + bom.status.slice(1)}
                      </Badge>
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Shell>
  );
}
