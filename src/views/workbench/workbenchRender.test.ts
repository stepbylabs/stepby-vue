/**
 * 工作台页面渲染冒烟（b107）。
 *
 * 立案：本轮把三个统计源迁到 `useWidgetLoad` 时，模板里还留着一处对旧变量
 * `unreadNotices` 的引用（`unreadNotices.length`）——`vue-tsc` 在非 strictTemplates
 * 下不报未定义标识符，页面在真机上被 ErrorBoundary 整页卸载。
 * 这条用例不测样式，只钉两件事：
 * ① 模板引用的每个状态都真的存在（挂载即可暴露 undefined 取值）；
 * ② 取数全失败时页面仍渲染失败态（statsPartialFail / unreadLoadFail），不炸页。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  request: vi.fn(),
  listNoticeTop: vi.fn(),
  listOnline: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
  useRoute: () => ({ fullPath: '/workbench/index' })
}))

vi.mock('@/store/modules/user', () => ({
  default: () => ({ id: 1, name: 'admin', nickName: 'Admin', avatar: '', deptName: '', roles: ['admin'] })
}))

vi.mock('@/store/modules/lock', () => ({ default: () => ({ lockScreen: vi.fn() }) }))

vi.mock('@/composables/useMenuFavorites', () => ({
  useMenuFavorites: () => ({ favorites: { value: [] } })
}))

vi.mock('@/composables/useRecentViews', () => ({
  useRecentViews: () => ({ recentViews: { value: [] } })
}))

vi.mock('@/composables/useMenuTitle', () => ({
  translateTitle: (item: { title: string }) => item.title
}))

vi.mock('@/api/system/notice', () => ({ listNoticeTop: () => hoisted.listNoticeTop() }))
vi.mock('@/api/monitor/online', () => ({ list: () => hoisted.listOnline() }))
vi.mock('@/utils/request', () => ({ default: () => hoisted.request() }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k, te: () => true }) }
})

import Workbench from './index.vue'

const iconStub = { template: '<i />' }
const stubs: Record<string, unknown> = {
  'el-card': { template: '<section><slot name="header" /><slot /></section>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}<slot /></div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}<slot /></div>' },
  'el-badge': { template: '<span><slot /></span>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-divider': { template: '<span />' },
  'el-avatar': { props: ['src', 'alt'], template: '<img :src="src" :alt="alt" />' },
  Transition: { template: '<div><slot /></div>' },
  transition: { template: '<div><slot /></div>' }
}
for (const name of [
  'Calendar',
  'OfficeBuilding',
  'User',
  'UserFilled',
  'Bell',
  'Histogram',
  'Monitor',
  'StarFilled',
  'Clock',
  'Delete',
  'Grid',
  'Document',
  'Setting',
  'Lock',
  'Edit'
]) {
  stubs[name] = iconStub
}

const globalOptions = { stubs, directives: { loading: {} } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Workbench：模板状态完整性与失败态', () => {
  it('正常取数：页面渲染统计与区块（模板引用的变量全部存在）', async () => {
    hoisted.request.mockResolvedValue({ data: [] })
    hoisted.listNoticeTop.mockResolvedValue({ data: [] })
    hoisted.listOnline.mockResolvedValue({ rows: [] })
    const w = mount(Workbench, { global: globalOptions })
    await flushPromises()
    const text = w.text()
    for (const key of [
      'workbench.weekLogins',
      'workbench.unreadNotices',
      'workbench.activeSessions',
      'workbench.favorites',
      'workbench.unreadTitle',
      'workbench.shortcutTitle'
    ]) {
      expect(text, `缺少区块 ${key}`).toContain(key)
    }
    expect(w.find('.alert-stub').exists()).toBe(false)
  })

  it('三项取数全失败：仍渲染失败态与重试，不崩溃', async () => {
    hoisted.request.mockRejectedValue(new Error('down'))
    hoisted.listNoticeTop.mockRejectedValue(new Error('down'))
    hoisted.listOnline.mockRejectedValue(new Error('down'))
    const w = mount(Workbench, { global: globalOptions })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('workbench.statsPartialFail')
    expect(text).toContain('workbench.unreadLoadFail')
    expect(text).toContain('common.retry')
    // 统计值在从未加载成功时显示 `—`，不得把失败写成 0
    expect(text).toContain('—')
  })
})
