<template>
  <div class="help-container app-container p-4">
    <!-- 页面头部 -->
    <el-card class="page-header-card mb-4" shadow="never">
      <div class="page-header flex justify-between items-center flex-wrap gap-3">
        <div class="header-left flex items-center gap-4">
          <el-icon class="header-icon text-4xl text-primary"><QuestionFilled /></el-icon>
          <div>
            <h2 class="page-title m-0 mb-1 text-xl font-semibold text-text-primary">{{ t('help.title') }}</h2>
            <p class="page-desc m-0 text-[13px] text-text-secondary">{{ t('help.desc') }}</p>
          </div>
        </div>
        <div class="header-right">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('help.searchPlaceholder')"
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

    <!-- 主体内容：左侧目录 + 右侧内容 -->
    <el-row :gutter="16">
      <el-col :xs="24" :sm="8" :md="6" :lg="5">
        <el-card class="toc-card mb-4 sticky top-4" shadow="never">
          <template #header>
            <span class="toc-title font-semibold inline-flex items-center gap-1.5">
              <el-icon><Reading /></el-icon>
              {{ t('help.toc') }}
            </span>
          </template>
          <el-scrollbar height="480px">
            <div v-if="filteredSections.length > 0">
              <div
                v-for="(section, idx) in filteredSections"
                :key="section.id"
                class="toc-item flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer text-[13px]"
                :class="{ active: activeSection === section.id }"
                @click="scrollToSection(section.id)"
              >
                <span
                  class="toc-idx inline-block w-5 h-5 leading-5 text-center rounded text-[11px] text-text-secondary shrink-0"
                >
                  {{ Number(idx) + 1 }}
                </span>
                <span class="toc-text flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {{ t(`help.sections.${section.id}.title`) }}
                </span>
              </div>
            </div>
            <el-empty v-else :description="t('help.noResult')" :image-size="80" />
          </el-scrollbar>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="16" :md="18" :lg="19">
        <el-card class="content-card" shadow="never">
          <el-scrollbar height="540px" ref="scrollbarRef">
            <div class="help-content py-2 px-4">
              <!-- 快速上手 -->
              <section id="quickStart" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><Promotion /></el-icon>
                  {{ t('help.sections.quickStart.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <p class="m-0 mb-3">{{ t('help.sections.quickStart.intro') }}</p>
                  <ol class="step-list pl-5 m-0">
                    <li v-for="i in 4" :key="i" class="mb-3">
                      <strong class="text-text-primary mr-2">{{ t(`help.sections.quickStart.step${i}Title`) }}</strong>
                      <span>{{ t(`help.sections.quickStart.step${i}Desc`) }}</span>
                    </li>
                  </ol>
                </div>
              </section>

              <!-- 权限说明 -->
              <section id="permissions" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><Lock /></el-icon>
                  {{ t('help.sections.permissions.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <p class="m-0 mb-3">{{ t('help.sections.permissions.intro') }}</p>
                  <el-descriptions :column="1" border>
                    <el-descriptions-item
                      v-for="role in permissionRoles"
                      :key="role.name"
                      :label="t(`help.sections.permissions.roles.${role.name}`)"
                    >
                      {{ t(`help.sections.permissions.roleDesc.${role.name}`) }}
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
              </section>

              <!-- 快捷键 -->
              <section id="shortcuts" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><Key /></el-icon>
                  {{ t('help.sections.shortcuts.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <p class="m-0 mb-3">{{ t('help.sections.shortcuts.intro') }}</p>
                  <div class="shortcut-grid grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 my-3">
                    <div
                      v-for="item in commonShortcuts"
                      :key="item.action"
                      class="shortcut-block p-3 rounded-md flex justify-between items-center"
                    >
                      <div class="shortcut-action text-[13px] font-medium text-text-primary">
                        {{ t(`shortcuts.actions.${item.action}`) }}
                      </div>
                      <div class="shortcut-keys flex gap-1">
                        <kbd v-for="k in item.keys" :key="k" class="key-cap">{{ k }}</kbd>
                      </div>
                    </div>
                  </div>
                  <el-button type="primary" text @click="goTo('/tool/shortcuts')">
                    {{ t('help.sections.shortcuts.viewAll') }} →
                  </el-button>
                </div>
              </section>

              <!-- 个性化设置 -->
              <section id="customization" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><MagicStick /></el-icon>
                  {{ t('help.sections.customization.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <p class="m-0 mb-3">{{ t('help.sections.customization.intro') }}</p>
                  <ul class="feature-list list-none p-0 m-0">
                    <li v-for="i in 5" :key="i" class="flex items-start gap-2 py-2 text-[13px]">
                      <el-icon class="feature-icon text-success text-base mt-0.5 shrink-0"><Check /></el-icon>
                      <strong class="text-text-primary mr-1">
                        {{ t(`help.sections.customization.feature${i}Title`) }}
                      </strong>
                      <span>{{ t(`help.sections.customization.feature${i}Desc`) }}</span>
                    </li>
                  </ul>
                </div>
              </section>

              <!-- 数据安全 -->
              <section id="security" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><Lock /></el-icon>
                  {{ t('help.sections.security.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <p class="m-0 mb-3">{{ t('help.sections.security.intro') }}</p>
                  <ul class="feature-list list-none p-0 m-0">
                    <li v-for="i in 4" :key="i" class="flex items-start gap-2 py-2 text-[13px]">
                      <el-icon class="feature-icon text-success text-base mt-0.5 shrink-0"><Check /></el-icon>
                      <strong class="text-text-primary mr-1">{{ t(`help.sections.security.feature${i}Title`) }}</strong>
                      <span>{{ t(`help.sections.security.feature${i}Desc`) }}</span>
                    </li>
                  </ul>
                </div>
              </section>

              <!-- FAQ -->
              <section id="faq" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><ChatLineSquare /></el-icon>
                  {{ t('help.sections.faq.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <el-collapse v-model="activeFaq">
                    <el-collapse-item v-for="i in 6" :key="i" :title="t(`help.sections.faq.q${i}`)" :name="String(i)">
                      <p class="faq-answer m-0 text-text-regular text-[13px] leading-[1.7]">
                        {{ t(`help.sections.faq.a${i}`) }}
                      </p>
                    </el-collapse-item>
                  </el-collapse>
                </div>
              </section>

              <!-- 联系方式 -->
              <section id="contact" class="help-section mb-8 scroll-mt-4">
                <h3 class="section-title flex items-center gap-2 text-lg font-semibold text-text-primary pb-2 m-0 mb-4">
                  <el-icon><Message /></el-icon>
                  {{ t('help.sections.contact.title') }}
                </h3>
                <div class="section-body pl-2 text-sm leading-[1.7] text-text-regular">
                  <p class="m-0 mb-3">{{ t('help.sections.contact.intro') }}</p>
                  <el-row :gutter="16">
                    <el-col :xs="24" :sm="12" :md="8" v-for="channel in contactChannels" :key="channel.name">
                      <el-card
                        class="contact-card cursor-pointer mb-3 transition-all duration-300"
                        shadow="hover"
                        @click="openContact(channel.url)"
                      >
                        <el-icon class="contact-icon text-[32px] text-primary shrink-0">
                          <component :is="channel.icon" />
                        </el-icon>
                        <div class="contact-info flex-1 min-w-0">
                          <div class="contact-name text-sm font-semibold text-text-primary mb-0.5">
                            {{ t(`help.sections.contact.${channel.name}`) }}
                          </div>
                          <div
                            class="contact-desc text-xs text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap"
                          >
                            {{ t(`help.sections.contact.${channel.name}Desc`) }}
                          </div>
                        </div>
                      </el-card>
                    </el-col>
                  </el-row>
                </div>
              </section>
            </div>
          </el-scrollbar>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="Help">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  QuestionFilled,
  Search,
  Reading,
  Promotion,
  Lock,
  Key,
  MagicStick,
  ChatLineSquare,
  Message,
  Check,
  Link
} from '@element-plus/icons-vue'

const { t } = useI18n()
const router = useRouter()

const scrollbarRef = ref<InstanceType<(typeof import('element-plus'))['ElScrollbar']> | null>(null)
const searchKeyword = ref('')
const activeSection = ref('quickStart')
const activeFaq = ref<string[]>([])

const allSections = [
  { id: 'quickStart' },
  { id: 'permissions' },
  { id: 'shortcuts' },
  { id: 'customization' },
  { id: 'security' },
  { id: 'faq' },
  { id: 'contact' }
]

const filteredSections = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return allSections
  return allSections.filter((s) => t(`help.sections.${s.id}.title`).toLowerCase().includes(keyword))
})

// 搜索结果变化时，自动选中并滚动到第一个匹配项
watch(filteredSections, (val: typeof allSections) => {
  if (val.length > 0 && !val.find((s: { id: string }) => s.id === activeSection.value)) {
    nextTick(() => scrollToSection(val[0].id))
  }
})

const permissionRoles = [{ name: 'admin' }, { name: 'manager' }, { name: 'common' }]

const commonShortcuts = [
  { action: 'search', keys: ['Ctrl', 'K'] },
  { action: 'help', keys: ['?'] },
  { action: 'fullscreen', keys: ['Ctrl', 'Shift', 'F'] },
  { action: 'lockScreen', keys: ['Ctrl', 'Shift', 'L'] },
  { action: 'toggleDark', keys: ['Ctrl', 'Shift', 'D'] },
  { action: 'settings', keys: ['Ctrl', 'Shift', 'S'] }
]

const contactChannels = [
  { name: 'github', icon: Link, url: 'https://github.com/stepby/stepby' },
  { name: 'website', icon: Promotion, url: 'https://stepby.tzkj.net' },
  { name: 'email', icon: Message, url: 'mailto:stepby@tzkj.net' }
]

function scrollToSection(id: string): void {
  activeSection.value = id
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function goTo(path: string): void {
  router.push(path).catch(() => {})
}

function openContact(url: string): void {
  if (url.startsWith('http') || url.startsWith('mailto')) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
</script>

<style lang="scss" scoped>
.help-container {
  .toc-card {
    .toc-title {
      .el-icon {
        color: var(--el-color-primary);
      }
    }

    .toc-item {
      transition: background 0.2s;

      &:hover {
        background: var(--el-fill-color-light, #f5f7fa);
      }

      &.active {
        background: var(--el-color-primary-light-9, #ecf5ff);
        color: var(--el-color-primary);
        font-weight: 500;
      }

      .toc-idx {
        background: var(--el-fill-color, #f0f2f5);
      }

      &.active .toc-idx {
        background: var(--el-color-primary);
        color: var(--el-color-white);
      }
    }
  }

  .content-card {
    .help-section {
      &:last-child {
        margin-bottom: 0;
      }
    }

    .section-title {
      border-bottom: 2px solid var(--el-color-primary-light-7, #c6e2ff);

      .el-icon {
        color: var(--el-color-primary);
        font-size: 22px;
      }
    }

    .shortcut-block {
      border: 1px solid var(--el-border-color-lighter, #ebeef5);
      background: var(--el-fill-color-blank, #fff);
    }

    .key-cap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 22px;
      padding: 0 4px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color, #dcdfe6);
      border-bottom-width: 2px;
      border-radius: 4px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 11px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .contact-card {
      &:hover {
        transform: translateY(-2px);
        border-color: var(--el-color-primary);
      }

      :deep(.el-card__body) {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
      }
    }
  }
}

// 暗色模式适配
:global(html.dark) .page-title,
:global(html.dark) .section-title,
:global(html.dark) .contact-name,
:global(html.dark) .shortcut-action,
:global(html.dark) .feature-list strong {
  color: var(--el-text-color-primary);
}

:global(html.dark) .section-body,
:global(html.dark) .faq-answer {
  color: var(--el-text-color-regular);
}

:global(html.dark) .toc-item.active {
  background: var(--el-color-primary-dark-2, #1f3a5f);
}

:global(html.dark) .key-cap,
:global(html.dark) .shortcut-block {
  background: var(--el-bg-color, #141414);
  border-color: var(--el-border-color-dark, #4c4d4f);
  color: var(--el-text-color-primary);
}

:global(html.dark) .page-desc,
:global(html.dark) .contact-desc,
:global(html.dark) .toc-item .toc-idx {
  color: var(--el-text-color-secondary);
}

// 响应式适配
@media screen and (max-width: 768px) {
  .help-container {
    .toc-card {
      position: static;
    }

    .shortcut-grid {
      grid-template-columns: 1fr;
    }
  }
}
</style>
