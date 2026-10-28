/**
 * 组件尺寸切换的回归锁（b113）。
 *
 * 立的案：`App.vue` 原先读 `Cookies.get('size')`（非响应式），store 里的尺寸从未被消费，
 * 所以 `SizeSelect` 只能 `location.reload()` 让新 cookie 生效——一次样式选择换一次整页重载。
 * 本文件钉住改好后的形状：
 * 1. 选择档位只写 store + cookie，**绝不整页刷新**；
 * 2. 勾选态/当前档来自与 App 共用的解析函数（未设置时桌面 default、手机 large），
 *    而不是自己从 cookie 推断；
 * 3. 非法档位不得落库（值域外直接忽略）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const hoisted = vi.hoisted(() => ({ width: { value: 1200 } }))

vi.mock('@vueuse/core', async (orig) => {
  const actual = await orig<typeof import('@vueuse/core')>()
  return { ...actual, useWindowSize: () => ({ width: hoisted.width }) }
})

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import SizeSelect from './index.vue'
import useAppStore from '@/store/modules/app'

const stubs = {
  'svg-icon': { template: '<i />' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' }
}

function cookieSize(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)size=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : null
}

interface SizeVm {
  size: string
  handleSetSize: (s: 'large' | 'default' | 'small') => void
}

describe('SizeSelect（b113）', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.cookie = 'size=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    hoisted.width.value = 1200
    setActivePinia(createPinia())
    reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('切换档位：只写 store + cookie，绝不整页刷新', () => {
    const w = mount(SizeSelect, { global: { stubs } })
    const vm = w.vm as unknown as SizeVm
    vm.handleSetSize('small')
    expect(useAppStore().size).toBe('small')
    expect(cookieSize()).toBe('small')
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('未设置偏好：桌面按 default 显示（与 App.vue 用同一个解析结果）', () => {
    const w = mount(SizeSelect, { global: { stubs } })
    expect((w.vm as unknown as SizeVm).size).toBe('default')
  })

  it('未设置偏好且手机视口：按 large 显示', () => {
    hoisted.width.value = 375
    const w = mount(SizeSelect, { global: { stubs } })
    expect((w.vm as unknown as SizeVm).size).toBe('large')
  })

  it('非法档位不得落库（值域外直接忽略，cookie 保持原值）', () => {
    const store = useAppStore()
    const w = mount(SizeSelect, { global: { stubs } })
    const vm = w.vm as unknown as SizeVm
    vm.handleSetSize('gigantic' as unknown as 'small')
    expect(store.size).toBe('')
    expect(cookieSize()).toBeNull()
  })
})
