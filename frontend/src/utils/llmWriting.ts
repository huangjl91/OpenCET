/**
 * 造句的 AI 点评。
 *
 * 本地 `checkSentence` 只能判**句式有没有用对**（骨架、长度、标点），
 * 判不了英文写得好不好。这里复用 utils/ai.ts 的 chat() 做语法/用词/地道度点评，
 * 同样是**浏览器直连**、Key 只在本机、结果不落库。
 */
import type { GoldenPattern } from './writingGuide'
import { chat } from './ai'
import { extractJson } from './llmGrade'

export interface SentenceReview {
  /** 0-100，句式正确度 + 语法 + 用词的综评 */
  score: number
  /** 具体问题（语法、搭配、中式英语） */
  issues: string[]
  /** 润色后的句子（保留原意，四六级水平） */
  better: string
  /** 100 字以内的中文点评 */
  comment: string
}

function buildPrompt(pattern: GoldenPattern, sentence: string): string {
  return [
    '你是一位资深的英语四六级（CET-4/CET-6）写作阅卷老师。学生用给定句式造了一个句子，请点评。',
    '',
    `【要求使用的句式】${pattern.pattern}`,
    `【句式含义】${pattern.zh}`,
    `【句式用法提醒】${pattern.tip}`,
    `【参考例句】${pattern.example}`,
    `【学生造句】${sentence}`,
    '',
    '点评要求：',
    '1. 先判断句式**骨架是否用对**（比如 Only by ... can we ... 有没有倒装、It is high time that 后面有没有用过去式）；',
    '2. 再挑语法与用词问题（主谓一致、时态、冠词、搭配、中式英语），具体到词，不要泛泛说「注意语法」；',
    '3. 润色要**保留学生原意**，用四六级水平的自然英文，不要拔高成文学腔；',
    '4. 如果句子已经很好，issues 给空数组，不要硬挑毛病。',
    '',
    '只输出如下 JSON，不要输出任何解释文字或 Markdown 代码围栏：',
    '{',
    '  "score": <0-100 的整数>,',
    '  "issues": [<具体问题字符串，最多 5 条>],',
    '  "better": "<润色后的句子，纯英文>",',
    '  "comment": "<100 字以内中文点评：先说句式用得对不对，再给一条可执行的改进建议>"',
    '}',
  ].join('\n')
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x).trim()).filter(Boolean)
}

/** 请求模型点评造句 */
export async function llmSentenceReview(
  pattern: GoldenPattern,
  sentence: string
): Promise<SentenceReview> {
  const raw = await chat([
    { role: 'system', content: '你是英语四六级写作阅卷老师，只输出 JSON。' },
    { role: 'user', content: buildPrompt(pattern, sentence) },
  ])
  const json = extractJson(raw)

  const score = Number(json.score)
  if (!Number.isFinite(score)) {
    throw new Error('模型返回的 score 不是数字：' + String(json.score).slice(0, 60))
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues: toStrArray(json.issues),
    better: String(json.better ?? '').trim(),
    comment: String(json.comment ?? '').trim(),
  }
}
