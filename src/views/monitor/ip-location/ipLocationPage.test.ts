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
  // `label` 必须渲染出来：b145 的新判据要按字段定位标签（整页文本会把别处的同键命中算进来）
  'el-descriptions-item': {
    props: ['label'],
    template: '<div class="desc-item" :data-label="label"><slot /></div>'
  },
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

/**
 * 生产码（`IpLocationStatus`）真实产出的形状——五个新字段一个都不能少（AGENTS ㉓：
 * 夹具按产出码造，不按被测方的注释造。缺字段的夹具会让"字段驱动"的分支结构性不生效，
 * 而它恰好是本批要判的那件事）。
 */
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
  autoUpdateEnabled: false,
  configAvailable: true,
  accountIdPresent: false,
  accountIdUnreadable: false,
  licenseKeyPresent: false,
  licenseKeyUnreadable: false
}

const configVo = {
  updateSource: 'p3terx',
  maxmindAccountIdConfigured: false,
  maxmindLicenseKeyConfigured: false,
  autoUpdateEnabled: false,
  accountIdPresent: false,
  accountIdUnreadable: false,
  licenseKeyPresent: false,
  licenseKeyUnreadable: false
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

/**
 * b145（N-144-I）凭据与配置状态的三态显示。
 *
 * 立的案有两处，都在"界面撒谎"这一侧：
 * - 管理配置那一路服务端回的是 **200 + 默认值**（`get_status` 不把读失败扔掉的另一半有用数据
 *   一起丢），所以 `ip-location-load-error` 那条**不会亮**——屏幕平静地写着"更新源 P3TERX、
 *   凭据 否"，把一次 `sys_config` 读故障显示成"这个功能没开"。
 * - 凭据密文解不开（主密钥缺失/轮换过/密文损坏）也被旧口径折成"否"，于是运维去重填一个
 *   库里本来就有的凭据，而坏密文既看不见也清不掉（`clearCredentials` 只在"解密成功"时出现）。
 *
 * 四组各判一件事，且互为对照——只写前三条时，"永远显示无法解密"也能满足它们：
 * ① 读故障 ⇒ 专属告警 + 状态是"未取到"而非"否"；② 一个坏不连带另一个；
 * ③ 健康存量 ⇒ 两条告警都不出现、标签仍是"否"（零漂移）；④ 坏密文必须有清掉的出路。
 */
describe('ip-location 配置未取到与凭据解不开必须可区分（b145）', () => {
  /** 按字段取那一行描述项的文本（整页文本会把别处的同键命中算进来，㊷ 的变异教训） */
  function descText(wrapper: ReturnType<typeof mountPage>, label: string): string {
    return wrapper.find(`.desc-item[data-label="${label}"]`).text()
  }

  function mountWith(statusOver: Record<string, unknown> = {}, configOver: Record<string, unknown> = {}) {
    hoisted.getIpLocationStatus.mockResolvedValue({ data: { ...statusVo, ...statusOver } })
    hoisted.getIpLocationConfig.mockResolvedValue({ data: { ...configVo, ...configOver } })
    return mountPage()
  }

  it('管理配置读失败：专属告警出现，凭据与更新源一律显示「未取到」而不是「否/P3TERX」', async () => {
    const wrapper = mountWith({
      configAvailable: false,
      // 读失败时服务端交回的就是这一串默认值——界面不得据此下结论
      currentSource: 'p3terx',
      maxmindAccountIdConfigured: false,
      maxmindLicenseKeyConfigured: false
    })
    await flushPromises()

    expect(wrapper.find('[data-test="ip-location-config-unavailable"]').exists()).toBe(true)
    // 三个状态位都是"未取到"，不得有一个偷偷落到"否"或"P3TERX"
    for (const label of [
      'ipLocation.field.currentSource',
      'ipLocation.field.maxmindAccountId',
      'ipLocation.field.maxmindLicenseKey'
    ]) {
      expect(descText(wrapper, label)).toContain('ipLocation.stat.configUnavailable')
    }
    // 这条告警的出口是"重试取数"（数据没读到），不是"去重新保存凭据"
    const alert = wrapper.find('[data-test="ip-location-config-unavailable"]')
    expect(alert.text()).toContain('common.retry')
    // 反向：这**不是**请求失败，所以取数失败那条不该被顺手点亮（两条事实各有出口）
    expect(wrapper.find('[data-test="ip-location-load-error"]').exists()).toBe(false)
  })

  it('凭据解不开：只有坏的那一个报「无法解密」，出口是配置入口而不是重试', async () => {
    const wrapper = mountWith({
      accountIdPresent: true,
      accountIdUnreadable: true,
      licenseKeyPresent: true,
      licenseKeyUnreadable: false,
      maxmindLicenseKeyConfigured: true
    })
    await flushPromises()

    expect(wrapper.find('[data-test="ip-location-credential-unreadable"]').exists()).toBe(true)
    expect(descText(wrapper, 'ipLocation.field.maxmindAccountId')).toContain('ipLocation.stat.credentialUnreadable')
    // 一个坏不代表两个坏：另一条必须照常显示"已配置"，不得被连坐
    expect(descText(wrapper, 'ipLocation.field.maxmindLicenseKey')).toContain('common.yes')
    // 出口指向"重新保存凭据"，而不是"重试取数"（数据是好的，坏的是密文）
    const alert = wrapper.find('[data-test="ip-location-credential-unreadable"]')
    expect(alert.text()).toContain('ipLocation.btn.config')
    expect(alert.text()).not.toContain('common.retry')
    // 配置这一路读到了 ⇒ 不得同时点亮"未取到"那条
    expect(wrapper.find('[data-test="ip-location-config-unavailable"]').exists()).toBe(false)
  })

  it('对照组：健康存量部署的显示零漂移，两条告警都不出现', async () => {
    const wrapper = mountWith()
    await flushPromises()

    expect(wrapper.find('[data-test="ip-location-config-unavailable"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="ip-location-credential-unreadable"]').exists()).toBe(false)
    expect(descText(wrapper, 'ipLocation.field.maxmindAccountId')).toContain('common.no')
    expect(descText(wrapper, 'ipLocation.field.currentSource')).toContain('ipLocation.source.p3terxMirror')
  })

  it('坏密文必须有出路：present 但解不开时，配置对话框里仍给「清空已存储凭据」', async () => {
    const wrapper = mountWith(
      { accountIdPresent: true, accountIdUnreadable: true },
      { accountIdPresent: true, accountIdUnreadable: true }
    )
    await flushPromises()

    const configBtn = wrapper.findAll('.btn-stub').find((b) => b.text().includes('ipLocation.btn.config'))!
    await configBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('ipLocation.field.clearCredentials')

    // 对照组：库里根本没有凭据时不得出现这一项（否则"清空"成了常驻按钮）
    const clean = mountWith({ accountIdPresent: false, accountIdUnreadable: false })
    await flushPromises()
    const cleanBtn = clean.findAll('.btn-stub').find((b) => b.text().includes('ipLocation.btn.config'))!
    await cleanBtn.trigger('click')
    await flushPromises()
    expect(clean.text()).not.toContain('ipLocation.field.clearCredentials')
  })
})
