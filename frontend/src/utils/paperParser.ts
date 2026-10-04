import type { Level, SectionType } from '@/types'

export interface ParsedQuestion {
  orderNo: number
  stem: string
  options: string[]
  answer: string
  analysis: string
  /**
   * 由整块文本合成的大题（写作 / 翻译 / 兜底模块），不是卷面上带题号的客观题。
   * 卷末答案键回填必须跳过它们，否则「1. B」会被误写成写作题的答案。
   */
  synthetic?: boolean
}

export interface ParsedSection {
  type: SectionType
  title: string
  passage: string
  questions: ParsedQuestion[]
  /** 前端编辑态用的临时键 */
  key: string
}

export interface ParsedPaper {
  title: string
  level: Level
  yearMonth: string
  sections: ParsedSection[]
  rawText: string
}

/** 模块类型中文名 */
export const SECTION_LABEL: Record<SectionType, string> = {
  writing: '写作',
  listening: '听力',
  cloze: '选词填空',
  reading: '阅读理解',
  translation: '翻译',
}

/** 题号行：1. / 1、/ （1）/ Question 1 */
const QUESTION_START =
  /^\s*(?:(\d{1,3})\s*[.、．)）]|[（(]\s*(\d{1,3})\s*[)）]|question\s+(\d{1,3})[\s.:、]*)/i

/** 题号行取出题号 */
function extractQuestionNo(line: string): number | null {
  const m = line.match(QUESTION_START)
  if (!m) return null
  const raw = m[1] ?? m[2] ?? m[3]
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * 排除「题号引导的篇章导语」行，如：
 *   Questions 46 to 50 are based on the following passage.
 *   Question 46 is based on the following passage.
 * 这类行会误触发题号切分，必须当作正文/导语而非单题起点。
 */
function isPassageIntro(line: string): boolean {
  return /\bquestions?\s+\d+.*\b(to|based on|following|passage|following passage)\b/i.test(line.trim())
}

interface HeaderRule {
  type: SectionType
  re: RegExp
}

/**
 * 模块识别规则（顺序敏感）：
 * 选词填空必须排在阅读理解之前，否则会被阅读理解规则吃掉。
 *
 * 关键：真实 PDF 抽取常用 Unicode 罗马数字 Ⅰ Ⅱ Ⅲ Ⅳ（非 ASCII i/1），
 * 且英文模块名常单独成行；中文卷用「写作/听力/阅读/翻译」。
 * 标题行通常较短（<=90 字），过长行视为正文不参与判定。
 */
/**
 * 模块识别规则（顺序敏感）：
 * 选词填空必须排在阅读理解之前，否则会被阅读理解规则吃掉。
 *
 * 关键：真实 PDF 抽取常用 Unicode 罗马数字 Ⅰ Ⅱ Ⅲ Ⅳ（非 ASCII i/1），
 * 且英文模块名常单独成行；中文卷用「写作/听力/阅读/翻译」。
 * 注意：JS 的 \b 是 ASCII 词边界，罗马数字后 \b 失效，故用「非续接」负向预查
 * （RN_CONT）避免 "Part III" 被 "Part II" 的前缀（II）误命中。
 */
const RN_CONT = 'ⅠⅰⅡⅱⅢⅲⅣⅳⅤⅴIiIIiiIIIiiIVivVv'
const noCont = `(?![${RN_CONT}])`

/**
 * 英文模块名必须「独占一行」：只允许后面跟 comprehension 或一个括注（如 (25 minutes)）。
 *
 * 旧规则写的是 `^\s*reading\b`，于是 PDF 折行产生的正文行
 *   `reading aloud to children before bed helps them ...`
 * 会被当成「阅读理解」模块的开头——真实 PDF 抽取出来的文本里，
 * 任何以 reading / writing / listening / translation 开头的折行都会误触发。
 */
const enHeader = (kw: string) => `^\\s*${kw}(\\s+comprehension)?(\\s*[（(][^)）]*[)）])?\\s*$`

const HEADER_RULES: HeaderRule[] = [
  // 注意：这里刻意不收 `word bank` / `ten blanks`，它们更常出现在正文和 Directions 导语里，
  // 作为「模块标题」的判据太宽；选词填空的识别改由 parsePaper 里基于空号的内容判定负责。
  { type: 'cloze', re: /选词填空|词汇填空|banked\s*cloze|^\s*cloze\b/i },
  {
    type: 'writing',
    re: new RegExp(
      `写作|作文|写译|第一部分|${enHeader('writing')}|(^|\\s)part\\s*(?:Ⅰ|1|ⅰ|i)${noCont}\\s*writing`,
      'i',
    ),
  },
  {
    type: 'listening',
    re: new RegExp(`听力|第二部分|${enHeader('listening')}|(^|\\s)part\\s*(?:Ⅱ|2|ⅱ|ii)${noCont}`, 'i'),
  },
  {
    type: 'translation',
    re: new RegExp(`翻译|汉译英|第四部分|${enHeader('translation')}|(^|\\s)part\\s*(?:Ⅳ|4|ⅳ|iv)${noCont}`, 'i'),
  },
  {
    type: 'reading',
    re: new RegExp(`阅读|第三部分|${enHeader('reading')}|(^|\\s)part\\s*(?:Ⅲ|3|ⅲ|iii)${noCont}|仔细阅读|长篇阅读`, 'i'),
  },
]

/** 子模块标题：Section A / Section B / Passage One / Passage Two / Part A / 第三部分 / 第二篇 */
const SUB_SECTION_RE =
  /^\s*(section\s+[a-d]\b|passage\s+(one|two|three|four|1|2|3|4)\b|part\s+[a-e]\b|第[一二三四五六七八九十]+(?:部分|篇))/i

/** 页眉页脚 / 页码等噪声行，应当整行丢弃 */
const JUNK_LINE_RE = [
  /^\s*第\s*\d+\s*页\s*(共\s*\d+\s*页)?\s*$/i, // 第 1 页 / 第 1 页 共 12 页
  /^\s*—\s*\d+\s*—\s*$/, // — 12 —
  /^\s*-\s*\d+\s*-\s*$/,
  /^\s*P\.?\s*\d+\s*$/i, // P.12 / P 12
  /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/, // 12/120
  /^\s*\d+\s*$/, // 单独的数字页码
]

function isJunkLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return JUNK_LINE_RE.some((re) => re.test(t))
}

