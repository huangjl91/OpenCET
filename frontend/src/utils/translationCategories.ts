/**
 * 翻译练习的「分类 → 常考词 → 逐词默写 → 句子翻译」。
 *
 * 分类标签由 `tools/classify-translations.mjs` 在构建期写进题库（`category` 字段），
 * 这里只做分组与聚合，不在运行时猜分类 —— 猜错一次就是永久错。
 *
 * 「常考词」有两个来源：
 *   1. 每道题的 `coreWords`（题库作者标注的核心词），按分类聚合去重
 *   2. 用户的《翻译常用词汇》笔记 —— 只有词没有题，单独成一个分类
 */
import type { TranslationQuestion, VocabWord } from '@/types'
import { answerWords, mulberry32, shuffle, type BlankItem } from './blankFill'

/**
 * 「翻译常用词汇」分类名。
 *
 * 这一类**只有词、没有配套句子题** —— 它来自用户自己的 Word 笔记，
 * 和题库是两套东西，所以单独成一个分类，而不是并进主题分类里。
 */
export const VOCAB_CATEGORY = '翻译常用词汇'

/** 分类的展示顺序：词表类打头，主题类居中，专项类收尾 */
export const CATEGORY_ORDER = [
  VOCAB_CATEGORY,
  '文化类',
  '社会类',
  '科技类',
  '教育类',
  '环境类',
  '经济类',
  '历史类',
  '基础句型专项',
  '难点句型专项',
  '高级句型专项',
  '写作衔接专项',
]

export interface CategoryWord {
  en: string
  zh: string
  /** 该词在本分类的几道题里被标为核心词；词表类的词恒为 1 */
  count: number
  /** 用法提醒（只有词表类才有） */
  note?: string
}

export interface CategoryGroup {
  name: string
  questions: TranslationQuestion[]
  /** 去重后的常考词，按出现次数降序 */
  words: CategoryWord[]
}

/** 聚合一个分类里的核心词（按 en 去重，统计出现次数） */
export function collectWords(questions: TranslationQuestion[]): CategoryWord[] {
  const byKey = new Map<string, CategoryWord>()
  for (const q of questions) {
    for (const w of q.coreWords ?? []) {
      const en = (w.en ?? '').trim()
      if (!en) continue
      const key = en.toLowerCase()
      const hit = byKey.get(key)
      if (hit) hit.count += 1
      else byKey.set(key, { en, zh: (w.zh ?? '').trim(), count: 1 })
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.en.localeCompare(b.en))
}

/**
 * 把题目按分类归组。
 *
 * 没有 `category` 的题（老数据 / 手工导入）归入「未分类」，不会丢题。
 */
export function groupByCategory(questions: TranslationQuestion[]): CategoryGroup[] {
  const map = new Map<string, TranslationQuestion[]>()
  for (const q of questions) {
    const c = (q.category ?? '').trim() || '未分类'
    const arr = map.get(c)
    if (arr) arr.push(q)
    else map.set(c, [q])
  }
  const rank = (n: string) => {
    const i = CATEGORY_ORDER.indexOf(n)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...map.entries()]
    .map(([name, qs]) => ({ name, questions: qs, words: collectWords(qs) }))
    .sort((a, b) => rank(a.name) - rank(b.name) || b.questions.length - a.questions.length)
}

/**
 * 把「翻译常用词汇」词表包成一个分类组。
 *
 * `questions` 是空的 —— 界面据此知道这一类没有句子题，改为显示一句说明，
 * 而不是给一个空题库。
 */
export function vocabCategoryGroup(words: VocabWord[]): CategoryGroup {
  const seen = new Set<string>()
  const list: CategoryWord[] = []
  for (const w of words ?? []) {
    const en = (w.en ?? '').trim()
    const zh = (w.zh ?? '').trim()
    if (!en || !zh) continue
    const key = en.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ en, zh, count: 1, note: (w.note ?? '').trim() })
  }
  return { name: VOCAB_CATEGORY, questions: [], words: list }
}

/**
 * 把一个分类的常考词做成逐词默写题。
 *
 * 题面用中文释义：核心词的 `zh` 是题库作者写的中文，直接拿来当提示。
 * 没有中文释义的词跳过 —— 没有题面的默写题没法做。
 */
export function buildCategoryBlanks(group: CategoryGroup, seed = 1): BlankItem[] {
  const rnd = mulberry32(seed)
  const usable = group.words.filter((w) => w.zh.trim())
  return shuffle(
    usable.map((w, i) => ({
      id: `${group.name}-${i}`,
      group: group.name,
      prompt: w.zh,
      hint: '',
      answer: w.en,
      words: answerWords(w.en),
      // 词表类自带用法提醒；题库类只能说这个词在几道题里出现过
      note: w.note || (w.count > 1 ? `本分类有 ${w.count} 道题考到这个词` : '本分类的常考词'),
    })),
    rnd
  )
}
