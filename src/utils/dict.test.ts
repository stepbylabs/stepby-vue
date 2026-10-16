/**
 * utils/dict useDict 单元测试（b71 补测：并发去重 + pendingMap 生命周期 + 中英标签回退）
 *
 * 锁定的真实缺陷面：
 * 1. pendingMap 并发去重（同类型多次同步调用只发一次底层请求）；
 * 2. `.finally` 清理 pendingMap —— 曾把 settled/rejected Promise 永久留在 Map 里：
 *    失败后该字典在整个会话内再也加载不出来，缓存失效后也只会拿到旧数据；
 * 3. locale=en-US 时按 dictLabelEn 取标签，英文标签为空必须回退中文 dictLabel
 *    （同时保留 labelZh/labelEn，供 locale 切换免重查）；
 * 4. 底层请求失败/后端 data 缺失时结果必须是空数组（不抛错、不产生 unhandled rejection）。
 *
 * 仅 mock 字典 api 模块与 i18n 的 getLanguage；pinia store 用真实实例（每例新 pinia）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SysDictData } from '@/types'

const h = vi.hoisted(() => {
  const getDicts = vi.fn<(dictType: string) => Promise<{ data?: SysDictData[] | null }>>()
  const getLanguage = vi.fn<() => string>(() => 'zh-CN')
  return { getDicts, getLanguage }
})

vi.mock('@/api/system/dict/data', () => ({ getDicts: h.getDicts }))
vi.mock('@/i18n', () => ({ getLanguage: h.getLanguage }))

import { useDict } from './dict'
import useDictStore from '@/store/modules/dict'

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('utils/dict useDict', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    h.getDicts.mockReset()
    h.getLanguage.mockReset().mockReturnValue('zh-CN')
  })

  it('同一字典类型并发调用只发一次底层请求（pendingMap 去重）', async () => {
    const d = deferred<{ data?: SysDictData[] | null }>()
    h.getDicts.mockReturnValue(d.promise)

    const first = useDict('sys_dedup')
    const second = useDict('sys_dedup')
    const third = useDict('sys_dedup', 'sys_dedup')

    expect(h.getDicts).toHaveBeenCalledTimes(1)
    expect(h.getDicts).toHaveBeenCalledWith('sys_dedup')
    expect(first['sys_dedup'].value).toEqual([])

    d.resolve({ data: [{ dictLabel: '男', dictValue: '0' }] })
    await flush()

    expect(first['sys_dedup'].value).toEqual([{ label: '男', labelZh: '男', labelEn: '', value: '0' }])
    expect(second['sys_dedup'].value).toEqual(first['sys_dedup'].value)
    expect(third['sys_dedup'].value).toEqual(first['sys_dedup'].value)
  })

  it('一次调用多个字典类型时按类型分别请求', async () => {
    h.getDicts.mockResolvedValue({ data: [] })

    useDict('type_a', 'type_b')

    expect(h.getDicts.mock.calls.map((c) => c[0])).toEqual(['type_a', 'type_b'])
  })

  it('解析成功后写入字典 store，后续同类型调用直接命中缓存不再请求', async () => {
    h.getDicts.mockResolvedValue({ data: [{ dictLabel: '启用', dictValue: '0' }] })

    const first = useDict('sys_cache_hit')
    await flush()
    expect(h.getDicts).toHaveBeenCalledTimes(1)
    expect(useDictStore().getDict('sys_cache_hit')).toHaveLength(1)

    const second = useDict('sys_cache_hit')
    await flush()
    expect(h.getDicts).toHaveBeenCalledTimes(1)
    // 首次调用的响应式结果与二次调用（走 store 缓存）内容一致
    expect(first['sys_cache_hit'].value).toEqual([{ label: '启用', labelZh: '启用', labelEn: '', value: '0' }])
    expect(second['sys_cache_hit'].value).toEqual(first['sys_cache_hit'].value)
  })

  it('完成后 pendingMap 被 .finally 清理：store 缓存失效后重新请求而非复用已完成的旧 Promise', async () => {
    h.getDicts.mockResolvedValueOnce({ data: [{ dictLabel: '旧值', dictValue: '1' }] })
    const first = useDict('sys_stale')
    await flush()
    expect(first['sys_stale'].value).toEqual([{ label: '旧值', labelZh: '旧值', labelEn: '', value: '1' }])

    // 模拟字典维护后 store 侧缓存被清除（如语言/字典变更后 removeDict）
    expect(useDictStore().removeDict('sys_stale')).toBe(true)
    h.getDicts.mockResolvedValueOnce({ data: [{ dictLabel: '新值', dictValue: '2' }] })

    const second = useDict('sys_stale')
    expect(h.getDicts).toHaveBeenCalledTimes(2)
    await flush()
    expect(second['sys_stale'].value).toEqual([{ label: '新值', labelZh: '新值', labelEn: '', value: '2' }])
  })

  it('locale=en-US：有英文标签用英文，英文缺失回退中文标签', async () => {
    h.getLanguage.mockReturnValue('en-US')
    h.getDicts.mockResolvedValue({
      data: [
        { dictLabel: '男', dictLabelEn: 'Male', dictValue: '0', listClass: 'primary', cssClass: 'tag-a' },
        { dictLabel: '未知', dictValue: '2' },
        { dictLabel: '女', dictLabelEn: '', dictValue: '1' },
        { dictLabel: '空值项', dictLabelEn: 'Empty' }
      ]
    })

    const res = useDict('sys_en_fallback')
    await flush()

    expect(h.getLanguage).toHaveBeenCalled()
    const items = res['sys_en_fallback'].value
    expect(items).toHaveLength(4)
    expect(items[0]).toEqual({
      label: 'Male',
      labelZh: '男',
      labelEn: 'Male',
      value: '0',
      elTagType: 'primary',
      elTagClass: 'tag-a'
    })
    // 英文标签缺失 → 回退中文，且原始中英文字段保留（locale 切换无需重查）
    expect(items[1]).toEqual({ label: '未知', labelZh: '未知', labelEn: '', value: '2' })
    expect(items[1].elTagType).toBeUndefined()
    expect(items[2].label).toBe('女')
    // dictValue 缺失 → 归一为空串
    expect(items[3]).toEqual({ label: 'Empty', labelZh: '空值项', labelEn: 'Empty', value: '' })
  })

  it('locale=zh-CN：即使有英文标签也取中文', async () => {
    h.getLanguage.mockReturnValue('zh-CN')
    h.getDicts.mockResolvedValue({ data: [{ dictLabel: '男', dictLabelEn: 'Male', dictValue: '0' }] })

    const res = useDict('sys_zh_label')
    await flush()

    expect(res['sys_zh_label'].value).toEqual([{ label: '男', labelZh: '男', labelEn: 'Male', value: '0' }])
    expect(res['sys_zh_label'].value[0].elTagClass).toBeUndefined()
  })

  it('底层请求失败：结果为空数组且不抛出，再次调用会重新请求（.finally 清理 rejected Promise）', async () => {
    h.getDicts.mockRejectedValueOnce(new Error('字典服务不可用'))

    const res = useDict('sys_fail')
    await flush()
    expect(res['sys_fail'].value).toEqual([])
    expect(useDictStore().getDict('sys_fail')).toBeNull()

    h.getDicts.mockResolvedValueOnce({ data: [{ dictLabel: '恢复', dictValue: '9' }] })
    const retry = useDict('sys_fail')
    expect(h.getDicts).toHaveBeenCalledTimes(2)
    await flush()
    expect(retry['sys_fail'].value).toEqual([{ label: '恢复', labelZh: '恢复', labelEn: '', value: '9' }])
  })

  it('后端 data 缺失（undefined/null）时映射为空数组而不是抛错', async () => {
    h.getDicts.mockResolvedValueOnce({}).mockResolvedValueOnce({ data: null })

    const a = useDict('sys_no_data')
    const b = useDict('sys_null_data')
    await flush()

    expect(a['sys_no_data'].value).toEqual([])
    expect(b['sys_null_data'].value).toEqual([])
    expect(useDictStore().getDict('sys_no_data')).toEqual([])
  })
})
