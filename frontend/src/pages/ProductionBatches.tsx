import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Eye, Play, CheckCircle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Batch {
  id: number;
  batchNumber: string;
  product: string;
  variant: string;
  qtyOrdered: number;
  qtyProduced: number;
  startDate: string;
  status: 'planned' | 'in_progress' | 'completed' | 'on_hold';
}

// Sample data - will be replaced with API call
const sampleBatches: Batch[] = [
  { id: 1, batchNumber: 'PB-2024-001', product: 'Rowe Tee LVU-TOP-11-EBK', variant: 'XL / Black', qtyOrdered: 500, qtyProduced: 480, startDate: '2024-01-15', status: 'completed' },
  { id: 2, batchNumber: 'PB-2024-002', product: 'Rowe Polo Classic', variant: 'L / White', qtyOrdered: 300, qtyProduced: 175, startDate: '2024-01-16', status: 'in_progress' },
  { id: 3, batchNumber: 'PB-2024-003', product: 'Rowe Hoodie Premium', variant: 'M / Navy', qtyOrdered: 200, qtyProduced: 0, startDate: '2024-01-18', status: 'in_progress' },
  { id: 4, batchNumber: 'PB-2024-004', product: 'Rowe Cap Baseball', variant: 'One Size / Red', qtyOrdered: 1000, qtyProduced: 0, startDate: '2024-01-20', status: 'planned' },
];

export default function ProductionBatches() {
  const filteredBatches = sampleBatches;

  const kanbanColumns = [
    { status: 'planned', title: 'Planned', color: 'bg-gray-100 border-gray-300' },
    { status: 'in_progress', title: 'In Progress', color: 'bg-blue-50 border-blue-200' },
    { status: 'completed', title: 'Completed', color: 'bg-green-50 border-green-200' },
  ];

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Production Batches</h1>
        <Dialog>
          <DialogTrigger>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Production Batch</DialogTitle>
              <DialogDescription>
                Start a new production batch for your products.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Product</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                  <option>Select product...</option>
                  <option>Rowe Tee LVU-TOP-11-EBK</option>
                  <option>Rowe Polo Classic</option>
                </select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Variant</label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm col-span-3">
                  <option>Select variant...</option>
                  <option>XL / Black</option>
                  <option>L / White</option>
                </select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Quantity</label>
                <Input type="number" className="col-span-3" placeholder="500" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right">Start Date</label>
                <Input type="date" className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Create Batch</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban View */}
      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <div className="grid md:grid-cols-3 gap-4">
            {kanbanColumns.map((column) => (
              <Card key={column.status} className={`border-2 ${column.color}`}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{column.title}</span>
                    <Badge variant="secondary">
                      {sampleBatches.filter((b) => b.status === column.status).length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-2 p-4">
                    {sampleBatches
                      .filter((batch) => batch.status === column.status)
                      .map((batch) => (
                        <Card key={batch.id} className="p-4">
                          <div className="space-y-3">
                            <div>
                              <p className="font-mono text-xs text-muted-foreground mb-1">{batch.batchNumber}</p>
                              <p className="font-medium text-sm">{batch.product}</p>
                              <p className="text-xs text-muted-foreground">{batch.variant}</p>
                            </div>
                            <Progress value={(batch.qtyProduced / batch.qtyOrdered) * 100} className="h-2" />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {batch.qtyProduced} / {batch.qtyOrdered} pcs
                              </span>
                              <span>{Math.round((batch.qtyProduced / batch.qtyOrdered) * 100)}%</span>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t">
                              <span className="text-xs">{batch.startDate}</span>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>All Production Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Number</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono font-medium">{batch.batchNumber}</TableCell>
                      <TableCell className="font-medium">{batch.product}</TableCell>
                      <TableCell>{batch.variant}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{batch.qtyProduced} / {batch.qtyOrdered} pcs</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-48">
                        <Progress value={(batch.qtyProduced / batch.qtyOrdered) * 100} className="h-2" />
                      </TableCell>
                      <TableCell>{batch.startDate}</TableCell>
                      <TableCell>
                        {batch.status === 'planned' && (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            Planned
                          </Badge>
                        )}
                        {batch.status === 'in_progress' && (
                          <Badge variant="secondary">
                            <Play className="h-3 w-3 mr-1" />
                            In Progress
                          </Badge>
                        )}
                        {batch.status === 'completed' && (
                          <Badge variant="default">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        )}
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
        </TabsContent>
      </Tabs>
    </>
  );
}
