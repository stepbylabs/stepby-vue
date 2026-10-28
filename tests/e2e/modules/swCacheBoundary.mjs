/**
 * 模块 96（b115）：Service Worker 的持久缓存必须与会话同生共灭。
 *
 * ## 立的案（真机取证，台账 b115 §1）
 *
 * 旧 `vite/plugins/pwa.ts` 有两条运行时规则：
 * - `/(\/dev-api\/|\/prod-api\/|\/stage-api\/)/` → NetworkFirst，缓存名 `stepby-api`，TTL 1h；
 * - `/\.(png|jpg|jpeg|gif|webp|svg|woff2?)$/` → StaleWhileRevalidate，缓存名 `stepby-static`，TTL 7d。
 *
 * 它们分别击穿了两条服务端已经声明过的边界：
 * - API 响应带 `Cache-Control: no-store, no-cache, must-revalidate, private`
 *   （`middleware/security_headers.rs`，"防止敏感数据通过缓存泄漏"）——SW 照存；
 * - `/uploads/{tid}/{kind}/{file}` 是**受鉴权**的预览路由（不带凭据 401）——扩展名规则照存，
 *   而且是 cache-first（先给缓存、后台再校验）。
 *
 * 实测（`tests/e2e/_tmp/probe-b115-sw-cache.mjs` / `-sw-uploads.mjs`）：
 * 在线取一次 `GET /prod-api/getInfo` ⇒ `stepby-api` 里出现该 URL；断网再取 ⇒ **200 / 744B / 3ms**；
 * 上传一张 1×1 PNG 后取预览 ⇒ `stepby-static` 命中 200；断网再取 ⇒ **200 / 70B / 4ms**。
 * 全仓 `caches.delete` 一处都没有 ⇒ 换账号 / 登出后按返回键，上一账号的数据仍在缓存里可读。
 *
 * ## 为什么本模块自建浏览器上下文
 *
 * 主套件（`createPage`）刻意设了 `serviceWorkers: 'block'`——SW 会代理页面 fetch、绕过
 * `page.route`，M25「按住列表响应造骨架屏」就是这么被它判成工具自曝的。本模块要测的**正是 SW**，
 * 所以只能开一个 `serviceWorkers: 'allow'` 的独立 context，做完即关（不影响主页面）。
 *
 * ## 七条判据，两向都判
 *
 * 1. SW 真的在本页生效（`activated` + 有 controller）——否则后面六条都是空转（前言 ⑥）；
 * 2. 受鉴权 GET 之后：`stepby-api*` 一个都不存在，且该 URL 不在任何缓存里；
 * 3. 受鉴权上传预览取回 200 之后：同样不进任何缓存（含"扩展名规则"这条历史击穿面）；
 * 4. 断网：上面两个 URL 必须**失败**（不再静默回放旧响应）；
 * 5. 迁移通道：手工塞回两个历史缓存名 ⇒ 刷新页面 ⇒ 启动回收必须把它们删掉
 *    （老用户浏览器里已经装过旧 SW，光改配置不清存量等于没修）；
 * 6. 对照组（两向）：公共静态目录的运行时缓存**仍然生效**——取一个不在 precache 面上的
 *    真实资源（构建产物的 `webp/gif` 哈希名，precache 的 glob 不含这两种扩展名，只能靠运行时规则），
 *    在线取一次后必须进 `stepby-public-static`，断网再取必须还能命中；
 *    证明"不缓存 API"没有顺手把 PWA 的静态缓存关掉。
 *
 * 夹具自带回收：上传的 PNG 在 finally 里 `DELETE /system/file/delete`；断网与 context 一并恢复。
 */

/** 历史缓存名：与 `src/utils/swCache.ts` 的 `LEGACY_SW_CACHES` 同值（跨语言只能靠判据对账） */
const LEGACY_CACHES = ['stepby-api', 'stepby-static']

/** 公共静态运行时缓存名：与 `src/utils/swCache.ts` 的 `PUBLIC_STATIC_CACHE` 同值 */
const PUBLIC_STATIC_CACHE = 'stepby-public-static'

/**
 * precache 面的扩展名（`vite/plugins/pwa.ts` 的 `globPatterns`）。
 * webp / gif 不在其中 ⇒ 只能靠运行时规则缓存，正好用来判对照组。
 */
const PRECACHED_EXT_RE = /\.(?:js|html|css|svg|ico|png|woff2|eot|ttf)$/i

/** `setOffline(true)` 造成的网络错误是**本模块自己制造的**，只豁免这一条（窄匹配） */
const SELF_INFLICTED = [/ERR_INTERNET_DISCONNECTED/]

