/**
 * G-10 分片上传 / 断点续传 —— 前端 API 封装与编排器（批次十八）
 *
 * 后端协议（src/handler/upload_chunk_handler.rs）：
 * - init      POST /common/upload/chunk/init           JSON {fileName,totalParts,totalSize,partSize} → {sessionId,chunkSize,ttlSecs}
 * - part      POST /common/upload/chunk/part           multipart {sessionId,partIndex,file}         → {sessionId,received,totalParts,complete}
 * - session   GET  /common/upload/chunk/session/{id}   → {sessionId,received,totalParts,complete,receivedIndexes}
 * - complete  POST /common/upload/chunk/complete       JSON {sessionId} → CommonUploadResult（url/fileName/newFileName/originalFilename）
 * - abort     DELETE /common/upload/chunk/{sessionId}  → {code:200}
 *
 * 分流策略：≤ CHUNK_THRESHOLD 走既有单请求 /common/upload（el-upload 默认）；
 * > CHUNK_THRESHOLD 走分片链（单片 ≤ body limit 10MB 留 multipart 开销余量，取 5MB）。
 * 断点续传：任一片失败 → 查 session.receivedIndexes → 只补缺失片（最多 RESUME_ROUNDS 轮）；
 * 最终失败 → abort 清理会话与暂存分片（服务端 chunk_cleanup 定时任务兜底孤儿）。
 */
import axios from 'axios'
import { getToken } from '@/utils/auth'

/** 分流阈值：> 8MB 走分片（单请求 body limit 10MB 含 multipart 边界开销，留 2MB 余量） */
export const CHUNK_THRESHOLD = 8 * 1024 * 1024

/** 单片大小 5MB（≤ body limit 10MB 留 multipart 开销余量；后端 init 按片校验） */
export const CHUNK_PART_SIZE = 5 * 1024 * 1024

/** part 上传并发数（分片写盘无服务端闸门；3 路避免占满浏览器连接池） */
export const CHUNK_CONCURRENCY = 3

/** 断点续传轮数（每轮查询服务端已收索引后只补缺失片） */
export const RESUME_ROUNDS = 2

const BASE = import.meta.env.VITE_APP_BASE_API

/** 分流决策（纯函数，供组件与单测复用） */
export function shouldChunk(size: number): boolean {
  return size > CHUNK_THRESHOLD
}

/** 分片数计算（纯函数）：向上取整，至少 1 片 */
export function calcParts(totalSize: number, partSize: number = CHUNK_PART_SIZE): number {
  if (totalSize <= 0) return 1
  return Math.ceil(totalSize / partSize)
}

/** 计算缺失分片索引（纯函数）：全部索引 - 已收索引，升序 */
export function calcMissing(totalParts: number, receivedIndexes: number[]): number[] {
  const received = new Set(receivedIndexes)
  const missing: number[] = []
  for (let i = 0; i < totalParts; i++) {
    if (!received.has(i)) missing.push(i)
  }
  return missing
}

/** 切片（纯函数）：按 partSize 切 Blob，末片可能不足 partSize */
export function sliceParts(file: Blob, totalParts: number, partSize: number = CHUNK_PART_SIZE): Blob[] {
  const parts: Blob[] = []
  for (let i = 0; i < totalParts; i++) {
    parts.push(file.slice(i * partSize, Math.min((i + 1) * partSize, file.size)))
  }
  return parts
}

function authHeaders(): Record<string, string> {
  return { Authorization: 'Bearer ' + getToken() }
}

/** init 响应（camelCase，对齐后端 ChunkInitVo） */
export interface ChunkInitVo {
  sessionId: string
  chunkSize: number
  ttlSecs: number
}

/** 进度响应（对齐后端 ChunkProgressVo；receivedIndexes 仅 session 端点返回） */
export interface ChunkProgressVo {
  sessionId: string
  received: number
  totalParts: number
  complete: boolean
  receivedIndexes?: number[]
}

/** complete 响应（对齐后端 CommonUploadResult；与单请求 UploadFileResult 字段对齐） */
export interface ChunkCompleteResult {
  code: number
  msg: string
  url: string
  fileName: string
  newFileName: string
  originalFilename: string
}

/** 创建分片会话 */
export async function initChunk(
  fileName: string,
  totalParts: number,
  totalSize: number,
  partSize: number
): Promise<ChunkInitVo> {
  const res = await axios.post(
    `${BASE}/common/upload/chunk/init`,
    { fileName, totalParts, totalSize, partSize },
    { headers: authHeaders() }
  )
  return res.data.data as ChunkInitVo
}

/** 上传单片（multipart：sessionId/partIndex/file） */
export async function uploadChunkPart(sessionId: string, index: number, blob: Blob): Promise<ChunkProgressVo> {
  const form = new FormData()
  form.append('sessionId', sessionId)
  form.append('partIndex', String(index))
  form.append('file', blob, `part-${index}`)
  const res = await axios.post(`${BASE}/common/upload/chunk/part`, form, {
    headers: { ...authHeaders() } // Content-Type 留空让浏览器生成带 boundary 的头
  })
  return res.data.data as ChunkProgressVo
}

/** 查询会话进度（断点续传：返回已收索引列表） */
export async function getChunkSession(sessionId: string): Promise<ChunkProgressVo> {
  const res = await axios.get(`${BASE}/common/upload/chunk/session/${sessionId}`, {
    headers: authHeaders()
  })
  return res.data.data as ChunkProgressVo
}

