import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Search, Eye, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

interface PurchaseOrder {
  id: number;
  poNumber: string;
  vendor: string;
  orderDate: string;
  expectedDelivery: string;
  totalAmount: string;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'cancelled';
  items: number;
}

// Sample data - will be replaced with API call
const samplePOs: PurchaseOrder[] = [
  { id: 1, poNumber: 'PO-2024-001', vendor: 'PT Supplier Maju Jaya', orderDate: '2024-01-15', expectedDelivery: '2024-01-20', totalAmount: 'Rp 15.5M', status: 'approved', items: 8 },
  { id: 2, poNumber: 'PO-2024-002', vendor: 'CV Sumber Rezeki', orderDate: '2024-01-16', expectedDelivery: '2024-01-22', totalAmount: 'Rp 8.2M', status: 'pending', items: 5 },
  { id: 3, poNumber: 'PO-2024-003', vendor: 'UD Teknologi Nusantara', orderDate: '2024-01-17', expectedDelivery: '2024-01-25', totalAmount: 'Rp 12.8M', status: 'processing', items: 6 },
  { id: 4, poNumber: 'PO-2024-004', vendor: 'PT Textile Indo', orderDate: '2024-01-18', expectedDelivery: '2024-01-24', totalAmount: 'Rp 22.3M', status: 'completed', items: 12 },
];

export default function PurchaseOrders() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const filteredPOs = samplePOs.filter((po) => {
    const matchesSearch = po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || po.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    processing: 'bg-purple-100 text-purple-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
        <Dialog>
          <DialogTrigger>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>
                Enter the details for the new purchase order below.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">PO Number</label>
                <Input placeholder="PO-YYYY-XXX" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Vendor</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                  <option>Select vendor...</option>
                  <option>PT Supplier Maju Jaya</option>
                  <option>CV Sumber Rezeki</option>
                </select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Order Date</label>
                <Input type="date" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Expected Delivery</label>
                <Input type="date" className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Create PO</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{samplePOs.length}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <span className="h-4 w-4 rounded-full bg-yellow-500"></span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {samplePOs.filter((po) => po.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <span className="h-4 w-4 rounded-full bg-purple-500"></span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {samplePOs.filter((po) => po.status === 'processing').length}
            </div>
            <p className="text-xs text-muted-foreground">Being processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <span className="h-4 w-4 rounded-full bg-green-500"></span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {samplePOs.filter((po) => po.status === 'completed').length}
            </div>
            <p className="text-xs text-muted-foreground">Successfully delivered</p>
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
                placeholder="Search by PO number or vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-auto"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* PO List */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders ({filteredPOs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono font-medium">{po.poNumber}</TableCell>
                  <TableCell>{po.vendor}</TableCell>
                  <TableCell>{po.orderDate}</TableCell>
                  <TableCell>{po.expectedDelivery}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{po.items} items</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{po.totalAmount}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2.5 py-0.5 text-xs rounded-full ${statusColors[po.status]}`}>
                      {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
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
