/**
 * 阅读方法与示范内容。
 *
 * 三条方法（对应四六级阅读的三种题型）：
 *   1. 长篇阅读（段落匹配 36-45）：题干 → 圈关键词 → 扫读原文找**同义替换** → 定位到那一段
 *   2. 仔细阅读 · 主旨题：读**每一段的第一句**，拼出文章在讲什么，再选主旨题答案
 *   3. 仔细阅读 · 细节题：回原文**定位关键词**，答案句几乎总是关键词的**同义替换**
 *
 * 素材全部取自真实题目（2025.06 六级真题第 1 套的长篇阅读、内置示范卷的仔细阅读），
 * 出处写在 source 里；`sourceRef` 指向内置示范卷的具体题号，测试会拿它回查答案，
 * 防止示范内容与题库对不上。
 */

/** 一步示范 */
export interface GuideStep {
  /** 步骤名，如「圈出题干关键词」 */
  title: string
  /** 这一步怎么做（一句话） */
  hint: string
  /** 要展示的原文/题干片段 */
  body?: string
  /** body 里要高亮的片段（必须是 body 的子串，测试会校验） */
  marks?: string[]
  /** 关键词、同义替换等要点 */
  chips?: { label: string; value: string; kind?: 'key' | 'swap' | 'answer' | 'plain' }[]
}

/** 一个完整的示范 */
export interface GuideDemo {
  id: string
  /** 题型：长篇阅读 / 主旨题 / 细节题 */
  kind: 'long' | 'main' | 'detail'
  badge: string
  /** 素材出处 */
  source: string
  /** 题干（英文原文） */
  question: string
  /** 选项；长篇阅读的选项是段落字母，可为空 */
  options?: string[]
  /** 正确答案字母 */
  answer: string
  /** 正确答案的完整表述（用于展开时显示） */
  answerText: string
  /** 逐步示范 */
  steps: GuideStep[]
  /** 给内置示范卷的题做交叉校验：题号 + 期望答案 */
  sourceRef?: { paperTitle: string; orderNo: number; answer: string }
  /** 是否是「自己练」的题（先作答再展开） */
  practice?: boolean
}

/** 三种题型的方法卡 */
export const METHOD_CARDS: { kind: GuideDemo['kind']; title: string; points: string[] }[] = [
  {
    kind: 'long',
    title: '长篇阅读（段落匹配）',
    points: [
      '先读题干，圈出**名词、动词、专有名词**这些不容易被换掉的关键词',
      '带着关键词去扫读原文段落，**找的是同义替换，不是原词**',
      '一个段落可能被选多次，选完把段落划掉不代表它不能再选',
      '时间紧就先做有**数字、大写专名**的题，定位最快',
    ],
  },
  {
    kind: 'main',
    title: '仔细阅读 · 主旨题',
    points: [
      '**只读每一段的第一句**（英文段落把主题句放在段首是常态）',
      '把几句首句连起来，就是这篇文章在讲什么',
      '主旨题的答案要能**覆盖全文**，只符合某一段的是干扰项',
      '含 all / never / must 这类绝对词的选项通常是错的',
    ],
  },
  {
    kind: 'detail',
    title: '仔细阅读 · 细节题',
    points: [
      '拿题干里的关键词（人名、专名、核心动词）**回原文定位**',
      '答案句几乎总是关键词的**同义替换**：boost ↔ increase、too short ↔ lasted less than a year',
      '定位到哪一段，答案就在那一句附近，不要凭印象选',
      '照抄原文原词的选项要警惕，多半是拼凑的干扰项',
    ],
  },
]

/* ------------------------------------------------------------------ */
/* 长篇阅读示范：2025.06 六级真题第 1 套 第 40 题 → 段落 A            */
/* ------------------------------------------------------------------ */

const LIB_PASSAGE = [
  {
    label: 'A',
    text:
      'Librarians know the value of their community services, and their patrons appreciate their importance as well. ' +
      'But in an increasingly digital world, we see the role of libraries as community and cultural centers at times undervalued. ' +
      'When shrinking municipal budgets combine with the nonstop technological revolution, public library services that focus on ' +
      'building communities face-to-face, inspiring and educating patrons about art, literature, and music, and helping patrons ' +
      'engage in civil discourse can seem old-fashioned.',
  },
  {
    label: 'B',
    text:
      'Many people point out the value public libraries bring to their communities. More than just books and banks of computers, ' +
      'libraries are still places where individuals gather to explore, interact, and imagine. Some of the specific ways in which ' +
      'libraries add value to our communities and serve as cultural centers for our patrons are community builders, centers for the ' +
      'arts, and champions of youth.',
  },
  {
    label: 'D',
    text:
      'Place-based economic development stresses the importance of offering attractive, functional, and community-based places, ' +
      'such as libraries, in town squares and depressed neighborhoods. Like a major department store in a mall, libraries attract ' +
      'large numbers of people, creating economic opportunities for numerous businesses and organizations in the surrounding area.',
  },
]

