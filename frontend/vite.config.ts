import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  base: '/', // Explicit base path for production
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    // Paksa satu salinan react/react-dom: repo punya node_modules di root DAN
    // frontend; tanpa dedupe, sebagian import bisa teresolve ke salinan root
    // sehingga bundle memuat 2 React dan hook crash ("reading 'useContext'").
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
});
