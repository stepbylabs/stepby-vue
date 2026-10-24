/**
 * 静态守卫：`target="_blank"` 必须同标签带 `rel="noopener"`（b89 项 10）。
 *
 * ## 立的案
 *
 * 新标签页拿到 `window.opener` 就能反向改写来源页（`opener.location = 'https://phishing…'`），
 * 也就是 reverse tabnabbing。本仓四处 `_blank` 全部没有 `rel`：
 * `FileUpload` 的已上传文件链接、`CookieConsent` 的隐私政策、首页的产品官网、
 * 代码生成器右侧面板的文档链接。后三处指向**站外**，正是这一族的用武之地；
 * 第一处指向用户自行部署的对象存储/上传目录——文件名与 URL 都由上传者控制，
 * 同样是外部面。
 *
 * `noreferrer` 顺带把 Referer 也去掉（对第三方站点少泄露一条），因此本仓统一写
 * `rel="noopener noreferrer"`；但**判据只钉 `noopener`**——那才是安全属性，
 * `noreferrer` 是附带好处（把它也判红会把"只补 noopener"的合规改动误报）。
 *
 * ## 判定与局限
 *
 * - 只判字面 `target="_blank"`。绑定型 `:target="x"` 静态看不出值 ⇒ 不参与判定，
 *   但会单独计数并写进凭证行（"绑定了 target 却看不见值"这件事必须可归因，不得静默）。
 * - 只看模板区（`vueTemplateRegion` 已经剔过 HTML 注释与 JS 注释）。
 * - `rel` 的值必须**逐字含 noopener**：`rel="noreferrer"` 不顶用。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectByExt,
  forEachStartTag,
  lineNumberAt,
  plantInVueTemplate,
  splitTagAttrs,
  vueTemplateRegion,
  EXCLUDED_DIRS
} from './e2eSuiteScanKit'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCAN_DIR = resolve(VUE_ROOT, 'src')

const vueFiles = collectByExt(SCAN_DIR, '', '.vue', EXCLUDED_DIRS)

interface BlankSite {
  rel: string
  line: number
  tag: string
  /** 该标签上 `rel` 的实际取值（无 rel 时为空串） */
  got: string
}

export interface BlankScan {
  violations: BlankSite[]
  /** 字面 `_blank` 站点总数（体量自证：为 0 说明判据没跑起来） */
  blankSites: number
  /** 绑定型 `:target` 站点数（不参与判定，但必须数得到） */
  boundTargets: number
}

/** 纯判据：一个 SFC 源码 → 缺 `noopener` 的 `_blank` 站点（真实树与合成夹具共用同一条路径） */
export function scanBlankTargets(rel: string, src: string): BlankScan {
  const out: BlankScan = { violations: [], blankSites: 0, boundTargets: 0 }
  const region = vueTemplateRegion(src)
  if (!region) return out
  forEachStartTag(region.code, (name, attrsText, index) => {
    const attrs = splitTagAttrs(attrsText)
    const target = attrs.find((a) => a.name === 'target')
    if (target && target.value.trim() === '_blank') {
      out.blankSites++
      const got = attrs.find((a) => a.name === 'rel')?.value.trim() ?? ''
      if (!/\bnoopener\b/.test(got)) {
        out.violations.push({
          rel,
          line: lineNumberAt(region.code, index) + region.lineOffset,
          tag: name,
          got
        })
      }
      return
    }
    if (attrs.some((a) => a.name === ':target' || a.name === 'v-bind:target')) out.boundTargets++
  })
  return out
}

function scanAll(entries: Array<{ rel: string; src: string }>): BlankScan {
  const acc: BlankScan = { violations: [], blankSites: 0, boundTargets: 0 }
  for (const e of entries) {
    const r = scanBlankTargets(e.rel, e.src)
    acc.violations.push(...r.violations)
    acc.blankSites += r.blankSites
    acc.boundTargets += r.boundTargets
  }
  return acc
}

