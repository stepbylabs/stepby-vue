import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { clonePlain } from './clone'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('utils/clone', () => {
  it('exposes the defect shape: structuredClone on a reactive object throws', () => {
    // 对照组：这条不是"测 Vue"，而是证明下面的助手确实在挡一个真实存在的异常
    const source = reactive({ a: 1, nested: { b: 2 } })
    expect(() => structuredClone(source)).toThrow()
  })

  it('clones a reactive object without throwing and deep-copies nested data', () => {
    const source = reactive({ a: 1, nested: { b: 2 } })
    const copy = clonePlain(source)
    expect(copy).toEqual({ a: 1, nested: { b: 2 } })
    copy.nested.b = 3
    expect(source.nested.b).toBe(2)
    expect(copy).not.toBe(source)
  })

  it('clones ref values and plain objects', () => {
    const box = ref<Record<string, unknown>>({ x: [1, 2] })
    expect(clonePlain(box.value)).toEqual({ x: [1, 2] })
    expect(clonePlain({ y: 1 })).toEqual({ y: 1 })
  })

  it('is wired into the code-gen config page and the failure is visible', () => {
    const src = readFileSync(resolve(SRC_DIR, 'views/tool/gen/editTable.vue'), 'utf8')
    expect(src).toContain('clonePlain(info.value)')
    expect(src).not.toMatch(/structuredClone\(/)
    const marker = src.indexOf('Form validation error:')
    expect(marker).toBeGreaterThan(-1)
    expect(src.slice(marker, marker + 400)).toContain('msgError')
  })
})
