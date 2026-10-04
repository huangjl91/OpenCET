/**
 * 「AI 讲解」——句子翻译的重难点词汇 + 句子结构拆解
 *
 * 设计要点：
 * - 复用 utils/ai.ts 的 chat()：请求由**浏览器直连**模型服务商，API Key 只在本机
 *   localStorage，不经过本站后端，也不落库（讲解是学习辅助，不需要持久化到服务器）。
 * - 模型被要求输出**严格 JSON**，便于结构化渲染；解析复用 llmGrade 的 extractJson 容错。
 * - 结果按题目缓存在 localStorage，同一题只花一次 token。
 */
import type { ExplainPart, ExplainStructure, ExplainWord, LlmExplain, TranslationQuestion } from '@/types'
import { chat } from './ai'
import { extractJson } from './llmGrade'

const CACHE_KEY = 'llm.explain.v1'

/* ------------------------------- 本地缓存 ------------------------------- */

type Cache = Record<string, LlmExplain>

function readCache(): Cache {
  try {
    const raw = localStorage.getItem('opencet.' + CACHE_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? (obj as Cache) : {}
  } catch {
    return {}
  }
}

/**
 * 取缓存的讲解。
 *
 * 这里必须做形状校验：缓存可能来自旧版本、也可能是被写坏的字符串。
 * 直接返回会让模板读 `structure.main` 时抛 TypeError，把整个结果区一起搞崩。
 * 形状不对就当作没有缓存（调用方会重新请求）。
 */
export function getCachedExplain(questionId: string): LlmExplain | null {
  const hit = readCache()[questionId] as unknown
  if (!hit || typeof hit !== 'object' || Array.isArray(hit)) return null
  const o = hit as Partial<LlmExplain>
  if (!Array.isArray(o.vocab)) return null
  const s = o.structure
  if (!s || typeof s !== 'object' || !Array.isArray(s.parts)) return null
  return {
    vocab: o.vocab,
    structure: {
      main: String(s.main ?? ''),
      pattern: String(s.pattern ?? ''),
      parts: s.parts,
      summary: String(s.summary ?? ''),
    },
    tips: Array.isArray(o.tips) ? o.tips : [],
  }
}

export function saveCachedExplain(questionId: string, data: LlmExplain): void {
  try {
    const all = readCache()
    all[questionId] = data
    localStorage.setItem('opencet.' + CACHE_KEY, JSON.stringify(all))
  } catch {
    /* 存不下就算了，不影响本次查看 */
  }
}

export function clearCachedExplain(questionId?: string): void {
  try {
    if (!questionId) {
      localStorage.removeItem('opencet.' + CACHE_KEY)
      return
    }
    const all = readCache()
    delete all[questionId]
    localStorage.setItem('opencet.' + CACHE_KEY, JSON.stringify(all))
  } catch {
    /* 忽略 */
  }
}

/* -------------------------------- 提示词 -------------------------------- */

function buildPrompt(q: TranslationQuestion): string {
  const cores = (q.coreWords ?? []).map((c) => `${c.en}(${c.zh})`).join('、') || '（无）'
  const grammar = (q.grammarPoints ?? []).join('；') || '（无）'
  return [
    '你是一位资深的英语四六级（CET-4/CET-6）翻译老师，请对下面这道**汉译英**做精讲。',
    '',
    `【原文】${q.prompt}`,
    `【参考译文】${q.reference}`,
    `【本题核心词】${cores}`,
    `【本题语法点】${grammar}`,
    '',
    '讲解要求，只讲两类内容，不要跑题：',
    '① **重难点词汇**：挑出原文里最值得记的 4-8 个词/短语（优先核心词、四字格、文化专有词、易错表达），',
    '   给出推荐英文、词性、音标、中文释义，以及常见搭配或易错点（比如「剪纸 paper-cutting，不可数，作定语用单数」）。',
    '② **句子结构拆解**：先说英文主干（主谓宾），再逐成分说明中文语序怎么转成英文、用了什么句型套路',
    '   （如无主句补主语、连动拆分、四字格并列、被动语态、with 复合结构、定语从句），最后给 40 字内的翻译思路概括。',
    '',
    '要求：解释用中文，例句/译文片段用英文；不要输出评分，不要点评学生的作答。',
    '',
    '只输出如下 JSON，不要输出任何解释文字或 Markdown 代码围栏：',
    '{',
    '  "vocab": [ { "zh": "原文里的中文词", "en": "推荐英文", "pos": "词性", "phonetic": "音标", "meaning": "中文释义", "usage": "搭配或易错点" } ],',
    '  "structure": {',
    '    "main": "英文主干（主谓宾）",',
    '    "pattern": "句型套路，如 被动语态 / with 复合结构 / 定语从句",',
    '    "parts": [ { "role": "主语/谓语/宾语/状语/定语从句…", "text": "对应英文片段", "note": "为什么这么处理" } ],',
    '    "summary": "40 字内概括这句话的翻译思路"',
    '  },',
    '  "tips": [ "1-3 条翻译注意点" ]',
    '}',
  ].join('\n')
}

/* -------------------------------- 解析 -------------------------------- */

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function toVocab(v: unknown): ExplainWord[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>
      return {
        zh: str(o.zh ?? o.cn ?? o.word),
        en: str(o.en ?? o.english),
        pos: str(o.pos),
        phonetic: str(o.phonetic),
        meaning: str(o.meaning),
        usage: str(o.usage),
      }
    })
    .filter((w) => w.en || w.zh)
}

function toParts(v: unknown): ExplainPart[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>
      return { role: str(o.role), text: str(o.text), note: str(o.note) }
    })
    .filter((p) => p.role || p.text)
}

function toStructure(v: unknown): ExplainStructure {
  const o = (v ?? {}) as Record<string, unknown>
  return {
    main: str(o.main),
    pattern: str(o.pattern),
    parts: toParts(o.parts),
    summary: str(o.summary),
  }
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x)).filter(Boolean)
}

/**
 * 请求模型生成「AI 讲解」。失败时抛出可读错误，由调用方展示。
 */
export async function llmExplain(q: TranslationQuestion): Promise<LlmExplain> {
  const raw = await chat([
    { role: 'system', content: '你是英语四六级翻译老师，讲重难点词汇和句子结构，只输出 JSON。' },
    { role: 'user', content: buildPrompt(q) },
  ])
  const json = extractJson(raw)

  const data: LlmExplain = {
    vocab: toVocab(json.vocab),
    structure: toStructure(json.structure),
    tips: toStrArray(json.tips),
  }

  if (!data.vocab.length && !data.structure.main && !data.structure.parts.length) {
    throw new Error('模型没有返回可用的讲解内容，请重试或换个模型')
  }
  return data
}

/** 取出缓存；没有就调模型，成功后写入缓存 */
export async function llmExplainCached(q: TranslationQuestion): Promise<LlmExplain> {
  const hit = getCachedExplain(q.id)
  if (hit) return hit
  const data = await llmExplain(q)
  saveCachedExplain(q.id, data)
  return data
}
