<template>
  <div class="header-search">
    <svg-icon class-name="search-icon" icon-class="search" @click.stop="click" />
    <el-dialog
      v-model="show"
      width="600"
      @close="close"
      @opened="onDialogOpened"
      :show-close="false"
      append-to-body
      destroy-on-close
    >
      <el-input
        v-model="search"
        ref="headerSearchSelectRef"
        size="large"
        @input="querySearch"
        prefix-icon="Search"
        :placeholder="t('headerSearch.placeholder')"
        :aria-label="t('headerSearch.placeholder')"
        :maxlength="100"
        clearable
        @keyup.enter="selectActiveResult"
        @keydown.up.prevent="navigateResult('up')"
        @keydown.down.prevent="navigateResult('down')"
      ></el-input>

      <div class="result-count" v-if="search && options.length > 0">
        {{ t('headerSearch.resultCount', { count: options.length }) }}
      </div>

      <div class="result-wrap">
        <el-scrollbar>
          <Transition mode="out-in" name="fade">
            <TransitionGroup v-if="options.length > 0" name="list" tag="div" key="list">
              <div
                class="search-item"
                tabindex="0"
                v-for="(item, index) in options"
                :key="item.path"
                :class="{ 'is-active': index === activeIndex }"
                :style="activeStyle(index)"
                :aria-label="t('headerSearch.menuAriaLabel', { title: item.title.join(' / ') })"
                @mouseenter="activeIndex = index"
                @mouseleave="activeIndex = -1"
                @keydown.enter.prevent="change(item)"
              >
                <div class="left">
                  <svg-icon class="menu-icon" :icon-class="item.icon" />
                </div>
                <div class="search-info" @click="change(item)">
                  <div class="menu-title" v-html="highlightText(item.title.join(' / '))"></div>
                  <div class="menu-path" v-html="highlightText(item.path)"></div>
                </div>
                <svg-icon icon-class="enter" v-show="index === activeIndex" />
              </div>
            </TransitionGroup>
            <div v-else-if="search && options.length === 0" class="empty-state" key="empty">
              <el-icon class="empty-icon"><Search /></el-icon>
              <p class="empty-text">{{ t('headerSearch.noResult', { keyword: search }) }}</p>
              <p class="empty-tip">{{ t('headerSearch.noResultTip') }}</p>
            </div>
          </Transition>
        </el-scrollbar>
      </div>

      <div class="search-footer">
        <span class="shortcut-item">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          {{ t('headerSearch.switchShortcut') }}
        </span>
        <span class="shortcut-item">
          <kbd>↵</kbd>
          {{ t('headerSearch.selectShortcut') }}
        </span>
        <span class="shortcut-item">
          <kbd>Esc</kbd>
          {{ t('headerSearch.closeShortcut') }}
        </span>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import Fuse from 'fuse.js'
import type { InputInstance } from 'element-plus'
import { getNormalPath } from '@/utils/yebot'
import { isHttp } from '@/utils/validate'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'
import i18n from '@/i18n'
import { translateTitle } from '@/composables/useMenuTitle'
import type { AppRouteRecord } from '@/types'

const { t } = useI18n()

interface SearchItem {
  path: string
  title: string[]
  icon: string
  query?: string
}

const search = ref<string>('')
const options = ref<SearchItem[]>([])
const searchPool = ref<SearchItem[]>([])
const activeIndex = ref<number>(-1)
const show = ref<boolean>(false)
const fuse = ref<Fuse<SearchItem> | undefined>(undefined)
const headerSearchSelectRef = useTemplateRef<InputInstance>('headerSearchSelectRef')
const router = useRouter()
const theme = computed(() => useSettingsStore().theme)
const routes = computed(() => usePermissionStore().defaultRoutes)
// 监听 locale 变化，重新生成 searchPool（响应语言切换）
const locale = computed(() => i18n.global.locale.value)

function click(): void {
  show.value = !show.value
  if (show.value) {
    options.value = searchPool.value
  }
}

function onDialogOpened(): void {
  nextTick(() => {
    if (headerSearchSelectRef.value) headerSearchSelectRef.value.focus()
  })
}

function close(): void {
  if (headerSearchSelectRef.value) headerSearchSelectRef.value.blur()
  search.value = ''
  options.value = searchPool.value
  show.value = false
  activeIndex.value = -1
}

function change(val: SearchItem): void {
  const p = val.path
  const query = val.query
  if (isHttp(p)) {
    // http(s):// 路径新窗口打开
    const pindex = p.indexOf('http')
    window.open(p.slice(pindex), '_blank', 'noopener,noreferrer')
  } else {
    if (query) {
      try {
        router.push({ path: p, query: JSON.parse(query) })
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[HeaderSearch] query JSON parse failed:', query, e)
        router.push(p)
      }
    } else {
      router.push(p)
    }
  }
  search.value = ''
  options.value = searchPool.value
  nextTick(() => {
    show.value = false
  })
}

function initFuse(list: SearchItem[]): void {
  fuse.value = new Fuse(list, {
    shouldSort: true,
    threshold: 0.2,
    minMatchCharLength: 1,
    keys: ['title', 'path']
  })
}

