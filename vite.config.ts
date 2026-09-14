/// <reference types="vitest" />
// defineConfig 取自 vitest/config：vite 的版本不认识 test 字段。
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { publicAssets } from './tools/public-assets.mjs';

export default defineConfig({
  // GitHub Pages 项目站点路径；本地 preview 仍可正常访问。
  base: process.env.GITHUB_ACTIONS ? '/dream-entry-book/' : './',
  plugins: [react(), {
    name: 'publish-listed-assets',
    apply: 'build',
    writeBundle(options) {
      for (const file of publicAssets(path => readFileSync(path, 'utf8'))) {
        const target = join(options.dir ?? 'dist', file);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join('public', file), target);
      }
    },
  }],
  server: { proxy: { '/api': 'http://127.0.0.1:62561' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:62561' } },
  build: { copyPublicDir: false, target: 'es2022', assetsInlineLimit: 2048, rollupOptions: { input: { main: 'index.html', callback: 'oauth-callback.html' } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
