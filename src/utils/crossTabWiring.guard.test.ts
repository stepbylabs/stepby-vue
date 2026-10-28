/**
 * 跨标签页/网络状态接线守卫（b122）。
 *
 * "写了没接线 = 没写"：通道、处理器、横幅、广播点各自都能单测通过，
 * 但只要 main.ts 没装处理器、App.vue 没挂横幅、store 没广播，整条链路在真实
 * 应用里**完全不存在**，而所有单测照样绿。这里按承诺面逐条反查真实文件，
 * 并用合成违规证明每一根针都真的会红（AGENTS ⑮）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, muteNonCode } from './e2eSuiteScanKit'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type WiringSources = Record<string, string>

function codeOf(file: string, raw: string): string {
  return muteNonCode(file.endsWith('.vue') ? blankOutsideVueScripts(raw) : raw)
}

/**
 * .vue 的**模板代码**：剔掉 `<script>` 块与 HTML 注释。
 * 只在模板里找标签（`<NetworkStatusBanner />`），因此脚本字符串里提到它不算接线；
 * 反过来模板注释里写一句也不算。
 */
function templateOf(raw: string): string {
  return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '')
}

interface Needle {
  file: string
  re: RegExp
  label: string
  where?: 'template' | 'script'
}

const NEEDLES: Needle[] = [
  { file: 'main.ts', re: /installCrossTabHandlers\s*\(/, label: '应用启动未安装跨标签页处理器' },
  { file: 'main.ts', re: /installNetworkStatus\s*\(/, label: '应用启动未安装网络状态监听' },
  {
    file: 'App.vue',
    re: /<NetworkStatusBanner\b/,
    label: 'App 根未挂载网络状态横幅（登录页看不到断网）',
    where: 'template'
  },
  { file: 'store/modules/user.ts', re: /announceSessionEnded\s*\(/, label: 'logOut 未广播会话结束' },
  { file: 'store/modules/user.ts', re: /announceIdentityIfChanged\s*\(/, label: 'getInfo 未广播身份变化' },
  { file: 'i18n/index.ts', re: /announceLanguageChanged\s*\(/, label: 'setLanguage 未广播语言变化' },
  { file: 'utils/crossTabHandlers.ts', re: /clearLocalSession\s*\(/, label: '会话结束未走本地会话收尾' }
]

function viewOf(file: string, raw: string, where: 'template' | 'script' = 'script'): string {
  return where === 'template' ? templateOf(raw) : codeOf(file, raw)
}

/** 纯函数：真实文件集合或合成集合都能跑（自检与真树共用同一份判据） */
export function findCrossTabWiringGaps(sources: WiringSources): string[] {
  const gaps: string[] = []
  for (const n of NEEDLES) {
    const raw = sources[n.file]
    if (raw == null) {
      gaps.push(`${n.file}: 文件缺失（采集面坏了）`)
      continue
    }
    if (!n.re.test(viewOf(n.file, raw, n.where))) gaps.push(`${n.file}: ${n.label}`)
  }
  const handlerRaw = sources['utils/crossTabHandlers.ts']
  if (handlerRaw != null && /\blogOut\s*\(/.test(codeOf('utils/crossTabHandlers.ts', handlerRaw))) {
    // 令牌已被对方删除，再发一次远程 logout 只会换来 401 并触发拦截器重登框
    gaps.push('utils/crossTabHandlers.ts: 会话结束不得再走远程 logOut（令牌已被另一标签页删除）')
  }
  const installSites = Object.entries(sources)
    .filter(
      ([file, raw]) => file !== 'utils/crossTabHandlers.ts' && /installCrossTabHandlers\s*\(/.test(codeOf(file, raw))
    )
    .map(([file]) => file)
  if (installSites.length !== 1 || installSites[0] !== 'main.ts') {
    // 重复安装会让同一事件被处理两次（两条登出提示 + 两次导航）
    gaps.push(`installCrossTabHandlers 调用点必须恰为 main.ts，实际：${installSites.join(',') || '(无)'}`)
  }
  return gaps
}

const REAL_FILES = [
  'main.ts',
  'App.vue',
  'store/modules/user.ts',
  'i18n/index.ts',
  'utils/crossTabHandlers.ts',
  'utils/crossTab.ts',
  'composables/useNetworkStatus.ts',
  'components/NetworkStatusBanner/index.vue'
]

function readReal(): WiringSources {
  const out: WiringSources = {}
  for (const rel of REAL_FILES) out[rel] = readFileSync(resolve(SRC, rel), 'utf8')
  return out
}

function synthetic(): WiringSources {
  return {
    'main.ts': "import x from 'y'\ninstallCrossTabHandlers()\ninstallNetworkStatus()\n",
    'App.vue': '<template><NetworkStatusBanner /></template>\n<script setup lang="ts"></script>\n',
    'store/modules/user.ts': 'announceSessionEnded(reason)\nannounceIdentityIfChanged(id)\n',
    'i18n/index.ts': 'announceLanguageChanged(locale)\n',
    'utils/crossTabHandlers.ts': 'clearLocalSession()\n',
    'utils/crossTab.ts': '',
    'composables/useNetworkStatus.ts': '',
    'components/NetworkStatusBanner/index.vue': ''
  }
}

describe('跨标签页/网络状态接线守卫', () => {
  it('真实树：八条承诺面全部接线，零缺口', () => {
    expect(REAL_FILES.length).toBeGreaterThanOrEqual(7)
    expect(findCrossTabWiringGaps(readReal())).toEqual([])
  })

  it('合成违规：每条承诺面单独缺失都点名（不是"任意一条在就算过"）', () => {
    const cases: Array<[string, (s: WiringSources) => void, string]> = [
      [
        'main 未装跨标签页处理器',
        (s) => (s['main.ts'] = 'installNetworkStatus()\n'),
        'main.ts: 应用启动未安装跨标签页处理器'
      ],
      [
        'main 未装网络监听',
        (s) => (s['main.ts'] = 'installCrossTabHandlers()\n'),
        'main.ts: 应用启动未安装网络状态监听'
      ],
      [
        'App 未挂横幅',
        (s) => (s['App.vue'] = '<template><router-view /></template>'),
        'App.vue: App 根未挂载网络状态横幅（登录页看不到断网）'
      ],
      [
        '登出未广播',
        (s) => (s['store/modules/user.ts'] = 'announceIdentityIfChanged(id)\n'),
        'store/modules/user.ts: logOut 未广播会话结束'
      ],
      [
        'getInfo 未广播身份',
        (s) => (s['store/modules/user.ts'] = 'announceSessionEnded(reason)\n'),
        'store/modules/user.ts: getInfo 未广播身份变化'
      ],
      ['语言未广播', (s) => (s['i18n/index.ts'] = 'setItem(locale)\n'), 'i18n/index.ts: setLanguage 未广播语言变化'],
      [
        '会话结束未清本地',
        (s) => (s['utils/crossTabHandlers.ts'] = 'other()\n'),
        'utils/crossTabHandlers.ts: 会话结束未走本地会话收尾'
      ]
    ]
    for (const [name, mutate, expected] of cases) {
      const s = synthetic()
      mutate(s)
      const gaps = findCrossTabWiringGaps(s)
      expect(gaps, name).toContain(expected)
    }
  })

  it('反例：会话结束走远程 logOut 必须红（令牌已被删除，只会 401）', () => {
    const s = synthetic()
    s['utils/crossTabHandlers.ts'] = 'useUserStore().logOut()\nclearLocalSession()\n'
    expect(findCrossTabWiringGaps(s)).toContain(
      'utils/crossTabHandlers.ts: 会话结束不得再走远程 logOut（令牌已被另一标签页删除）'
    )
  })

  it('反例：注释/字符串里的调用不算接线；重复安装必须红', () => {
    const commented = synthetic()
    commented['main.ts'] = '// installCrossTabHandlers()\ninstallNetworkStatus()\n'
    expect(findCrossTabWiringGaps(commented)).toContain('main.ts: 应用启动未安装跨标签页处理器')

    const inString = synthetic()
    inString['App.vue'] =
      '<template><router-view /></template>\n<script setup lang="ts">const s = "<NetworkStatusBanner />"</script>'
    expect(findCrossTabWiringGaps(inString)).toContain('App.vue: App 根未挂载网络状态横幅（登录页看不到断网）')

    const doubled = synthetic()
    doubled['utils/extra.ts'] = 'installCrossTabHandlers()\n'
    expect(
      findCrossTabWiringGaps(doubled).some((g) => g.startsWith('installCrossTabHandlers 调用点必须恰为 main.ts'))
    ).toBe(true)
  })
})
