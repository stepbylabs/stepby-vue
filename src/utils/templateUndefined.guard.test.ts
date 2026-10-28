/**
 * 静态守卫：模板里的未定义标识符必须被拦住（b110）。
 *
 * ## 立的案
 *
 * b107 的事故是「工作台模板仍引用已删除的 `unreadNotices`」——模板求值抛错、整页卸载；
 * 当时把希望押在 `strictTemplates` 上，而 b110 探针实测：Volar 只报**未注册组件**
 * （`<NoSuchComp />` ⇒ TS2339），对
 *   `{{ nope }}` / `v-if="nope"` / `:title="nope.x"` / `v-model="nope"`
 * **一律无诊断**（同一份代码用 `vue-tsc` 跑是 0 error）。也就是说，"模板引用不存在的变量"
 * 在类型层是**看不见的**，只能靠 lint 兜底。
 *
 * 把 `vue/no-undef-properties` 打开后，全仓一次扫出 6 处真缺陷（全部修复）：
 *   - `ai/panel` 结果表的 `:data="tableRows"`（该名字不存在 ⇒ 数据表格永远空白）
 *   - `system/file` 刷新按钮 `@click="loadList"`（函数不存在 ⇒ 刷新无效）
 *   - `system/user/authRole` 的 `submitLoading`（按钮永远不转 ⇒ 连点重复提交）
 *   - `components/FileUpload` 的 `v-if="!disable"`（prop 实为 `disabled` ⇒ 禁用态仍显示上传入口）
 *   - `layout/TagsView` 的 `@dragend="onDragEnd"`（组合子有、页面没取 ⇒ 拖拽取消后高亮不复位）
 *   - `system/webHook` 的 `eventCatalogLoading`（下拉永远不显示加载态）
 *
 * ## 本文件钉什么
 *
 * 1. **开关在册**：`tsconfig.json` 的 `vueCompilerOptions.strictTemplates === true`，
 *    `dataAttributes` 恰好是这三个精确模式（新增豁免必须是有意识的改动），且**不含裸通配**。
 * 2. **规则在册且是 error**：以**语义方式**装载 `eslint.config.mjs`（不是文本匹配——文本匹配
 *    对格式敏感，格式一变就漏），断言规则严重度与 `ignores` 恰好为 `['parseTime']`。
 * 3. **活性证明**：用项目自己的 ESLint 配置 lint 两段合成 SFC——含未定义标识符的必须报且
 *    报在 `vue/no-undef-properties` 上，全部声明过的必须 0 报（防止"把规则调成什么都报"也算过）。
 *    `parseTime`（唯一经 `app.config.globalProperties` 注册的模板全局，main.ts M-12）
 *    必须被放行；放了它就必须**只**放它。
 * 4. **跑在门禁里**：`package.json` 的 `typecheck` 走 `vue-tsc`；`eslint .` 是门禁电池的一把
 *    （`scripts/run-gates.py` 的 `eslint` 条目），所以规则在册就等于"每轮都跑"。
 *
 * 局限（按实登记，不假装覆盖）：`vue/no-undef-properties` 只判名字是否在 `<script setup>`
 * 绑定里出现，判不出"名字在但类型错"（那是 strictTemplates 的活）；两者是互补而非替代。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TS_CONFIG = resolve(VUE_ROOT, 'tsconfig.json')
const ESLINT_CONFIG = resolve(VUE_ROOT, 'eslint.config.mjs')
const PACKAGE_JSON = resolve(VUE_ROOT, 'package.json')

/** tsconfig 是 JSONC（允许 // 与 /* *\/）：剥注释时必须逐字符跳过字符串，否则 `/` 会被误判 */
function parseJsonc(text: string): unknown {
  let out = ''
  let i = 0
  let inStr = false
  let quote = ''
  while (i < text.length) {
    const c = text[i]
    const n = text[i + 1]
    if (inStr) {
      out += c
      if (c === '\\') {
        out += text[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === quote) inStr = false
      i += 1
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      quote = c
      out += c
      i += 1
      continue
    }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return JSON.parse(out)
}

interface RuleEntry {
  severity: unknown
  options: { ignores?: string[] } | undefined
}

/** 从 flat config 数组里找出承载该规则的那一条（语义查找，不做文本匹配） */
export function findRuleEntry(configs: unknown[], ruleName: string): RuleEntry | null {
  let found: RuleEntry | null = null
  for (const block of configs) {
    if (!block || typeof block !== 'object') continue
    const rules = (block as { rules?: Record<string, unknown> }).rules
    if (!rules || !(ruleName in rules)) continue
    const raw = rules[ruleName]
    if (Array.isArray(raw)) {
      found = { severity: raw[0], options: (raw[1] ?? undefined) as RuleEntry['options'] }
    } else {
      found = { severity: raw, options: undefined }
    }
  }
  return found
}

/** 该 block 的 files 里有没有能命中 `.vue` 的模式（规则挂在不覆盖 vue 的块上等于没开） */
export function coversVueFiles(files: unknown): boolean {
  if (!files) return true
  const list = Array.isArray(files) ? files : [files]
  return list.some((f) => typeof f === 'string' && /vue/.test(f))
}

describe('模板未定义标识符：开关与规则在册', () => {
  it('tsconfig：strictTemplates 开启，dataAttributes 恰为三个精确模式且无裸通配', () => {
    const tsconfig = parseJsonc(readFileSync(TS_CONFIG, 'utf-8')) as {
      vueCompilerOptions?: { strictTemplates?: boolean; dataAttributes?: string[] }
    }
    expect(tsconfig.vueCompilerOptions?.strictTemplates).toBe(true)
    const attrs = tsconfig.vueCompilerOptions?.dataAttributes ?? []
    expect([...attrs].sort()).toEqual(['data-*', 'element-loading-*', 'xlink:href'].sort())
    // 裸通配会把"未知属性"这条判据整体关掉（形状上仍然合法，所以要单独拦）
    for (const pattern of attrs) {
      expect(pattern.replace(/\*/g, '')).not.toBe('')
    }
  })

  it('eslint：vue/no-undef-properties 是 error，且 ignores 恰好只有 parseTime', async () => {
    const mod = (await import(ESLINT_CONFIG)) as { default: unknown[] }
    const entry = findRuleEntry(mod.default, 'vue/no-undef-properties')
    expect(entry, '规则不在册 ⇒ 模板未定义标识符这一类无人兜底').not.toBeNull()
    expect(entry?.severity).toBe('error')
    expect(entry?.options?.ignores).toEqual(['parseTime'])

    const block = mod.default.find(
      (b) =>
        b &&
        typeof b === 'object' &&
        (b as { rules?: Record<string, unknown> }).rules &&
        'vue/no-undef-properties' in ((b as { rules: Record<string, unknown> }).rules ?? {})
    ) as { files?: unknown }
    expect(coversVueFiles(block?.files), '规则挂在只覆盖 .ts 的块上等于没开').toBe(true)
  })

  it('package.json：typecheck 走 vue-tsc（strictTemplates 才有执行载体）', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.typecheck ?? '').toContain('vue-tsc')
  })
})

