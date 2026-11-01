/**
 * 用户详情抽屉的「快照与查询身份同生同灭」回归锁（b146）。
 *
 * 立的案（HEAD 实测 `views/system/user/view.vue:148/176-191`）：`info` 是一个
 * **永不复位**的 `reactive`，`postOptions` / `roleOptions` 只在成功分支赋值，`catch`
 * 只写 DEV 日志。于是"看完 A 的详情再看 B、而 B 这次没读到"时，抽屉里是 A 的账号、
 * 部门、状态标签冒充 B —— 与 ㊷ 在报表/大屏/缓存页立的那条纪律同族，只是这一处
 * 从来没有被任何判据覆盖。`Object.assign(info, res.data || {})` 还有第二种陈旧形态：
 * B 成功了但某个字段为空 ⇒ A 的旧值原地幸存（assign 不删键）。
 *
 * 四条判据：
 * ① 换人 + 读失败 ⇒ 屏上不得残留上一个人的任何字段，且必须有可见失败态 + 重试；
 * ② 失败后重试成功 ⇒ 数据回来、告警消失（防"永远禁用/永远报警"的假修复）；
 * ③ 200 但 `data` 为空 ⇒ 同样算"没读到"（b133 ②，空对象冒充资料与拿上一个人的资料同级）；
 * ④ 成功且字段缺省 ⇒ 不得留着上一个人的该字段（assign 不删键这一支单独钉）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock('@/api/system/user', () => ({ getUser: (...a: unknown[]) => hoisted.getUser(...a) }))
vi.mock('@/utils/dict', () => ({ useDict: () => ({ sys_user_sex: { value: [] } }) }))
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import UserView from './view.vue'

const stubs = {
  'el-drawer': {
    props: ['modelValue', 'title'],
    template: '<div class="drawer-stub"><slot /></div>'
  },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="alert-stub" :data-type="type">{{ title }}<slot /></div>'
  },
  'el-button': {
    props: ['disabled'],
    emits: ['click'],
    template: '<button class="btn-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-tag': { template: '<span class="tag-stub"><slot /></span>' },
  'el-divider': { template: '<div />' },
  'el-card': { template: '<div><slot /></div>' }
}

function mountDrawer() {
  return mount(UserView, { global: { stubs, directives: { loading: {} } } })
}

/** 与 HEAD 真实响应同形：data + posts + roles + postIds + roleIds（㉓ 夹具形状=产出形状） */
function userPayload(userName: string, extra: Record<string, unknown> = {}) {
  return {
    data: { userName, nickName: 'nick-' + userName, dept: { deptName: 'dept-' + userName }, status: '0', ...extra },
    posts: [{ postId: 11, postName: 'post-' + userName }],
    roles: [{ roleId: 22, roleName: 'role-' + userName }],
    postIds: [11],
    roleIds: [22]
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('用户详情抽屉的陈旧快照与失败态（b146）', () => {
  it('① 看惯 A 之后看 B 失败：屏上不得有 A 的任何字段，且必须报失败', async () => {
    hoisted.getUser.mockResolvedValueOnce(userPayload('alice'))
    const wrapper = mountDrawer()
    const vm = wrapper.vm as unknown as { open: (id: number) => Promise<void> }
    await vm.open(1)
    await flushPromises()
    expect(wrapper.text()).toContain('alice')

    hoisted.getUser.mockRejectedValueOnce(new Error('network'))
    await vm.open(2)
    await flushPromises()

    const text = wrapper.text()
    for (const stale of ['alice', 'nick-alice', 'dept-alice', 'post-alice', 'role-alice']) {
      expect(text, `陈旧快照残留了上一个人的字段：${stale}`).not.toContain(stale)
    }
    const alerts = wrapper.findAll('.alert-stub').map((a) => a.text())
    expect(
      alerts.some((x) => x.includes('common.loadFailed')),
      `失败必须可见：${JSON.stringify(alerts)}`
    ).toBe(true)
    expect(
      wrapper.findAll('.btn-stub').some((b) => b.text().includes('common.retry')),
      '必须有重试入口'
    ).toBe(true)
  })

  it('② 失败后点重试成功：告警消失、数据回来（防"永远报警"的假修复）', async () => {
    hoisted.getUser.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountDrawer()
    const vm = wrapper.vm as unknown as { open: (id: number) => Promise<void> }
    await vm.open(3)
    await flushPromises()
    expect(wrapper.text()).toContain('common.loadFailed')

    hoisted.getUser.mockResolvedValueOnce(userPayload('carol'))
    const retry = wrapper.findAll('.btn-stub').find((b) => b.text().includes('common.retry'))!
    await retry.trigger('click')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('carol')
    expect(text).not.toContain('common.loadFailed')
    expect(hoisted.getUser).toHaveBeenCalledTimes(2)
    // 重试必须重问**同一个人**，不能退回上一次打开的 id
    expect(hoisted.getUser.mock.calls[1][0]).toBe(3)
  })

  it('③ 200 但没有 data：同样算"没读到"，不得渲染成空资料静默通过', async () => {
    hoisted.getUser.mockResolvedValueOnce({ data: null, posts: [], roles: [], postIds: [], roleIds: [] })
    const wrapper = mountDrawer()
    const vm = wrapper.vm as unknown as { open: (id: number) => Promise<void> }
    await vm.open(4)
    await flushPromises()

    expect(wrapper.text()).toContain('common.loadFailed')
    expect(wrapper.find('.drawer-stub').text()).not.toContain('userView.basicInfo')
  })

  it('④ B 成功了但某字段缺省：不得留着 A 的该字段（Object.assign 不删键这一支）', async () => {
    hoisted.getUser.mockResolvedValueOnce(userPayload('dave', { remark: 'A 的备注' }))
    const wrapper = mountDrawer()
    const vm = wrapper.vm as unknown as { open: (id: number) => Promise<void> }
    await vm.open(5)
    await flushPromises()
    expect(wrapper.text()).toContain('A 的备注')

    // 第二个人成功返回，但没有 remark 字段
    hoisted.getUser.mockResolvedValueOnce(userPayload('erin'))
    await vm.open(6)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('erin')
    expect(text, '上一个人的备注幸存了').not.toContain('A 的备注')
    expect(text).not.toContain('dave')
  })

  it('⑤ 对照组：正常成功不弹任何失败条，字段照常显示', async () => {
    hoisted.getUser.mockResolvedValueOnce(userPayload('frank'))
    const wrapper = mountDrawer()
    const vm = wrapper.vm as unknown as { open: (id: number) => Promise<void> }
    await vm.open(7)
    await flushPromises()

    expect(wrapper.findAll('.alert-stub')).toHaveLength(0)
    expect(wrapper.text()).toContain('frank')
    expect(wrapper.text()).toContain('nick-frank')
    expect(wrapper.text()).toContain('dept-frank')
  })
})
