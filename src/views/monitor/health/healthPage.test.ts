/**
 * 监控健康页失败可见性回归锁（b98）。
 *
 * 立的案：`/metrics` 与连接池状态是 best-effort 支路，失败时原先只在
 * `metricsData.available=false` / `dbPool=null` 上留一个"空白"，页面既不标错也不提示；
 * 首次加载失败还会一直停在"加载中"。运维看到的"指标空白/连接池 0"与真实采集结果同形。
 *
 * 本文件钉四件事：
 * 1. 全成功 ⇒ 不得出现错误条（对照组：修法不得把正常轮变成每轮告警）；
 * 2. 指标摘要失败 ⇒ 错误条可见，且主链路数据照常渲染（两件事互不吞没）；
 *    （b138：指标改走 `GET /monitor/metrics-summary`——`/metrics` 在配置运维令牌后
 *     对浏览器恒 401，用裸 fetch 的旧实现使这些部署上"永久空白"；夹具随之改为
 *     该接口的失败，而不是 `fetch` 的失败）
 * 3. 连接池失败 ⇒ 错误条可见（分母是两路，不是"只看指标"）；
 * 4. 主链路失败 ⇒ 错误条可见；重试成功后错误条消失（提示必须有动作通道）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  getDbPool: vi.fn(),
  getMetricsSummary: vi.fn()
}))

vi.mock('@/utils/request', () => ({
  default: (...a: unknown[]) => hoisted.request(...a)
}))

vi.mock('@/api/monitor/server', () => ({
  getDbPool: (...a: unknown[]) => hoisted.getDbPool(...a),
  getMetricsSummary: (...a: unknown[]) => hoisted.getMetricsSummary(...a)
}))

vi.mock('@/composables/useMotion', () => ({
  useMotionPresets: () => ({ fadeInUp: {}, staggerChildren: () => ({}) })
}))

vi.mock('@/composables/useAutoRefresh', () => ({
  useAutoRefresh: () => {}
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import HealthPage from './index.vue'

const stubs = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button class="btn-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-alert': {
    props: ['title'],
    template: '<div class="alert-stub">{{ title }}<slot /></div>'
  },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-progress': { template: '<div />' },
  'el-switch': { template: '<div />' },
  'el-empty': { template: '<div />' }
}

const healthVo = { status: 'UP', db: 'UP', redis: 'UP', version: '0.3.0', diskSpace: 'UP' }
const serverVo = {
  cpu: { cpuNum: 4, cpuUsage: 12.5, sys: 1, free: 3 },
  mem: { total: 16, used: 8, free: 8, usage: 50 },
  sys: { computerName: 'dev', osName: 'Windows', computerIp: '127.0.0.1', osArch: 'x64', userDir: 'D:/app' },
  jvm: { startTime: '2026-10-27 00:00:00', runTime: '1小时' },
  sysFiles: []
}

function mountPage() {
  return mount(HealthPage, {
    global: {
      stubs,
      directives: { motion: {}, loading: {} }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.request.mockReset()
  hoisted.getDbPool.mockReset()
  hoisted.getMetricsSummary.mockReset()
  hoisted.request.mockImplementation(async (cfg: { url: string }) =>
    cfg.url === '/health' ? { data: healthVo } : { data: serverVo }
  )
  hoisted.getDbPool.mockResolvedValue({ data: { url: 'sqlite:./data/app.db', maxActive: 10, active: 1 } })
  hoisted.getMetricsSummary.mockResolvedValue({
    data: { dbBackend: 'sqlite', dbConnected: true, uptimeSeconds: 100, rssBytes: 1, vmsBytes: 2 }
  })
})

describe('监控健康页：支路失败必须可见', () => {
  it('全成功：不出现错误条（对照组）', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="health-load-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('UP')
    wrapper.unmount()
  })

  it('指标摘要失败：错误条可见且主链路数据照常渲染', async () => {
    hoisted.getMetricsSummary.mockRejectedValue(new Error('metrics summary failed'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="health-load-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('UP')
    wrapper.unmount()
  })

  it('连接池失败：错误条同样可见（两路都算失败）', async () => {
    hoisted.getDbPool.mockRejectedValue(new Error('db pool failed'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="health-load-error"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('主链路失败：错误条可见，重试成功后消失', async () => {
    let fail = true
    hoisted.request.mockImplementation(async (cfg: { url: string }) => {
      if (fail) throw new Error('network down')
      return cfg.url === '/health' ? { data: healthVo } : { data: serverVo }
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="health-load-error"]').exists()).toBe(true)

    fail = false
    const retryBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))
    expect(retryBtn).toBeTruthy()
    await retryBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="health-load-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('UP')
    wrapper.unmount()
  })
})
