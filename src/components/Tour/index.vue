<template>
  <Transition name="fade">
    <div v-if="visible" class="tour-wrapper">
      <!-- H1: mask 仅用于事件捕获（点击关闭），遮罩效果由 highlight 的 box-shadow 实现，
           避免与 box-shadow 叠加导致 0.75 透明度（过暗） -->
      <div class="stepby-tour-mask fixed inset-0 bg-transparent z-[9998] pointer-events-auto" @click="onMaskClick"></div>
      <div class="stepby-tour-highlight" :style="highlightStyle"></div>
      <div
        ref="popoverRef"
        class="stepby-tour-popover"
        :style="popoverStyle"
        role="dialog"
        aria-modal="true"
        :aria-label="t('tour.ariaLabel')"
        tabindex="-1"
        @keydown="onPopoverKeydown"
      >
        <div
          class="stepby-tour-arrow absolute w-0 h-0 border-8 border-transparent"
          :class="arrowClass"
          :style="arrowStyle"
        ></div>
        <div class="stepby-tour-header flex justify-between items-center mb-2">
          <span class="stepby-tour-title font-semibold text-sm">{{ currentStep.title }}</span>
          <span class="stepby-tour-counter text-text-secondary text-xs">
            {{ currentStepIndex + 1 }} / {{ steps.length }}
          </span>
        </div>
        <div class="stepby-tour-body text-[13px] leading-relaxed mb-4 text-text-regular">{{ currentStep.content }}</div>
        <div class="stepby-tour-footer flex justify-end gap-2 items-center">
          <el-button v-if="currentStepIndex > 0" size="small" @click="prev">{{ t('tour.prev') }}</el-button>
          <el-button v-if="currentStepIndex < steps.length - 1" size="small" type="primary" @click="next">
            {{ t('tour.next') }}
          </el-button>
          <el-button v-else size="small" type="primary" @click="finish">{{ t('tour.finish') }}</el-button>
          <el-button size="small" text @click="skip">{{ t('tour.skip') }}</el-button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * 新手引导 Tour 组件
 * Copyright (c) 2026 Stepby
 *
 * 轻量级实现（无外部依赖），通过 selector 定位元素并展示引导提示
 *
 * 用法：
 *   <Tour v-model:visible="tourVisible" :steps="steps" storage-key="home-tour" />
 *
 *   const steps = [
 *     { selector: '.sidebar-container', title: '侧边栏', content: '点击菜单项导航到对应页面' },
 *     { selector: '.navbar', title: '顶栏', content: '全屏、主题切换、用户菜单等' },
 *   ]
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const { t } = useI18n()

export interface TourStep {
  selector: string
  title: string
  content: string
  /** 弹出方向，默认 bottom */
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    steps: TourStep[]
    /** localStorage key，若设置则完成后不再自动显示 */
    storageKey?: string
  }>(),
  {
    storageKey: ''
  }
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  finish: []
  skip: []
}>()

const currentStepIndex = ref(0)
// M9: DOMRect / 视口尺寸对象无需深度响应式，用 shallowRef 避免深度代理开销
const targetRect = shallowRef<DOMRect | null>(null)
const viewportRect = shallowRef({
  width: typeof window !== 'undefined' ? window.innerWidth : 0,
  height: typeof window !== 'undefined' ? window.innerHeight : 0
})
const popoverRef = ref<HTMLElement | null>(null)
// H2: popover 高度动态读取实际 DOM 高度，避免硬编码导致定位偏移；fallback 160
const popoverHeight = ref(160)
// 记录触发元素，关闭后返回焦点
const triggerEl = ref<HTMLElement | null>(null)
// 保存滚动等待的 setTimeout timer id，每次切换前清理避免重叠
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const currentStep = computed<TourStep>(
  () => props.steps[currentStepIndex.value] || { selector: '', title: '', content: '' }
)

const visible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val)
})

const highlightStyle = computed(() => {
  if (!targetRect.value) return { display: 'none' }
  const r = targetRect.value
  return {
    left: `${r.left - 4}px`,
    top: `${r.top - 4}px`,
    width: `${r.width + 8}px`,
    height: `${r.height + 8}px`
  }
})

const popoverStyle = computed(() => {
  if (!targetRect.value) return { display: 'none' }
  const r = targetRect.value
  const placement = currentStep.value.placement || 'bottom'
  const popoverWidth = 320
  // H2: 使用动态测量的实际高度，未测量时 fallback 160
  const ph = popoverHeight.value || 160
  const gap = 16
  let top = 0
  let left = 0
  switch (placement) {
    case 'top':
      top = r.top - ph - gap
      left = r.left + r.width / 2 - popoverWidth / 2
      break
    case 'bottom':
      top = r.bottom + gap
      left = r.left + r.width / 2 - popoverWidth / 2
      break
    case 'left':
      top = r.top + r.height / 2 - ph / 2
      left = r.left - popoverWidth - gap
      break
    case 'right':
      top = r.top + r.height / 2 - ph / 2
      left = r.right + gap
      break
  }
  // 边界检查
  if (left < 8) left = 8
  if (left + popoverWidth > viewportRect.value.width - 8) left = viewportRect.value.width - popoverWidth - 8
  if (top < 8) top = 8
  if (top + ph > viewportRect.value.height - 8) top = viewportRect.value.height - ph - 8
  return { left: `${left}px`, top: `${top}px`, width: `${popoverWidth}px` }
})

const arrowClass = computed(() => `stepby-tour-arrow-${currentStep.value.placement || 'bottom'}`)