/** 判断某行是否为模块标题 */
function detectHeader(line: string): SectionType | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  // Directions 导语行永远不是模块标题。选词填空的导语
  // “Directions: In this section, there is a passage with ten blanks.”
  // 会命中 cloze 的 `ten blanks` 规则，从而被误判成一个新模块的开头，
  // 其后的 Section B / Passage One 会全部继承成「选词填空」，阅读模块直接归零。
  // 旧实现只靠「标题行 ≤90 字」挡住它，导语一短就漏。
  if (/^directions?\s*[:：]/i.test(trimmed)) return null
  // 含选词填空空号（__26__ / （26））的行一定是正文或题干，不可能是模块标题
  if (/_{1,3}\s*\d{1,3}\s*_{1,3}|[\[［(（]\s*\d{1,3}\s*[\]］)）]/.test(trimmed)) return null
  // 模块标题不会是一条长句；PDF 折行产生的半句话靠这条排除
  if (trimmed.split(/\s+/).filter(Boolean).length > 10) return null
  // 标题行通常较短；超长行（正文段落）不参与判定
  if (trimmed.length > 90) return null

  // 以 `Part …` 开头时，**优先按英文模块名判定，不看罗马数字**。
  // 真实 PDF 的文字层经常把 Part III 抽成 `Part ID`、把 Part II 抽成 `Part H`，
  // 罗马数字规则一失配，整个 Part 就识别不出来——后面的 Section 会全部继承上一个
  // Part 的类型（实测：一份六级卷的选词填空和长篇阅读整体变成了「听力」）。
  // 而 Writing / Listening / Reading / Translation 这几个词本身几乎不会被抽错。
  if (/^\s*part\b/i.test(trimmed)) {
    if (/\bwriting\b/i.test(trimmed)) return 'writing'
    if (/\blistening\b/i.test(trimmed)) return 'listening'
    if (/\breading\b/i.test(trimmed)) return 'reading'
    if (/\btranslation\b/i.test(trimmed)) return 'translation'
  }

  for (const rule of HEADER_RULES) {
    if (rule.re.test(trimmed)) return rule.type
  }
  return null
}

/** 归一化时只保留文字，用于统计「重复出现的页眉页脚」 */
function headerKey(line: string): string {
  return line.replace(/[^\p{L}]/gu, '')
}

/**
 * 归一化：统一换行、去掉行首行尾空白与全角空格、剥离页眉页脚噪声。
 *
 * 除了固定的页码格式，还要处理**每页重复的页眉页脚**：CET 真题 PDF 每页都印
 * 「・2025年 6 月六级真题（第一套）・ 2」这类行，只有页号不同。它们会混进正文，
 * 也会让「正文只剩 Directions 的空壳模块」判定失败（多出一行页脚就不算空壳了）。
 * 这里按「去掉数字与标点后是否完全一致、且出现 ≥3 次」把它们清掉。
 */
function normalize(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''))
    // 空行必须保留：它是段落边界，后面要靠它把硬折行还原成段落
    .filter((l) => !l || !isJunkLine(l))

  const freq = new Map<string, number>()
  for (const l of lines) {
    const k = headerKey(l)
    if (k.length >= 4) freq.set(k, (freq.get(k) ?? 0) + 1)
  }

  const kept = lines.filter((l) => {
    const k = headerKey(l)
    if (k.length < 4 || (freq.get(k) ?? 0) < 3) return true
    // 可能本来就会重复出现的内容不能误删
    if (SUB_SECTION_RE.test(l)) return true
    if (/^directions?\s*[:：]/i.test(l)) return true
    if (QUESTION_START.test(l)) return true
    return false
  })

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 抽取年份月份，如 2023年6月 → 2023-06 */
function detectYearMonth(text: string): string {
  const m = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`
  const m2 = text.match(/(20\d{2})\s*[-/]\s*(\d{1,2})/)
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, '0')}`
  return ''
}