/** 完成合并（服务端：拼接 → 整对象扫描 → 统一校验链 → 落最终存储）
 *  响应为 AjaxResult 包套 {code,msg,data:{url,fileName,...}}（集成测试锁定形状；与单请求扁平结构不同） */
export async function completeChunk(sessionId: string): Promise<ChunkCompleteResult> {
  const res = await axios.post(`${BASE}/common/upload/chunk/complete`, { sessionId }, { headers: authHeaders() })
  const body = res.data as { code: number; data?: ChunkCompleteResult }
  return (body.data ?? (body as unknown as ChunkCompleteResult)) as ChunkCompleteResult
}

/** 放弃会话（清理服务端会话与暂存分片） */
export async function abortChunk(sessionId: string): Promise<void> {
  await axios.delete(`${BASE}/common/upload/chunk/${sessionId}`, { headers: authHeaders() })
}

/**
 * complete 重试的可重试判据（纯函数，b118）。
 *
 * 重试只对"可能过一会儿就好了"的失败有意义：429（合并并发闸门忙）/ 503（服务暂不可用）
 * 与无响应（网络层）。确定性 4xx（会话缺失 / magic bytes 不符 / 大小超限）重试只会把
 * 失败反馈推迟 1.6s、并让一次用户动作在服务端留下 3 条 400——b118 实测一次 9MB 上传
 * 在 magic 校验失败时打了 3 次 complete。取不到状态码时按可重试处理（网络错误的形状）。
 */
export function isRetryableCompleteError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } } | null)?.response?.status
  if (typeof status !== 'number') return true
  return status === 429 || status === 503
}

export interface ChunkUploadOptions {
  /** 上传进度回调（0-100，按已传字节计） */
  onProgress?: (percent: number) => void
  /** 单片大小（字节）——默认 CHUNK_PART_SIZE；小文件测试/特殊场景可覆写 */
  partSize?: number
}

/**
 * 分片上传编排器（真实实现，无占位）：
 * init → 并发 N 路传片（失败片不打断批次）→ 断点续传轮（查 receivedIndexes 只补缺失片）
 * → 最终查询裁决：complete=true 才调 complete（429 闸门自动重试）；未收齐 → abort 清理后抛出。
 *
 * 返回 complete 的响应（url 字段为最终文件访问地址，与单请求 UploadFileResult.fileName 同义）。
 */
export async function uploadFileChunked(file: File, opts: ChunkUploadOptions = {}): Promise<ChunkCompleteResult> {
  const totalSize = file.size
  const partSize = opts.partSize ?? CHUNK_PART_SIZE
  const totalParts = calcParts(totalSize, partSize)

  const initVo = await initChunk(file.name, totalParts, totalSize, partSize)
  const sessionId = initVo.sessionId
  const parts = sliceParts(file, totalParts, partSize)

  let uploadedCount = 0

  /** 传一片（失败不抛——服务端 receivedIndexes 是权威进度，缺失片由续传轮补传；
   *  重复传幂等：服务端按索引覆盖写暂存分片） */
  async function uploadOne(index: number): Promise<void> {
    try {
      await uploadChunkPart(sessionId, index, parts[index])
      // b117：只有服务端确认收下的片才计入进度。此前失败片也 +1 ⇒ 进度能到 99%
      // 而文件其实缺片（断点续传轮随后才补），慢网用户看到的是"快好了"然后失败。
      uploadedCount++
    } catch {
      // 静默：该片会在续传轮经 getChunkSession 发现后补传
    }
    if (opts.onProgress) {
      opts.onProgress(Math.min(99, Math.round((uploadedCount / totalParts) * 99)))
    }
  }

  /** 并发受限的批量传片（allSettled：单片失败不打断批次，靠续传轮收敛） */
  async function uploadAll(indexes: number[]): Promise<void> {
    for (let i = 0; i < indexes.length; i += CHUNK_CONCURRENCY) {
      const batch = indexes.slice(i, i + CHUNK_CONCURRENCY)
      await Promise.allSettled(batch.map((idx) => uploadOne(idx)))
    }
  }

  try {
    // 首轮：全量片
    await uploadAll(Array.from({ length: totalParts }, (_, i) => i))

    // 断点续传轮：查服务端已收索引，只补缺失片
    for (let round = 0; round < RESUME_ROUNDS; round++) {
      const progress = await getChunkSession(sessionId)
      if (progress.complete) break
      const received = progress.receivedIndexes ?? []
      const missing = calcMissing(totalParts, received)
      if (missing.length === 0) break
      await uploadAll(missing)
    }

    // 最终裁决：查询服务端权威进度——未收齐不盲调 complete（缺片 complete 必 400）
    const final = await getChunkSession(sessionId)
    if (!final.complete) {
      throw new Error(`chunk parts incomplete: ${final.received}/${final.totalParts}`)
    }

    // complete（仅对可重试失败重试：429 闸门忙 / 503 / 网络；确定性 4xx 立即抛出）
    let result: ChunkCompleteResult | null = null
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800))
      try {
        result = await completeChunk(sessionId)
      } catch (e) {
        if (attempt === 2 || !isRetryableCompleteError(e)) throw e
      }
    }
    if (!result) throw new Error('chunk complete failed')
    if (opts.onProgress) opts.onProgress(100)
    return result
  } catch (err) {
    // 最终失败：清理服务端会话与暂存分片（best-effort；孤儿由 chunk_cleanup 定时任务兜底）
    await abortChunk(sessionId).catch(() => {})
    throw err
  }
}
