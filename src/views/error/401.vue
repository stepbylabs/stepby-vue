<template>
  <div class="errPage-container w-[800px] max-w-full my-[100px] mx-auto">
    <el-button icon="arrow-left" class="pan-back-btn" @click="back">
      {{ t('common.back') }}
    </el-button>
    <el-row>
      <el-col :span="12">
        <h1 class="text-ginormous text-[60px] font-bold text-text-primary">
          {{ t('error.e401.errorTitle') }}
        </h1>
        <h2>{{ t('error.e401.title') }}</h2>
        <h6>{{ t('error.e401.message') }}</h6>
        <ul class="list-unstyled text-sm">
          <li class="link-type">
            <router-link to="/">
              {{ t('error.e401.backHome') }}
            </router-link>
          </li>
        </ul>
      </el-col>
      <el-col :span="12">
        <img :src="errGif" width="313" height="428" :alt="t('error.e401.alt')" loading="lazy" />
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
import errImage from '@/assets/401_images/401.gif'

const route = useRoute()
const router = useRouter()

// P1 优化: GIF 已通过 import 静态打包（带 hash），无需 query 参数破坏缓存
const errGif: string = errImage

function back(): void {
  if (route.query.noGoBack) {
    router.push({ path: '/' })
  } else {
    router.go(-1)
  }
}
</script>

<style lang="scss" scoped>
.errPage-container {
  .pan-back-btn {
    background: var(--el-color-primary);
    color: var(--el-color-white);
    border: none !important;
  }
  .pan-gif {
    margin: 0 auto;
    display: block;
  }
  .pan-img {
    display: block;
    margin: 0 auto;
    width: 100%;
  }
  .list-unstyled {
    li {
      padding-bottom: 5px;
    }
    a {
      color: var(--el-color-primary);
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
