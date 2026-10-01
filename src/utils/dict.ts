import useDictStore from '@/store/modules/dict'
import { getDicts } from '@/api/system/dict/data'
import { getLanguage } from '@/i18n'
import type { DictOption } from '@/types'
import type { SysDictData } from '@/types'

// 并发请求去重：缓存正在进行的 Promise，避免多个组件同时请求同一字典类型
const pendingMap = new Map<string, Promise<DictOption[]>>()

/**
 * 获取字典数据
 *
 * 国际化（i18n）说明：
 * - 后端 sys_dict_data 表同时存储 dict_label（中文）和 dict_label_en（英文）
 * - useDict 在拉取字典时根据当前 locale（getLanguage()）自动选择 label：
 *   - zh-CN：使用 dictLabel（中文标签）
 *   - en-US：使用 dictLabelEn（英文标签），若英文标签为空则回退到中文标签
 * - 同时保留原始 labelZh / labelEn 字段，便于 locale 切换时动态计算（无需重新请求）
 * - 兼容性：保留 label 字段供 <dict-tag> 等组件直接使用
 */
export function useDict(...args: string[]) {
  const res = reactive<Record<string, DictOption[]>>({})
  args.forEach((dictType) => {
    res[dictType] = []
    const dicts = useDictStore().getDict(dictType)
    if (dicts) {
      res[dictType] = dicts
    } else {
      let p = pendingMap.get(dictType)
      if (!p) {
        // P0 修复: 使用 .finally 清理 pendingMap，避免请求失败时 Map 永久残留 rejected Promise
        // 导致该字典类型在整个会话内永远加载不出数据
        p = getDicts(dictType)
          .then((resp) => {
            const lang = getLanguage()
            const isEn = lang === 'en-US'
            const data: DictOption[] = ((resp.data as SysDictData[]) || []).map((item) => {
              const labelZh = item.dictLabel || ''
              const labelEn = item.dictLabelEn || ''
              return {
                // 根据当前 locale 自动选择中英文标签（英文为空时回退到中文）
                label: isEn ? labelEn || labelZh : labelZh,
                // 保留原始中英文标签，locale 切换时无需重新请求后端
                labelZh,
                labelEn,
                value: item.dictValue ?? '',
                elTagType: item.listClass,
                elTagClass: item.cssClass
              }
            })
            useDictStore().setDict(dictType, data)
            return data
          })
          .finally(() => {
            pendingMap.delete(dictType)
          })
        pendingMap.set(dictType, p)
      }
      // 失败时给出空数组兜底，避免 unhandled rejection
      p.then((data) => {
        res[dictType] = data
      }).catch(() => {
        res[dictType] = []
      })
    }
  })
  return toRefs(res)
}