const arrowStyle = computed(() => {
  if (!targetRect.value) return {}
  const r = targetRect.value
  const placement = currentStep.value.placement || 'bottom'
  // 让箭头指向目标元素中心
  const popoverWidth = 320
  switch (placement) {
    case 'top':
    case 'bottom': {
      // 计算目标中心相对于 popover 的水平位置
      const targetCenter = r.left + r.width / 2
      const popoverLeft = parseFloat(popoverStyle.value.left as string) || 0
      const arrowLeft = targetCenter - popoverLeft
      return { left: `${Math.max(20, Math.min(popoverWidth - 20, arrowLeft))}px` }
    }
    case 'left':
    case 'right': {
      const targetCenterY = r.top + r.height / 2
      const popoverTop = parseFloat(popoverStyle.value.top as string) || 0
      const arrowTop = targetCenterY - popoverTop
      return { top: `${Math.max(20, Math.min(140, arrowTop))}px` }
    }
  }
  return {}
})

function updateTargetRect() {
  if (!props.visible) return
  // L10: querySelector 返回 Element | null，此处断言为 HTMLElement | null 用于后续 focus/scrollIntoView。
  // 非 HTML 元素（如 SVGElement）极少作为 tour 目标，且 scrollIntoView 在 Element 上也存在，
  // 故该断言在当前使用场景下安全可接受。
  const el = document.querySelector(currentStep.value.selector) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // 切换前清理旧 timer，避免重叠回调
    if (scrollTimer) {
      clearTimeout(scrollTimer)
      scrollTimer = null
    }
    // 等待滚动完成后再获取 rect
    scrollTimer = setTimeout(() => {
      targetRect.value = el.getBoundingClientRect()
      scrollTimer = null
    }, 300)
  } else {
    // 找不到元素，跳到下一步
    next()
  }
}

function next() {
  if (currentStepIndex.value < props.steps.length - 1) {
    currentStepIndex.value++
    updateTargetRect()
    updatePopoverHeight()
  } else {
    finish()
  }
}

function prev() {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
    updateTargetRect()
    updatePopoverHeight()
  }
}

/** H2: 动态测量 popover 实际高度，更新 popoverHeight 用于定位计算 */
function updatePopoverHeight(): void {
  nextTick(() => {
    const el = popoverRef.value
    // offsetHeight 为 0 通常意味着 popover 未渲染（display:none），保留 fallback
    if (el && el.offsetHeight > 0) {
      popoverHeight.value = el.offsetHeight
    }
  })
}

function finish() {
  if (props.storageKey) {
    localStorage.setItem(props.storageKey, 'completed')
  }
  visible.value = false
  emit('finish')
}

function skip() {
  if (props.storageKey) {
    localStorage.setItem(props.storageKey, 'skipped')
  }
  visible.value = false
  emit('skip')
}

function onMaskClick() {
  // 点击遮罩跳过引导（提供快速退出方式，避免误触通过确认按钮）
  skip()
}

function onResize() {
  viewportRect.value = { width: window.innerWidth, height: window.innerHeight }
  updateTargetRect()
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  // H5: 输入元素聚焦时忽略全局快捷键，避免在输入框中按方向键/Escape 误触发引导导航
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
  if (e.key === 'Escape') skip()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
}

/**
 * 在 popover 内部实现 focus trap：
 * - Tab 在最后一个可聚焦元素上时回到第一个
 * - Shift+Tab 在第一个可聚焦元素上时回到最后一个
 */
function onPopoverKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const root = popoverRef.value
  if (!root) return
  const focusables = (
    Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[]
  ).filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (focusables.length === 0) {
    e.preventDefault()
    root.focus()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !root.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else {
    if (active === last || !root.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }
}

/** 聚焦到 popover 容器（或第一个可聚焦元素），用于打开/步骤切换后 */
function focusPopover() {
  nextTick(() => {
    const root = popoverRef.value
    if (!root) return
    const focusables = (
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ) as HTMLElement[]
    ).filter((el) => el.offsetParent !== null)
    if (focusables.length > 0) {
      focusables[0].focus()
    } else {
      root.focus()
    }
  })
}

/** 关闭并返回焦点到触发元素 */
function returnFocus() {
  const el = triggerEl.value
  triggerEl.value = null
  if (el && document.contains(el)) {
    nextTick(() => el.focus())
  }
}

watch(
  () => props.visible,
  (val: boolean) => {
    if (val) {
      // 记录当前焦点元素（触发按钮或其他），用于关闭后恢复焦点
      const active = document.activeElement as HTMLElement | null
      triggerEl.value = active && active !== document.body ? active : null
      currentStepIndex.value = 0
      updateTargetRect()
      focusPopover()
      // H2: 首次打开后测量实际高度
      updatePopoverHeight()
    } else {
      returnFocus()
    }
  }
)

onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  if (scrollTimer) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
})
</script>

<style scoped>
.stepby-tour-highlight {
  position: fixed;
  border-radius: 4px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  z-index: 9999;
  pointer-events: none;
  transition: all 0.3s ease;
  border: 2px solid var(--el-color-primary, #409eff);
}
.stepby-tour-popover {
  position: fixed;
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-primary, #303133);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 16px;
  z-index: 10000;
  pointer-events: auto;
  transition: all 0.3s ease;
}
.stepby-tour-arrow-top {
  bottom: -16px;
  border-top-color: var(--el-bg-color, #fff);
}
.stepby-tour-arrow-bottom {
  top: -16px;
  border-bottom-color: var(--el-bg-color, #fff);
}
.stepby-tour-arrow-left {
  right: -16px;
  border-left-color: var(--el-bg-color, #fff);
}
.stepby-tour-arrow-right {
  left: -16px;
  border-right-color: var(--el-bg-color, #fff);
}
</style>
