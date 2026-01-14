import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './', // Important for Electron file loading
    root: path.join(__dirname, 'src/renderer'),
    build: {
        outDir: path.join(__dirname, 'dist/renderer'),
        emptyOutDir: true,
    },
    envDir: __dirname, // Load .env from project root
    server: {
        port: 3000,
    }
});
