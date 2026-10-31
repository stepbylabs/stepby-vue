import { reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useSortArrow } from '@/composables/useSortArrow'

/**
 * 箭头必须跟着"页面真正下发的排序"走。绑静态常量时，表格重挂载后箭头显示的是常量方向，
 * 而数据是上一次点击的方向 —— 界面在说谎（b140 真机实测 `aria-sort="descending"` 配
 * `isAsc=ascending`）。这一族判据钉的就是"派生"而不是"常量"。
 */
describe('useSortArrow：箭头由真正下发的排序参数派生', () => {
  it('① 有排序参数时直接派生（两种风格都认）', () => {
    const q = ref({ orderByColumn: 'loginTime', isAsc: 'ascending' })
    expect(useSortArrow(q).value).toEqual({ prop: 'loginTime', order: 'ascending' })
    const s = ref({ orderByColumn: 'operTime', isAsc: 'desc' })
    expect(useSortArrow(s).value).toEqual({ prop: 'operTime', order: 'descending' })
  })

  it('② 参数变化必须跟着变（翻页保留 / URL 恢复 / 点击后回灌）', () => {
    const q = ref<{ orderByColumn?: string; isAsc?: string }>({})
    const arrow = useSortArrow(q)
    expect(arrow.value, '没有排序请求时不得凭空造出方向').toEqual({})
    q.value = { orderByColumn: 'createTime', isAsc: 'descending' }
    expect(arrow.value).toEqual({ prop: 'createTime', order: 'descending' })
    q.value = {}
    expect(arrow.value, '清空参数后箭头必须一起清空').toEqual({})
  })

  it('③ 只有列名没有方向（或反之）不算方向 —— 半截事实不得画成箭头', () => {
    expect(useSortArrow(ref({ orderByColumn: 'loginTime', isAsc: undefined })).value).toEqual({})
    expect(useSortArrow(ref({ orderByColumn: undefined, isAsc: 'asc' })).value).toEqual({})
  })

  it('④ fallback 取函数：页面默认常量被 resetQuery 改写后必须跟着生效', () => {
    const q = ref<{ orderByColumn?: string; isAsc?: string }>({})
    const pageDefault = ref({ prop: 'loginTime', order: 'descending' })
    const arrow = useSortArrow(q, () => pageDefault.value)
    expect(arrow.value, '无请求时回退页面默认').toEqual({ prop: 'loginTime', order: 'descending' })
    // 传值（一次性快照）就是这个断言的对照组：改写常量后箭头仍停在旧值
    pageDefault.value = { prop: 'createTime', order: 'ascending' }
    expect(arrow.value).toEqual({ prop: 'createTime', order: 'ascending' })
    q.value = { orderByColumn: 'loginTime', isAsc: 'asc' }
    expect(arrow.value, '有真正下发的排序时，页面默认必须让位').toEqual({ prop: 'loginTime', order: 'ascending' })
  })

  it('⑤ 接 reactive 对象（个人中心面板的写法）', () => {
    const q = reactive({ orderByColumn: 'loginTime', isAsc: 'desc' })
    const arrow = useSortArrow(q)
    expect(arrow.value).toEqual({ prop: 'loginTime', order: 'descending' })
    q.isAsc = 'asc'
    expect(arrow.value).toEqual({ prop: 'loginTime', order: 'ascending' })
  })

  it('⑥ 参数值不是字符串（URL 恢复出的畸形/数字形状）一律按"无方向"', () => {
    expect(
      useSortArrow(ref<{ orderByColumn?: unknown; isAsc?: unknown }>({ orderByColumn: 12, isAsc: true })).value
    ).toEqual({})
  })
})