export const LONG_DEMO: GuideDemo = {
  id: 'long-40',
  kind: 'long',
  badge: '长篇阅读',
  source: '2025.06 六级真题第 1 套 · Section B 长篇阅读 · 第 40 题',
  question:
    'With the world more and more digitalized, people sometimes underestimate the role of libraries as community and cultural centers.',
  options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'],
  answer: 'A',
  answerText: 'A 段 —— 「in an increasingly digital world … at times undervalued」正是题干的同义改写。',
  steps: [
    {
      title: '① 圈出题干关键词',
      hint: '先找**不容易被替换**的词：抽象名词、核心动词。形容词和副词最容易被换掉，反而是定位的线索。',
      body:
        'With the world more and more digitalized, people sometimes underestimate the role of libraries as community and cultural centers.',
      marks: ['digitalized', 'underestimate', 'community and cultural centers'],
      chips: [
        { label: '关键词', value: 'digitalized（数字化）', kind: 'key' },
        { label: '关键词', value: 'underestimate（低估）', kind: 'key' },
        { label: '关键词', value: 'community and cultural centers（社区与文化中心）', kind: 'key' },
      ],
    },
    {
      title: '② 扫读原文，找同义替换',
      hint: '**不要找原词**。原文很少照抄题干，`digitalized` 在原文里大概率写成 digital world 之类。',
      body: LIB_PASSAGE[0].text,
      marks: ['in an increasingly digital world', 'community and cultural centers', 'at times undervalued'],
      chips: [
        { label: '题干', value: 'more and more digitalized', kind: 'key' },
        { label: '原文', value: 'in an increasingly digital world', kind: 'swap' },
        { label: '题干', value: 'underestimate', kind: 'key' },
        { label: '原文', value: 'at times undervalued', kind: 'swap' },
        { label: '题干', value: 'the role of libraries as community and cultural centers', kind: 'key' },
        { label: '原文', value: '原词复现 —— 这种是送分的定位锚点', kind: 'swap' },
      ],
    },
    {
      title: '③ 比对替换，确认落点',
      hint: '三处关键词里有两处是同义替换、一处原词复现，且都在同一句 —— 定位成立。',
      chips: [
        { label: 'digitalized', value: '↔ digital world', kind: 'swap' },
        { label: 'underestimate', value: '↔ undervalued', kind: 'swap' },
        { label: 'community and cultural centers', value: '原词复现', kind: 'swap' },
      ],
    },
    {
      title: '④ 得出答案',
      hint: '信息来自 A 段，答案就是 A。',
      chips: [{ label: '答案', value: 'A', kind: 'answer' }],
    },
  ],
}

/* ------------------------------------------------------------------ */
/* 长篇阅读 · 自己练：同一份卷的第 39 题 → 段落 D                      */
/* ------------------------------------------------------------------ */

export const LONG_PRACTICE: GuideDemo = {
  id: 'long-39',
  kind: 'long',
  badge: '长篇阅读 · 你来试',
  source: '2025.06 六级真题第 1 套 · Section B 长篇阅读 · 第 39 题',
  question: 'Libraries draw large crowds, thus creating lots of business opportunities in neighboring areas.',
  options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'],
  answer: 'D',
  answerText: 'D 段 —— 「libraries attract large numbers of people, creating economic opportunities … in the surrounding area」。',
  practice: true,
  steps: [
    {
      title: '圈关键词',
      hint: '先自己圈一遍，再展开核对。',
      body: 'Libraries draw large crowds, thus creating lots of business opportunities in neighboring areas.',
      marks: ['draw large crowds', 'business opportunities', 'neighboring areas'],
      chips: [
        { label: '关键词', value: 'draw large crowds（吸引大量人流）', kind: 'key' },
        { label: '关键词', value: 'business opportunities（商业机会）', kind: 'key' },
        { label: '关键词', value: 'neighboring areas（周边地区）', kind: 'key' },
      ],
    },
    {
      title: '定位到的原文',
      hint: '三处关键词**全部**被换掉了，这就是段落匹配题的常规难度。',
      body: LIB_PASSAGE[2].text,
      marks: [
        'libraries attract large numbers of people',
        'creating economic opportunities',
        'in the surrounding area',
      ],
      chips: [
        { label: 'draw large crowds', value: '↔ attract large numbers of people', kind: 'swap' },
        { label: 'business opportunities', value: '↔ economic opportunities', kind: 'swap' },
        { label: 'neighboring areas', value: '↔ the surrounding area', kind: 'swap' },
      ],
    },
    {
      title: '答案',
      hint: '信息来自 D 段。',
      chips: [{ label: '答案', value: 'D', kind: 'answer' }],
    },
  ],
}

