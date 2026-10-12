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
  /** 导出失败时的 i18n key（默认 'common.downloadError'） */
  errorKey?: string
  /** 成功时的 i18n key（不传则不提示） */
  successKey?: string
}

export function useExport(url: string, filenamePrefix: string, options: UseExportOptions = {}) {
  const { t } = useI18n()
  const { errorKey = 'common.downloadError', successKey } = options

  const downloadLoading = ref(false)

  function handleExport(params: Record<string, unknown> = {}, filename?: string): void {
    downloadLoading.value = true
    const finalFilename = filename || `${filenamePrefix}_${Date.now()}.xlsx`
    download(url, params, finalFilename)
      .then(() => {
        if (successKey) modal.msgSuccess(t(successKey))
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) console.error(`[useExport] ${url} export failed:`, err)
        modal.msgError(t(errorKey))
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
