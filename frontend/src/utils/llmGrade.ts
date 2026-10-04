/**
 * LLM 二次润色评分（AI 精批）
 *
 * 设计要点：
 * - 复用 utils/ai.ts 的 chat()，请求由**浏览器直连**模型服务商，API Key 只在本机 localStorage，
 *   不经过本站后端；后端只接收最终结论用于持久化（见 POST /api/translation/review）。
 * - 模型被要求输出**严格 JSON**，便于结构化渲染；解析时做了容错（去代码围栏、截取首尾大括号）。
 * - 综合分 = 机器分 × 0.4 + 语义分 × 0.6：语义/语法权重更高，机器分作为「核心词是否到位」的硬性底线。
 */
import type { LlmReview, TranslationQuestion } from '@/types'
import { chat } from './ai'

/** 机器分与语义分的加权系数 */
export const WEIGHT_MACHINE = 0.4
export const WEIGHT_LLM = 0.6

/** 综合分：语义分更能反映真实水平，故权重更高 */
export function blendScore(machineScore: number, llmScore: number): number {
  return Math.max(0, Math.min(100, Math.round(machineScore * WEIGHT_MACHINE + llmScore * WEIGHT_LLM)))
}

function buildPrompt(
  question: TranslationQuestion,
  answer: string,
  machineScore: number,
  missWords: string[]
): string {
  const cores = (question.coreWords ?? []).map((c) => `${c.en}(${c.zh})`).join('、') || '（无）'
  return [
    '你是一位资深的英语四六级（CET-4/CET-6）翻译阅卷老师，请对下面这道汉译英做**二次精批**。',
    '',
    `【原文】${question.prompt}`,
    `【参考译文】${question.reference}`,
    `【学生译文】${answer || '（空白）'}`,
    `【本题核心词】${cores}`,
    `【机器初评】${machineScore} 分${missWords.length ? `；未命中的核心词：${missWords.join('、')}` : ''}`,
    '',
    '评分要求：',
    '1. 机器初评只看「核心词是否出现」与「译文长度」，**不判断语义完整性、语法正确性、语序与用词地道度**；',
    '   你必须在独立判断语义、语法、地道度后给出自己的分数，不要照抄机器初评。',
    '2. 语法问题要具体到句子成分，例如「第 2 句主谓不一致：subject 与 verb 数不一致」。',
    '3. 润色译文要保留原意，用四六级水平的自然英文，不要过度拔高成文学腔。',
    '',
    '只输出如下 JSON，不要输出任何解释文字或 Markdown 代码围栏：',
    '{',
    '  "score": <0-100 的整数，语义完整度 + 语法准确度 + 用词地道度的综合分>,',
    '  "issues": [<具体问题字符串，最多 6 条；没有问题时给空数组>],',
    '  "polish": "<你的润色译文，纯英文>",',
    '  "comment": "<100 字以内中文点评：先说最大问题，再给一条可执行的提升建议>"',
    '}',
  ].join('\n')
}

/** 从模型回复中稳健地抽出 JSON 对象（llmExplain 也复用） */
export function extractJson(text: string): Record<string, unknown> {
  let t = (text ?? '').trim()
  // 去掉 ```json ... ``` 代码围栏
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('模型未返回可解析的 JSON：' + t.slice(0, 160))
  }
  return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter((s) => s.trim().length > 0)
}

/** 调用模型做二次精批；失败时抛出可读错误，由调用方降级为「仅机器分」 */
export async function llmReview(
  question: TranslationQuestion,
  answer: string,
  machineScore: number,
  missWords: string[]
): Promise<LlmReview> {
  const prompt = buildPrompt(question, answer, machineScore, missWords)
  const raw = await chat([
    { role: 'system', content: '你是严格的英语四六级翻译阅卷老师，只输出 JSON。' },
    { role: 'user', content: prompt },
  ])
  const json = extractJson(raw)

  const score = Number(json.score)
  if (!Number.isFinite(score)) {
    throw new Error('模型返回的 score 不是数字：' + String(json.score).slice(0, 60))
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues: toStrArray(json.issues),
    polish: String(json.polish ?? '').trim(),
    comment: String(json.comment ?? '').trim(),
  }
}
