/**
 * ECharts 图表实例管理 composable
 *
 * 解决项目中的共性问题：
 * 1. 实例未复用导致内存泄漏（每次 render 创建新实例）
 * 2. 初始化时容器尺寸为 0 的警告（DOM 未就绪）
 * 3. 暗色模式下图表文字/背景不适配
 * 4. resize 监听未统一管理
 * 5. 容器尺寸变化（侧边栏折叠等）不自适应（ResizeObserver）
 *
 * 使用方式：
 * ```ts
 * const { getChart, resize, dispose, waitForContainerReady } = useChart()
 * const chart = await getChart(chartRef.value)
 * chart.setOption({ ... })
 * ```
 */
import { onBeforeUnmount, nextTick } from 'vue'
import echarts, { type ECharts, type EChartsOption } from '@/utils/echarts'

/** 从 CSS 变量读取颜色值（ECharts 不支持 CSS 变量，需运行时读取计算值） */
export function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** 暗色模式下 ECharts 通用配置（文字、背景、提示框） */
function getDarkOption(isDark: boolean): Partial<EChartsOption> {
  if (!isDark) return {}
  // 读取 Element Plus 暗色模式 CSS 变量，fallback 保证可用性
  const text = readCssVar('--el-text-color-primary', '#E5EAF3')
  const border = readCssVar('--el-border-color', '#4C4D4F')
  const bg = readCssVar('--el-bg-color', '#141414')
  const tooltipBg = readCssVar('--el-bg-color-overlay', '#1d1e1f')
  return {
    backgroundColor: bg,
    textStyle: { color: text },
    legend: { textStyle: { color: text } },
    xAxis: {
      axisLabel: { color: text },
      axisLine: { lineStyle: { color: border } },
      splitLine: { lineStyle: { color: border } }
    },
    yAxis: {
      axisLabel: { color: text },
      axisLine: { lineStyle: { color: border } },
      splitLine: { lineStyle: { color: border } }
    },
    tooltip: {
      backgroundColor: tooltipBg,
      borderColor: border,
      textStyle: { color: text }
    }
  }
}

/** 判断当前是否为暗色模式 */
function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function useChart() {
  /** 实例缓存：key 为容器 DOM 元素 */
  const instances = new Map<HTMLElement, ECharts>()
  /** ResizeObserver 缓存：key 为容器 DOM 元素 */
  const observers = new Map<HTMLElement, ResizeObserver>()
  /** resize 防抖定时器 */
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  /** fallback 初始化定时器（CSS 未生效时延迟 resize） */
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  /** 等待容器 DOM 就绪（有非零尺寸） */
  async function waitForContainerReady(el: HTMLElement, timeoutMs = 2000): Promise<boolean> {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) return true
    const start = Date.now()
    await nextTick()
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
    while (Date.now() - start < timeoutMs) {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) return true
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
    }
    return el.offsetWidth > 0 && el.offsetHeight > 0
  }

  /**
   * 从元素的 Tailwind class 中推断高度值（如 h-[280px] → 280）
   * 用于在 CSS 未生效时设置 fallback 内联高度
   */
  function inferHeightFromClass(el: HTMLElement): number | null {
    const cls = el.className
    const m = cls.match(/h-\[(\d+)px\]/)
    return m ? parseInt(m[1], 10) : null
  }

  /**
   * 获取（或创建）图表实例，复用已存在实例避免内存泄漏
   *
   * 如果容器尺寸为 0（Vite dev 模式下 Tailwind CSS 异步注入可能导致），
   * 会从 Tailwind class 推断高度并设置临时内联样式作为 fallback，
   * 确保 ECharts 能正常初始化。CSS 生效后自动移除临时样式并 resize。
   *
   * 同时为容器挂载 ResizeObserver，监听容器尺寸变化（如侧边栏折叠）自动 resize。
   *
   * @param el 容器 DOM 元素
   * @returns ECharts 实例，若容器不可用返回 null
   */
  async function getChart(el: HTMLElement | null): Promise<ECharts | null> {
    if (!el) return null
    const ready = await waitForContainerReady(el)
    let needsFallbackResize = false

    if (!ready) {
      // 容器尺寸为 0，设置临时内联尺寸作为 fallback
      // 避免 ECharts "Can't get DOM width or height" 警告
      if (el.offsetWidth === 0) {
        const parentW = el.parentElement?.offsetWidth
        el.style.width = (parentW && parentW > 0 ? parentW : Math.min(window.innerWidth - 80, 1200)) + 'px'
        needsFallbackResize = true
      }
      if (el.offsetHeight === 0) {
        const h = inferHeightFromClass(el) ?? 280
        el.style.height = `${h}px`
        needsFallbackResize = true
      }
    }

    let chart = instances.get(el)
    if (!chart || chart.isDisposed()) {
      chart = echarts.init(el)
      instances.set(el, chart)
    }

    // 为容器挂载 ResizeObserver（仅挂载一次），监听容器尺寸变化自动 resize
    // 解决侧边栏折叠/展开、布局响应式变化等场景下图表不自适应的问题
    if (!observers.has(el) && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          const c = instances.get(el)
          if (c && !c.isDisposed()) c.resize()
        }, 150)
      })
      observer.observe(el)
      observers.set(el, observer)
    }

    // 如果使用了 fallback，等待 Tailwind CSS 生效后移除内联样式并 resize
    if (needsFallbackResize) {
      if (fallbackTimer) clearTimeout(fallbackTimer)
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null
        const c = instances.get(el)
        if (!c || c.isDisposed()) return
        // 检查 Tailwind 类是否已生效（移除内联样式后尺寸是否仍 > 0）
        const hadInlineWidth = el.style.width
        const hadInlineHeight = el.style.height
        el.style.width = ''
        el.style.height = ''
        // 如果移除后尺寸变为 0，说明 CSS 还没生效，恢复内联样式
        if (el.offsetWidth === 0) el.style.width = hadInlineWidth
        if (el.offsetHeight === 0) el.style.height = hadInlineHeight
        // 无论如何都 resize 一次，确保图表适应最新尺寸
        c.resize()
      }, 500)
    }

    return chart
  }

  /**
   * 应用暗色模式适配配置
   * @param chart 图表实例
   * @param option 用户设置的 option
   * @returns 合并暗色配置后的 option
   */
  function withDark<T extends EChartsOption>(chart: ECharts, option: T): T {
    const dark = getDarkOption(isDarkMode())
    return { ...dark, ...option } as T
  }

  /** resize 所有缓存的图表实例（防抖 150ms） */
  function resize(): void {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      instances.forEach((c) => {
        if (!c.isDisposed()) c.resize()
      })
    }, 150)
  }

  /** 释放指定实例（同时清理对应的 ResizeObserver） */
  function dispose(el?: HTMLElement): void {
    if (el) {
      const c = instances.get(el)
      if (c && !c.isDisposed()) c.dispose()
      instances.delete(el)
      const obs = observers.get(el)
      if (obs) {
        obs.disconnect()
        observers.delete(el)
      }
    } else {
      instances.forEach((c) => {
        if (!c.isDisposed()) c.dispose()
      })
      instances.clear()
      observers.forEach((obs) => obs.disconnect())
      observers.clear()
    }
  }

  /** 组件卸载时自动清理所有实例和 ResizeObserver */
  onBeforeUnmount(() => {
    if (resizeTimer) {
      clearTimeout(resizeTimer)
      resizeTimer = null
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    dispose()
  })

  return {
    getChart,
    withDark,
    waitForContainerReady,
    resize,
    dispose,
    isDarkMode
  }
}