function generateRoutes(routes: AppRouteRecord[], basePath = '', prefixTitle: string[] = []): SearchItem[] {
  let res: SearchItem[] = []
  for (const r of routes) {
    if (r.hidden) {
      continue
    }
    const p = r.path.length > 0 && r.path[0] === '/' ? r.path : '/' + r.path
    const data: SearchItem = {
      path: !isHttp(r.path) ? getNormalPath(basePath + p) : r.path,
      title: [...prefixTitle],
      icon: ''
    }
    const meta = r.meta as { title?: string; icon?: string } | undefined
    if (meta && meta.title) {
      // 使用 translateTitle 翻译菜单标题，响应语言切换
      const translatedTitle = translateTitle(r.meta) || meta.title
      data.title = [...data.title, translatedTitle]
      data.icon = meta.icon || ''
      if (r.redirect !== 'noRedirect') {
        res.push(data)
      }
    }
    if (r.query) {
      data.query = r.query
    }
    if (r.children) {
      const tempRoutes = generateRoutes(r.children, data.path, data.title)
      if (tempRoutes.length >= 1) {
        res = [...res, ...tempRoutes]
      }
    }
  }
  return res
}

function querySearch(query: string): void {
  activeIndex.value = -1
  if (query !== '') {
    const q = query.toLowerCase()
    const pathMatches = searchPool.value.filter((item: SearchItem) => item.path.toLowerCase().includes(q))
    const fuseMatches = (fuse.value?.search(query) ?? []).map((item: { item: SearchItem }) => item.item)
    const merged: SearchItem[] = [...pathMatches]
    fuseMatches.forEach((item: SearchItem) => {
      if (!merged.find((m: SearchItem) => m.path === item.path)) {
        merged.push(item)
      }
    })
    options.value = merged
  } else {
    options.value = searchPool.value
  }
}

function activeStyle(index: number): Record<string, string> {
  if (index !== activeIndex.value) return {}
  return {
    'background-color': theme.value,
    color: 'var(--el-color-white)'
  }
}

function navigateResult(direction: 'up' | 'down'): void {
  if (direction === 'up') {
    activeIndex.value = activeIndex.value <= 0 ? options.value.length - 1 : activeIndex.value - 1
  } else if (direction === 'down') {
    activeIndex.value = activeIndex.value >= options.value.length - 1 ? 0 : activeIndex.value + 1
  }
}

function selectActiveResult(): void {
  if (options.value.length > 0 && activeIndex.value >= 0) {
    change(options.value[activeIndex.value])
  }
}

function highlightText(text: string): string {
  if (!text) return ''
  // 先对原始文本进行 HTML 转义，避免通过菜单标题/路径注入 HTML 导致 XSS
  const safeText = escapeHtml(text)
  if (!search.value) return safeText
  const keyword = escapeRegExp(escapeHtml(search.value))
  const reg = new RegExp(`(${keyword})`, 'gi')
  return safeText.replace(reg, '<span class="highlight">$1</span>')
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

onMounted(() => {
  searchPool.value = generateRoutes(routes.value)
})

// 响应语言切换：重新生成 searchPool 和 Fuse 索引
watch(locale, () => {
  searchPool.value = generateRoutes(routes.value)
})

// 响应路由变化：重新生成 searchPool
watch(routes, () => {
  searchPool.value = generateRoutes(routes.value)
})

watch(searchPool, (list: SearchItem[]) => {
  initFuse(list)
})
</script>

<style lang="scss" scoped>
:deep(.el-dialog__header) {
  padding: 6px !important;
}

:deep(.highlight) {
  color: var(--el-color-danger);
  font-weight: 600;
}

:deep(.is-active .highlight) {
  color: var(--el-color-white);
  font-weight: 600;
}

.header-search {
  .search-icon {
    cursor: pointer;
    font-size: 18px;
    vertical-align: middle;
  }
}

.result-count {
  padding: 6px 16px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  strong {
    color: var(--el-color-danger);
    font-weight: 600;
  }
}

.result-wrap {
  height: 280px;
  margin: 4px 0;

  .search-item {
    display: flex;
    height: 48px;
    align-items: center;
    padding-right: 10px;
    border-radius: 4px;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    .left {
      width: 60px;
      text-align: center;
      flex-shrink: 0;

      .menu-icon {
        width: 18px;
        height: 18px;
      }
    }

    .search-info {
      padding-left: 5px;
      margin-top: 10px;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      flex: 1;
      overflow: hidden;

      .menu-title,
      .menu-path {
        height: 20px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .menu-path {
        color: var(--el-text-color-placeholder);
        font-size: 10px;
      }
    }
  }

  .search-item:hover {
    cursor: pointer;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;

    .empty-icon {
      font-size: 42px;
      color: var(--el-text-color-disabled);
      margin-bottom: 14px;
    }

    .empty-text {
      font-size: 14px;
      color: var(--el-text-color-secondary);
      margin: 0 0 6px;

      strong {
        color: var(--el-text-color-regular);
      }
    }

    .empty-tip {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
      margin: 0;
    }
  }
}

.search-footer {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 10px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;

  .shortcut-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font-size: 11px;
    font-family: inherit;
    line-height: 1;
    box-shadow: 0 1px 0 var(--el-border-color-light);
  }
}
</style>
