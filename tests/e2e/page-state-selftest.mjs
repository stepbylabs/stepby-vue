/**
 * 页面确定态判据自检（批七十四 T1，常驻工具，非用例门禁）
 *
 * 为什么必须有：`judgePageLoaded` 是 main.mjs 与 deep-e2e.mjs **共用**的确定态判据
 * （合计上千条断言的成败都由它决定）。它坏掉的方式不是抛错，而是**悄悄放宽**——
 * 例如把"作用域"写回 `document.body`，白屏就重新变成 ✅，而 1053 条断言一条都不会红。
 * 所以自检不依赖浏览器：直接喂合成探针数据，验"空壳必须判红、合法形态必须判绿"。
 *
 * 运行：node tests/e2e/page-state-selftest.mjs   （EXIT=0 且打印 SYNTH_OK 为通过）
 */
import { judgePageLoaded, PAGE_STATE_PROBE, MIN_SCOPE_TEXT } from './page-state.mjs'

const mk = (over = {}) => ({
  hasLayout: true,
  contentNodes: 3,
  scopeText: 200,
  emptyState: false,
  crashed: false,
  notFound: false,
  msgToast: 0,
  ...over
})

const cases = [
  // ---- 必须判绿（"为规范把合法页挡掉"同样是缺陷）----
  { name: '正常列表页', v: mk(), want: true },
  { name: '空态页（无数据，业务上合法）', v: mk({ contentNodes: 1, emptyState: true, scopeText: 30 }), want: true },
  { name: 'iframe 型页面（swagger，innerText 可为 0）', v: mk({ contentNodes: 1, scopeText: 0 }), want: true },
  { name: '纯文本页（文本刚过下限）', v: mk({ contentNodes: 0, scopeText: MIN_SCOPE_TEXT }), want: true },
  { name: '无布局页（登录页）', v: mk({ hasLayout: false }), want: true },
  // ---- 必须判红（改造前这四种全都记 ✅）----
  { name: '空壳：内容区无元素也无文本', v: mk({ contentNodes: 0, scopeText: 0 }), want: false },
  {
    name: '外壳噪声：仅导航文字（改造前 body.innerText>0 恒真）',
    v: mk({ contentNodes: 0, scopeText: MIN_SCOPE_TEXT - 1 }),
    want: false
  },
  { name: '崩页（ErrorBoundary）', v: mk({ crashed: true }), want: false },
  { name: '落 404 容器', v: mk({ notFound: true }), want: false },
  { name: '残留错误 Toast', v: mk({ msgToast: 2 }), want: false },
  // 多因并存时不得只报第一条（台账要求逐项给出实测量）
  { name: '崩页 + Toast 同时成立', v: mk({ crashed: true, msgToast: 1 }), want: false }
]

const failures = []
for (const c of cases) {
  const got = judgePageLoaded(c.v).ok
  if (got !== c.want) failures.push(`${c.name}: 期望 ok=${c.want}，实际 ok=${got}`)
}

// 反向探针：崩溃/404/Toast 三条必须各自出现在 reasons 里（否则"红了也说不清为什么"）
const reasonsOf = (v) => judgePageLoaded(v).reasons.join(' / ')
const pinChecks = [
  ['崩页', reasonsOf(mk({ crashed: true })), 'ErrorBoundary'],
  ['404', reasonsOf(mk({ notFound: true })), '404'],
  ['Toast', reasonsOf(mk({ msgToast: 3 })), 'Toast'],
  ['空壳', reasonsOf(mk({ contentNodes: 0, scopeText: 0 })), 'contentNodes=0']
]
for (const [label, text, needle] of pinChecks) {
  if (!text.includes(needle)) failures.push(`${label} 的失败原因未点名实测依据（应含 ${needle}）：${text}`)
}

// 判据与探针必须同源：探针返回的字段名若与判据不一致，改名会让判据静默失效
const probeFields = Object.keys(PAGE_STATE_PROBE.toString())
void probeFields
for (const f of ['hasLayout', 'contentNodes', 'scopeText', 'emptyState', 'crashed', 'notFound', 'msgToast']) {
  if (!String(PAGE_STATE_PROBE).includes(f)) {
    failures.push(`探针不再产出字段 ${f}，但判据仍在读它 ⇒ 两者已漂移`)
  }
}

if (failures.length > 0) {
  console.error('SYTH_FAIL:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log(`SYNTH_OK: 判据合成用例 ${cases.length} 条双向通过（${cases.filter((c) => c.want).length} 绿 / ${cases.filter((c) => !c.want).length} 红）`)
