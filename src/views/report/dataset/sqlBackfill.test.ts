// src/views/report/dataset/sqlBackfill.test.ts
// 数据集 SQL 明文回填链路守卫（批七十六）。
//
// 实证动机：后端 DatasetVo **恒不含 SQL 明文**（list/info 走 report:dataset:list，
// 明文只经 POST /report/dataset/{id}/sql 由 report:dataset:edit 取得），
// 而编辑对话框曾写 `sqlTemplate: d?.sqlTemplate ?? ''` —— 字段永远取不到，
// 结果"改个名称"也必须把整段 SQL 重敲一遍，否则被必填校验拦死。
// 本守卫钉住三件事：api 层有明文端点、openEdit 真的回填、失败时给出可操作提示；
// 并把坏形态（读 VO 的 sqlTemplate）钉成永久负例。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIEW = path.join(HERE, 'index.vue')
const API = path.resolve(HERE, '../../../api/report.ts')

function readRequired(fp: string, label: string): string {
  if (!fs.existsSync(fp)) {
    throw new Error(`${label} 读不到输入：${fp}（校验没有跑，不得当成通过）`)
  }
  return fs.readFileSync(fp, 'utf8')
}

function localeLeaf(locale: unknown, dotted: string): unknown {
  let cur: unknown = locale
  for (const seg of dotted.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

const viewSrc = readRequired(VIEW, '数据集页')
const apiSrc = readRequired(API, '报表 api 层')
/** 只取 openEdit 函数体，避免全文件松匹配把无关代码当证据 */
function openEditBody(src: string): string {
  const start = src.indexOf('async function openEdit')
  expect(start, 'openEdit 不存在').toBeGreaterThanOrEqual(0)
  const rest = src.slice(start)
  const end = rest.indexOf('\n}\n', rest.indexOf('editOpen.value = true'))
  return rest.slice(0, end < 0 ? rest.length : end)
}

describe('数据集 SQL 明文回填链路', () => {
  it('api 层暴露明文端点（POST，路径与后端路由逐字对齐）', () => {
    expect(apiSrc).toContain('export function getDatasetSql')
    expect(apiSrc).toContain('/report/dataset/${datasetId}/sql')
    const body = apiSrc.slice(
      apiSrc.indexOf('export function getDatasetSql'),
      apiSrc.indexOf('export function getDatasetSql') + 400
    )
    expect(body).toContain("method: 'post'")
  })

  it('openEdit 真的拉取明文并回填表单（不再依赖 VO 的不存在字段）', () => {
    const body = openEditBody(viewSrc)
    expect(body).toContain('getDatasetSql(')
    expect(body).toContain('form.value.sqlTemplate = sqlRes.data')
    // 永久负例：VO 无明文，读它 = 恒空（这正是本批修掉的坏形态）
    expect(body).not.toMatch(/sqlTemplate:\s*d\?\.sqlTemplate/)
  })

  it('明文取不到时给出可操作提示且双语齐备（不静默留空）', () => {
    const body = openEditBody(viewSrc)
    expect(body).toContain("ElMessage.warning(t('rp.sqlLoadFailed'))")
    for (const locale of [zhCN, enUS]) {
      const v = localeLeaf(locale, 'rp.sqlLoadFailed')
      expect(typeof v, 'rp.sqlLoadFailed 缺词条').toBe('string')
    }
    expect(localeLeaf(zhCN, 'rp.sqlLoadFailed')).not.toBe(localeLeaf(enUS, 'rp.sqlLoadFailed'))
  })

  it('变异证伪：抹掉回填调用后守卫必须转红', () => {
    const mutated = openEditBody(viewSrc).replace('getDatasetSql(', 'void (')
    expect(mutated).not.toContain('getDatasetSql(')
    // 把回填退回坏形态（读 VO 的不存在字段），负例正则必须真的抓到它
    const mutatedView = viewSrc.replace("      sqlTemplate: '',", "      sqlTemplate: d?.sqlTemplate ?? '',")
    expect(mutatedView).not.toBe(viewSrc)
    expect(openEditBody(mutatedView)).toMatch(/sqlTemplate:\s*d\?\.sqlTemplate/)
  })
})
