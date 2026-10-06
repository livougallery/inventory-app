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
import Material from './pages/Material';
import MaterialGrid from './pages/MaterialGrid';
import Product from './pages/Product';
import RegisterProduk from './pages/RegisterProduk';
import Whitelabel from './pages/Whitelabel';
import ProductionFulfillment from './pages/ProductionFulfillment';
import PapanProduksi from './pages/production-fulfillment/PapanProduksi';
import MaterialFulfillment from './pages/MaterialFulfillment';
import HppPratinjau from './pages/HppPratinjau';
import BarangDatang from './pages/BarangDatang';
import BomHpp from './pages/BomHpp';
import { Shell, MODE_VIDEO_AKTIF, PATH_DIBLOKIR_VIDEO, TUJUAN_VIDEO } from './components/Shell';

function App() {
  return (
    <Routes>
      {/* Login page - no shell */}
      <Route path="/login" element={<Login />} />

      {/* Mode video: halaman lama dialihkan, bukan cuma disembunyikan dari
          sidebar. Tanpa ini, halaman itu tetap bisa dibuka lewat URL — mudah
          terjadi tidak sengaja saat merekam, misal lewat tombol "kembali". */}
      {MODE_VIDEO_AKTIF &&
        PATH_DIBLOKIR_VIDEO.map((p) => (
          <Route key={p} path={p} element={<Navigate to={TUJUAN_VIDEO} replace />} />
        ))}

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

      {/* ===== 7 modul pratinjau (daftar kolom owner, 7 September 2026) =====
          Terpisah dari halaman lama di atas: masing-masing punya URL sendiri
          supaya owner bisa membukanya satu per satu tanpa mengganggu halaman
          yang sudah jalan. */}
      <Route path="/modul/material" element={
        <Shell>
          <Material />
        </Shell>
      } />
      {/* Prototipe Data Grid — bandingkan dengan /modul/material sebelum
          memutuskan mengganti semua tabel. Halaman contoh, bukan pengganti. */}
      <Route path="/modul/material-grid" element={
        <Shell>
          <MaterialGrid />
        </Shell>
      } />
      <Route path="/modul/product" element={
        <Shell>
          <Product />
        </Shell>
      } />
      <Route path="/modul/whitelabel" element={
        <Shell>
          <Whitelabel />
        </Shell>
      } />
      {/* Register Produk, di section REGISTER. Halaman sendiri, bukan bagian
          dari /modul/product: yang dibaca di sana angka stok per varian, dan
          itu daftar yang jauh lebih panjang daripada tabel identitas produk. */}
      <Route path="/modul/register-produk" element={
        <Shell>
          <RegisterProduk />
        </Shell>
      } />
      {/* Papan kanban, di section PROGRESS. URL lamanya (`/modul/production-
          fulfillment`) sengaja TETAP di sini dan tetap menunjuk papan — itu
          URL yang sudah dipakai saat merekam video, dan berpindahnya papan ke
          section lain tidak boleh membuat link lama menampilkan halaman yang
          berbeda dari yang dilihat terakhir kali. */}
      <Route path="/modul/production-fulfillment" element={
        <Shell>
          <PapanProduksi />
        </Shell>
      } />
      {/* Material Fulfillment, section PROGRESS juga. Prefix-nya tetap
          `/modul/` seperti route lain — belum ada segmen `/progress/` di app
          ini, dan production-fulfillment yang juga di PROGRESS tetap di
          `/modul/production-fulfillment`. Memindahkan seluruh halaman PROGRESS
          ke `/progress/*` adalah migrasi tersendiri, bukan ikut di tiket ini. */}
      <Route path="/modul/material-fulfillment" element={
        <Shell>
          <MaterialFulfillment />
        </Shell>
      } />
      {/* Tabel 40 kolomnya, tetap di Master Data. URL-nya baru dan terpisah,
          supaya kedua halaman bisa dibedakan tanpa bergantung pada state. */}
      <Route path="/modul/production-fulfillment-table" element={
        <Shell>
          <ProductionFulfillment />
        </Shell>
      } />
      <Route path="/modul/hpp-baru" element={
        <Shell>
          <HppPratinjau />
        </Shell>
      } />
      <Route path="/modul/barang-datang" element={
        <Shell>
          <BarangDatang />
        </Shell>
      } />
      <Route path="/modul/bom-hpp" element={
        <Shell>
          <BomHpp />
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
