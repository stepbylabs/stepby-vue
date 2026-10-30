/**
 * useDialogDirtyGuard 单元测试（b135）
 *
 * 覆盖四条通道的两侧：X/遮罩/Esc（beforeClose）与页面「取消」按钮（cancel），
 * 每条都要有「确认 ⇒ 关」与「取消 ⇒ 不关」两个方向；另钉两件易错事实：
 * ① 基准在**打开的那一刻**拍（模块初始化期的值不算）；
 * ② 异步载入数据的页面可以用 snapshot() 覆盖基准。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'

const t = (key: string) => key
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t }) }))
const { elMessageBoxConfirm } = vi.hoisted(() => ({ elMessageBoxConfirm: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: elMessageBoxConfirm } }))

import { useDialogDirtyGuard } from './useDialogDirtyGuard'

describe('useDialogDirtyGuard', () => {
  beforeEach(() => {
    elMessageBoxConfirm.mockReset()
  })

  it('打开后未改动：beforeClose 直通，不弹确认', async () => {
    const open = ref(false)
    const form = ref({ name: 'a' })
    const { beforeClose } = useDialogDirtyGuard(open, form)
    open.value = true
    await nextTick()
    const done = vi.fn()
    await beforeClose(done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
  })

  it('打开后改值：确认离开 ⇒ done 与 onClosed 都执行', async () => {
    elMessageBoxConfirm.mockResolvedValue('confirm')
    const open = ref(false)
    const form = ref({ name: 'a' })
    const onClosed = vi.fn()
    const { beforeClose } = useDialogDirtyGuard(open, form, { onClosed })
    open.value = true
    await nextTick()
    form.value.name = 'changed'
    const done = vi.fn()
    await beforeClose(done)
    expect(elMessageBoxConfirm).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('打开后改值：取消关闭 ⇒ done 与 onClosed 都不执行（弹窗保持打开）', async () => {
    elMessageBoxConfirm.mockRejectedValue('cancel')
    const open = ref(false)
    const form = ref({ name: 'a' })
    const onClosed = vi.fn()
    const { beforeClose } = useDialogDirtyGuard(open, form, { onClosed })
    open.value = true
    await nextTick()
    form.value.name = 'changed'
    const done = vi.fn()
    await beforeClose(done)
    expect(done).not.toHaveBeenCalled()
    expect(onClosed).not.toHaveBeenCalled()
    expect(open.value).toBe(true)
  })

  it('markSaved 以当前值为新基准：保存后关闭不再确认', async () => {
    const open = ref(false)
    const form = ref({ name: 'a' })
    const { markSaved, beforeClose } = useDialogDirtyGuard(open, form)
    open.value = true
    await nextTick()
    form.value.name = 'saved'
    markSaved()
    const done = vi.fn()
    await beforeClose(done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
  })

  it('异步载入：赋值后 snapshot() 覆盖基准，关闭不确认', async () => {
    const open = ref(false)
    const form = ref<{ name: string }>({ name: '' })
    const { snapshot, beforeClose } = useDialogDirtyGuard(open, form)
    open.value = true
    await nextTick() // 自动基准 = 打开瞬间的空表单
    form.value = { name: 'loaded-from-api' }
    snapshot() // 数据到达后重新标定
    const done = vi.fn()
    await beforeClose(done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
  })

  it('基准取「打开那一刻」而不是建实例那一刻的值', async () => {
    const open = ref(false)
    const form = ref({ name: 'before-open' })
    const { beforeClose } = useDialogDirtyGuard(open, form)
    form.value.name = 'changed-while-closed' // 打开之前的变化不计入脏
    open.value = true
    await nextTick()
    const done = vi.fn()
    await beforeClose(done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
  })

  it('cancel：确认后自行关闭（程序内改 v-model 不触发 beforeClose）', async () => {
    elMessageBoxConfirm.mockResolvedValue('confirm')
    const open = ref(false)
    const form = ref({ name: 'a' })
    const { cancel } = useDialogDirtyGuard(open, form)
    open.value = true
    await nextTick()
    form.value.name = 'changed'
    await cancel()
    expect(open.value).toBe(false)
  })

  it('cancel：取消时保持打开且表单原样', async () => {
    elMessageBoxConfirm.mockRejectedValue('cancel')
    const open = ref(false)
    const form = ref({ name: 'a' })
    const { cancel } = useDialogDirtyGuard(open, form)
    open.value = true
    await nextTick()
    form.value.name = 'changed'
    await cancel()
    expect(open.value).toBe(true)
    expect(form.value.name).toBe('changed')
  })

  // 唯一能区分 flush: 'pre' 与 'post' 的场景：打开时由**另一条 pre 通道**写表单
  // （`@open` 自动填默认文件名、编辑态回填默认值都是这个形状）。pre 的 guard 会在那条通道
  // 之前拍基准 ⇒ 开窗瞬间就被判脏，用户按 Esc 直接吃一个确认框；post 拍在组件更新之后。
  // 纯 composable 的用例靠 `await nextTick()` 覆盖不到这一层（pre/post 都在同一个 flush 里跑完）。
  it("flush: 'post' —— 打开时另一条 pre 通道自动填值，基准必须取到填后的值", async () => {
    const open = ref(false)
    const form = ref({ name: 'init' })
    let guard!: ReturnType<typeof useDialogDirtyGuard>
    const Host = defineComponent({
      setup() {
        guard = useDialogDirtyGuard(open, form)
        watch(open, (v: boolean) => {
          if (v) form.value.name = 'auto-filled'
        })
        return () => h('div', form.value.name)
      }
    })
    const wrapper = mount(Host)
    open.value = true
    await nextTick()
    const done = vi.fn()
    await guard.beforeClose(done)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('reactive 表单对象与 getter 两种形态都能读', async () => {
    const open = ref(false)
    const state = reactive({ name: 'a' })
    const { beforeClose } = useDialogDirtyGuard(open, state)
    open.value = true
    await nextTick()
    const done = vi.fn()
    await beforeClose(done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(elMessageBoxConfirm).not.toHaveBeenCalled()

    const open2 = ref(false)
    const inner = { name: 'x' }
    const guard2 = useDialogDirtyGuard(open2, () => inner)
    open2.value = true
    await nextTick()
    inner.name = 'y'
    elMessageBoxConfirm.mockResolvedValue('confirm')
    const done2 = vi.fn()
    await guard2.beforeClose(done2)
    expect(elMessageBoxConfirm).toHaveBeenCalledTimes(1)
    expect(done2).toHaveBeenCalledTimes(1)
  })
})
