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
    // 默认 5000ms 与"走全树的守卫"实测耗时只差 1.17 倍，于是绿红由机器负载决定（b88 实测：
    // 门禁电池整跑到 vitest 时，`e2eLocaleLabelSpacing` 的"刀口自证"隔离跑 **4281ms**、
    // 同轮超时判红，另有 `e2eCwdPath`/`e2eClickPolicy`/`permission` 共 5 条同时红；
    // 整跑单独复跑这四文件 34 条全绿、7.81s）。取 30s = 隔离最重的 ~7 倍余量。
    // 这条改的是**预算**不是**判据**：没有任何断言依赖耗时；真挂死的用例照样在 30s 失败，
    // 而"每批都要重新祈祷机器不忙"的门禁等于没有门禁（AGENTS 测试门禁全景 前言 ④）。
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true
    }
  }
})
