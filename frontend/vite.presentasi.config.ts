// Build presentasi satu-berkas.
//
// Berkas ini menggabungkan seluruh JS, CSS, dan HTML frontend menjadi SATU
// `.html` yang bisa dibuka langsung dari komputer mana pun tanpa server dan
// tanpa database. Dipakai untuk presentasi owner, bukan untuk deploy.
//
// `base: './'` WAJIB: tanpa itu, aset di dalam HTML akan requesting path
// absolut seperti `/assets/index-xxx.js`, dan file:// itu akar drive-nya —
// jadi presentasi membuka halaman kosong.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // HTML terpisah (`presentasi.html`) yang memuat entry HashRouter. Tanpa
    // file ini, Vite memakai `index.html` sebagai entry dan hasilnya memakai
    // BrowserRouter — yang tidak bisa dibuka sebagai file://.
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'presentasi.html'),
    },
    outDir: path.resolve(import.meta.dirname, 'dist-presentasi'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