/** 判断等级 */
function detectLevel(text: string, fallback: Level): Level {
  if (/六级|CET\s*-?\s*6|CET6/i.test(text)) return 'CET6'
  if (/四级|CET\s*-?\s*4|CET4/i.test(text)) return 'CET4'
  return fallback
}

/** 抽取标题：首行若像标题则采用 */
function detectTitle(lines: string[], fallback: string): string {
  for (const line of lines.filter((l) => l.trim()).slice(0, 5)) {
    if (!line) continue
    if (/大学英语|四级|六级|CET|考试|真题|College English Test/i.test(line) && line.length <= 80) {
      const clean = line.replace(/^#+\s*/, '').trim()
      // 截到「（第一套）」为止：页眉水印/印章的碎片常被并进标题同一行
      const m = clean.match(/^.*?[（(]\s*第\s*[一二三四五六七八九十\d]+\s*套\s*[)）]/u)
      return (m ? m[0] : clean).trim()
    }
  }
  return fallback
}

/**
 * Part 序号按检测出的模块类型归一化。
 * 真实 PDF 的文字层经常把 `Part III` 抽成 `Part ID`、`Part II` 抽成 `Part H`，
 * 标题栏里显示成「Part ID Reading Comprehension」很难看；模块类型是可靠的，用它反推序号。
 */
const PART_RN: Record<SectionType, string> = {
  writing: 'I',
  listening: 'II',
  cloze: 'III',
  reading: 'III',
  translation: 'IV',
}

function normalizePartNumeral(title: string, type: SectionType): string {
  const rn = PART_RN[type]
  if (!rn || !/^\s*part\b/i.test(title)) return title
  return title.replace(/^(\s*part\s*)\S*/i, `$1${rn}`)
}

/** 词库选项只可能是 A~O 这 15 个字母 */
const BANK_LETTERS = 'ABCDEFGHIJKLMNO'

/**
 * 把一行解析成「纯选项行」：整行只由 `A) word` 这类选项拼成（允许一行多个），
 * 中间或行尾出现任何其它文本都返回 null。
 *
 * 这个「整行约束」是区分词库与长篇阅读段落标号的关键：
 * 段落标号行形如 `A) The idea of online learning…`（标号后还有正文），会被拒绝；
 * 词库行形如 `A) accessible` / `A) accessible   B) advocate`（标号后只有单词），会被接受。
 */
function parseBankLine(line: string): { letter: string; text: string }[] | null {
  const s = line.trim()
  if (!s) return null
  // 字母位允许数字 0：真实 PDF 里 `O)` 常被 OCR 读成 `0 )`
  const re = /([A-O0])\s*[.、．)）:：]\s*([A-Za-z][A-Za-z\-']*)/g
  const out: { letter: string; text: string }[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (s.slice(cursor, m.index).trim() !== '') return null
    out.push({ letter: m[1] === '0' ? 'O' : m[1].toUpperCase(), text: m[2] })
    cursor = m.index + m[0].length
  }
  if (s.slice(cursor).trim() !== '') return null
  return out.length ? out : null
}

/**
 * 选词填空词库抽取。
 *
 * 真实 PDF/DOCX 抽出文本里词库有三种常见排布，都要吃下：
 *   1. 单行密集：`A) abandon   B) absorb   C) benefit …`（10~15 个一行）
 *   2. 每行若干：`A) abandon B) absorb` / `C) benefit D) boost`
 *   3. 每行一个：`A) abandon` 换行 `B) absorb` …（PDF 抽取最常见，旧实现完全抓不到）
 *
 * 前两种靠「累加连续字母」的 run 识别；第三种同样走 run（一行一个也能连起来）。
 * run 必须从 A 开始、字母严格连续、且至少 8 个，才认定为词库——
 * 这样 A~D 的题目选项和段落标号不会被误当成词库。
 */
function extractWordBank(lines: string[]): string[] {
  // 1) 收集所有「整行只由选项构成」的行里的选项，按字母去重。
  //    不能只按出现顺序连号——双栏词库是 `A) aesthetic  I) infringement` 这样成对出现的，
  //    字母在文本流里是 A,I,B,J,C,K… 交错的，只有收全之后按字母排才连得起来。
  const byLetter = new Map<string, string>()
  for (const line of lines) {
    const parsed = parseBankLine(line)
    if (!parsed) continue
    for (const e of parsed) if (!byLetter.has(e.letter)) byLetter.set(e.letter, e.text)
  }
  // 2) 按字母序取全部收到的选项。只要凑够 8 个就认定为词库——
  //    不再要求「从 A 严格连续」：OCR 漏读一个字母（`O)` → `0 )`、`G)` 整行被拒）
  //    就会让连号判定中断、整个词库丢失，而 A~D 的题目选项永远凑不到 8 个。
  const bank = BANK_LETTERS.split('')
    .filter((letter) => byLetter.has(letter))
    .map((letter) => `${letter}) ${byLetter.get(letter)}`)
  if (bank.length >= 8) return bank

  // 3) 兜底：词库行带了前缀（如 `Word bank: A) …`）导致整行约束不成立时，
  //    退回旧的「一行内 ≥4 个选项就收集」策略，保证不比改前更差。
  const acc: string[] = []
  for (const line of lines) {
    const matches = [...line.matchAll(/([A-O])\s*[.、．)）:：]\s*([A-Za-z][A-Za-z\-']*)/g)]
    if (matches.length >= 4) {
      for (const m of matches) acc.push(`${m[1]}) ${m[2]}`)
    }
  }
  return [...new Set(acc)]
}

/** 选词填空空号：__26__ / [26] / （26）/ (26) */
function extractBlankNumbers(passage: string): number[] {
  const found = new Set<number>()
  for (const m of passage.matchAll(/_{1,3}\s*(\d{1,3})\s*_{1,3}/g)) found.add(Number(m[1]))
  for (const m of passage.matchAll(/[\[［(（]\s*(\d{1,3})\s*[\]］)）]/g)) found.add(Number(m[1]))
  return [...found].sort((a, b) => a - b)
}

/**
 * 「裸数字」空号：有些真题 PDF 的文字层把空号的下划线丢了，只剩数字
 * （`... herbicides (灭草剂).They were 26 .`）。
 *
 * 只在已经确认是选词填空之后才用它兜底，并且要求取到**长度 ≥5 的连续段**，
 * 这样正文里偶然出现的两位数（年份、天数）不会把整段切成假题目。
 */
function extractBareBlankNumbers(passage: string): number[] {
  const found = new Set<number>()
  for (const m of passage.matchAll(/(?<![\d.])(\d{2})(?![\d.])/g)) {
    const n = Number(m[1])
    if (n >= 20 && n <= 60) found.add(n)
  }
  const nums = [...found].sort((a, b) => a - b)
  let best: number[] = []
  let run: number[] = []
  for (const n of nums) {
    if (run.length && n === run[run.length - 1] + 1) run.push(n)
    else run = [n]
    if (run.length > best.length) best = [...run]
  }
  return best.length >= 5 ? best : []
}

/** 中日韩字符（中文之间断行不该补空格） */
const CJK_RE = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

/** 把一「段」里的硬折行合并回一行 */
function joinLines(lines: string[]): string {
  let out = ''
  for (const line of lines) {
    if (!out) {
      out = line
      continue
    }
    const prev = out[out.length - 1]
    const next = line[0] ?? ''
    out += CJK_RE.test(prev) && CJK_RE.test(next) ? line : ` ${line}`
  }
  return out
}

/**
 * 把 PDF 抽出来的文本还原成「原卷的段落形式」。
 *
 * PDF 的正文是**硬折行**的：一段话被切成若干等宽的行，段落之间靠行距（或段首标号）区分。
 * 直接按行展示的话，两三千字的文章会变成几十条断句 —— 完全不是原卷的样子。
 * 这里按原卷分段：段内合并成一行，段间用空行分开。
 *
 * 段落边界有两个来源：
 *   1. 空行 —— `itemsToLines` 按行距大小插入的；
 *   2. 段首标号 A) B) C)… —— 长篇阅读的段落就是这样标的。
 */
function mergeParagraphs(text: string): string {
  const paras: string[] = []
  for (const block of text.split(/\n{2,}/)) {
    let current: string[] = []
    const flush = () => {
      const merged = joinLines(current).trim()
      if (merged) paras.push(merged)
      current = []
    }
    for (const raw of block.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      // 段首标号：另起一段（选词填空的词库行也长这样，正好一行一个）
      if (/^[A-O][)）.、]\s*\S/.test(line) && current.length) flush()
      current.push(line)
    }
    flush()
  }
  return paras.join('\n\n')
}

/**
 * 取「包含第 n 个空」的整句作为题干。
 *
 * 内置示范卷里选词填空的题干就是含空格的句子
 * （`Reading books has a __26__ effect on children.`），而不是「第 26 空」这种占位符——
 * 学生作答时看到的应该是原句，否则根本无从判断该填什么词性、什么语义。
 */
function sentenceForBlank(passage: string, n: number): string {
  const blankRe = new RegExp(
    `_{1,3}\\s*${n}\\s*_{1,3}|[\\[［(（]\\s*${n}\\s*[\\]］)）]|(?<![\\d.])${n}(?![\\d.])`,
  )
  for (const s of passage.split(/(?<=[.!?。！？])\s+/)) {
    const t = s.trim()
    if (t && t.length <= 500 && blankRe.test(t)) return t
  }
  return ''
}

/** 仅时间标注：(30 minutes) / （25分钟） */
const TIME_ONLY_RE = /^[（(]?\s*\d{1,3}\s*(?:minutes?|分钟)\s*[)）]?\s*$/i
/** Directions 导语行 */
const DIRECTIONS_RE = /^directions?\s*[:：]/i

/**
 * 判断一个模块的正文是否只是「结构性噪声」——即除了 `(30 minutes)` 时间标注和
 * `Directions: …` 导语之外没有任何实际内容。
 *
 * 这类模块必须丢弃：真实卷里 `Part II Listening Comprehension` 后面紧跟 `Section A`，
 * 于是 Part 级模块只剩一行 `(25 minutes)`；旧实现会给它合成一道题干为
 * “(25 minutes)” 的幽灵题（还会占用题号 2，污染答案键回填）。
 */
/** Directions 导语的合理长度上限：超过它说明后面已经是正文，不再是导语续行 */
const DIRECTIONS_BUDGET = 500

function isStructuralSection(lines: string[]): boolean {
  /** 是否正处在一段 Directions 导语里（PDF 折行会让导语横跨多行） */
  let inDirections = false
  /** 已累积的导语字数 */
  let dirChars = 0
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      inDirections = false
      continue
    }
    if (TIME_ONLY_RE.test(t)) continue
    if (DIRECTIONS_RE.test(t)) {
      inDirections = true
      dirChars += t.length
      continue
    }
    // Directions 的折行续行：既不是题号也不是子标题，且整段导语还没超预算。
    // 少了这一条，`Directions: There are 2 passages…` 被折成三行后，
    // 后面两行会让整个空模块逃过噪声判定，凭空多出一个只有导语的模块。
    if (
      inDirections &&
      dirChars < DIRECTIONS_BUDGET &&
      !QUESTION_START.test(t) &&
      !SUB_SECTION_RE.test(t) &&
      !/_{1,3}\s*\d{1,3}\s*_{1,3}/.test(t)
    ) {
      dirChars += t.length
      continue
    }
    return false
  }
  return true
}

interface RawSection {
  type: SectionType
  title: string
  /** Part 级标题原文，如 `Part II Listening Comprehension (30 minutes)` */
  partTitle: string
  /** 子标题原文，如 `Section A` / `Passage One`；Part 级模块为空 */
  subTitle: string
  lines: string[]
}

/** 各模块的中文名（拼进标题，与内置示范卷的写法一致） */
const PART_CN: Record<SectionType, string> = {
  writing: '写作',
  listening: '听力理解',
  cloze: '阅读理解',
  reading: '阅读理解',
  translation: '翻译',
}

/**
 * 听力 / 阅读各 Section 的中文题型名。
 * 注意**四级和六级的 Section 含义不同**：四级 Section A 是新闻听力，六级 Section A 是长对话。
 */
function sectionTopic(level: Level, type: SectionType, subTitle: string): string {
  const m = subTitle.match(/section\s+([a-d])\b/i)
  if (!m) return ''
  const letter = m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D'
  if (type === 'listening') {
    const table = level === 'CET4' ? { A: '新闻听力', B: '长对话', C: '听力篇章' } : { A: '长对话', B: '听力篇章', C: '讲话/报道/讲座' }
    return (table as Record<string, string>)[letter] ?? ''
  }
  if (type === 'reading' || type === 'cloze') {
    return ({ A: '选词填空', B: '长篇阅读', C: '仔细阅读' } as Record<string, string>)[letter] ?? ''
  }
  return ''
}

/**
 * 练习页显示的模块标题，形如内置示范卷的
 * `Part II Listening Comprehension（听力理解）Section A  长对话`。
 */
function formatSectionTitle(partTitle: string, subTitle: string, type: SectionType, level: Level): string {
  const part = partTitle ? normalizePartNumeral(partTitle, type) : ''
  const cn = PART_CN[type]
  if (!subTitle) return part ? `${part}（${cn}）` : ''
  const head = part ? `${part}（${cn}）${subTitle}` : subTitle
  const topic = sectionTopic(level, type, subTitle)
  return topic ? `${head}  ${topic}` : head
}

/**
 * 一级切分：把整卷切成 写作 / 听力 / 选词填空 / 阅读理解 / 翻译 等模块
 */
function splitSections(lines: string[]): RawSection[] {
  const sections: RawSection[] = []
  let current: RawSection = { type: 'reading', title: '未命名模块', partTitle: '', subTitle: '', lines: [] }
  /** 最近一次「Part 级」标题的类型：Section A / Passage One 等子标题继承它 */
  let partType: SectionType | null = null
  /** 最近一次「Part 级」标题的原文，用来给子模块补全上下文 */
  let partTitle: string | null = null
  /** 首个模块标题出现前的内容（卷头标题等）直接丢弃 */
  let started = false

  const push = () => {
    const text = current.lines.join('\n').trim()
    if (!text || !started) return
    // 写作 / 翻译本身就是一整道大题，哪怕正文只有 Directions 也必须保留；
    // 其它模块若正文只剩时间标注和 Directions 导语，说明这个 Part 级标题下面
    // 还有 Section 级子模块，它本身不成题，直接丢弃。
    const isEssay = current.type === 'writing' || current.type === 'translation'
    if (!isEssay && isStructuralSection(current.lines)) return
    sections.push(current)
  }

  for (const line of lines) {
    if (!line.trim()) {
      // 空行 = 段落边界，原样带进模块，供后续把硬折行还原成段落
      if (started) current.lines.push('')
      continue
    }

    const sub = line.trim().match(SUB_SECTION_RE)
    const header = detectHeader(line)

    if (header) {
      push()
      partType = header
      partTitle = line.trim()
      started = true
      current = { type: header, title: line.trim(), partTitle: line.trim(), subTitle: '', lines: [] }
      continue
    }

    // 子标题（Section A / Passage One…）沿用所属 Part 的类型，另起模块
    if (sub && started) {
      push()
      const subTitle = line.trim()
      // Part 级标题（如「Part II Listening Comprehension」）正文往往只有一行时间标注，
      // 会被当作结构性噪声丢弃；子模块要记住它，否则模块列表里会出现
      // 「Section A / Section B / Section C」这种脱离上下文后无从区分的标题。
      const own = partTitle && !subTitle.toLowerCase().includes(partTitle.toLowerCase()) ? partTitle : ''
      current = {
        type: partType ?? current.type,
        title: own ? `${own} · ${subTitle}` : subTitle,
        partTitle: own,
        subTitle,
        lines: [],
      }
      continue
    }

    if (!started) continue
    current.lines.push(line)
  }
  push()
  const result = sections.filter((s) => s.lines.join('\n').trim().length > 0)

  // 兜底：整篇没有任何可识别的模块标题时，把全文当作一个「未分类」模块，
  // 交由二级切分按题号拆单题，避免「上传后啥都没有」。
  if (result.length === 0 && lines.join('\n').trim().length > 0) {
    result.push({ type: 'reading', title: '整卷（自动切分）', partTitle: '', subTitle: '', lines: [...lines] })
  }
  return result
}

/**
 * 从文本中抽取选项：兼容「选项与题号同行」(1. A)… B)…) 与「选项各占一行」两种格式。
 * 用选项字母边界切分，避免把整行当成一个选项（旧实现会退化为词库、只留首词）。
 */
/**
 * 选项标记：兼容 `A)` `A.` `A、` `A．` `A）`，以及中文试卷常见的 `（A）` 和全角 `Ａ）`。
 * 开头那个可选左括号很关键——不少真题 PDF 的选项写成 `（A）xxx`，旧正则只认 `A)`，
 * 结果整个选项区被当成题干正文塞进 stem，练习页里就变成一大段文字、没有可点的选项。
 */
const OPTION_MARK_G = /(?:[（(]\s*)?([A-DＡ-Ｄ])\s*[.、．)）:：]\s*/g
const OPTION_MARK_AT = /(?:[（(]\s*)?[A-DＡ-Ｄ]\s*[.、．)）:：]/

/** 全角字母归一化成半角大写 */
function normalizeLetter(ch: string): string {
  return ch.normalize('NFKC').toUpperCase()
}

function extractOptionsFromText(text: string): { letter: string; text: string }[] {
  const parts = text.split(OPTION_MARK_G)
  const opts: { letter: string; text: string }[] = []
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const t = parts[i + 1].trim()
    if (t) opts.push({ letter: normalizeLetter(parts[i]), text: t })
  }
  return opts
}

/**
 * 二级切分：把模块内容拆到单题
 */
function splitQuestions(lines: string[]): { passage: string; questions: ParsedQuestion[] } {
  const passageLines: string[] = []
  const blocks: { no: number; lines: string[] }[] = []
  let current: { no: number; lines: string[] } | null = null

  for (const line of lines) {
    const no = extractQuestionNo(line)
    if (no != null && !isPassageIntro(line)) {
      current = { no, lines: [line.replace(QUESTION_START, '').trim()] }
      blocks.push(current)
      continue
    }
    if (current) {
      current.lines.push(line)
    } else {
      passageLines.push(line)
    }
  }

  const wordBank = extractWordBank(lines)

  const questions: ParsedQuestion[] = blocks.map((b, i) => {
    const text = b.lines.join('\n').trim()
    const opts = extractOptionsFromText(text)
    // 题干 = 第一个选项之前的内容（选项与题号同行时题干可能为空）
    let stem = text
    if (opts.length >= 2) {
      const idx = text.search(OPTION_MARK_AT)
      stem = (idx >= 0 ? text.slice(0, idx) : '').trim()
    }
    // 选项按字母排序：双栏网格里选项在文本流中的顺序是 A,C,B,D，
    // 直接沿用会显示成「A) … C) … B) … D) …」，而且答案字母会对不上位置
    const ordered = [...opts].sort((x, y) => x.letter.localeCompare(y.letter))
    const finalOptions =
      ordered.length >= 2 ? ordered.map((o) => `${o.letter}) ${o.text}`) : wordBank.length ? wordBank : []
    return {
      orderNo: b.no || i + 1,
      stem,
      options: finalOptions,
      answer: '',
      analysis: '',
    }
  })

  // 注意：这里返回的是「按 PDF 硬折行」的原始段落文本。
  // 段落合并不在这里做——翻译题还要靠逐行判断哪一行开始是中文正文，
  // 提前合并会把 Directions 和正文粘成一行、拆不开。
  return { passage: passageLines.join('\n').trim(), questions }
}

/**
 * 卷末答案键回填：识别形如
 *   1. B
 *   2. C
 *   36. D
 * 或区间写法
 *   1-5 A B C D A
 * 的「题号→选项字母」纯答案行，按全局题号把答案写回对应题。
 *
 * 关键：只匹配「整行只有 题号.字母、字母后无其它文字」的行，避免与
 * 题干里的 "1. A) growing fast." 这类选项行混淆。
 *
 * 字母范围放到 A~O：长篇阅读（段落匹配）的答案是段落标号，会用到 E~O，
 * 只认 A~D 的话这些题的答案永远回填不上。整行约束足够强，放宽后不会误伤。
 */
function fillAnswersFromKey(paper: ParsedPaper): void {
  const text = paper.rawText
  const map = new Map<number, string>()

  // 1) 纯答案行：整行就是「N. X」（字母后不能再有文字）
  const lineRe = /^\s*([1-9]\d{0,2})\s*[.、．)）]\s*([A-Oa-o])\s*$/gim
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(text)) !== null) {
    map.set(Number(m[1]), m[2].toUpperCase())
  }

  // 2) 区间写法：1-5 A B C D A
  const rangeRe = /([1-9]\d{0,2})\s*[-~]\s*([1-9]\d{0,2})\s*[:：]?\s*([A-Oa-o](?:\s+[A-Oa-o]){1,})/g
  let rm: RegExpExecArray | null
  while ((rm = rangeRe.exec(text)) !== null) {
    const start = Number(rm[1])
    const letters = rm[3].split(/\s+/).map((s) => s.toUpperCase())
    letters.forEach((L, idx) => map.set(start + idx, L))
  }

  if (map.size >= 5) applyKeyMap(paper, map)
}

