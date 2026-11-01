/**
 * FileUpload 声明上限与分流阈值的关系锁（b146）。
 *
 * 立的案（改造前 HEAD 实测 `components/FileUpload/index.vue::handleBeforeUpload`）：
 * `if (shouldChunk(file.size)) { …; return false }` **排在** fileSize 校验之前，注释还写着
 * "fileSize prop 校验仅对单请求路径生效"。而组件自己的提示是
 * 「大小不超过 {{ fileSize }}MB」——默认 5MB ⇒ 一个 9MB 的文件绕过校验、直接经分片链传成功。
 * 屏上那句话因此没有判据支撑（与 b139 的"字段存在但没人消费"同族：声明与执行分家，
 * 而且这次执行路径明确写着"跳过它"）。
 *
 * 修法不是把提示改成"5MB 以下更快"，而是让**声明的上限对两条路径都成立**：
 * 8MB 是传输方式（单请求 / 分片），fileSize 是策略；策略不得被实现细节绕过。
 *
 * 四条判据各自挡一种退化：
 * ① 超过声明上限的大文件 ⇒ 拒绝且不发起任何上传（防"提示归提示、上传归上传"）；
 * ② 上限内的大文件 ⇒ 照常走分片链（**对照组**：证明①不是"永远拒绝"的假修复，能力没被砍）；
 * ③ 上限内的小文件 ⇒ 仍走单请求（返回 true，交回 el-upload）；
 * ④ `fileSize = 0` ⇒ 语义是"不限制"，大文件照常上传（防有人把闸改成无条件）。
 *
 * `shouldChunk` 一律用**真实实现**（阈值 8MB）——本文件判的正是"阈值与上限这两件事的关系"，
 * 把它桩成恒 true 就退化成只判分支、不判阈值（㉓：夹具形状必须等于生产码的真实形状）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const MB = 1024 * 1024

const hoisted = vi.hoisted(() => ({
  loading: vi.fn(),
  closeLoading: vi.fn(),
  msgError: vi.fn(),
  uploadFileChunked: vi.fn()
}))

vi.mock('@/utils/auth', () => ({ getToken: () => 'tkn' }))
vi.mock('@/store/modules/user', () => ({ default: () => ({}) }))
vi.mock('@/plugins/modal', () => ({
  default: {
    loading: (...a: unknown[]) => hoisted.loading(...a),
    updateLoading: vi.fn(),
    closeLoading: () => hoisted.closeLoading(),
    msgError: (...a: unknown[]) => hoisted.msgError(...a)
  }
}))
vi.mock('@/utils/navigation', () => ({ goLogin: vi.fn() }))
vi.mock('@/api/upload', async (orig) => {
  const actual = await orig<typeof import('@/api/upload')>()
  return {
    ...actual, // shouldChunk / CHUNK_THRESHOLD 用真实值
    uploadFileChunked: (...a: unknown[]) => hoisted.uploadFileChunked(...a)
  }
})
vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (k: string, params?: Record<string, unknown>) => (params ? `${k}:${JSON.stringify(params)}` : k)
    })
  }
})

import FileUpload from './index.vue'

const stubs = {
  'el-upload': { name: 'ElUpload', props: ['beforeUpload'], template: '<div class="upload-stub"><slot /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-link': { template: '<a><slot /></a>' },
  'el-icon': { template: '<i><slot /></i>' },
  'transition-group': { template: '<div><slot /></div>' }
}

/** 真实字节数的 File（`size` 由内容决定，不是手搓的 `{size: …}` 影子形状） */
function fileOf(bytes: number, name: string): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' })
}

function mountUpload(props: Record<string, unknown>) {
  return mount(FileUpload, {
    props: { modelValue: '', drag: false, fileType: [], ...props },
    global: { stubs }
  })
}

function trigger(w: ReturnType<typeof mountUpload>, file: File): boolean {
  const before = w.findComponent({ name: 'ElUpload' }).props('beforeUpload') as (f: File) => boolean
  return before(file)
}

beforeEach(() => {
  hoisted.loading.mockReset()
  hoisted.closeLoading.mockReset()
  hoisted.msgError.mockReset()
  hoisted.uploadFileChunked.mockReset()
  hoisted.uploadFileChunked.mockResolvedValue({ code: 200, msg: 'ok', fileName: '/uploads/a.bin' })
})

describe('FileUpload 声明上限对两条传输路径都成立（b146）', () => {
  it('① 提示写 5MB ⇒ 9MB 文件必须被拒，且不发起分片上传、不开遮罩', async () => {
    const w = mountUpload({ fileSize: 5 })
    const rejected = trigger(w, fileOf(9 * MB, 'big.bin'))
    await flushPromises()

    expect(rejected, 'before-upload 必须返回 false').toBe(false)
    expect(hoisted.msgError).toHaveBeenCalledWith('fileUpload.fileSizeExceeded:{"size":5}')
    expect(hoisted.uploadFileChunked, '超限文件不得经分片链出网').not.toHaveBeenCalled()
    expect(hoisted.loading, '被拒绝的文件不得留下"上传中"遮罩').not.toHaveBeenCalled()
  })

  it('② 上限 20MB ⇒ 同一个 9MB 文件照常走分片链（对照组：证明①不是"永远拒绝"）', async () => {
    const w = mountUpload({ fileSize: 20 })
    trigger(w, fileOf(9 * MB, 'big.bin'))
    await flushPromises()

    expect(hoisted.uploadFileChunked, '上限内的大文件必须仍可用分片链').toHaveBeenCalledTimes(1)
    expect(hoisted.msgError).not.toHaveBeenCalled()
  })

  it('③ 上限内的小文件仍走单请求路径（返回 true 交回 el-upload）', () => {
    const w = mountUpload({ fileSize: 5 })
    expect(trigger(w, fileOf(1024, 'small.bin'))).toBe(true)
    expect(hoisted.uploadFileChunked).not.toHaveBeenCalled()
  })

  it('④ fileSize=0 的语义是"不限制"⇒ 9MB 照常上传（防把闸改成无条件拒绝）', async () => {
    const w = mountUpload({ fileSize: 0 })
    trigger(w, fileOf(9 * MB, 'big.bin'))
    await flushPromises()

    expect(hoisted.uploadFileChunked).toHaveBeenCalledTimes(1)
    expect(hoisted.msgError).not.toHaveBeenCalled()
  })
})
