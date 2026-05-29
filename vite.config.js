import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        promo: resolve(__dirname, 'promo.html'),
        cuenta: resolve(__dirname, 'cuenta.html'),
      },
    },
  },
});
