/**
 * 静态守卫：`@/router` 不得被**动态导入**（b123）。
 *
 * ## 立案
 *
 * `src/layout/components/ErrorMonitor/index.vue` 原写法是
 * `import('@/router').then(({ default: router }) => router.push(…))`，注释声称
 * "router chunk 动态加载失败时要兜底"。但 router 由 `main.ts` / `permission.ts` /
 * `plugins/tab.ts` 等**静态导入**——它始终在初始依赖图里，动态导入不可能把它拆成
 * 独立 chunk，那句 catch 结构上走不到。构建器实测报：
 *
 *   [INEFFECTIVE_DYNAMIC_IMPORT] src/router/index.ts is dynamically imported by
 *   ErrorMonitor but also statically imported by … dynamic import will not move
 *   module into another chunk.
 *
 * 这类写法的危害不是"多一个 chunk"，而是**兜底逻辑长在一个永远不会触发的分支上**：
 * 真正会失败的 `router.push`（守卫中止 / 目标组件解析失败）反而没人接。b123 已把
 * 该站点改成静态导入 + `push().catch()`，本守卫保证"不会有人再写回来"。
 *
 * ## 判据
 *
 * 生产码（`.ts` + `.vue` 的 `<script>` 区间，排除 `*.test.ts`）里出现
 * `import('@/router')` / `import("@/router")`（含 `import ( … )` 空白形态）⇒ 违规。
 * 注释与字符串里的示例不算——共用 `muteNonCode` 的掩码口径，并有专门的反例用例钉住。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, collectByExt, EXCLUDED_DIRS, lineNumberAt, muteNonCode } from './e2eSuiteScanKit'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 动态导入 router 的几种写法（`import(` 与参数之间允许空白） */
const DYNAMIC_ROUTER_RE = /\bimport\s*\(\s*['"]@\/router['"]\s*\)/g

interface Source {
  file: string
  text: string
}

function productionSources(): Source[] {
  const files = [
    ...collectByExt(SRC_DIR, '', '.ts', EXCLUDED_DIRS),
    ...collectByExt(SRC_DIR, '', '.vue', EXCLUDED_DIRS)
  ]
  return files
    .filter((f) => !f.endsWith('.test.ts'))
    .map((rel) => {
      const raw = readFileSync(resolve(SRC_DIR, rel), 'utf8')
      return { file: rel, text: rel.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw }
    })
}

/**
 * 纯函数：返回违规位置（`file:line`）。
 *
 * 刀口怎么落：**路径本身是字符串**，所以不能先把字符串抹掉再匹配（那样连真实调用一起
 * 抹没了）；但直接匹配原文又会把注释/字符串里的示例算成违规。做法是双重读取：
 * 在**原文**上找 `import('@/router')` 的完整形态，再用 `muteNonCode` 的等长掩码确认
 * 这个匹配的 **`import` 关键字位于代码区**——字符串/注释里的示例在掩码中是空格，不命中。
 */
export function findDynamicRouterImports(sources: Source[]): string[] {
  const hits: string[] = []
  for (const { file, text } of sources) {
    const code = muteNonCode(text)
    for (const m of text.matchAll(DYNAMIC_ROUTER_RE)) {
      const at = m.index ?? 0
      if (code.slice(at, at + 'import'.length) !== 'import') continue
      hits.push(`${file}:${lineNumberAt(code, at)}`)
    }
  }
  return hits
}

describe('守卫：@/router 只能静态导入（动态导入是无效写法）', () => {
  it('真实树：生产码动态导入 @/router 必须 0 处（采集面自证）', () => {
    const sources = productionSources()
    expect(sources.length, '采集面过小：扫不到生产文件，判据不作数').toBeGreaterThan(300)
    expect(
      sources.some((s) => s.file.endsWith('.vue')),
      '采集面必须包含 .vue'
    ).toBe(true)
    expect(findDynamicRouterImports(sources)).toEqual([])
  })

  it('合成违规必抓：带空白/双引号两种写法都点名到行', () => {
    const hits = findDynamicRouterImports([
      { file: 'a.ts', text: "const m = await import('@/router')\n" },
      { file: 'b.vue', text: 'export function f() {\n  return import ( "@/router" )\n}\n' }
    ])
    expect(hits).toEqual(['a.ts:1', 'b.vue:2'])
  })

  it('反例：注释、字符串与**静态**导入不得误报', () => {
    const text = [
      "// import('@/router') —— 文档里的反例",
      'const s = "import(\'@/router\')"',
      "import router from '@/router'",
      'import { constantRoutes } from "@/router"'
    ].join('\n')
    expect(findDynamicRouterImports([{ file: 'c.ts', text }])).toEqual([])
  })

  it('活性：同样的违规追加到真实文件内容末尾必须 +1（差异法）', () => {
    const sources = productionSources()
    const sample = sources.find((s) => s.file.endsWith('.ts'))
    if (!sample) throw new Error('找不到可用的真实 .ts 文件')
    const before = findDynamicRouterImports([sample]).length
    const after = findDynamicRouterImports([
      { file: sample.file, text: `${sample.text}\nvoid import('@/router')\n` }
    ]).length
    expect(after).toBe(before + 1)
  })
})
