/**
 * 「会话过期」拒绝的**产出形状**契约测试（批八十六）
 *
 * 立案证据（本批诊断脚本实测，非推断）：令牌失效后冷加载 `/index`，用户落在 /500 服务器
 * 错误页——`document.cookie` 里那条死 `Admin-Token` 原样残留，WS 还在用死令牌反复重连。
 *
 * 根因是两条通道形状不一致：
 * - 400/403/404/429/503 ⇒ `Promise.reject(error)`（原样 axios error，`error.response.status` 在）
 * - 401 ⇒ `Promise.reject(new Error(t('common.sessionExpired')))`（重写译文，`response` 整条丢失）
 *
 * 而 `src/permission.ts` 判"该登出"用的正是 `err.response.status`，于是守卫里那条
 * `if (httpStatus === 401) { await logOut(); return { path: '/' } }` **从来没有生效路径**，
 * 只能落到兜底的 `/500`。`src/permission.test.ts` 的 ④ 组一直绿，是因为它把夹具写成了
 * `{ response: { status: 401 } }`——**测试造的是拦截器从不产出的形状**（AGENTS 前言 ⑬：
 * "锁的输入非空且形状对"与"锁的结论对"是两件事）。所以这里锁的是**产出侧**，
 * 与守卫侧的用例合起来才是同一条契约的两头。
 *
 * 三层判据：
 * ① 真实 service + 桩适配器（口径同 `request.retryAfter.test.ts`）：HTTP 401 与
 *    HTTP 200+`body.code=401` 两条通道都必须带上 `httpStatus = 401`，并**同时**证明
 *    `response` 确实丢了（不然"补标记"这件事本身没被约束）。
 * ② 对照组：`/login` 与 `/lock` 上的 401 是**凭据错误**（密码错），不是会话过期，
 *    不得带标记——否则"密码打错"会被守卫读成"该登出"。
 * ③ 静态锁：`request.ts` 里不得再有裸 `new Error(t('common.sessionExpired'))`
 *    （新增第 6 个 reject 点时习惯性地裸写，就是本批修掉的那个形状），含合成违规自证。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AxiosError, type AxiosResponse } from 'axios'
import service, { isRelogin } from '@/utils/request'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 用桩适配器把请求真跑一遍「适配器 → 响应拦截器」，返回最终逸出的错误 */
async function rejectWith401(via: 'http' | 'body'): Promise<unknown> {
  const prev = service.defaults.adapter
  service.defaults.adapter = async (config) => {
    const data = { code: 401, msg: via === 'http' ? '无效的会话，请重新登录' : '请求未携带 token，请重新登录' }
    // `request` 必须给：成功拦截器第一句就读 `res.request.responseType`（blob 侧道），
    // 桩适配器少了这个字段会以 TypeError 逸出，测到的就不是 401 分支（本批首跑实测）。
    const response = {
      status: via === 'http' ? 401 : 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
      data
    } as unknown as AxiosResponse
    if (via === 'http') {
      throw new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_REQUEST, config, {}, response)
    }
    return response
  }
  try {
    await service.get('/__session_expired_probe__')
    return undefined
  } catch (e) {
    return e
  } finally {
    service.defaults.adapter = prev
  }
}

