/**
 * 导出 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：统一非 useCrudTable 页面的导出逻辑（dict/data、rateLimit、job/log、logininfor 等）
 *   - 封装 download() 调用，统一文件名生成规则
 *   - downloadLoading 状态管理
 *   - 错误提示
 *
 * 用法：
 *   import { useExport } from '@/composables/useExport'
 *   const { downloadLoading, handleExport } = useExport('/monitor/logininfor/export', 'logininfor')
 *   handleExport(queryParams.value)
 *
 * 注：使用 useCrudTable 的页面已内置 handleExport，无需使用本 composable
 */
import { ref } from 'vue'
import { download } from '@/utils/request'
import modal from '@/plugins/modal'
import { useI18n } from 'vue-i18n'

export interface UseExportOptions {
  /** 成功时的 i18n key（不传则不提示） */
  successKey?: string
}

/**
 * 导出组合子。
 *
 * 刻意**没有** `errorKey`：`download()` 的四条失败出口都已把"后端给出的具体理由 + 追踪号"
 * 交给 `errorHub` 单通道（b124/b125），页面再补一条通用"导出失败"就是同一次失败两条措辞
 * （b125 ⑤）。改造前的 `errorKey` 挂在 `.catch` 上，而那条 `.catch` **结构上永远走不到**
 * （旧 `download` 失败时也 resolve），也就是说这个选项是一条没有生效路径的承诺（⑮）；
 * 本次连同它的两条用例一起撤掉，而不是"接上后再弹一条"。
 */
export function useExport(url: string, filenamePrefix: string, options: UseExportOptions = {}) {
  const { t } = useI18n()
  const { successKey } = options

  const downloadLoading = ref(false)

  /**
   * 形参刻意取 unknown：模板裸写 `@click="handleExport"` 时 Vue 把 PointerEvent 送进第一个实参
   * （el-button 的 click 载荷类型宽松，vue-tsc 拦不住）。b73 在 useCrudTable 同族实证过真实后果
   * （7 个页面导出物存成 `[object PointerEvent].xlsx`），本 composable 是同一接缝的另一半，同源设防：
   * 事件对象既不能当查询条件（会静默丢筛选），也不能当文件名。
   */
  function handleExport(params?: unknown, filename?: unknown): void {
    downloadLoading.value = true
    const query: Record<string, unknown> =
      params instanceof Event ? {} : ((params as Record<string, unknown> | undefined) ?? {})
    const finalFilename = typeof filename === 'string' && filename ? filename : `${filenamePrefix}_${Date.now()}.xlsx`
    download(url, query, finalFilename)
      .then((ok: boolean) => {
        // 成功话只能由下载结局驱动：旧实现是"resolve 就说成功"，而 `download()` 在
        // HTTP 200 + JSON 错误体、0 字节载荷、保存通道被拒三种失败上**同样 resolve**，
        // 于是屏幕上同时有"失败原因"（errorHub）和"导出成功"（这里）。
        if (ok && successKey) modal.msgSuccess(t(successKey))
      })
      .catch((err: unknown) => {
        // 兜住"成功处理器内部的意外"（download 内部已把四类失败折算成 false，正常不会走到这里）。
        // 不弹提示的理由见上方 `UseExportOptions` 注释——失败理由由 errorHub 单通道给。
        if (import.meta.env.DEV) console.error(`[useExport] ${url} export failed:`, err)
      })
      .finally(() => {
        downloadLoading.value = false
      })
  }

  return {
    downloadLoading,
    handleExport
  }
}
