/**
 * 静态守卫：页面身份 = **path**，查询串只是状态（b131）。
 *
 * ## 立案（真机取证）
 *
 * `useCrudTable.getList()` 每次取数都会把筛选条件写回 URL（UX-6 深链特性），而
 * `AppMain` 的组件 key 与 TagsView 的标签身份此前都用 `route.fullPath`（含 query）：
 *
 * - 列表页首次进入 URL 里还没有查询串 ⇒ `router.replace` 写一次 ⇒ fullPath 变化 ⇒
 *   整页组件销毁重建 ⇒ **列表请求发两次**（真机 669ms / 1016ms 两条同参请求）；
 * - 每搜索一次就多一个**同名页签**（实测初始 2 个，每搜一次 +1）；
 * - keep-alive 按"每个筛选组合一个实例"膨胀（`max=20` 被搜索组合顶满）。
 *
 * 修法是把身份收敛到 path（路由参数本来就在 path 里，`/system/dict/data/:dictId` 不受影响），
 * 本守卫钉住三处接线：`AppMain` 的组件 key、`tagsView` 的 `viewKey`、`TagsView` 的 `isActive`。
 *
 * ## 判据
 *
 * 三处各自读**函数体/模板片段**（不是整份文件——`fullPath` 在标签跳转、
 * 刷新等语义里仍然合法），出现旧写法即红；配合成双向（坏形状必抓、合规形状不误报）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface Sources {
  appMain: string
  tagsViewStore: string
  tagsView: string
}

/** 取 `function <name>(...) {` 之后的函数体（按花括号配对），**注释被掩码**（判定只读代码） */
function fnBody(text: string, name: string): string {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{`)
  const m = re.exec(text)
  if (!m) return ''
  let depth = 1
  let i = m.index + m[0].length
  const start = i
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--
    i++
  }
  return muteNonCode(text.slice(start, i - 1), { keepStrings: true })
}

/** 返回违规描述；空集 = 通过。抽成纯函数以喂合成双向。 */
export function identityViolations(src: Sources): string[] {
  const out: string[] = []

  // ① AppMain 的组件 key
  if (!src.appMain.includes(':key="route.path"')) {
    out.push('AppMain.vue: 组件 key 必须按 route.path（身份不含查询串）')
  }
  if (src.appMain.includes(':key="route.fullPath"')) {
    out.push('AppMain.vue: 组件 key 仍是 route.fullPath（查询串变化会整页重建）')
  }

  // ② store 的 viewKey
  const keyBody = fnBody(src.tagsViewStore, 'viewKey')
  if (!keyBody) {
    out.push('tagsView.ts: 找不到 viewKey 函数体（判据输入形状变了）')
  } else {
    if (!keyBody.includes('view.path')) {
      out.push('tagsView.ts: viewKey 必须返回 view.path')
    }
    if (/\bquery\b/.test(keyBody) || keyBody.includes('fullPath')) {
      out.push('tagsView.ts: viewKey 仍在用 query/fullPath 当身份（同页不同筛选会新增标签）')
    }
  }

  // ③ TagsView 的激活判定
  const activeBody = fnBody(src.tagsView, 'isActive')
  if (!activeBody) {
    out.push('TagsView/index.vue: 找不到 isActive 函数体（判据输入形状变了）')
  } else {
    if (activeBody.includes('fullPath')) {
      out.push('TagsView/index.vue: isActive 仍在比较 fullPath（筛选写回 URL 后当前标签会失去高亮）')
    }
    if (!activeBody.includes('route.path')) {
      out.push('TagsView/index.vue: isActive 必须比较 route.path')
    }
  }

  return out
}

function read(rel: string): string {
  return readFileSync(resolve(SRC_DIR, rel), 'utf8')
}

function productionSources(): Sources {
  return {
    appMain: read('layout/components/AppMain.vue'),
    tagsViewStore: read('store/modules/tagsView.ts'),
    tagsView: read('layout/components/TagsView/index.vue')
  }
}

describe('页面身份守卫：path 是身份、query 是状态', () => {
  it('真实树三处接线都按 path（且模板里没有 fullPath key）', () => {
    const violations = identityViolations(productionSources())
    expect(violations, `违规: ${violations.join(' | ')}`).toEqual([])
  })

  it('合成坏形状必须被抓到（三个方向）', () => {
    const bad: Sources = {
      appMain: '<component :is="Component" :key="route.fullPath" />',
      tagsViewStore: 'function viewKey(view) { return view.fullPath || view.path }',
      tagsView: 'function isActive(r) { return r.fullPath === route.fullPath }'
    }
    const v = identityViolations(bad)
    expect(v.some((s) => s.includes('AppMain'))).toBe(true)
    expect(v.some((s) => s.includes('viewKey'))).toBe(true)
    expect(v.some((s) => s.includes('isActive'))).toBe(true)
  })

  it('viewKey 里出现 query 也必须被抓（身份包含筛选的直接形状）', () => {
    const bad: Sources = {
      appMain: ':key="route.path"',
      tagsViewStore: 'function viewKey(view) { return view.path + JSON.stringify(view.query) }',
      tagsView: 'function isActive(r) { return r.path === route.path }'
    }
    const v = identityViolations(bad)
    expect(v.some((s) => s.includes('viewKey'))).toBe(true)
  })

  it('合规形状不得误报（fullPath 出现在别的语义里是允许的）', () => {
    const ok: Sources = {
      appMain: '<component :is="Component" :key="route.path" />',
      tagsViewStore: 'function viewKey(view) { if (!view) return ""; return view.path || "" }',
      tagsView: 'function isActive(r) { const v = r; return !!v.path && v.path === route.path }'
    }
    expect(identityViolations(ok)).toEqual([])
  })
})
