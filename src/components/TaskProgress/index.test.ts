/**
 * components/TaskProgress 覆盖测试（批六十五覆盖率工程）。
 *
 * 覆盖真实行为：登录态才订阅 WS / 任务新增与合并（同 id 覆盖）/ 超过 20 条截断并回收
 * dismissed / 状态文案与标签色映射 / 进度条 status 映射 / 忽略无效消息 / 关闭单条 /
 * 清除已完成（并回收 dismissed）/ 折叠切换 / 卸载取消订阅。
 *
 * 仅 mock 重依赖（图标 / 用户 store / wsService），组件内部逻辑全真实执行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

const hoisted = vi.hoisted(() => ({
  token: 'tk' as string | undefined,
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('@element-plus/icons-vue', async () => {
  const { h } = await import('vue')
  const mk = (cls: string) => ({ name: cls, render: () => h('i', { class: cls }) })
  return {
    Loading: mk('ic-loading'),
    Finished: mk('ic-finished'),
    ArrowUp: mk('ic-up'),
    ArrowDown: mk('ic-down'),
    Close: mk('ic-close')
  }
})

vi.mock('@/store/modules/user', () => ({
  default: () => ({
    get token() {
      return hoisted.token
    }
  })
}))

vi.mock('@/utils/websocket', () => ({
  wsService: { on: hoisted.on, off: hoisted.off }
}))

import TaskProgress from './index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      taskProgress: {
        title: 'Tasks',
        statusWaiting: 'Waiting',
        statusRunning: 'Running',
        statusCompleted: 'Completed',
        statusFailed: 'Failed',
        clearCompleted: 'Clear',
        collapse: 'Collapse'
      }
    }
  }
})

const stubs = {
  // 显式关闭内建过渡桩：默认桩会把 TransitionGroup 也替换掉，导致 v-show 丢失（折叠用例需真实渲染）
  transition: false,
  'transition-group': false,
  // 声明 emits 以阻止原生 click 冒泡与 $emit 双重触发（否则切换类操作被抵消）
  'el-button': { emits: ['click'], template: '<button class="btn" @click="$emit(\'click\')"><slot /></button>' },
  'el-tag': { props: ['type'], template: '<span class="tag" :data-type="type"><slot /></span>' },
  'el-progress': { props: ['percentage', 'status'], template: '<div class="prog" :data-p="percentage" :data-s="status" />' }
}

function factory() {
  return mount(TaskProgress, { global: { plugins: [i18n], stubs } })
}

/** 从 on 订阅里取出组件注册的 taskProgress 处理器 */
function getHandler(): (msg: unknown) => void {
  const call = hoisted.on.mock.calls.find((c) => c[0] === 'taskProgress')
  return call?.[1] as (msg: unknown) => void
}

const mkTask = (over: Record<string, unknown> = {}) => ({
  taskId: 1,
  taskType: 'export',
  taskName: 'T1',
  status: 'running',
  progress: 40,
  total: 10,
  current: 4,
  ...over
})