export function makeSwCacheBoundaryTest(ctx) {
  const { record, log, CONFIG, checkConsoleErrors, getApiToken, login, attachConsoleCollector } = ctx
  const M = 96

  /** 轮询到条件成立（避免"看一眼"式软断言）；每次读数都带硬超时，防止 evaluate 永久挂起 */
  async function pollUntil(fn, { timeout = 15000, every = 150 } = {}) {
    const t0 = Date.now()
    let last = null
    while (Date.now() - t0 < timeout) {
      try {
        last = await fn()
        if (last && last.ok) return { ...last, ms: Date.now() - t0 }
      } catch (err) {
        last = { ok: false, reason: String(err).slice(0, 120) }
      }
      await new Promise((r) => setTimeout(r, every))
    }
    return { ...(last || { ok: false, reason: '未取到读数' }), ms: Date.now() - t0 }
  }

  /** 读 Cache Storage 现状：缓存名集合 + 指定 URL 在任意缓存里的命中状态 */
  async function readCacheState(page, urls) {
    return page.evaluate(async (list) => {
      const keys = await caches.keys()
      const hits = {}
      for (const u of list) {
        const res = await caches.match(u)
        hits[u] = res ? res.status : null
      }
      return { keys, hits }
    }, urls)
  }

  return async function testModule96(page, consoleErrors, pageErrors) {
    log(`\n=== 模块 ${M}: Service Worker 缓存边界（b115） ===`)
    const browser = page.context().browser()
    let swCtx = null
    let swPage = null
    let token = null
    let uploaded = null
    let offlineSet = false

    try {
      // ── 96.0 自建 context：必须允许 SW（主套件刻意 block）
      swCtx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
        serviceWorkers: 'allow'
      })
      swPage = await swCtx.newPage()
      // 与主套件**同一份**分诊口径（含浏览器扩展注入的 CSP 字体噪声）——
      // 自己写一份裸 listener 就会把它们判成产品红（前言 ㉘：两份实现必然漂）
      attachConsoleCollector(swPage, consoleErrors, pageErrors)

      const logged = await login(swPage)
      record(M, '96.0 前置: 独立 context 登录成功', !!logged, logged ? 'ok' : 'login 返回 false')
      if (!logged) {
        checkConsoleErrors(consoleErrors, pageErrors, M, SELF_INFLICTED)
        return
      }

      // ── 96.1 SW 必须真的生效（否则后续全在空转）
      const sw = await pollUntil(
        () =>
          swPage.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return { ok: false, reason: '浏览器没有 serviceWorker' }
            const reg = await Promise.race([
              navigator.serviceWorker.ready,
              new Promise((r) => setTimeout(() => r(null), 4000))
            ])
            if (!reg || !reg.active) return { ok: false, reason: '没有 active 注册（ready 超时或未注册）' }
            return {
              ok: reg.active.state === 'activated' && !!navigator.serviceWorker.controller,
              state: reg.active.state,
              controller: !!navigator.serviceWorker.controller,
              script: reg.active.scriptURL
            }
          }),
        { timeout: 25000 }
      )
      record(
        M,
        '96.1 SW 已激活且已接管本页',
        sw.ok,
        `state=${sw.state} / controller=${sw.controller} / 落定 ${sw.ms}ms${sw.ok ? '' : ` / ${sw.reason || ''}`}`
      )
      if (!sw.ok) {
        // 没有 controller，后面每一条都会"什么都没发生"地绿——直接返回，避免假绿
        checkConsoleErrors(consoleErrors, pageErrors, M, SELF_INFLICTED)
        return
      }

      token = await getApiToken()
      record(M, '96.2 前置: 取得 API 令牌', !!token, token ? 'ok' : 'getApiToken 返回空')

      // ── 96.3 受鉴权 GET（历史 API 规则会命中 /prod-api 前缀）
      const apiUrl = '/prod-api/getInfo'
      const apiProbe = await swPage.evaluate(async (t) => {
        const r = await fetch('/prod-api/getInfo', { headers: { Authorization: `Bearer ${t}` } })
        const txt = await r.text()
        return { status: r.status, len: txt.length, cacheControl: r.headers.get('cache-control') }
      }, token)
      log(`  受鉴权 GET ${apiUrl} → ${apiProbe.status} / ${apiProbe.len}B / cache-control=${apiProbe.cacheControl}`)

      const afterApi = await readCacheState(swPage, [apiUrl])
      record(
        M,
        '96.3 受鉴权 API 响应不进任何缓存',
        apiProbe.status === 200 &&
          afterApi.hits[apiUrl] === null &&
          !afterApi.keys.some((k) => k.startsWith('stepby-api')),
        `缓存名=${afterApi.keys.join('|') || '(空)'} / 命中=${afterApi.hits[apiUrl]}`
      )

      // ── 96.4 受鉴权上传预览（历史扩展名规则会命中它）
      let uploadUrl = null
      if (token) {
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        const fd = new FormData()
        fd.append('file', new Blob([png], { type: 'image/png' }), 'e2e96-probe.png')
        const upResp = await fetch(`${CONFIG.backendUrl}/system/file/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        })
        const upBody = await upResp.json().catch(() => ({}))
        uploaded = upBody?.data || upBody
        uploadUrl = uploaded?.url || null
      }
      if (uploadUrl) {
        const imgProbe = await swPage.evaluate(
          async ({ u, t }) => {
            const r = await fetch(u, { headers: { Authorization: `Bearer ${t}` } })
            const buf = await r.arrayBuffer()
            return { status: r.status, bytes: buf.byteLength }
          },
          { u: uploadUrl, t: token }
        )
        const afterImg = await readCacheState(swPage, [uploadUrl])
        record(
          M,
          '96.4 受鉴权的上传预览不进任何缓存',
          imgProbe.status === 200 &&
            afterImg.hits[uploadUrl] === null &&
            !afterImg.keys.some((k) => k.startsWith('stepby-static')),
          `${uploadUrl} → ${imgProbe.status} / ${imgProbe.bytes}B / 命中=${afterImg.hits[uploadUrl]} / 缓存名=${afterImg.keys.join('|') || '(空)'}`
        )
      } else {
        record(M, '96.4 受鉴权的上传预览不进任何缓存', false, '上传夹具未创建（无法证明扩展名规则的击穿面已关闭）')
      }

      // ── 96.5 断网：两个 URL 都必须失败（不再静默回放）
      await swCtx.setOffline(true)
      offlineSet = true
      const offline = await swPage.evaluate(
        async ({ api, img, t }) => {
          const one = async (u) => {
            try {
              const r = await fetch(u, { headers: { Authorization: `Bearer ${t}` } })
              return { ok: true, status: r.status }
            } catch (e) {
              return { ok: false, err: String(e).slice(0, 60) }
            }
          }
          return { api: await one(api), img: img ? await one(img) : { ok: false, err: '无夹具' } }
        },
        { api: apiUrl, img: uploadUrl, t: token }
      )
      await swCtx.setOffline(false)
      offlineSet = false
      record(
        M,
        '96.5 断网时受鉴权资源不再回放缓存（API 与上传预览都必须失败）',
        !offline.api.ok && !offline.img.ok,
        `API=${offline.api.ok ? `回放 ${offline.api.status}` : '失败'} / 图片=${offline.img.ok ? `回放 ${offline.img.status}` : '失败'}`
      )

      // ── 96.6 迁移通道：手工塞回历史缓存 ⇒ 刷新页面 ⇒ 启动回收必须清掉
      const seeded = await swPage.evaluate(async (names) => {
        for (const n of names) {
          const c = await caches.open(n)
          await c.put(`/${n}/e2e96-seed`, new Response('seed', { status: 200 }))
        }
        return caches.keys()
      }, LEGACY_CACHES)
      log(`  已塞入历史缓存：${JSON.stringify(seeded)}`)
      await swPage.reload({ waitUntil: 'domcontentloaded' })
      const purged = await pollUntil(async () => {
        const keys = await swPage.evaluate(() => caches.keys())
        const left = keys.filter((k) => LEGACY_CACHES.includes(k))
        return { ok: left.length === 0, keys, left }
      })
      record(
        M,
        '96.6 启动回收：历史缓存（stepby-api / stepby-static）刷新后被删除',
        purged.ok,
        `残留=${JSON.stringify(purged.left || [])} / 现状=${(purged.keys || []).join('|') || '(空)'} / 落定 ${purged.ms}ms`
      )

      // ── 96.7 对照组（两向）：公共静态目录的运行时缓存仍然生效
      //
      // 刻意不写死资源名：构建产物是哈希命名的（`/static/webp/profile-<hash>.webp`），
      // 写死一个哈希等于每次重建都让判据红一次（"判据变旧"而不是"产品坏了"）。
      // 判据从**页面真实加载过的资源**里派生一个：命中公共静态目录、且**不在 precache 面上**
      // （precache 的 glob 是 `**/*.{js,html,css,svg,ico,png,woff2,eot,ttf}`，webp/gif 不在其中
      //  ⇒ 它们只能靠运行时规则缓存，正是本对照组要证明的那一条）。
      //
      // 第一版拿 `/pwa/icon.svg` 当对照，实测**必然红**：它既在 precache 清单里（由 precache 路由
      // 直接服务，永远走不到运行时规则），页面也从不去取它（图标只在安装 PWA 时才被浏览器拉）。
      // 两条里任一条都足以让这条断言恒假——照着一张恒假的红去"修产品"只会改错地方。
      await swPage.waitForSelector('.app-main', { timeout: 15000 }).catch(() => {})
      const derived = await pollUntil(() =>
        swPage.evaluate((precachedReSource) => {
          const precached = new RegExp(precachedReSource, 'i')
          const sameOrigin = performance
            .getEntriesByType('resource')
            .map((e) => {
              try {
                return new URL(e.name)
              } catch {
                return null
              }
            })
            .filter(
              (u) =>
                u &&
                u.origin === location.origin &&
                /^\/(?:static|assets|pwa)\//.test(u.pathname) &&
                !precached.test(u.pathname)
            )
          if (!sameOrigin.length) {
            return {
              ok: false,
              reason: `本页加载的资源里没有"公共静态目录且非 precache"的资源（共 ${performance.getEntriesByType('resource').length} 条）`
            }
          }
          return { ok: true, url: sameOrigin[0].pathname }
        }, PRECACHED_EXT_RE.source)
      )
      const controlUrl = derived.ok ? derived.url : null
      log(`  对照组资源（派生自本页真实请求）：${controlUrl || derived.reason}`)

      let control = { ok: false, hit: null, keys: [], offline: null, ms: derived.ms }
      if (controlUrl) {
        // 受控之后再显式取一次：SWR 是"先给缓存、后台重取"，只有**经过 SW** 的请求才会入库
        const first = await swPage.evaluate(async (u) => {
          const r = await fetch(u)
          return { status: r.status, type: r.type }
        }, controlUrl)
        control = await pollUntil(async () => {
          const cacheState = await swPage.evaluate(
            async ({ u, name }) => {
              const c = await caches.open(name)
              const hit = await c.match(u)
              return { hit: hit ? hit.status : null, keys: await caches.keys() }
            },
            { u: controlUrl, name: PUBLIC_STATIC_CACHE }
          )
          return {
            ok: first.status === 200 && cacheState.hit === 200,
            hit: cacheState.hit,
            keys: cacheState.keys,
            first
          }
        })

        // 第二向：断网再取必须还能命中（这才是"PWA 静态缓存没被砍"的实证）
        if (control.ok) {
          await swCtx.setOffline(true)
          offlineSet = true
          control.offline = await swPage.evaluate(async (u) => {
            try {
              const r = await fetch(u)
              return { ok: r.status === 200, status: r.status }
            } catch (e) {
              return { ok: false, err: String(e).slice(0, 60) }
            }
          }, controlUrl)
          await swCtx.setOffline(false)
          offlineSet = false
          control.ok = !!control.offline.ok
        }
      }
      record(
        M,
        '96.7 对照组: 公共静态资源仍进运行时缓存且断网可命中（不是把 PWA 关掉）',
        control.ok,
        `${controlUrl || '未派生到资源'} → 首次=${control.first?.status ?? '未取'} / 缓存命中=${control.hit} / 缓存名=${(control.keys || []).join('|') || '(空)'} / 断网=${control.offline ? (control.offline.ok ? `命中 ${control.offline.status}` : `失败 ${control.offline.err || control.offline.status}`) : '未测'} / 落定 ${control.ms}ms${control.ok ? '' : ` / ${derived.reason || ''}`}`
      )
    } finally {
      // 收尾：断网、上传夹具、独立 context 都必须回收（不外溢到后续模块与运行库）
      if (offlineSet && swCtx) await swCtx.setOffline(false).catch(() => {})
      if (uploaded?.fileName && token) {
        const del = await fetch(`${CONFIG.backendUrl}/system/file/delete`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: uploaded.fileName })
        }).catch(() => null)
        log(`  收尾: 删除上传夹具 ${uploaded.fileName} → ${del ? del.status : 'ERR'}`)
      }
      if (swPage) await swPage.close().catch(() => {})
      if (swCtx) await swCtx.close().catch(() => {})
    }

    checkConsoleErrors(consoleErrors, pageErrors, M, SELF_INFLICTED)
  }
}
