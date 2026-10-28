/**
 * 静态守卫：**周期性的远程取数轮询**只允许走 `useVisiblePolling`（b113）。
 *
 * ## 立案取证（改造前 HEAD 实测，三处同一缺陷、三种写法）
 *
 * 1. `views/monitor/server/index.vue` 是裸 `setInterval(loadServer, 2000)`——后台标签页每分钟
 *    仍发 30 次请求，而曲线只有 60 个点、全部采在没人看的时候；
 * 2. `composables/useAutoRefresh.ts` 有隐藏暂停，但"回到前台"只重启定时器，**不补一次**：
 *    用户切回来看到的是切走那一刻的数据，还得再等满一个间隔；
 * 3. `views/system/task/index.vue` 是"tick 到了就跳过请求"——timer 在后台空转、回来也要等满 5s。
 *
 * 三种写法在代码里长得完全不同，所以判据不能是"抓某个写法"，而是
 * **周期取数必须经由唯一实现**（隐藏即停 + 可见立即补一次 + 在途不叠加）。
 *
 * ## 判据
 *
 * 1. `src/**` 代码里的 `setInterval(` 只允许出现在 `ALLOWED` 登记的文件里；
 *    每条带自足理由，且**必须仍命中**（失效的豁免要报撤销，同 §㉘）；
 * 2. 四个周期取数站点必须以 `useVisiblePolling` 接线（只删旧 timer、不接新实现 = 轮询直接
 *    消失，屏幕上的数据永远停在首载——比原来更坏）；
 * 3. 唯一实现里三条纪律必须都在：隐藏检查、可见恢复回调、在途闸。
 *
 * 判据只看**代码**：`blankOutsideVueScripts`（模板不算）+ `muteNonCode`（注释/字符串/正则不算）。
 * 注释里提到 `setInterval(` 是文档，不是调用。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, collectByExt, lineNumberAt, muteNonCode } from './../utils/e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

const INTERVAL_RE = /\bsetInterval\s*\(/g

interface AllowEntry {
  file: string
  why: string
}

/**
 * `setInterval` 的白名单。
 *
 * 方向：**只有"纯本地计时"或"暂停本身就是错"的地方才配留下**。任何"定时去后端取数"的
 * 写法都必须走 `useVisiblePolling`——那里统一处理隐藏暂停、可见补采与在途闸。
 */
const ALLOWED: AllowEntry[] = [
  {
    file: 'composables/useRetryAfterLock.ts',
    why: '429 退避倒计时是纯本地秒表：剩余秒数必须按墙钟走，暂停会让倒计时停摆、解禁后显示过期秒数'
  },
  {
    file: 'composables/useSessionTimeout.ts',
    why: '空闲超时必须在后台照常计时（离开电脑不操作就该退出），暂停等于把安全窗口合法延长'
  },
  {
    file: 'utils/websocket.ts',
    why: 'WebSocket 心跳必须持续发送，否则空闲代理会掐断长连接；它是保活不是取数轮询'
  },
  {
    file: 'views/workbench/index.vue',
    why: '首页时钟每分钟更新一次本地时间显示，不发起任何请求'
  },
  {
    file: 'views/error/404.vue',
    why: '404 页的自动跳转倒计时是纯本地秒表，暂停会让用户永远停在错误页'
  },
  {
    file: 'views/lock.vue',
    why: '锁屏页时钟每秒走字，纯本地显示；锁屏状态下本来就没有后台取数'
  },
  {
    file: 'views/monitor/health/index.vue',
    why: '运行时长每秒本地自增（刷新间隔内的近似值，数据源为 /metrics）；该页取数走 useAutoRefresh'
  }
]

/** 必须经由 useVisiblePolling 的周期取数站点（接线反查的承诺面）。 */
const WIRED = [
  'composables/useAutoRefresh.ts',
  'views/monitor/server/index.vue',
  'views/report/view/index.vue',
  'views/system/task/index.vue'
]

interface Violation {
  file: string
  line: number
}

/** 纯函数：给定文件路径与原文，返回代码里的 `setInterval(` 位置（白名单由调用侧比对）。 */
export function scanSetInterval(file: string, raw: string): Violation[] {
  // 同 fullPageReload.guard：`blankOutsideVueScripts` 对没有 `<script>` 的输入会把整份文本置空，
  // 只对 .vue 使用，否则在 .ts 上等于把采集面清空。
  const src = file.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw
  const code = muteNonCode(src)
  const out: Violation[] = []
  INTERVAL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INTERVAL_RE.exec(code))) out.push({ file, line: lineNumberAt(code, m.index) })
  return out
}

function read(rel: string): string {
  return readFileSync(resolve(SRC_DIR, rel), 'utf8')
}

