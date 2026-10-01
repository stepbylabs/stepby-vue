/**
 * 动效预设 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：封装 @vueuse/motion 常用动效预设，统一管理入场/交互动效
 * 配合 v-motion 指令使用，提供声明式动效
 *
 * 用法：
 *   import { useMotionPresets } from '@/composables/useMotion'
 *   const { fadeInUp, staggerChildren, slideInRight } = useMotionPresets()
 *   <div v-motion="fadeInUp">...</div>
 *
 * 注意：本 composable 返回的是 v-motion 指令的可绑定对象
 */
import type { MotionVariants } from '@vueuse/motion'

type PresetVariants = MotionVariants<'initial' | 'enter'>
type StaggerVariants = MotionVariants<'initial' | 'enter'>
type TapVariants = MotionVariants<'initial' | 'tapped'>

export function useMotionPresets() {
  /** 淡入+上移（通用入场） */
  const fadeInUp: PresetVariants = {
    initial: { opacity: 0, y: 12 },
    enter: { opacity: 1, y: 0, transition: { duration: 300, ease: 'easeOut' } }
  }

  /** 淡入+缩放（卡片/弹窗内容） */
  const fadeInScale: PresetVariants = {
    initial: { opacity: 0, scale: 0.96 },
    enter: { opacity: 1, scale: 1, transition: { duration: 250, ease: 'easeOut' } }
  }

  /** 从右滑入（右侧面板/抽屉内容） */
  const slideInRight: PresetVariants = {
    initial: { opacity: 0, x: 20 },
    enter: { opacity: 1, x: 0, transition: { duration: 300, ease: 'easeOut' } }
  }

  /** 从下淡入（底部加载更多/通知） */
  const fadeInUpSmall: PresetVariants = {
    initial: { opacity: 0, y: 8 },
    enter: { opacity: 1, y: 0, transition: { duration: 200, ease: 'easeOut' } }
  }

  /**
   * 错峰入场：配合 v-for 使用
   * @param index 列表索引
   * @param base 每项延迟（毫秒），默认 50ms
   * @param maxDelay 最大延迟（毫秒），默认 500ms（避免长列表卡顿）
   */
  function staggerChildren(index: number, base = 50, maxDelay = 500): StaggerVariants {
    const delay = Math.min(index * base, maxDelay)
    return {
      initial: { opacity: 0, y: 16 },
      enter: {
        opacity: 1,
        y: 0,
        transition: { duration: 300, ease: 'easeOut', delay }
      }
    }
  }

  /** 按钮点击反馈（scale 收缩） */
  const tapFeedback: TapVariants = {
    initial: { scale: 1 },
    tapped: { scale: 0.95, transition: { duration: 100 } }
  }

  return {
    fadeInUp,
    fadeInScale,
    slideInRight,
    fadeInUpSmall,
    staggerChildren,
    tapFeedback
  }
}

/**
 * auto-animate 指令便捷导入
 *
 * 用法：
 *   <div v-auto-animate> <div v-for="item in list" :key="item.id">...</div> </div>
 */
export { vAutoAnimate } from '@formkit/auto-animate/vue'
