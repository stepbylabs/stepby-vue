import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import createAutoImport from './vite/plugins/auto-import'

// https://vitest.dev/config/
// 独立的 vitest 配置文件，避免污染 vite.config.ts
// 注意：与生产 vite 配置一致地注入 unplugin-auto-import，
// 使 src 内以裸标识符使用的 vue / vue-router / pinia API（ref、computed、watch、
// defineStore、nextTick 等）在测试运行时也能被静态注入，无需在测试里手工挂 globalThis。
export default defineConfig({
  plugins: [vue(), createAutoImport()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true
    }
  }
})
