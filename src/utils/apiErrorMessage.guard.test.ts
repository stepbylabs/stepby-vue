/**
 * 失败文案单一出口守卫（b125）。
 *
 * ## 立的案
 *
 * `errorCode` 的 Proxy 恒返回 `default`，把 `errorCode[code] || data.msg || default`
 * 的中段变成死代码——后端 `msg` 结构性到不了用户眼前，而**没有任何判据能发现**：
 * 两处调用点各自"看起来对"，单测还把缺陷写成了期望。现在映射表只暴露两个函数，
 * 但这个形状很容易被下一个人重新拼回去（`translateErrorCode(code) || data.msg || …`
 * 手写三连），所以判据钉两件事：
 *
 * 1. **单一出口**：`translateErrorCode` / `defaultErrorMessage` 只允许在
 *    `utils/apiError.ts` 里被调用；同时禁止 `errorCode[...]` 形态的裸下标访问回归
 *    （那正是默认导入 + Proxy 的用法）。
 * 2. **接线反查**（AGENTS ⑮）：两条真实失败通道（`utils/request.ts` 主通道、
 *    `plugins/download.ts` 裸 axios 通道）必须**真的调用** `resolveApiErrorMessage`；
 *    否则 helper 写得再对，用户看到的仍是旧文案。
 *
 * 双向：三条合成违规各自点名、注释/字符串里的同名文本不误报、真实树 0 违规。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, muteNonCode } from './e2eSuiteScanKit'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 唯一允许组合三种文案来源的地方 */
const SINGLE_EXIT = 'utils/apiError.ts'
/** 映射表本体：这里出现 `new Proxy` 就是回退到"任意键都有值"的缺陷形状 */
const MAP_FILE = 'utils/errorCode.ts'

/** 承诺必须调用 `resolveApiErrorMessage` 的真实通道 */
const WIRED = ['utils/request.ts', 'plugins/download.ts']

export type Sources = Record<string, string>

function codeOf(rel: string, raw: string): string {
  return muteNonCode(rel.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw)
}

/** 纯函数：合成集合与真实树共用同一份判据 */
export function findErrorMessageExitGaps(sources: Sources): string[] {
  const gaps: string[] = []
  for (const [rel, raw] of Object.entries(sources)) {
    const code = codeOf(rel, raw)
    // MAP_FILE 是这两个函数的**定义**处（`export function translateErrorCode(`），不算调用
    if (rel !== SINGLE_EXIT && rel !== MAP_FILE && /\b(?:translateErrorCode|defaultErrorMessage)\s*\(/.test(code)) {
      gaps.push(`${rel}: 直接调用映射表函数（文案必须经 resolveApiErrorMessage 单一出口）`)
    }
    if (rel !== SINGLE_EXIT && rel !== MAP_FILE && /\berrorCode\s*\[\s*\]/.test(code)) {
      // muteNonCode 把字符串内容置空：`errorCode['default']` → `errorCode[ ]`
      gaps.push(`${rel}: 裸下标访问 errorCode（默认导入 + Proxy 的缺陷形状）`)
    }
    if (rel === MAP_FILE && /\bnew\s+Proxy\s*\(/.test(code)) {
      gaps.push(`${MAP_FILE}: 映射表不得再用 Proxy（未登记键必须返回 undefined）`)
    }
  }
  for (const rel of WIRED) {
    const raw = sources[rel]
    if (raw == null) {
      gaps.push(`${rel}: 文件缺失（采集面坏了）`)
      continue
    }
    if (!/\bresolveApiErrorMessage\s*\(/.test(codeOf(rel, raw))) {
      gaps.push(`${rel}: 未接入 resolveApiErrorMessage（失败的文案仍走旧拼法）`)
    }
  }
  return gaps
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

function readRealTree(): { sources: Sources; count: number } {
  const sources: Sources = {}
  const files = walk(SRC)
  for (const abs of files) {
    const rel = abs.slice(SRC.length + 1).replace(/\\/g, '/')
    sources[rel] = readFileSync(abs, 'utf8')
  }
  return { sources, count: files.length }
}

function baseSources(): Sources {
  return {
    [SINGLE_EXIT]: "import { translateErrorCode } from '@/utils/errorCode'\nreturn translateErrorCode(code)\n",
    [MAP_FILE]: 'export function translateErrorCode(c: number) { return String(c) }\n',
    'utils/request.ts': 'resolveApiErrorMessage(code, data.msg)\n',
    'plugins/download.ts': 'resolveApiErrorMessage(code, msg)\n',
    'views/clean.vue': '<script setup lang="ts">const label = "translateErrorCode(500)"</script>\n'
  }
}

describe('失败文案单一出口守卫', () => {
  it('真实树：采集面足够大且零违规（两条通道均已接线）', () => {
    const { sources, count } = readRealTree()
    // 采集面自证：扫不到文件时"零违规"没有意义（AGENTS ⑥）
    expect(count).toBeGreaterThan(300)
    expect(sources[SINGLE_EXIT]).toBeTruthy()
    expect(findErrorMessageExitGaps(sources)).toEqual([])
  })

  it('合成违规：每条承诺面单独缺失都点名（不是"任意一条在就算过"）', () => {
    const cases: Array<[string, (s: Sources) => void, string]> = [
      [
        '别处直接调用 translateErrorCode',
        (s) => (s['utils/other.ts'] = 'const m = translateErrorCode(500)\n'),
        'utils/other.ts: 直接调用映射表函数（文案必须经 resolveApiErrorMessage 单一出口）'
      ],
      [
        '别处直接调用 defaultErrorMessage',
        (s) => (s['plugins/x.ts'] = 'const m = defaultErrorMessage()\n'),
        'plugins/x.ts: 直接调用映射表函数（文案必须经 resolveApiErrorMessage 单一出口）'
      ],
      [
        '裸下标访问 errorCode',
        (s) => (s['utils/legacy.ts'] = "const m = errorCode['default']\n"),
        'utils/legacy.ts: 裸下标访问 errorCode（默认导入 + Proxy 的缺陷形状）'
      ],
      [
        '映射表退回 Proxy',
        (s) => (s[MAP_FILE] = 'export default new Proxy({}, { get: () => "x" })\n'),
        'utils/errorCode.ts: 映射表不得再用 Proxy（未登记键必须返回 undefined）'
      ],
      [
        '主通道未接线',
        (s) => (s['utils/request.ts'] = 'const msg = errorCode[code] || data.msg\n'),
        'utils/request.ts: 未接入 resolveApiErrorMessage（失败的文案仍走旧拼法）'
      ],
      [
        '下载通道未接线',
        (s) => (s['plugins/download.ts'] = 'errorHub.report("error", "download", t("common.downloadError"))\n'),
        'plugins/download.ts: 未接入 resolveApiErrorMessage（失败的文案仍走旧拼法）'
      ]
    ]
    for (const [label, mutate, expected] of cases) {
      const s = baseSources()
      mutate(s)
      expect(findErrorMessageExitGaps(s), label).toContain(expected)
    }
  })

  it('反证：注释与字符串里的同名文本不得误报，合规写法不得转红', () => {
    const s = baseSources()
    s['utils/notes.ts'] = [
      '// 历史写法：errorCode[code] || data.msg || errorCode.default（已废弃）',
      '/* translateErrorCode(500) 只允许在 apiError 内调用 */',
      'const doc = "defaultErrorMessage() 不是公开 API"',
      'export const ok = 1'
    ].join('\n')
    expect(findErrorMessageExitGaps(s)).toEqual([])
  })
})
