<template>
  <div class="changelog-container app-container p-4">
    <el-card class="page-header-card mb-4" shadow="never">
      <div class="page-header flex items-center justify-between flex-wrap gap-3">
        <div class="header-left flex items-center gap-3">
          <el-icon class="header-icon text-[32px] text-primary"><Document /></el-icon>
          <div>
            <h2 class="page-title m-0 mb-1 text-xl font-semibold">{{ t('changelog.title') }}</h2>
            <p class="page-desc m-0 text-[13px] text-text-secondary">{{ t('changelog.desc') }}</p>
          </div>
        </div>
        <div class="header-right">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('changelog.searchPlaceholder')"
            :maxlength="50"
            clearable
            class="w-[280px]"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>
    </el-card>

    <el-card class="changelog-card" shadow="never">
      <el-scrollbar height="600px">
        <Transition mode="out-in" name="fade">
          <div v-if="filteredEntries.length > 0" key="list">
            <el-timeline v-auto-animate>
              <el-timeline-item
                v-for="entry in filteredEntries"
                :key="entry.version"
                :timestamp="entry.date"
                placement="top"
                :type="entry === filteredEntries[0] ? 'primary' : 'info'"
                :hollow="entry !== filteredEntries[0]"
              >
                <el-card class="version-card mb-0" shadow="hover">
                  <template #header>
                    <div class="version-header flex items-center gap-2 flex-wrap">
                      <el-tag type="success" effect="dark" size="small">{{ entry.version }}</el-tag>
                      <span class="version-date text-text-secondary text-[13px]">{{ entry.date }}</span>
                      <el-tag v-if="entry === filteredEntries[0]" type="primary" size="small" effect="plain">
                        {{ t('changelog.latest') }}
                      </el-tag>
                    </div>
                  </template>
                  <ul class="version-items list-none p-0 m-0">
                    <li
                      v-for="item in entry.items"
                      :key="item"
                      class="version-item relative py-1.5 pl-4 text-[13px] leading-[1.6] text-text-primary"
                      v-html="highlightSearch(item)"
                    ></li>
                  </ul>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </div>
          <el-empty v-else :description="t('changelog.noResult')" :image-size="100" key="empty" />
        </Transition>
      </el-scrollbar>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Document, Search } from '@element-plus/icons-vue'
import { changelog } from '@/data/changelog'
import { escapeHtml } from '@/utils'
import { vAutoAnimate } from '@formkit/auto-animate/vue'

const { t } = useI18n()

const searchKeyword = ref('')

const filteredEntries = computed(() => {
  if (!searchKeyword.value.trim()) return changelog
  const kw = searchKeyword.value.trim().toLowerCase()
  return changelog
    .map((entry) => {
      const matched = entry.items.filter((item) => item.toLowerCase().includes(kw))
      if (matched.length === 0) return null
      return { ...entry, items: matched }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
})

function highlightSearch(text: string): string {
  if (!searchKeyword.value.trim()) return escapeHtml(text)
  const kw = escapeHtml(searchKeyword.value.trim())
  const escaped = escapeRegex(kw)
  return escapeHtml(text).replace(
    new RegExp(escaped, 'gi'),
    (match) => `<mark class="changelog-highlight">${match}</mark>`
  )
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
</script>

<style lang="scss" scoped>
.changelog-card {
  :deep(.el-card__body) {
    padding: 0;
  }
}

.version-card {
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;

  &:hover {
    transform: translateY(-2px);
  }

  .version-items {
    .version-item {
      transition: color 0.2s ease;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 14px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--el-color-primary-light-5);
        transition: background-color 0.2s ease;
      }
    }
  }
}

:deep(.changelog-highlight) {
  background-color: var(--el-color-warning-light-7);
  color: var(--el-color-warning-dark-2);
  padding: 0 2px;
  border-radius: 2px;
}
</style>
