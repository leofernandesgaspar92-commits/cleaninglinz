import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // API-Aufrufe an das Backend weiterleiten
    proxy: {
      '/api': 'http://localhost:4000',
      // AGI-Team-Dashboard (Multi-Agenten-System) auf Port 4100
      '/agi': { target: 'http://localhost:4100', rewrite: (p) => p.replace(/^\/agi/, '') },
    },
  },
});
