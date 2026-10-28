/**
 * 静态守卫：键盘层的两条纪律必须真的接线（b114）。
 *
 * 立的案：真机实测（`tests/e2e` 探针）发现全局快捷键抢走输入（`?` 弹模态框且字符丢失、
 * `Alt+T`/`Ctrl+Shift+D` 改主题）、输入法上屏回车触发查询。修法收成两个单一实现：
 * `utils/keyboard.ts` 的 `installImeKeyGuard`（全局 keyup 捕获）与 `shouldIgnoreGlobalHotkey`
 * （快捷键抑制）。但"写了实现"不等于"接上了线"——本守卫钉三件事：
 *
 * 1. **每一个全局 keydown 监听点都必须判组合态**（`addEventListener('keydown', …)` 的处理器
 *    函数体里必须出现 `isImeComposing(`）。判据**只看代码**（`.vue` 取 script 段 + 掩码注释字符串），
 *    且**只读处理器函数体**——整文件里出现过 `isImeComposing` 不算（同 ㊴：锚点被同文件别的字面量
 *    满足，等于把判据关掉）。
 * 2. **全局快捷键必须经同一个守卫出口**：`useGlobalHotkeys.ts` 里 `whenever(` 只允许在 `bindRef`
 *    内出现一次；`bind` / `bindWithMeta` 都必须调 `bindRef(`（macOS 的 meta 变体曾直连 `whenever`，
 *    绕过守卫时在 Mac 上等于没修）。
 * 3. **守卫本体必须被安装**：`main.ts` 调 `installImeKeyGuard()`；命令面板输入框的 Enter 处理器
 *    必须自己判组合态（keydown 侧全局捕获管不到）。
 *
 * 反脆弱：合成样本必须先被抓出来（未判组合态的全局监听、只在注释里提到、只有模板 @keydown），
 * 且合规样本不得误报；真实树 0 违规。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, collectByExt, muteNonCode } from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

/** 生产代码视图：.vue 只留 script 段；注释与字符串掩码但保留字符串内容（要匹配 'keydown'） */
export function productionCode(file: string, raw: string): string {
  const scoped = file.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw
  return muteNonCode(scoped, { keepStrings: true })
}

/** 从 `{` 位置取配对花括号内的源码（简单状态机，足够覆盖本项目写法） */
function braceBody(code: string, openIndex: number): string | null {
  if (code[openIndex] !== '{') return null
  let depth = 0
  for (let i = openIndex; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return code.slice(openIndex, i + 1)
    }
  }
  return null
}

/** 具名处理器的函数体：`function NAME(` 或 `const NAME = (` / `const NAME = function` */
export function namedHandlerBody(code: string, name: string): string | null {
  const fn = new RegExp(`function\\s+${name}\\s*\\(`).exec(code)
  if (fn) {
    const brace = code.indexOf('{', fn.index)
    if (brace !== -1) return braceBody(code, brace)
    return null
  }
  const arrow = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=>`
  ).exec(code)
  if (arrow) {
    const brace = code.indexOf('{', arrow.index + arrow[0].length - 1)
    if (brace !== -1) return braceBody(code, brace)
    // 表达式体箭头函数：取到语句结束（本判据要求处理器必须有函数体，表达式体按未守卫处理）
    return null
  }
  const assignedFn = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*function`).exec(code)
  if (assignedFn) {
    const brace = code.indexOf('{', assignedFn.index + assignedFn[0].length - 1)
    if (brace !== -1) return braceBody(code, brace)
  }
  return null
}

export interface KeydownSite {
  file: string
  named: string | null
  guarded: boolean
}

/**
 * 采集所有全局 keydown 监听点（`addEventListener('keydown', …)`），并判断它的处理器
 * 是否调用了 `isImeComposing(`。**只读处理器函数体**：整文件命中不算。
 */
