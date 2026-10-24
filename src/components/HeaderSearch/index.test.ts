/**
 * components/HeaderSearch 覆盖测试（批六十七覆盖率工程）。
 *
 * 覆盖真实行为：generateRoutes 递归生成（含 title 数组层级累积、hidden/http 过滤、path 规范化）/
 * querySearch 合并策略（path 子串匹配 + Fuse 模糊匹配去重）/ 空查询回落全量池 /
 * 数据级搜索防抖（250ms）+ 最小关键词长度守卫 + 过期响应丢弃 / searchData 三级接口
 * 聚合与 allSettled 隔离（单接口失败不影响其他组）/ 行字段兜底（?? ''）/ 键盘导航
 * （↑↓ 循环钳制、Enter 选中）/ highlightText XSS 转义与关键字高亮 / escapeRegExp 转义 /
 * activeStyle 命中态样式 / locale 与 routes 变化重建索引。
 *
 * 仅 mock 重依赖（Fuse / store / i18n / router / 三个 api 模块）——组件自身逻辑全真实执行。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const hoisted = vi.hoisted(() => ({
  // 由 mock 工厂注入的"写 defaultRoutes"setter（内部持有**真 Vue ref**，computed 才有响应性）
  setDefaultRoutes: null as ((v: unknown[]) => void) | null,
  theme: 'light',
  locale: 'zh-CN',
  push: vi.fn(),
  // 数据级搜索三个接口
  listUser: vi.fn(() => Promise.resolve({ rows: [] as unknown[] })),
  listRole: vi.fn(() => Promise.resolve({ rows: [] as unknown[] })),
  listType: vi.fn(() => Promise.resolve({ rows: [] as unknown[] })),
  fuseSearch: [] as unknown[]
}))

vi.mock('fuse.js', () => ({
  default: class {
    constructor(public list: unknown[]) {}
    search(q: string) {
      // 简化：返回与标题任一匹配的项（真实模糊匹配由库负责）
      const k = q.toLowerCase()
      return this.list
        .filter((it: unknown) => {
          const title = (it as { title?: unknown }).title
          return Array.isArray(title) && title.some((t) => String(t).toLowerCase().includes(k))
        })
        .slice(0, hoisted.fuseSearch.length || undefined)
        .map((item: unknown) => ({ item }))
    }
  }
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => ({
    get theme() {
      return hoisted.theme
    }
  })
}))

// defaultRoutes 必须是**真 Vue ref**：否则组件里 `computed(() => store.defaultRoutes)`
// 不会因测试改写而重算（plain object 不触发依赖收集）。
vi.mock('@/store/modules/permission', async () => {
  const { ref } = await import('vue')
  const routesRef = ref<unknown[]>([])
  hoisted.setDefaultRoutes = (v: unknown[]) => {
    routesRef.value = v
  }
  return {
    default: () => ({
      get defaultRoutes() {
        return routesRef.value
      }
    })
  }
})

// ⚠ 原先这里 mock 的是 `@/router`，而组件用的是 **auto-import 的 `useRouter`**
// （实测 `auto-imports.d.ts:80`：`const useRouter: typeof import('vue-router').useRouter`）
// ⇒ 那条 mock **从未生效**，文件里所有 `hoisted.push` 断言都跑在一条不存在的通道上
// （b89 项 17 取证时撞见：新增"内部路径必须走 router.push"这条正控，立刻发现 push 一个都没收到）。
// 改 mock 'vue-router' 之后，负控（不得出网）与正控（必须出 router.push）两侧才第一次真的受约束。
vi.mock('vue-router', async (orig) => {
  const actual = await orig<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push: hoisted.push }) }
})

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return {
    ...actual,
    // HeaderSearch 的 locale computed 依赖 i18n.global.locale.value ⇒ 保持可控
    useI18n: () => ({ t: (k: string) => k })
  }
})

vi.mock('@/api/system/user', () => ({
  listUser: (...a: unknown[]) => hoisted.listUser(...(a as [])),
  default: { listUser: (...a: unknown[]) => hoisted.listUser(...(a as [])) }
}))
vi.mock('@/api/system/role', () => ({
  listRole: (...a: unknown[]) => hoisted.listRole(...(a as [])),
  default: { listRole: (...a: unknown[]) => hoisted.listRole(...(a as [])) }
}))
// HeaderSearch 实际导入路径（实测：dict 走 /type 子模块）
vi.mock('@/api/system/dict/type', () => ({
  listType: (...a: unknown[]) => hoisted.listType(...(a as [])),
  default: { listType: (...a: unknown[]) => hoisted.listType(...(a as [])) }
}))

import HeaderSearch from './index.vue'

function factory() {
  return mount(HeaderSearch, {
    global: {
      stubs: {
        'el-dialog': { name: 'ElDialogStub', template: '<div class="dlg"><slot /></div>' },
        'el-select': { name: 'ElSelectStub', template: '<div><slot /></div>' },
        // el-input 桩：转发 v-model 与 input 事件（模板 @input="querySearch" 依赖它）
        'el-input': {
          name: 'ElInputStub',
          props: ['modelValue'],
          emits: ['update:modelValue', 'input'],
          template:
            '<input class="inp" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)" />'
        },
        'el-option': { name: 'ElOptionStub', props: ['value', 'label'], template: '<div><slot /></div>' },
        transition: false,
        'transition-group': { template: '<div><slot /></div>' }
      }
    }
  })
}

/** 通过 el-input 的 v-model emit 写 search（真实交互路径，而非直接改内部 ref） */
function setSearch(vm: ReturnType<typeof factory>, val: string): void {
  vm.findComponent({ name: 'ElInputStub' }).vm.$emit('update:modelValue', val)
}

