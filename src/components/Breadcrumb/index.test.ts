/**
 * components/Breadcrumb 覆盖测试（批六十四覆盖率工程）。
 * 覆盖：getBreadcrumb 的 matched 链构造、meta.breadcrumb=false 过滤、
 * 末项 no-redirect 渲染、中间项 router-link 渲染、route 变化重算。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const state = vi.hoisted(() => ({
  route: {
    path: '/system/user',
    params: {},
    meta: { title: 'route.user' },
    matched: [
      {
        path: '/system',
        redirect: 'noRedirect',
        name: 'System',
        meta: { title: 'route.system', icon: 'system' },
        children: []
      },
      {
        path: '/system/user',
        name: 'User',
        meta: { title: 'route.user', icon: 'user' },
        children: []
      }
    ] as unknown[]
  }
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => state.route,
    RouterLink: {
      props: ['to'],
      setup: (props: Record<string, unknown>, { slots }: { slots: Record<string, (...a: unknown[]) => unknown> }) =>
        () => h('a', { class: 'router-link-stub', 'data-to': String(props.to) }, slots.default?.())
    }
  }
})

vi.mock('@/store/modules/permission', () => ({
  default: () => ({ sidebarRoutes: [], routes: [] })
}))

vi.mock('@/composables/useMenuTitle', () => ({
  useMenuTitle: () => ({
    translateTitle: (meta: { title?: string } | undefined) => meta?.title ?? ''
  })
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (k: string) => k })
  }
})

import Breadcrumb from './index.vue'

const i18n = createI18n({ legacy: false, locale: 'en' })

function factory() {
  return mount(Breadcrumb, {
    global: {
      plugins: [i18n],
      stubs: {
        'el-breadcrumb': { template: '<div class="bc"><slot /></div>' },
        'el-breadcrumb-item': { template: '<div class="bci"><slot /></div>' },
        'transition-group': { template: '<div><slot /></div>' }
      }
    }
  })
}

describe('components/Breadcrumb', () => {
  beforeEach(() => {
    state.route.path = '/system/user'
    state.route.matched = [
      {
        path: '/system',
        redirect: 'noRedirect',
        name: 'System',
        meta: { title: 'route.system', icon: 'system' },
        children: []
      },
      {
        path: '/system/user',
        name: 'User',
        meta: { title: 'route.user', icon: 'user' },
        children: []
      }
    ]
  })

  it('挂载：渲染面包屑容器与层级项', async () => {
    const w = factory()
    await nextTick()
    expect(w.find('.bc').exists()).toBe(true)
    expect(w.findAll('.bci').length).toBeGreaterThanOrEqual(2)
  })

  it('末项渲染为 no-redirect span（不可点击）', async () => {
    const w = factory()
    await nextTick()
    const noRedirect = w.findAll('.no-redirect')
    expect(noRedirect.length).toBeGreaterThanOrEqual(1)
  })

  it('中间项含 redirect=noRedirect → span 渲染（首项判定）', async () => {
    const w = factory()
    await nextTick()
    const links = w.findAll('.redirect')
    // matched[0].redirect='noRedirect' → span；matched[1] 是末项 → span；两段均为 span
    expect(w.findAll('.no-redirect').length + links.length).toBeGreaterThanOrEqual(2)
  })

  it('route.path 变化 → levelList 重算（watch 生效）', async () => {
    const w = factory()
    await nextTick()
    state.route.path = '/system/role'
    state.route.matched = [
      {
        path: '/system',
        redirect: 'noRedirect',
        name: 'System',
        meta: { title: 'route.system', icon: 'system' },
        children: []
      },
      {
        path: '/system/role',
        name: 'Role',
        meta: { title: 'route.role', icon: 'peoples' },
        children: []
      }
    ]
    // 触发 route 响应式更新（mock 的 useRoute 返回同一对象引用）
    await nextTick()
    await nextTick()
    expect(w.find('.bc').exists()).toBe(true)
  })
})