/* ------------------------------------------------------------------ */
/* 仔细阅读：内置示范卷 2023年6月六级 第1套 Passage One（四天工作制）  */
/* ------------------------------------------------------------------ */

const FOUR_DAY_P1 =
  'Some economists argue that a four-day work week would boost productivity rather than reduce it. ' +
  'Their claim rests on a simple observation: output per hour tends to fall sharply after about 35 hours of work, ' +
  'while fatigue, errors and sick leave rise. In trials conducted in several countries, companies that cut working ' +
  'hours to 32 without cutting pay reported unchanged or even increased output.'

const FOUR_DAY_P2 =
  'Sceptics counter that such results depend heavily on the industry. In jobs where output is hard to measure — ' +
  'research, design or management — fewer hours may simply mean less done. They also point out that most trials ' +
  'lasted less than a year, so the long-term effects remain unclear. What both sides agree on, however, is that the ' +
  'debate is no longer about whether flexible work is possible, but about how to organise it.'

export const MAIN_IDEA_DEMO: GuideDemo = {
  id: 'main-31',
  kind: 'main',
  badge: '仔细阅读 · 主旨题',
  source: '内置示范卷 · 2023年6月六级真题第 1 套 · Passage One · 第 31 题',
  question: 'What is the argument for a four-day work week?',
  options: [
    'A) It allows companies to cut salaries.',
    'B) It may increase rather than lower productivity.',
    'C) It guarantees employees better health.',
    'D) It is required by new labour laws.',
  ],
  answer: 'B',
  answerText: 'B —— boost productivity rather than reduce it 的直接改写（boost ↔ increase、reduce ↔ lower）。',
  sourceRef: { paperTitle: '2023年6月大学英语六级考试真题（第1套）', orderNo: 31, answer: 'B' },
  steps: [
    {
      title: '① 只读每段的第一句',
      hint: '先别通读。英文段落把主题句放在段首是常态，两句首句读下来，文章讲什么就清楚了。',
      body: FOUR_DAY_P1,
      marks: ['Some economists argue that a four-day work week would boost productivity rather than reduce it.'],
      chips: [{ label: '第 1 段首句', value: '正方：四天工作制会「提高」生产率', kind: 'key' }],
    },
    {
      title: '② 第 2 段首句是转折',
      hint: '看到 Sceptics / However / But 就要警觉：这是反方观点，主旨题经常在这里设干扰项。',
      body: FOUR_DAY_P2,
      marks: ['Sceptics counter that such results depend heavily on the industry.'],
      chips: [
        { label: '第 1 段首句', value: '正方：能提高生产率', kind: 'key' },
        { label: '第 2 段首句', value: '反方：效果取决于行业', kind: 'key' },
        { label: '归纳', value: '全文讲的是「四天工作制能否提高效率」的正反争论', kind: 'swap' },
      ],
    },
    {
      title: '③ 排除干扰项',
      hint: '主旨题的答案必须能**覆盖全文**；只符合某一段、或者出现 all / must / guarantees 这种绝对词的，一律排除。',
      chips: [
        { label: 'A', value: 'cut salaries —— 原文是 without cutting pay，与原文相反 ✗', kind: 'plain' },
        { label: 'C', value: 'guarantees better health —— 绝对化，原文没保证过 ✗', kind: 'plain' },
        { label: 'D', value: 'required by new labour laws —— 全文没提法律 ✗', kind: 'plain' },
        { label: 'B', value: 'increase rather than lower productivity —— 就是正文论点 ✓', kind: 'plain' },
        { label: '答案', value: 'B', kind: 'answer' },
      ],
    },
  ],
}

