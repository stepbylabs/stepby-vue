/**
 * 静态守卫：禁止"无人认领的 Promise 链"（b72）。
 *
 * 缺陷形态：语句以一个 promise 链开头（既不是 `return`，也不是赋值给变量），链上又
 * 没有 `.catch()`/`.finally()` —— 这就是 fire-and-forget。失败时抛 `unhandledrejection`，
 * 后果有两层：① 用户点了没反应（没有任何可见反馈）；② b69 的前端错误终局捕获会把
 * 这些拒绝计入"未分类 console error"，把真实故障信号埋进噪声里。
 *
 * 反例（b72 实测并修复的 3 处）：`layout/components/ErrorMonitor`（router chunk 动态
 * import 失败）、`views/monitor/operlog`（归档 blob 下载失败）、
 * `views/report/view`（设计态切回运行态刷新看板失败）。
 *
 * 明确**不算**缺陷的两类，本守卫据实豁免并写明依据：
 * - `return xxx.then(...)` / `const p = xxx.then(...)`：拒绝被交给调用方；
 * - `useCrudTable` 的 `listApi: (params) => listX(params).then(...)`：链由
 *   `composables/useCrudTable.ts` 的 `getList()` 统一 `.catch()`（含"清空列表避免显示
 *   陈旧数据"）——该 catch 是被调用方持有的，故包装侧无需重复处理。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 已定性的 `listApi` 形态豁免点（文件 + 该文件内允许出现的"链开头"次数） */
const CRUDDTO_LIST_API_ALLOW = new Map<string, number>([
  ['src/views/system/dept/index.vue', 1],
  ['src/views/system/menu/index.vue', 1],
  ['src/views/system/file/index.vue', 1],
  ['src/views/system/notice-center/index.vue', 1]
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

/** 找出"以 promise 链开头的语句"且其后 15 行内没有 catch/finally 的位置 */
function findOrphanChains(text: string): number[] {
  const lines = text.split('\n')
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const s = raw.trim()
    if (!s || s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) continue
    if (!s.includes('.then(')) continue
    // 交给调用方处理（return / 赋值 / await 结果被使用）不算孤儿链
    if (/^(return|const|let|var|await)\b/.test(s)) continue
    // 对象属性箭头体：`listApi: (params) => listX(params).then(...)` 由 useCrudTable 收口
    if (/^[A-Za-z_$][\w$]*\s*:\s*(\(|async)/.test(raw.trimStart())) continue
    // 语句需以"调用表达式"起头（标识符或 `void import(...)`），否则可能是链的中间行
    if (!/^(void\s+)?[A-Za-z_$@]/.test(s)) continue
    const window = lines.slice(i, i + 15).join('\n')
    if (window.includes('.catch(') || window.includes('.finally(')) continue
    hits.push(i + 1)
  }
  return hits
}

describe('未捕获 Promise 链静态守卫（b72）', () => {
  it('src 下不存在无人认领的 .then() 链', () => {
    const root = join(process.cwd(), 'src')
    const files = walk(root)
    expect(files.length, '扫描面必须非空（否则本守卫形同虚设）').toBeGreaterThan(100)

    const violations: string[] = []
    for (const abs of files) {
      const rel = relative(process.cwd(), abs).replace(/\\/g, '/')
      const hits = findOrphanChains(readFileSync(abs, 'utf-8'))
      if (hits.length === 0) continue
      const allowed = CRUDDTO_LIST_API_ALLOW.get(rel)
      if (allowed !== undefined && hits.length === allowed) continue
      for (const line of hits) violations.push(`${rel}:${line}`)
    }
    // 逐个豁免点也必须"数量吻合"：多一条说明新增了孤儿链，少一条说明形态变了需重新定性
    for (const [rel, count] of CRUDDTO_LIST_API_ALLOW) {
      const actual = findOrphanChains(readFileSync(join(process.cwd(), rel), 'utf-8')).length
      expect(actual, `${rel} 的 listApi 链形态发生变化，请重新定性后再更新豁免表`).toBe(count)
    }
    expect(violations, '发现新增的孤儿 Promise 链：' + violations.join(', ')).toEqual([])
  })

  it('守卫自身可证伪：孤儿链样例必须被识别', () => {
    expect(findOrphanChains('loadThings().then((r) => {\n  use(r)\n})\n')).toEqual([1])
    // 有 catch 的不算
    expect(findOrphanChains('loadThings().then((r) => r).catch(() => {})\n')).toEqual([])
    // return 给调用方的不算
    expect(findOrphanChains('  return loadThings().then((r) => r)\n')).toEqual([])
    // useCrudTable listApi 形态不算（由 getList 统一 catch）
    expect(findOrphanChains('  listApi: (params) => listDept(params).then((res) => res),\n')).toEqual([])
  })
})
