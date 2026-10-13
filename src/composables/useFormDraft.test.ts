import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// Deterministic, Object.keys()-enumerable localStorage so cleanupExpiredDrafts
// (which scans Object.keys(localStorage)) behaves the same as in browsers.
function makeEnumerableStorage(): Storage {
  const data: Record<string, string> = {}
  const obj = {} as Record<string, unknown>
  Object.defineProperties(obj, {
    getItem: { value: (k: string) => (k in data ? data[k] : null), enumerable: false },
    setItem: {
      value: (k: string, v: string) => {
        data[k] = String(v)
        obj[k] = String(v)
      },
      enumerable: false
    },
    removeItem: {
      value: (k: string) => {
        delete data[k]
        delete obj[k]
      },
      enumerable: false
    },
    clear: {
      value: () => {
        for (const k of Object.keys(data)) delete data[k]
        for (const k of Object.keys(obj)) delete obj[k]
      },
      enumerable: false
    },
    key: { value: (i: number) => Object.keys(data)[i] ?? null, enumerable: false },
    length: { get: () => Object.keys(data).length, enumerable: false }
  })
  return obj as unknown as Storage
}

import cache from '@/plugins/cache'
import { useFormDraft, cleanupExpiredDrafts } from './useFormDraft'

const PREFIX = 'form-draft-'

describe('composables/useFormDraft', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeEnumerableStorage(),
      writable: true,
      configurable: true
    })
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves a draft and reports hasDraft / draftMeta / getDraftTime', () => {
    const form = ref({ name: 'alice', age: 30 })
    const { hasDraft, draftMeta, saveDraft, getDraftTime } = useFormDraft('user-edit', form)

    expect(hasDraft.value).toBe(false)
    expect(getDraftTime()).toBeNull()

    saveDraft()

    expect(hasDraft.value).toBe(true)
    expect(draftMeta.value).not.toBeNull()
    expect(draftMeta.value!.formKey).toBe('user-edit')
    expect(getDraftTime()).toBeInstanceOf(Date)

    const raw = cache.local.getJSON(PREFIX + 'user-edit') as { data: unknown; meta: unknown }
    expect(raw.data).toEqual({ name: 'alice', age: 30 })
  })

  it('namespaces storage keys per formKey', () => {
    const a = useFormDraft('form-a', ref({ x: 1 }))
    const b = useFormDraft('form-b', ref({ x: 2 }))
    a.saveDraft()
    expect(localStorage.getItem(PREFIX + 'form-a')).not.toBeNull()
    expect(localStorage.getItem(PREFIX + 'form-b')).toBeNull()
    expect(b.hasDraft.value).toBe(false)
  })

  it('skips saving when data is empty or nullish', () => {
    const empty = ref<Record<string, unknown>>({})
    const { saveDraft: saveEmpty } = useFormDraft('empty-form', empty)
    saveEmpty()
    expect(localStorage.getItem(PREFIX + 'empty-form')).toBeNull()

    const nul = ref(null) as unknown as Parameters<typeof useFormDraft>[1]
    const { saveDraft: saveNull, hasDraft } = useFormDraft('null-form', nul)
    saveNull()
    expect(localStorage.getItem(PREFIX + 'null-form')).toBeNull()
    expect(hasDraft.value).toBe(false)
  })

  it('loads a saved draft back into the reactive form', () => {
    const form = ref({ name: 'bob', role: 'admin' })
    const { saveDraft, loadDraft } = useFormDraft('load-form', form)
    saveDraft()

    form.value.name = 'tampered'
    const ok = loadDraft()
    expect(ok).toBe(true)
    expect(form.value.name).toBe('bob')
    expect(form.value.role).toBe('admin')
  })

  it('loadDraft returns false when nothing is stored', () => {
    const { loadDraft } = useFormDraft('missing', ref({ a: 1 }))
    expect(loadDraft()).toBe(false)
  })

  it('loadDraft returns false when stored payload has no data field', () => {
    cache.local.setJSON(PREFIX + 'nodeepdata', { meta: { savedAt: 1, formKey: 'x' } })
    const { loadDraft } = useFormDraft('nodeepdata', ref({ a: 1 }))
    expect(loadDraft()).toBe(false)
  })

  it('loadDraft returns true but does not assign for a plain (non-ref) form object', () => {
    const { saveDraft, loadDraft } = useFormDraft('plain-form', { a: 1 } as never)
    saveDraft()
    expect(loadDraft()).toBe(true)
  })

  it('clearDraft removes the stored entry and resets state', () => {
    const form = ref({ a: 1 })
    const { saveDraft, clearDraft, hasDraft, draftMeta } = useFormDraft('clear-form', form)
    saveDraft()
    expect(hasDraft.value).toBe(true)
    clearDraft()
    expect(localStorage.getItem(PREFIX + 'clear-form')).toBeNull()
    expect(hasDraft.value).toBe(false)
    expect(draftMeta.value).toBeNull()
  })

  it('detects a pre-existing draft at construction time', () => {
    cache.local.setJSON(PREFIX + 'pre', { meta: { savedAt: 123, formKey: 'pre' }, data: { a: 1 } })
    const { hasDraft, draftMeta, getDraftTime } = useFormDraft('pre', ref({}))
    expect(hasDraft.value).toBe(true)
    // 修复后：构造时只把存储 blob 里的 `meta` 读入 draftMeta，
    // 与 saveDraft() 写入后的形状一致，getDraftTime 不再是 Invalid Date。
    expect(draftMeta.value).toEqual({ savedAt: 123, formKey: 'pre' })
    expect(getDraftTime()?.getTime()).toBe(123)
  })

  it('falls back to null (and clears) on corrupt JSON in storage', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(PREFIX + 'corrupt', '{not valid json')
    const { hasDraft, draftMeta } = useFormDraft('corrupt', ref({}))
    expect(hasDraft.value).toBe(false)
    expect(draftMeta.value).toBeNull()
    warnSpy.mockRestore()
  })

  it('saveDraftDebounced persists after the debounce window elapses', async () => {
    vi.useFakeTimers()
    const form = ref({ v: 'later' })
    const { saveDraftDebounced } = useFormDraft('deb-form', form)
    saveDraftDebounced()
    expect(localStorage.getItem(PREFIX + 'deb-form')).toBeNull()
    await vi.advanceTimersByTimeAsync(30000)
    expect(localStorage.getItem(PREFIX + 'deb-form')).not.toBeNull()
    vi.useRealTimers()
  })
})

