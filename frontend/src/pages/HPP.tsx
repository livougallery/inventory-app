import { Shell } from '@/components/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Download, Upload, Search, Calculator, Hammer } from 'lucide-react';
import { useState } from 'react';

interface HPPRecord {
  id: number;
  batchNumber: string;
  product: string;
  variant: string;
  totalCost: string;
  qtyProduced: number;
  hppPerUnit: string;
  calculatedDate: string;
  status: 'calculated' | 'pending' | 'review';
}

// Sample data - will be replaced with API call
const sampleHPP: HPPRecord[] = [
  { id: 1, batchNumber: 'PB-2024-001', product: 'Rowe Tee LVU-TOP-11-EBK', variant: 'XL / Black', totalCost: 'Rp 60.0M', qtyProduced: 500, hppPerUnit: 'Rp 120.000', calculatedDate: '2024-01-20', status: 'calculated' },
  { id: 2, batchNumber: 'PB-2024-002', product: 'Rowe Polo Classic', variant: 'L / White', totalCost: 'Rp 43.5M', qtyProduced: 300, hppPerUnit: 'Rp 145.000', calculatedDate: '2024-01-22', status: 'calculated' },
  { id: 3, batchNumber: 'PB-2024-003', product: 'Rowe Hoodie Premium', variant: 'M / Navy', totalCost: 'Rp 45.0M', qtyProduced: 200, hppPerUnit: 'Rp 225.000', calculatedDate: '2024-01-25', status: 'pending', },
];

export default function HPP() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTipe, setSelectedTipe] = useState<string>('all');

  const filteredHPP = sampleHPP.filter((record) => {
    const matchesSearch = record.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.product.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipe = selectedTipe === 'all' || true; // Filter by tipe biaya could be added
    return matchesSearch && matchesTipe;
  });


  return (
    <Shell>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">HPP & Reports</h1>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import Data
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Import HPP Data</DialogTitle>
                <DialogDescription>
                  Upload production cost data from CSV or Excel file.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Download className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground mb-2">Drag and drop your file here</p>
                  <p className="text-xs text-muted-foreground">CSV or Excel supported</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Upload</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger>
              <Button>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate HPP
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Calculate HPP</DialogTitle>
                <DialogDescription>
                  Enter production details to calculate Unit Price (HPP).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Batch</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                    <option>Select batch...</option>
                    <option>PB-2024-001</option>
                    <option>PB-2024-002</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Material Cost</label>
                  <Input type="number" className="col-span-3" placeholder="50000000" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Labor Cost</label>
                  <Input type="number" className="col-span-3" placeholder="5000000" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Overhead Cost</label>
                  <Input type="number" className="col-span-3" placeholder="3000000" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right">Qty Produced</label>
                  <Input type="number" className="col-span-3" placeholder="500" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Calculate</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Batches</CardTitle>
            <Hammer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sampleHPP.length}</div>
            <p className="text-xs text-muted-foreground">With HPP calculated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg HPP</CardTitle>
            <Calculator className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rp 163k</div>
            <p className="text-xs text-muted-foreground">Average unit cost</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <span className="h-4 w-4 rounded-full bg-yellow-500"></span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sampleHPP.filter((h) => h.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Production</CardTitle>
            <span className="h-4 w-4 rounded-full bg-green-500"></span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sampleHPP.reduce((acc, h) => acc + h.qtyProduced, 0)}
            </div>
            <p className="text-xs text-muted-foreground">pcs produced</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by batch number or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-auto"
              value={selectedTipe}
              onChange={(e) => setSelectedTipe(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="kain">Kain</option>
              <option value="aksesoris">Aksesoris</option>
              <option value="jahit">Jahit</option>
              <option value="others">Others</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* HPP Records List */}
      <Card>
        <CardHeader>
          <CardTitle>HPP Calculation Records ({filteredHPP.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch Number</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Qty Produced</TableHead>
                <TableHead>HPP per Unit</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHPP.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-mono font-medium">{record.batchNumber}</TableCell>
                  <TableCell className="font-medium">{record.product}</TableCell>
                  <TableCell>{record.variant}</TableCell>
                  <TableCell className="font-medium">{record.totalCost}</TableCell>
                  <TableCell>{record.qtyProduced} pcs</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">{record.hppPerUnit}</span>
                    </div>
                  </TableCell>
                  <TableCell>{record.calculatedDate}</TableCell>
                  <TableCell>
                    {record.status === 'calculated' && (
                      <Badge variant="default">Calculated</Badge>
                    )}
                    {record.status === 'pending' && (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                    {record.status === 'review' && (
                      <Badge variant="outline">Review</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Shell>
  );
}
