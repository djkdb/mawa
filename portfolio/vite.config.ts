import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: { output: { manualChunks: (id) => (/node_modules\/(three|@react-three)/.test(id) ? 'three' : undefined) } },
  },
});
