/**
 * 静态守卫：Service Worker 新版本必须"可见提示 + 用户手动刷新"，周期检查必须经可见轮询（b117）。
 *
 * ## 立案
 *
 * 改造前 `main.ts` 只有 `registerSW({ immediate: true })`。`registerType: 'autoUpdate'` 的口径是
 * 新 SW 激活（`activated.isUpdate`）时**直接 `window.location.reload()`**（未传 `onNeedReload`
 * 就走插件兜底，见 `vite-plugin-pwa/dist/client/build/register.js`）——后台发一次版，正在填表
 * 的浏览器被静默整页刷新，未保存输入与在途任务一起消失。同一条实现还只在页面加载时检查一次，
 * 长驻 SPA 没有导航 ⇒ 浏览器不会做软更新检查，标签页可以连续几天跑旧包。
 *
 * 判据（每条都对应一种"看起来修好、实际复发"的写法）：
 * 1. `main.ts` 必须 `installSwUpdate(registerSW)` 装配（单一出口）；
 * 2. `main.ts` 不得再出现裸 `registerSW({…})`（不走单一出口 ⇒ 静默刷新回来）；
 * 3. `utils/swUpdate.ts` 必须传 `onNeedReload`（不传 ⇒ 插件自己刷新）；
 * 4. `applySwUpdate` 必须是**唯一**整页刷新点（它就是用户动作的语义）；
 * 5. `App.vue` 必须挂载 `SwUpdateNotice`（否则信号无人消费，等于没有提示）；
 * 6. 组件必须消费 `swUpdateReady`/`swUpdateSeq` 两个信号，并调用 `checkSwUpdate()`；
 * 7. 周期检查必须经 `useVisiblePolling`（全站轮询同一口径：隐藏即停 / 可见补采 / 在途闸）。
 *
 * 判据只看**代码**：`.ts` 用 `muteNonCode`（注释与字符串不参与），`.vue` 的脚本侧用
 * `blankOutsideVueScripts`，模板侧单独剔除 HTML 注释——注释里提到这些名字是文档，不是调用。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankOutsideVueScripts, muteNonCode } from './e2eSuiteScanKit'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export interface WiringSources {
  /** main.ts 原文（本函数内部按代码掩码） */
  main: string
  /** App.vue 原文（模板侧只剔除 HTML 注释） */
  appTemplate: string
  /** App.vue 脚本原文（本函数内部按代码掩码） */
  appScript: string
  /** utils/swUpdate.ts 原文（本函数内部按代码掩码） */
  swUpdate: string
  /** SwUpdateNotice 的脚本块原文（本函数内部按代码掩码） */
  noticeScript: string
}

/** 从 `function NAME` 起按花括号配对取函数体（掩码后的代码里字符串/注释已不可干扰）。 */
export function functionBody(code: string, name: string): string {
  const start = code.indexOf(`function ${name}`)
  if (start < 0) return ''
  const open = code.indexOf('{', start)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) return code.slice(open + 1, i)
    }
  }
  return ''
}

