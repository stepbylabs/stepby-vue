/**
 * 错误边界的**分类**契约（批一百零三）。
 *
 * 立案：`AppMain` 用本组件包住整棵页面树，而它原先对**任何**被捕获的错误都卸载整页。
 * 于是"某个接口 500"或"用户在确认框里点取消"都会让页面变成「页面加载失败」，
 * 已填的表单一起消失——用户看到的症状远大于事实。b102 已在五处逐页补 try/catch，
 * 但那只能修那一处：新增页面少写一个 catch 就复发。本批把判定收进边界自身：
 *
 * - **请求层拒绝**（拦截器打标记）⇒ 保留页面、不进错误监控（拦截器已向用户提示）；
 * - **确认框取消**（`'cancel'` / `'close'`）⇒ 保留页面、不上报（正常分支）；
 * - **其它错误**（渲染 / 编程错误）⇒ 照旧卸载并上报。
 *
 * 可证伪：把 `onErrorCaptured` 里的两条提前 return 删掉，前两条用例立刻变红
 * （错误 UI 出现）；把第三条的兜底改成"也保留页面"，第三条变红。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// 不 mock vue-router：`@/utils/request` 会经 store/user 间接 import 应用路由，
// 把整个模块替换掉会让 `createWebHistory` 变成 undefined（首跑实测）。
// 边界只在「返回首页」按钮里用 router.push，本文件不点它。
vi.mock('@/utils/errorReporter', () => ({ errorReporter: { report: vi.fn() } }))

import ErrorBoundary from './index.vue'
import service from '@/utils/request'
import { errorReporter } from '@/utils/errorReporter'
import { isDialogCancel, isRequestLayerError, markRequestLayerError } from '@/utils/requestError'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      errorBoundary: {
        title: 'Something went wrong',
        desc: 'Try again',
        retry: 'Retry',
        goHome: 'Home',
        details: 'Details'
      }
    }
  }
})

/** 子组件：按钮的点击处理器返回被拒绝的 Promise（Vue 会把它交给错误边界） */
function childRejecting(value: unknown) {
  return defineComponent({
    name: 'ExplodingChild',
    setup() {
      return () => h('button', { class: 'boom', onClick: () => Promise.reject(value) }, 'go')
    }
  })
}

function factory(value: unknown) {
  return mount(ErrorBoundary, {
    slots: { default: () => h(childRejecting(value)) },
    global: {
      plugins: [i18n],
      stubs: {
        'el-icon': true,
        'el-button': { template: '<button><slot /></button>' }
      }
    }
  })
}

async function clickAndSettle(wrapper: ReturnType<typeof factory>) {
  await wrapper.find('.boom').trigger('click')
  await nextTick()
  await nextTick()
}

describe('ErrorBoundary 分类', () => {
  beforeEach(() => {
    vi.mocked(errorReporter.report).mockClear()
  })

  it('接口失败：保留页面、不显示错误 UI、不进错误监控', async () => {
    const err = new Error('账号不存在')
    markRequestLayerError(err)
    const wrapper = factory(err)
    await clickAndSettle(wrapper)
    expect(wrapper.find('.error-boundary').exists()).toBe(false)
    expect(wrapper.find('.boom').exists()).toBe(true)
    expect(errorReporter.report).not.toHaveBeenCalled()
  })

  it('确认框取消：保留页面、不上报', async () => {
    const wrapper = factory('cancel')
    await clickAndSettle(wrapper)
    expect(wrapper.find('.error-boundary').exists()).toBe(false)
    expect(wrapper.find('.boom').exists()).toBe(true)
    expect(errorReporter.report).not.toHaveBeenCalled()
  })

  it('关闭确认框（close）同属取消', async () => {
    const wrapper = factory('close')
    await clickAndSettle(wrapper)
    expect(wrapper.find('.error-boundary').exists()).toBe(false)
    expect(errorReporter.report).not.toHaveBeenCalled()
  })

  it('真实错误：照旧卸载页面并上报（反证前两条没有把边界关掉）', async () => {
    const wrapper = factory(new Error('渲染炸了'))
    await clickAndSettle(wrapper)
    expect(wrapper.find('.error-boundary').exists()).toBe(true)
    expect(errorReporter.report).toHaveBeenCalledTimes(1)
  })

  it('取消类判定只认 Element Plus 的两个契约值（不把普通字符串错误吞掉）', async () => {
    const wrapper = factory('some-other-string-error')
    await clickAndSettle(wrapper)
    expect(wrapper.find('.error-boundary').exists()).toBe(true)
    expect(errorReporter.report).toHaveBeenCalledTimes(1)
  })
})

