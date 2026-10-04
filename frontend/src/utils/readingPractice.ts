/**
 * 上传真题 → 切出阅读部分 → 作答 → AI 按**方法**批改。
 *
 * 关键设计：
 *
 * 1. **判分靠 AI，不靠答案键** —— 真实四六级真题卷（PDF）不带答案，
 *    卷末的答案解析是另一本册子。所以这里把「正确答案 + 讲解」一起交给模型。
 *    万一卷子里确实带了答案（用户上传的是解析版），本地也能先判一遍。
 *
 * 2. **必须按方法来教** —— 这是这个功能和「随便找个 AI 对答案」的区别。
 *    提示词里写死了阅读方法（关键词定位 / 首句主旨 / 同义替换识别），
 *    并要求模型先判题型，再按该题型的步骤走一遍，最后才说结论。
 *
 * 3. **段落匹配题的选项从原文段落标号推导** —— 切分器给出的选项可能是残缺的
 *    占位符（实测真题 PDF 只解析出 A/B/C 三个），但段落标号 A–N 是可靠的，
 *    直接拿它当选项。
 */
import { extractParagraphLabels, type ParsedPaper, type ParsedQuestion, type ParsedSection } from './paperParser'
import { METHOD_CARDS, STEP_TEMPLATES, TYPE_LABEL } from './readingGuide'
import { optionLetter } from './paperDisplay'
import { extractJson } from './llmGrade'
import type { ChatMessage } from '@/types'

export { optionLetter }

export type ReadingKind = 'matching' | 'careful'

/** 一道阅读题 + 它所属的部分 */
export interface ReadingPart {
  id: string
  kind: ReadingKind
  title: string
  passage: string
  /** 段落匹配题的选项 = 原文段落标号；仔细阅读为空（选项在题目里） */
  labels: string[]
  questions: ParsedQuestion[]
}

/** 题型判定：段落标号是「段落匹配」最可靠的信号（选项本身就是 A–O） */
export function readingKindOf(section: ParsedSection): ReadingKind {
  return extractParagraphLabels(section.passage).length >= 5 ? 'matching' : 'careful'
}

/** 从整卷切分结果里挑出阅读部分：长篇阅读（段落匹配）+ 仔细阅读（若干篇） */
export function splitReading(paper: ParsedPaper): ReadingPart[] {
  return (paper.sections ?? [])
    .filter((s) => s.type === 'reading' && s.questions.length > 0)
    .map((s, i) => {
      const kind = readingKindOf(s)
      const labels = kind === 'matching' ? extractParagraphLabels(s.passage) : []
      return {
        id: `${s.type}-${i}-${kind}`,
        kind,
        title: cleanTitle(s.title),
        passage: s.passage,
        labels,
        questions: s.questions,
      }
    })
}

