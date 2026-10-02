<template>
  <!--
    TierA-5: 密码强度指示器
    - 实时计算密码强度（弱/中/强/非常强）
    - 显示强度条 + 强度文本 + 改进建议
    - 支持与密码规则（passwordRule）联动
  -->
  <Transition name="expand-fade">
    <div v-if="password" class="password-strength mt-2 mb-1">
      <div class="strength-bars flex gap-1 mb-1.5">
        <div
          v-for="i in 4"
          :key="i"
          class="strength-bar"
          :class="{ active: i <= strengthLevel, [strengthClass]: i <= strengthLevel }"
        />
      </div>
      <div class="strength-info flex justify-between items-center text-xs leading-[1.4]">
        <span class="strength-label font-semibold" :class="strengthClass">{{ strengthText }}</span>
        <span
          v-if="suggestions.length"
          class="strength-suggestions text-text-secondary text-[11px] max-w-[60%] text-right truncate"
        >
          {{ suggestions[0] }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * TierA-5: 密码强度指示器
 *
 * 强度评估规则（满分 100）：
 * - 长度：6-8 字符 +10，9-12 字符 +20，13+ 字符 +30
 * - 包含小写字母：+10
 * - 包含大写字母：+15
 * - 包含数字：+15
 * - 包含特殊字符：+20
 * - 字符多样性（不同字符数/总长）：+10
 *
 * 强度等级：
 * - 0-30：弱（1 级，红色）
 * - 31-60：中（2 级，橙色）
 * - 61-80：强（3 级，黄色）
 * - 81-100：非常强（4 级，绿色）
 *
 * Props:
 * - password: 密码字符串
 *
 * 用法：
 *   <PasswordStrength :password="form.password" />
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  password: string
}

const props = defineProps<Props>()
const { t } = useI18n()

/** 特殊字符正则（避免重复字面量） */
const SPECIAL_CHAR_RE = /[~!@#$%^&*()\-=_+]/

const score = computed<number>(() => {
  const pwd = props.password || ''
  if (!pwd) return 0

  let s = 0

  // 长度评分
  if (pwd.length >= 6 && pwd.length <= 8) s += 10
  else if (pwd.length >= 9 && pwd.length <= 12) s += 20
  else if (pwd.length >= 13) s += 30

  // 字符类型评分
  if (/[a-z]/.test(pwd)) s += 10
  if (/[A-Z]/.test(pwd)) s += 15
  if (/[0-9]/.test(pwd)) s += 15
  if (SPECIAL_CHAR_RE.test(pwd)) s += 20

  // 字符多样性
  const uniqueChars = new Set(pwd).size
  if (uniqueChars / pwd.length >= 0.7) s += 10

  return Math.min(s, 100)
})

const strengthLevel = computed<number>(() => {
  const s = score.value
  if (s === 0) return 0
  if (s <= 30) return 1
  if (s <= 60) return 2
  if (s <= 80) return 3
  return 4
})

const strengthClass = computed<string>(() => {
  switch (strengthLevel.value) {
    case 1:
      return 'weak'
    case 2:
      return 'medium'
    case 3:
      return 'strong'
    case 4:
      return 'very-strong'
    default:
      return ''
  }
})

const strengthText = computed<string>(() => {
  switch (strengthLevel.value) {
    case 1:
      return t('passwordStrength.weak')
    case 2:
      return t('passwordStrength.medium')
    case 3:
      return t('passwordStrength.strong')
    case 4:
      return t('passwordStrength.veryStrong')
    default:
      return ''
  }
})

const suggestions = computed<string[]>(() => {
  const pwd = props.password || ''
  const tips: string[] = []

  if (pwd.length > 0 && pwd.length < 9) {
    tips.push(t('passwordStrength.tipLength'))
  }
  if (!/[A-Z]/.test(pwd)) {
    tips.push(t('passwordStrength.tipUpper'))
  }
  if (!/[0-9]/.test(pwd)) {
    tips.push(t('passwordStrength.tipNumber'))
  }
  if (!SPECIAL_CHAR_RE.test(pwd)) {
    tips.push(t('passwordStrength.tipSpecial'))
  }

  return tips
})
</script>

<style lang="scss" scoped>
.password-strength {
  .strength-bars {
    .strength-bar {
      flex: 1;
      height: 4px;
      background-color: var(--el-border-color-lighter, #e4e7ed);
      border-radius: 2px;
      transition: background-color 0.3s ease;

      &.active.weak {
        background-color: var(--el-color-danger);
      }
      &.active.medium {
        background-color: var(--el-color-warning);
      }
      &.active.strong {
        background-color: var(--el-color-success);
      }
      &.active.very-strong {
        background-color: var(--el-color-primary);
      }
    }
  }

  .strength-info {
    .strength-label {
      &.weak {
        color: var(--el-color-danger);
      }
      &.medium {
        color: var(--el-color-warning);
      }
      &.strong {
        color: var(--el-color-success);
      }
      &.very-strong {
        color: var(--el-color-primary);
      }
    }
  }
}
</style>
