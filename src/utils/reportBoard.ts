/**
 * 报表看板纯函数工具（配置校验 / 卡片增删）
 *
 * 与后端 service/sys_report_board_service.rs 的 validate_config 口径一致：
 * - 卡片数 ≤ MAX_CARDS
 * - 卡片 id 非空、≤64 字符且看板内唯一
 * - 标题非空、≤64 字符（按 Unicode 字符计数）
 * - 尺寸 w/h ∈ 1..=2
 * - sourceKey 必须命中数据源白名单（白名单由后端 /sources 下发）
 *
 * 校验结果返回错误原因码（'count' | 'id' | 'title' | 'size' | 'source'），
 * 页面层据此映射 i18n 文案——保持纯函数可测、文案集中。
 */
import type { CardSize, ReportBoardConfig, ReportCard } from '@/api/tool/reportBoard'

/** 看板卡片数量上限（与后端 MAX_CARDS 一致） */
export const MAX_CARDS = 24

/** 卡片 ID / 标题长度上限（与后端一致） */
const MAX_FIELD_LEN = 64

/** 校验失败原因码 */
export type ConfigErrorReason = 'count' | 'id' | 'title' | 'size' | 'source'

/**
 * 解析任意来源的 JSON 为强类型看板配置（非法结构返回 null）
 *
 * 兼容历史/异常数据：config 列可能存有损坏 JSON 或缺字段卡片。
 */
export function parseConfig(raw: unknown): ReportBoardConfig | null {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const cards = obj.cards
  if (cards !== undefined && !Array.isArray(cards)) return null
  return {
    cards: Array.isArray(cards) ? (cards as ReportCard[]) : []
  }
}

/** 判断卡片字段是否合法（id/title/size 结构层校验，不含白名单） */
export function isCardWellFormed(card: unknown): card is ReportCard {
  if (!card || typeof card !== 'object') return false
  const c = card as Record<string, unknown>
  const size = c.size as Partial<CardSize> | undefined
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    c.id.length <= MAX_FIELD_LEN &&
    typeof c.title === 'string' &&
    c.title.length > 0 &&
    [...c.title].length <= MAX_FIELD_LEN &&
    (c.chartType === 'line' || c.chartType === 'bar' || c.chartType === 'pie') &&
    typeof c.sourceKey === 'string' &&
    size !== undefined &&
    (size.w === 1 || size.w === 2) &&
    (size.h === 1 || size.h === 2)
  )
}

/**
 * 校验看板配置业务规则（与后端 validate_config 同口径）
 *
 * @param config 看板配置
 * @param allowedSources 数据源白名单（来自后端 /sources，白名单外 → 'source'）
 * @returns 合法返回 null；非法返回原因码
 */
export function validateConfig(
  config: ReportBoardConfig,
  allowedSources: readonly string[]
): ConfigErrorReason | null {
  if (config.cards.length > MAX_CARDS) return 'count'
  const seenIds = new Set<string>()
  for (const card of config.cards) {
    if (!isCardWellFormed(card)) {
      // 结构层问题按字段细分：id 空/重复 → 'id'；标题 → 'title'；尺寸 → 'size'
      const c = card as Partial<ReportCard>
      if (typeof c.id !== 'string' || !c.id || c.id.length > MAX_FIELD_LEN || seenIds.has(c.id)) {
        return 'id'
      }
      seenIds.add(c.id)
      if (typeof c.title !== 'string' || !c.title || [...c.title].length > MAX_FIELD_LEN) {
        return 'title'
      }
      return 'size'
    }
    if (seenIds.has(card.id)) return 'id'
    seenIds.add(card.id)
    if (!allowedSources.includes(card.sourceKey)) return 'source'
  }
  return null
}

/** 生成卡片 ID（crypto.randomUUID 优先，降级时间戳+随机数） */
export function genCardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * 添加卡片（不可变：返回新数组）
 *
 * id 缺失时自动生成；不做白名单校验（调用前先 validateConfig）。
 */
export function addCard(cards: ReportCard[], card: ReportCard): ReportCard[] {
  const withId: ReportCard = card.id ? card : { ...card, id: genCardId() }
  return [...cards, withId]
}

/** 按 ID 删除卡片（不可变：返回新数组；id 不存在时原样返回新数组） */
export function removeCard(cards: ReportCard[], id: string): ReportCard[] {
  return cards.filter((c) => c.id !== id)
}

/** 尺寸 → 网格 class（Tailwind：2 列网格 + 行高） */
export function sizeToGridClass(size: CardSize): string {
  const col = size.w === 2 ? 'col-span-2' : 'col-span-1'
  const row = size.h === 2 ? 'row-span-2' : 'row-span-1'
  return `${col} ${row}`
}
