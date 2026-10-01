/**
 * 表单自动保存草稿 composable
 * Copyright (c) 2026 Stepby
 *
 * 用途：长表单填写时自动保存到 localStorage，防止意外丢失
 * 存储：localStorage，按 formKey 隔离，保留最近 5 份草稿
 *
 * 用法：
 *   const { draft, saveDraft, loadDraft, clearDraft, hasDraft } = useFormDraft('user-edit-form', formData)
 *   // 组件挂载时检查草稿（P2: 使用 i18n key 替代硬编码中文）
 *   const { t } = useI18n()
 *   onMounted(() => {
 *     if (hasDraft.value) {
 *       modal.confirm(t('common.formDraft.confirmRestore')).then(loadDraft)
 *     }
 *   })
 *   // 防抖自动保存（30 秒）
 *   watch(formData, useDebounceFn(saveDraft, 30000), { deep: true })
 */
import { useDebounceFn } from '@vueuse/core'
import cache from '@/plugins/cache'

const STORAGE_KEY_PREFIX = 'form-draft-'

export interface FormDraftMeta {
  savedAt: number
  formKey: string
}

function getStorageKey(formKey: string): string {
  return `${STORAGE_KEY_PREFIX}${formKey}`
}

export function useFormDraft<T extends Record<string, unknown>>(formKey: string, formData: Ref<T> | T) {
  const storageKey = getStorageKey(formKey)
  // 存储结构为 { meta, data }，构造时只取其中的 meta，保证 draftMeta/hasDraft/getDraftTime 语义正确
  const stored = cache.local.getJSON(storageKey) as { meta?: FormDraftMeta } | null
  const draftMeta = ref<FormDraftMeta | null>(stored?.meta ?? null)
  const hasDraft = computed(() => draftMeta.value !== null)

  /** 立即保存草稿 */
  function saveDraft(): void {
    const data = unref(formData) as T
    if (!data || Object.keys(data).length === 0) return
    const meta: FormDraftMeta = {
      savedAt: Date.now(),
      formKey
    }
    cache.local.setJSON(storageKey, { meta, data })
    draftMeta.value = meta
  }

  /** 防抖保存（默认 30 秒） */
  const saveDraftDebounced = useDebounceFn(saveDraft, 30000)

  /** 加载草稿到表单 */
  function loadDraft(): boolean {
    const saved = cache.local.getJSON(storageKey) as { data?: T; meta?: { savedAt?: number } } | null
    if (!saved || !saved.data) return false
    const formRef = formData as Ref<T>
    if (formRef && 'value' in formRef) {
      Object.assign(formRef.value, saved.data)
    }
    return true
  }

  /** 清除草稿（提交成功后调用） */
  function clearDraft(): void {
    cache.local.remove(storageKey)
    draftMeta.value = null
  }

  /** 获取草稿保存时间（用于提示用户） */
  function getDraftTime(): Date | null {
    if (!draftMeta.value) return null
    return new Date(draftMeta.value.savedAt)
  }

  return {
    draftMeta,
    hasDraft,
    saveDraft,
    saveDraftDebounced,
    loadDraft,
    clearDraft,
    getDraftTime
  }
}

/** 清理所有过期的表单草稿（30 天前的） */
export function cleanupExpiredDrafts(): number {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
  const now = Date.now()
  const EXPIRE_MS = 30 * 24 * 60 * 60 * 1000 // 30 天
  let cleaned = 0
  for (const key of keys) {
    const saved = cache.local.getJSON(key) as { meta?: { savedAt?: number } } | null
    if (saved && saved.meta && saved.meta.savedAt) {
      if (now - saved.meta.savedAt > EXPIRE_MS) {
        cache.local.remove(key)
        cleaned++
      }
    }
  }
  return cleaned
}
