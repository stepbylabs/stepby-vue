/**
 * IP 库监控页"刷新提示必须等结局"回归锁（b95）。
 *
 * 立的案：`loadStatus` / `loadConfig` 各自 `.catch(() => {})`，于是
 * `Promise.all([...])` 永远 resolve ⇒ 网络故障时页面照样弹"刷新成功"，
 * 而屏幕上保留的是旧状态，运维据此以为库已就绪。
 *
 * 本文件钉三件事：
 * 1. 初次加载有一路失败 ⇒ 顶部错误条可见、不弹成功；
 * 2. 重试两路都成功 ⇒ 弹一次成功且错误条消失；
 * 3. 刷新时只有一路失败 ⇒ **不弹成功**、错误条保留（分母是两路，不是"至少一路"）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getIpLocationStatus: vi.fn(),
  getIpLocationConfig: vi.fn(),
  saveIpLocationConfig: vi.fn(),
  updateIpLocationNow: vi.fn(),
  reloadIpLocation: vi.fn(),
  reloadIpXdb: vi.fn(),
  msgSuccess: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn()
}))

vi.mock('@/api/monitor/ipLocation', () => ({
  getIpLocationStatus: (...a: unknown[]) => hoisted.getIpLocationStatus(...a),
  getIpLocationConfig: (...a: unknown[]) => hoisted.getIpLocationConfig(...a),
  saveIpLocationConfig: (...a: unknown[]) => hoisted.saveIpLocationConfig(...a),
  updateIpLocationNow: (...a: unknown[]) => hoisted.updateIpLocationNow(...a),
  reloadIpLocation: (...a: unknown[]) => hoisted.reloadIpLocation(...a),
  reloadIpXdb: (...a: unknown[]) => hoisted.reloadIpXdb(...a)
}))

vi.mock('@/plugins/modal', () => ({
  default: {
    msgSuccess: (...a: unknown[]) => hoisted.msgSuccess(...a),
    msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a),
    confirm: (...a: unknown[]) => hoisted.confirm(...a)
  }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import IpLocation from './index.vue'

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
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio': { template: '<label><slot /></label>' },
  'el-switch': { template: '<div />' },
  'el-checkbox': { template: '<label><slot /></label>' },
  'el-text': { template: '<span><slot /></span>' }
}

function mountPage() {
  return mount(IpLocation, {
    global: {
      stubs,
      directives: { hasPermi: {}, loading: {} }
    }
  })
}

const statusVo = {
  mmdbLoaded: true,
  xdbLoaded: true,
  currentSource: 'p3terx',
  mmdbSize: 1024,
  mmdbModified: 1_760_000_000,
  mmdbPath: 'data/ip.mmdb',
  maxmindAccountIdConfigured: false,
  maxmindLicenseKeyConfigured: false,
  autoUpdateCron: '0 0 3 * * *',
  autoUpdateEnabled: false
}

const configVo = {
  updateSource: 'p3terx',
  maxmindAccountIdConfigured: false,
  maxmindLicenseKeyConfigured: false,
  autoUpdateEnabled: false
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.getIpLocationStatus.mockReset()
  hoisted.getIpLocationConfig.mockReset()
})

describe('ip-location 刷新提示必须等结局', () => {
  it('初次加载有一路失败：错误条可见且不弹成功', async () => {
    hoisted.getIpLocationStatus.mockRejectedValue(new Error('status failed'))
    hoisted.getIpLocationConfig.mockResolvedValue({ data: configVo })

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-test="ip-location-load-error"]').exists()).toBe(true)
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('重试两路都成功：弹一次成功且错误条消失', async () => {
    hoisted.getIpLocationStatus
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ data: statusVo })
    hoisted.getIpLocationConfig.mockResolvedValue({ data: configVo })

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="ip-location-load-error"]').exists()).toBe(true)

    const retryBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))!
    await retryBtn.trigger('click')
    await flushPromises()

    expect(hoisted.msgSuccess).toHaveBeenCalledTimes(1)
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('common.success')
    expect(wrapper.find('[data-test="ip-location-load-error"]').exists()).toBe(false)
  })

  it('刷新时只有一路失败：不得弹成功，错误条保留', async () => {
    hoisted.getIpLocationStatus.mockResolvedValue({ data: statusVo })
    hoisted.getIpLocationConfig
      .mockResolvedValueOnce({ data: configVo })
      .mockRejectedValueOnce(new Error('config refresh failed'))

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="ip-location-load-error"]').exists()).toBe(false)
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()

    const refreshBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.refresh'))!
    await refreshBtn.trigger('click')
    await flushPromises()

    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="ip-location-load-error"]').exists()).toBe(true)
  })
})
