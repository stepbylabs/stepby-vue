import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildUrlQuery } from './queryUrl'

describe('buildUrlQuery：查询条件 → URL query 的唯一口径', () => {
  it('非原始值不同步（真机缺陷形状：addDateRange 注入的 params 曾被写成 [object Object]）', () => {
    const q = buildUrlQuery({ pageNum: 1, userName: 'alice', params: { beginTime: '2024-01-01' } })
    expect(q).toEqual({ pageNum: '1', userName: 'alice' })
    expect(q.params).toBeUndefined()
  })

  it('空值不写：undefined / null / 空串', () => {
    const q = buildUrlQuery({ a: undefined, b: null, c: '', d: 0, e: false })
    expect(q).toEqual({ d: '0', e: 'false' })
  })

  it('既有非查询键保留（页签等页面状态），查询键以当前值为准', () => {
    const q = buildUrlQuery({ pageNum: 2 }, { tab: 'basic', pageNum: '1' })
    expect(q).toEqual({ tab: 'basic', pageNum: '2' })
  })

  it('既有空值键不留进 URL', () => {
    const q = buildUrlQuery({ pageNum: 1 }, { tab: '', carry: null })
    expect(q).toEqual({ pageNum: '1' })
  })

  it('字符串化：数字与布尔按字面量写', () => {
    const q = buildUrlQuery({ pageNum: 3, pageSize: 20, onlyMine: true })
    expect(q).toEqual({ pageNum: '3', pageSize: '20', onlyMine: 'true' })
  })
})

/**
 * 接线反查（AGENTS ⑮：写了没接线 = 没写）：两条「查询条件写 URL」的路径都必须经
 * `buildUrlQuery`，否则"只修一处"会让另一处继续把 `[object Object]` 写进地址栏
 * ——这正是 b131 取证时用户页与 useCrudTable 两个严格度并存的形状。
 */
function syncUrlQueryUsesSharedBuilder(source: string): boolean {
  const signature = 'function syncUrlQuery('
  const idx = source.indexOf(signature)
  if (idx < 0) return false
  const open = source.indexOf('{', idx)
  if (open < 0) return false
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return false
  const body = source
    .slice(open, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
  return body.includes('buildUrlQuery(')
}

describe('两条写 URL 路径都必须经 buildUrlQuery（接线反查 + 可证伪）', () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

  it('useCrudTable.syncUrlQuery 走公共实现', () => {
    expect(syncUrlQueryUsesSharedBuilder(read('src/composables/useCrudTable.ts'))).toBe(true)
  })

  it('用户页手写的 syncUrlQuery 走公共实现（b131 缺陷发生地）', () => {
    expect(syncUrlQueryUsesSharedBuilder(read('src/views/system/user/index.vue'))).toBe(true)
  })

  it('反证：修复前的形状（只 String(v) 遍历、不调公共实现）必须判否', () => {
    const before = `function syncUrlQuery() {
  if (!router) return
  const src = queryParams.value
  const q = {}
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || v === null || v === '') continue
    q[k] = String(v)
  }
  router.replace({ query: q }).catch(() => {})
}`
    expect(syncUrlQueryUsesSharedBuilder(before)).toBe(false)
  })

  it('反证：只在注释里提到 buildUrlQuery 不算接线', () => {
    const commented = `function syncUrlQuery() {
  // 之后应该改走 buildUrlQuery(...)
  router.replace({ query: {} }).catch(() => {})
}`
    expect(syncUrlQueryUsesSharedBuilder(commented)).toBe(false)
  })
})
