import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import Products from './pages/Products';
import RawMaterials from './pages/RawMaterials';
import MaterialAndProducts from './pages/MaterialAndProducts';
import PurchaseOrders from './pages/PurchaseOrders';
import ProductionBatches from './pages/ProductionBatches';
import BOM from './pages/BOM';
import HPP from './pages/HPP';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/cek-data" element={<MaterialAndProducts />} />
      <Route path="/vendors" element={<Vendors />} />
      <Route path="/products" element={<Products />} />
      <Route path="/raw-materials" element={<RawMaterials />} />
      <Route path="/purchase-orders" element={<PurchaseOrders />} />
      <Route path="/production-batches" element={<ProductionBatches />} />
      <Route path="/bom" element={<BOM />} />
      <Route path="/hpp" element={<HPP />} />
      {/* Fallback */}
      <Route path="*" element={<div className="p-8">Coming soon...</div>} />
    </Routes>
  );
}

export default App;