export const DETAIL_DEMO: GuideDemo = {
  id: 'detail-32',
  kind: 'detail',
  badge: '仔细阅读 · 细节题',
  source: '内置示范卷 · 2023年6月六级真题第 1 套 · Passage One · 第 32 题',
  question: 'What do sceptics say about the trials?',
  options: [
    'A) They were too short to show long-term effects.',
    'B) They proved the policy works in every industry.',
    'C) They were poorly designed and biased.',
    'D) They should be repeated in larger companies.',
  ],
  answer: 'A',
  answerText: 'A —— too short ↔ lasted less than a year，long-term effects 原词复现。',
  sourceRef: { paperTitle: '2023年6月大学英语六级考试真题（第1套）', orderNo: 32, answer: 'A' },
  steps: [
    {
      title: '① 从题干里拿定位词',
      hint: '这题问的是 **sceptics（怀疑者）** 的观点，所以先定位到写反方的那一段 —— 上一题已经确认是第 2 段。',
      body: 'What do sceptics say about the trials?',
      marks: ['sceptics', 'trials'],
      chips: [
        { label: '定位词', value: 'sceptics → 第 2 段（反方观点所在段）', kind: 'key' },
        { label: '定位词', value: 'trials → 段内找 trials 这个词', kind: 'key' },
      ],
    },
    {
      title: '② 回原文定位答案句',
      hint: '在第 2 段里找 trials，答案就在那句话上。',
      body: FOUR_DAY_P2,
      marks: ['most trials lasted less than a year, so the long-term effects remain unclear'],
      chips: [
        { label: '答案句', value: 'most trials lasted less than a year, so the long-term effects remain unclear', kind: 'swap' },
      ],
    },
    {
      title: '③ 比对同义替换',
      hint: '**细节题考的就是这一下**：正确选项不会照抄原文，而是把原文换个说法。',
      chips: [
        { label: '选项 A', value: 'too short', kind: 'key' },
        { label: '原文', value: 'lasted less than a year（不到一年 = 太短）', kind: 'swap' },
        { label: '选项 A', value: 'long-term effects', kind: 'key' },
        { label: '原文', value: 'the long-term effects remain unclear（原词复现）', kind: 'swap' },
      ],
    },
    {
      title: '④ 排除干扰项',
      hint: '细节题的干扰项常用「原文有的词 + 原文没有的关系」拼出来，注意逻辑不要被带走。',
      chips: [
        { label: 'B', value: 'works in every industry —— every 绝对化，原文说 depend heavily on the industry ✗', kind: 'plain' },
        { label: 'C', value: 'poorly designed and biased —— 原文没这么说 ✗', kind: 'plain' },
        { label: 'D', value: 'repeated in larger companies —— 原文没提 ✗', kind: 'plain' },
        { label: 'A', value: 'too short to show long-term effects ✓', kind: 'plain' },
        { label: '答案', value: 'A', kind: 'answer' },
      ],
    },
  ],
}

/**
 * 每种题型的**讲解步骤骨架**。
 *
 * 与上面三个示范（LONG_DEMO / MAIN_IDEA_DEMO / DETAIL_DEMO）一一对应：
 * 示范是怎么一步步走的，AI 批改时就必须怎么讲 —— 不能三种题型都套细节题那一套。
 *
 * 之前把三种方法并列写进提示词，模型会偷懒一律按细节题讲（问什么都是「找定位词」），
 * 所以这里把步骤序列**定死**，并要求先判题型再按对应序列展开。
 */
export const STEP_TEMPLATES: Record<'long' | 'main' | 'detail', string[]> = {
  long: ['圈出题干关键词', '扫读原文找同义替换', '定位到段落', '确认答案'],
  main: ['只读每段第一句', '归纳全文在讲什么', '排除只覆盖某一段的干扰项', '确认答案'],
  detail: ['从题干里拿定位词', '回原文定位答案句', '比对同义替换', '排除干扰项', '确认答案'],
}

/** 题型的中文名 */
export const TYPE_LABEL: Record<'long' | 'main' | 'detail', string> = {
  long: '匹配题',
  main: '主旨题',
  detail: '细节题',
}

/** 页面按顺序展示的示范 */
export const GUIDES: GuideDemo[] = [LONG_DEMO, LONG_PRACTICE, MAIN_IDEA_DEMO, DETAIL_DEMO]

/** 把一段文本按要标记的片段切成 [{text, mark}] */
export interface MarkedPiece {
  text: string
  mark: boolean
}/**
 * 按 marks 把 body 切成「普通片段 / 高亮片段」。
 *
 * 用于在示范里把关键词、答案句标出来 —— 只给片段就够，不需要引入富文本渲染。
 * 多个 mark 互相包含时合并成一段，避免切出嵌套结构。
 */
export function splitMarks(body: string, marks: string[] = []): MarkedPiece[] {
  const hits: { start: number; end: number }[] = []
  for (const m of marks) {
    if (!m) continue
    let from = 0
    for (;;) {
      const i = body.indexOf(m, from)
      if (i < 0) break
      hits.push({ start: i, end: i + m.length })
      from = i + m.length
    }
  }
  if (!hits.length) return body ? [{ text: body, mark: false }] : []

  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: { start: number; end: number }[] = []
  for (const h of hits) {
    const last = merged[merged.length - 1]
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end)
    else merged.push({ ...h })
  }

  const out: MarkedPiece[] = []
  let pos = 0
  for (const h of merged) {
    if (h.start > pos) out.push({ text: body.slice(pos, h.start), mark: false })
    out.push({ text: body.slice(h.start, h.end), mark: true })
    pos = h.end
  }
  if (pos < body.length) out.push({ text: body.slice(pos), mark: false })
  return out
}

/** 行内加粗：实现在 utils/inlineMarkup.ts，这里转出以保持原有导入路径可用 */
export { splitBold, type BoldPiece } from './inlineMarkup'
