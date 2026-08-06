import cache from '@/plugins/cache'
import useSettingsStore from '@/store/modules/settings'
import type { LocationQueryRaw } from 'vue-router'

const PERSIST_KEY = 'tags-view-visited'

function isPersistEnabled() {
  return useSettingsStore().tagsViewPersist
}

// 生成标签页唯一缓存键，避免同 name/同 path 不同 query 的视图相互冲突（P0-77）
function viewKey(view: View): string {
  if (!view) return ''
  // 优先使用 fullPath（path + query 序列化），保证唯一性
  if (view.fullPath) return view.fullPath
  if (view.path) {
    let key = view.path
    if (view.query && typeof view.query === 'object') {
      try {
        key += '?' + JSON.stringify(view.query)
      } catch {
        // ignore
      }
    }
    return key
  }
  return ''
}

function saveVisitedViews(views: View[]) {
  if (!isPersistEnabled()) return
  const toSave = views
    .filter((v: View) => !(v.meta && v.meta.affix))
    .map((v: View) => ({
      path: v.path,
      fullPath: v.fullPath,
      name: v.name,
      title: v.title,
      query: v.query,
      meta: v.meta
    }))
  cache.local.setJSON(PERSIST_KEY, toSave)
}

function loadVisitedViews(): View[] {
  return (cache.local.getJSON(PERSIST_KEY) || []) as View[]
}

function clearVisitedViews() {
  cache.local.remove(PERSIST_KEY)
}

interface ViewMeta {
  title?: string
  noCache?: boolean
  affix?: boolean
  link?: string
  [key: string]: unknown
}

export interface View {
  path: string
  name?: string
  meta: ViewMeta
  fullPath?: string
  title?: string
  query?: LocationQueryRaw
  [key: string]: unknown
}

