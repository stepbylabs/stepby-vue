/**
 * 静态守卫：Element Plus 表单校验不得使用"零参 `validate()` + 裸 await"形态。
 *
 * 缺陷形态（b79 M87 真机抓到的五处）：
 *   `async function handleSubmit() { await submitRef.value?.validate(); ... }`
 * EP 的零参 `validate()` 在校验失败时返回**被拒绝的 Promise**，裸 await 让拒绝逸出
 * 点击处理器 ⇒ unhandledrejection ⇒ 布局层 ErrorBoundary 接管，整个子树（含正在填的
 * 对话框）被换成错误兜底。用户看到的是"点了确定，表单没了，什么都没保存"，
 * 而不是"标题没填"。实测证据：流程待办提交请假单（标题留空）后 console 出现
 * `[ErrorBoundary] ... https://vuejs.org/error-reference/#runtime-6`
 * （`runtime-6` = `ErrorCodes.COMPONENT_EVENT_HANDLER`），且 `.el-form-item__error` 为 0 条
 * ——红字连同表单一起被卸载。
 *
 * 允许的两种形态（都是"就地消费掉拒绝"）：
 * ① `await validateForm(formRef.value)` —— 单一事实源 `@/utils/formValidate`；
 * ② `.validate().catch(() => false)` —— 既有正确站点（monitor/ip-location）。
 * 回调形式 `.validate(cb)` 在 EP 内部不会拒绝，天然安全，不在判据范围内。
 *
 * 双向对照组（缺一即虚锁）：
 * - 合成违规（裸 await / 无 catch / 写在 async 事件处理器里）必须转红；
 * - 注释、字符串、已加 `.catch` 的站点、回调形式必须零误报
 *   （"为安全把合法写法也挡掉"同样是缺陷，见 agents.md《前端外部输入归一规范》）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { validateForm } from '@/utils/formValidate'

/** 判据的合法实现本体（内部就是那一处 `await formRef.validate()`） */
const SELF = 'src/utils/formValidate.ts'

/** Windows 下 walk 产出反斜杠路径，与 posix 风格常量比较必须先归一（否则本体排除静默失效） */
const posix = (p: string) => p.replace(/\\/g, '/')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 把注释与字符串内容替换成空格（保留换行，行号不失真）。
 * 目的同 routeParamNumber 守卫：文档里的反例不是代码，不得当成违规。
 */
function maskNonCode(src: string): string {
  const out: string[] = []
  let i = 0
  const at = (k: number) => (k < src.length ? src[k] : '')
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && at(i + 1) === '/') {
      while (i < src.length && src[i] !== '\n') {
        out.push(' ')
        i++
      }
      continue
    }
    if (c === '/' && at(i + 1) === '*') {
      out.push(' ', ' ')
      i += 2
      while (i < src.length && !(src[i] === '*' && at(i + 1) === '/')) {
        out.push(src[i] === '\n' ? '\n' : ' ')
        i++
      }
      // 收尾的 `*/`（已到文件尾时不存在）
      if (i < src.length) {
        out.push(' ', ' ')
        i += 2
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out.push(' ')
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out.push(' ')
          i++
        }
        out.push(src[i] === '\n' ? '\n' : ' ')
        i++
      }
      if (i < src.length) {
        out.push(' ')
        i++
      }
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

export interface BareValidateReport {
  /** 违规行号（1 起） */
  lines: number[]
  details: string[]
}

/**
 * 判据：出现 `.validate()`（空实参）却没有同语句的 `.catch(`。
 * `.catch(` 允许出现在后两行内（`await ref.validate()\n  .catch(...)` 这类换行链式）。
 */