describe('模板未定义标识符：规则活性（合成双向）', () => {
  const UNDEFINED_SFC = `<template>
  <div>
    <span>{{ nopeA110 }}</span>
    <span v-if="nopeB110.length > 0">x</span>
    <el-input v-model="nopeC110" />
  </div>
</template>
<script setup lang="ts" name="SyntheticUndef">
const declared = ref(0)
</script>
`
  const DECLARED_SFC = `<template>
  <div>
    <span>{{ declared }}</span>
    <span v-if="rows.length > 0">{{ parseTime(declared) }}</span>
    <el-input v-model="keyword" />
  </div>
</template>
<script setup lang="ts" name="SyntheticDeclared">
const declared = ref(0)
const rows = ref<number[]>([])
const keyword = ref('')
</script>
`

  /** 用项目自己的 flat config 跑一段内存里的 SFC（filePath 落在 src 下，才会命中项目配置） */
  async function lintSfc(code: string): Promise<{ ruleId: string | null; message: string }[]> {
    const { ESLint } = await import('eslint')
    const eslint = new ESLint({ cwd: VUE_ROOT })
    const results = await eslint.lintText(code, {
      filePath: resolve(VUE_ROOT, 'src', 'components', '__synthetic_b110__.vue'),
      warnIgnored: false
    })
    return results.flatMap((r) => r.messages.map((m) => ({ ruleId: m.ruleId, message: m.message })))
  }

  it('未定义标识符（插值 / v-if / v-model）必须各报一条', async () => {
    const messages = await lintSfc(UNDEFINED_SFC)
    const hits = messages.filter((m) => m.ruleId === 'vue/no-undef-properties')
    for (const name of ['nopeA110', 'nopeB110', 'nopeC110']) {
      expect(
        hits.some((h) => h.message.includes(name)),
        `${name} 必须被报（否则这一类又回到"安静渲染成空"）`
      ).toBe(true)
    }
  })

  it('全部声明过的绑定（含豁免的 parseTime）必须 0 报——规则不得退化成"什么都报"', async () => {
    const messages = await lintSfc(DECLARED_SFC)
    expect(messages.filter((m) => m.ruleId === 'vue/no-undef-properties')).toEqual([])
  })
})
