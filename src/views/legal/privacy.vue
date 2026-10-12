<template>
  <!-- ROUNDS61-100 #6 / R10-SEC-005：隐私政策页面 -->
  <!-- 静态页面，参考《中华人民共和国个人信息保护法》(PIPL) 要点，未登录也可访问 -->
  <div class="privacy-page min-h-screen">
    <div class="max-w-[860px] mx-auto">
      <el-card shadow="never" class="rounded-lg">
        <template #header>
          <div class="text-center">
            <h1 class="privacy-title mb-2 font-semibold text-text-primary">{{ t('legal.privacy.title') }}</h1>
            <p class="m-0 text-[13px] text-text-secondary">
              {{ t('legal.privacy.lastUpdated', { date: '2026-07-17' }) }}
            </p>
          </div>
        </template>

        <div class="privacy-intro">
          <p>{{ t('legal.privacy.intro1') }}</p>
          <p>{{ t('legal.privacy.intro2') }}</p>
        </div>

        <el-divider content-position="left">{{ t('legal.privacy.section1Title') }}</el-divider>
        <div class="privacy-section text-sm leading-[1.8] text-text-regular">
          <p>{{ t('legal.privacy.section1Intro') }}</p>
          <ul>
            <li>
              <strong>{{ t('legal.privacy.section1AccountInfo') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section1AuthInfo') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section1UsageData') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section1Profile') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section1Cookie') }}</strong>
            </li>
          </ul>
          <p>{{ t('legal.privacy.section1Conclusion') }}</p>
        </div>

        <el-divider content-position="left">{{ t('legal.privacy.section2Title') }}</el-divider>
        <div class="privacy-section text-sm leading-[1.8] text-text-regular">
          <p>{{ t('legal.privacy.section2Intro') }}</p>
          <ul>
            <li>{{ t('legal.privacy.section2Item1') }}</li>
            <li>{{ t('legal.privacy.section2Item2') }}</li>
            <li>{{ t('legal.privacy.section2Item3') }}</li>
            <li>{{ t('legal.privacy.section2Item4') }}</li>
            <li>{{ t('legal.privacy.section2Item5') }}</li>
          </ul>
          <p>{{ t('legal.privacy.section2Conclusion') }}</p>
        </div>

        <el-divider content-position="left">{{ t('legal.privacy.section3Title') }}</el-divider>
        <div class="privacy-section text-sm leading-[1.8] text-text-regular">
          <p>{{ t('legal.privacy.section3Intro') }}</p>
          <p>{{ t('legal.privacy.section3Categories') }}</p>
          <ul>
            <li>
              <strong>{{ t('legal.privacy.section3Necessary') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section3Preference') }}</strong>
            </li>
          </ul>
          <p>{{ t('legal.privacy.section3Conclusion') }}</p>
        </div>

        <el-divider content-position="left">{{ t('legal.privacy.section4Title') }}</el-divider>
        <div class="privacy-section text-sm leading-[1.8] text-text-regular">
          <p>{{ t('legal.privacy.section4Intro') }}</p>
          <ul>
            <li>{{ t('legal.privacy.section4Item1') }}</li>
            <li>{{ t('legal.privacy.section4Item2') }}</li>
            <li>{{ t('legal.privacy.section4Item3') }}</li>
            <li>{{ t('legal.privacy.section4Item4') }}</li>
            <li>{{ t('legal.privacy.section4Item5') }}</li>
          </ul>
          <p>{{ t('legal.privacy.section4Conclusion') }}</p>
        </div>

        <el-divider content-position="left">{{ t('legal.privacy.section5Title') }}</el-divider>
        <div class="privacy-section text-sm leading-[1.8] text-text-regular">
          <p>{{ t('legal.privacy.section5Intro') }}</p>
          <ul>
            <li>
              <strong>{{ t('legal.privacy.section5Item1') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section5Item2') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section5Item3') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section5Item4') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section5Item5') }}</strong>
            </li>
            <li>
              <strong>{{ t('legal.privacy.section5Item6') }}</strong>
            </li>
          </ul>
          <p>{{ t('legal.privacy.section5Conclusion') }}</p>
        </div>

        <el-divider content-position="left">{{ t('legal.privacy.section6Title') }}</el-divider>
        <div class="privacy-section text-sm leading-[1.8] text-text-regular">
          <p>{{ t('legal.privacy.section6Intro') }}</p>
          <ul>
            <li>{{ t('legal.privacy.section6Email') }}</li>
            <li>{{ t('legal.privacy.section6Channel') }}</li>
          </ul>
          <p>{{ t('legal.privacy.section6Conclusion') }}</p>
        </div>

        <el-divider />
        <div class="privacy-footer text-center text-[13px] text-text-secondary">
          <p>{{ t('legal.privacy.footer1') }}</p>
          <p>{{ t('legal.privacy.footer2') }}</p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
// 静态隐私政策页面，无业务逻辑
const { t } = useI18n()
</script>

<style lang="scss" scoped>
.privacy-page {
  background-color: var(--el-bg-color-page);
  padding: 40px 16px;
}

.privacy-title {
  font-size: 26px;
}

.privacy-intro,
.privacy-section {
  p {
    margin: 0 0 12px 0;
  }

  ul {
    margin: 0 0 12px 0;
    padding-left: 24px;

    li {
      margin-bottom: 8px;
      line-height: 1.7;

      strong {
        color: var(--el-text-color-primary);
      }
    }
  }
}

.privacy-footer {
  p {
    margin: 0 0 4px 0;
  }
}

:deep(.el-divider__text) {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

// 移动端适配
@media (max-width: 768px) {
  .privacy-page {
    padding: 16px 8px;
  }

  .privacy-title {
    font-size: 22px;
  }
}
</style>
