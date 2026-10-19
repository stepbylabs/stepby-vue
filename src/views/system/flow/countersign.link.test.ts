// src/views/system/flow/countersign.link.test.ts
// 加减签链路 + 审批流水动作 i18n 完整性静态守卫（批七十六）。
//
// 两条判据的实证动机：
// 1) 后端 POST /system/flow/task/{taskId}/countersign-del 自 G-02 M2 起就存在，
//    流程设计器的动作白名单也把 countersign_del 开放给节点（FULL_ACTIONS），
//    但审批页只有「加签」按钮——管理员能授权、审批人却无入口，链路断在产品侧。
//    本守卫钉住"api 函数 + 按钮 + 派发"三处同时存在，任一处回退即红。
// 2) 时间线用 t('flow.action.' + log.action) **动态拼键**渲染，i18n-keys.test.ts
//    的静态守卫只匹配字面量键，动态拼接覆盖不到；countersign_add / countersign_del /
//    delegate 三个动作曾长期没有词条，渲染成裸键文本 flow.action.countersign_add
//    （看得见但没有 HTTP/console 信号）。本守卫改为从后端 Rust 源码提取引擎实际
//    写入的动作值，逐个要求 zh/en 词条存在——动作域漂移只能被代码事实抓住。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIEW = path.join(HERE, 'index.vue')
const API_FLOW = path.resolve(HERE, '../../../api/flow.ts')
const RUST_FLOW_SERVICE = path.resolve(
  HERE,
  '../../../../../stepby-axum/src/service/sys_flow_service.rs'
)

function readRequired(fp: string, label: string): string {
  if (!fs.existsSync(fp)) {
    throw new Error(`${label} 读不到输入：${fp}（校验没有跑，不得当成通过）`)
  }
  return fs.readFileSync(fp, 'utf8')
}

/**
 * 提取引擎写入 sys_flow_log.action 的字面量。两种成文形态：
 * - `action: Set("x".to_string())`（ActiveModel 直写，如 submit / countersign_add）
 * - `self.write_log(...)` 的**第一个字符串字面量**实参（前四个实参恒为表达式，
 *   故首个字面量即 action；定义处 `async fn write_log(` 无前置点号，不会被命中）
 */