/** 模块标题里带着 Part III 之类的前缀，界面上只留有用的部分 */
function cleanTitle(title: string): string {
  const t = (title ?? '').trim()
  const m = t.match(/(Section\s+[A-C]|Passage\s+(?:One|Two|Three)|长篇阅读|仔细阅读)[^（(]*/i)
  return (m ? m[0] : t).replace(/\s+/g, ' ').trim() || '阅读理解'
}

/** 这道题可选的答案集合 */
export function optionsOf(part: ReadingPart, q: ParsedQuestion): string[] {
  if (part.kind === 'matching') return part.labels
  return q.options.map(optionLetter).filter(Boolean)
}

/** 归一化答案，便于比较（大写、去空格标点） */
export function normalizeAnswer(a: string): string {
  return (a ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/** 卷面自带答案时才谈得上本地判分 */
export function hasLocalAnswers(part: ReadingPart): boolean {
  return part.questions.some((q) => normalizeAnswer(q.answer).length > 0)
}

export interface JudgedItem {
  orderNo: number
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
}

/** 本地判分（只用卷面自带的答案） */
export function judgeLocally(part: ReadingPart, answers: Record<number, string>): JudgedItem[] {
  return part.questions.map((q) => {
    const user = normalizeAnswer(answers[q.orderNo] ?? '')
    const correct = normalizeAnswer(q.answer)
    return {
      orderNo: q.orderNo,
      userAnswer: user,
      correctAnswer: correct,
      isCorrect: !!correct && !!user && user === correct,
    }
  })
}

/* ==================================================================== */
/* 题型判定                                                             */
/* ==================================================================== */

/** 三类题型：与示范的 kind 对齐 */
export type QuestionTypeKey = 'long' | 'main' | 'detail'

/**
 * 从题干特征**先猜**题型，作为提示交给模型。
 *
 * 为什么要有这一步：模型很容易一律按细节题讲（题干里找个词就回原文定位），
 * 主旨题也被当成细节题处理，方法就用错了。题干里的措辞其实是很强的信号：
 * 问 main idea / mainly about / best title / purpose 的基本都是主旨题。
 *
 * 这只是**提示**，最终以模型通读原文后的判断为准（它能看到全文）。
 */
export function guessQuestionType(stem: string, kind: ReadingKind): QuestionTypeKey {
  if (kind === 'matching') return 'long'
  const s = (stem ?? '').toLowerCase()
  const MAIN =
    /(main idea|mainly (about|discuss|concern)|best title|primarily (about|concern)|the passage (is|mainly|discusses|focuses)|author'?s? (purpose|main)|intends? to|what is the (text|passage) about|central (idea|theme)|the (text|passage) is mainly)/
  return MAIN.test(s) ? 'main' : 'detail'
}

/** 把模型给的题型标签归一成三类 + 词汇题/推断题 */
export function normalizeQuestionType(raw: string, fallback: QuestionTypeKey): string {
  const t = (raw ?? '').trim().toLowerCase()
  if (!t) return TYPE_LABEL[fallback]
  if (/主旨|main|主题|中心|title|purpose/.test(t)) return TYPE_LABEL.main
  if (/匹配|matching|段落/.test(t)) return TYPE_LABEL.long
  if (/词汇|词义|vocab|word/.test(t)) return '词汇题'
  if (/推断|infer|attitude|态度/.test(t)) return '推断题'
  if (/细节|detail|事实|fact/.test(t)) return TYPE_LABEL.detail
  const hit = (Object.keys(TYPE_LABEL) as QuestionTypeKey[]).find((k) => k === t)
  return hit ? TYPE_LABEL[hit] : TYPE_LABEL[fallback]
}

/**
 * 每种题型用的是哪套办法 —— 显示在题型旁边。
 *
 * 主旨题和细节题的做法完全不同（读段首句 vs 找定位词），
 * 把方法名摆出来，用户一眼能看出「这题该用哪招」，
 * 也方便反过来检查 AI 有没有用错方法。
 */
export const METHOD_HINT: Record<string, string> = {
  主旨题: '用「只读每段第一句」的方法',
  细节题: '用「关键词定位 + 同义替换」的方法',
  匹配题: '用「扫读原文找同义替换」的方法',
  词汇题: '用「回原文看上下文」的方法',
  推断题: '用「定位后看言外之意」的方法',
}

export function methodHintOf(questionType: string): string {
  return METHOD_HINT[questionType] ?? ''
}

/* ==================================================================== */
/* AI 批改                                                              */
/* ==================================================================== */

/** 一道题的讲解步骤 */
export interface JudgeStep {
  /** 步骤名，如「找关键词」「回原文定位」 */
  name: string
  detail: string
}

export interface JudgeResult {
  orderNo: number
  /** 模型判定的题型：主旨题 / 细节题 / 匹配题 … */
  questionType: string
  correctAnswer: string
  userAnswer: string
  isCorrect: boolean
  /** 按方法走的每一步 */
  steps: JudgeStep[]
  /** 原文证据句 */
  evidence: string
  /** 错在哪（答对时为空） */
  whyWrong: string
  /** 这类题以后怎么做 */
  takeaway: string
}

/** 把方法卡里的要点抽成提示词的一部分（保证「按方法来教」跟页面上教的一致） */
function methodBrief(): string {
  return METHOD_CARDS.map((c) => `【${c.title}】\n` + c.points.map((p, i) => `${i + 1}. ${p.replace(/\*\*/g, '')}`).join('\n')).join(
    '\n\n'
  )
}

/** 三种题型各自的讲解步骤（与页面上的示范一一对应） */
function stepTemplates(): string {
  const rows = (['main', 'detail', 'long'] as QuestionTypeKey[]).map(
    (k) => `- ${TYPE_LABEL[k]}：` + STEP_TEMPLATES[k].map((s, i) => `${i + 1}) ${s}`).join(' → ')
  )
  return rows.join('\n')
}

/** 拼一道题在提示词里的样子 */
function questionBrief(part: ReadingPart, q: ParsedQuestion, answers: Record<number, string>): string {
  const lines = [`${q.orderNo}. ${q.stem}`]
  if (part.kind === 'matching') {
    lines.push(`   选项：${part.labels.join(' / ')}（原文段落标号，一段可能被选多次）`)
  } else {
    for (const opt of q.options) lines.push(`   ${opt}`)
  }
  const user = normalizeAnswer(answers[q.orderNo] ?? '')
  lines.push(`   学生选：${user || '（未作答）'}`)
  // 把本地按题干特征猜的题型作为提示给出，让模型先确认再讲
  const guess = guessQuestionType(q.stem, part.kind)
  lines.push(`   题干特征提示：看起来是「${TYPE_LABEL[guess]}」（请通读原文后确认，不要照抄这个判断）`)
  return lines.join('\n')
}

/**
 * 拼「按方法批改」的提示词。
 *
 * 一次把整部分的题都交给模型（而不是一题一次请求）：
 * 段落匹配的十道题共用同一篇原文，分开问会把原文重复传十遍。
 *
 * 两条硬要求（之前踩过的坑）：
 *   1. **必须先判题型**。之前只把三种方法并列写出来，模型一律按细节题讲，
 *      主旨题也被当成「找定位词」。现在要求第一步就是判断题型，写进 questionType，
 *      再按该题型的步骤序列展开。
 *   2. **步骤序列与页面示范一致** —— 步骤名直接取自示范，讲解口径不会两边不一样。
 */
export function buildJudgeMessages(part: ReadingPart, answers: Record<number, string>): ChatMessage[] {
  const system = [
    '你是四六级阅读教练，负责批改学生刚做完的真题阅读，并**按一套固定的解题方法**讲解。',
    '',
    '解题方法：',
    methodBrief(),
    '',
    '【第一步：必须先判题型，再动手讲】',
    '每道题都先判断它属于哪一类，写进 questionType，只能是：匹配题 / 主旨题 / 细节题（词汇题、推断题也可以照实写）。',
    '判断依据：',
    '- 题干问 main idea / mainly about / best title / the purpose / the passage discusses 之类 → **主旨题**',
    '- 题干问某个具体的人、事、数据、观点、原因 → **细节题**',
    '- 选项是 A–N 段落字母（段落匹配）→ **匹配题**',
    '**题型判错，后面的讲解就全错了** —— 主旨题要用「读每段首句」的办法，不能拿细节题那套去找定位词。',
    '每道题的 steps 第一步必须是「判断题型」，写清你为什么这么判（题干里的哪个措辞 / 有没有定位词）。',
    '',
    '【第二步：按该题型的步骤序列讲，步骤名照用】',
    stepTemplates(),
    '（steps 里的 name 直接用上面的步骤名，detail 里写具体到原文词句的内容。）',
    '',
    '【第三步：说清学生错在哪】',
    '是被原词照抄骗了、定位错了段落、替换没认出来，还是把主旨题当细节题做了。答对则 whyWrong 留空。',
    '',
    '只输出 JSON，不要任何解释文字。格式：',
    '{"results":[{"orderNo":36,"questionType":"细节题","correctAnswer":"D",' +
      '"steps":[{"name":"判断题型","detail":"题干问的是…，属于细节题"},' +
      '{"name":"从题干里拿定位词","detail":"…"},{"name":"回原文定位答案句","detail":"…"},' +
      '{"name":"比对同义替换","detail":"…"},{"name":"排除干扰项","detail":"…"},{"name":"确认答案","detail":"…"}],' +
      '"evidence":"原文中的那句英文","whyWrong":"学生选 B 是因为…（答对则填空字符串）","takeaway":"这类题以后…"}]}',
  ].join('\n')

  const user = [
    `【原文】\n${part.passage}`,
    '',
    `【题目与学生作答】共 ${part.questions.length} 题，请逐题先判题型再讲，results 数组长度必须是 ${part.questions.length}，orderNo 用卷面题号。`,
    part.questions.map((q) => questionBrief(part, q, answers)).join('\n\n'),
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function parseSteps(v: unknown): JudgeStep[] {
  if (!Array.isArray(v)) return []
  const out: JudgeStep[] = []
  for (const item of v) {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ name: '', detail: item.trim() })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const name = str(o.name ?? o.step ?? o.title)
    const detail = str(o.detail ?? o.content ?? o.text ?? o.value)
    if (name || detail) out.push({ name, detail })
  }
  return out
}

/**
 * 解析模型的批改结果。
 *
 * 模型输出不可信，所以：
 *   - 对不上题号的条目丢掉（宁缺勿错）
 *   - **`isCorrect` 由本地按答案重算**，不采信模型的自述
 *   - 缺字段填空串，界面按空处理，不会因为少一个字段整块渲染不出来
 */
export function parseJudgeResult(raw: string, part: ReadingPart, answers: Record<number, string>): JudgeResult[] {
  // extractJson 在「模型没按格式回」时会抛错。这里必须兜住：
  // 一次批改覆盖整部分的题，为了一个解析失败丢掉全部结果最亏。
  let json: Record<string, unknown> | null = null
  try {
    json = extractJson(raw)
  } catch {
    json = null
  }
  const list = Array.isArray(json?.results) ? (json.results as unknown[]) : []

  const byNo = new Map<number, Record<string, unknown>>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const no = Number(o.orderNo ?? o.no ?? o.order)
    if (Number.isFinite(no)) byNo.set(no, o)
  }

  return part.questions.map((q) => {
    const o = byNo.get(q.orderNo) ?? {}
    const user = normalizeAnswer(answers[q.orderNo] ?? '')
    const correct = normalizeAnswer(str(o.correctAnswer ?? o.answer))
    const guess = guessQuestionType(q.stem, part.kind)
    return {
      orderNo: q.orderNo,
      // 归一成三类（词汇/推断题照实保留），模型没给就用题干特征猜的结果
      questionType: normalizeQuestionType(str(o.questionType ?? o.type), guess),
      correctAnswer: correct,
      userAnswer: user,
      // 不采信模型说的对错，按答案重算
      isCorrect: !!correct && !!user && user === correct,
      steps: parseSteps(o.steps ?? o.step ?? o.stepsList),
      evidence: str(o.evidence ?? o.evidenceSentence),
      whyWrong: str(o.whyWrong ?? o.why_wrong),
      takeaway: str(o.takeaway),
    }
  })
}
