/**
 * 最小 xlsx 夹具生成器（批八十三 · 供 M90 的 `POST /system/user/importData` 真闭环使用）。
 *
 * ## 为什么要自己造，而不是直接回传服务端下发的模板
 *
 * 模板里那一行示例数据是**固定**的 `zhangsan / 张三 / 研发部`。拿它当导入入参就得到：
 * ① 导入成功后库里留下一个**不属于 `e2e%` 命名族**的用户 ⇒ `residue-cleanup` 的谓词覆盖不到它，
 *    残留每轮 +1 却无人报（b78 立过案的那一族）；
 * ② 判据结论由"上一轮有没有人导过 zhangsan"决定（第二次跑就变成"登录名已存在"），
 *    属"门禁与环境耦合"（AGENTS《测试门禁全景》④）。
 * 要闭环成"自建自清"，登录名必须由测试自己命名（`e2e90imp<ts>`），因此需要**能写**xlsx。
 *
 * ## 为什么手写 ZIP 而不是加一个依赖
 *
 * `stepby-vue` 现在没有任何 Excel 库（`xlsx`/`exceljs` 都不在 package.json 里），
 * 为一条 e2e 判据往生产依赖里塞一个解析器是本末倒置。xlsx 的**读取侧**由后端 `calamine` 承担，
 * 测试只需要"表头 + 若干文本单元格"，那就是一个 ZIP + 四个 XML part，STORE（不压缩）即可：
 * 无 deflate 实现、无流式拼接，CRC-32 由 `zlib.crc32`（Node ≥22.2）给出。
 *
 * 只写文本单元格（`t="inlineStr"`）：calamine 支持内联字符串，因此连 `sharedStrings.xml`
 * 都不需要——少一个 part 就少一处会写坏的地方。
 */
import zlib from 'node:zlib'

const enc = new TextEncoder()

/** ZIP 本地文件头 + 中央目录需要的字段 */
function crc32(buf) {
  return zlib.crc32(buf) >>> 0
}

function dosTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/**
 * 把若干 `name → bytes` 打成 STORE 档 ZIP。
 * 结构逐字段按 APPNOTE 4.3.x：本地头 30 字节 + 名 + 数据；中央目录项 46 字节 + 名；EOCD 22 字节。
 */
function zipStore(entries) {
  const { time, date } = dosTime()
  const locals = []
  const centralParts = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuf = enc.encode(name)
    const crc = crc32(data)
    const lh = new Uint8Array(30 + nameBuf.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags：不写数据描述符（尺寸/CRC 就地给出）
    lv.setUint16(8, 0, true) // method = store
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBuf.length, true)
    lv.setUint16(28, 0, true)
    lh.set(nameBuf, 30)
    locals.push(lh, data)

    const ch = new Uint8Array(46 + nameBuf.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBuf.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true)
    ch.set(nameBuf, 46)
    centralParts.push(ch)
    offset += lh.length + data.length
  }
  const centralSize = centralParts.reduce((n, b) => n + b.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const b of [...locals, ...centralParts, eocd]) {
    out.set(b, p)
    p += b.length
  }
  return out
}

