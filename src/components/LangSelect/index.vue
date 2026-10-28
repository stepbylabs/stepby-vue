<template>
  <el-dropdown trigger="click" @command="handleSetLang">
    <!-- 无障碍：下拉触发器为纯图标按钮，必须有可读名称（a11y 全站扫描暴露） -->
    <div class="lang-icon--style" :aria-label="t('langSelect.triggerAriaLabel')">
      <svg-icon class-name="lang-icon" icon-class="language" />
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item of langOptions"
          :key="item.value"
          :disabled="currentLang === item.value"
          :command="item.value"
        >
          {{ item.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { setLanguage, switchOutcome } from '@/i18n'
import { ElMessage } from 'element-plus'
import NProgress from 'nprogress'

// 语言切换的短促进度条反馈：与全局进度管理（@/utils/progress）独立，路由无关
NProgress.configure({ showSpinner: false, trickleSpeed: 200 })

const { t, locale } = useI18n()

interface LangOption {
  label: string
  value: 'zh-CN' | 'en-US'
}

// b122：当前语言只有一个事实源（vue-i18n 的 locale）。此前是组件挂载时从存储读一次的
// 本地 ref——跨标签页同步（或任何非本组件发起的切换）之后，下拉里的禁用项会停在旧语言，
// 用户会看到"英文界面 + 简体中文被禁用"。computed 让展示态自动跟住真实 locale。
const currentLang = computed<'zh-CN' | 'en-US'>(() => (locale.value === 'en-US' ? 'en-US' : 'zh-CN'))
const langOptions = computed<LangOption[]>(() => [
  { label: t('langSelect.simplifiedChinese'), value: 'zh-CN' },
  { label: t('langSelect.english'), value: 'en-US' }
])

async function handleSetLang(lang: 'zh-CN' | 'en-US'): Promise<void> {
  if (lang === currentLang.value) return
  // 切换语言：vue-i18n 响应式更新，菜单/面包屑/标签页等通过 useMenuTitle 自动跟随
  // 无需 location.reload()，避免页面闪烁和状态丢失
  // 短促进度条反馈（U5）：语言已切换，通知 ElMessage 成功提示后再结束进度条
  NProgress.start()
  // b121：en-US 按需加载 ⇒ 切换是异步的。三种结局必须分开：
  //   加载失败 ⇒ 保留原语言并报错（不得先报成功）；
  //   被更晚的点击取代 ⇒ 静默退出（新调用自己会给结局）；
  //   成功但持久化失败 ⇒ 本次会话已生效，提示"偏好未能保存"而不是成功。
  const outcome = switchOutcome(await setLanguage(lang))
  if (outcome === 'failed') {
    ElMessage.error(t('langSelect.switchFailed'))
    NProgress.done()
    return
  }
  if (outcome === 'superseded') {
    // 更晚的一次点击会自己给结局：旧调用静默退出（不重复弹两条相反的提示）
    NProgress.done()
    return
  }
  if (outcome === 'switched') {
    ElMessage.success(t('langSelect.switchSuccess'))
  } else if (outcome === 'switched-not-persisted') {
    ElMessage.warning(t('langSelect.switchNotPersisted'))
  }
  window.setTimeout(() => NProgress.done(), 300)
}
</script>
