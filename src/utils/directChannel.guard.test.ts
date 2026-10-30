/**
 * 静态守卫：生产码里的**直连通道**必须逐条登记（b138）。
 *
 * ## 立的案
 *
 * 本仓有两条请求栈：`utils/request`（service 实例 + 拦截器）与 `utils/blobRequest`
 * （二进制/文本直连原语）。两者之外的每一处 `fetch(` / `axios(` 都是一条**没有统一口径**
 * 的旁路——它的超时、错误文案、追踪号、401 语义都要单独再写一遍，而 b138 实测的三处缺陷
 * 全部长在这种旁路上：
 * - `views/monitor/aiHistory/index.vue` 裸 `fetch` 导出：**结构性无超时**（fetch 默认无超时）、
 *   丢弃后端 `msg` 与 `trace_id`、401 不触发会话失效、429 丢掉 `Retry-After`
 *   （而 b137 刚给该端点加了 5/s 的独立外带限流 ⇒ 连点两次就只有一句"导出失败"）；
 * - `views/monitor/health/index.vue` 裸 `fetch('/metrics')` 不带 `Authorization`：
 *   后端在配置 `[monitor].metrics_token` 后只认**运维令牌**（不是用户 JWT）⇒
 *   这些部署上指标区永久空白，而注释把这种失效写成了"best-effort"；
 * - `plugins/download.ts` 三处 `timeout: 60000`（统一口径 600_000）：由
 *   `src/api/blobTimeout.guard.test.ts` 的采集面扩张（b138 起全 `src/**`）接管，
 *   本守卫不重复判超时值，只判"这条通道是否被登记过、理由是否自足"。
 *
 * ## 判据形状
 *
 * 采集面由事实派生：递归 `src/**` 的 `.ts` + `.vue`（排除 `*.test.ts`；测试夹具里的合成
 * 违规不该让别人红）。站点 = 注释与字符串之外的 `fetch(` / `axios(` / `axios.<verb>(` /
 * `new XMLHttpRequest`。每个站点所在的文件必须出现在 `ALLOWED` 里，且 `ALLOWED` 的每一项
 * **必须仍命中**（活性：代码迁走后留下一句"已登记"是另一种静默失效）。
 *
 * 已知局限（写在这里而不是留在脑子里）：只认字面调用形态——
 * `const f = window.fetch` 之后再调 `f()`、或 `const x = axios` 改名调用，本守卫看不见；
 * 那种写法在本仓不存在，一旦出现，应在评审时人工补登记（而不是把守卫改宽到形同虚设）。
 *
 * 第二条已知局限：`el-upload` 的 `:action` 由 Element Plus 内部 XHR 发送，不是 `axios(` /
 * `fetch(` 字面量 ⇒ 静态守卫结构上看不见。`components/Editor` 的两条上传通道已在 b138 统一
 * 改走 `http-request`（`handleHttpRequest` → `utils/request`）；其余 `el-upload` 站点用同源
 * `/common/upload` 且失败由 `:on-error` 兜底，若将来需要追踪号/401 会话失效，应按同一形状
 * 换成 `http-request`，而不是往 ALLOWED 里加行（那里只登记**字面量**直连站点）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { muteNonCode } from '@/utils/e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_DIR = resolve(VUE_ROOT, 'src')

const rel = (p: string) => p.slice(VUE_ROOT.length + 1).replace(/\\/g, '/')

interface AllowedChannel {
  file: string
  /** 为什么这条通道可以绕过统一请求栈（必须自足：换一条理由就不成立） */
  why: string
}

/**
 * 允许存在的直连站点。新增条目必须能回答："它为什么不能用 `utils/request` 或
 * `utils/blobRequest`？"——答不出就该改调那两个，而不是往这里加一行。
 */
const ALLOWED: AllowedChannel[] = [
  {
    file: 'src/utils/blobRequest.ts',
    why: '直连原语本体：超时/错误体/追踪号/401 四项口径的唯一实现，axios 只允许出现在这里'
  },
  {
    file: 'src/utils/frontendErrorReporter.ts',
    why:
      '前端错误遥测上报：必须绕过请求层——上报失败不得弹窗、不得触发登出、不得进 errorHub ' +
      '（否则遥测故障会伪装成业务故障），失败结局由服务端 sys_frontend_error 表与采样率承担'
  },
  {
    file: 'src/api/upload.ts',
    why:
      '分片上传编排：单片失败的处置权在编排器——静默后由续传轮按服务端 receivedIndexes 收敛、' +
      'abortChunk 是 best-effort 清理，走全局拦截器会把可自愈的单片失败刷进错误面板；' +
      '三类请求各有超时（片 120s / 合并 330s / 控制 30s），重试判据还依赖原始 e.response.status'
  }
]

function collectSources(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) collectSources(abs, out)
    else if (
      ent.isFile() &&
      (ent.name.endsWith('.ts') || ent.name.endsWith('.vue')) &&
      !ent.name.endsWith('.test.ts')
    ) {
      out.push(abs)
    }
  }
  return out.sort()
}

/**
 * 扫描一段源码里的直连站点。纯函数：合成夹具与真实文件共用同一份实现。
 * 返回 `行号: 形态` 的可读列表（空数组 = 干净）。
 */
