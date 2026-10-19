/**
 * 静态守卫（批七十四 F6）：有"筛选收展控制点"的列表页必须接线 `useMobileFilter`。
 *
 * 缺陷形态：页面把 `showSearch` 绑到容器的 `v-if`/`v-show` 上（桌面端 RightToolbar 的开关），
 * 但**没有** `useMobileFilter(showSearch)`——composable 的语义是"进移动端自动收起、
 * 跨断点恢复对应端默认"。漏接线的结果是移动端一进来就顶着四五条评价过滤条件，
 * 列表被推到第二屏（MOBILE-UX-GUIDELINES §六 P1 项）。这类缺陷**没有任何运行时报错**：
 * 桌面端行为完全正确，移动端只是"难看"，所以只能靠静态判据钉。
 *
 * 判据为什么取"有控制点 + 有内联表单"而不是"所有列表页都要接"：
 * - 控制点（`v-if`/`v-show="showSearch"`）是 composable 唯一能作用的对象——没有它接了也是空转；
 * - 弹窗/子面板（`selectUser.vue`、`importTable.vue`、`ReadUsers.vue`）虽有内联表单，
 *   但没有右上方工具栏开关，属另一类 UI，不在本判据的适用面内；
 * - 因此该判据**既不需要豁免表也不会有误报**（实测 36 页合规 / 0 违规 / 0 空转接线）。
 *
 * 双向对照组（缺一即虚锁）：合成违规必须转红、"有控制点但已接线"必须零误报，
 * 且扫描面本身要有量级对账（扫到 0 个候选页 = 遍历坏了，不是"大家都合规"）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 模板里的"筛选收展控制点"：RightToolbar 的 showSearch 开关作用到的那个 ref */
const COLLAPSE_POINT = /(v-if|v-show)="showSearch"/
/** 内联筛选表单（P1 列表页样板形态） */
const INLINE_FORM = /<el-form[^>]*:inline="true"/
/** 接线形态：必须以 showSearch 作为入参（接别的 ref = 空转） */
const WIRED = /useMobileFilter\(\s*showSearch\b/

/** 返回"有控制点 + 有内联表单，但没接线"的页面 */
function findUnboundPages(files: Array<{ path: string; text: string }>): string[] {
  return files
    .filter(({ text }) => COLLAPSE_POINT.test(text) && INLINE_FORM.test(text) && !WIRED.test(text))
    .map(({ path }) => path)
}

/** 返回"接了线却没有控制点"的空转接线（composable 无从作用） */
function findOrphanWiring(files: Array<{ path: string; text: string }>): string[] {
  return files.filter(({ text }) => WIRED.test(text) && !COLLAPSE_POINT.test(text)).map(({ path }) => path)
}

describe('移动端筛选接线守卫', () => {
  const files = walk('src/views').map((path) => ({ path, text: readFileSync(path, 'utf-8') }))

  it('扫描面本身必须成立（否则"零违规"是虚零）', () => {
    expect(files.length).toBeGreaterThan(100)
    const candidates = files.filter(
      ({ text }) => COLLAPSE_POINT.test(text) && INLINE_FORM.test(text)
    )
    // 非零探针：候选页数量必须与已接线数量同量级，遍历坏了这里先红
    expect(candidates.length).toBeGreaterThanOrEqual(30)
    expect(candidates.length).toBeGreaterThanOrEqual(files.length / 5)
  })

  it('有筛选控制点的列表页一律接了 useMobileFilter', () => {
    const bad = findUnboundPages(files)
    expect(bad, `移动端筛选未收纳的列表页:\n${bad.join('\n')}`).toEqual([])
  })

  it('不存在"接了线但没有控制点"的空转接线', () => {
    const orphan = findOrphanWiring(files)
    expect(orphan, `useMobileFilter 接了但页面没有 v-if/v-show="showSearch" 控制点:\n${orphan.join('\n')}`).toEqual([])
  })

  it('合成违规必须被抓到（含两种控制点形态与"接错 ref"形态）', () => {
    const synth = [
      {
        path: 'a.vue',
        text: '<el-form :model="q" :inline="true"></el-form>\n<div v-show="showSearch"></div>\nconst showSearch = ref(true)'
      },
      {
        path: 'b.vue',
        text: '<el-form :inline="true"></el-form>\n<el-card v-if="showSearch"></el-card>\nconst showSearch = ref(true)'
      },
      // 接了别的 ref = composable 作用不到开关，等同没接
      {
        path: 'c.vue',
        text: '<el-form :inline="true"></el-form>\n<div v-show="showSearch"></div>\nuseMobileFilter(otherRef)'
      }
    ]
    expect(findUnboundPages(synth).length).toBe(3)

    // 合规形态不得报（"为规范把合法页也挡掉"同样是缺陷）
    const good = [
      {
        path: 'd.vue',
        text: '<el-form :inline="true"></el-form>\n<div v-show="showSearch"></div>\nuseMobileFilter(showSearch)'
      },
      // 弹窗/子面板：有内联表单但没有控制点 ⇒ 不在适用面内
      { path: 'e.vue', text: '<el-form :inline="true"></el-form>' },
      // 有控制点但没有内联表单（纯卡片页）⇒ 不在适用面内
      { path: 'f.vue', text: '<div v-show="showSearch"></div>' }
    ]
    expect(findUnboundPages(good)).toEqual([])
    expect(findOrphanWiring(good)).toEqual([])
  })
})
