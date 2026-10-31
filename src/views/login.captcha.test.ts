/**
 * 登录页验证码读取失败的结局（b142）。
 *
 * 立的案：`getCode()` 的 catch 把 `captchaEnabled = false` —— 一次网络故障被读成
 * 「后端关闭了验证码」，于是**验证码输入框整个消失**，用户在看起来不需要验证码的
 * 表单上提交；后端仍要校验 ⇒ 必然失败，且界面上没有任何解释。
 *
 * 本文件钉三件事：
 * ① 读取失败时验证码输入框仍在、失败条可见、有重试入口；
 * ② 重试成功后图片出现、失败条消失；
 * ③ 提交闸：uuid 缺失时点击登录不得打出 /login（对照组：uuid 就绪时照常提交）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  getCodeImg: vi.fn(),
  login: vi.fn(() => Promise.resolve()),
  applyLoginToken: vi.fn(),
  push: vi.fn(() => Promise.resolve()),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  takePendingHandoff: vi.fn(() => null)
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})
vi.mock('element-plus', async (orig) => {
  const actual = await orig<typeof import('element-plus')>()
  return { ...actual, ElMessage: { warning: hoisted.warning, error: hoisted.error, success: hoisted.success } }
})
vi.mock('@/api/login', () => ({ getCodeImg: (...a: unknown[]) => hoisted.getCodeImg(...a) }))
vi.mock('@/api/oauth', () => ({
  listEnabledProviders: () => Promise.resolve({ data: [] }),
  getAuthorizeUrl: vi.fn(),
  bindOauth: vi.fn(() => Promise.resolve())
}))
vi.mock('@/api/webauthn', () => ({ webauthnLoginStart: vi.fn(), webauthnLoginFinish: vi.fn() }))
vi.mock('@/store/modules/user', () => ({
  default: () => ({ login: hoisted.login, applyLoginToken: hoisted.applyLoginToken })
}))
vi.mock('js-cookie', () => ({
  default: { get: () => undefined, set: vi.fn(), remove: vi.fn() }
}))
vi.mock('@/utils/oauth', () => ({ takePendingHandoff: hoisted.takePendingHandoff }))
vi.mock('@/utils/webauthn', () => ({
  isWebauthnSupported: () => false,
  isUserCancelled: () => false,
  classifyWebauthnFailure: () => 'unknown',
  toRequestOptions: (x: unknown) => x,
  assertionToDto: () => ({})
}))
vi.mock('@/utils/redirect', () => ({ resolveLoginTarget: () => ({ kind: 'spa', target: '/' }) }))
vi.mock('@/composables/useRetryAfterLock', async () => {
  const { ref } = await import('vue')
  return {
    useRetryAfterLock: () => ({
      remaining: ref(0),
      locked: ref(false),
      startFrom: vi.fn(),
      stop: vi.fn()
    })
  }
})
vi.mock('@/settings', () => ({ default: { footerContent: '' } }))
vi.mock('@element-plus/icons-vue', () => {
  const stub = { name: 'IconStub', render: () => null }
  return { View: stub, Hide: stub, Loading: stub }
})

import { createRouter, createMemoryHistory } from 'vue-router'
import Login from './login.vue'

// 用真实 memory router 而不是 mock 'vue-router'：登录页通过 auto-import 取 useRoute，
// mock 模块在 SFC 侧不生效（实测 route 为 undefined），而真实 router 的注入才是生产形态。
async function makeRouter() {
  const Page = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/:pathMatch(.*)*', component: Page }
    ]
  })
  await router.push('/')
  await router.isReady()
  return router
}

const ElFormStub = defineComponent({
  name: 'ElFormStub',
  setup(
    _p: Record<string, unknown>,
    {
      expose,
      slots
    }: {
      expose: (e: { validate: (cb: (ok: boolean) => void) => void }) => void
      slots: { default?: () => VNode[] | undefined }
    }
  ) {
    expose({ validate: (cb: (ok: boolean) => void) => cb(true) })
    return () => h('form', slots.default?.())
  }
})

const stubs = {
  transition: true,
  View: { template: '<i />' },
  Hide: { template: '<i />' },
  Loading: { template: '<i />' },
  'el-form': ElFormStub,
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': {
    props: ['name', 'placeholder'],
    template: '<input :name="name" :placeholder="placeholder" />'
  },
  // 必须把原生事件透出去：模板里用了 `@click.prevent`，组件事件不携带 $event 时
  // withModifiers 会在 preventDefault 上抛错（处理器根本不会执行）
  'el-button': { template: '<button @click="$emit(\'click\', $event)"><slot /></button>' },
  'el-checkbox': { template: '<label><slot /></label>' },
  'el-divider': { template: '<div><slot /></div>' },
  'el-alert': { props: ['title'], template: '<div class="alert-stub">{{ title }}</div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'svg-icon': { template: '<i />' },
  'router-link': { template: '<a><slot /></a>' }
}

async function mountLogin() {
  const router = await makeRouter()
  return mount(Login, {
    global: { plugins: [router], stubs, directives: { loading: {} } }
  })
}

function signInButton(w: VueWrapper) {
  return w.findAll('button').find((b) => b.text().includes('common.login'))
}

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.getCodeImg.mockReset()
  hoisted.login.mockReset()
  hoisted.login.mockResolvedValue(undefined)
})

describe('login 验证码读取失败', () => {
  it('读取失败：验证码输入框仍在、失败条可见、可重试', async () => {
    hoisted.getCodeImg.mockRejectedValueOnce(new Error('network down'))
    const w = await mountLogin()
    await flushPromises()

    expect(w.find('input[name="captcha"]').exists(), '失败不得把验证码输入框一起隐藏').toBe(true)
    const alert = w.find('[role="alert"]')
    expect(alert.exists(), '失败必须可见').toBe(true)
    expect(alert.text()).toContain('login.captchaLoadFailed')
    expect(w.findAll('button').some((b) => b.text() === 'common.retry')).toBe(true)
    // 反向：不得伪装成"后端关闭了验证码"
    expect(w.text()).not.toContain('login.code')
  })

  it('重试成功：图片出现、失败条消失', async () => {
    hoisted.getCodeImg.mockRejectedValueOnce(new Error('network down'))
    const w = await mountLogin()
    await flushPromises()

    hoisted.getCodeImg.mockResolvedValueOnce({
      captchaEnabled: true,
      img: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      uuid: 'u-1'
    })
    const retry = w.findAll('button').find((b) => b.text() === 'common.retry')
    await retry!.trigger('click')
    await flushPromises()

    expect(hoisted.getCodeImg).toHaveBeenCalledTimes(2)
    expect(w.find('[role="alert"]').exists(), '成功之后失败条必须消失').toBe(false)
    expect(w.find('img').exists()).toBe(true)
  })

  it('提交闸：uuid 缺失时点登录不得发 /login；uuid 就绪时照常提交（对照组）', async () => {
    hoisted.getCodeImg.mockRejectedValueOnce(new Error('network down'))
    const w = await mountLogin()
    await flushPromises()

    // 闸门会顺带自动重取一次验证码；让它也失败，保持 uuid 缺失的断面
    hoisted.getCodeImg.mockRejectedValueOnce(new Error('still down'))
    await signInButton(w)!.trigger('click')
    await flushPromises()
    expect(hoisted.login, 'uuid 缺失时登录必然失败，不得打出去').not.toHaveBeenCalled()
    expect(hoisted.warning).toHaveBeenCalled()

    // 重试成功 ⇒ uuid 就绪，同一按钮必须真的能提交（证明闸门不是"永远拦住"）
    hoisted.getCodeImg.mockResolvedValueOnce({ captchaEnabled: true, img: 'AAAA', uuid: 'u-2' })
    await w
      .findAll('button')
      .find((b) => b.text() === 'common.retry')!
      .trigger('click')
    await flushPromises()
    await signInButton(w)!.trigger('click')
    await flushPromises()
    expect(hoisted.login).toHaveBeenCalledTimes(1)
  })
})
