<template>
  <div class="app-container about-container p-4">
    <el-row :gutter="20">
      <!-- 左侧：项目卡片 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="hover" class="about-card rounded-lg mb-4">
          <template #header>
            <div class="card-header flex items-center font-semibold">
              <svg-icon icon-class="info" class="header-icon mr-2 text-lg" />
              <span>{{ t('about.projectInfo') }}</span>
            </div>
          </template>
          <div class="project-info flex items-center py-2">
            <div
              class="project-logo w-20 h-20 rounded-2xl flex items-center justify-center mr-5 shrink-0 overflow-hidden"
            >
              <img :src="logo" alt="Stepby" class="w-full h-full object-cover" />
            </div>
            <div class="project-detail flex-1">
              <h2 class="project-name m-0 mb-2 text-xl font-semibold text-text-primary">
                {{ t('about.projectName') }}
              </h2>
              <p class="project-desc m-0 mb-3 text-[13px] text-text-secondary leading-[1.5]">
                {{ t('about.projectDesc') }}
              </p>
              <div class="project-meta flex gap-2 flex-wrap">
                <el-tag type="primary" size="small">v{{ version }}</el-tag>
                <el-tag type="success" size="small">MIT License</el-tag>
                <el-tag type="info" size="small">{{ buildMode }}</el-tag>
              </div>
            </div>
          </div>

          <el-divider />

          <el-descriptions :column="2" border>
            <el-descriptions-item :label="t('about.frontendVersion')">
              <el-link type="primary" underline="never">{{ version }}</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.backendVersion')">
              <el-link type="primary" underline="never">0.1.0</el-link>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.buildMode')">
              <el-tag :type="buildMode === 'production' ? 'success' : 'warning'" size="small">{{ buildMode }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.buildTime')">
              {{ buildTime || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.vueVersion')">
              {{ vueVersion }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.epVersion')">
              {{ epVersion }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.viteVersion')">
              {{ viteVersion }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('about.nodeVersion')">
              {{ nodeVersion }}
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <div class="action-buttons flex gap-2 flex-wrap">
            <el-button type="primary" icon="Link" @click="openLink('https://github.com/stepby/stepby')">
              {{ t('about.repoButton') }}
            </el-button>
            <el-button icon="Document" @click="openLink('/swagger-ui')">{{ t('about.apiButton') }}</el-button>
            <el-button icon="Refresh" @click="refreshInfo">{{ t('about.refreshButton') }}</el-button>
            <el-button icon="CopyDocument" @click="copyInfo">{{ t('about.copyButton') }}</el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：技术栈 + 依赖 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="hover" class="about-card rounded-lg mb-4">
          <template #header>
            <div class="card-header flex items-center font-semibold">
              <svg-icon icon-class="component" class="header-icon mr-2 text-lg" />
              <span>{{ t('about.techStack') }}</span>
            </div>
          </template>
          <div class="tech-stack grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
            <div
              v-for="tech in techStack"
              :key="tech.name"
              class="tech-item flex justify-between items-center py-2 px-3 rounded-md transition-all duration-200"
            >
              <div class="tech-name flex items-center gap-1.5 text-[13px] text-text-regular">
                <svg-icon :icon-class="tech.icon" v-if="tech.icon" />
                <span>{{ tech.name }}</span>
              </div>
              <el-tag :type="tech.tagType" size="small">{{ tech.version }}</el-tag>
            </div>
          </div>
        </el-card>

        <el-card shadow="hover" class="about-card rounded-lg mb-4">
          <template #header>
            <div class="card-header flex items-center font-semibold">
              <svg-icon icon-class="list" class="header-icon mr-2 text-lg" />
              <span>{{ t('about.mainDeps') }}</span>
            </div>
          </template>
          <el-tabs v-model="activeTab" class="deps-tabs -mt-2">
            <el-tab-pane :label="t('about.frontendTab')" name="frontend">
              <div class="deps-list grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
                <div
                  v-for="dep in frontendDeps"
                  :key="dep.name"
                  class="dep-item flex justify-between items-center py-1.5 px-2.5 rounded text-xs transition-colors duration-200"
                >
                  <span class="dep-name text-text-regular">{{ dep.name }}</span>
                  <span class="dep-version text-success">{{ dep.version }}</span>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane :label="t('about.backendTab')" name="backend">
              <div class="deps-list grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
                <div
                  v-for="dep in backendDeps"
                  :key="dep.name"
                  class="dep-item flex justify-between items-center py-1.5 px-2.5 rounded text-xs transition-colors duration-200"
                >
                  <span class="dep-name text-text-regular">{{ dep.name }}</span>
                  <span class="dep-version text-success">{{ dep.version }}</span>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>

        <el-card shadow="hover" class="about-card rounded-lg mb-4">
          <template #header>
            <div class="card-header flex items-center font-semibold">
              <svg-icon icon-class="bug" class="header-icon mr-2 text-lg" />
              <span>{{ t('about.features') }}</span>
            </div>
          </template>
          <div class="features-list grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            <div
              v-for="feature in systemFeatures"
              :key="feature"
              class="feature-item flex items-center gap-1.5 text-[13px] text-text-regular py-1"
            >
              <el-icon class="feature-icon text-success text-sm shrink-0"><Check /></el-icon>
              <span>{{ feature }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="About">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import logo from '@/assets/logo/logo.svg'
import { errorHub } from '@/utils/errorHub'

const { t } = useI18n()

// 项目元信息（从 Vite 环境变量读取,回退到 package.json）
const version = ref(__APP_VERSION__ || '3.9.2')
const buildMode = ref(import.meta.env.MODE === 'production' ? 'production' : 'development')
const buildTime = ref(__BUILD_TIME__ || '')
const vueVersion = ref('3.5.40')
const epVersion = ref('2.14.3')
const viteVersion = ref('8.1.5')
const nodeVersion = ref('18+')

const activeTab = ref('frontend')

// 技术栈（computed 以响应语言切换，名称走 i18n key）
const techStack = computed(() => [
  { name: t('about.techStackItem.rust'), version: '1.80+', icon: 'rust', tagType: 'primary' as const },
  { name: t('about.techStackItem.axum'), version: '0.8', icon: '', tagType: 'success' as const },
  { name: t('about.techStackItem.seaorm'), version: '1.1', icon: '', tagType: 'success' as const },
  { name: t('about.techStackItem.vue3'), version: '3.5.40', icon: 'vue', tagType: 'success' as const },
  { name: t('about.techStackItem.ep'), version: '2.14.3', icon: '', tagType: 'primary' as const },
  { name: t('about.techStackItem.ts'), version: '5.9.3', icon: '', tagType: 'warning' as const },
  { name: t('about.techStackItem.vite'), version: '8.1.5', icon: '', tagType: 'primary' as const },
  { name: t('about.techStackItem.tailwind'), version: '3.x', icon: '', tagType: 'info' as const },
  { name: t('about.techStackItem.pinia'), version: '4.0.2', icon: '', tagType: 'info' as const },
  { name: t('about.techStackItem.redis'), version: '7.x', icon: '', tagType: 'danger' as const },
  { name: t('about.techStackItem.db'), version: 'multi-db', icon: 'db', tagType: 'info' as const }
])

// 前端主要依赖
const frontendDeps = ref([
  { name: 'vue', version: '3.5.40' },
  { name: 'vue-router', version: '5.2.0' },
  { name: 'pinia', version: '4.0.2' },
  { name: 'element-plus', version: '2.14.3' },
  { name: 'axios', version: '1.18.1' },
  { name: 'echarts', version: '6.1.0' },
  { name: '@vueuse/core', version: '14.3.0' },
  { name: 'vue-i18n', version: '10.0.8' },
  { name: 'js-cookie', version: '3.0.8' },
  { name: 'nprogress', version: '0.2.0' },
  { name: 'fuse.js', version: '7.5.0' },
  { name: 'monaco-editor', version: '0.55.1' }
])

// 后端主要依赖
const backendDeps = ref([
  { name: 'axum', version: '0.8' },
  { name: 'sea-orm', version: '1.1' },
  { name: 'tokio', version: '1.x' },
  { name: 'tower-http', version: '0.7' },
  { name: 'serde / serde_json', version: '1.x' },
  { name: 'redis', version: '0.27' },
  { name: 'jsonwebtoken', version: '9.x' },
  { name: 'argon2', version: '0.5' },
  { name: 'rust-embed', version: '8.x' },
  { name: 'tracing', version: '0.1' },
  { name: 'sysinfo', version: '0.32' },
  { name: 'maxminddb', version: '0.24' }
])

// 系统特性列表（computed 以响应语言切换）
const systemFeatures = computed(() => [
  t('about.feature.f1'),
  t('about.feature.f2'),
  t('about.feature.f3'),
  t('about.feature.f4'),
  t('about.feature.f5'),
  t('about.feature.f6'),
  t('about.feature.f7'),
  t('about.feature.f8'),
  t('about.feature.f9'),
  t('about.feature.f10'),
  t('about.feature.f11'),
  t('about.feature.f12')
])

/** 打开外部链接 */
function openLink(url: string): void {
  // P1 修复: 添加 noopener/noreferrer 防止 tab-napping 安全风险
  // 注：_blank 打开的新页面默认可通过 window.opener 访问原页面，noopener 切断该引用
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 刷新信息
 * 限制：version/buildMode 等元信息在构建时已注入，运行时无法真正刷新；
 * 此处仅更新 buildTime 显示（回退到当前时间），其他字段保持原值。
 */
function refreshInfo(): void {
  buildTime.value = __BUILD_TIME__ || new Date().toLocaleString()
  ElMessage.success(t('about.refreshSuccess'))
}

/** 复制系统信息到剪贴板 */
async function copyInfo(): Promise<void> {
  const info = {
    project: 'Stepby Admin',
    version: version.value,
    buildMode: buildMode.value,
    buildTime: buildTime.value,
    frontend: {
      vue: vueVersion.value,
      elementPlus: epVersion.value,
      vite: viteVersion.value
    },
    backend: {
      rust: '1.80+',
      axum: '0.8',
      seaOrm: '1.1'
    },
    timestamp: new Date().toISOString()
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(info, null, 2))
    ElMessage.success(t('about.copySuccess'))
  } catch {
    errorHub.report('warning', 'other', t('about.copyFail'))
  }
}
</script>

<style scoped>
.project-logo {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-success));
}

.tech-item {
  background: var(--el-fill-color-light);
}

.tech-item:hover {
  background: var(--el-fill-color);
  transform: translateY(-1px);
}

.dep-item:hover {
  background: var(--el-fill-color-light);
}

.dep-name,
.dep-version {
  font-family: 'Menlo', 'Monaco', monospace;
}

/* 暗黑模式适配 */
:global(html.dark) .project-name {
  color: var(--el-text-color-primary);
}

:global(html.dark) .project-desc,
:global(html.dark) .tech-name,
:global(html.dark) .dep-name,
:global(html.dark) .feature-item {
  color: var(--el-text-color-secondary);
}
</style>