export function findBareValidate(src: string): BareValidateReport {
  const lines = maskNonCode(src).split('\n')
  const details: string[] = []
  lines.forEach((line, idx) => {
    if (!/\.validate\s*\(\s*\)/.test(line)) return
    const window = lines.slice(idx, idx + 3).join(' ')
    if (/\.catch\s*\(/.test(window)) return
    details.push(`${idx + 1}: 零参 validate() 未就地消费拒绝 => ${line.trim()}`)
  })
  return { lines: details.map((d) => Number(d.slice(0, d.indexOf(':')))), details }
}

/** 已接线站点：改回裸 await 或删除闸门都必须让本守卫转红 */
const WIRED_SITES = [
  'src/views/system/flow/index.vue',
  'src/views/system/tenant/index.vue',
  'src/views/system/tenant/nav/index.vue',
  'src/views/system/tenant/TenantDomainPanel.vue',
  'src/views/tool/gen/createTable.vue'
]

describe('静态守卫：表单校验不得裸 await（b79 P1）', () => {
  it('全 src 不存在未就地消费拒绝的零参 validate()', () => {
    const offenders = walk('src')
      .filter((f) => posix(f) !== SELF)
      .map((f) => [f, findBareValidate(readFileSync(f, 'utf8'))] as const)
      .filter(([, report]) => report.lines.length > 0)
    expect(offenders, offenders.map(([f, r]) => `${f}\n  ${r.details.join('\n  ')}`).join('\n')).toEqual([])
  })

  it('五处已接线站点确实走 validateForm（防"改回旧写法且绕过守卫"）', () => {
    for (const file of WIRED_SITES) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).toContain('validateForm(')
      expect(findBareValidate(src).lines, file).toEqual([])
    }
  })

  it('控制组 A：合成违规必须转红', () => {
    const cases = [
      ['裸 await 可选链式', `async function submit() {\n  await formRef.value?.validate()\n  saving.value = true\n}\n`],
      ['裸 await 直取式', `async function save() {\n  await formRef.value.validate()\n  await addApi(form)\n}\n`],
      ['赋值但不判拒绝', `const p = formRef.value.validate()\nvoid p\n`],
      ['catch 写到三条之外', `async function s() {\n  await formRef.value.validate()\n  return 1\n}\n`]
    ]
    for (const [kind, sample] of cases) {
      expect(findBareValidate(sample).lines.length, kind).toBeGreaterThan(0)
    }
  })

  it('控制组 B：注释 / 字符串 / 已加 catch / 回调形式不得误报', () => {
    const clean = [
      ['行注释反例', `// 反例：await formRef.value.validate()\nconst a = 1\n`],
      ['块注释反例', `/* await formRef.value.validate() 会逃逸 */\nconst a = 1\n`],
      [
        '字符串字面量',
        `const doc = 'await formRef.value.validate()'\nconst tpl = \`x.validate()\`\nvoid doc\nvoid tpl\n`
      ],
      ['同语句 catch', `const valid = await formRef.value.validate().catch(() => false)\nvoid valid\n`],
      [
        '跨行 catch',
        `async function s() {\n  const ok = await formRef.value\n    .validate()\n    .catch(() => false)\n  return ok\n}\n`
      ],
      ['回调形式（EP 内部不拒绝）', `formRef.value?.validate((valid: boolean) => {\n  if (!valid) return\n})\n`],
      ['走单一入口', `if (!(await validateForm(formRef.value))) return\n`]
    ]
    for (const [kind, sample] of clean) {
      expect(findBareValidate(sample).lines, kind).toEqual([])
    }
  })

  it('控制组 C：真实缺陷形态确实产生未捕获拒绝（证明守卫拦的是活 hazard 不是理论）', () => {
    const seen: unknown[] = []
    const onReject = (e: unknown) => seen.push(e)
    process.on('unhandledRejection', onReject)
    const bad = { value: { validate: () => Promise.reject({ title: ['标题不能为空'] }) } }
    // 复刻缺陷写法：处理器不 await，拒绝无人消费
    const escape = async () => {
      await bad.value.validate()
      return 'submitted'
    }
    void escape()
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        process.off('unhandledRejection', onReject)
        resolve()
      }, 120)
    }).then(() => {
      expect(seen.length, '裸 await 形态必须漏出未捕获拒绝').toBeGreaterThan(0)
    })
  })

  it('validateForm：失败返回 false 且不留下未处理拒绝', async () => {
    const seen: unknown[] = []
    const onReject = (e: unknown) => seen.push(e)
    process.on('unhandledRejection', onReject)
    const rejecter = { validate: () => Promise.reject({ title: ['标题不能为空'] }) }
    expect(await validateForm(rejecter as never)).toBe(false)
    expect(await validateForm({ validate: () => Promise.resolve(true) } as never)).toBe(true)
    expect(await validateForm(undefined)).toBe(false)
    expect(await validateForm(null)).toBe(false)
    await new Promise((r) => setTimeout(r, 120))
    process.off('unhandledRejection', onReject)
    expect(seen, '收敛后不得再有未捕获拒绝').toEqual([])
  })

  it('validateForm：调用的是零参 validate() 且只调一次（不误用 validateField）', async () => {
    const validate = vi.fn(() => Promise.resolve(true))
    await validateForm({ validate } as never)
    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledWith()
  })
})