function codeOf(rel: string): string {
  const raw = read(rel)
  return muteNonCode(rel.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw)
}

function srcFiles(): string[] {
  return ['.ts', '.vue']
    .flatMap((ext) => collectByExt(SRC_DIR, '', ext))
    .filter((rel) => !rel.endsWith('.test.ts'))
    .map((rel) => rel.replace(/\\/g, '/'))
}

describe('周期轮询单一实现（b113）', () => {
  it('真实树：未登记的 setInterval 必须 0 处，白名单条目必须全部仍命中', () => {
    const files = srcFiles()
    expect(files.length).toBeGreaterThan(400)
    const hits = files.flatMap((rel) => scanSetInterval(rel, read(rel)))
    const allowed = new Set(ALLOWED.map((a) => a.file))
    const bad = hits.filter((h) => !allowed.has(h.file))
    expect(bad, `未登记的周期定时器：${JSON.stringify(bad)}`).toEqual([])
    const hitFiles = new Set(hits.map((h) => h.file))
    const stale = ALLOWED.filter((a) => !hitFiles.has(a.file)).map((a) => a.file)
    expect(stale, `失效的白名单（条目仍在册但代码里已无调用）：${stale.join(', ')}`).toEqual([])
    for (const entry of ALLOWED) {
      expect(entry.why.length, `白名单理由必须自足：${entry.file}`).toBeGreaterThanOrEqual(12)
      expect(entry.why).not.toMatch(/同上|见上|参见上/)
    }
  })

  it('合成违规必须被抓：裸调用 / window 前缀 / .vue 脚本块内都在面上', () => {
    expect(scanSetInterval('x.ts', 'const t = setInterval(() => f(), 1000)')).toHaveLength(1)
    expect(scanSetInterval('x.ts', 'window.setInterval(f, 1000)')).toHaveLength(1)
    expect(scanSetInterval('x.vue', '<script setup lang="ts">\nsetInterval(f, 1000)\n</script>')).toHaveLength(1)
  })

  it('注释、字符串与模板里的字样不得误报（放过文档，只抓调用）', () => {
    expect(scanSetInterval('x.ts', '// 此前是裸 setInterval(f, 2000)\nconst a = 1')).toEqual([])
    expect(scanSetInterval('x.ts', "const s = 'setInterval(f, 1000)'")).toEqual([])
    expect(scanSetInterval('x.vue', '<template><div title="setInterval(f, 1000)">x</div></template>')).toEqual([])
    expect(scanSetInterval('x.ts', 'const re = /setInterval\\(/g')).toEqual([])
  })

  it('接线反查：四个周期取数站点必须走统一实现（只删旧 timer = 轮询消失）', () => {
    for (const rel of WIRED) {
      const code = codeOf(rel)
      expect(code, `${rel} 必须经由 useVisiblePolling 轮询`).toMatch(/useVisiblePolling\s*\(/)
      expect(scanSetInterval(rel, read(rel)), `${rel} 不得再自行 setInterval`).toEqual([])
    }
  })

  it('唯一实现必须自带三条纪律：隐藏检查、可见补采、在途闸', () => {
    const code = codeOf('composables/useVisiblePolling.ts')
    expect(code, '排期前必须看 document.hidden').toMatch(/document\s*\.\s*hidden/)
    expect(code, '在途闸：重入时必须直接返回').toMatch(/if\s*\(\s*running\s*\)\s*return/)
    expect(code, '卸载必须停表').toMatch(/onBeforeUnmount\s*\(/)

    // 可见恢复那一支必须**立即取一次**，而不是只重启定时器（b113 立的就是这一条）。
    // 刀口收窄到 onPauseResume 这一段：整份文件里的 `run()` 还出现在 runNow 与 schedule 的
    // setTimeout 里，拿全文匹配等于这条断言恒真（㊴：锚点不得由别处的字面量供给）。
    const start = code.indexOf('onPauseResume')
    const end = start >= 0 ? code.indexOf('onMounted', start) : -1
    const resumeSeg = start >= 0 && end > start ? code.slice(start, end) : ''
    expect(resumeSeg, '必须注册可见性回调（onPauseResume）').not.toBe('')
    expect(resumeSeg, '排期前必须看 document.hidden 或调用 clearTimer 停表').toMatch(/clearTimer\s*\(\s*\)/)
    expect(resumeSeg, '可见恢复必须立即补采一次').toMatch(/\brun\s*\(\s*\)/)
    expect(resumeSeg, '可见恢复不得退化成"仅重新排期"（用户还得等满一个周期）').not.toMatch(/schedule\s*\(\s*\)/)
  })
})