describe('components/TaskProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.token = 'tk'
  })

  it('登录态挂载 → 订阅 taskProgress；卸载 → 取消订阅', () => {
    const w = factory()
    expect(hoisted.on).toHaveBeenCalledWith('taskProgress', expect.any(Function))
    w.unmount()
    expect(hoisted.off).toHaveBeenCalledWith('taskProgress', expect.any(Function))
  })

  it('未登录（无 token）→ 不订阅', () => {
    hoisted.token = undefined
    factory()
    expect(hoisted.on).not.toHaveBeenCalled()
  })

  it('新任务 unshift 渲染；同 id 消息合并覆盖', async () => {
    const w = factory()
    const h = getHandler()
    h({ type: 'taskProgress', data: mkTask({ taskId: 1, taskName: 'Alpha', progress: 10 }) })
    await nextTick()
    expect(w.text()).toContain('Alpha')
    expect(w.find('.prog').attributes('data-p')).toBe('10')
    // 同 id 更新
    h({ type: 'taskProgress', data: mkTask({ taskId: 1, taskName: 'Alpha', progress: 80 }) })
    await nextTick()
    expect(w.find('.prog').attributes('data-p')).toBe('80')
    expect(w.findAll('.task-progress-item')).toHaveLength(1)
  })

  it('无效消息（缺 taskId）忽略', async () => {
    const w = factory()
    getHandler()({ type: 'taskProgress', data: {} })
    await nextTick()
    expect(w.findAll('.task-progress-item')).toHaveLength(0)
  })

  it('超过 20 条 → 截断保留前 20', async () => {
    const w = factory()
    const h = getHandler()
    for (let i = 1; i <= 25; i++) h({ type: 'taskProgress', data: mkTask({ taskId: i, taskName: `T${i}` }) })
    await nextTick()
    expect(w.findAll('.task-progress-item')).toHaveLength(20)
    expect(w.text()).toContain('T25')
  })

  it('状态映射：文案 / 标签色 / 进度条 status', async () => {
    const w = factory()
    const h = getHandler()
    h({ type: 'taskProgress', data: mkTask({ taskId: 1, status: 'success' }) })
    h({ type: 'taskProgress', data: mkTask({ taskId: 2, status: 'failed' }) })
    h({ type: 'taskProgress', data: mkTask({ taskId: 3, status: 'pending' }) })
    await nextTick()
    const text = w.text()
    expect(text).toContain('Completed')
    expect(text).toContain('Failed')
    expect(text).toContain('Waiting')
    const tags = w.findAll('.tag').map((t) => t.attributes('data-type'))
    expect(tags).toContain('success')
    expect(tags).toContain('danger')
    const progs = w.findAll('.prog').map((p) => p.attributes('data-s'))
    expect(progs).toContain('success')
    expect(progs).toContain('exception')
    expect(progs).toContain('warning')
  })

  it('关闭单条 → 从可见列表移除（仅终态任务有关闭按钮）', async () => {
    const w = factory()
    getHandler()({ type: 'taskProgress', data: mkTask({ taskId: 1, taskName: 'Only', status: 'success' }) })
    await nextTick()
    expect(w.text()).toContain('Only')
    const closeBtn = w.findAll('.task-progress-item button.btn')[0]
    expect(closeBtn).toBeTruthy()
    await closeBtn.trigger('click')
    await nextTick()
    expect(w.findAll('.task-progress-item')).toHaveLength(0)
  })

  it('清除已完成 → 仅保留 pending/running', async () => {
    const w = factory()
    const h = getHandler()
    h({ type: 'taskProgress', data: mkTask({ taskId: 1, status: 'success', taskName: 'Done' }) })
    h({ type: 'taskProgress', data: mkTask({ taskId: 2, status: 'running', taskName: 'Run' }) })
    await nextTick()
    expect(w.find('.count').text()).toBe('2')
    // 头部第二个按钮为「清除已完成」
    await w.findAll('.task-progress-header button.btn')[1].trigger('click')
    await nextTick()
    // 计数收敛为 1（离开动画在 jsdom 下不移除节点，故以计数断言而非文本）
    expect(w.find('.count').text()).toBe('1')
  })

  it('折叠切换 → 图标由展开切为收起（collapsed 状态翻转）', async () => {
    const w = factory()
    getHandler()({ type: 'taskProgress', data: mkTask({ taskId: 1 }) })
    await nextTick()
    // !collapsed → ArrowUp 分支
    expect(w.find('.ic-up').exists()).toBe(true)
    await w.findAll('.task-progress-header button.btn')[0].trigger('click')
    await nextTick()
    // collapsed → ArrowDown 分支
    expect(w.find('.ic-down').exists()).toBe(true)
  })

  it('无可见任务时不渲染浮层', async () => {
    const w = factory()
    expect(w.find('.task-progress-float').exists()).toBe(false)
  })
})
