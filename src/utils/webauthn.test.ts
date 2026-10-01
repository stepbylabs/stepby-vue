import { describe, it, expect, afterEach } from 'vitest'
import {
  isWebauthnSupported,
  isUserCancelled,
  base64UrlToBuffer,
  bufferToBase64Url,
  toCreationOptions,
  toRequestOptions,
  registrationToDto,
  assertionToDto
} from '@/utils/webauthn'

/** 以 Buffer 的 base64url 输出作为独立基准（不依赖被测实现的替换逻辑） */
function expectedBase64Url(bytes: number[]): string {
  return Buffer.from(new Uint8Array(bytes)).toString('base64url')
}

/** 从 WebAuthn 的 BufferSource 视图取出字节数组（便于断言深转换结果） */
function bytesOf(source: BufferSource): number[] {
  return Array.from(new Uint8Array(source as ArrayBuffer))
}

describe('base64UrlToBuffer / bufferToBase64Url', () => {
  it('基础往返：base64url → ArrayBuffer → base64url', () => {
    const source = 'aGVsbG8' // "hello"
    const buffer = base64UrlToBuffer(source)
    expect(Array.from(new Uint8Array(buffer))).toEqual([104, 101, 108, 108, 111])
    expect(bufferToBase64Url(buffer)).toBe(source)
  })

  it('ArrayBuffer → base64url → ArrayBuffer 往返（多组字节）', () => {
    const samples: number[][] = [
      [0],
      [0, 0, 0],
      [104, 101, 108, 108, 111],
      [0xfb, 0xff, 0xbe],
      [1, 2, 3, 4, 5, 6, 7, 8],
      [255, 254, 253, 252]
    ]
    for (const bytes of samples) {
      const encoded = bufferToBase64Url(new Uint8Array(bytes).buffer)
      expect(encoded).toBe(expectedBase64Url(bytes))
      expect(Array.from(new Uint8Array(base64UrlToBuffer(encoded)))).toEqual(bytes)
    }
  })

  it('覆盖含 - / _ 的 base64url 且输出无填充', () => {
    const bytes = [0xfb, 0xff, 0xbe]
    const encoded = bufferToBase64Url(new Uint8Array(bytes).buffer)
    // 基准确认该向量确实包含 url-safe 字符 '-'
    expect(encoded).toBe(expectedBase64Url(bytes))
    expect(encoded).toContain('-')
    expect(encoded).not.toContain('=')
    expect(Array.from(new Uint8Array(base64UrlToBuffer(encoded)))).toEqual(bytes)
  })

  it('覆盖含 _ 的向量（字节 0xff 0xfe 0xff 等）', () => {
    const bytes = [0xff, 0xef, 0xbe]
    const encoded = bufferToBase64Url(new Uint8Array(bytes).buffer)
    expect(encoded).toBe(expectedBase64Url(bytes))
    expect(encoded).toContain('_')
    expect(Array.from(new Uint8Array(base64UrlToBuffer(encoded)))).toEqual(bytes)
  })

  it('解码容忍带 = 填充的输入', () => {
    expect(Array.from(new Uint8Array(base64UrlToBuffer('aGVsbG8=')))).toEqual([104, 101, 108, 108, 111])
  })

  it('空值边界：空字节 ↔ 空字符串', () => {
    expect(bufferToBase64Url(new ArrayBuffer(0))).toBe('')
    expect(base64UrlToBuffer('').byteLength).toBe(0)
  })
})

describe('isWebauthnSupported', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'PublicKeyCredential')
  })

  it('window.PublicKeyCredential 存在时返回 true', () => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: class {}, configurable: true, writable: true })
    expect(isWebauthnSupported()).toBe(true)
  })

  it('window.PublicKeyCredential 缺失时返回 false', () => {
    Reflect.deleteProperty(window, 'PublicKeyCredential')
    expect(isWebauthnSupported()).toBe(false)
  })
})

describe('isUserCancelled', () => {
  it('NotAllowedError / AbortError 视为用户取消', () => {
    expect(isUserCancelled(new DOMException('cancelled', 'NotAllowedError'))).toBe(true)
    expect(isUserCancelled(new DOMException('aborted', 'AbortError'))).toBe(true)
  })

  it('其他异常与非异常对象不视为取消', () => {
    expect(isUserCancelled(new Error('boom'))).toBe(false)
    expect(isUserCancelled(new DOMException('bad', 'InvalidStateError'))).toBe(false)
    expect(isUserCancelled(undefined)).toBe(false)
    expect(isUserCancelled('NotAllowedError')).toBe(false)
  })
})

describe('toRequestOptions', () => {
  it('仅深转换 challenge / allowCredentials[].id，其余字段透传', () => {
    const descriptorId = expectedBase64Url([0xfb, 0xff, 0xbe])
    const options = toRequestOptions({
      challenge: 'aGVsbG8',
      timeout: 60000,
      rpId: 'example.com',
      allowCredentials: [{ type: 'public-key', id: descriptorId, transports: ['usb'] }],
      userVerification: 'preferred'
    })

    expect(options.challenge).toBeInstanceOf(ArrayBuffer)
    expect(bytesOf(options.challenge)).toEqual([104, 101, 108, 108, 111])
    expect(options.rpId).toBe('example.com')
    expect(options.timeout).toBe(60000)
    expect(options.userVerification).toBe('preferred')
    expect(options.allowCredentials).toHaveLength(1)
    expect(options.allowCredentials?.[0].id).toBeInstanceOf(ArrayBuffer)
    expect(bytesOf(options.allowCredentials?.[0].id as BufferSource)).toEqual([0xfb, 0xff, 0xbe])
    expect(options.allowCredentials?.[0].transports).toEqual(['usb'])
  })

  it('缺省可选字段时不产生多余键', () => {
    const options = toRequestOptions({ challenge: 'aGVsbG8', rpId: 'example.com' })
    expect(options.allowCredentials).toBeUndefined()
    expect(options.timeout).toBeUndefined()
    expect(options.userVerification).toBeUndefined()
  })
})