describe('useFormDraft/cleanupExpiredDrafts', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeEnumerableStorage(),
      writable: true,
      configurable: true
    })
    localStorage.clear()
  })

  const DAY = 24 * 60 * 60 * 1000

  it('removes drafts older than 30 days and keeps recent ones', () => {
    const now = Date.now()
    cache.local.setJSON(PREFIX + 'old', { meta: { savedAt: now - 31 * DAY, formKey: 'old' }, data: { a: 1 } })
    cache.local.setJSON(PREFIX + 'fresh', { meta: { savedAt: now - 1 * DAY, formKey: 'fresh' }, data: { a: 2 } })

    const cleaned = cleanupExpiredDrafts()
    expect(cleaned).toBe(1)
    expect(localStorage.getItem(PREFIX + 'old')).toBeNull()
    expect(localStorage.getItem(PREFIX + 'fresh')).not.toBeNull()
  })

  it('ignores non-prefixed keys, meta-less and corrupt entries', () => {
    const now = Date.now()
    localStorage.setItem('unrelated-key', JSON.stringify({ meta: { savedAt: now - 999 * DAY } }))
    cache.local.setJSON(PREFIX + 'nometa', { data: { a: 1 } })
    localStorage.setItem(PREFIX + 'corrupt', 'nope{')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleaned = cleanupExpiredDrafts()
    expect(cleaned).toBe(0)
    expect(localStorage.getItem('unrelated-key')).not.toBeNull()
    warnSpy.mockRestore()
  })
})
