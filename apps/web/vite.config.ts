import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    // Forward auth and MCP traffic to the API so the browser sees a single
    // origin and cookies / fetches Just Work without CORS gymnastics.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
      '/mcp': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
});
