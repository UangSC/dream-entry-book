/// <reference types="vitest" />
// defineConfig 取自 vitest/config：vite 的版本不认识 test 字段。
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 项目站点路径；本地 preview 仍可正常访问。
  base: process.env.GITHUB_ACTIONS ? '/dream-entry-book/' : './',
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:62561' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:62561' } },
  build: { target: 'es2022', assetsInlineLimit: 2048, rollupOptions: { input: { main: 'index.html', callback: 'oauth-callback.html' } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
