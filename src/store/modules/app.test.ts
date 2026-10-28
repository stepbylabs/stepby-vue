import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Cookies from 'js-cookie'

import useAppStore from './app'

describe('store/modules/app', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      if (name) Cookies.remove(name)
    })
  })

  it('defaults sidebar.opened to true and keeps size unset (preference) when no cookies', () => {
    const store = useAppStore()
    expect(store.sidebar.opened).toBe(true)
    expect(store.device).toBe('desktop')
    // b113：store 存的是**用户偏好**，没选过就是 ''；有效档位（桌面 default / 移动 large）
    // 由 resolveElementSize 在消费点计算——写死 'default' 会让移动端永远拿不到 large 兜底
    expect(store.size).toBe('')
  })

  it('drops out-of-range size cookies and keeps valid ones', () => {
    Cookies.set('size', 'huge')
    expect(useAppStore().size, '值域外的存档值必须丢弃').toBe('')
    setActivePinia(createPinia())
    Cookies.set('size', 'small')
    expect(useAppStore().size).toBe('small')
  })

  it('toggleSideBar flips opened and persists cookie', () => {
    const store = useAppStore()
    expect(store.toggleSideBar(true)).toBeUndefined()
    expect(store.sidebar.opened).toBe(false)
    expect(store.sidebar.withoutAnimation).toBe(true)
    expect(Cookies.get('sidebarStatus')).toBe('0')
    store.toggleSideBar()
    expect(store.sidebar.opened).toBe(true)
    expect(store.sidebar.withoutAnimation).toBe(false)
    expect(Cookies.get('sidebarStatus')).toBe('1')
  })

  it('toggleSideBar returns false and no-op when sidebar hidden', () => {
    const store = useAppStore()
    store.toggleSideBarHide(true)
    expect(store.sidebar.hide).toBe(true)
    expect(store.toggleSideBar()).toBe(false)
    expect(store.sidebar.opened).toBe(true)
  })

  it('closeSideBar sets opened false and cookie 0', () => {
    const store = useAppStore()
    store.closeSideBar({ withoutAnimation: true })
    expect(store.sidebar.opened).toBe(false)
    expect(store.sidebar.withoutAnimation).toBe(true)
    expect(Cookies.get('sidebarStatus')).toBe('0')
  })

  it('toggleDevice and setSize update state and persist size cookie', () => {
    const store = useAppStore()
    store.toggleDevice('mobile')
    expect(store.device).toBe('mobile')
    store.setSize('large')
    expect(store.size).toBe('large')
    expect(Cookies.get('size')).toBe('large')
  })

  it('setSize persists size cookie', () => {
    const store = useAppStore()
    store.setSize('small')
    expect(store.size).toBe('small')
    expect(Cookies.get('size')).toBe('small')
  })
})
