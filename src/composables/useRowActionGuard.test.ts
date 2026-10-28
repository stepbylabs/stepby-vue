/**
 * useRowActionGuard（b102）：会向收件人真实投递的行内动作（报表"立即推送"）
 * 必须防连点——连点两次确认 = 投递两份。
 *
 * 覆盖：请求在途置 loading、连点时确认框只弹一次、动作只执行一次、
 * 取消确认不执行、动作失败后状态复位可重试；另含两处页面接线反查
 * （写了组合子但页面不接 = 等于没写）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { useRowActionGuard } from './useRowActionGuard'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 递归收集目录下的 .vue 文件（绝对路径） */
function collectVue(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) collectVue(p, out)
    else if (ent.name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 行内状态开关的识别：有 el-switch，且 @change 指向状态处理函数 */
const STATUS_HANDLER =
  /@change="[^"]*\b(handleStatusChange|handleEnabledChange|handleSubStatusChange|handleEventEnabledChange)\s*\(/

/**
 * 行内状态开关的安全契约（b106）：`v-model` 乐观更新 + 异步确认 ⇒ 必须
 * ① 走 `useRowActionGuard`；② **状态开关本身**绑在途 `:loading`（不是页面任意处出现 `:loading` 就算）；
 * ③ 被挡掉/取消时用 `if (!executed)` 回滚。
 * 返回 null = 合规；否则返回缺失项（用于点名到具体文件）。
 *
 * 判据只看"这一族的写法"，不试图理解页面语义——语义由真实用例覆盖。
 */
const STATUS_SWITCH_TAG = /<el-switch\b[\s\S]*?(?:\/>|>[\s\S]*?<\/el-switch>)/g

/** 去掉包含 marker 的行（合成用例用；用 fromCharCode 拼换行，避免字符串字面量里的转义歧义） */
function withoutLine(text: string, marker: string): string {
  const nl = String.fromCharCode(10)
  return text
    .split(nl)
    .filter((line) => !line.includes(marker))
    .join(nl)
}

function statusSwitchTags(text: string): string[] {
  return [...text.matchAll(STATUS_SWITCH_TAG)].map((m) => m[0]).filter((tag) => STATUS_HANDLER.test(tag))
}

function statusSwitchViolation(text: string): string | null {
  const tags = statusSwitchTags(text)
  if (tags.length === 0) return null
  if (!text.includes("from '@/composables/useRowActionGuard'")) {
    return '状态开关页必须 import useRowActionGuard'
  }
  if (tags.some((tag) => !tag.includes(':loading='))) {
    return '状态开关本身必须绑在途 loading'
  }
  if (!text.includes('if (!executed)')) return '被挡掉/取消时必须回滚（if (!executed)）'
  // 接口失败是另一条出口：catch 里必须先回滚再 rethrow（只 catch 不回滚 = 页面停在没生效的状态）
  if (!/catch\s*(?:\([^)]*\))?\s*\{[\s\S]*?oldVal[\s\S]*?throw/.test(text)) {
    return '接口失败时必须在 catch 内回滚（oldVal）并 rethrow'
  }
  return null
}

/**
 * 已登记豁免（逐条自足理由）：**不是"以后再说"，而是"这一页的结构使得组合子语义不适用"**。
 * 豁免条目必须仍然落在采集面里（下方断言），避免"豁免"变成"静默退出采集面"。
 */
const STATUS_SWITCH_EXEMPT: Record<string, string> = {
  'src/views/system/webHook/EventCatalogSection.vue':
    '该开关用 :model-value 而非 v-model（成功后才写 row.enabled，本身没有乐观状态可回滚），' +
    '且已有按行 eventEnabledLoadingId（loading 即禁用）与 catch 回滚；' +
    '交给 guarded 只会多一层同期锁，不改变结局语义'
}

/** 承诺面：这些页面曾逐个被证明有行内状态开关（消失=被删或改名，必须重新登记） */
const KNOWN_STATUS_SWITCH_PAGES = [
  'src/views/monitor/alert/index.vue',
  'src/views/monitor/job/index.vue',
  'src/views/system/rateLimit/index.vue',
  'src/views/system/report/index.vue',
  'src/views/system/report/sub/index.vue',
  'src/views/system/report/SubReportSection.vue',
  'src/views/system/role/index.vue',
  'src/views/system/tenant/index.vue',
  'src/views/system/tenant/TenantDomainPanel.vue',
  'src/views/system/user/index.vue',
  'src/views/system/webHook/EventCatalogSection.vue',
  'src/views/system/webHook/index.vue'
]

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('useRowActionGuard（行内动作互斥 + loading）', () => {
  it('请求在途：runningIds 含该行；结束后清空', async () => {
    const gate = useRowActionGuard<number>()
    const action = deferred()
    const run = gate.guarded(
      1,
      () => Promise.resolve(true),
      () => action.promise
    )
    await flush()
    expect(gate.runningIds.value).toEqual([1])
    action.resolve()
    await run
    expect(gate.runningIds.value).toEqual([])
  })

  it('连点：确认框只弹一次、动作只执行一次（投递不得重复）', async () => {
    const gate = useRowActionGuard<number>()
    const confirm = deferred<unknown>()
    const action = vi.fn(async () => {})
    const first = gate.guarded(1, () => confirm.promise, action)
    // 第二次点击发生在确认框还开着的时候
    const second = gate.guarded(1, () => confirm.promise, action)
    await second
    expect(action).not.toHaveBeenCalled()
    confirm.resolve(true)
    await first
    expect(action).toHaveBeenCalledTimes(1)
    expect(gate.runningIds.value).toEqual([])
  })

  it('取消确认：动作不执行，且锁已释放（再次点击可正常走完）', async () => {
    const gate = useRowActionGuard<number>()
    const action = vi.fn(async () => {})
    await gate.guarded(1, () => Promise.reject(new Error('cancel')), action)
    expect(action).not.toHaveBeenCalled()
    expect(gate.runningIds.value).toEqual([])
    await gate.guarded(1, () => Promise.resolve(true), action)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('动作失败：onError 收到原因、状态复位、可重试（不得永久锁死）', async () => {
    const onError = vi.fn()
    const gate = useRowActionGuard<number>(onError)
    const boom = new Error('network down')
    await gate.guarded(
      7,
      () => Promise.resolve(true),
      () => Promise.reject(boom)
    )
    expect(onError).toHaveBeenCalledWith(7, boom)
    expect(gate.runningIds.value).toEqual([])
    const ok = vi.fn(async () => {})
    await gate.guarded(7, () => Promise.resolve(true), ok)
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('不同行互不影响：A 在途时 B 仍可执行', async () => {
    const gate = useRowActionGuard<number>()
    const a = deferred()
    const done = vi.fn(async () => {})
    const first = gate.guarded(
      1,
      () => Promise.resolve(true),
      () => a.promise
    )
    await gate.guarded(2, () => Promise.resolve(true), done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(gate.runningIds.value).toEqual([1])
    a.resolve()
    await first
    expect(gate.runningIds.value).toEqual([])
  })

  it('返回值 = 本次是否真的执行了动作（被挡掉/取消为 false，动作失败仍为 true）', async () => {
    const gate = useRowActionGuard<number>()
    const confirm = deferred<unknown>()
    const action = vi.fn(async () => {})
    const first = gate.guarded(1, () => confirm.promise, action)
    // 同一行在飞：第二次必须被同步闸挡掉，返回值让页面知道"这次没发请求"
    await expect(gate.guarded(1, () => confirm.promise, action)).resolves.toBe(false)
    confirm.resolve(true)
    await expect(first).resolves.toBe(true)
    // 用户取消：动作没执行 ⇒ false
    await expect(gate.guarded(1, () => Promise.reject(new Error('cancel')), action)).resolves.toBe(false)
    // 动作执行了但失败：仍算"已执行"（页面据 runningIds/onError 处理结果，不回滚成"没点过"）
    await expect(
      gate.guarded(
        1,
        () => Promise.resolve(true),
        async () => {
          throw new Error('boom')
        }
      )
    ).resolves.toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('接线反查：告警页启停开关必须走同一份组合子并按返回结局回滚', () => {
    const src = readFileSync(resolve(VUE_ROOT, 'src/views/monitor/alert/index.vue'), 'utf8')
    expect(src, '必须 import useRowActionGuard').toContain("from '@/composables/useRowActionGuard'")
    expect(src, '必须按行绑 loading（不得再用全局单一 id）').toContain(
      ':loading="switchLoadingIds.includes(scope.row.id)"'
    )
    expect(src, '必须按返回值决定回滚').toContain('if (!executed)')
    // 接口失败是第六条出口：guarded 返回 true（动作已执行），回滚必须写在 action 的 catch 里
    expect(src, '接口失败必须回滚开关').toContain('row.enabled = oldVal')
    expect(src, '回滚后必须把错误交回组合子（不得吞掉失败）').toMatch(/row\.enabled = oldVal\s*\n\s*throw e/)
    // 下拉加载失败必须在弹窗里可见并可重试（失败不得装成"没有可选渠道"）
    expect(src, '下拉失败提示必须绑定 optionsLoadError').toContain('v-if="optionsLoadError"')
    expect(src, '下拉失败必须给重试入口').toContain('@click="retryLoadOptions"')
  })

  it('接线反查：所有行内状态开关页必须走同一份组合子并绑在途 loading（采集面由事实派生）', () => {
    const files = collectVue(resolve(VUE_ROOT, 'src/views'))
    // 采集面下限：扫不到文件/畸形时不得打 OK（"没跑"与"跑了且干净"必须可区分）
    expect(files.length).toBeGreaterThan(100)
    const surface: string[] = []
    for (const abs of files) {
      const src = readFileSync(abs, 'utf8')
      if (statusSwitchTags(src).length === 0) continue
      const rel = abs
        .slice(VUE_ROOT.length + 1)
        .split(sep)
        .join('/')
      surface.push(rel)
      if (STATUS_SWITCH_EXEMPT[rel]) continue
      const violation = statusSwitchViolation(src)
      expect(violation, `${rel}: ${violation}`).toBeNull()
    }
    // 承诺面：已知页面一个都不能少（页面改名/被删 ⇒ 必须重新登记，而不是静默缩小采集面）
    for (const known of KNOWN_STATUS_SWITCH_PAGES) {
      expect(surface, `承诺面缺少 ${known}（改名或删除后需重新登记）`).toContain(known)
    }
    // 反向：豁免条目必须仍命中采集面（豁免失效 = 该条目在描述一个不存在的页面）
    for (const exempt of Object.keys(STATUS_SWITCH_EXEMPT)) {
      expect(surface, `豁免 ${exempt} 未命中采集面 ⇒ 应撤销该豁免`).toContain(exempt)
    }
  })

  it('状态开关判据的合成双向：缺任一条契约都必须被抓，合规/不属于这一族的写法不得误报', () => {
    const compliant = `<template><el-switch v-model="row.status" :loading="ids.includes(row.id)" @change="handleStatusChange(row)" /></template>
<script setup lang="ts">
import { useRowActionGuard } from '@/composables/useRowActionGuard'
const { runningIds: ids, guarded } = useRowActionGuard<number>()
async function handleStatusChange(row: Row) {
  const oldVal = row.status === '0' ? '1' : '0'
  const executed = await guarded(row.id, () => modal.confirm('x'), async () => {
    try { await api(row.id, row.status) } catch (e) { row.status = oldVal; throw e }
  })
  if (!executed) row.status = oldVal
}
</script>`
    expect(statusSwitchViolation(compliant)).toBeNull()

    // ① 没有组合子（原缺陷形态）
    expect(statusSwitchViolation(withoutLine(compliant, "from '@/composables/useRowActionGuard'"))).toContain(
      'useRowActionGuard'
    )
    // ② 有组合子但开关没绑 loading（看不出在飞、仍可连点）
    expect(statusSwitchViolation(compliant.replace(' :loading="ids.includes(row.id)"', ''))).toContain('loading')
    // ③ 有组合子但缺回滚（被挡掉/取消后开关停在没生效的位置）
    expect(statusSwitchViolation(withoutLine(compliant, 'if (!executed) row.status = oldVal'))).toContain('回滚')

    // ④ catch 里只 rethrow 不回滚（页面停在"看起来生效"的状态）
    const noRevert = compliant.replace(
      'try { await api(row.id, row.status) } catch (e) { row.status = oldVal; throw e }',
      'try { await api(row.id, row.status) } catch (e) { throw e }'
    )
    expect(statusSwitchViolation(noRevert)).toContain('catch 内回滚')

    // 不误报：没有任何状态处理器的 form 开关 / 无 switch 的页面
    const formSwitch = `<el-switch v-model="form.enabled" />`
    expect(statusSwitchViolation(formSwitch)).toBeNull()
    const noSwitch = `<el-button @click="handleStatusChange(row)">x</el-button>`
    expect(statusSwitchViolation(noSwitch)).toBeNull()
  })

  it('接线反查：两处"立即推送"页面都必须走同一份组合子并绑按钮 loading', () => {
    for (const rel of ['src/views/system/report/SubReportSection.vue', 'src/views/system/report/sub/index.vue']) {
      const src = readFileSync(resolve(VUE_ROOT, rel), 'utf8')
      expect(src, `${rel} 必须 import useRowActionGuard`).toContain("from '@/composables/useRowActionGuard'")
      expect(src, `${rel} 必须调用 guarded(`).toContain('await guarded(')
      expect(src, `${rel} 的推送按钮必须绑 runningIds`).toContain(':loading="runningIds.includes(scope.row.subId)"')
      expect(src, `${rel} 的推送按钮必须禁用重复点击`).toContain(':disabled="runningIds.includes(scope.row.subId)"')
    }
  })
})
