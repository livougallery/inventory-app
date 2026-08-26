import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { useState } from 'react';

interface Vendor {
  id: number;
  nama_vendor: string;
  alamat: string;
  kontak: string;
  status: 'active' | 'inactive';
}

// Sample data - will be replaced with API call in next phase
const sampleVendors: Vendor[] = [
  { id: 1, nama_vendor: 'PT Supplier Maju Jaya', alamat: 'Jakarta Selatan', kontak: '0812-3456-7890', status: 'active' },
  { id: 2, nama_vendor: 'CV Sumber Rezeki', alamat: 'Bandung', kontak: '0813-2345-6789', status: 'active' },
  { id: 3, nama_vendor: 'UD Teknologi Nusantara', alamat: 'Surabaya', kontak: '0814-1234-5678', status: 'inactive' },
];

export default function Vendors() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVendors = sampleVendors.filter(
    (vendor) =>
      vendor.nama_vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.alamat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Vendor Management</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors by name or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Vendor List */}
      <Card>
        <CardHeader>
          <CardTitle>All Vendors ({filteredVendors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.id}</TableCell>
                  <TableCell>{vendor.nama_vendor}</TableCell>
                  <TableCell>{vendor.alamat}</TableCell>
                  <TableCell>{vendor.kontak}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        vendor.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {vendor.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
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
