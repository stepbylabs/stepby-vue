<template>
  <inner-link
    v-for="(item, index) in tagsViewStore.iframeViews"
    :key="item.path"
    :iframeId="'iframe' + index"
    v-show="route.path === item.path"
    :src="iframeUrl(item.meta.link, item.query)"
  ></inner-link>
</template>

<script setup lang="ts">
import InnerLink from '../InnerLink/index.vue'
import useTagsViewStore from '@/store/modules/tagsView'

const route = useRoute()
const tagsViewStore = useTagsViewStore()

function iframeUrl(url: string, query: Record<string, unknown>): string {
  // F5：用 URL + URLSearchParams 合并 query，避免 url 已含 ?/# 时拼坏（保留 hash）
  try {
    const isAbs = /^(https?:)?\/\//i.test(url)
    const u = new URL(url, window.location.origin)
    const sp = new URLSearchParams(u.search)
    for (const [k, v] of Object.entries(query)) {
      sp.append(k, String(v))
    }
    u.search = sp.toString()
    // 绝对地址返回完整 URL；相对地址保持相对（与原实现行为一致）
    return isAbs ? u.toString() : u.pathname + u.search + u.hash
  } catch {
    // 退化：原拼接逻辑（仅正常 query，不处理已存在的 ?/#）
    if (Object.keys(query).length > 0) {
      const params = Object.keys(query)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(query[k])))
        .join('&')
      return url + '?' + params
    }
    return url
  }
}
</script>
