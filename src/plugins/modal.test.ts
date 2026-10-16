/**
 * plugins/modal 单元测试（b71 补测：遮罩配对 + 提示分流 + 弹窗 Promise 透传）
 *
 * 关键风险锁定：
 * 1. loading()/closeLoading() 必须严格配对——历史上模块级单例被并发覆盖，
 *    第一次的遮罩永远关不掉（全屏卡死）。现实现为栈（LIFO），
 *    本文件锁定"开几次就必须按逆序关几次"与"空栈 close 不做任何事"。
 * 2. msgError/msgWarning/notifyError/notifyWarning **不直连 ElMessage**，
 *    而是统一经 errorHub 聚合（避免一屏一串），断言分流口径与内容归一化；
 *    msg/msgInfo/msgSuccess/alert/notify 等仍直连 Element Plus。
 * 3. confirm/prompt 必须原样透传 ElMessageBox 的 Promise（resolve 值与 reject 原因），
 *    调用方 `await modal.confirm(...)` 的 then/cancel 分支完全依赖它。
 *
 * element-plus 与 i18n 全 mock（不加载真实组件库），errorHub 用真实实例断言上报参数。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'

const h = vi.hoisted(() => {
  // ElMessage 需可调用（errorHub 兜底渲染走 ElMessage(options)），同时挂级别方法
  const message = Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  })
  const notification = { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() }
  const messageBox = { alert: vi.fn(() => Promise.resolve()), confirm: vi.fn(), prompt: vi.fn() }
  const closeFns: Mock[] = []
  const loadingService = vi.fn(() => {
    const close = vi.fn()
    closeFns.push(close)
    return { close }
  })
  const t = vi.fn((key: string) => `T:${key}`)
  const clearAll = () => {
    message.mockClear()
    for (const fn of [message.info, message.success, message.warning, message.error]) fn.mockClear()
    for (const fn of [notification.info, notification.success, notification.warning, notification.error]) {
      fn.mockClear()
    }
    for (const fn of [messageBox.alert, messageBox.confirm, messageBox.prompt]) fn.mockClear()
    loadingService.mockClear()
    t.mockClear()
    closeFns.length = 0
  }
  return { message, notification, messageBox, closeFns, loadingService, t, clearAll }
})

vi.mock('element-plus', () => ({
  ElMessage: h.message,
  ElMessageBox: h.messageBox,
  ElNotification: h.notification,
  ElLoading: { service: h.loadingService }
}))
vi.mock('@/i18n', () => ({ default: { global: { t: h.t } } }))

describe('plugins/modal', () => {
  let modal: (typeof import('./modal'))['default']
  let hub: (typeof import('@/utils/errorHub'))['errorHub']

  beforeEach(async () => {
    // resetModules 保证 loadingStack 每个用例都从空栈开始（模块级状态不外溢）
    vi.resetModules()
    h.clearAll()
    h.messageBox.confirm.mockResolvedValue(undefined)
    h.messageBox.prompt.mockResolvedValue(undefined)
    modal = (await import('./modal')).default
    hub = (await import('@/utils/errorHub')).errorHub
    hub.clear()
    hub.setToastHandler(() => {})
  })

  afterEach(() => {
    // 取消 errorHub 聚合弹窗定时器，避免跨用例副作用
    hub.clear()
    hub.setToastHandler(null)
  })

  // -------------------------------------------------------------------------
  // Element Plus 直连系
  // -------------------------------------------------------------------------
  it('msg / msgInfo 都走 ElMessage.info，且内容原样透传', () => {
    modal.msg('普通提示')
    modal.msgInfo({ message: '对象提示', duration: 1000 })

    expect(h.message.info).toHaveBeenCalledTimes(2)
    expect(h.message.info).toHaveBeenNthCalledWith(1, '普通提示')
    expect(h.message.info).toHaveBeenNthCalledWith(2, { message: '对象提示', duration: 1000 })
    // 普通提示不得被误路由到 errorHub（否则会被计入问题监控并聚合改写文案）
    expect(hub.issues).toHaveLength(0)
  })

  it('msgSuccess 走 ElMessage.success 且不进 errorHub', () => {
    modal.msgSuccess('操作成功')

    expect(h.message.success).toHaveBeenCalledTimes(1)
    expect(h.message.success).toHaveBeenCalledWith('操作成功')
    expect(hub.issues).toHaveLength(0)
  })

  it('alert 系列走 ElMessageBox.alert，标题取 common.tip 且带对应 type', () => {
    modal.alert('纯提示')
    modal.alertError('错误')
    modal.alertSuccess('成功')
    modal.alertWarning('警告')

    expect(h.messageBox.alert).toHaveBeenCalledTimes(4)
    expect(h.messageBox.alert).toHaveBeenNthCalledWith(1, '纯提示', 'T:common.tip')
    expect(h.messageBox.alert).toHaveBeenNthCalledWith(2, '错误', 'T:common.tip', { type: 'error' })
    expect(h.messageBox.alert).toHaveBeenNthCalledWith(3, '成功', 'T:common.tip', { type: 'success' })
    expect(h.messageBox.alert).toHaveBeenNthCalledWith(4, '警告', 'T:common.tip', { type: 'warning' })
    expect(h.t).toHaveBeenCalledWith('common.tip')
  })

  it('notify / notifySuccess 走 ElNotification 对应级别方法', () => {
    modal.notify({ title: 't', message: 'm' })
    modal.notifySuccess('搞定')

    expect(h.notification.info).toHaveBeenCalledTimes(1)
    expect(h.notification.info).toHaveBeenCalledWith({ title: 't', message: 'm' })
    expect(h.notification.success).toHaveBeenCalledTimes(1)
    expect(h.notification.success).toHaveBeenCalledWith('搞定')
  })

  // -------------------------------------------------------------------------
  // errorHub 分流系（禁止直连 ElMessage）
  // -------------------------------------------------------------------------
  it('msgError 经 errorHub 上报 error/other，且完全不碰 ElMessage', () => {
    modal.msgError('出错了')

    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0]).toMatchObject({ level: 'error', source: 'other', message: '出错了' })
    expect(h.message).not.toHaveBeenCalled()
    expect(h.message.error).not.toHaveBeenCalled()
    expect(h.message.info).not.toHaveBeenCalled()
    expect(hub.issues[0].count).toBe(1)
  })

  it('msgWarning 经 errorHub 上报 warning/other', () => {
    modal.msgWarning('请注意')

    expect(hub.issues).toHaveLength(1)
    expect(hub.issues[0]).toMatchObject({ level: 'warning', source: 'other', message: '请注意' })
    expect(h.message.warning).not.toHaveBeenCalled()
  })

  it('msgError 内容归一化：对象取 message 字段，缺字段/空值归一为空串（空串同源被去重合并）', () => {
    modal.msgError({ message: '对象文案', duration: 2000 })
    expect(hub.issues[0].message).toBe('对象文案')

    modal.msgError({})
    expect(hub.issues[0].message).toBe('')

    modal.msgError(null as never)
    // 同 级别+源+文案 在去重窗口内合并计数，而不是刷屏成两条
    expect(hub.issues[0]).toMatchObject({ message: '', count: 2 })
    expect(hub.issues).toHaveLength(2)
  })

  it('notifyError / notifyWarning 经 errorHub（字符串与对象两种入参都归一化）', () => {
    modal.notifyError('通知失败')
    modal.notifyWarning({ title: 't', message: '对象警告' })
    modal.notifyError({ title: '只有标题' })

    expect(hub.issues.map((i) => i.message)).toEqual(['', '对象警告', '通知失败'])
    expect(hub.issues.map((i) => i.level)).toEqual(['error', 'warning', 'error'])
    expect(h.notification.error).not.toHaveBeenCalled()
    expect(h.notification.warning).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // confirm / prompt：Promise 透传
  // -------------------------------------------------------------------------
  it('confirm 以固定契约调 ElMessageBox.confirm，并透传解析值', async () => {
    h.messageBox.confirm.mockResolvedValue('用户输入的确认')

    await expect(modal.confirm('删掉吗')).resolves.toBe('用户输入的确认')
    expect(h.messageBox.confirm).toHaveBeenCalledTimes(1)
    expect(h.messageBox.confirm).toHaveBeenCalledWith('删掉吗', 'T:common.systemTip', {
      confirmButtonText: 'T:common.confirm',
      cancelButtonText: 'T:common.cancel',
      type: 'warning'
    })
  })

  it('confirm 拒绝原因原样透传（调用方靠 cancel 判定取消）', async () => {
    h.messageBox.confirm.mockRejectedValue('cancel')

    await expect(modal.confirm('删掉吗')).rejects.toBe('cancel')
  })

  it('prompt 以固定契约调 ElMessageBox.prompt，并透传 resolve/reject', async () => {
    h.messageBox.prompt.mockResolvedValue({ value: 'abc' })
    await expect(modal.prompt('请输入')).resolves.toEqual({ value: 'abc' })
    expect(h.messageBox.prompt).toHaveBeenCalledWith('请输入', 'T:common.systemTip', {
      confirmButtonText: 'T:common.confirm',
      cancelButtonText: 'T:common.cancel',
      type: 'warning'
    })

    h.messageBox.prompt.mockRejectedValue('close')
    await expect(modal.prompt('请输入')).rejects.toBe('close')
  })

  // -------------------------------------------------------------------------
  // loading 配对（核心风险）
  // -------------------------------------------------------------------------
  it('loading() 只开一次遮罩，closeLoading() 关一次且参数契约正确', () => {
    modal.loading('加载中...')

    expect(h.loadingService).toHaveBeenCalledTimes(1)
    expect(h.loadingService).toHaveBeenCalledWith({
      lock: true,
      text: '加载中...',
      background: 'rgba(0, 0, 0, 0.7)'
    })
    expect(h.closeFns).toHaveLength(1)
    expect(h.closeFns[0]).not.toHaveBeenCalled()

    modal.closeLoading()
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('嵌套 loading 按 LIFO 关闭，先开的遮罩不得提前关闭（单例覆盖回归锁）', () => {
    modal.loading('第一层')
    modal.loading('第二层')
    modal.loading('第三层')
    expect(h.closeFns).toHaveLength(3)

    modal.closeLoading()
    expect(h.closeFns[2]).toHaveBeenCalledTimes(1)
    expect(h.closeFns[1]).not.toHaveBeenCalled()
    expect(h.closeFns[0]).not.toHaveBeenCalled()

    modal.closeLoading()
    expect(h.closeFns[1]).toHaveBeenCalledTimes(1)
    expect(h.closeFns[0]).not.toHaveBeenCalled()

    modal.closeLoading()
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('closeLoading() 超配调用安全：空栈不做任何事，已关实例不重复关', () => {
    modal.closeLoading()
    expect(h.loadingService).not.toHaveBeenCalled()
    expect(h.closeFns).toHaveLength(0)

    modal.loading('唯一一层')
    modal.closeLoading()
    modal.closeLoading()
    modal.closeLoading()
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
  })

  it('并发多任务 loading/closeLoading 各自配对关闭，最终栈清空', () => {
    modal.loading('A')
    modal.loading('B')
    modal.closeLoading()
    modal.closeLoading()

    expect(h.closeFns).toHaveLength(2)
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
    expect(h.closeFns[1]).toHaveBeenCalledTimes(1)

    // 栈已空：再次 close 不得触发任何 close（否则说明 pop 未收敛）
    modal.closeLoading()
    expect(h.closeFns[0]).toHaveBeenCalledTimes(1)
    expect(h.closeFns[1]).toHaveBeenCalledTimes(1)
  })
})
