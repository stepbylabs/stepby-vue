<template>
  <!-- W-10 看板「我的待办」：仅数量加载成功时显示，失败静默隐藏 -->
  <WidgetCard v-if="loaded" :title="t('flow.cardMyTodo')" icon="Bell">
    <div class="flow-todo" role="button" tabindex="0" @click="goFlow" @keyup.enter="goFlow">
      <div class="flow-todo__count" :class="{ 'is-zero': count === 0 }">{{ count }}</div>
      <div class="flow-todo__desc">
        {{ count > 0 ? t('flow.cardMyTodoDesc') : t('flow.cardTodoEmpty') }}
      </div>
    </div>
  </WidgetCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { flowPendingCount } from '@/api/flow'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import WidgetCard from '../WidgetCard.vue'

const { t } = useI18n()
const router = useRouter()

const loaded = ref(false)
const count = ref(0)

async function load() {
  try {
    const res = await flowPendingCount()
    count.value = Number(res.data ?? 0)
    loaded.value = true
  } catch {
    // 加载失败静默隐藏，不打扰用户（不改变已展示状态）
  }
}

function goFlow() {
  // 审批中心页面路由由后端菜单动态生成（菜单 3600 flow / 3601 todo），实际路径为 /system/flow/todo
  router.push('/system/flow/todo')
}

onMounted(load)
useAutoRefresh(load)
</script>

<style lang="scss" scoped>
.flow-todo {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 0;
  cursor: pointer;
}
.flow-todo__count {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--el-color-warning);
}
.flow-todo__count.is-zero {
  color: var(--el-text-color-secondary);
}
.flow-todo__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
