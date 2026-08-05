<template>
  <el-dropdown trigger="click" @command="handleSetLang">
    <div class="lang-icon--style">
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
import { setLanguage, getLanguage } from '@/i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()

interface LangOption {
  label: string
  value: 'zh-CN' | 'en-US'
}

const currentLang = ref<'zh-CN' | 'en-US'>(getLanguage())
const langOptions = computed<LangOption[]>(() => [
  { label: t('langSelect.simplifiedChinese'), value: 'zh-CN' },
  { label: t('langSelect.english'), value: 'en-US' }
])

function handleSetLang(lang: 'zh-CN' | 'en-US'): void {
  if (lang === currentLang.value) return
  // 切换语言：vue-i18n 响应式更新，菜单/面包屑/标签页等通过 useMenuTitle 自动跟随
  // 无需 location.reload()，避免页面闪烁和状态丢失
  setLanguage(lang)
  currentLang.value = lang
  ElMessage.success(t('langSelect.switchSuccess'))
}
</script>
