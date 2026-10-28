/**
 * 全屏通道单测（b112）
 *
 * 锁死四类结局（每一类都对应改造前的真实形态）：
 * 1. 进入/退出成功 ⇒ `true`（调用方据此不弹失败提示）；
 * 2. `requestFullscreen` / `exitFullscreen` **reject** ⇒ `false` 且**不抛错**（改造前是 unhandledrejection）；
 * 3. 方法不存在（iframe 策略/旧内核）⇒ `false`（改造前可选链静默跳过，用户毫无反馈）；
 * 4. 目标元素参数被真正使用（不是永远拿 documentElement）。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFullscreen, toggleFullscreen } from './fullscreen'

const doc = document as Document & { fullscreenElement?: Element | null }
const root = document.documentElement as Element & { requestFullscreen?: () => Promise<void> }
const savedFullscreenElement = Object.getOwnPropertyDescriptor(doc, 'fullscreenElement')
const savedExit = Object.getOwnPropertyDescriptor(doc, 'exitFullscreen')
const savedRootRequest = Object.getOwnPropertyDescriptor(root, 'requestFullscreen')

function setFullscreenElement(value: Element | null): void {
  Object.defineProperty(doc, 'fullscreenElement', { configurable: true, get: () => value })
}

function setExitFullscreen(fn: (() => Promise<void>) | undefined): void {
  Object.defineProperty(doc, 'exitFullscreen', { configurable: true, value: fn })
}

function setRootRequest(fn: (() => Promise<void>) | undefined): void {
  Object.defineProperty(root, 'requestFullscreen', { configurable: true, value: fn })
}

afterEach(() => {
  if (savedFullscreenElement) Object.defineProperty(doc, 'fullscreenElement', savedFullscreenElement)
  else Reflect.deleteProperty(doc, 'fullscreenElement')
  if (savedExit) Object.defineProperty(doc, 'exitFullscreen', savedExit)
  else Reflect.deleteProperty(doc, 'exitFullscreen')
  if (savedRootRequest) Object.defineProperty(root, 'requestFullscreen', savedRootRequest)
  else Reflect.deleteProperty(root, 'requestFullscreen')
})

describe('① 状态读取', () => {
  it('无 fullscreenElement ⇒ false', () => {
    setFullscreenElement(null)
    expect(isFullscreen()).toBe(false)
  })

  it('有 fullscreenElement ⇒ true', () => {
    setFullscreenElement(document.body)
    expect(isFullscreen()).toBe(true)
  })
})

describe('② 进入全屏', () => {
  it('resolve ⇒ true，且调用的是 documentElement', async () => {
    setFullscreenElement(null)
    const req = vi.fn(() => Promise.resolve())
    setRootRequest(req)
    await expect(toggleFullscreen()).resolves.toBe(true)
    expect(req).toHaveBeenCalledTimes(1)
  })

  it('reject ⇒ false 且不抛错（改造前这里逃逸成 unhandledrejection）', async () => {
    setFullscreenElement(null)
    setRootRequest(() => Promise.reject(new Error('denied by permissions policy')))
    await expect(toggleFullscreen()).resolves.toBe(false)
  })

  it('requestFullscreen 不存在 ⇒ false（可选链版本在这里静默无反应）', async () => {
    setFullscreenElement(null)
    setRootRequest(undefined)
    await expect(toggleFullscreen()).resolves.toBe(false)
  })

  it('显式目标元素被使用（不是永远拿 documentElement）', async () => {
    setFullscreenElement(null)
    setRootRequest(undefined)
    const target = document.body as Element & { requestFullscreen?: () => Promise<void> }
    const req = vi.fn(() => Promise.resolve())
    Object.defineProperty(target, 'requestFullscreen', { configurable: true, value: req })
    try {
      await expect(toggleFullscreen(target)).resolves.toBe(true)
      expect(req).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(target, 'requestFullscreen')
    }
  })
})

describe('③ 退出全屏', () => {
  it('resolve ⇒ true', async () => {
    setFullscreenElement(document.body)
    const exit = vi.fn(() => Promise.resolve())
    setExitFullscreen(exit)
    await expect(toggleFullscreen()).resolves.toBe(true)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('reject ⇒ false（非全屏态调用/内核差异都不得抛给调用点）', async () => {
    setFullscreenElement(document.body)
    setExitFullscreen(() => Promise.reject(new Error('not in fullscreen')))
    await expect(toggleFullscreen()).resolves.toBe(false)
  })

  it('exitFullscreen 不存在 ⇒ false', async () => {
    setFullscreenElement(document.body)
    setExitFullscreen(undefined)
    await expect(toggleFullscreen()).resolves.toBe(false)
  })
})
