/**
 * en-US 按需加载的启动/失败/竞态语义（b121）。
 *
 * 这些用例都必须用 `vi.resetModules()` 拿一份**未被其他用例预热过**的模块：
 * 语言包一旦装进模块级 `loadedLocales`，失败路径与竞态路径就不再存在。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { muteComments } from '@/utils/e2eSuiteScanKit'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const KEY = 'language'
const EN_LOCALE = '@/i18n/locales/en-US'
const WEB_STORAGE = '@/utils/webStorage'

async function freshI18n(): Promise<typeof import('@/i18n')> {
  vi.resetModules()
  return await import('@/i18n')
}

describe('i18n 懒加载语言包', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'
  })

  afterEach(() => {
    vi.doUnmock(EN_LOCALE)
    vi.doUnmock(WEB_STORAGE)
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'
  })

  it('启动：已保存 en-US ⇒ ensure 之后英文生效（含 <html lang> 与真实译文）', async () => {
    localStorage.setItem(KEY, 'en-US')
    const mod = await freshI18n()
    // 未 ensure 之前不谎报：locale 仍是默认中文
    expect(mod.getLanguage()).toBe('zh-CN')
    const effective = await mod.ensureInitialLocale()
    expect(effective).toBe('en-US')
    expect(mod.getLanguage()).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
    expect(mod.default.global.t('common.search')).toBe('Search')
  })

  it('启动：非法持久化值回落 zh-CN，且不改写用户存储', async () => {
    localStorage.setItem(KEY, 'fr')
    const mod = await freshI18n()
    expect(await mod.ensureInitialLocale()).toBe('zh-CN')
    expect(mod.getLanguage()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(localStorage.getItem(KEY)).toBe('fr')
  })

  it('启动：语言包加载失败 ⇒ 以中文启动、偏好保留、<html lang> 不谎报', async () => {
    localStorage.setItem(KEY, 'en-US')
    vi.doMock(EN_LOCALE, () => {
      throw new Error('load boom')
    })
    const mod = await freshI18n()
    const effective = await mod.ensureInitialLocale()
    expect(effective).toBe('zh-CN')
    expect(mod.getLanguage()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(localStorage.getItem(KEY)).toBe('en-US')
  })

  it('切换失败：setLanguage 返回 ok=false 且保留原语言（调用方据此报错）', async () => {
    vi.doMock(EN_LOCALE, () => {
      throw new Error('load boom')
    })
    const mod = await freshI18n()
    const result = await mod.setLanguage('en-US')
    expect(result).toEqual({ ok: false, applied: false, persisted: false })
    expect(mod.getLanguage()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('结局归一：四种结局各归其位（组件只做映射，不自行组合布尔）', async () => {
    const { switchOutcome } = await import('@/i18n')
    expect(switchOutcome({ ok: false, applied: false, persisted: false })).toBe('failed')
    expect(switchOutcome({ ok: true, applied: false, persisted: false })).toBe('superseded')
    expect(switchOutcome({ ok: true, applied: true, persisted: true })).toBe('switched')
    expect(switchOutcome({ ok: true, applied: true, persisted: false })).toBe('switched-not-persisted')
  })

  it('持久化失败：仍切换但 persisted=false（提示"偏好未保存"而不是成功）', async () => {
    vi.doMock(WEB_STORAGE, async (importOriginal) => {
      const original = await importOriginal<typeof import('@/utils/webStorage')>()
      return { ...original, setItem: () => false }
    })
    const mod = await freshI18n()
    const result = await mod.setLanguage('en-US')
    expect(result).toEqual({ ok: true, applied: true, persisted: false })
    expect(mod.getLanguage()).toBe('en-US')
  })

  it('连点竞态：最后一次点击生效，旧票据不得覆盖新选择', async () => {
    const mod = await freshI18n()
    // zh-CN 已内置（微任务完成），en-US 要真正加载（至少一个宏任务）⇒ 后者先落地
    const first = mod.setLanguage('en-US')
    const second = mod.setLanguage('zh-CN')
    const [r1, r2] = await Promise.all([first, second])
    expect(r2.applied).toBe(true)
    expect(r1.applied).toBe(false)
    expect(mod.getLanguage()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('加载超时：不把启动永久挂住（超时回落中文，偏好保留）', async () => {
    vi.useFakeTimers()
    localStorage.setItem(KEY, 'en-US')
    // 一个永不 resolve 的模块工厂 ⇒ 动态 import 挂住，只能靠超时通道退出
    vi.doMock(EN_LOCALE, () => new Promise(() => {}) as never)
    const mod = await freshI18n()
    const pending = mod.ensureInitialLocale()
    await vi.advanceTimersByTimeAsync(8000)
    expect(await pending).toBe('zh-CN')
    expect(mod.getLanguage()).toBe('zh-CN')
    expect(localStorage.getItem(KEY)).toBe('en-US')
  })
})

/**
 * 接线形状：上面那些行为用例证明"现在的实现是对的"，但抓不住"有人把它改回去且用例仍绿"。
 * 这三条锁住的是资产本身的形状（动态 import / 启动顺序 / 三结局消费），
 * 改回任何一种坏形态都当场红——其中"en-US 退回静态 import"不会让 560KB 首屏预算立刻超限
 * （实测 499.1 + 45.8 = 544.9 < 560），所以必须由形状锁而不是体积预算来守。
 */
describe('懒加载接线形状', () => {
  it('en-US 必须动态 import，不得静态进包', () => {
    // 刀口只落在代码上：注释里提到 `import enUS from …` 不算违规（本仓有过注释决定刀口的事故）
    const src = muteComments(readFileSync(resolve(ROOT, 'src/i18n/index.ts'), 'utf8'))
    expect(src).toMatch(/\(\)\s*=>\s*import\('\.\/locales\/en-US'\)/)
    expect(src).not.toMatch(/^import\s+\w+\s+from\s+'\.\/locales\/en-US'/m)
  })

  it('main.ts 必须在 app.use(router) 之前 await ensureInitialLocale（否则首帧语言闪烁）', () => {
    const main = muteComments(readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8'))
    const ensure = main.indexOf('await ensureInitialLocale()')
    const router = main.indexOf('app.use(router)')
    expect(ensure).toBeGreaterThan(-1)
    expect(router).toBeGreaterThan(-1)
    expect(ensure).toBeLessThan(router)
  })

  it('LangSelect 必须经 switchOutcome 消费四种结局（不得自行组合布尔）', () => {
    const sfc = muteComments(readFileSync(resolve(ROOT, 'src/components/LangSelect/index.vue'), 'utf8'))
    expect(sfc).toMatch(/switchOutcome\(await setLanguage\(/)
    for (const kind of ["'failed'", "'superseded'", "'switched'", "'switched-not-persisted'"]) {
      expect(sfc).toContain(kind)
    }
  })
})
