import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

// i18n 静态回归守卫：扫描全部 .vue/.ts 源码里的 t('a.b.c') / $t('a.b') 字面量键，
// 断言每个键在 zh-CN 与 en-US 语言包中都存在（词条缺失时 vue-i18n 会回退渲染裸键，
// 属"看得见的坏"但 HTTP/console/toast 运行时信号抓不到）。与运行时采集器互补：
// 采集器只看单次渲染可见的泄漏，本测试静态覆盖到未渲染的分支/交互态键。
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')

function flattenKeys(obj: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      flattenKeys((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k, out)
    }
  } else {
    out.add(prefix)
  }
  return out
}

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__snapshots__') continue
      yield* walk(fp)
    } else if (/\.(vue|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name)) {
      yield fp
    }
  }
}

// 仅匹配"以字符串字面量为第一参数、键为点分路径"的 i18n 调用，排除 ${} 动态拼接。
const KEY_RE = /\b\$?t\(\s*['"]([a-zA-Z][\w]*(?:\.[\w]+)+)['"]/g

describe('i18n 键完整性静态守卫', () => {
  const zhKeys = flattenKeys(zhCN)
  const enKeys = flattenKeys(enUS)

  it('源码中引用的所有 t() 字面量键在 zh-CN / en-US 均已定义', () => {
    const missingZh: string[] = []
    const missingEn: string[] = []
    for (const fp of walk(SRC)) {
      const txt = fs.readFileSync(fp, 'utf8')
      const rel = path.relative(SRC, fp).replace(/\\/g, '/')
      let m: RegExpExecArray | null
      KEY_RE.lastIndex = 0
      while ((m = KEY_RE.exec(txt))) {
        const key = m[1]
        // 跳过"故意测试缺失键"的自检用例引用（其值本身就是被断言不存在的键）。
        if (!zhKeys.has(key)) missingZh.push(`${key}  <-  ${rel}`)
        if (!enKeys.has(key)) missingEn.push(`${key}  <-  ${rel}`)
      }
    }
    const report =
      `缺失 zh-CN(${missingZh.length}):\n${missingZh.join('\n')}\n` +
      `缺失 en-US(${missingEn.length}):\n${missingEn.join('\n')}`
    expect(missingZh.length + missingEn.length, report).toBe(0)
  })

  it('zh-CN 与 en-US 叶子键集合完全一致（防语言包漂移）', () => {
    // 采集器只在 zh-CN 下跑，若某键仅存在于 zh-CN，则切到 en-US 会渲染裸键——静态双向断言堵住这类漂移。
    const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k)).sort()
    const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k)).sort()
    const report = `仅 zh-CN(${onlyZh.length}): ${onlyZh.join(', ')}\n仅 en-US(${onlyEn.length}): ${onlyEn.join(', ')}`
    expect(onlyZh.length + onlyEn.length, report).toBe(0)
  })
})