function extractFlowActions(rust: string): Set<string> {
  const out = new Set<string>()
  for (const m of rust.matchAll(/action:\s*Set\(\s*"([a-z_]+)"/g)) out.add(m[1])
  for (const m of rust.matchAll(/\.write_log\(/g)) {
    const lit = rust.slice(m.index, m.index + 600).match(/"([a-z][a-z_]{2,})"/)
    if (lit) out.add(lit[1])
  }
  return out
}

const viewSrc = readRequired(VIEW, '审批页')
const apiSrc = readRequired(API_FLOW, 'api/flow')
const rustSrc = readRequired(RUST_FLOW_SERVICE, '后端审批服务')
const actions = extractFlowActions(rustSrc)

/** 按点分路径取语言包叶子值（键不存在时返回 undefined，不做静默回退） */
function localeValue(locale: unknown, dotted: string): unknown {
  let cur: unknown = locale
  for (const seg of dotted.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

function zhAction(key: string): unknown {
  return localeValue(zhCN, `flow.action.${key}`)
}
function enAction(key: string): unknown {
  return localeValue(enUS, `flow.action.${key}`)
}

/**
 * 反向比较器：`set` 里哪些成员不属于参照集 `ref`（排序稳定，便于报错与断言）。
 * 与后端 `flow_action_dict.rs::reserved_in_dict` 同判据——两侧都用"恰好相等"，
 * 单向存在性判定抓不到的"多一个预留值"才会被抓到（批七十六 R-4）。
 */
function extraOf(set: Set<string>, ref: Set<string>): string[] {
  return [...set].filter((v) => !ref.has(v)).sort()
}

describe('加减签前后端链路齐备', () => {
  it('api 层同时提供加签/减签请求函数（路径与后端路由逐字对齐）', () => {
    expect(apiSrc).toContain('export function countersignAddFlowTask')
    expect(apiSrc).toContain('export function countersignDelFlowTask')
    expect(apiSrc).toContain('/system/flow/task/${taskId}/countersign-add')
    expect(apiSrc).toContain('/system/flow/task/${taskId}/countersign-del')
    // 对照组：不存在的路径不得被断言命中（防 needle 空串恒真）
    expect(apiSrc).not.toContain('/system/flow/task/${taskId}/countersign-none')
  })

  it('审批页把两个函数都接进依赖并各自派发', () => {
    expect(viewSrc).toContain('countersignAddFlowTask,')
    expect(viewSrc).toContain('countersignDelFlowTask,')
    expect(viewSrc).toContain('await countersignAddFlowTask(actTaskId.value')
    expect(viewSrc).toContain('await countersignDelFlowTask(actTaskId.value')
  })

  it('减签按钮存在且仅在会签族节点出现（单审减签必触发后端 last_assignee 防线）', () => {
    expect(viewSrc).toContain("openAct(row, 'countersign')")
    expect(viewSrc).toContain("openAct(row, 'countersignDel')")
    expect(viewSrc).toContain("v-if=\"row.taskType !== 'single'\"")
    expect(viewSrc).toContain("t('flow.actCountersignDel')")
  })

  it('needsTargetUser 覆盖三类选人动作，漏一类会走错表单分支', () => {
    const block = viewSrc.slice(
      viewSrc.indexOf('const needsTargetUser'),
      viewSrc.indexOf('const userSearching')
    )
    expect(block).toContain("'transfer'")
    expect(block).toContain("'countersign'")
    expect(block).toContain("'countersignDel'")
    expect(viewSrc).toContain('v-if="!needsTargetUser"')
  })

  it('变异证伪：抹掉减签派发后，链路断言必须转红（守卫非恒真）', () => {
    const mutated = viewSrc.replace('await countersignDelFlowTask(actTaskId.value', 'void 0')
    expect(mutated).not.toContain('await countersignDelFlowTask(actTaskId.value')
    const mutatedApi = apiSrc.replace(/export function countersignDelFlowTask/g, 'export function x')
    expect(mutatedApi).not.toContain('export function countersignDelFlowTask')
  })
})

describe('审批流水动作域 i18n 覆盖（动态拼键，静态守卫抓不到）', () => {
  it('提取器确实读到后端动作字面量（读不到输入必须硬失败）', () => {
    expect(actions.size).toBeGreaterThanOrEqual(8)
    for (const must of [
      'submit',
      'approve',
      'reject',
      'withdraw',
      'transfer',
      'delegate',
      'countersign_add',
      'countersign_del'
    ]) {
      expect(actions.has(must), `后端动作 ${must} 未被提取器看见`).toBe(true)
    }
  })

  it('每个引擎动作在 zh-CN / en-US 均有非空且不等于键名的词条', () => {
    const missing: string[] = []
    for (const act of [...actions].sort()) {
      const zh = zhAction(act)
      const en = enAction(act)
      if (typeof zh !== 'string' || zh.length === 0 || zh === act) missing.push(`zh:${act}`)
      if (typeof en !== 'string' || en.length === 0 || en === act) missing.push(`en:${act}`)
      if (typeof zh === 'string' && typeof en === 'string' && zh === en) missing.push(`同文:${act}`)
    }
    expect(missing, `缺失/未翻译词条：${missing.join(', ')}`).toEqual([])
  })

  it('对照组：动作域之外的键不得命中（防查找退化为恒真）', () => {
    expect(zhAction('definitely_not_a_flow_action')).toBeUndefined()
    expect(enAction('definitely_not_a_flow_action')).toBeUndefined()
  })

  it('前端 SysFlowLog.action 联合类型与后端动作域**恰好相等**（双向，缺/多都判红）', () => {
    const union = apiSrc.slice(apiSrc.indexOf('action:'), apiSrc.indexOf('fromStatus'))
    const members = new Set([...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
    const absent = [...actions].filter((a) => !members.has(a)).sort()
    expect(absent, `类型缺少动作：${absent.join(', ')}`).toEqual([])
    // R-4 反向：联合类型里挂一个引擎永不写入的成员，等于给前端留下永远走不到的分支
    // （auto_approve 曾以此形态存在，配套 i18n 词条与 timelineType 分支一起空转）
    expect(extraOf(members, actions), '类型含引擎不写入的动作').toEqual([])
    expect(members.size, '联合成员数须与引擎动作全集一致').toBe(actions.size)
  })

  it('i18n 动作域与后端动作域恰好相等（双向：漏译与死词条都判红）', () => {
    for (const [tag, locale] of [
      ['zh-CN', zhCN],
      ['en-US', enUS]
    ] as const) {
      const keys = new Set(Object.keys((localeValue(locale, 'flow.action') ?? {}) as Record<string, unknown>))
      expect([...keys].sort(), `${tag} flow.action 键集应等于引擎动作域`).toEqual([...actions].sort())
      expect(extraOf(keys, actions), `${tag} flow.action 存在引擎不写入的死词条`).toEqual([])
    }
  })

  it('变异证伪：反向比较器能抓到"塞回一个预留值"，对照组不误报', () => {
    const engine = new Set(['submit', 'approve'])
    expect(extraOf(new Set(['submit', 'approve', 'auto_approve']), engine)).toEqual(['auto_approve'])
    expect(extraOf(new Set(['submit']), engine)).toEqual([])
    // 控制组必须真受约束：参照集之外的值一律被抓，而非静默放行
    expect(extraOf(new Set(['totally_unknown']), engine)).toEqual(['totally_unknown'])
  })

  it('待办行 taskType 四模式与单据 flowMode 四模式在类型与标签两处同源', () => {
    expect(apiSrc).toContain("taskType: 'single' | 'countersign' | 'or_sign' | 'weighted'")
    expect(apiSrc).toContain("flowMode: 'single' | 'countersign' | 'or_sign' | 'weighted'")
    // 后端 task_type() 的四模式映射（单一事实源）
    expect(rustSrc).toContain('Quorum::All => "countersign"')
    expect(rustSrc).toContain('Quorum::Weighted { .. } => "weighted"')
    expect(viewSrc).toContain('const flowTypeLabel')
    for (const k of ['flow.typeSingle', 'flow.typeCountersign', 'flow.typeOrSign', 'flow.typeWeighted']) {
      expect(viewSrc, `标签映射缺键 ${k}`).toContain(`t('${k}')`)
      expect(localeValue(zhCN, k), `语言包缺键 ${k}`).toBeTypeOf('string')
      expect(localeValue(enUS, k), `语言包缺键 ${k}`).toBeTypeOf('string')
    }
  })
})
