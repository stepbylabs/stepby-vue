// stepby-vue/scripts/decode-stack.mjs
// 错误堆栈离线还原（R102-SMAP-004 配套）：把生产 hidden sourcemap + 压缩后
// 行:列 还原为原始 TS/Vue 源位置。零第三方依赖（自实现 base64-VLQ 解码）。
/* eslint-disable no-console -- CLI 工具脚本，stdout 即交互界面 */
//
// 前提：vite build 已开启 `build.sourcemap: 'hidden'`（产物 .map 与 .js 同目录，
//       且 JS 内无 sourceMappingURL 注释 —— 不会暴露给浏览器）。
//
// 用法：
//   node scripts/decode-stack.mjs <dist/static/js/index-xxxx.js.map> <line> <column>
//   node scripts/decode-stack.mjs <...js.map> --trace < stack.txt
//     （--trace 模式：从 stdin 逐行解析 "index-xxxx.js:1:23456" 形态的堆栈行）
//
// 原理：source map v3 的 mappings 字段 = 分号分隔行、逗号分隔段、每段 1/4/5 个
// VLQ 编码的 delta 值（[genCol, srcIdx, srcLine, srcCol, nameIdx?]）。解码后按
// 生成位置（line, col）二分查找最近的前序映射即为还原位置。

import { readFileSync } from 'node:fs'
import process from 'node:process'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_MAP = new Map([...B64].map((c, i) => [c, i]))

/** 解码一段 base64-VLQ 为有符号整数数组 */
function decodeVLQ(segment) {
  const values = []
  let shift = 0
  let value = 0
  for (const ch of segment) {
    const digit = B64_MAP.get(ch)
    if (digit === undefined) throw new Error(`非法 base64-VLQ 字符: ${ch}`)
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
    } else {
      const negate = value & 1
      value >>>= 1
      values.push(negate ? (value === 0 ? -0x80000000 : -value) : value)
      shift = 0
      value = 0
    }
  }
  return values
}

/** 解析 source map v3 mappings → [{ genLine, genCol, srcIdx, srcLine, srcCol, name }] */
function parseMappings(map) {
  const entries = []
  const { mappings, names = [] } = map
  // srcIdx/srcLine/srcCol/nameIdx 为**跨行持续**累加的 delta 状态（spec：仅 genLine/genCol 每行重置）
  let srcIdx = 0
  let srcLine = 0
  let srcCol = 0
  let nameIdx = 0
  mappings.split(';').forEach((lineStr, genLine) => {
    let genCol = 0
    if (!lineStr) return
    for (const seg of lineStr.split(',')) {
      if (!seg) continue
      const v = decodeVLQ(seg)
      genCol += v[0]
      if (v.length >= 4) {
        srcIdx += v[1]
        srcLine += v[2]
        srcCol += v[3]
        let name
        if (v.length >= 5) {
          nameIdx += v[4]
          name = names[nameIdx]
        }
        entries.push({ genLine, genCol, srcIdx, srcLine, srcCol, name })
      } else {
        entries.push({ genLine, genCol })
      }
    }
  })
  return entries
}

function decode(mapPath, line, col) {
  const map = JSON.parse(readFileSync(mapPath, 'utf-8'))
  const entries = parseMappings(map).filter((e) => e.srcIdx !== undefined)
  // 同生成行内取 genCol <= col 的最近前序映射
  const inLine = entries.filter((e) => e.genLine === line - 1 && e.genCol <= col - 1)
  if (!inLine.length) {
    console.error(`未找到映射：${mapPath} ${line}:${col}（该位置可能是运行时注入代码，无对应源映射）`)
    process.exit(2)
  }
  const best = inLine[inLine.length - 1]
  const source = map.sources[best.srcIdx]
  // sourcesContent 优先展示源码行（vite 默认携带）
  let sourceSnippet = ''
  if (Array.isArray(map.sourcesContent) && map.sourcesContent[best.srcIdx]) {
    const srcLine = map.sourcesContent[best.srcIdx].split('\n')[best.srcLine] ?? ''
    sourceSnippet = `\n    → ${srcLine.trim().slice(0, 160)}`
  }
  console.log(`${source}:${best.srcLine + 1}:${best.srcCol + 1}${sourceSnippet}${best.name ? `  (fn: ${best.name})` : ''}`)
}

const argv = process.argv.slice(2)
if (argv[0] === '--trace') {
  const mapPath = argv[1]
  const input = readFileSync(0, 'utf-8')
  let count = 0
  for (const raw of input.split(/\r?\n/)) {
    const m = raw.match(/([\w.-]+\.js):(\d+):(\d+)/)
    if (m) {
      process.stdout.write(`${raw}\n    `)
      decode(mapPath, Number(m[2]), Number(m[3]))
      count++
    } else if (raw.trim()) {
      console.log(raw)
    }
  }
  console.error(`--trace: 共还原 ${count} 帧`)
} else if (argv.length >= 3) {
  const [mapPath, line, col] = argv
  decode(mapPath, Number(line), Number(col))
} else {
  console.error('用法: node scripts/decode-stack.mjs <js.map> <line> <column>\n      node scripts/decode-stack.mjs <js.map> --trace < stack.txt')
  process.exit(1)
}
