/**
 * 好词好句汇总。
 *
 * 用户在阅读原文、翻译参考译文、AI 讲解里选中一段文字，点浮出来的按钮就能收录。
 * 所以这一层要处理的关键问题是**去重**：同一句话在页面里被选中多次、或者
 * 用户重复选中同一个句子，都不该在汇总里出现两遍。
 */
import { readLocal, writeLocal } from './storage'

const KEY = 'favorites.v1'

export interface FavoriteItem {
  id: string
  /** 收录的原文（已 trim） */
  text: string
  /** 来自哪个页面（路由标题，如「阅读方法」） */
  source: string
  /** 收录时间（时间戳） */
  createdAt: number
  /** 用户自己写的备注，可为空 */
  note: string
}

/** 太短的多半是误选（一个词、半个词），太长的不像「好句」 */
export const MIN_LEN = 2
export const MAX_LEN = 600

/** 去重用的归一化：忽略大小写、首尾标点、多余空白 */
export function normalizeText(text: string): string {
  return (text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’.,;:!?。，；：！？]+|[\s"'“”‘’.,;:!?。，；！？]+$/g, '')
    .toLowerCase()
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // 忽略：降级到时间戳
  }
  return 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

/** 读取全部（按收录时间倒序，最新的在前） */
export function listFavorites(): FavoriteItem[] {
  const raw = readLocal<FavoriteItem[]>(KEY, [])
  if (!Array.isArray(raw)) return []
  // 旧数据可能缺字段，读的时候补齐，免得界面到处判空
  return raw
    .filter((x) => x && typeof x.text === 'string' && x.text.trim())
    .map((x) => ({
      id: typeof x.id === 'string' && x.id ? x.id : newId(),
      text: x.text.trim(),
      source: typeof x.source === 'string' ? x.source : '',
      createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
      note: typeof x.note === 'string' ? x.note : '',
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function save(list: FavoriteItem[]): void {
  writeLocal(KEY, list)
}

export interface AddResult {
  /** 是否真的新增了（false = 已经有了） */
  added: boolean
  item: FavoriteItem
  /** 没添加成功时的原因，给界面提示用 */
  reason?: 'duplicate' | 'too-short' | 'too-long' | 'empty'
}

/**
 * 收录一条。
 *
 * 去重按归一化后的文本比较 —— 同一句在原文里、在 AI 讲解里各出现一次，
 * 或者用户带着不同的首尾标点选中，都算同一条。
 */
export function addFavorite(text: string, source = '', note = ''): AddResult {
  const clean = (text ?? '').trim()
  if (!clean) return { added: false, item: blank(), reason: 'empty' }
  if (normalizeText(clean).length < MIN_LEN) return { added: false, item: blank(), reason: 'too-short' }
  if (clean.length > MAX_LEN) return { added: false, item: blank(), reason: 'too-long' }

  const list = listFavorites()
  const key = normalizeText(clean)
  const hit = list.find((x) => normalizeText(x.text) === key)
  if (hit) return { added: false, item: hit, reason: 'duplicate' }

  const item: FavoriteItem = { id: newId(), text: clean, source: source ?? '', createdAt: Date.now(), note }
  save([item, ...list])
  return { added: true, item }
}

function blank(): FavoriteItem {
  return { id: '', text: '', source: '', createdAt: 0, note: '' }
}

export function removeFavorite(id: string): void {
  save(listFavorites().filter((x) => x.id !== id))
}

export function updateNote(id: string, note: string): void {
  save(listFavorites().map((x) => (x.id === id ? { ...x, note } : x)))
}

export function clearFavorites(): void {
  save([])
}

export function countFavorites(): number {
  return listFavorites().length
}

/** 汇总里出现过的来源（用于筛选），按出现次数降序 */
export function sourcesOf(list: FavoriteItem[]): { name: string; count: number }[] {
  const map = new Map<string, number>()
  for (const it of list) {
    const s = (it.source || '未标注').trim() || '未标注'
    map.set(s, (map.get(s) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** 按关键词与来源筛选 */
export function filterFavorites(list: FavoriteItem[], keyword: string, source: string): FavoriteItem[] {
  const kw = (keyword ?? '').trim().toLowerCase()
  return list.filter((it) => {
    if (source && (it.source || '未标注') !== source) return false
    if (!kw) return true
    return it.text.toLowerCase().includes(kw) || (it.note ?? '').toLowerCase().includes(kw)
  })
}

/** 导出成 Markdown，方便贴到别处复习 */
export function toMarkdown(list: FavoriteItem[]): string {
  if (!list.length) return ''
  const bySource = new Map<string, FavoriteItem[]>()
  for (const it of list) {
    const s = it.source || '未标注'
    const arr = bySource.get(s)
    if (arr) arr.push(it)
    else bySource.set(s, [it])
  }
  const lines: string[] = ['# 好词好句汇总', '']
  for (const [src, items] of bySource) {
    lines.push(`## ${src}`, '')
    for (const it of items) {
      lines.push(`- ${it.text}`)
      if (it.note) lines.push(`  - 备注：${it.note}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