function applyKeyMap(paper: ParsedPaper, map: Map<number, string>): void {
  for (const s of paper.sections) {
    for (const q of s.questions) {
      // 合成题（写作 / 翻译 / 兜底整块）不占卷面题号，绝不能吃答案键：
      // 旧实现里写作模块的合成题号恰好是 1，会被「1. B」写成答案 B。
      if (q.synthetic) continue
      const ans = map.get(q.orderNo)
      if (ans && !q.answer) q.answer = ans
    }
  }
}

/**
 * 从模块标题里取 Part 序号：`Part I Writing` → 1、`Part Ⅳ Translation` → 4。
 * 写作 / 翻译这类合成题用它当题号，比「第 12 题」这种按数组下标算出来的数字合理。
 */
function partNumberOf(title: string): number | null {
  const m = title.match(/part\s*(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|ⅰ|ⅱ|ⅲ|ⅳ|ⅴ|IV|III|II|I|V|[1-5])/i)
  if (!m) return null
  const table: Record<string, number> = {
    'Ⅰ': 1,
    'Ⅱ': 2,
    'Ⅲ': 3,
    'Ⅳ': 4,
    'Ⅴ': 5,
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
  }
  return table[m[1].toUpperCase()] ?? null
}

let uid = 0
const nextKey = () => `sec-${Date.now().toString(36)}-${uid++}`