export function collectKeydownSites(files: Array<{ file: string; code: string }>): KeydownSite[] {
  const sites: KeydownSite[] = []
  const listenerRe = /addEventListener\s*\(\s*['"]keydown['"]\s*,\s*/g
  for (const { file, code } of files) {
    let m: RegExpExecArray | null
    while ((m = listenerRe.exec(code)) !== null) {
      const rest = code.slice(m.index + m[0].length)
      const named = /^([A-Za-z_$][\w$]*)/.exec(rest)?.[1] ?? null
      let body: string | null = null
      if (named) {
        // 具名处理器：函数声明或常量赋值；找不到函数体按"未守卫"处理（fail-closed）
        body = namedHandlerBody(code, named)
      } else {
        // 内联箭头：从当前位置找第一个 `{` 并配对
        const brace = code.indexOf('{', m.index + m[0].length)
        body = brace === -1 ? null : braceBody(code, brace)
      }
      sites.push({ file, named, guarded: !!body && body.includes('isImeComposing(') })
    }
  }
  return sites
}

function readSources(): Array<{ file: string; code: string; raw: string }> {
  const files = [...collectByExt(SRC_DIR, '', '.ts'), ...collectByExt(SRC_DIR, '', '.vue')]
  return files
    .filter((file) => !/\.test\.ts$/.test(file))
    .map((file) => {
      const raw = readFileSync(resolve(SRC_DIR, file), 'utf8')
      return { file, code: productionCode(file, raw), raw }
    })
}

describe('键盘层接线守卫（b114）', () => {
  const sources = readSources()

  it('真实树：每个全局 keydown 监听点的处理器都判了输入法组合态', () => {
    const sites = collectKeydownSites(sources.map(({ file, code }) => ({ file, code })))
    expect(sites.length, '采集面不得为空（否则本判据恒绿）').toBeGreaterThanOrEqual(3)
    const bad = sites.filter((s) => !s.guarded).map((s) => `${s.file} → ${s.named ?? '(inline)'}`)
    expect(bad, `以下全局 keydown 未判组合态：${bad.join('，')}`).toEqual([])
  })

  it('守卫本体被安装：main.ts 调 installImeKeyGuard()', () => {
    const main = sources.find((s) => s.file === 'main.ts')
    expect(main, 'main.ts 必须存在').toBeTruthy()
    expect(main!.code).toContain('installImeKeyGuard()')
  })

  it('全局快捷键只经 bindRef 一个出口（macOS meta 变体不得绕过守卫）', () => {
    const hotkeys = sources.find((s) => s.file === 'composables/useGlobalHotkeys.ts')
    expect(hotkeys, 'useGlobalHotkeys.ts 必须存在').toBeTruthy()
    const code = hotkeys!.code
    const wheneverHits = code.match(/\bwhenever\s*\(/g) ?? []
    expect(wheneverHits.length, 'whenever 只允许在 bindRef 内出现一次').toBe(1)
    expect(code).toMatch(/function\s+bindRef\s*\(/)
    const bindRefCalls = code.match(/\bbindRef\s*\(/g) ?? []
    expect(bindRefCalls.length, 'bindRef 定义 + bind + bindWithMeta 三处').toBeGreaterThanOrEqual(3)
    expect(code, 'bindRef 内必须用 shouldIgnoreGlobalHotkey 判焦点').toContain('shouldIgnoreGlobalHotkey(')
  })

  it('命令面板的 keydown Enter 自己判组合态（keyup 全局守卫管不到 keydown）', () => {
    const palette = sources.find((s) => s.file === 'components/CommandPalette/index.vue')
    expect(palette, 'CommandPalette 必须存在').toBeTruthy()
    const body = namedHandlerBody(palette!.code, 'handleKeydown')
    expect(body, 'handleKeydown 必须是具名函数').toBeTruthy()
    expect(body!).toContain('isImeComposing(')
  })

  it('合成样本：未判组合态的全局监听必须被抓；只在注释/模板里提到不算', () => {
    const unguarded = `
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })
    `
    const commentOnly = `
      // 这里应该调用 isImeComposing(e)，但只是注释
      function onKey(e) { if (e.key === 'Escape') close() }
      window.addEventListener('keydown', onKey)
    `
    const guardedNamed = `
      function onKey(e) { if (isImeComposing(e)) return; if (e.key === 'Escape') close() }
      window.addEventListener('keydown', onKey)
    `
    const guardedInline = `
      window.addEventListener('keydown', (e) => { if (isImeComposing(e)) return; next() })
    `
    const templateOnly = `
      <template><input @keydown.enter.prevent="go" /></template>
      <script setup lang="ts">const go = () => {}</script>
    `
    const keyupOnly = `
      window.addEventListener('keyup', (e) => { if (e.key === 'Enter') go() })
    `
    const scan = (file: string, raw: string) => collectKeydownSites([{ file, code: productionCode(file, raw) }])

    expect(scan('a.ts', unguarded).map((s) => s.guarded)).toEqual([false])
    expect(
      scan('b.ts', commentOnly).map((s) => s.guarded),
      '注释里的提及不算接线'
    ).toEqual([false])
    expect(scan('c.ts', guardedNamed).map((s) => s.guarded)).toEqual([true])
    expect(scan('d.ts', guardedInline).map((s) => s.guarded)).toEqual([true])
    expect(scan('e.vue', templateOnly), '模板 @keydown 不是全局监听点，不进面').toEqual([])
    expect(scan('f.ts', keyupOnly), 'keyup 由全局守卫覆盖，这里不判').toEqual([])
  })
})