const xml = (s) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`)
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 列号（1 起）→ A/B/…/Z/AA… */
function colName(i) {
  let s = ''
  let n = i
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * 生成"表头 + rows"的单 sheet xlsx。
 * @param {string} sheetName
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {Uint8Array}
 */
export function buildXlsx(sheetName, headers, rows) {
  const cells = (rowIdx, values) =>
    values
      .map((v, i) => {
        const ref = `${colName(i + 1)}${rowIdx}`
        const t = String(v ?? '')
        // 空串写成**空单元格**：`<is><t></t></is>` 会被读成一个长度为 0 的字符串，
        // 而后端 `parse_import_rows` 判"有没有这一列"用的是 `Option<String>`，
        // 两者对"部门名称留空"的语义应当一致 ⇒ 直接省略 `<c>`。
        if (t === '') return ''
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`
      })
      .join('')

  const allRows = [headers, ...rows]
  const dimension = `A1:${colName(headers.length)}${allRows.length}`
  const sheet =
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetData>${allRows.map((r, k) => `<row r="${k + 1}">${cells(k + 1, r)}</row>`).join('')}</sheetData>` +
    `</worksheet>`

  const contentTypes =
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`

  const rootRels =
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`

  const workbook =
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`

  const workbookRels =
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`

  return zipStore([
    { name: '[Content_Types].xml', data: xml(contentTypes) },
    { name: '_rels/.rels', data: xml(rootRels) },
    { name: 'xl/workbook.xml', data: xml(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: xml(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: xml(sheet) }
  ])
}

/**
 * 自检：ZIP 结构自证（不依赖外部解析器）。
 * ① EOCD 签名与条目数；② 每个中央目录项能定位到本地头且名一致；
 * ③ 数据字节与原 entry 完全相等、CRC 相符（错位一位就全红）。
 * @returns {string[]} 失败原因列表（空 = 通过）
 */
export function selftest() {
  const fails = []
  const headers = ['登录名称*', '用户姓名*', '部门名称']
  const rows = [
    ['e2e90imp', '张三', '研发部'],
    ['e2e90imp2', '李四', '']
  ]
  const bytes = buildXlsx('用户导入', headers, rows)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const eocdSig = 0x06054b50
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (dv.getUint32(i, true) === eocdSig) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return ['找不到 EOCD']
  const count = dv.getUint16(eocd + 10, true)
  if (count !== 5) fails.push(`中央目录项数=${count}（期望 5）`)
  const centralOff = dv.getUint32(eocd + 16, true)
  if (bytes[centralOff] !== 0x50) fails.push('中央目录首字节不是 PK')

  let p = centralOff
  const seen = []
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) {
      fails.push(`第 ${k} 个中央目录项签名错（偏移 ${p}）`)
      break
    }
    const crc = dv.getUint32(p + 16, true)
    const size = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const localOff = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    seen.push(name)
    if (dv.getUint32(localOff, true) !== 0x04034b50) fails.push(`${name} 的本地头签名错`)
    const lhNameLen = dv.getUint16(localOff + 26, true)
    const lhExtraLen = dv.getUint16(localOff + 28, true)
    if (lhNameLen !== nameLen) fails.push(`${name} 本地/中央名字长度不一致`)
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen
    const data = bytes.subarray(dataStart, dataStart + size)
    if (new TextDecoder().decode(bytes.subarray(localOff + 30, localOff + 30 + lhNameLen)) !== name)
      fails.push(`${name} 本地头里的名字与中央目录不一致`)
    if (crc32(data) !== crc) fails.push(`${name} CRC 不符（数据或目录写坏了）`)
    if (name === 'xl/worksheets/sheet1.xml') {
      const text = new TextDecoder().decode(data)
      if (!text.includes('e2e90imp')) fails.push('sheet 内容里没有期望的单元格里值')
      if (/t="inlineStr"><is><t[^>]*><\/t>/.test(text)) fails.push('空串被写成了空内联字符串（应省略 <c>）')
    }
    p += 46 + nameLen
  }
  for (const need of [
    '[Content_Types].xml',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/worksheets/sheet1.xml'
  ]) {
    if (!seen.includes(need)) fails.push(`ZIP 里缺少 ${need}`)
  }
  return fails
}

/**
 * 命令行自检入口。
 * 判据形状沿用本仓约定：**结构自证不能只靠"后端接受了我的文件"这一条外部证据**——
 * 那要跑一次真 HTTP 才知道坏没坏，而 ZIP 写坏的地方（CRC、偏移、名长不一致）在本地就能全查出来。
 */
if (process.argv[1] && new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href === import.meta.url) {
  const fails = selftest()
  if (fails.length) {
    console.log('SYNTH_FAIL xlsx-fixture:')
    fails.forEach((f) => console.log(`  · ${f}`))
    process.exit(1)
  }
  console.log('SYNTH_OK xlsx-fixture ZIP 结构自证（EOCD/中央目录/本地头/CRC/空串省略 <c>）')
  process.exit(0)
}
