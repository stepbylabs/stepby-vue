/**
 * 未保存内容保护（b113）：路由离开与刷新/关标签两条通道。
 *
 * 判据形状说明：
 * - 路由离开必须**真的接到 router 的 leave guard 上**（只做 `addEventListener` 或只写 if 判断
 *   都拦不住 SPA 内跳转），所以这里用真 router（memory history）+ `RouterView` 挂载，
 *   断言"脏 ⇒ 导航被中止、确认后放行；干净 ⇒ 不弹框直接走"；
 * - beforeunload 必须**脏了才** `preventDefault`，"永远阻止"与"永远不阻止"在只看
 *   "有没有监听器"时同形，所以两个方向都断言；
 * - 卸载后不得再拦（否则离开设计器后每次刷新仍会弹）。
 */
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

const confirmAction = vi.hoisted(() => vi.fn(async (_msg: string) => true))
vi.mock('@/utils/confirm', () => ({ confirmAction }))

const dirty = ref(false)
const message = () => '当前大屏有未保存的改动，离开页面后将丢失。确定离开吗？'

const Page = defineComponent({
  name: 'GuardPage',
  setup() {
    useUnsavedChangesGuard(() => dirty.value, message)
    return () => h('div', { class: 'page' }, 'page')
  }
})

const Other = defineComponent({ name: 'OtherPage', setup: () => () => h('div', { class: 'other' }, 'other') })

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/other', component: Other }
    ]
  })
}

const mounted: Array<{ unmount: () => void }> = []

async function mountAt(router: Router) {
  const App = defineComponent({ setup: () => () => h(RouterView) })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] } })
  mounted.push(wrapper)
  return wrapper
}

function fireBeforeUnload(): Event {
  const ev = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(ev)
  return ev
}

describe('未保存内容保护（b113）', () => {
  beforeEach(() => {
    dirty.value = false
    confirmAction.mockClear()
    confirmAction.mockResolvedValue(true)
  })

  afterEach(() => {
    // 未卸载的组件会把 beforeunload 监听留在 window 上，跨用例互相干扰（b113 实测）
    mounted.splice(0).forEach((w) => w.unmount())
    dirty.value = false
  })

  it('脏了才拦：路由离开必须弹确认，取消则导航被中止', async () => {
    const router = makeRouter()
    await mountAt(router)
    dirty.value = true
    confirmAction.mockResolvedValueOnce(false)

    const failure = await router.push('/other')
    expect(confirmAction).toHaveBeenCalledWith(message())
    expect(failure, '取消必须中止导航').toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('确认后放行：导航真的到达目标页', async () => {
    const router = makeRouter()
    await mountAt(router)
    dirty.value = true

    await router.push('/other')
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('干净时不打扰：不弹确认、照常导航', async () => {
    const router = makeRouter()
    await mountAt(router)

    await router.push('/other')
    expect(confirmAction).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('beforeunload：脏了必须阻止关闭，干净时不得阻止', async () => {
    const router = makeRouter()
    await mountAt(router)

    const clean = fireBeforeUnload()
    expect(clean.defaultPrevented, '没有改动时不得阻止刷新').toBe(false)

    dirty.value = true
    const dirtyEv = fireBeforeUnload()
    expect(dirtyEv.defaultPrevented, '有未保存改动时必须阻止刷新').toBe(true)
  })

  it('卸载后不再拦：刷新与导航都回到无守卫状态', async () => {
    const router = makeRouter()
    const wrapper = await mountAt(router)
    dirty.value = true
    wrapper.unmount()

    const ev = fireBeforeUnload()
    expect(ev.defaultPrevented, '卸载后不得再监听 beforeunload').toBe(false)
    await router.push('/other')
    expect(confirmAction, '卸载后 leave guard 必须已被摘除').not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/other')
  })
})
