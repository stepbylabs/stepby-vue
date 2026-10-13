/**
 * D8（UX-RESPONSIVE-PLAN 阶段三）：移动端表格卡片模式 —— 运行时增强
 *
 * 原理：卡片化 CSS 需要"列名 → 单元格"的对应关系。Element Plus 的 el-table
 * 不携带每列语义标签，故在手机档（<768px）+ 开关开启时：
 *  1. 给 <html> 挂 `mobile-table-cards-on` 类，激活卡片化 CSS（index.scss）；
 *  2. 用 MutationObserver 监听 DOM，对每个 `.el-table` 从表头（thead th）
 *     提取列名，写入同列 `td` 的 `data-label`（CSS ::before 显示）；
 *  3. 复杂表头（含 colspan/rowspan 的合并表头）无法可靠映射列名，标记
 *     `no-mobile-cards` 跳过卡片化、回落横向滚动策略。
 *
 * 零页面改动：全部表格（含分页/排序/筛选触发的重渲染）自动生效；
 * 开关关闭或视口回到平板/桌面时完全恢复原横滚行为（默认安全）。
 */
import { watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import useSettingsStore from '@/store/modules/settings'
import useAppStore from '@/store/modules/app'

const MOBILE_MAX_WIDTH = 768

let observer: MutationObserver | null = null
let rafId: number | null = null

/** 表头是否含合并单元格（多级表头无法可靠映射列名 → 跳过卡片化） */
function hasMergedHeader(table: Element): boolean {
  return !!table.querySelector('.el-table__header th[colspan]:not([colspan="1"]), .el-table__header th[rowspan]:not([rowspan="1"])')
}

/** 把表头列名注入同列 td 的 data-label（对单个 .el-table） */
function injectLabelsIntoTable(table: Element): void {
  if (hasMergedHeader(table)) {
    table.classList.add('no-mobile-cards')
    return
  }
  const ths = Array.from(table.querySelectorAll('.el-table__header-wrapper thead th'))
  const labels = ths.map((th) => (th.textContent || '').trim())
  table.querySelectorAll('.el-table__body-wrapper tbody tr').forEach((tr) => {
    tr.querySelectorAll('td').forEach((td, i) => {
      const label = labels[i]
      if (label) {
        td.setAttribute('data-label', label)
      }
    })
  })
  table.classList.add('has-mobile-cards')
}

/** 全量注入（observer 回调节流到一帧一次） */
function scheduleInject(): void {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    document.querySelectorAll('.el-table:not(.has-mobile-cards)').forEach(injectLabelsIntoTable)
  })
}

function startObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => scheduleInject())
  observer.observe(document.body, { childList: true, subtree: true })
  scheduleInject()
}

function stopObserver(): void {
  observer?.disconnect()
  observer = null
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  document.querySelectorAll('.el-table.has-mobile-cards').forEach((t) => t.classList.remove('has-mobile-cards'))
}

/** App.vue 调用一次即可；随开关/视口自动启停 */
export function useMobileTableCards(): void {
  const settingsStore = useSettingsStore()
  const appStore = useAppStore()
  const { width } = useWindowSize()

  watch(
    [() => settingsStore.userPrefs.mobileTableCards, width, () => appStore.device],
    ([enabled, w]: [boolean, number]) => {
      const active = enabled && w < MOBILE_MAX_WIDTH
      const html = document.documentElement
      if (active) {
        html.classList.add('mobile-table-cards-on')
        startObserver()
      } else {
        html.classList.remove('mobile-table-cards-on')
        stopObserver()
      }
    },
    { immediate: true }
  )
}