export function scanDirectChannels(src: string, file: string): string[] {
  const codeOnly = muteNonCode(src)
  if (codeOnly.length !== src.length) {
    throw new Error(`${file}: 掩码长度不变式被打破，行号不再可信`)
  }
  const out: string[] = []
  const push = (index: number, form: string) => {
    out.push(`${file}: 第 ${codeOnly.slice(0, index).split('\n').length} 行 ${form}`)
  }
  // `(?<![\w$])` 排除 `$fetch(` / `prefetch(` / `myfetch(`：那些不是全局 fetch 调用
  for (const m of codeOnly.matchAll(/(?<![\w$])fetch\s*\(/g)) push(m.index ?? 0, 'fetch(')
  for (const m of codeOnly.matchAll(/(?<![\w$.])axios\s*\(/g)) push(m.index ?? 0, 'axios(')
  for (const m of codeOnly.matchAll(/(?<![\w$.])axios\s*\.\s*(?:get|post|put|delete|patch|head|request)\s*\(/g)) {
    push(m.index ?? 0, 'axios.<verb>(')
  }
  for (const m of codeOnly.matchAll(/new\s+XMLHttpRequest\s*\(/g)) push(m.index ?? 0, 'new XMLHttpRequest(')
  return out
}

const sourceFiles = collectSources(SRC_DIR)
const violations = sourceFiles.flatMap((f) => scanDirectChannels(readFileSync(f, 'utf8'), rel(f)))
const allowedFiles = new Set(ALLOWED.map((a) => a.file))
const unregistered = violations.filter((v) => !allowedFiles.has(v.split(': ')[0]))

describe('直连通道登记守卫', () => {
  it('真实树：所有 fetch/axios 站点都在登记表内', () => {
    expect(sourceFiles.length, `采集面必须覆盖全 src（实测 ${sourceFiles.length}）`).toBeGreaterThanOrEqual(400)
    console.warn(
      `[directChannel] 采集面 ${sourceFiles.length} 个 .ts/.vue / 直连站点 ${violations.length} / 未登记 ${unregistered.length}`
    )
    expect(
      unregistered,
      '新增直连通道必须改走 utils/request 或 utils/blobRequest；确需旁路时在 ALLOWED 里逐条写明理由'
    ).toEqual([])
  })

  it('登记表活性：每一条登记必须仍命中真实站点（代码迁走后不得留空条目）', () => {
    for (const entry of ALLOWED) {
      const hits = violations.filter((v) => v.startsWith(entry.file + ': '))
      expect(hits.length, `${entry.file} 已登记但本轮零命中 ⇒ 请撤销该条目（或说明为什么它仍需要）`).toBeGreaterThan(0)
      expect(entry.why.trim().length, `${entry.file} 的登记理由必须自足`).toBeGreaterThanOrEqual(12)
    }
    const whys = ALLOWED.map((a) => a.why)
    expect(new Set(whys).size, '登记理由不得互相复制（复制来的理由等于没写）').toBe(whys.length)
  })

  it('差异法活性：往真实 aiHistory 页追加一条裸 fetch，命中必须 +1', () => {
    const file = resolve(SRC_DIR, 'views/monitor/aiHistory/index.vue')
    const src = readFileSync(file, 'utf8')
    const before = scanDirectChannels(src, rel(file))
    expect(before.length, '该页当前必须已经是干净的（导出走 blobRequest）').toBe(0)
    const after = scanDirectChannels(src + `\nasync function probe() { await fetch('/x') }\n`, rel(file))
    expect(after.length, '插入一条裸 fetch 后命中数').toBe(1)
  })

  it('控制组：刀口双向有效（裸调用必抓；注释/字符串/改名/封装实例必须不抓）', () => {
    const cases: Array<{ title: string; src: string; count: number }> = [
      {
        title: '裸 fetch ⇒ 必须命中 1',
        src: `export async function go() { await fetch('/x') }\n`,
        count: 1
      },
      {
        title: 'window.fetch ⇒ 必须命中 1（同样是全局 fetch）',
        src: `export async function go() { await window.fetch('/x') }\n`,
        count: 1
      },
      {
        title: 'axios({...}) ⇒ 必须命中 1',
        src: `export function go() { return axios({ url: '/x' }) }\n`,
        count: 1
      },
      {
        title: 'axios.get(...) ⇒ 必须命中 1',
        src: `export function go() { return axios.get('/x') }\n`,
        count: 1
      },
      {
        title: 'new XMLHttpRequest ⇒ 必须命中 1',
        src: `export function go() { return new XMLHttpRequest() }\n`,
        count: 1
      },
      {
        title: '注释里写 fetch( ⇒ 必须 0（掩码器在位）',
        src: `// 旧实现：await fetch('/x')\nexport function go() { return 1 }\n`,
        count: 0
      },
      {
        title: '字符串里写 fetch( ⇒ 必须 0',
        src: `export const doc = "不要用 fetch('/x') 直连"\n`,
        count: 0
      },
      {
        title: 'prefetch( / $fetch( / fetchPriority 不是全局 fetch ⇒ 必须 0',
        src: `export function go() { prefetch('/x'); $fetch('/y'); return fetchPriority }\n`,
        count: 0
      },
      {
        title: 'axios.create({...}) 是封装实例，不是直连请求 ⇒ 必须 0',
        src: `export const svc = axios.create({ baseURL: '/api' })\n`,
        count: 0
      },
      {
        title: 'service({...}) / request({...}) 走统一请求栈 ⇒ 必须 0',
        src: `export function go() { return service({ url: '/x' }); }\nexport function go2() { return request({ url: '/y' }); }\n`,
        count: 0
      }
    ]

    let caught = 0
    for (const c of cases) {
      const hits = scanDirectChannels(c.src, 'synthetic.ts')
      caught += c.count
      expect(hits.length, c.title).toBe(c.count)
    }
    expect(caught, '必须被抓到的违规用例数').toBeGreaterThanOrEqual(3)
  })
})