describe('① HTTP 401（restful 档）与 body.code=401（legacy 档）两条通道', () => {
  const withReloginSuppressed = <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = isRelogin.show
    isRelogin.show = true
    return fn().finally(() => {
      isRelogin.show = prev
    })
  }

  it('HTTP 401 ⇒ 带 httpStatus=401，且 response 确实已丢失（补标记的前提）', async () => {
    const e = (await withReloginSuppressed(() => rejectWith401('http'))) as AxiosError & { httpStatus?: number }
    expect(e).toBeInstanceOf(Error)
    // 这条断言是"为什么需要标记"的实测前提：若哪天拦截器改回原样 reject，
    // 标记就成了冗余，本断言会先红，提示两头都要重看。
    expect(e.response, '401 通道重写译文后 response 必须为 undefined').toBeUndefined()
    expect(e.httpStatus).toBe(401)
    expect(e.message).not.toContain('Request failed with status code')
  })

  it('HTTP 200 + body.code=401 ⇒ 同样带 httpStatus=401（两条通道同一条契约）', async () => {
    const e = (await withReloginSuppressed(() => rejectWith401('body'))) as AxiosError & { httpStatus?: number }
    expect(e).toBeInstanceOf(Error)
    expect(e.httpStatus).toBe(401)
  })

  it('对照：403 原样 reject axios error，response.status 仍在（守卫按老通道读得到）', async () => {
    const prev = service.defaults.adapter
    service.defaults.adapter = async (config) => {
      const response = {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config,
        data: { code: 403, msg: '没有权限访问该资源' }
      } as unknown as AxiosResponse
      throw new AxiosError('Request failed with status code 403', AxiosError.ERR_BAD_REQUEST, config, {}, response)
    }
    let e: (AxiosError & { httpStatus?: number }) | undefined
    try {
      await service.get('/__forbidden_probe__')
    } catch (err) {
      e = err as AxiosError & { httpStatus?: number }
    } finally {
      service.defaults.adapter = prev
    }
    expect(e?.response?.status).toBe(403)
    // 未改写通道不得凭空造标记：403 的判据仍由 response.status 提供
    expect(e?.httpStatus).toBeUndefined()
  })
})

describe('② 凭据类 401 不得被标成"会话过期"', () => {
  /** 用 history.pushState 改 pathname：拦截器读 window.location.pathname 分派文案 */
  const atPath = async <T>(p: string, fn: () => Promise<T>): Promise<T> => {
    const prev = window.location.pathname
    window.history.pushState({}, '', p)
    try {
      return await fn()
    } finally {
      window.history.pushState({}, '', prev)
    }
  }

  it('/login 上的 401 = 用户名或密码错误：译文与标记都必须不同于会话过期', async () => {
    await atPath('/login', async () => {
      const e = (await rejectWith401('http')) as AxiosError & { httpStatus?: number }
      expect((e as Error).message).not.toBe('')
      expect(e.httpStatus, '密码错误不得触发守卫登出').toBeUndefined()
    })
  })

  it('/lock 上无 token 的 401 = 令牌失效引导重登：同样不得带 httpStatus（组件层自行提示）', async () => {
    await atPath('/lock', async () => {
      const e = (await rejectWith401('http')) as AxiosError & { httpStatus?: number }
      expect(e.httpStatus).toBeUndefined()
    })
  })
})

describe('③ 静态锁：裸写会话过期 Error 必须为 0 处', () => {
  const source = readFileSync(path.join(HERE, 'request.ts'), 'utf8')
  const BARE = /new Error\(t\('common\.sessionExpired'\)\)/g
  const WRAPPED = /sessionExpiredError\(/g

  it('真实文件：裸写 0 处、包装点 ≥5 处（面自证：扫不到文件与扫到但为空必须可区分）', () => {
    const bare = source.match(BARE)?.length ?? 0
    const wrapped = source.match(WRAPPED)?.length ?? 0
    expect(bare, '会话过期拒绝必须一律经过 sessionExpiredError()').toBe(0)
    // 现状实测 5 个 reject 站点（对话框确认 ×2、直接 reject ×2、队列 60s 超时兜底 ×1）
    expect(wrapped, '包装点数低于 5 说明扫描面或站点被删，两头都要重看').toBeGreaterThanOrEqual(5)
  })

  it('合成违规：把包装改回裸写必须被抓到（否则上面那条是虚锁）', () => {
    const synthetic = source.replace(
      /sessionExpiredError\(t\('common\.sessionExpired'\)\)/,
      "new Error(t('common.sessionExpired'))"
    )
    expect(synthetic).not.toBe(source)
    expect(synthetic.match(BARE)?.length ?? 0).toBe(1)
  })

  it('反证：无关文本里的同名串不得误报（按名字子串匹配会把注释也算成违规）', () => {
    expect("const msg = t('common.sessionExpired') // new Error 已废弃".match(BARE)?.length ?? 0).toBe(0)
  })
})
