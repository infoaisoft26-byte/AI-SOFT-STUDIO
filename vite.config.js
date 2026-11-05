import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        admin: resolve(process.cwd(), 'admin.html'),
        whatsapp: resolve(process.cwd(), 'whatsapp.html'),
        company: resolve(process.cwd(), 'company.html'),
        register: resolve(process.cwd(), 'register.html'),
        saasAdmin: resolve(process.cwd(), 'saas-admin.html'),
        companies: resolve(process.cwd(), 'companies.html'),
      },
    },
  },
});
