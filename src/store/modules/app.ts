import Cookies from 'js-cookie'
import { defineStore } from 'pinia'

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
  size: string
}

const useAppStore = defineStore(
  'app',
  {
    state: (): AppState => ({
      sidebar: {
        opened: Cookies.get('sidebarStatus') ? !!+Cookies.get('sidebarStatus')! : true,
        withoutAnimation: false,
        hide: false
      },
      device: 'desktop' as DeviceType,
      size: Cookies.get('size') || 'default'
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
        this.size = size
        Cookies.set('size', size)
      },
      toggleSideBarHide(status: boolean) {
        this.sidebar.hide = status
      }
    }
  })

export default useAppStore
