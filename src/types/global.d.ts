/* eslint-disable @typescript-eslint/no-explicit-any */
/** 模块类型声明 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/** Vite 环境变量类型 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_BASE_API: string
  readonly VITE_APP_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Vite 编译期全局常量（在 vite.config.ts 的 define 中注入） */
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

// vue（扩展 ComponentInternalInstance 以兼容 Options API this 上下文）
declare module 'vue' {
  interface ComponentInternalInstance {
    proxy: any
  }
}

// nprogress（第三方库未自带类型）
declare module 'nprogress' {
  export interface NProgressOptions {
    minimum?: number
    template?: string
    easing?: string
    speed?: number
    trickle?: boolean
    trickleSpeed?: number
    showSpinner?: boolean
    parent?: string
    barSelector?: string
  }

  export interface NProgress {
    start(): NProgress
    set(n: number): NProgress
    inc(amount?: number): NProgress
    done(force?: boolean): NProgress
    remove(): void
    configure(options: NProgressOptions): NProgress
    status: number | null
  }

  const nprogress: NProgress
  export default nprogress
}

// js-cookie（3.x 未正确暴露 .d.ts，需自定义声明以匹配实际 API）
declare module 'js-cookie' {
  export interface CookieAttributes {
    expires?: number | Date
    path?: string
    domain?: string
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    httpOnly?: boolean
  }
  const Cookies: {
    get(name?: string): string | undefined
    getJSON(name?: string): any
    set(name: string, value: string, attributes?: CookieAttributes): string
    remove(name: string, attributes?: CookieAttributes): void
    withAttributes(attributes: CookieAttributes): typeof Cookies
    withConverter(converter: {
      read: (value: string, name: string) => string
      write: (value: string, name: string) => string
    }): typeof Cookies
  }
  export default Cookies
}

// file-saver
declare module 'file-saver' {
  export interface FileSaverOptions {
    autoBOM?: boolean
  }
  export function saveAs(data: Blob | string, filename?: string, options?: FileSaverOptions): void
  export function saveAs(data: Blob | string, filename?: string, disableAutoBOM?: boolean): void
  export default saveAs
}

// sortablejs
declare module 'sortablejs' {
  export interface SortableEvent {
    oldIndex: number
    newIndex: number
  }

  export interface SortableOptions {
    animation?: number
    easing?: string
    ghostClass?: string
    chosenClass?: string
    onEnd?: (evt: SortableEvent) => void
  }

  export default class Sortable {
    static create(el: HTMLElement, options: SortableOptions): Sortable
    destroy(): void
    toArray(): string[]
    sort(order: string[]): void
  }
}

// fuse
declare module 'fuse.js' {
  export interface FuseOptions<_T> {
    keys: string[]
    threshold?: number
    includeScore?: boolean
    includeMatches?: boolean
    minMatchCharLength?: number
    shouldSort?: boolean
  }

  export default class Fuse<T> {
    constructor(list: T[], options?: FuseOptions<T>)
    search(pattern: string): T[]
  }
}

// vuedraggable
declare module 'vuedraggable/dist/vuedraggable.common' {
  import { DefineComponent } from 'vue'
  const draggable: DefineComponent
  export default draggable
}

// vue-cropper
declare module 'vue-cropper' {
  import { DefineComponent } from 'vue'
  const VueCropper: DefineComponent
  export { VueCropper }
}

// splitpanes
declare module 'splitpanes' {
  import { DefineComponent } from 'vue'

  export const Splitpanes: DefineComponent
  export const Pane: DefineComponent
}

// View Transitions API（浏览器实验性 API，TS DOM lib 默认未定义）
interface ViewTransition {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition(): void
}

interface Document {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition
  /** 自定义标记：主题切换过渡进行中 */
  __themeTransitionInProgress?: boolean
}
