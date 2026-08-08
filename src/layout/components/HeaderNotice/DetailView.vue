<template>
  <el-drawer
    v-model="visible"
    :title="t('layout.headerNotice.detailTitle')"
    direction="rtl"
    size="50%"
    append-to-body
    :before-close="handleClose"
    class="notice-detail-drawer"
  >
    <div v-loading="loading" class="notice-detail-drawer__body">
      <Transition mode="out-in" name="fade">
        <el-empty v-if="!detail" key="empty" :description="t('common.noData')" :image-size="60" />
        <div v-else key="page" class="notice-page">
          <div class="notice-type-wrap">
            <Transition mode="out-in" name="fade">
              <span v-if="detail.noticeType === '1'" key="t1" class="notice-type-tag type-notify">
                <el-icon><Bell /></el-icon>
                {{ t('noticeCenter.typeNotice') }}
              </span>
              <span v-else-if="detail.noticeType === '2'" key="t2" class="notice-type-tag type-announce">
                <el-icon><Message /></el-icon>
                {{ t('noticeCenter.typeAnnouncement') }}
              </span>
              <span v-else key="t3" class="notice-type-tag type-notify">
                <el-icon><Document /></el-icon>
                {{ t('noticeCenter.typeMessage') }}
              </span>
            </Transition>
          </div>

          <h1 class="notice-title">{{ detail.noticeTitle }}</h1>

          <div class="notice-meta flex flex-wrap items-center gap-4 mb-7">
            <span class="meta-item">
              <el-icon><User /></el-icon>
              <span>{{ detail.createBy || '—' }}</span>
            </span>
            <span class="meta-item">
              <el-icon><Clock /></el-icon>
              <span>{{ detail.createTime || '—' }}</span>
            </span>
            <span class="meta-item">
              <span
                class="status-dot inline-block rounded-full mr-1"
                :class="isStatusNormal ? 'bg-success' : 'bg-danger'"
              ></span>
              <span>{{ isStatusNormal ? t('common.normal') : t('layout.headerNotice.statusClosed') }}</span>
            </span>
          </div>

          <div class="notice-divider flex items-center gap-3 mb-6">
            <span class="notice-divider-dot"></span>
            <span class="notice-divider-dot"></span>
            <span class="notice-divider-dot"></span>
          </div>

          <div class="notice-body">
            <Transition mode="out-in" name="fade">
              <div v-if="hasContent" key="content" class="notice-content" v-html="safeContent" />
              <div v-else key="empty" class="notice-empty notice-empty--inner">
                <el-icon><Document /></el-icon>
                {{ t('noticeCenter.noContent') }}
              </div>
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { getNotice } from '@/api/system/notice'
import type { SysNotice } from '@/types/api/system/notice'
import { sanitizeHtml } from '@/utils/index'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const visible = ref<boolean>(false)
const loading = ref<boolean>(false)
const detail: Ref<SysNotice | null> = ref<SysNotice | null>(null)

const isStatusNormal = computed<boolean>(() => {
  const status = detail.value && detail.value.status
  return status === '0' || status === 0
})

const hasContent = computed<boolean>(() => {
  const content = detail.value && detail.value.noticeContent
  return content != null && String(content).trim() !== ''
})

// HTML 白名单净化已抽离至 @/utils/index.ts 的 sanitizeHtml，避免重复实现

const safeContent = computed<string>(() => {
  const content = detail.value && detail.value.noticeContent
  return sanitizeHtml(content ? String(content) : '')
})

function open(payload: SysNotice | number | string) {
  let id: number | string | undefined
  let preset: SysNotice | null = null
  if (payload != null && typeof payload === 'object') {
    id = payload.noticeId
    if (payload.noticeContent != null) {
      preset = payload
    }
  } else {
    id = payload
  }
  visible.value = true
  if (preset) {
    detail.value = preset
    return
  }
  if (id == null || id === '') {
    detail.value = null
    return
  }
  loading.value = true
  detail.value = null
  getNotice(id)
    .then((res) => {
      detail.value = res.data
    })
    .catch(() => {
      detail.value = null
    })
    .finally(() => {
      loading.value = false
    })
}

function handleClose() {
  visible.value = false
  detail.value = null
  loading.value = false
}

defineExpose({
  open
})
</script>