/**
 * 【核心】整套真题自动切分
 *
 * 流程：归一化 → 识别标题/等级/年份 → 按模块标题一级切分 → 按题号二级切分到单题 → 选词填空特判 → 答案键回填
 */
export function parsePaper(raw: string, fallbackLevel: Level = 'CET4'): ParsedPaper {
  const text = normalize(raw)
  const lines = text.split('\n')

  const title = detectTitle(lines, '自定义真题')
  const level = detectLevel(text, fallbackLevel)
  const yearMonth = detectYearMonth(text)

  const rawSections = splitSections(lines)

  const sections: ParsedSection[] = rawSections.map((s, si) => {
    const { passage, questions } = splitQuestions(s.lines)
    let type = s.type

    // 选词填空特判：题干里带空号（__26__ / （26））时，按空号生成单题
    let finalQuestions = questions
    let finalPassage = mergeParagraphs(passage)

    const markedBlanks = extractBlankNumbers(passage)
    const looksLikeCloze =
      /选词填空|banked\s*cloze|word\s*bank/i.test(s.lines.join('\n')) || markedBlanks.length >= 3
    // 带装饰的空号（__26__ / （26））优先；PDF 把下划线丢掉时，用「连续裸数字」兜底
    const blankNums = markedBlanks.length >= 3 ? markedBlanks : extractBareBlankNumbers(passage)

    if (looksLikeCloze && blankNums.length >= 3) {
      type = 'cloze'
      const bank = extractWordBank(s.lines)
      finalPassage = passage
      finalQuestions = blankNums.map((n) => ({
        orderNo: n,
        // 与内置示范卷一致：题干是含空格的整句；句子切不出来时才退回占位描述
        stem: sentenceForBlank(passage, n) || `第 ${n} 空（选词填空）`,
        options: bank,
        answer: '',
        analysis: '',
      }))
    }

    // 写作、翻译这类没有题号的模块，整块作为一题
    if (finalQuestions.length === 0 && (passage || s.lines.length)) {
      // 去掉开头的纯时间标注：真实 PDF 里 `(30 minutes)` 常单独成行，
      // 夹在模块标题和 Directions 之间，会挡住后面的 Directions 识别
      const body = (passage || s.lines.join('\n'))
        .replace(/^(?:[（(]?\s*\d{1,3}\s*(?:minutes?|分钟)\s*[)）]?\s*\n?)+/i, '')
        .trim()
      const bodyLines = body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      // Directions 可能在 body 中间（前面还有别的东西），所以按行首搜而不是 ^
      const dirMatch = body.match(/^[^\S\n]*Directions\s*[:：][^\n]*/im)
      const rest = dirMatch ? body.slice((dirMatch.index ?? 0) + dirMatch[0].length).trim() : ''

      // 写作 / 翻译本身就是一道大题，即使只有 Directions 也要生成题目；
      // 阅读等模块的纯「Directions:」导语则作为公共题干，不生成假题目
      const isEssay = type === 'writing' || type === 'translation'

      if (dirMatch && !rest && !isEssay) {
        finalPassage = mergeParagraphs(body)
        finalQuestions = []
      } else {
        const orderNo = partNumberOf(s.title) ?? si + 1
        if (type === 'translation') {
          // 翻译：与内置示范卷一致，Directions 是「公共要求」放 passage，
          // 中文段落放题干。注意不能靠「Directions 所在的那一行」切分——
          // PDF 会把长行折行，续行会被误当成正文。改按「第一行含中文」定位正文起点。
          const zhIdx = bodyLines.findIndex((l) => /[\u4e00-\u9fa5]/.test(l))
          finalPassage = zhIdx > 0 ? mergeParagraphs(bodyLines.slice(0, zhIdx).join('\n')) : ''
          finalQuestions = [
            {
              orderNo,
              stem: mergeParagraphs((zhIdx > 0 ? bodyLines.slice(zhIdx) : bodyLines).join('\n')),
              options: [],
              answer: '',
              analysis: '',
              synthetic: true,
            },
          ]
        } else {
          // 写作：题目要求本身既是 passage 也是题干（与内置示范卷的写法一致）
          finalPassage = isEssay ? mergeParagraphs(body) : ''
          finalQuestions = [
            {
              orderNo,
              stem: mergeParagraphs(body),
              options: [],
              answer: '',
              analysis: '',
              synthetic: true,
            },
          ]
        }
      }
    }

    return {
      type,
      title: s.subTitle || s.partTitle ? formatSectionTitle(s.partTitle, s.subTitle, type, level) : s.title,
      passage: finalPassage,
      questions: finalQuestions,
      key: nextKey(),
    }
  })

  const paper: ParsedPaper = { title, level, yearMonth, sections, rawText: text }
  // 长篇阅读（段落匹配）没有选项行，选项要从原文段落标号 A)~O) 里补，
  // 否则这些题在界面上就是「没有选项、没法作答」的纯文本题。
  for (const s of sections) attachParagraphOptions(s)

  // 整卷切完后，若多数客观题缺答案，尝试从卷末答案键回填。
  // 合成题（写作/翻译）永远不会有字母答案，统计时要排除，否则会拉低命中率导致误判。
  const objective = sections.flatMap((s) => s.questions).filter((q) => !q.synthetic)
  const withAns = objective.filter((q) => q.answer).length
  if (objective.length > 0 && withAns < objective.length * 0.3) {
    fillAnswersFromKey(paper)
  }

  return paper
}

