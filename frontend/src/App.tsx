import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import Products from './pages/Products';
import StokMaterial from './pages/StokMaterial';
import PembelianMaterial from './pages/PembelianMaterial';
import PurchaseOrders from './pages/PurchaseOrders';
import ProductionBatches from './pages/ProductionBatches';
import BOM from './pages/BOM';
import HPP from './pages/HPP';
import { Shell } from './components/Shell';

function App() {
  return (
    <Routes>
      {/* Login page - no shell */}
      <Route path="/login" element={<Login />} />

      {/* All other pages wrapped in Shell with sidebar */}
      <Route path="/" element={
        <Shell>
          <Dashboard />
        </Shell>
      } />
      <Route path="/stok-material" element={
        <Shell>
          <StokMaterial />
        </Shell>
      } />
      <Route path="/pembelian-material" element={
        <Shell>
          <PembelianMaterial />
        </Shell>
      } />
      {/* URL lama era satu halaman Master Data → sekarang halaman Stok Material */}
      <Route path="/master-data" element={<Navigate to="/stok-material" replace />} />
      <Route path="/vendors" element={
        <Shell>
          <Vendors />
        </Shell>
      } />
      <Route path="/products" element={
        <Shell>
          <Products />
        </Shell>
      } />
      <Route path="/purchase-orders" element={
        <Shell>
          <PurchaseOrders />
        </Shell>
      } />
      <Route path="/production-batches" element={
        <Shell>
          <ProductionBatches />
        </Shell>
      } />
      <Route path="/bom" element={
        <Shell>
          <BOM />
        </Shell>
      } />
      <Route path="/hpp" element={
        <Shell>
          <HPP />
        </Shell>
      } />
      {/* Fallback */}
      <Route path="*" element={
        <Shell>
          <div className="p-8">Coming soon...</div>
        </Shell>
      } />
    </Routes>
  );
}

export default App;
