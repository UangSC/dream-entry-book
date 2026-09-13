/// <reference types="vitest" />
// defineConfig 取自 vitest/config：vite 的版本不认识 test 字段。
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', assetsInlineLimit: 2048 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
