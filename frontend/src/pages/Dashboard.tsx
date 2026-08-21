import { Shell } from '@/components/Shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Package, ShoppingCart, Hammer, DollarSign, AlertCircle } from 'lucide-react';

export default function Dashboard() {
  // Sample data - will be replaced with real API calls in next iteration
  const stats = [
    { title: 'Total Products', value: '156', icon: Package as any, change: '+12% from last month' },
    { title: 'Active Vendors', value: '42', icon: Users as any, change: '+5 new this quarter' },
    { title: 'Purchase Orders', value: '18', icon: ShoppingCart as any, change: '3 pending approval' },
    { title: 'Production Batches', value: '27', icon: Hammer as any, change: '8 in progress' },
    { title: 'Monthly Revenue', value: 'Rp 45.2M', icon: DollarSign as any, change: '+23% YoY growth' },
    { title: 'Low Stock Alerts', value: '7 items', icon: AlertCircle as any, change: 'Action required' },
  ];

  return (
    <Shell>
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity & Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Purchase Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Purchase Orders</CardTitle>
            <CardDescription>Latest orders requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">PO-{String(2024).slice(2)}-0{i}23</p>
                    <p className="text-sm text-muted-foreground">Supplies Inc.</p>
                  </div>
                  <span className="text-sm px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Production Status */}
        <Card>
          <CardHeader>
            <CardTitle>Production Status</CardTitle>
            <CardDescription>Current batch production overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Batch #{2024}-00{i}</p>
                    <span className="text-sm px-2 py-1 bg-green-100 text-green-800 rounded-full">
                      In Progress
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full" 
                      style={{ width: `${Math.random() * 60 + 20}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(Math.random() * 60 + 20)}% Complete
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}