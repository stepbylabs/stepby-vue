/**
 * 编辑对话框的关闭语义（b135，UX-5 的第二个接线面）
 *
 * 立的案：Element Plus 的 `closeOnClickModal` 与 `closeOnPressEscape` 默认都是 `true`
 * （`element-plus/es/components/dialog/src/dialog.mjs:137-138`），而 X 按钮、遮罩点击、
 * Esc 三条通道在 `use-dialog.mjs:105-113` 里统一汇入 `handleClose()` → `beforeClose`。
 * 于是「只设 `:close-on-click-modal="false"`」只封了三条里的一条：键盘按 Esc 仍然静默丢弃；
 * 反过来，只要绑了 `:before-close`，三条通道都走确认——**一个拦截点覆盖全部**。
 *
 * 与 `useCrudTable.beforeDialogClose` 的分工：组合子承载的页面用它（快照时机在
 * `handleAdd`/`handleUpdate` 里，由组合子保证）；手写页与独立对话框组件用本 composable。
 *
 * 与 `useUnsavedChangesGuard` 的分工：那个管**页面级**离开（路由跳转 + 刷新/关标签），
 * 本文件管**对话框级**关闭。两者语义不同，不可互相替代（对话框关掉但页面还在）。
 */
import { unref, watch, type Ref } from 'vue'
import { useUnsavedGuard } from './useUnsavedGuard'

/** `Ref` / `reactive` 对象 / getter 三种形态都读得动；非 ref 原样返回 */
type MaybeReadable<T> = Ref<T> | T | (() => T)

function read<T>(source: MaybeReadable<T>): T {
  return typeof source === 'function' ? (source as () => T)() : (unref(source) as T)
}

export interface DialogDirtyGuardOptions {
  /** 关闭被确认后调用（复位表单/标题/校验态/选中行）；用户取消关闭时不调用 */
  onClosed?: () => void
}

export interface DialogDirtyGuardReturn {
  /** 以当前表单为「已保存」基准；异步载入数据的页面在赋值之后必须再调一次 */
  snapshot: () => void
  /** 保存成功后调用：此后关闭不再确认 */
  markSaved: () => void
  /** `:before-close` 唯一入口——X / 遮罩 / Esc 三条通道都经它 */
  beforeClose: (done: () => void) => Promise<void>
  /** 页面内「取消」按钮：程序内改 v-model 不触发 beforeClose，必须显式走同一确认 */
  cancel: () => Promise<void>
}

/**
 * @param visible 对话框可见性（必须可写：`cancel()` 要自己关；`toRef(state,'visible')` 可包 reactive）
 * @param form 表单数据（`ref` / `reactive` / getter 均可）
 * @param options `onClosed` 只在「确认离开」后执行，取消时保持弹窗与表单原样
 */
export function useDialogDirtyGuard<T>(
  visible: Ref<boolean | undefined>,
  form: MaybeReadable<T>,
  options: DialogDirtyGuardOptions = {}
): DialogDirtyGuardReturn {
  const { snapshotForm, markSaved: mark, confirmLeave } = useUnsavedGuard()

  function snapshot(): void {
    snapshotForm(read(form))
  }

  function markSaved(): void {
    mark(read(form))
  }

  // 打开的那一帧之后补拍一次基准：调用方同步填值（新建时的缺省骨架、编辑时的详情赋值）
  // 无需再手工 snapshot。用 `flush: 'post'` 而不是默认的 `pre`——同一 tick 里
  // `form.value = data; open.value = true` 的赋值要先进表单，基准才是「打开时用户看到的值」。
  // 异步载入的页面在赋值后补调 `snapshot()` 覆盖这次基准：不补的话基准是打开瞬间的旧值，
  // 恰好在「打开后什么都没改就关闭」时多问一次（方向与漏保护相反：多问，不丢数据）。
  let wasOpen = !!unref(visible)
  watch(
    () => !!unref(visible),
    (open: boolean) => {
      if (open && !wasOpen) snapshot()
      wasOpen = open
    },
    { flush: 'post' }
  )

  async function beforeClose(done: () => void): Promise<void> {
    if (await confirmLeave(read(form))) {
      done()
      options.onClosed?.()
    }
  }

  async function cancel(): Promise<void> {
    if (await confirmLeave(read(form))) {
      visible.value = false
      options.onClosed?.()
    }
  }

  return { snapshot, markSaved, beforeClose, cancel }
}
