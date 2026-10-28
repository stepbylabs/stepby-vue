<template>
  <!-- W-10 看板「我的待办」：取数失败必须可见（此前整块隐藏 ⇒ 用户看不到"有失败"，
       也看不到待办入口）；首次失败给失败态 + 重试，成功后失败保留数量并提示（b107） -->
  <WidgetCard :title="t('flow.cardMyTodo')" icon="Bell">
    <div v-loading="loading && !loaded" class="flow-todo-wrap">
      <el-empty
        v-if="loadError && !loaded"
        class="widget-load-fail"
        :image-size="60"
        :description="t('dashboard.flowTodoLoadFail')"
      >
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </el-empty>
      <template v-else>
        <div class="flow-todo" role="button" tabindex="0" @click="goFlow" @keyup.enter="goFlow">
          <div class="flow-todo__count" :class="{ 'is-zero': loaded && count === 0 }">
            {{ loaded ? count : '—' }}
          </div>
          <div class="flow-todo__desc">
            {{ !loaded ? t('common.loading') : count > 0 ? t('flow.cardMyTodoDesc') : t('flow.cardTodoEmpty') }}
          </div>
        </div>
        <div v-if="loadError" class="flow-todo__fail">
          <span>{{ t('common.staleDataHint') }}</span>
          <el-button link type="primary" size="small" @click.stop="load">{{ t('common.retry') }}</el-button>
        </div>
      </template>
    </div>
  </WidgetCard>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { flowPendingCount } from '@/api/flow'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useWidgetLoad } from '@/composables/useWidgetLoad'
import WidgetCard from '../WidgetCard.vue'

const { t } = useI18n()
const router = useRouter()

const {
  data: count,
  loading,
  loaded,
  loadError,
  load
} = useWidgetLoad<number>(async () => {
  const res = await flowPendingCount()
  return Number(res.data ?? 0)
}, 0)

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
.flow-todo__fail {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-warning);
}
.widget-load-fail {
  padding: 8px 0;
}
</style>
