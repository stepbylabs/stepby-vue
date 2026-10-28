/**
 * 看板/工作台小组件的取数失败态形状锁（b107）
 *
 * 立的案：这一族组件此前把"取数失败"显示成"就是 0 / 就是空 / 干脆整块隐藏"，
 * 用户无法区分服务抖动与真实空数据。约定：
 * ① 小组件取数必须走提供失败态的通道（`useWidgetLoad` 或 `useEchartsWidget`）；
 * ② 失败必须给用户一条出路（`common.retry` 文案的重试入口）；
 * ③ 采集面由事实派生：目录内**有取数**的文件一律进面，不按文件名枚举；
 * ④ 承诺面：已知的 5 处页面一个都不能少（改名/删除后必须重新登记）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WIDGET_DIR = resolve(VUE_ROOT, 'src/views/dashboard/widgets')

/** 取数信号：直接 request(...) 或从 api 层导入函数 */
const FETCH_SIGNAL = /(\brequest\s*\(|from '@\/api\/)/
const CHANNEL_CALL = /\b(useWidgetLoad|useEchartsWidget)\s*(<[^>]*>)?\s*\(/

function collectWidgetFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.vue'))
    .map((e) => join(dir, e.name))
}

/** 判定一个组件源码是否违反约定；返回 null = 合规（或不属于这一族） */
function widgetLoadViolation(text: string): string | null {
  if (!FETCH_SIGNAL.test(text)) return null
  const channel = CHANNEL_CALL.exec(text)
  if (!channel) return '有取数但没有失败态通道（useWidgetLoad / useEchartsWidget）'
  // 失败态必须真的画在模板上（只把 loadError 取出来不用 = 失败仍然看不见）
  const template = text.split('<script')[0]
  if (!/v-if="[^"]*(loadError|error|Error|Fail|fail)/.test(template)) {
    return '模板没有失败态分支（v-if 绑定 error/loadError/…Fail）'
  }
  if (!text.includes("t('common.retry')")) return '失败态没有重试入口（common.retry）'
  return null
}

const KNOWN_WIDGET_LOADS = [
  'src/views/dashboard/widgets/StatCardsWidget.vue',
  'src/views/dashboard/widgets/RecentOperLogWidget.vue',
  'src/views/dashboard/widgets/FlowTodoWidget.vue',
  'src/views/dashboard/widgets/LoginTrendWidget.vue',
  'src/views/dashboard/widgets/OperPieWidget.vue',
  'src/views/dashboard/widgets/UserTrendWidget.vue',
  'src/views/workbench/index.vue',
  'src/views/ai/panel/index.vue'
]

function rel(abs: string): string {
  return abs
    .slice(VUE_ROOT.length + 1)
    .split(/[\\/]/)
    .join('/')
}

describe('小组件取数失败态（b107）', () => {
  it('真实树：widgets 目录内所有取数组件都有失败态与重试出口', () => {
    const files = collectWidgetFiles(WIDGET_DIR)
    expect(files.length, '采集面为空 ⇒ 拒绝判据').toBeGreaterThan(4)
    const surface: string[] = []
    for (const abs of files) {
      const src = readFileSync(abs, 'utf8')
      if (!FETCH_SIGNAL.test(src)) continue
      surface.push(rel(abs))
      expect(widgetLoadViolation(src), `${rel(abs)}: ${widgetLoadViolation(src)}`).toBeNull()
    }
    expect(surface.length, '派生采集面为空 ⇒ 拒绝判据').toBeGreaterThan(3)
    // 承诺面：已知取数组件不得静默离开采集面（改名/删除必须重新登记）
    for (const known of KNOWN_WIDGET_LOADS) {
      const src = readFileSync(resolve(VUE_ROOT, known), 'utf8')
      expect(widgetLoadViolation(src), `${known}: ${widgetLoadViolation(src)}`).toBeNull()
      if (known.startsWith('src/views/dashboard/widgets/')) {
        expect(surface, `承诺面缺少 ${known}（改名或删除后需重新登记）`).toContain(known)
      }
    }
  })

  it('合成双向：缺任一条契约都必须被抓，不属于这一族的写法不得误报', () => {
    const compliant = `
      <el-empty v-if="loadError && !loaded"><el-button @click="load">{{ t('common.retry') }}</el-button></el-empty>
      <script setup lang="ts">
      import request from '@/utils/request'
      import { useWidgetLoad } from '@/composables/useWidgetLoad'
      const { data, loaded, loadError, load } = useWidgetLoad(async () => (await request({ url: '/x' })).data, {})
      </script>`
    expect(widgetLoadViolation(compliant)).toBeNull()

    // ① 有取数、没有任何失败态通道（原缺陷形态：catch 只打 DEV console）
    const silent = `import request from '@/utils/request'
      async function load() { try { await request({ url: '/x' }) } catch (e) { console.warn(e) } }`
    expect(widgetLoadViolation(silent)).toContain('失败态通道')

    // ② 用了组合子但模板里没有失败态分支（失败仍然看不见）
    const unread = compliant.replace('v-if="loadError && !loaded"', '')
    expect(widgetLoadViolation(unread)).toContain('失败态分支')

    // ③ 有失败态但没有重试入口
    const noRetry = compliant.replace("{{ t('common.retry') }}", '')
    expect(widgetLoadViolation(noRetry)).toContain('重试')

    // 不误报：图表族走 useEchartsWidget 并给 refresh 重试；无取数的纯展示组件不进面
    const chart = `<el-empty v-if="error"><el-button @click="refresh">{{ t('common.retry') }}</el-button></el-empty>
      <script setup lang="ts">
      import request from '@/utils/request'
      import { useEchartsWidget } from '@/composables/useEchartsWidget'
      const { error, refresh } = useEchartsWidget({ name: 'x', fetchData: async () => (await request({ url: '/x' })).data, buildOption: () => ({}) })
      </script>`
    expect(widgetLoadViolation(chart)).toBeNull()
    expect(widgetLoadViolation('<template><div>纯展示</div></template>')).toBeNull()
  })
})
