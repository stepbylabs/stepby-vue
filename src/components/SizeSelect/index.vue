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
import { useWindowSize } from '@vueuse/core'
import useAppStore from '@/store/modules/app'
import { resolveElementSize, type ElementSize } from '@/utils/elementSize'

const { t } = useI18n()

interface SizeOption {
  label: string
  value: ElementSize
}

const appStore = useAppStore()
const { width: winWidth } = useWindowSize()
// 与 App.vue 喂给 el-config-provider 的是**同一个**解析结果：勾选态不再自己推断
const size = computed(() => resolveElementSize(appStore.size, winWidth.value < 768))
const sizeOptions = computed<SizeOption[]>(() => [
  { label: t('sizeSelect.large'), value: 'large' },
  { label: t('sizeSelect.default'), value: 'default' },
  { label: t('sizeSelect.small'), value: 'small' }
])

function handleSetSize(size: ElementSize): void {
  // b113：store 是单一事实源，App.vue 的 size 是响应式 computed ⇒ 即时生效。
  // 原先这里 `location.reload()` 是为了让非响应式的 cookie 读取重新跑一遍，
  // 代价是整页重载（丢弹窗/筛选/滚动位置，重跑认证与配置链）。
  appStore.setSize(size)
}
</script>
