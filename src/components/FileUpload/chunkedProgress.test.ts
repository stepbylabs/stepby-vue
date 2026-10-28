/**
 * FileUpload 分片上传进度接线（b117）。
 *
 * 立的案：`uploadFileChunked` 的 `onProgress` 全仓零消费点，>8MB 文件只有静态"请稍候"。
 * 本文件钉住接线本身（组件 → modal.updateLoading）以及两条收敛路径不因接线而改变：
 * 成功仍提交 modelValue 并关遮罩、失败仍关遮罩并提示。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  loading: vi.fn(),
  updateLoading: vi.fn(),
  closeLoading: vi.fn(),
  msgError: vi.fn(),
  uploadFileChunked: vi.fn(),
  chunkOpts: null as null | { onProgress?: (percent: number) => void }
}))

vi.mock('@/utils/auth', () => ({ getToken: () => 'tkn' }))
vi.mock('@/store/modules/user', () => ({ default: () => ({}) }))
vi.mock('@/plugins/modal', () => ({
  default: {
    loading: (...a: unknown[]) => hoisted.loading(...a),
    updateLoading: (...a: unknown[]) => hoisted.updateLoading(...a),
    closeLoading: () => hoisted.closeLoading(),
    msgError: (...a: unknown[]) => hoisted.msgError(...a)
  }
}))
vi.mock('@/utils/navigation', () => ({ goLogin: vi.fn() }))
vi.mock('@/api/upload', () => ({
  shouldChunk: () => true,
  uploadFileChunked: (file: File, opts: { onProgress?: (percent: number) => void }) => {
    hoisted.chunkOpts = opts
    return hoisted.uploadFileChunked(file)
  }
}))
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
  'el-upload': {
    name: 'ElUpload',
    props: ['beforeUpload'],
    template: '<div class="upload-stub"><slot /></div>'
  },
  'el-button': { template: '<button><slot /></button>' },
  'el-link': { template: '<a><slot /></a>' },
  'el-icon': { template: '<i><slot /></i>' },
  'transition-group': { template: '<div><slot /></div>' }
}

function mountUpload() {
  return mount(FileUpload, {
    props: { modelValue: '', drag: false, fileType: [] },
    global: { stubs }
  })
}

function bigFile(): File {
  return new File(['x'], 'big.bin', { type: 'application/octet-stream' })
}

function triggerBeforeUpload(w: ReturnType<typeof mountUpload>, file: File): boolean {
  const upload = w.findComponent({ name: 'ElUpload' })
  const beforeUpload = upload.props('beforeUpload') as (f: File) => boolean
  return beforeUpload(file)
}

describe('FileUpload 分片上传进度接线（b117）', () => {
  beforeEach(() => {
    hoisted.loading.mockReset()
    hoisted.updateLoading.mockReset()
    hoisted.closeLoading.mockReset()
    hoisted.msgError.mockReset()
    hoisted.uploadFileChunked.mockReset()
    hoisted.chunkOpts = null
  })

  it('分片路径把 onProgress 接到遮罩文案（百分比来自服务端确认收下的分片数）', async () => {
    hoisted.uploadFileChunked.mockResolvedValue({
      code: 200,
      msg: 'ok',
      url: '/uploads/a.bin',
      fileName: '/uploads/a.bin'
    })
    const w = mountUpload()

    expect(triggerBeforeUpload(w, bigFile())).toBe(false) // before-upload 返回 false 阻止 el-upload 默认单请求
    await flushPromises()

    expect(hoisted.loading).toHaveBeenCalledTimes(1)
    expect(typeof hoisted.chunkOpts?.onProgress).toBe('function')

    hoisted.chunkOpts?.onProgress?.(42)
    expect(hoisted.updateLoading).toHaveBeenCalledWith('fileUpload.uploadingProgress:{"percent":42}')
  })

  it('成功仍提交 modelValue 并关遮罩（接线不得改变收敛路径）', async () => {
    hoisted.uploadFileChunked.mockResolvedValue({
      code: 200,
      msg: 'ok',
      url: '/uploads/a.bin',
      fileName: '/uploads/a.bin'
    })
    const w = mountUpload()
    triggerBeforeUpload(w, bigFile())
    await flushPromises()

    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['/uploads/a.bin'])
    expect(hoisted.closeLoading).toHaveBeenCalledTimes(1)
  })

  it('失败关遮罩并提示（进度条不会停在"看起来快好了"）', async () => {
    hoisted.uploadFileChunked.mockRejectedValue(new Error('network down'))
    const w = mountUpload()
    triggerBeforeUpload(w, bigFile())
    await flushPromises()

    expect(hoisted.closeLoading).toHaveBeenCalledTimes(1)
    expect(hoisted.msgError).toHaveBeenCalledWith('fileUpload.uploadFailed')
  })
})