const useTagsViewStore = defineStore('tags-view', {
  state: () => ({
    visitedViews: [] as View[],
    cachedViews: [] as string[],
    iframeViews: [] as View[]
  }),

  actions: {
    addView(view: View) {
      this.addVisitedView(view)
      this.addCachedView(view)
    },

    addIframeView(view: View) {
      if (this.iframeViews.some((v: View) => viewKey(v) === viewKey(view))) return
      this.iframeViews.push(
        Object.assign({}, view, {
          title: view.meta?.title || 'no-name'
        })
      )
    },

    addVisitedView(view: View) {
      // 使用唯一键去重，避免同 path 不同 query 的视图被误判为重复（P0-77）
      if (this.visitedViews.some((v: View) => viewKey(v) === viewKey(view))) return
      this.visitedViews.push(
        Object.assign({}, view, {
          title: view.meta?.title || 'no-name'
        })
      )
      saveVisitedViews(this.visitedViews)
    },

    addAffixView(view: View) {
      if (this.visitedViews.some((v: View) => viewKey(v) === viewKey(view))) return
      this.visitedViews.unshift(
        Object.assign({}, view, {
          title: view.meta.title || 'no-name'
        })
      )
    },

    addCachedView(view: View) {
      // 跳过未命名视图，避免 undefined 共享同一缓存条目（P0-77）
      if (!view.name) return
      if (this.cachedViews.includes(view.name)) return
      if (!view.meta?.noCache) {
        this.cachedViews.push(view.name)
      }
    },

    delView(view: View): { visitedViews: View[]; cachedViews: string[] } {
      this.delVisitedView(view)
      this.delCachedView(view)
      return {
        visitedViews: [...this.visitedViews],
        cachedViews: [...this.cachedViews]
      }
    },

    delVisitedView(view: View) {
      const key = viewKey(view)
      for (const [i, v] of this.visitedViews.entries()) {
        if (viewKey(v) === key) {
          this.visitedViews.splice(i, 1)
          break
        }
      }
      this.iframeViews = this.iframeViews.filter((item: View) => viewKey(item) !== key)
      saveVisitedViews(this.visitedViews)
      return [...this.visitedViews]
    },

    delIframeView(view: View) {
      const key = viewKey(view)
      this.iframeViews = this.iframeViews.filter((item: View) => viewKey(item) !== key)
      return [...this.iframeViews]
    },

    delCachedView(view: View) {
      // 仅当没有其他已访问视图共享同 name 时才移除缓存，避免影响其他标签页（P0-77）
      if (view.name) {
        const stillUsed = this.visitedViews.some((v: View) => v.name === view.name && viewKey(v) !== viewKey(view))
        if (!stillUsed) {
          const index = this.cachedViews.indexOf(view.name)
          if (index > -1) this.cachedViews.splice(index, 1)
        }
      }
      return [...this.cachedViews]
    },

    delOthersViews(view: View) {
      this.delOthersVisitedViews(view)
      this.delOthersCachedViews(view)
      return {
        visitedViews: [...this.visitedViews],
        cachedViews: [...this.cachedViews]
      }
    },

    delOthersVisitedViews(view: View) {
      const key = viewKey(view)
      this.visitedViews = this.visitedViews.filter((v: View) => {
        return v.meta?.affix || viewKey(v) === key
      })
      this.iframeViews = this.iframeViews.filter((item: View) => viewKey(item) === key)
      saveVisitedViews(this.visitedViews)
      return [...this.visitedViews]
    },

    delOthersCachedViews(_view: View) {
      // 仅保留当前视图以及其他仍存在的访问视图所共享的 name（P0-77）
      const usedNames = new Set<string>()
      this.visitedViews.forEach((v: View) => {
        if (v.name) usedNames.add(v.name)
      })
      this.cachedViews = this.cachedViews.filter((name: string) => usedNames.has(name))
      return [...this.cachedViews]
    },

    delAllViews(view?: View) {
      this.delAllVisitedViews(view)
      this.delAllCachedViews(view)
      return {
        visitedViews: [...this.visitedViews],
        cachedViews: [...this.cachedViews]
      }
    },

    delAllVisitedViews(_view?: View) {
      const affixTags = this.visitedViews.filter((tag: View) => tag.meta?.affix)
      this.visitedViews = affixTags
      this.iframeViews = []
      clearVisitedViews()
      return [...this.visitedViews]
    },

    delAllCachedViews(_view?: View) {
      // 保留仍存在的访问视图（affix 标签）所对应的 name，避免清空后丢失缓存（P0-77）
      const usedNames = new Set<string>()
      this.visitedViews.forEach((v: View) => {
        if (v.name) usedNames.add(v.name)
      })
      this.cachedViews = this.cachedViews.filter((name: string) => usedNames.has(name))
      return [...this.cachedViews]
    },

    updateVisitedView(view: View) {
      const key = viewKey(view)
      for (let i = 0; i < this.visitedViews.length; i++) {
        if (viewKey(this.visitedViews[i]) === key) {
          Object.assign(this.visitedViews[i], view)
          break
        }
      }
    },

    delRightTags(view: View) {
      const key = viewKey(view)
      const index = this.visitedViews.findIndex((v: View) => viewKey(v) === key)
      if (index === -1) {
        return [...this.visitedViews]
      }
      this.visitedViews = this.visitedViews.filter((item: View, idx: number) => {
        if (idx <= index || (item.meta && item.meta.affix)) {
          return true
        }
        if (item.name) {
          // 仅当左侧没有其他同名视图时才移除缓存（P0-77）
          const stillUsedLeft = this.visitedViews.some((it: View, i: number) => i <= index && it.name === item.name)
          if (!stillUsedLeft) {
            const i = this.cachedViews.indexOf(item.name)
            if (i > -1) {
              this.cachedViews.splice(i, 1)
            }
          }
        }
        if (item.meta?.link) {
          const fi = this.iframeViews.findIndex((v: View) => viewKey(v) === viewKey(item))
          // P1 修复：findIndex 未命中时 fi=-1，splice(-1,1) 会误删数组最后一个元素
          if (fi >= 0) {
            this.iframeViews.splice(fi, 1)
          }
        }
        return false
      })
      saveVisitedViews(this.visitedViews)
      return [...this.visitedViews]
    },

    delLeftTags(view: View) {
      const key = viewKey(view)
      const index = this.visitedViews.findIndex((v: View) => viewKey(v) === key)
      if (index === -1) {
        return [...this.visitedViews]
      }
      this.visitedViews = this.visitedViews.filter((item: View, idx: number) => {
        if (idx >= index || (item.meta && item.meta.affix)) {
          return true
        }
        if (item.name) {
          // 仅当右侧没有其他同名视图时才移除缓存（P0-77）
          const stillUsedRight = this.visitedViews.some((it: View, i: number) => i >= index && it.name === item.name)
          if (!stillUsedRight) {
            const i = this.cachedViews.indexOf(item.name)
            if (i > -1) {
              this.cachedViews.splice(i, 1)
            }
          }
        }
        if (item.meta?.link) {
          const fi = this.iframeViews.findIndex((v: View) => viewKey(v) === viewKey(item))
          // P1 修复：findIndex 未命中时 fi=-1，splice(-1,1) 会误删数组最后一个元素
          if (fi >= 0) {
            this.iframeViews.splice(fi, 1)
          }
        }
        return false
      })
      saveVisitedViews(this.visitedViews)
      return [...this.visitedViews]
    },
    // 恢复持久化的 tags
    loadPersistedViews() {
      const views = loadVisitedViews()
      views.forEach((view: View) => {
        this.addVisitedView(view)
      })
    },

    /**
     * 拖拽排序：将 from 索引的标签移动到 to 索引位置
     * affix 标签固定在开头，不参与排序
     */
    sortViews(from: number, to: number) {
      if (from === to) return
      if (from < 0 || to < 0 || from >= this.visitedViews.length || to >= this.visitedViews.length) return
      // 阻止对 affix 标签的拖拽
      if (this.visitedViews[from]?.meta?.affix) return
      if (this.visitedViews[to]?.meta?.affix) return
      const [moved] = this.visitedViews.splice(from, 1)
      this.visitedViews.splice(to, 0, moved)
      saveVisitedViews(this.visitedViews)
    }
  }
})

export default useTagsViewStore
