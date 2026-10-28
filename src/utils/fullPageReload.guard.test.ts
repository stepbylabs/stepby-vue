/**
 * 静态守卫：整页刷新只允许出现在**登记过的白名单**里（b113）。
 *
 * ## 立案取证（改造前 HEAD 实测）
 *
 * 组件尺寸切换原先靠 `location.reload()` 生效——根因是 `App.vue` 读 `Cookies.get('size')`
 * （非响应式），而 `store/modules/app.ts` 里的 `size` 一次都没被消费。结果是**一次样式选择
 * 换一次整页重载**：弹窗/筛选/滚动位置全丢，认证链、配置、路由与全部 chunk 重跑一遍。
 * 这类"用整页刷新代替响应式"的写法在本仓还有别的形态，所以判据不是"改掉这一处"，
 * 而是**每一个整页刷新都要有自己的理由**（未登记的回归当场红）。
 *
 * ## 判据
 *
 * 1. `src/**` 代码里的 `location.reload()` 只允许出现在 `ALLOWED` 登记的 5 个文件里，
 *    每条必须带自足理由，且**必须仍命中**（失效的豁免要报撤销，同 §㉘）；
 * 2. `App.vue` 必须以 `appStore.size` 为尺寸来源（接线反查：只删 cookie 读取、不接 store
 *    = 尺寸永远停在默认档，比原来更坏）；
 * 3. 尺寸组件 `SizeSelect` 不得再出现整页刷新。
 *
 * 判据只看**代码**：`blankOutsideVueScripts`（模板不算）+ `muteNonCode`（注释与字符串不算）。
 * 注释里提到 `location.reload()` 是文档，不是调用；拿它判红等于逼人删注释。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, collectByExt, lineNumberAt, muteNonCode } from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

const RELOAD_RE = /\blocation\s*\.\s*reload\s*\(/g

interface AllowEntry {
  file: string
  why: string
}

/**
 * 整页刷新的白名单。
 *
 * 方向：**只有"整页重载本身是语义"的地方才配留下**——用户主动要求重载、崩溃页重试、
 * chunk 版本失效自恢复、全局布局重置。任何"改了状态却让刷新去拾取"的写法都属于坏形状。
 */
const ALLOWED: AllowEntry[] = [
  {
    file: 'components/CommandPalette/index.vue',
    why: '命令面板里的「重载页面」是用户显式选择的动作，语义就是整页重载（不是状态生效手段）'
  },
  {
    file: 'layout/components/Settings/index.vue',
    why: '「重置全部布局设置」要清掉全部已持久化外观态并回到出厂样式，整页重载是唯一能保证所有类/变量归位的通道'
  },
  {
    file: 'utils/routerError.ts',
    why: 'chunk 版本失效（部署换包）后的自恢复：必须整页重载才能拿到新的入口与 manifest，SPA 内跳转拿到的是旧 chunk'
  },
  {
    file: 'views/error/500.vue',
    why: '崩溃页的「重试」按钮：页面本身已处于错误边界接管状态，重载是唯一可靠的复位动作'
  },
  {
    file: 'views/error/network-error.vue',
    why: '网络错误页的「重试」按钮：连骨架都没加载出来，重载等价于重新发起首屏引导'
  }
]

interface Violation {
  file: string
  line: number
}

/** 纯函数：给定文件路径与原文，返回代码里的整页刷新位置（白名单由调用侧比对）。 */
export function scanReloads(file: string, raw: string): Violation[] {
  // `blankOutsideVueScripts` 对**没有 `<script>` 块的输入**会把整份文本置空（它是给 .vue 用的），
  // 直接套在 .ts 上等于把采集面清空 ⇒ 只有 .vue 才需要"模板不参与"这一步。
  const src = file.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw
  const code = muteNonCode(src)
  const out: Violation[] = []
  RELOAD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RELOAD_RE.exec(code))) out.push({ file, line: lineNumberAt(code, m.index) })
  return out
}

function read(rel: string): string {
  return readFileSync(resolve(SRC_DIR, rel), 'utf8')
}

function srcFiles(): string[] {
  const exts = ['.ts', '.vue']
  return exts
    .flatMap((ext) => collectByExt(SRC_DIR, '', ext))
    .filter((rel) => !rel.endsWith('.test.ts'))
    .map((rel) => rel.replace(/\\/g, '/'))
}

describe('整页刷新白名单（b113）', () => {
  it('真实树：未登记的 location.reload 必须 0 处，白名单条目必须全部仍命中', () => {
    const files = srcFiles()
    expect(files.length).toBeGreaterThan(400)
    const hits = files.flatMap((rel) => scanReloads(rel, read(rel)))
    const allowed = new Set(ALLOWED.map((a) => a.file))
    const bad = hits.filter((h) => !allowed.has(h.file))
    expect(bad, `未登记的整页刷新：${JSON.stringify(bad)}`).toEqual([])
    const hitFiles = new Set(hits.map((h) => h.file))
    const stale = ALLOWED.filter((a) => !hitFiles.has(a.file)).map((a) => a.file)
    expect(stale, `失效的白名单（条目仍在册但代码里已无调用）：${stale.join(', ')}`).toEqual([])
    for (const entry of ALLOWED) {
      expect(entry.why.length, `白名单理由必须自足：${entry.file}`).toBeGreaterThanOrEqual(12)
      expect(entry.why).not.toMatch(/同上|见上|参见上/)
    }
  })

  it('合成违规必须被抓：裸调用 / window.location.reload / 模板内联都在面上', () => {
    expect(scanReloads('x.ts', 'function f(){ location.reload() }')).toHaveLength(1)
    expect(scanReloads('x.ts', 'window.location.reload()')).toHaveLength(1)
    expect(scanReloads('x.vue', '<script setup lang="ts">\nlocation.reload()\n</script>')).toHaveLength(1)
    expect(
      scanReloads('x.vue', '<script setup lang="ts">\nconst f = () => { window.location.reload() }\n</script>')
    ).toHaveLength(1)
  })

  it('注释、字符串与模板里的字样不得误报（放过文档，只抓调用）', () => {
    expect(scanReloads('x.ts', '// location.reload() 是历史写法\nconst a = 1')).toEqual([])
    expect(scanReloads('x.ts', '/* window.location.reload() */\nconst a = 1')).toEqual([])
    expect(scanReloads('x.ts', "const s = 'location.reload()'")).toEqual([])
    expect(scanReloads('x.vue', '<template><div title="location.reload()">x</div></template>')).toEqual([])
  })

  it('接线反查：App.vue 的尺寸必须来自响应式 store（不得回到读 cookie）', () => {
    const app = read('App.vue')
    const code = muteNonCode(blankOutsideVueScripts(app))
    expect(code).toMatch(/resolveElementSize\s*\(\s*appStore\s*\.\s*size/)
    expect(code).not.toMatch(/Cookies\s*\.\s*get\s*\(\s*['"]size['"]\s*\)/)
  })

  it('尺寸组件不得再出现整页刷新（白名单外的回归当场红）', () => {
    expect(scanReloads('components/SizeSelect/index.vue', read('components/SizeSelect/index.vue'))).toEqual([])
  })
})
