/**
 * 代码生成「按目录前缀组织」链路的判据（b139）。
 *
 * ## 立的案
 *
 * 改造前该链路是**三重假功能**：
 * 1. `genCode()` 用主通道 `request({ method: 'get' })` 发请求，而响应是 `application/zip`——
 *    拦截器的 `const code = data.code || 200` 对二进制 Blob 恒取到 200，于是**必然成功**；
 *    字节被当 JSON 解析后丢弃（没有 `responseType: 'blob'`）。
 * 2. 后端 `gen_code` 从不读 `genPath`、也从不写磁盘（数据库默认值 `"/"`，纯死字段）。
 * 3. 前端却弹「成功生成到自定义路径：{path}」——用户以为文件已经在磁盘上。
 *
 * ## 现在的事实
 *
 * - 单表生成与批量生成同构：`genCodeUrl` 只负责构造地址，下载与结局交给 download 插件
 *   （它返回 `boolean`，失败已上报）。视图只在 `true` 时提示，且文案只承诺"已发起下载"。
 * - `pathPrefix` 是**压缩包内目录前缀**；后端按 `/` 分段清洗，`..`/绝对路径/反斜杠/
 *   Windows 保留字符一律 400（见 `handler/tool_gen_handler.rs` 与
 *   `service/gen_table_service.rs::sanitize_zip_path_prefix`）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { genCodeUrl, batchGenCode } from './gen'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const readSrc = (rel: string): string => fs.readFileSync(path.join(HERE, rel), 'utf8')

const VIEW_SRC = readSrc('../../views/tool/gen/index.vue')
const ZH_SRC = readSrc('../../i18n/locales/zh-CN/tool.ts')
const EN_SRC = readSrc('../../i18n/locales/en-US/tool.ts')

/** 去掉全部空白后再比对：判据读语义，不读 prettier 的折行决定（b128 ㉞） */
const flatWs = (s: string): string => s.replace(/\s+/g, '')

describe('genCodeUrl：压缩包内路径前缀', () => {
  it('无前缀：只带表名，不产生空查询串', () => {
    expect(genCodeUrl('sys_user')).toBe('/tool/gen/genCode/sys_user')
  })

  it('空串/空白/`/`：都不下发 path（`/` 是 gen_path 的数据库默认值，语义是平铺）', () => {
    for (const empty of ['', '   ', '/', '  /  ']) {
      expect(genCodeUrl('t', empty)).toBe('/tool/gen/genCode/t')
    }
  })

  it('多段前缀按 encodeURIComponent 编码，解码后仍是原值', () => {
    const url = genCodeUrl('t', 'module/system')
    expect(url.startsWith('/tool/gen/genCode/t?path=')).toBe(true)
    const raw = url.slice('/tool/gen/genCode/t?path='.length)
    expect(raw).not.toContain('/')
    expect(decodeURIComponent(raw)).toBe('module/system')
  })

  it('表名作为路径段必须编码（含 # 与 / 时不得作用到另一张表）', () => {
    expect(genCodeUrl('a#b')).toBe('/tool/gen/genCode/a%23b')
    expect(genCodeUrl('a/b')).toBe('/tool/gen/genCode/a%2Fb')
  })

  it('批量入口保持既有契约（逗号拼接 + 整串编码）', () => {
    expect(batchGenCode(['a', 'b'])).toBe('/tool/gen/batchGenCode?tables=a%2Cb')
    // 空项被丢弃（`n && n.trim()` 判真）；非空项原样参与拼接——表名来自选中行，
    // 不可能是带空白的自由文本，本批刻意不改这个既有形态（避免顺带换契约）
    expect(batchGenCode(['a', 'b', ''])).toBe('/tool/gen/batchGenCode?tables=a%2Cb')
  })
})

describe('视图接线：单表生成必须走下载通道并按结局提示', () => {
  it('导入并使用 genCodeUrl，交给 download 插件下载', () => {
    expect(VIEW_SRC).toMatch(/import \{[^}]*genCodeUrl[^}]*\} from '@\/api\/tool\/gen'/)
    // 读语义不读字节：prettier 会把链折成 `downloadPlugin\n  .zip(…)`，
    // 按原文匹配等于把排版决定当事实（b128 ㉞ 的同一条）
    expect(flatWs(VIEW_SRC)).toContain('downloadPlugin.zip(genCodeUrl(')
  })

  it('不得再出现主通道 genCode( 调用（那是 ZIP 被当 JSON 解析的缺陷形状）', () => {
    // genCodeUrl( 不匹配 /\bgenCode\(/（名字后面紧接的是 U），无需额外排除
    expect(VIEW_SRC).not.toMatch(/\bgenCode\(/)
  })

  it('生成按钮必须读 download 的结局，并在失败时不弹成功', () => {
    const fn = VIEW_SRC.slice(VIEW_SRC.indexOf('function handleGenTable'))
    const body = flatWs(fn.slice(0, fn.indexOf('\n}\n') + 3))
    // 按**调用点**逐个判：只要求"函数体里出现过一次 if (ok)"会被另一分支满足——
    // 盘上变异 D2（自定义分支去掉结局判断）首跑就是绿的，红的正是这条判据太宽。
    const calls = body.split('downloadPlugin.zip(').slice(1)
    expect(calls.length).toBeGreaterThanOrEqual(2) // 自定义分支 + 批量分支
    for (const call of calls) {
      const thenAt = call.indexOf('.then(')
      expect(thenAt).toBeGreaterThan(-1)
      expect(call.slice(thenAt)).toMatch(/^\.then\(\(ok\)=>\{if\(ok\)modal\.msgSuccess/)
    }
    // 两个分支各用各的文案（防止接错——接错时用户看到的"前缀 x"与实际打包不符）
    expect(body).toContain("t('gen.msg.genCustomSuccess'")
    expect(body).toContain("t('gen.msg.genZipSuccess'")
  })

  it('成功文案不得声称"生成到磁盘路径"（saveBlob 的 true 不证明落盘）', () => {
    for (const src of [ZH_SRC, EN_SRC]) {
      expect(src).not.toContain('成功生成到自定义路径')
      expect(src).not.toContain('Successfully generated to custom path')
    }
    expect(ZH_SRC).toContain('已发起下载')
    expect(EN_SRC).toContain('download started')
  })
})

describe('表单提示与实际语义一致', () => {
  it('zh/en 的 genPathTip 都写明"压缩包内前缀"，且不再声称写磁盘绝对路径', () => {
    expect(ZH_SRC).toContain('压缩包内路径前缀')
    expect(ZH_SRC).not.toContain('磁盘绝对路径')
    expect(EN_SRC).toContain('Path Prefix Inside Archive')
    expect(EN_SRC).not.toContain('Absolute disk path')
  })
})
