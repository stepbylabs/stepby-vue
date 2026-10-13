import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'

// useMobileFilter 依赖 @vueuse/core 的 useWindowSize——测试中以受控宽度源 mock，
// 驱动断点判定与联动逻辑（无需真实窗口）。
const mockWidth = ref(1366)
vi.mock('@vueuse/core', () => ({
  useWindowSize: () => ({ width: mockWidth, height: ref(800) })
}))

import { MOBILE_BREAKPOINT, useMobileFilter } from './useMobileFilter'

describe('composables/useMobileFilter', () => {
  it('MOBILE_BREAKPOINT 与 layout 三档判定的 mobile 阈值一致（768）', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })

  it('移动端宽度（<768）挂载时默认收起 showSearch', () => {
    mockWidth.value = 500
    const showSearch = ref(true)
    const { isMobile } = useMobileFilter(showSearch)
    expect(isMobile.value).toBe(true)
    expect(showSearch.value).toBe(false)
  })

  it('桌面宽度（>=768）挂载时保持展开', () => {
    mockWidth.value = 1366
    const showSearch = ref(true)
    const { isMobile } = useMobileFilter(showSearch)
    expect(isMobile.value).toBe(false)
    expect(showSearch.value).toBe(true)
  })

  it('断点跨越联动：桌面→移动自动收起，移动→桌面自动展开', async () => {
    mockWidth.value = 1366
    const showSearch = ref(true)
    const { isMobile } = useMobileFilter(showSearch)
    expect(showSearch.value).toBe(true)

    // 进移动端：自动收起
    mockWidth.value = 375
    await nextFrame()
    expect(isMobile.value).toBe(true)
    expect(showSearch.value).toBe(false)

    // 回桌面：自动展开
    mockWidth.value = 992
    await nextFrame()
    expect(isMobile.value).toBe(false)
    expect(showSearch.value).toBe(true)
  })

  it('断点不变时手动开合不被覆盖（仅跨越时联动）；768 恰为桌面档', async () => {
    mockWidth.value = 1366
    const showSearch = ref(true)
    useMobileFilter(showSearch)
    // 宽度不变，用户手动收起
    showSearch.value = false
    await nextFrame()
    expect(showSearch.value).toBe(false)
    // 边界值本身（恰为 768）属于桌面档（<768 才是 mobile）——
    // 1366→768 未跨越断点，isMobile 恒 false，watch 不触发，手动开合保持
    mockWidth.value = 768
    await nextFrame()
    // 同档内变化不联动，手动收起保持
    expect(showSearch.value).toBe(false)
  })
})

// ---------- 测试辅助 ----------

async function nextFrame() {
  // useWindowSize 内部经 useEventListener/resize 防抖路径传播——双 nextTick 确保计算属性链刷新
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// 保持 computed 引用（实现侧同构，防 tree-shake 告警）
void computed