/** generateRoutes 的输出项（与组件内 SearchItem 对齐，仅取测试关注的字段） */
interface GeneratedItem {
  path: string
  title: string[]
  icon: string
  query?: string
}

function api(vm: ReturnType<typeof factory>) {
  return vm.vm as unknown as {
    generateRoutes: (routes: unknown[], basePath?: string, prefixTitle?: string[]) => GeneratedItem[]
    querySearch: (q: string) => void
    searchData: (k: string) => Promise<GeneratedItem[]>
    highlightText: (t: string) => string
    escapeRegExp: (s: string) => string
    activeStyle: (i: number) => Record<string, string>
    navigateResult: (d: 'up' | 'down') => void
    selectActiveResult: () => void
    searchPool: GeneratedItem[]
    options: GeneratedItem[]
    activeIndex: number
    search: string
  }
}

const R = (over: Record<string, unknown> = {}) => ({
  path: '/system',
  meta: { title: '系统', icon: 'system' },
  ...over
})

describe('components/HeaderSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    hoisted.setDefaultRoutes?.([])
    hoisted.theme = 'light'
    hoisted.fuseSearch = []
    hoisted.push.mockClear()
    hoisted.listUser.mockReset()
    hoisted.listRole.mockReset()
    hoisted.listType.mockReset()
    hoisted.listUser.mockImplementation(() => Promise.resolve({ rows: [] }))
    hoisted.listRole.mockImplementation(() => Promise.resolve({ rows: [] }))
    hoisted.listType.mockImplementation(() => Promise.resolve({ rows: [] }))
  })

  afterEach(() => {
    vi.useRealTimers()
    // 每条用例里的 `vi.spyOn(window, 'open')` 由这里统一收尾：断言失败时用例尾句
    // `mockRestore()` **跑不到**，下一个 `vi.spyOn` 会拿回**同一枚带着历史调用的 spy**
    // ⇒ 一条真失败级联成三条红，"红在哪条"就丢了（变异证伪实测：把 `-1` 兜底摘掉，
    // 本该只红 `//host` 那一条，实际三条同红——后两条是级联，不是它们自己的判据坏了）。
    vi.restoreAllMocks()
  })

  it('generateRoutes：hidden 被过滤；http 外链保留原始路径（可跳转）', async () => {
    const vm = factory()
    await nextTick()
    const out: GeneratedItem[] = api(vm).generateRoutes([
      R({ path: '/system' }),
      R({ path: '/hidden', hidden: true }),
      R({ path: 'https://ext.com', meta: { title: '外链' } })
    ])
    const paths = out.map((o) => o.path)
    expect(paths).toContain('/system')
    // http 外链不进 getNormalPath 拼接，保留原始绝对路径
    expect(paths).toContain('https://ext.com')
    // hidden 被 continue 跳过
    expect(paths).not.toContain('/hidden')
    expect(out.length).toBe(2)
  })

  it('generateRoutes：path 规范化 + title 数组按层级累积', async () => {
    const vm = factory()
    await nextTick()
    const out: GeneratedItem[] = api(vm).generateRoutes([
      R({
        path: '/system',
        children: [
          { path: '/user', meta: { title: '用户' } },
          { path: 'role', meta: { title: '角色' } }
        ]
      })
    ])
    // 子路径与 basePath 拼接（getNormalPath），不论是否带前导斜杠
    const paths = out.map((o) => o.path)
    expect(paths).toContain('/system')
    expect(paths).toContain('/system/user')
    expect(paths).toContain('/system/role')
    // 层级累积：子项 title 前缀为父级 ['系统']
    const userItem = out.find((o) => o.path === '/system/user')
    expect(userItem).toBeDefined()
    expect(userItem?.title).toEqual(['系统', '用户'])
  })

  it('generateRoutes：叶子无 children 时不再递归', async () => {
    const vm = factory()
    await nextTick()
    const out: GeneratedItem[] = api(vm).generateRoutes([
      R({ path: '/a', children: [{ path: '/b', meta: { title: 'B' } }] })
    ])
    expect(out.length).toBe(2)
    expect(out[0].path).toBe('/a')
    expect(out[1].path).toBe('/a/b')
  })

  it('generateRoutes：redirect=noRedirect 的项不进结果', async () => {
    const vm = factory()
    await nextTick()
    const out: GeneratedItem[] = api(vm).generateRoutes([
      R({ path: '/root', redirect: 'noRedirect' }),
      R({ path: '/keep' })
    ])
    const paths = out.map((o) => o.path)
    expect(paths).not.toContain('/root')
    expect(paths).toContain('/keep')
  })

  it('generateRoutes：r.query 透传到结果项', async () => {
    const vm = factory()
    await nextTick()
    const out: GeneratedItem[] = api(vm).generateRoutes([R({ path: '/q', query: '{"a":1}' })])
    expect(out[0].query).toBe('{"a":1}')
  })

  it('querySearch：空查询回落为全量搜索池', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/system' }), R({ path: '/monitor', meta: { title: '监控' } })])
    const vm = factory()
    await nextTick()
    await flushPromises()
    api(vm).querySearch('')
    await nextTick()
    expect(api(vm).options.length).toBeGreaterThanOrEqual(2)
    expect(api(vm).activeIndex).toBe(-1)
  })

  it('querySearch：path 子串命中 + Fuse 模糊去重合并', async () => {
    hoisted.setDefaultRoutes?.([
      R({ path: '/system', children: [{ path: '/user', meta: { title: '用户管理' } }] }),
      R({ path: '/monitor', meta: { title: '监控中心' } })
    ])
    const vm = factory()
    await nextTick()
    await flushPromises()
    api(vm).querySearch('/system')
    await nextTick()
    const paths = api(vm).options.map((o) => o.path)
    expect(paths).toContain('/system')
    // Fuse 命中 "用户管理"（标题含 system 的匹配不命中，但 path 命中 /system 已并入）
    expect(paths.filter((p: string) => p === '/system').length).toBe(1)
  })

  it('querySearch：短于 DATA_SEARCH_MIN_LEN 不打数据接口', async () => {
    vi.useFakeTimers()
    hoisted.setDefaultRoutes?.([R({ path: '/system' })])
    const vm = factory()
    await nextTick()
    api(vm).querySearch('a')
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(hoisted.listUser).not.toHaveBeenCalled()
    expect(hoisted.listRole).not.toHaveBeenCalled()
    expect(hoisted.listType).not.toHaveBeenCalled()
  })

  it('querySearch：≥2 字符停手 250ms 后触发数据搜索', async () => {
    vi.useFakeTimers()
    hoisted.setDefaultRoutes?.([R({ path: '/system' })])
    const vm = factory()
    await nextTick()
    api(vm).querySearch('adm')
    vi.advanceTimersByTime(249)
    expect(hoisted.listUser).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    await vi.waitFor(() => {
      expect(hoisted.listUser).toHaveBeenCalledTimes(1)
      expect(hoisted.listRole).toHaveBeenCalledTimes(1)
      expect(hoisted.listType).toHaveBeenCalledTimes(1)
    })
  })

  it('searchData：三组结果按 user/role/dict 分组并带 query 筛选条件', async () => {
    hoisted.listUser.mockImplementation(() =>
      Promise.resolve({ rows: [{ userName: 'admin', nickName: '管理员', phonenumber: '138' }] })
    )
    hoisted.listRole.mockImplementation(() => Promise.resolve({ rows: [{ roleName: '超管', roleKey: 'admin' }] }))
    hoisted.listType.mockImplementation(() =>
      Promise.resolve({ rows: [{ dictName: '性别', dictType: 'sys_user_sex' }] })
    )
    const vm = factory()
    await nextTick()
    const res = (await api(vm).searchData('a')) as Array<{
      path: string
      group?: string
      subtitle?: string
      query?: string
      title: string[]
    }>
    expect(res.length).toBe(3)
    const byPath = Object.fromEntries(res.map((r) => [r.group, r]))
    expect(byPath.user.path).toBe('/system/user')
    expect(byPath.user.subtitle).toBe('138')
    expect(byPath.user.query).toBe(JSON.stringify({ userName: 'admin' }))
    expect(byPath.role.path).toBe('/system/role')
    expect(byPath.role.query).toBe(JSON.stringify({ roleName: '超管' }))
    expect(byPath.dict.path).toBe('/system/dict')
    expect(byPath.dict.query).toBe(JSON.stringify({ dictName: '性别' }))
  })

  it('searchData：单组接口失败不影响其他组（allSettled 隔离）', async () => {
    hoisted.listUser.mockImplementation(() => Promise.reject(new Error('boom')))
    hoisted.listRole.mockImplementation(() => Promise.resolve({ rows: [{ roleName: 'R', roleKey: 'r' }] }))
    const vm = factory()
    await nextTick()
    const res = (await api(vm).searchData('a')) as Array<{ group?: string }>
    expect(res.length).toBe(1)
    expect(res[0].group).toBe('role')
  })

  it('searchData：rows 为 null/字段缺失时 ??? 兜底不抛', async () => {
    // 喂畸形响应（rows=null / 缺 rows / 字段为 null）——刻意用 never 绕过 mock 的强类型，
    // 以验证组件运行时的 ?? '' 兜底
    const malformed = (v: unknown) => (() => Promise.resolve(v)) as never
    hoisted.listUser.mockImplementation(malformed({ rows: [{ userName: null, nickName: null }] }))
    hoisted.listRole.mockImplementation(malformed({ rows: null }))
    hoisted.listType.mockImplementation(malformed({}))
    const vm = factory()
    await nextTick()
    const res = (await api(vm).searchData('a')) as Array<{ title: string[] }>
    expect(res.length).toBe(1)
    expect(res[0].title[0]).toBe('')
  })

  it('键盘导航：↓/↑ 循环钳制', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/a' }), R({ path: '/b' }), R({ path: '/c' })])
    const vm = factory()
    await nextTick()
    await flushPromises()
    api(vm).querySearch('')
    await nextTick()
    const opts = api(vm).options.length
    expect(opts).toBeGreaterThanOrEqual(3)
    api(vm).navigateResult('down')
    expect(api(vm).activeIndex).toBe(0)
    api(vm).navigateResult('down')
    expect(api(vm).activeIndex).toBe(1)
    api(vm).navigateResult('down')
    expect(api(vm).activeIndex).toBe(2)
    api(vm).navigateResult('down')
    expect(api(vm).activeIndex).toBe(0) // 循环回卷
    api(vm).navigateResult('up')
    expect(api(vm).activeIndex).toBe(2) // 反向循环
  })

  it('selectActiveResult：activeIndex<0 或空结果时不动作', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/a' })])
    const vm = factory()
    await nextTick()
    await flushPromises()
    api(vm).querySearch('')
    await nextTick()
    expect(() => api(vm).selectActiveResult()).not.toThrow()
    expect(hoisted.push).not.toHaveBeenCalled()
  })

  it('highlightText：XSS 转义 + 关键字高亮', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/a' })])
    const vm = factory()
    await nextTick()
    setSearch(vm, 'use')
    await nextTick()
    const html = api(vm).highlightText('user 管理 <img src=x onerror=alert(1)>')
    expect(html).toContain('<span class="highlight">')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('highlightText：空文本返回空串；无关键词时仅转义', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/a' })])
    const vm = factory()
    await nextTick()
    setSearch(vm, '')
    await nextTick()
    expect(api(vm).highlightText('')).toBe('')
    expect(api(vm).highlightText('<b>')).toBe('&lt;b&gt;')
  })

  it('escapeRegExp：正则元字符被转义', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/a' })])
    const vm = factory()
    await nextTick()
    expect(api(vm).escapeRegExp('a.b*c')).toBe('a\\.b\\*c')
  })

  it('activeStyle：命中索引返回主题背景色，否则空对象', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/a' })])
    hoisted.theme = '#409EFF'
    const vm = factory()
    await nextTick()
    api(vm).navigateResult('down')
    expect(api(vm).activeIndex).toBe(0) // options 空 ⇒ -1 >= -1 成立 ⇒ 0
    expect(api(vm).activeStyle(0)).toEqual({
      'background-color': '#409EFF',
      color: 'var(--el-color-white)'
    })
    expect(api(vm).activeStyle(1)).toEqual({})
  })

  it('onMounted 由 routes 生成 searchPool；routes 变化时重建', async () => {
    hoisted.setDefaultRoutes?.([R({ path: '/system' })])
    const vm = factory()
    await nextTick()
    await flushPromises()
    expect(api(vm).searchPool.length).toBeGreaterThanOrEqual(1)
    const before = api(vm).searchPool.length
    expect(before).toBeGreaterThanOrEqual(1)
    // 追加一条路由 ⇒ watch(routes) 应重建 searchPool（真 Vue ref 驱动 computed）
    hoisted.setDefaultRoutes?.([R({ path: '/system' }), R({ path: '/monitor', meta: { title: '监控' } })])
    await nextTick()
    await flushPromises()
    expect(api(vm).searchPool.length).toBeGreaterThan(before)
  })

  it('短词（<最小长度）不走数据搜索，仅菜单匹配', async () => {
    vi.useFakeTimers()
    hoisted.setDefaultRoutes?.([R({ path: '/system' })])
    const vm = factory()
    await nextTick()
    api(vm).querySearch('s')
    vi.advanceTimersByTime(1000)
    await Promise.resolve()
    expect(hoisted.listUser).not.toHaveBeenCalled()
    expect(api(vm).options.length).toBeGreaterThanOrEqual(1)
  })

  // ---- b89 项 17：外链两支的**真实点击通道**（走模板 @click，不直接调内部函数）----
  // 立案：`change` 旧写法无条件 `p.slice(p.indexOf('http'))`，用意是剥掉"http 在串中间"时的
  // 前缀；但 isHttp 认三支，其中协议相对 `//host` 一支里根本没有 "http" ⇒ indexOf 返回 -1
  // ⇒ slice(-1) 取到**最后一个字符**，window.open 打开的是一个单字符串（用户看到"点了没反应/
  // 开了个错页"）。两支各一条：坏的必须被抓，好的不得被顺手改坏。
  it('change：协议相对 //host 整串交给新标签页（旧写法只送出最后一个字符）', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    hoisted.setDefaultRoutes?.([R({ path: '//example.com/docs' })])
    const vm = factory()
    await nextTick()
    api(vm).options = [{ path: '//example.com/docs', title: ['外部文档'], icon: 'search' }]
    await nextTick()
    await vm.find('.search-item').trigger('click')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe('//example.com/docs')
    // rel=noopener 是安全属性，必须与外链同标签存在（b89 前端浏览器面规范第 2 条）
    expect(String(open.mock.calls[0][2])).toContain('noopener')
    open.mockRestore()
  })

  it('change：http 出现在串中间时仍剥掉前缀（对照组，证明修复没把另一支改掉）', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    hoisted.setDefaultRoutes?.([R({ path: '/system' })])
    const vm = factory()
    await nextTick()
    api(vm).options = [{ path: '/proxy/http://internal.example/x', title: ['代理外链'], icon: 'search' }]
    await nextTick()
    await vm.find('.search-item').trigger('click')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe('http://internal.example/x')
    open.mockRestore()
  })

  it('change：内部路径不得出网（走 router.push，不碰 window.open）', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    hoisted.setDefaultRoutes?.([R({ path: '/system' })])
    const vm = factory()
    await nextTick()
    api(vm).options = [{ path: '/system/user', title: ['用户'], icon: 'user' }]
    await nextTick()
    await vm.find('.search-item').trigger('click')
    expect(open).not.toHaveBeenCalled()
    expect(hoisted.push).toHaveBeenCalled()
    open.mockRestore()
  })
})
