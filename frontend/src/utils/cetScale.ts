/**
 * 四六级 710 分换算。
 *
 * 数据来自用户的《7_35分换算表.docx》，是官方的原始分 → 标准分对照表：
 *   听力、阅读各 **35 分制**（满分 248.5）
 *   写作、翻译各 **15 分制**（满分 106.5）
 *   四项相加 = 710
 *
 * 对照表是**阶梯状**的（不是线性）：原始分相同区间会落到同一个标准分
 * （如 35 分表里 19 与 18 都是 154、10 与 9 都是 126），所以必须查表，不能按比例算。
 */
import {
  CET_SCALE_NOTE,
  CET_SCALE_SOURCE,
  CET_SCALE_TABLES,
  CET_SCALE_TITLE,
  type ScaleTableData,
} from './cetScaleData'

export interface ScaleRow {
  raw: number
  score: number
}

export type ScaleTable = ScaleTableData

export interface CetSection {
  id: string
  name: string
  /** 对应哪张换算表 */
  tableId: string
  /** 原始分满分 */
  max: number
  /** 一句话说明这项考什么 */
  hint: string
}

export const SCALE_TABLES = CET_SCALE_TABLES
export const SCALE_TITLE = CET_SCALE_TITLE
export const SCALE_NOTE = CET_SCALE_NOTE
export const SCALE_SOURCE = CET_SCALE_SOURCE

/** 一次考试的四个部分 */
export const CET_SECTIONS: CetSection[] = [
  { id: 'listening', name: '听力', tableId: 's35', max: 35, hint: '短篇新闻 / 长对话 / 听力篇章' },
  { id: 'reading', name: '阅读', tableId: 's35', max: 35, hint: '选词填空 / 段落匹配 / 仔细阅读' },
  { id: 'writing', name: '写作', tableId: 's15', max: 15, hint: '作文（按 15 分制给分）' },
  { id: 'translation', name: '翻译', tableId: 's15', max: 15, hint: '汉译英（按 15 分制给分）' },
]

/** 普遍认可的「过线」分数：也是报考六级的常见门槛 */
export const PASS_LINE = 425

export function tableOf(tableId: string): ScaleTable | undefined {
  return SCALE_TABLES.find((t) => t.id === tableId)
}

/**
 * 原始分 → 标准分（查表）。
 *
 * 超出范围的输入夹到 [0, max]，不抛错 —— 这是首页上的一个估算器，
 * 用户手滑多打一个数字不该看到报错。
 */
export function toStandard(tableId: string, raw: number): number {
  const table = tableOf(tableId)
  if (!table || !table.rows.length) return 0
  const n = Number.isFinite(raw) ? Math.round(raw) : 0
  const clamped = Math.min(table.max, Math.max(0, n))
  const hit = table.rows.find((r) => r.raw === clamped)
  if (hit) return hit.score
  // 表里缺这一档时，退到「不超过该原始分的最大档」，保证单调不跳变
  const lower = table.rows.filter((r) => r.raw <= clamped).sort((a, b) => b.raw - a.raw)[0]
  return lower ? lower.score : table.rows[table.rows.length - 1].score
}

export interface SectionScore {
  id: string
  name: string
  raw: number
  score: number
  /** 标准分满分 */
  scaleMax: number
  /** 得分率 0-1（按标准分算） */
  ratio: number
}

export interface TotalScore {
  parts: SectionScore[]
  /** 四项标准分之和 */
  total: number
  /** 满分（710） */
  full: number
  /** 是否达到 PASS_LINE */
  passed: boolean
  /** 距离过线还差多少（已过线则为 0） */
  gap: number
  /** 填了几项（全填才是完整估分） */
  filled: number
}

/**
 * 四项原始分 → 710 分制总分。
 *
 * 未填的项按 0 算，但会通过 `filled` 告诉界面「这不是完整估分」——
 * 否则用户只填一项就以为总分只有 100 多，会被吓到。
 */
export function totalScore(input: Partial<Record<string, number>>): TotalScore {
  const parts: SectionScore[] = CET_SECTIONS.map((s) => {
    const table = tableOf(s.tableId)
    const rawValue = input[s.id]
    const raw = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0
    const score = toStandard(s.tableId, raw)
    const scaleMax = table?.scaleMax ?? 0
    return {
      id: s.id,
      name: s.name,
      raw,
      score,
      scaleMax,
      ratio: scaleMax ? Math.min(1, score / scaleMax) : 0,
    }
  })
  const total = Math.round(parts.reduce((n, p) => n + p.score, 0) * 10) / 10
  const full = Math.round(parts.reduce((n, p) => n + p.scaleMax, 0))
  return {
    parts,
    total,
    full,
    passed: total >= PASS_LINE,
    gap: Math.max(0, Math.round((PASS_LINE - total) * 10) / 10),
    filled: CET_SECTIONS.filter((s) => typeof input[s.id] === 'number' && Number.isFinite(input[s.id])).length,
  }
}
