import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontendPort = Number(process.env.AUDIO_FRONTEND_PORT || 3000);
const backendPort = process.env.AUDIO_BACKEND_PORT || 3001;
const douyinPort = process.env.AUDIO_DOUYIN_PORT || 5005;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: frontendPort,
    proxy: {
      '/api/douyin': `http://127.0.0.1:${douyinPort}`,
      '/api': `http://127.0.0.1:${backendPort}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});