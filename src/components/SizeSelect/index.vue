<template>
  <div>
    <el-dropdown trigger="click" @command="handleSetSize">
      <!-- 无障碍：下拉触发器为纯图标按钮，必须有可读名称（a11y 全站扫描暴露） -->
      <div class="size-icon--style" :aria-label="t('sizeSelect.triggerAriaLabel')">
        <svg-icon class-name="size-icon" icon-class="size" />
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="item of sizeOptions"
            :key="item.value"
            :disabled="size === item.value"
            :command="item.value"
          >
            {{ item.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import useAppStore from '@/store/modules/app'

const { t } = useI18n()

interface SizeOption {
  label: string
  value: 'large' | 'default' | 'small'
}

const appStore = useAppStore()
const size = computed(() => appStore.size)
const sizeOptions = computed<SizeOption[]>(() => [
  { label: t('sizeSelect.large'), value: 'large' },
  { label: t('sizeSelect.default'), value: 'default' },
  { label: t('sizeSelect.small'), value: 'small' }
])

function handleSetSize(size: 'large' | 'default' | 'small'): void {
  // P1 优化: Element Plus size 变更需要重新挂载组件才能完全生效，直接刷新避免 loading 闪烁
  appStore.setSize(size)
  location.reload()
}
</script>
