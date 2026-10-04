/** 备考等级 */
export type Level = 'CET4' | 'CET6'

/** 单词学习状态 */
export type WordStatus = 'NEW' | 'LEARNING' | 'KNOWN'

/** 真题模块类型 */
export type SectionType = 'writing' | 'listening' | 'cloze' | 'reading' | 'translation'

/* ---------------------------------- 单词 ---------------------------------- */

export interface Word {
  id: string
  level: Level
  word: string
  phonetic: string
  pos: string
  meaning: string
  exampleEn: string
  exampleZh: string
  source: string
  freqRank: number
}

export interface WordVo extends Word {
  status: WordStatus
  familiarity: number
  inNotebook: number
  nextReviewAt?: string | null
  reviewCount: number
  lapseCount: number
  /** new 新学 / review 复习 */
  mode: 'new' | 'review'
}

export interface TodayQueue {
  level: Level
  date: string
  goal: number
  reviewGoal: number
  learnedToday: number
  reviewedToday: number
  newWords: WordVo[]
  reviewWords: WordVo[]
}

/* ---------------------------------- 用户 ---------------------------------- */

export interface UserProfile {
  id: number
  nickname: string
  currentLevel: Level
  dailyGoal: number
  reviewGoal: number
}

/* ---------------------------------- 打卡 ---------------------------------- */

export interface CheckinRecord {
  id: number
  date: string
  learnCount: number
  reviewCount: number
  targetCount: number
  done: boolean
}

export interface StreakInfo {
  current: number
  longest: number
  totalDays: number
  dates: string[]
}

/* ---------------------------------- 翻译 ---------------------------------- */

export interface CoreWord {
  en: string
  zh: string
}

export interface TranslationQuestion {
  id: string
  level: Level
  type: 'sentence' | 'paragraph'
  difficulty: number
  source: string
  /** 分类（文化类 / 科技类 / 基础句型专项 …），由 tools/classify-translations.mjs 在构建期落盘 */
  category?: string
  prompt: string
  reference: string
  tips: string
  coreWords: CoreWord[]
  grammarPoints: string[]
}

/**
 * 翻译常用词汇（来自用户的《翻译常用词汇》笔记，整理成词条）。
 *
 * 与题库相互独立：只有词、没有配套句子题，所以不出现在 TranslationQuestion 里。
 */
export interface VocabWord {
  /** 分组（运河与水利 / 茶 / 节日与文化象征 …） */
  group: string
  /** 中文 */
  zh: string
  /** 英文表达 */
  en: string
  /** 用法提醒 / 易错点 */
  note?: string
}

/** 核心词拼写近似命中 */
export interface NearMiss {
  expected: string
  found: string
  distance: number
}

/** 评分构成明细 */
export interface ScoreBreakdown {
  /** 核心词得分（满分 55） */
  coreScore: number
  /** 篇幅贴合得分（满分 30） */
  lengthScore: number
  /** 语言规范得分（满分 15） */
  languageScore: number
  coreRate: number
  lengthFit: number
  /** 冗余度 0-1 */
  redundancy: number
  /** 语言规范预警 */
  languageIssues: string[]
  /** 疑似拼写错误 */
  spellingIssues: string[]
  /** 高频重复词（word×3） */
  repeatedWords: string[]
}

export interface TranslationResult {
  questionId: string
  /** 机器分（本地启发式） */
  score: number
  answer: string
  question: TranslationQuestion
  hitWords: string[]
  /** 词都在但位置跨度过大（语序/搭配存疑） */
  reorderWords?: string[]
  nearWords?: NearMiss[]
  missWords: string[]
  wrong: boolean
  comment: string
  breakdown?: ScoreBreakdown
  /** 作答记录 id，用于回填 AI 复核结果 */
  attemptId?: number
  /* ---------- LLM 二次润色评分 ---------- */
  llmScore?: number
  /** 综合分 = 机器分 40% + 语义分 60% */
  finalScore?: number
  llmComment?: string
  polish?: string
  llmIssues?: string[]
}