describe('toCreationOptions', () => {
  it('深转换 challenge / user.id / excludeCredentials[].id，其余字段透传', () => {
    const options = toCreationOptions({
      rp: { name: 'Stepby', id: 'example.com' },
      user: { id: 'aGVsbG8', name: 'alice', displayName: 'Alice' },
      challenge: 'aGVsbG8',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      excludeCredentials: [{ type: 'public-key', id: 'aGVsbG8', transports: ['usb'] }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      attestation: 'none'
    })

    expect(options.rp).toEqual({ name: 'Stepby', id: 'example.com' })
    expect(options.challenge).toBeInstanceOf(ArrayBuffer)
    expect(options.user.id).toBeInstanceOf(ArrayBuffer)
    expect(bytesOf(options.user.id)).toEqual([104, 101, 108, 108, 111])
    expect(options.user.name).toBe('alice')
    expect(options.user.displayName).toBe('Alice')
    expect(options.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }])
    expect(options.timeout).toBe(60000)
    expect(options.excludeCredentials?.[0].id).toBeInstanceOf(ArrayBuffer)
    expect(options.excludeCredentials?.[0].transports).toEqual(['usb'])
    expect(options.authenticatorSelection?.residentKey).toBe('preferred')
    expect(options.authenticatorSelection?.userVerification).toBe('preferred')
    expect(options.attestation).toBe('none')
  })

  it('缺省可选字段时不产生多余键', () => {
    const options = toCreationOptions({
      rp: { name: 'Stepby', id: 'example.com' },
      user: { id: 'aGVsbG8', name: 'alice', displayName: 'Alice' },
      challenge: 'aGVsbG8',
      pubKeyCredParams: []
    })
    expect(options.excludeCredentials).toBeUndefined()
    expect(options.authenticatorSelection).toBeUndefined()
    expect(options.attestation).toBeUndefined()
    expect(options.timeout).toBeUndefined()
  })
})

describe('registrationToDto / assertionToDto', () => {
  it('注册结果回写为 base64url 字段', () => {
    const rawId = new Uint8Array([1, 2, 3]).buffer
    const clientDataJSON = new Uint8Array([4, 5]).buffer
    const attestationObject = new Uint8Array([6, 7]).buffer
    const credential = {
      id: 'AQID',
      rawId,
      type: 'public-key',
      response: { clientDataJSON, attestationObject }
    } as unknown as PublicKeyCredential

    expect(registrationToDto(credential, 'My key')).toEqual({
      id: 'AQID',
      rawId: bufferToBase64Url(rawId),
      type: 'public-key',
      response: {
        clientDataJSON: bufferToBase64Url(clientDataJSON),
        attestationObject: bufferToBase64Url(attestationObject)
      },
      name: 'My key'
    })
  })

  it('注册结果名称为空时回写 null', () => {
    const credential = {
      id: 'AQID',
      rawId: new Uint8Array([1]).buffer,
      type: 'public-key',
      response: { clientDataJSON: new ArrayBuffer(0), attestationObject: new ArrayBuffer(0) }
    } as unknown as PublicKeyCredential
    expect(registrationToDto(credential, null).name).toBeNull()
  })

  it('登录断言回写为 base64url 字段，userHandle 为空时回写 null', () => {
    const rawId = new Uint8Array([1, 2, 3]).buffer
    const clientDataJSON = new Uint8Array([4, 5]).buffer
    const authenticatorData = new Uint8Array([6]).buffer
    const signature = new Uint8Array([7, 8, 9]).buffer
    const credential = {
      id: 'AQID',
      rawId,
      type: 'public-key',
      response: { clientDataJSON, authenticatorData, signature, userHandle: null }
    } as unknown as PublicKeyCredential

    expect(assertionToDto(credential, 'alice')).toEqual({
      username: 'alice',
      id: 'AQID',
      rawId: bufferToBase64Url(rawId),
      type: 'public-key',
      response: {
        clientDataJSON: bufferToBase64Url(clientDataJSON),
        authenticatorData: bufferToBase64Url(authenticatorData),
        signature: bufferToBase64Url(signature),
        userHandle: null
      }
    })
  })

  it('登录断言的 userHandle 存在时回写 base64url', () => {
    const userHandle = new Uint8Array([10, 11]).buffer
    const credential = {
      id: 'AQID',
      rawId: new Uint8Array([1]).buffer,
      type: 'public-key',
      response: {
        clientDataJSON: new ArrayBuffer(0),
        authenticatorData: new ArrayBuffer(0),
        signature: new ArrayBuffer(0),
        userHandle
      }
    } as unknown as PublicKeyCredential
    expect(assertionToDto(credential, 'alice').response.userHandle).toBe(bufferToBase64Url(userHandle))
  })
})