<style lang="scss" scoped>
.notice-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 8px 20px;
}

.notice-type-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 12px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 14px;
}

.type-notify {
  background: var(--notice-tag-notify-bg, #fff8e6);
  color: var(--notice-tag-notify-color, #b7791f);
  border-left: 3px solid var(--notice-tag-notify-border, #d97706);
}

.type-announce {
  background: var(--notice-tag-announce-bg, #e8f5e9);
  color: var(--notice-tag-announce-color, #276749);
  border-left: 3px solid var(--notice-tag-announce-border, #38a169);
}

.notice-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--notice-title-color, #1a202c);
  line-height: 1.45;
  margin: 0 0 16px;
  letter-spacing: -0.2px;
}

.notice-meta {
  padding: 12px 0;
  border-top: 1px solid var(--notice-border-color, #e9ecef);
  border-bottom: 1px solid var(--notice-border-color, #e9ecef);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--notice-meta-color, #718096);
}

.meta-item .el-icon {
  font-size: 12px;
  color: var(--notice-meta-icon-color, #a0aec0);
}

.status-dot {
  width: 7px;
  height: 7px;
}

.notice-divider::before,
.notice-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--notice-divider-gradient, linear-gradient(to right, transparent, #dee2e6, transparent));
}

.notice-divider-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--notice-divider-dot-color, #cbd5e0);
}

.notice-body {
  background: var(--notice-body-bg, #fff);
  border-radius: 6px;
  padding: 28px 32px;
  box-shadow: var(--notice-body-shadow, 0 1px 4px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04));
  min-height: 120px;
}

.notice-content {
  font-size: 14px;
  line-height: 1.85;
  color: var(--notice-content-color, #2d3748);
  word-break: break-word;
}

.notice-content :deep(p) {
  margin: 0 0 1em;
}

.notice-content :deep(h1),
.notice-content :deep(h2),
.notice-content :deep(h3) {
  font-weight: 700;
  color: var(--notice-title-color, #1a202c);
  margin: 1.4em 0 0.6em;
}

.notice-content :deep(h1) {
  font-size: 18px;
}
.notice-content :deep(h2) {
  font-size: 16px;
}
.notice-content :deep(h3) {
  font-size: 14px;
}

.notice-content :deep(a) {
  color: var(--el-color-primary, #3182ce);
  text-decoration: underline;
}
.notice-content :deep(a:hover) {
  color: var(--el-color-primary, #2b6cb0);
  filter: brightness(0.85);
}

.notice-content :deep(img) {
  max-width: 100%;
  border-radius: 4px;
  margin: 8px 0;
}

.notice-content :deep(ul),
.notice-content :deep(ol) {
  padding-left: 20px;
  margin: 0 0 1em;
}
.notice-content :deep(li) {
  margin-bottom: 4px;
}

.notice-content :deep(blockquote) {
  border-left: 3px solid var(--notice-blockquote-border, #cbd5e0);
  margin: 1em 0;
  padding: 6px 16px;
  color: var(--notice-meta-color, #718096);
  background: var(--notice-blockquote-bg, #f7fafc);
}

.notice-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 13px;
}
.notice-content :deep(table th),
.notice-content :deep(table td) {
  border: 1px solid var(--notice-table-border, #e2e8f0);
  padding: 7px 12px;
}
.notice-content :deep(table th) {
  background: var(--notice-table-header-bg, #f7fafc);
  font-weight: 600;
}

.notice-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--notice-meta-icon-color, #a0aec0);
  font-size: 13px;
}
.notice-empty .el-icon {
  font-size: 28px;
  display: inline-flex;
  margin-bottom: 10px;
}
.notice-empty--inner {
  padding: 32px 0;
}

.notice-detail-drawer__body {
  height: 100%;
  overflow: auto;
  padding: 10px 16px 22px;
}
</style>

<style lang="scss">
.notice-detail-drawer {
  .el-drawer__header {
    margin-bottom: 0;
    padding: 16px 20px;
    border-bottom: 1px solid var(--notice-border-color, #ebeef5);
    font-size: 16px;
    font-weight: 600;
    color: var(--notice-title-color, #303133);
  }

  .el-drawer__body {
    background: var(--notice-drawer-body-bg, #f5f6f8);
    padding: 0;
  }
}
</style>
