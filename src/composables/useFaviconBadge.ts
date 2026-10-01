/**
 * TierA-2: Favicon 红点指示器
 *
 * 功能：在浏览器 favicon 上叠加未读数红点，方便用户在其他标签页时也能感知到通知
 *
 * 实现原理：
 * - 缓存原始 favicon 的 ImageData（模块级共享，因为 favicon 是全局唯一的）
 * - 每次更新时，克隆原始 ImageData，在右上角绘制红色圆点 + 白色数字
 * - 将合成后的 canvas 转为 PNG dataURL，替换 favicon href
 *
 * 引用计数说明（P2 修复）：
 * - 多个组件实例可能同时使用本 composable（如 HeaderNotice + TaskProgress）
 * - 使用 refCount 跟踪活跃实例数量
 * - 仅当最后一个实例卸载时才恢复原始 favicon，避免提前清除其他实例仍在使用的红点
 *
 * 使用方式：
 *   import { useFaviconBadge } from '@/composables/useFaviconBadge'
 *   const { updateBadge, resetBadge } = useFaviconBadge()
 *   updateBadge(unreadCount)
 *
 * 性能优化：
 * - 缓存原始 favicon ImageData，避免重复加载
 * - 数字超过 99 显示 "99+"
 * - 数字为 0 时恢复原始 favicon
 */
import { ref, onBeforeUnmount } from 'vue'

const FAVICON_SIZE = 32
const BADGE_RADIUS = 9
const BADGE_OFFSET_X = 23
const BADGE_OFFSET_Y = 9

// 模块级缓存：原始 favicon 的 ImageData（跨组件实例共享，favicon 是全局唯一的）
let originalImageData: ImageData | null = null
let originalHref: string | null = null
// 引用计数：当前活跃的 useFaviconBadge 实例数量
let refCount = 0
// 当前实例集合（记录每个实例的当前 count，便于聚合）
const instanceCounts = new Set<{ count: number }>()

/** 加载原始 favicon 并缓存其 ImageData */
async function loadOriginalFavicon(): Promise<ImageData | null> {
  if (originalImageData) return originalImageData

  // 查找当前 favicon link
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  const href = link?.href || '/favicon.ico'
  if (link && originalHref === null) {
    originalHref = link.href
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = FAVICON_SIZE
        canvas.height = FAVICON_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE)
        originalImageData = ctx.getImageData(0, 0, FAVICON_SIZE, FAVICON_SIZE)
        resolve(originalImageData)
      } catch (e) {
        // 跨域或其他错误，降级为空 canvas
        if (import.meta.env.DEV) console.warn('[FaviconBadge] Failed to load original favicon, using blank canvas:', e)
        const canvas = document.createElement('canvas')
        canvas.width = FAVICON_SIZE
        canvas.height = FAVICON_SIZE
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = readCssVar('--el-color-primary', '#409EFF')
          ctx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
          originalImageData = ctx.getImageData(0, 0, FAVICON_SIZE, FAVICON_SIZE)
        }
        resolve(originalImageData)
      }
    }
    img.onerror = () => {
      if (import.meta.env.DEV) console.warn('[FaviconBadge] favicon image load failed')
      resolve(null)
    }
    img.src = href
  })
}

/** 获取或创建 favicon link 元素 */
function getFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  return link
}

/** 从 CSS 变量读取颜色值（Canvas 不支持 CSS 变量，需运行时读取计算值） */
function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** 绘制带红点的 favicon */
function drawBadge(count: number, baseImageData: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = FAVICON_SIZE
  canvas.height = FAVICON_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // 绘制原始 favicon
  ctx.putImageData(baseImageData, 0, 0)

  // 绘制红色圆点背景
  ctx.beginPath()
  ctx.arc(BADGE_OFFSET_X, BADGE_OFFSET_Y, BADGE_RADIUS, 0, 2 * Math.PI)
  ctx.fillStyle = readCssVar('--el-color-danger', '#F56C6C')
  ctx.fill()

  // 绘制白色边框（提升对比度）
  ctx.strokeStyle = readCssVar('--el-color-white', '#FFFFFF')
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 绘制数字
  const text = count > 99 ? '99+' : String(count)
  ctx.fillStyle = readCssVar('--el-color-white', '#FFFFFF')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (text.length === 1) {
    ctx.font = 'bold 11px Arial, sans-serif'
  } else if (text.length === 2) {
    ctx.font = 'bold 9px Arial, sans-serif'
  } else {
    ctx.font = 'bold 7px Arial, sans-serif'
  }
  ctx.fillText(text, BADGE_OFFSET_X, BADGE_OFFSET_Y + 1)

  return canvas.toDataURL('image/png')
}

/** 聚合所有实例的 count，取最大值并刷新 favicon */
let refreshPromise: Promise<void> | null = null

async function refreshAggregatedBadge(): Promise<void> {
  // 串行化刷新：防止多个实例并发调用导致 favicon 写入顺序不确定
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      let maxCount = 0
      for (const inst of instanceCounts) {
        if (inst.count > maxCount) maxCount = inst.count
      }

      const link = getFaviconLink()
      if (maxCount <= 0) {
        if (originalHref) {
          link.href = originalHref
        }
        return
      }

      const baseData = await loadOriginalFavicon()
      if (!baseData) return

      const dataUrl = drawBadge(maxCount, baseData)
      if (dataUrl) {
        link.href = dataUrl
      }
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

/**
 * Favicon 红点 composable
 *
 * @returns updateBadge(count) 更新红点数字，resetBadge() 恢复原始 favicon
 */
export function useFaviconBadge() {
  const currentCount = ref(0)
  // 本实例的 count 跟踪对象（加入 instanceCounts 集合，便于跨实例聚合）
  const instanceTracker = { count: 0 }

  // 注册实例
  refCount++
  instanceCounts.add(instanceTracker)

  /** 更新红点数字（0 表示隐藏红点） */
  async function updateBadge(count: number): Promise<void> {
    currentCount.value = count
    instanceTracker.count = count
    await refreshAggregatedBadge()
  }

  /** 恢复原始 favicon */
  function resetBadge(): void {
    instanceTracker.count = 0
    currentCount.value = 0
    // 重新聚合（异步刷新 favicon）
    refreshAggregatedBadge()
  }

  onBeforeUnmount(() => {
    // 注销实例
    instanceCounts.delete(instanceTracker)
    refCount--
    // 仅当最后一个实例卸载时才彻底恢复原始 favicon
    if (refCount <= 0) {
      refCount = 0
      const link = getFaviconLink()
      if (originalHref) {
        link.href = originalHref
      }
    } else {
      // 还有其他实例活跃，重新聚合并刷新
      refreshAggregatedBadge()
    }
  })

  return {
    currentCount,
    updateBadge,
    resetBadge
  }
}
