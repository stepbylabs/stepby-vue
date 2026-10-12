<template>
  <!--
    TierA-4: 空状态 CTA 组件
    - 基于 el-empty，增加 action slot 和默认行动按钮
    - 用于列表/搜索结果为空时，引导用户创建数据或清空筛选条件
    - 支持权限指令 v-hasPermi 控制按钮可见性
  -->
  <el-empty :description="displayDescription" :image-size="imageSize">
    <template v-if="$slots.action || actionText">
      <slot name="action">
        <el-button v-if="actionText" :type="actionType" :icon="actionIcon" @click="handleAction">
          {{ actionText }}
        </el-button>
        <el-button v-if="resetText && showReset" @click="handleReset">
          {{ resetText }}
        </el-button>
      </slot>
    </template>
  </el-empty>
</template>

<script setup lang="ts">
/**
 * TierA-4: 空状态 CTA 组件
 *
 * Props:
 * - description: 空状态描述文本
 * - imageSize: 图片大小（px）
 * - actionText: 主行动按钮文本（如"新建用户"），为空则不显示
 * - actionType: 主按钮类型（primary/success/warning/danger/info）
 * - actionIcon: 主按钮图标（Element Plus 图标组件名）
 * - resetText: 重置按钮文本（如"重置筛选"），为空则不显示
 * - showReset: 是否显示重置按钮（默认 true）
 *
 * Events:
 * - action: 主按钮点击
 * - reset: 重置按钮点击
 *
 * Slots:
 * - action: 自定义行动按钮区域（覆盖 actionText/resetText）
 */
interface Props {
  description?: string
  imageSize?: number
  actionText?: string
  actionType?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default'
  actionIcon?: string
  resetText?: string
  showReset?: boolean
}

const { t } = useI18n()

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  imageSize: 120,
  actionText: '',
  actionType: 'primary',
  actionIcon: '',
  resetText: '',
  showReset: true
})

// props 默认值通过 computed 实现 i18n 响应式
const displayDescription = computed(() => props.description || t('common.noData'))

const emit = defineEmits<{
  (e: 'action'): void
  (e: 'reset'): void
}>()

function handleAction(): void {
  emit('action')
}

function handleReset(): void {
  emit('reset')
}
</script>