describe('a11y/安全 静态守卫 · target="_blank" 必须同标签带 rel="noopener"', () => {
  const entries = vueFiles.map((rel) => ({ rel, src: readFileSync(resolve(SCAN_DIR, rel), 'utf8') }))

  it('采集面自证：面由事实派生，四处已修站点必须在面里', () => {
    expect(vueFiles.length, 'src 下 .vue 数量（体量下限，腰斩即红）').toBeGreaterThanOrEqual(190)
    for (const must of [
      'components/FileUpload/index.vue',
      'components/CookieConsent/index.vue',
      'views/index.vue',
      'views/tool/build/RightPanel.vue'
    ]) {
      expect(vueFiles, `扫描面必须包含 ${must}`).toContain(must)
    }
    const scan = scanAll(entries)
    // 正控：字面 `_blank` 站点必须数得到——为 0 时"零违规"只是"一条都没扫出来"（前言 ⑥）
    expect(scan.blankSites, '字面 target="_blank" 站点数（采集面自证）').toBeGreaterThanOrEqual(4)
    console.warn(
      `[blankNoopener] 扫描面 ${vueFiles.length} 个 .vue / 字面 _blank ${scan.blankSites} 处 / 绑定型 :target ${scan.boundTargets} 处（不参与判定）/ 违规 0 处`
    )
  })

  it('真实树：缺 noopener 的 _blank 必须 0 处', () => {
    const scan = scanAll(entries)
    const report = scan.violations.map((v) => `${v.rel}:${v.line} <${v.tag}> rel="${v.got}"`)
    expect(report, `target="_blank" 未带 noopener（reverse tabnabbing 面）：\n${report.join('\n')}`).toEqual([])
  })

  it('已修的四处必须真的带上 noopener（防"删掉 rel 也算合规"）', () => {
    for (const rel of [
      'components/FileUpload/index.vue',
      'components/CookieConsent/index.vue',
      'views/index.vue',
      'views/tool/build/RightPanel.vue'
    ]) {
      const src = readFileSync(resolve(SCAN_DIR, rel), 'utf8')
      const r = scanBlankTargets(rel, src)
      expect(r.blankSites, `${rel} 必须有字面 _blank 站点（改名/删链接要在这里显形）`).toBeGreaterThanOrEqual(1)
      expect(r.violations, `${rel} 的 _blank 必须已带 noopener`).toEqual([])
    }
  })

  it('合成双向 · 坏形状必须被抓且报出行号与实际 rel 值', () => {
    const bad: Array<[string, string, number]> = [
      ['裸 _blank', '<template>\n  <a href="https://x.test" target="_blank">x</a>\n</template>\n', 2],
      [
        'rel 只有 noreferrer（挡 tabnabbing 不靠它）',
        '<template>\n  <a href="https://x.test" target="_blank" rel="noreferrer">x</a>\n</template>\n',
        2
      ],
      ['rel 是空串', '<template>\n  <a href="https://x.test" target="_blank" rel="">x</a>\n</template>\n', 2],
      [
        'el-link 组件同样参与（属性透传到渲染出的 a）',
        '<template>\n  <el-link href="https://x.test" target="_blank">x</el-link>\n</template>\n',
        2
      ]
    ]
    for (const [label, src, line] of bad) {
      const r = scanBlankTargets('synthetic/bad.vue', src)
      expect(r.violations.length, `${label}：期望 1 处`).toBe(1)
      expect(r.violations[0].line, `${label}：行号`).toBe(line)
    }
    // 文案必须点名 rel 的实际值（只说"不对"不说现在写的是什么，人要重新打开文件找）
    const one = scanBlankTargets('synthetic/bad.vue', bad[1][1]).violations[0]
    expect(`${one.rel}:${one.line} <${one.tag}> rel="${one.got}"`).toBe('synthetic/bad.vue:2 <a> rel="noreferrer"')
  })

  it('合成双向 · 好形状不得误报', () => {
    const good: Array<[string, string]> = [
      [
        'noopener + noreferrer',
        '<template>\n  <a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>\n</template>\n'
      ],
      [
        '只给 noopener 就够（判据不逼着写 noreferrer）',
        '<template>\n  <a href="https://x.test" target="_blank" rel="noopener">x</a>\n</template>\n'
      ],
      [
        '同词在中间',
        '<template>\n  <a href="https://x.test" target="_blank" rel="noreferrer noopener">x</a>\n</template>\n'
      ],
      ['不是 _blank', '<template>\n  <a href="/x" target="_self">x</a>\n</template>\n'],
      ['没有 target 的普通链接', '<template>\n  <a href="https://x.test">x</a>\n</template>\n'],
      ['绑定型 :target 不参与判定', '<template>\n  <a :href="u" :target="mode">x</a>\n</template>\n'],
      ['HTML 注释里的旧写法', '<template>\n  <!-- 旧写法：<a target="_blank"> 已补 rel -->\n  <p>ok</p>\n</template>\n']
    ]
    const falsePositives: string[] = []
    for (const [label, src] of good) {
      const r = scanBlankTargets('synthetic/good.vue', src)
      if (r.violations.length) falsePositives.push(`${label} → ${JSON.stringify(r.violations)}`)
    }
    expect(falsePositives, `合规写法被误报：\n${falsePositives.join('\n')}`).toEqual([])
    // 正控：好形状里多数真的带 _blank，否则这批只是"什么都没扫到"
    expect(good.filter(([, src]) => src.includes('target="_blank"')).length).toBeGreaterThanOrEqual(4)
    // 绑定型那一支必须被单独数到（"不参与"不等于"看不见"）
    expect(scanBlankTargets('synthetic/good.vue', good[5][1]).boundTargets).toBe(1)
  })

  it('刀口活性：每个被扫文件模板开头插入一条合成违规，命中数必须 +1', () => {
    const planted = '<a class="__blank-plant-probe" href="https://probe.test" target="_blank">probe</a>'
    let caught = 0
    for (const e of entries) {
      const base = scanBlankTargets(e.rel, e.src).violations.length
      const after = scanBlankTargets(e.rel, plantInVueTemplate(e.src, planted)).violations.length
      if (after === base + 1) caught++
    }
    expect(caught, '每条合成违规都必须让命中数 +1').toBe(entries.length)
    expect(plantInVueTemplate(entries[0].src, planted)).toContain('__blank-plant-probe')
  })
})
