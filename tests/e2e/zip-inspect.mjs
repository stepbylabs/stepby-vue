/**
 * 最小 ZIP **读取**器（b139）：只做 e2e 判据需要的那三件事——列条目名、取条目内容、结构坏了要抛。
 *
 * ## 为什么自己写
 *
 * 与 `xlsx-fixture.mjs` 的写入器同一条理由：`stepby-vue` 的依赖里没有 ZIP 库，
 * 而判据要断言的是**后端真产出的 ZIP**（条目名是否按前缀组织、内容是不是真模板），
 * 不是"前端弹了个成功提示"。为两条判据往依赖里加一个解压库不划算；解析中央目录
 * 不到 80 行，且解析器自己的活性由用例内的正控/反证钉住（见 `zipInspectSelfCheck`）。
 *
 * ## 口径
 *
 * - 只读**中央目录**（EOCD → CD 链）：那是解压器实际读的索引；本地头只用来定位数据起点，
 *   两者名字不一致本身是可疑结构，`readZipEntries` 会当场抛错。
 * - 找不到 EOCD / 签名不对 / 条目数不吻合 / 偏移越界 ⇒ **抛错**。
 *   这条方向刻意的：把坏输入读成空集，会让"压缩包是空的"与"解析器没读懂"逐字节同形（AGENTS ⑥）。
 */
import zlib from 'node:zlib'

const SIG_EOCD = 0x06054b50
const SIG_CD = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** 解析器自身的活性自检：坏输入必须抛错，正常输入必须解析得出。返回 `{ ok, detail }`。 */
export function zipInspectSelfCheck() {
  try {
    readZipEntries(Buffer.from('this is definitely not a zip archive'))
    return { ok: false, detail: '坏输入未抛错（解析器把不可读读成了空集）' }
  } catch {
    // 预期路径
  }
  const empty = Buffer.alloc(22)
  empty.writeUInt32LE(SIG_EOCD, 0)
  const entries = readZipEntries(empty)
  return {
    ok: entries.length === 0,
    detail: `坏输入抛错 ✓；空包条目=${entries.length}`
  }
}

function findEocd(buf) {
  // EOCD 在末尾，注释最长 65535 —— 从尾部向前找签名
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  throw new Error('ZIP 结构无效：找不到 EOCD 记录')
}

/**
 * 读取全部条目（按中央目录顺序）。
 * @param {Buffer} buf
 * @returns {{ name: string, method: number, compressedSize: number, uncompressedSize: number, localOffset: number }[]}
 */
export function readZipEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('ZIP 结构无效：长度不足')
  const eocd = findEocd(buf)
  const total = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (cdOffset >= buf.length) throw new Error(`ZIP 结构无效：中央目录偏移越界（${cdOffset}/${buf.length}）`)

  const entries = []
  let at = cdOffset
  for (let i = 0; i < total; i++) {
    if (at + 46 > buf.length) throw new Error(`ZIP 结构无效：第 ${i + 1} 条中央目录越界`)
    if (buf.readUInt32LE(at) !== SIG_CD) throw new Error(`ZIP 结构无效：第 ${i + 1} 条中央目录签名不符`)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8')
    entries.push({
      name,
      method: buf.readUInt16LE(at + 10),
      compressedSize: buf.readUInt32LE(at + 20),
      uncompressedSize: buf.readUInt32LE(at + 24),
      localOffset: buf.readUInt32LE(at + 42)
    })
    at += 46 + nameLen + extraLen + commentLen
  }
  if (entries.length !== total) throw new Error(`ZIP 结构无效：条目数不吻合（声明 ${total}，读到 ${entries.length}）`)
  return entries
}

/** 取一条条目的内容（method 0 = 存储，8 = deflate；其余方法明确拒绝而不是返回空）。 */
export function readZipEntry(buf, entry) {
  const at = entry.localOffset
  if (at + 30 > buf.length) throw new Error(`ZIP 结构无效：${entry.name} 的本地头越界`)
  if (buf.readUInt32LE(at) !== SIG_LOCAL) throw new Error(`ZIP 结构无效：${entry.name} 的本地头签名不符`)
  const nameLen = buf.readUInt16LE(at + 26)
  const extraLen = buf.readUInt16LE(at + 28)
  const localName = buf.subarray(at + 30, at + 30 + nameLen).toString('utf8')
  if (localName !== entry.name) {
    throw new Error(`ZIP 结构可疑：中央目录名 ${entry.name} 与本地头名 ${localName} 不一致`)
  }
  const start = at + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method === 8) return zlib.inflateRawSync(raw)
  throw new Error(`ZIP 压缩方式不支持：${entry.method}（${entry.name}）`)
}
