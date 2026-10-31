/**
 * components/CommandPalette 覆盖测试（批六十五覆盖率工程）。
 *
 * 覆盖真实行为：显隐渲染 / 菜单跳转命令收集（嵌套路由 + hidden 过滤 + http 过滤）/
 * 系统命令集合 / 关键字过滤（title·description·category）/ 键盘导航（↑↓ 钳制、Enter 执行、
 * Esc 关闭）/ 全局搜索模式（≥2 字符 → 300ms 防抖 → 结果映射、过期响应丢弃、外链 vs 路由）/
 * 执行异常兜底（modal.msgError）/ 点击执行 / 关闭回焦点。
 *
 * 仅 mock 重依赖（5 个 Pinia store / router / modal / api / 图标）——不 mock 组件自身逻辑。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const hoisted = vi.hoisted(() => ({
  routes: [] as unknown[],
  push: vi.fn(),
  route: { fullPath: '/dashboard' },
  toggleTheme: vi.fn(),
  isDark: false,
  toggleSideBar: vi.fn(),
  lockScreen: vi.fn(),
  userId: 1,
  logOut: vi.fn(() => Promise.resolve()),
  confirm: vi.fn(() => Promise.resolve()),
  msgError: vi.fn(),
  globalSearch: vi.fn(),
  goLogin: vi.fn()
}))

vi.mock('@element-plus/icons-vue', () => {
  const stub = { name: 'IconStub', render: () => null }
  return {
    Search: stub,
    Moon: stub,
    Sunny: stub,
    FullScreen: stub,
    Lock: stub,
    Fold: stub,
    Expand: stub,
    RefreshRight: stub,
    User: stub,
    Link: stub,
    Loading: stub,
    WarningFilled: stub
  }
})

vi.mock('@/store/modules/permission', () => ({
  default: () => ({ routes: hoisted.routes })
}))
vi.mock('@/store/modules/settings', () => ({
  default: () => ({
    get isDark() {
      return hoisted.isDark
    },
    toggleTheme: hoisted.toggleTheme
  })
}))
vi.mock('@/store/modules/app', () => ({ default: () => ({ toggleSideBar: hoisted.toggleSideBar }) }))
vi.mock('@/store/modules/lock', () => ({ default: () => ({ lockScreen: hoisted.lockScreen }) }))
vi.mock('@/store/modules/user', () => ({
  default: () => ({
    get id() {
      return hoisted.userId
    },
    logOut: hoisted.logOut
  })
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: hoisted.push }),
  useRoute: () => hoisted.route
}))
vi.mock('@/plugins/modal', () => ({
  default: { confirm: hoisted.confirm, msgError: hoisted.msgError }
}))
vi.mock('@/api/common', () => ({ globalSearch: hoisted.globalSearch }))
vi.mock('@/utils/navigation', () => ({ goLogin: hoisted.goLogin }))
vi.mock('@/composables/useMenuTitle', () => ({
  translateTitle: (meta: { title?: string } | undefined) => meta?.title ?? ''
}))

import CommandPalette from './index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      commandPalette: {
        category: { menuJump: 'Jump', systemAction: 'System' },
        cmd: {
          toggleDark: 'Toggle dark',
          toggleFullscreen: 'Fullscreen',
          toggleSidebar: 'Sidebar',
          refreshPage: 'Refresh',
          lockScreen: 'Lock',
          profile: 'Profile',
          githubRepo: 'GitHub',
          logout: 'Logout'
        },
        confirmLogout: 'Confirm logout?',
        executeFail: 'Execute failed',
        searchFailed: 'Search failed',
        noSearchResult: 'No result',
        searching: 'Searching',
        searchType: { user: 'User' }
      },
      common: { retry: 'Retry' }
    }
  }
})

const stubs = {
  teleport: true,
  transition: true,
  'el-icon': { template: '<i><slot /></i>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'svg-icon': { template: '<i />' }
}

function factory(props: Record<string, unknown> = {}) {
  return mount(CommandPalette, {
    props: { visible: true, ...props },
    global: { plugins: [i18n], stubs }
  })
}

describe('components/CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.routes = [
      {
        path: '/system',
        meta: { title: 'System' },
        children: [
          { path: 'user', name: 'User', meta: { title: 'User' } },
          { path: 'hidden', name: 'H', hidden: true, meta: { title: 'Hidden' } }
        ]
      },
      { path: 'http://ext.test/x', name: 'ExtLink', meta: { title: 'ExtLink' } }
    ]
    hoisted.globalSearch.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('visible=false 不渲染，true 渲染并聚焦输入框', async () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const w = factory({ visible: false })
    expect(w.find('.command-palette').exists()).toBe(false)
    await w.setProps({ visible: true })
    await nextTick()
    await nextTick()
    expect(w.find('.command-palette').exists()).toBe(true)
    expect(w.find('input').exists()).toBe(true)
    expect(focusSpy).toHaveBeenCalled()
    focusSpy.mockRestore()
  })

  it('收集菜单跳转命令（嵌套路由、过滤 hidden 与 http）', async () => {
    const w = factory()
    await nextTick()
    const text = w.text()
    expect(text).toContain('User')
    expect(text).toContain('/system/user')
    expect(text).not.toContain('Hidden')
    // 系统命令存在
    expect(text).toContain('Toggle dark')
    expect(text).toContain('Logout')
  })

  it('关键字过滤：本地命令在 ≥2 字符时仍可检索（不被全局搜索吞掉）', async () => {
    const w = factory()
    await nextTick()
    await w.find('input').setValue('logout')
    await nextTick()
    // 本地命令命中保留（"Logout"），非命中项被过滤
    expect(w.text()).toContain('Logout')
    expect(w.text()).not.toContain('Toggle dark')
  })

  it('键盘：↓↑ 钳制、Enter 执行、Esc 关闭', async () => {
    const w = factory()
    await nextTick()
    const input = w.find('input')
    // 无查询时命令数 > 1；连续 ArrowDown 不越界
    for (let i = 0; i < 50; i++) await input.trigger('keydown', { key: 'ArrowDown' })
    const items = w.findAll('.palette-item')
    expect(items.length).toBeGreaterThan(0)
    expect(items.at(-1)!.classes()).toContain('active')
    // ArrowUp 回到顶部
    for (let i = 0; i < 50; i++) await input.trigger('keydown', { key: 'ArrowUp' })
    expect(w.findAll('.palette-item')[0].classes()).toContain('active')
    // Esc 关闭
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  })

  it('Enter 执行选中命令（跳转 router.push）', async () => {
    const w = factory()
    await nextTick()
    const input = w.find('input')
    await input.trigger('keydown', { key: 'Enter' })
    expect(hoisted.push).toHaveBeenCalled()
  })

  it('全局搜索：≥2 字符 → 300ms 防抖 → 结果映射与分组标签', async () => {
    vi.useFakeTimers()
    hoisted.globalSearch.mockResolvedValue({
      data: [
        { type: 'user', id: 7, title: 'Alice', subtitle: 'a@x.test', url: '/system/user/7' },
        { type: 'doc', id: 8, title: 'Doc', subtitle: 'd', url: 'https://doc.test/x' }
      ]
    })
    const w = factory()
    await nextTick()
    await w.find('input').setValue('al')
    await nextTick()
    vi.advanceTimersByTime(300)
    await vi.waitFor(() => expect(hoisted.globalSearch).toHaveBeenCalledWith('al', 20))
    await nextTick()
    const text = w.text()
    expect(text).toContain('Alice')
    expect(text).toContain('User') // te 命中翻译
    expect(text).toContain('doc') // te 未命中 → 原样
  })

  it('搜索结果：外链新窗口打开 / 应用内路由 push', async () => {
    vi.useFakeTimers()
    const openSpy = vi.fn()
    const origOpen = window.open
    Object.defineProperty(window, 'open', { value: openSpy, writable: true, configurable: true })
    hoisted.globalSearch.mockResolvedValue({
      data: [
        { type: 'doc', id: 9, title: 'Ext', subtitle: 's', url: 'https://ext.test/a' },
        { type: 'doc', id: 11, title: 'Proto', subtitle: 'p', url: '//cdn.test/b' },
        { type: 'doc', id: 10, title: 'Inner', subtitle: 'i', url: '/system/user' }
      ]
    })
    const w = factory()
    await nextTick()
    await w.find('input').setValue('ex')
    await nextTick()
    vi.advanceTimersByTime(300)
    await vi.waitFor(() => expect(w.text()).toContain('Ext'))
    await nextTick()
    // 外链 → window.open
    await w.findAll('.palette-item')[0].trigger('click')
    expect(openSpy).toHaveBeenCalledWith('https://ext.test/a', '_blank', 'noopener,noreferrer')
    // 协议相对地址同样是外链（旧写法只认 ^https?:// ⇒ 会落进 router.push）
    await w.findAll('.palette-item')[1].trigger('click')
    expect(openSpy).toHaveBeenCalledWith('//cdn.test/b', '_blank', 'noopener,noreferrer')
    // 应用内路由 → router.push
    await w.findAll('.palette-item')[2].trigger('click')
    expect(hoisted.push).toHaveBeenCalledWith('/system/user')
    Object.defineProperty(window, 'open', { value: origOpen, writable: true, configurable: true })
  })

  it('搜索结果：mailto/tel 交给系统处理，不得 router.push（会落 404 页）', async () => {
    vi.useFakeTimers()
    const assignSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign: assignSpy })
    hoisted.globalSearch.mockResolvedValue({
      data: [{ type: 'doc', id: 12, title: 'Mail', subtitle: 'm', url: 'mailto:a@x.test' }]
    })
    const w = factory()
    await nextTick()
    await w.find('input').setValue('mail')
    await nextTick()
    vi.advanceTimersByTime(300)
    await vi.waitFor(() => expect(w.text()).toContain('Mail'))
    await nextTick()
    await w.findAll('.palette-item')[0].trigger('click')
    expect(assignSpy).toHaveBeenCalledWith('mailto:a@x.test')
    expect(hoisted.push).not.toHaveBeenCalledWith('mailto:a@x.test')
    vi.unstubAllGlobals()
  })

  it('搜索接口失败 → 显式失败态（不得显示成「未找到」），重试可恢复', async () => {
    vi.useFakeTimers()
    hoisted.globalSearch.mockRejectedValueOnce(new Error('boom'))
    const w = factory()
    await nextTick()
    await w.find('input').setValue('zz')
    await nextTick()
    vi.advanceTimersByTime(300)
    await vi.waitFor(() => expect(hoisted.globalSearch).toHaveBeenCalled())
    await nextTick()
    await nextTick()
    // 失败态必须与「没有结果」可区分：一次网络故障不能说成"系统里没有"
    expect(w.text()).toContain('Search failed')
    expect(w.text()).not.toContain('No result')

    // 重试：第二次成功 ⇒ 结果可见、失败态消失
    hoisted.globalSearch.mockResolvedValueOnce({
      data: [{ type: 'user', id: 9, title: 'Bob', subtitle: 'b', url: '/system/user/9' }]
    })
    const retryBtn = w.findAll('button').find((b) => b.text() === 'Retry')
    expect(retryBtn, '失败态必须带可点击的重试入口').toBeTruthy()
    await retryBtn!.trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('Bob'))
    expect(w.text()).not.toContain('Search failed')
  })

  it('执行命令抛异常 → modal.msgError 兜底', async () => {
    hoisted.toggleTheme.mockImplementation(() => {
      throw new Error('x')
    })
    const w = factory()
    await nextTick()
    await w.find('input').setValue('toggle dark')
    await nextTick()
    await w.findAll('.palette-item')[0].trigger('click')
    expect(hoisted.msgError).toHaveBeenCalled()
  })

  it('遮罩点击 → 关闭', async () => {
    const w = factory()
    await nextTick()
    await w.find('.command-palette-mask').trigger('click')
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  })
})