/** LLM 精批结果（浏览器直连模型后得到） */
export interface LlmReview {
  score: number
  issues: string[]
  polish: string
  comment: string
}

/** 「AI 讲解」里的一个重难点词汇 */
export interface ExplainWord {
  /** 原文里的中文词/短语 */
  zh: string
  /** 推荐英文表达 */
  en: string
  /** 词性，如 n. / v. / adj. */
  pos: string
  /** 音标 */
  phonetic: string
  /** 中文释义 */
  meaning: string
  /** 常见搭配、易错点、可替换表达 */
  usage: string
}

/** 「AI 讲解」里句子结构的一个成分 */
export interface ExplainPart {
  /** 句子成分：主语 / 谓语 / 宾语 / 状语 / 定语从句 … */
  role: string
  /** 对应的英文片段 */
  text: string
  /** 为什么这么处理 */
  note: string
}

/** 「AI 讲解」的句子结构拆解 */
export interface ExplainStructure {
  /** 英文主干（主谓宾） */
  main: string
  /** 句型套路，如「with 复合结构」「被动语态」 */
  pattern: string
  /** 逐成分拆解 */
  parts: ExplainPart[]
  /** 40 字内概括翻译思路 */
  summary: string
}

/** 「AI 讲解」结果：重难点词汇 + 句子结构拆解 */
export interface LlmExplain {
  vocab: ExplainWord[]
  structure: ExplainStructure
  /** 翻译注意点 */
  tips: string[]
}

export interface TranslationAttempt {
  id: number
  questionId: string
  answer: string
  score: number
  hitWords: string[]
  missWords: string[]
  isWrong: boolean
  createTime: string
  llmScore?: number
  finalScore?: number
  llmComment?: string
  polish?: string
  llmIssues?: string[]
}

/* ---------------------------------- 真题 ---------------------------------- */

export interface PaperQuestion {
  id: number
  paperId: number
  sectionId: number
  orderNo: number
  stem: string
  options: string[]
  answer: string
  analysis: string
  userAnswer: string
  done: boolean
  favorite: boolean
  /** 本地模式下的临时键 */
  _key?: string
}

export interface PaperSection {
  id: number
  type: SectionType
  title: string
  passage: string
  orderNo: number
  questions: PaperQuestion[]
}

export interface Paper {
  id: number
  userId: number
  title: string
  level: Level
  yearMonth: string
  source: string
  rawText: string
  totalCount: number
  doneCount: number
}

export interface PaperDetail extends Paper {
  sectionList: PaperSection[]
}

/* ---------------------------------- 错题本 ---------------------------------- */

export type ErrorSourceType = 'WORD' | 'TRANSLATION' | 'PAPER'

export interface ErrorItem {
  id: number
  sourceType: ErrorSourceType
  sourceId: string
  title: string
  content: string
  userAnswer: string
  rightAnswer: string
  note: string
  resolved: boolean
  createTime: string
}

/* ---------------------------------- 统计 ---------------------------------- */

export interface Stats {
  level: Level
  learnedTotal: number
  reviewTotal: number
  knownTotal: number
  notebookTotal: number
  dueTotal: number
  wordTotal: number
  streak: number
  longestStreak: number
  checkinDays: number
  todayDone: boolean
  learnedToday: number
  reviewedToday: number
  dailyGoal: number
  translationCount: number
  translationAvgScore: number
  paperCount: number
  paperDoneCount: number
  paperTotalCount: number
  errorCount: number
}

/* ---------------------------------- AI ---------------------------------- */

export interface AiConfig {
  /** OpenAI 兼容接口地址，如 https://api.openai.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** AI 问答上下文：把当前单词 / 句子 / 题目带进提问 */
export interface AiContext {
  kind?: 'word' | 'translation' | 'paper' | 'general'
  title?: string
  content?: string
  extra?: string
}