/**
 * 从 passage 里抽出段落标号（形如 `A) 正文…`）。
 *
 * 只认「行首是单个字母 + 分隔符 + 后面还有内容」的行：
 *   - `A) Librarians know…`  → 段落标号 ✓
 *   - `A lot of people…`     → 字母后面是空格再跟字母，没有分隔符，拒绝 ✓
 *   - `I. Introduction`      → 会被认成标号（概率极低，可接受）
 */
export function extractParagraphLabels(passage: string): string[] {
  const found = new Set<string>()
  for (const line of passage.split('\n')) {
    const m = /^\s*([A-O])\s*[).、）:：]\s*\S/.exec(line)
    if (m) found.add(m[1])
  }
  return [...found].sort()
}

/**
 * 长篇阅读（段落匹配，36-45 题）特判。
 *
 * 原卷这类题**没有 ABCD 选项行**：题干是一句陈述，作答方式是从原文的段落标号
 * `A)`~`O)` 里挑一个填到答题卡。切分器只认选项行的话，这些题就会变成
 * 「options 为空」的纯文本题 —— 界面上既没有可点的选项，也没法作答。
 *
 * 判定用的是结构信号而不是标题文字（标题在不同卷里写法不一）：
 * 阅读模块 + 题目不少 + 全都没有选项 + 题干是英文陈述 + 原文确实带段落标号。
 */
function attachParagraphOptions(section: ParsedSection): void {
  if (section.type !== 'reading') return
  const qs = section.questions
  if (qs.length < 5) return
  // 普通选择题已经有选项，不碰
  if (qs.some((q) => (q.options?.length ?? 0) >= 2)) return
  // 题干必须是英文陈述（写作/翻译那种中文题干不算）
  if (!qs.every((q) => /[A-Za-z]{3}/.test(q.stem))) return
  const labels = extractParagraphLabels(section.passage)
  if (labels.length < 3) return
  for (const q of qs) {
    if (q.synthetic) continue
    q.options = [...labels]
  }
}

/** 统计切分结果 */
export function countQuestions(sections: ParsedSection[]): number {
  return sections.reduce((sum, s) => sum + s.questions.length, 0)
}
