/**
 * v-watermark 页面水印指令
 * Copyright (c) 2026 Stepby
 *
 * 用途：在页面/元素上叠加文字水印，防止截图泄露敏感数据
 *
 * 用法：
 *   <div v-watermark="'admin'">
 *   <div v-watermark="{ text: 'admin', opacity: 0.1, rotate: -20, fontSize: 16, gap: 200 }">
 *
 * 全局水印：在 App.vue 或 layout 上使用 v-watermark="userStore.name"
 */
export interface WatermarkOptions {
  text: string
  opacity?: number
  rotate?: number
  fontSize?: number
  gap?: number
  color?: string
}

const defaults: Required<Omit<WatermarkOptions, 'text'>> = {
  opacity: 0.08,
  rotate: -20,
  fontSize: 16,
  gap: 220,
  color: '' // 空字符串表示从 CSS 变量读取主题色，支持暗色模式自动切换
}

/** 读取当前主题的水印颜色（亮色黑字/暗色白字） */
function resolveWatermarkColor(el: HTMLElement, explicit?: string): string {
  if (explicit) return explicit
  // 优先从元素继承的 CSS 变量读取，回退到默认值
  const cssVar = getComputedStyle(el).getPropertyValue('--el-text-color-primary').trim()
  if (cssVar) return cssVar
  // 最终回退：检测暗色模式
  return document.documentElement.classList.contains('dark') ? '#e5eaf3' : '#303133'
}

// 多实例支持：每个 el 拥有独立的 observer，避免后挂载元素 disconnect 前一个的监听器
const watermarkObservers = new WeakMap<HTMLElement, MutationObserver>()

function clearWatermark(el: HTMLElement) {
  // 移除所有水印样式元素
  el.querySelectorAll('style[data-watermark="true"]').forEach((s) => s.remove())
  // 移除所有 v-watermark- 开头的 class
  Array.from(el.classList).forEach((c) => {
    if (c.startsWith('v-watermark-')) el.classList.remove(c)
  })
}

function buildWatermark(el: HTMLElement, opts: WatermarkOptions) {
  const config = { ...defaults, ...opts }
  if (!config.text) return

  // 重建前清理旧样式和类名，防止 MutationObserver 触发的重建累积 DOM 节点
  clearWatermark(el)

  // 创建 Canvas 绘制水印图案
  const canvas = document.createElement('canvas')
  canvas.width = config.gap
  canvas.height = config.gap
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.font = `${config.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.fillStyle = resolveWatermarkColor(el, config.color)
  ctx.globalAlpha = config.opacity
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((config.rotate * Math.PI) / 180)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 支持多行文本（按 \n 分割）
  const lines = config.text.split('\n')
  const lineHeight = config.fontSize * 1.2
  const startY = -((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, 0, startY + i * lineHeight))

  const dataUrl = canvas.toDataURL('image/png')

  // 注入样式（每个元素唯一 class，避免冲突）
  const className = 'v-watermark-' + Math.random().toString(36).slice(2, 8)
  el.classList.add(className)

  const style = document.createElement('style')
  style.setAttribute('data-watermark', 'true')
  style.textContent = `.${className}::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    background-image: url('${dataUrl}');
    background-repeat: repeat;
  }`
  el.appendChild(style)

  // 防篡改：监听元素属性变化，被删除时重新绘制
  // 先断开该元素之前的 observer（如有），再创建新的 observer 存入 WeakMap
  const prevObserver = watermarkObservers.get(el)
  if (prevObserver) prevObserver.disconnect()
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        const removed = Array.from(m.removedNodes).some((n) => n === style)
        if (removed) {
          buildWatermark(el, opts)
          return
        }
      }
      if (m.type === 'attributes' && m.target === el) {
        const hasClass = el.classList.contains(className)
        if (!hasClass) {
          el.classList.add(className)
        }
      }
    }
  })
  observer.observe(el, { childList: true, attributes: true, subtree: false })
  watermarkObservers.set(el, observer)
}

export default {
  mounted(el: HTMLElement, { value }: DirectiveBinding) {
    const opts: WatermarkOptions = typeof value === 'string' ? { text: value } : value
    // 确保元素是相对定位（水印使用 absolute）
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative'
    }
    buildWatermark(el, opts)
  },
  updated(el: HTMLElement, { value }: DirectiveBinding) {
    const opts: WatermarkOptions = typeof value === 'string' ? { text: value } : value
    // 清理旧水印（样式与 className）
    clearWatermark(el)
    // 关闭水印（text 为空时不重新创建）
    if (!opts.text) {
      const observer = watermarkObservers.get(el)
      if (observer) {
        observer.disconnect()
        watermarkObservers.delete(el)
      }
      return
    }
    buildWatermark(el, opts)
  },
  unmounted(el: HTMLElement) {
    clearWatermark(el)
    const observer = watermarkObservers.get(el)
    if (observer) {
      observer.disconnect()
      watermarkObservers.delete(el)
    }
  }
}
