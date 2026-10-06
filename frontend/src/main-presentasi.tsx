import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// HashRouter, BUKAN BrowserRouter seperti di `main.tsx`.
//
// Alasannya nyata: berkas presentasi dibuka sebagai file:// di komputer lain.
// BrowserRouter membaca `window.location.pathname`, yang untuk file:// adalah
// path file-nya sendiri — jadi semua route jatuh ke "*" dan yang tampil
// "Coming soon...". HashRouter membaca `location.hash`, yang tersimpan di
// dalam berkas dan tidak pernah hilang bersama nama folder.
//
// File `main.tsx` sengaja TIDAK diubah: aplikasi yang berjalan di localhost
// memang memakai BrowserRouter, dan replacing-nya demi presentasi akan
// mengubah URL asli aplikasi.
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
