import useTagsViewStore from '@/store/modules/tagsView'
import type { View } from '@/store/modules/tagsView'
import router from '@/router'
import type { LocationQueryRaw, RouteLocationNormalized, RouteLocationRaw, RouteRecordNormalized } from 'vue-router'

export default {
  // 刷新当前tab页签
  refreshPage(obj?: View) {
    const { path, query, matched } = router.currentRoute.value
    // 防止在重定向过程中重复刷新
    if (path.startsWith('/redirect/')) {
      return Promise.resolve()
    }
    if (obj === undefined) {
      matched.forEach((m: RouteRecordNormalized) => {
        const defaultComp = m.components?.default as { name?: string } | undefined
        if (defaultComp?.name && !['Layout', 'ParentView'].includes(defaultComp.name)) {
          obj = { name: defaultComp.name, path: path, query: query } as View
        }
      })
    }
    // P1 修复: matched 未命中时 obj 仍为 undefined，delCachedView 和解构会抛错
    if (!obj || !obj.path) {
      if (import.meta.env.DEV) console.warn('[tab] refreshPage skipped: no matching route component', { path, query })
      return Promise.resolve()
    }
    // 批六十四修复（真实缺陷）：`delCachedView` 是**同步** action（返回 `[...cachedViews]` 数组，
    // 非 Promise）——此前写成 `delCachedView(obj).then(...)` 会同步抛
    // `TypeError: delCachedView(...).then is not a function`，被 App 错误边界捕获后跳 /500。
    // 即「刷新当前页」这一全局动作（顶栏刷新按钮 / 标签页右键菜单 / 命令面板）**必然崩页**，
    // 且因错误在返回 Promise 前同步抛出，调用方的 `.catch()` 兜不住（F136 实测复现）。
    // 正解：同步清缓存后直接 replace 到 /redirect 前缀触发重挂载。
    useTagsViewStore().delCachedView(obj)
    const { path: objPath, query: objQuery } = obj as View
    return router
      .replace({
        path: '/redirect' + objPath,
        query: objQuery
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) console.error('[tab] refreshPage failed:', e)
      })
  },
  // 关闭当前tab页签，打开新页签
  closeOpenPage(obj?: RouteLocationRaw) {
    useTagsViewStore().delView(router.currentRoute.value as unknown as View)
    if (obj !== undefined) {
      return router.push(obj)
    }
  },
  // 关闭指定tab页签
  closePage(obj?: View | RouteLocationNormalized): Promise<{ visitedViews: View[]; cachedViews: string[] }> {
    if (obj === undefined) {
      // 批六十四修复：与 refreshPage 同源缺陷——`delView` 同为**同步** action
      // （返回 `{visitedViews, cachedViews}` 对象，非 Promise），原 `.then()` 链会同步抛
      // `TypeError: delView(...).then is not a function`。改为同步取结果后构造 Promise。
      const { visitedViews, cachedViews } = useTagsViewStore().delView(
        router.currentRoute.value as unknown as View
      )
      const latestView = visitedViews.slice(-1)[0]
      if (latestView) {
        router.push(latestView.fullPath || latestView.path)
      } else {
        router.push('/')
      }
      return Promise.resolve({ visitedViews, cachedViews })
    }
    return Promise.resolve(useTagsViewStore().delView(obj as View))
  },
  // 关闭所有tab页签
  closeAllPage() {
    return Promise.resolve(useTagsViewStore().delAllViews())
  },
  // 关闭左侧tab页签
  closeLeftPage(obj?: View | RouteLocationNormalized) {
    return Promise.resolve(useTagsViewStore().delLeftTags((obj || router.currentRoute.value) as unknown as View))
  },
  // 关闭右侧tab页签
  closeRightPage(obj?: View | RouteLocationNormalized) {
    return Promise.resolve(useTagsViewStore().delRightTags((obj || router.currentRoute.value) as unknown as View))
  },
  // 关闭其他tab页签
  closeOtherPage(obj?: View | RouteLocationNormalized) {
    return Promise.resolve(useTagsViewStore().delOthersViews((obj || router.currentRoute.value) as unknown as View))
  },
  // 打开tab页签
  openPage(title: string, url: string, params?: LocationQueryRaw) {
    const obj: View = { path: url, meta: { title: title } }
    useTagsViewStore().addView(obj)
    return router.push({ path: url, query: params })
  },
  // 修改tab页签
  updatePage(obj: View) {
    return useTagsViewStore().updateVisitedView(obj)
  }
}
