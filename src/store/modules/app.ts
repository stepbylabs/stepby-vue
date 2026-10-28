import Cookies from 'js-cookie'
import { defineStore } from 'pinia'
import { normalizeElementSize, type ElementSize } from '@/utils/elementSize'

/** 设备三档：手机(<768) 抽屉侧边栏 / 平板(768-991) 折叠图标条 / 桌面(≥992) 常规 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

interface SidebarState {
  opened: boolean
  withoutAnimation: boolean
  hide: boolean
}

interface AppState {
  sidebar: SidebarState
  device: DeviceType
  /** 用户偏好档位；`''` = 未设置（有效档位由 `resolveElementSize` 按视口兜底） */
  size: ElementSize | ''
}

const useAppStore = defineStore('app', {
  state: (): AppState => ({
    sidebar: {
      opened: Cookies.get('sidebarStatus') ? !!+Cookies.get('sidebarStatus')! : true,
      withoutAnimation: false,
      hide: false
    },
    device: 'desktop' as DeviceType,
    // b113：只存**用户偏好**（'' = 未设置，有效档位由 resolveElementSize 按视口兜底）。
    // 值域外的存档值一律丢掉——它会被原样喂给 el-config-provider，怪串在组件库里的行为无从保证。
    size: normalizeElementSize(Cookies.get('size'))
  }),
  actions: {
    toggleSideBar(withoutAnimation?: boolean) {
      if (this.sidebar.hide) {
        return false
      }
      this.sidebar.opened = !this.sidebar.opened
      this.sidebar.withoutAnimation = withoutAnimation || false
      if (this.sidebar.opened) {
        Cookies.set('sidebarStatus', '1')
      } else {
        Cookies.set('sidebarStatus', '0')
      }
    },
    closeSideBar({ withoutAnimation }: { withoutAnimation?: boolean }) {
      Cookies.set('sidebarStatus', '0')
      this.sidebar.opened = false
      this.sidebar.withoutAnimation = withoutAnimation || false
    },
    toggleDevice(device: DeviceType) {
      this.device = device
    },
    setSize(size: string) {
      // 只接受值域内的档位：调用点都来自下拉，写进来非法值说明有人绕过了 UI（宁可忽略）
      const next = normalizeElementSize(size)
      if (!next) return
      this.size = next
      Cookies.set('size', next)
    },
    toggleSideBarHide(status: boolean) {
      this.sidebar.hide = status
    }
  }
})

export default useAppStore