describe('真实请求链 ⇒ 边界不卸载（打标记与分类的接线）', () => {
  // 上一条 describe 的最后一个用例是"普通字符串错误"——它的上报可能在本用例开始时才落地，
  // 不隔离就会把**上一条用例的**调用算进来（首跑实测）。
  beforeEach(() => {
    vi.mocked(errorReporter.report).mockClear()
  })

  it('拦截器产出的业务失败拒绝，经真实 Vue 事件处理器后页面仍在', async () => {
    // 走真实 service + 桩适配器：**不手工打标记**，标记必须由响应拦截器自己产出。
    // 这条用例补的是"单元测试手工打标记"与"浏览器里真有请求失败"之间的那段接线。
    let calls = 0
    const prev = service.defaults.adapter
    service.defaults.adapter = async (config) => {
      calls += 1
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
        data: { code: 500, msg: '边界接线探针' }
      } as unknown as import('axios').AxiosResponse
    }
    const child = defineComponent({
      name: 'RequestFailingChild',
      setup() {
        // 处理器**返回**被拒绝的 Promise（不 catch）：这正是 Vue 把错误交给边界的那条通道。
        // 首跑用原生 addEventListener + 不返回 Promise，拒绝走的是 window 的
        // unhandledrejection（边界根本没参与），断言会空跑恒绿——已按实测改正。
        return () => h('button', { class: 'boom', onClick: () => service.get('/__probe_boundary__') }, 'go')
      }
    })
    const wrapper = mount(ErrorBoundary, {
      slots: { default: () => h(child) },
      global: {
        plugins: [i18n],
        stubs: { 'el-icon': true, 'el-button': { template: '<button><slot /></button>' } }
      }
    })
    try {
      await wrapper.find('.boom').trigger('click')
      // 等到请求真的完成（不用固定 nextTick 次数：axios 的链需要几跳微任务，
      // 次数写少了会在"拒绝还没到边界"时就断言——变异证伪实测过这一空跑形态）
      for (let i = 0; i < 50 && calls < 1; i++) await new Promise((r) => setTimeout(r, 10))
      await new Promise((r) => setTimeout(r, 60))
      expect(calls, '请求必须真的发出（否则断言的是空跑）').toBe(1)
      expect(wrapper.find('.error-boundary').exists()).toBe(false)
      expect(wrapper.find('.boom').exists()).toBe(true)
      expect(errorReporter.report).not.toHaveBeenCalled()
    } finally {
      service.defaults.adapter = prev
    }
  })
})

describe('requestError 谓词', () => {
  it('标记只加在对象上，原始值与非对象安全返回', () => {
    const obj = { message: 'x' }
    expect(isRequestLayerError(obj)).toBe(false)
    markRequestLayerError(obj)
    expect(isRequestLayerError(obj)).toBe(true)
    markRequestLayerError('str')
    markRequestLayerError(null)
    markRequestLayerError(undefined)
    expect(isRequestLayerError('str')).toBe(false)
    expect(isRequestLayerError(null)).toBe(false)
  })

  it('冻结对象打不上标记也不得抛错', () => {
    const frozen = Object.freeze({ message: 'x' })
    expect(() => markRequestLayerError(frozen)).not.toThrow()
    expect(isRequestLayerError(frozen)).toBe(false)
  })

  it('取消值集合固定为 cancel / close', () => {
    expect(isDialogCancel('cancel')).toBe(true)
    expect(isDialogCancel('close')).toBe(true)
    expect(isDialogCancel('cancelled')).toBe(false)
    expect(isDialogCancel(new Error('cancel'))).toBe(false)
    expect(isDialogCancel(undefined)).toBe(false)
  })
})