export function wiringViolations(raw: WiringSources): string[] {
  // 采集口径收在这一处：调用方一律喂原文，注释/字符串里的字样不得冒充接线。
  const s: WiringSources = {
    main: muteNonCode(raw.main),
    appTemplate: raw.appTemplate.replace(/<!--[\s\S]*?-->/g, ''),
    appScript: muteNonCode(raw.appScript),
    swUpdate: muteNonCode(raw.swUpdate),
    noticeScript: muteNonCode(raw.noticeScript)
  }
  const out: string[] = []
  if (!/installSwUpdate\s*\(\s*registerSW\s*\)/.test(s.main)) {
    out.push('main.ts：必须经 installSwUpdate(registerSW) 装配更新通道（单一出口）')
  }
  if (/registerSW\s*\(\s*\{/.test(s.main)) {
    out.push('main.ts：不得直接调用 registerSW({…})——autoUpdate 会在新 SW 激活时静默整页刷新')
  }
  if (!/onNeedReload\s*:/.test(s.swUpdate)) {
    out.push('utils/swUpdate.ts：装配时必须传 onNeedReload，否则插件自己 window.location.reload()')
  }
  const apply = functionBody(s.swUpdate, 'applySwUpdate')
  if (!/location\s*\.\s*reload\s*\(/.test(apply)) {
    out.push('utils/swUpdate.ts：applySwUpdate 必须是整页刷新点（用户点击后拿到新入口与预缓存）')
  }
  if (!/<SwUpdateNotice\b/.test(s.appTemplate)) {
    out.push('App.vue：必须挂载 <SwUpdateNotice />（否则就绪信号无人消费）')
  }
  if (!/\bswUpdateReady\b/.test(s.noticeScript) || !/\bswUpdateSeq\b/.test(s.noticeScript)) {
    out.push('SwUpdateNotice：必须消费 swUpdateReady 与 swUpdateSeq（"稍后"只对本次激活生效）')
  }
  if (!/\bcheckSwUpdate\s*\(/.test(s.noticeScript)) {
    out.push('SwUpdateNotice：周期检查必须调用 checkSwUpdate()')
  }
  if (!/useVisiblePolling\s*\(/.test(s.noticeScript)) {
    out.push('SwUpdateNotice：周期检查必须经 useVisiblePolling（隐藏即停 / 可见补采 / 在途闸）')
  }
  if (/\bsetInterval\s*\(/.test(s.noticeScript)) {
    out.push('SwUpdateNotice：不得自行 setInterval（周期取数只允许一条实现）')
  }
  return out
}

function readRaw(rel: string): string {
  return readFileSync(resolve(SRC_DIR, rel), 'utf8')
}

const realTree = (): WiringSources => ({
  main: readRaw('main.ts'),
  appTemplate: readRaw('App.vue'),
  appScript: blankOutsideVueScripts(readRaw('App.vue')),
  swUpdate: readRaw('utils/swUpdate.ts'),
  noticeScript: blankOutsideVueScripts(readRaw('components/SwUpdateNotice/index.vue'))
})

const good: WiringSources = {
  main: `import { registerSW } from 'virtual:pwa-register'\nimport { installSwUpdate } from '@/utils/swUpdate'\ninstallSwUpdate(registerSW)\n`,
  appTemplate: '<template><router-view /><SwUpdateNotice /></template>',
  appScript: "import SwUpdateNotice from '@/components/SwUpdateNotice/index.vue'",
  swUpdate: `export function installSwUpdate(register: RegisterSw): void {\n  register({ immediate: true, onNeedReload: markReady })\n}\nexport function applySwUpdate(): void {\n  window.location.reload()\n}\n`,
  noticeScript: `const visible = computed(() => swUpdateReady.value && swUpdateSeq.value > dismissedSeq.value)\nconst polling = useVisiblePolling(() => checkSwUpdate(), () => SW_UPDATE_CHECK_INTERVAL_MS)\npolling.start()\n`
}

describe('SW 更新通道接线守卫（b117）', () => {
  it('真实树：装配、挂载、轮询三处接线全部在位', () => {
    expect(wiringViolations(realTree())).toEqual([])
  })

  it('合成违规逐条必抓：每条判据都有自己的失败形态', () => {
    // 每条夹具只破坏一件事，另外两处保持合规（否则"几条一起红"证明不了这条判据有效）
    const cases: Array<[WiringSources, string]> = [
      [{ ...good, main: `import { registerSW } from 'virtual:pwa-register'\n` }, 'installSwUpdate'],
      [{ ...good, main: `${good.main}\nregisterSW({ immediate: true })\n` }, 'registerSW'],
      [{ ...good, swUpdate: good.swUpdate.replace('onNeedReload: markReady', '') }, 'onNeedReload'],
      [
        {
          ...good,
          swUpdate: good.swUpdate.replace('window.location.reload()', '')
        },
        'applySwUpdate'
      ],
      [{ ...good, appTemplate: '<template><router-view /></template>' }, 'SwUpdateNotice'],
      [
        {
          ...good,
          noticeScript:
            'const visible = computed(() => swUpdateReady.value)\nuseVisiblePolling(() => checkSwUpdate(), () => 1)\n'
        },
        'swUpdateSeq'
      ],
      [
        {
          ...good,
          noticeScript:
            'swUpdateReady.value && swUpdateSeq.value\nuseVisiblePolling(() => Promise.resolve(true), () => 1)\n'
        },
        'checkSwUpdate'
      ],
      [{ ...good, noticeScript: 'swUpdateReady.value && swUpdateSeq.value\ncheckSwUpdate()\n' }, 'useVisiblePolling'],
      [{ ...good, noticeScript: `${good.noticeScript}\nsetInterval(() => checkSwUpdate(), 1000)\n` }, 'setInterval']
    ]
    for (const [broken, expectInMessage] of cases) {
      const messages = wiringViolations(broken)
      expect(messages.length, `必须恰红一条（关键词 ${expectInMessage}），实际：${messages.join(' / ')}`).toBe(1)
      expect(messages[0]).toContain(expectInMessage)
    }
  })

  it('注释与 HTML 注释不得冒充接线（文档里的字样是文档，不是调用）', () => {
    const commented: WiringSources = {
      ...good,
      main: `// installSwUpdate(registerSW) 是改造前的写法\nexport const x = 1\n`,
      appTemplate: '<template><router-view /><!-- <SwUpdateNotice /> --></template>'
    }
    const messages = wiringViolations(commented)
    expect(messages).toHaveLength(2)
    expect(messages.join(' ')).toContain('installSwUpdate')
    expect(messages.join(' ')).toContain('SwUpdateNotice')
  })
})
