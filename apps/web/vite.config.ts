import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env['VITE_API_URL'] ?? 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: process.env['VITE_API_URL'] ?? 'http://localhost:3001', changeOrigin: true },
    },
  },
});
