/**
 * 本地模式数据层
 *
 * 与后端 API 保持完全一致的方法签名：后端可用时走 http，后端未启动时走这里，
 * 数据持久化在 localStorage，行为与线上一致（含遗忘曲线、打卡、评分、进度）。
 */
import type {
  CheckinRecord,
  ErrorItem,
  ErrorSourceType,
  Level,
  Paper,
  PaperDetail,
  PaperQuestion,
  PaperSection,
  Stats,
  StreakInfo,
  TodayQueue,
  TranslationAttempt,
  TranslationQuestion,
  TranslationResult,
  UserProfile,
  VocabWord,
  Word,
  WordVo,
} from '@/types'
import { readLocal, writeLocal } from '@/utils/storage'
import { addDays, toDateString, todayStart } from '@/utils/date'
import { grade, W_CORE, W_LENGTH, W_LANGUAGE, type GradeResult } from '@/utils/grade'
import { answerKey, optionLetter } from '@/utils/paperDisplay'

/* ---------------------------------- 本地库结构 ---------------------------------- */

interface WordProgressRec {
  status: 'NEW' | 'LEARNING' | 'KNOWN'
  stage: number
  familiarity: number
  reviewCount: number
  lapseCount: number
  inNotebook: number
  nextReviewAt: string | null
  lastReviewAt: string | null
}

interface CheckinRec {
  learnCount: number
  reviewCount: number
  targetCount: number
  done: number
}

interface Db {
  user: UserProfile
  progress: Record<string, WordProgressRec>
  checkins: Record<string, CheckinRec>
  attempts: TranslationAttempt[]
  papers: PaperDetail[]
  errors: ErrorItem[]
  seq: { paper: number; section: number; question: number; attempt: number; error: number }
  /** 数据结构版本，用于一次性迁移（见 migrate） */
  schemaVersion?: number
}

const DB_KEY = 'db.v1'

/** 遗忘曲线间隔（天），与后端 WordService.INTERVAL_DAYS 保持一致 */
const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30, 60]
const MAX_STAGE = INTERVAL_DAYS.length - 1
const KNOWN_STAGE = 5
const WRONG_SCORE = 70

/** 当前数据结构版本。v1 → v2：复习改按「天」调度 */
const SCHEMA_VERSION = 2

/**
 * 下一次复习时间：**按「天」调度**，落在目标日期的 00:00。
 *
 * 这里**不能**用「当前时刻 + N 天」。那样的话昨晚 22:00 背的词会算成今晚 22:00 才到期，
 * 第二天白天打开应用复习队列是空的，看起来就像昨天的数据没存上。
 * 记忆曲线的间隔本来就是按天算的，落到当天 00:00 才符合直觉。
 */
function nextReviewDate(daysFromToday: number): string {
  return addDays(todayStart(), daysFromToday).toISOString()
}

/**
 * 一次性数据迁移。
 *
 * v1 把 nextReviewAt 存成「上次复习时刻 + N 天」，跨天后当天白天不显示复习任务。
 * 这里把所有历史值抹到所在日期的 00:00，改回按天调度，用户升级后立刻能看到昨天的词。
 */
function migrate(db: Db): Db {
  if ((db.schemaVersion ?? 1) >= SCHEMA_VERSION) return db
  let touched = 0
  for (const p of Object.values(db.progress)) {
    if (!p.nextReviewAt) continue
    const d = new Date(p.nextReviewAt)
    if (Number.isNaN(d.getTime())) continue
    d.setHours(0, 0, 0, 0)
    p.nextReviewAt = d.toISOString()
    touched++
  }
  db.schemaVersion = SCHEMA_VERSION
  console.log(`[migrate] 复习调度 v1 → v2：已把 ${touched} 条记录的到期时间对齐到当天 00:00`)
  return db
}

function defaultDb(): Db {
  return {
    user: {
      id: 1,
      nickname: 'CET 考生',
      currentLevel: 'CET4',
      dailyGoal: 20,
      reviewGoal: 40,
    },
    progress: {},
    checkins: {},
    attempts: [],
    papers: [],
    errors: [],
    seq: { paper: 1, section: 1, question: 1, attempt: 1, error: 1 },
  }
}

function load(): Db {
  const db = readLocal<Db>(DB_KEY, defaultDb())
  // 兼容旧版本缺字段
  const merged = { ...defaultDb(), ...db, seq: { ...defaultDb().seq, ...(db.seq ?? {}) } }
  const before = merged.schemaVersion ?? 1
  migrate(merged)
  // 迁移结果落盘，后续启动就不必反复扫一遍
  if ((merged.schemaVersion ?? 1) !== before) save(merged)
  return merged
}

function save(db: Db): void {
  writeLocal(DB_KEY, db)
}

function update<T>(fn: (db: Db) => T): T {
  const db = load()
  const r = fn(db)
  save(db)
  return r
}

const seqNext = (db: Db, key: keyof Db['seq']) => db.seq[key]++

/* ---------------------------------- 词库加载 ---------------------------------- */

const wordCache: Partial<Record<Level, Word[]>> = {}

async function loadWords(level: Level): Promise<Word[]> {
  if (wordCache[level]) return wordCache[level] as Word[]
  const res = await fetch(`/data/words-${level.toLowerCase()}.json`)
  if (!res.ok) throw new Error('词库加载失败：' + level)
  const list = (await res.json()) as Word[]
  wordCache[level] = list
  return list
}

/** 生词本 / 按 ID 查词可能跨等级，先确保两套词库都已加载 */
async function ensureAllWords(): Promise<void> {
  await Promise.all([loadWords('CET4'), loadWords('CET6')])
}

async function loadTranslations(): Promise<TranslationQuestion[]> {
  const res = await fetch('/data/translations.json')
  if (!res.ok) throw new Error('翻译题库加载失败')
  return (await res.json()) as TranslationQuestion[]
}

let vocabCache: VocabWord[] | null = null

/**
 * 翻译常用词汇表（来自用户的《翻译常用词汇》Word 笔记，已整理成词条）。
 * 与题库相互独立：它只有词、没有配套句子题。
 */
async function loadTranslationVocab(): Promise<VocabWord[]> {
  if (vocabCache) return vocabCache
  const res = await fetch('/data/translation-vocab.json')
  if (!res.ok) throw new Error('翻译常用词汇表加载失败')
  vocabCache = (await res.json()) as VocabWord[]
  return vocabCache
}

async function loadPresetPapers(): Promise<PaperDetail[]> {
  const res = await fetch('/data/papers.json')
  if (!res.ok) throw new Error('示范卷加载失败')
  const raw = (await res.json()) as Array<{
    id: string
    title: string
    level: Level
    yearMonth: string
    source: string
    sections: Array<{
      id: string
      type: PaperDetail['sectionList'][number]['type']
      title: string
      passage: string
      orderNo: number
      questions: Array<{
        id: string
        orderNo: number
        stem: string
        options: string[]
        answer: string
        analysis: string
      }>
    }>
  }>

  return raw.map((p, pi) => ({
    id: 9000 + pi,
    userId: 0,
    title: p.title,
    level: p.level,
    yearMonth: p.yearMonth,
    source: p.source,
    rawText: '',
    totalCount: p.sections.reduce((s, x) => s + x.questions.length, 0),
    doneCount: 0,
    sectionList: p.sections.map((s, si) => ({
      id: 900000 + pi * 100 + si,
      type: s.type,
      title: s.title,
      passage: s.passage,
      orderNo: s.orderNo,
      questions: s.questions.map((q, qi) => ({
        id: 90000000 + pi * 10000 + si * 1000 + qi,
        paperId: 9000 + pi,
        sectionId: 900000 + pi * 100 + si,
        orderNo: q.orderNo,
        stem: q.stem,
        options: q.options ?? [],
        answer: q.answer,
        analysis: q.analysis,
        userAnswer: '',
        done: false,
        favorite: false,
      })),
    })),
  }))
}

/* ---------------------------------- 工具 ---------------------------------- */

function toVo(w: Word, p: WordProgressRec | undefined, mode: 'new' | 'review'): WordVo {
  return {
    ...w,
    status: p?.status ?? 'NEW',
    familiarity: p?.familiarity ?? 0,
    inNotebook: p?.inNotebook ?? 0,
    nextReviewAt: p?.nextReviewAt ?? null,
    reviewCount: p?.reviewCount ?? 0,
    lapseCount: p?.lapseCount ?? 0,
    mode,
  }
}

function today(db: Db): CheckinRec {
  const key = toDateString()
  if (!db.checkins[key]) {
    db.checkins[key] = {
      learnCount: 0,
      reviewCount: 0,
      targetCount: db.user.dailyGoal,
      done: 0,
    }
  }
  return db.checkins[key]
}

function addCheckin(db: Db, learnDelta: number, reviewDelta: number) {
  const c = today(db)
  c.learnCount += learnDelta
  c.reviewCount += reviewDelta
  c.targetCount = db.user.dailyGoal
  c.done = c.learnCount >= c.targetCount ? 1 : 0
}

/**
 * 真题错题本联动。
 *
 * 只有**卷面附了答案键**才能判对错 —— 真题 PDF 普遍不附答案（答案另出一册），
 * 没有答案键时不猜、不收录，否则会把答对的题也记成错题。
 * 答对时把该题的错题记录移出，和翻译题「复核达标自动移出」保持一致；
 * 重做本题清空作答时也一并移出，避免留下已经答对的错题。
 */
function syncPaperError(db: Db, paper: PaperDetail, section: PaperSection, q: PaperQuestion): void {
  const key = answerKey(q)
  const mine = (q.userAnswer ?? '').trim().toUpperCase()
  const exist = db.errors.find((e) => e.sourceType === 'PAPER' && e.sourceId === String(q.id))

  if (!mine) {
    // 重做本题：清空作答就把记录撤掉
    if (exist) db.errors = db.errors.filter((e) => e.id !== exist.id)
    return
  }
  if (!key) return // 没答案键，无从判断，不猜
  if (mine === key) {
    if (exist) db.errors = db.errors.filter((e) => e.id !== exist.id)
    return
  }

  const rightAnswer = (q.options ?? []).find((o) => optionLetter(o) === key) ?? key
  const note = `答错：你选了 ${mine}，正确答案是 ${key}`
  if (exist) {
    exist.userAnswer = mine
    exist.rightAnswer = rightAnswer
    exist.note = note
    exist.resolved = false
  } else {
    db.errors.push({
      id: seqNext(db, 'error'),
      sourceType: 'PAPER',
      sourceId: String(q.id),
      title: `${paper.title} · ${section.title} · 第 ${q.orderNo} 题`,
      content: q.stem || '（本题无题干，听力题干在音频中）',
      userAnswer: mine,
      rightAnswer,
      note,
      resolved: false,
      createTime: new Date().toISOString(),
    })
  }
}

/**
 * 单词错题本联动。
 *
 * 点「不认识」= 答错 → 收录。注意错题本和生词本**用途不同**，同一个词可能两边都有：
 *   生词本 = 「要反复看的词」（认识/模糊/不认识都会进）
 *   错题本 = 「我做错过的记录」（只有答错才进，且带答错次数）
 * 熟练度到 3（与移出生词本同一条件）后自动移出。
 */
function syncWordError(db: Db, word: Word, p: WordProgressRec, result: string): void {
  const exist = db.errors.find((e) => e.sourceType === 'WORD' && e.sourceId === word.id)
  const rightAnswer = `${word.pos} ${word.meaning}`.trim()

  if (result === 'UNKNOWN') {
    const note = `答错 ${p.lapseCount} 次；当前熟练度 ${p.familiarity}/5`
    if (exist) {
      exist.userAnswer = '不认识'
      exist.rightAnswer = rightAnswer
      exist.note = note
      exist.resolved = false
    } else {
      db.errors.push({
        id: seqNext(db, 'error'),
        sourceType: 'WORD',
        sourceId: word.id,
        title: word.word,
        content: `${word.phonetic} ${word.pos} ${word.meaning}`.trim(),
        userAnswer: '不认识',
        rightAnswer,
        note,
        resolved: false,
        createTime: new Date().toISOString(),
      })
    }
    return
  }

  // 练到掌握就撤掉这条错题
  if (p.familiarity >= 3 && exist) {
    db.errors = db.errors.filter((e) => e.id !== exist.id)
  }
}

/* ---------------------------------- 用户 ---------------------------------- */

export const mockApi = {
  /* ---------------- 用户 ---------------- */
  async getUser(): Promise<UserProfile> {
    return load().user
  },

  async updateUser(body: Partial<UserProfile>): Promise<UserProfile> {
    return update((db) => {
      db.user = { ...db.user, ...body }
      return db.user
    })
  },

  /* ---------------- 单词 ---------------- */
  async listWords(level: Level, keyword?: string, status?: string): Promise<WordVo[]> {
    const db = load()
    const words = await loadWords(level)
    const kw = (keyword ?? '').trim().toLowerCase()
    return words
      .filter((w) => !kw || w.word.toLowerCase().includes(kw) || w.meaning.includes(kw))
      .filter((w) => {
        if (!status || status === 'ALL') return true
        const p = db.progress[w.id]
        if (status === 'NOTEBOOK') return !!p && p.inNotebook === 1
        return (p?.status ?? 'NEW') === status
      })
      .map((w) => toVo(w, db.progress[w.id], 'new'))
  },

  async todayQueue(level: Level): Promise<TodayQueue> {
    const db = load()
    const words = await loadWords(level)
    const c = today(db)
    const newNeed = Math.max(0, db.user.dailyGoal - c.learnCount)
    const reviewNeed = Math.max(0, db.user.reviewGoal - c.reviewCount)
    const now = new Date()

    const newWords = words
      .filter((w) => !db.progress[w.id])
      .slice(0, newNeed)
      .map((w) => toVo(w, undefined, 'new'))

    const reviewWords = words
      .filter((w) => {
        const p = db.progress[w.id]
        return p && p.status !== 'KNOWN' && p.nextReviewAt && new Date(p.nextReviewAt) <= now
      })
      .sort((a, b) => {
        const pa = db.progress[a.id].nextReviewAt ?? ''
        const pb = db.progress[b.id].nextReviewAt ?? ''
        return pa < pb ? -1 : 1
      })
      .slice(0, reviewNeed)
      .map((w) => toVo(w, db.progress[w.id], 'review'))

    return {
      level,
      date: toDateString(),
      goal: db.user.dailyGoal,
      reviewGoal: db.user.reviewGoal,
      learnedToday: c.learnCount,
      reviewedToday: c.reviewCount,
      newWords,
      reviewWords,
    }
  },

  async submitWord(payload: {
    wordId: string
    result: 'KNOWN' | 'FUZZY' | 'UNKNOWN'
    mode?: string
    inNotebook?: number
  }): Promise<WordVo> {
    await ensureAllWords()
    return update((db) => {
      const all = [...(wordCache.CET4 ?? []), ...(wordCache.CET6 ?? [])]
      const word = all.find((w) => w.id === payload.wordId)
      if (!word) throw new Error('单词不存在：' + payload.wordId)

      const existed = db.progress[payload.wordId]
      const isNew = !existed
      const p: WordProgressRec = existed ?? {
        status: 'NEW',
        stage: 0,
        familiarity: 0,
        reviewCount: 0,
        lapseCount: 0,
        inNotebook: 0,
        nextReviewAt: null,
        lastReviewAt: null,
      }

      const now = new Date()
      switch (payload.result) {
        case 'KNOWN':
          p.stage = Math.min(MAX_STAGE, p.stage + 1)
          p.familiarity = Math.min(5, p.familiarity + 1)
          // 按天调度：stage 1 → 明天 00:00 到期，第二天早上打开就能复习到
          p.nextReviewAt = nextReviewDate(INTERVAL_DAYS[p.stage])
          if (p.familiarity >= 3) p.inNotebook = 0
          break
        case 'FUZZY':
          // 模糊 → 明天再练一遍（同样按天，避免跨天看不到）
          p.nextReviewAt = nextReviewDate(1)
          p.inNotebook = 1
          break
        case 'UNKNOWN':
          p.stage = Math.max(0, p.stage - 2)
          p.familiarity = Math.max(0, p.familiarity - 1)
          p.lapseCount += 1
          p.inNotebook = 1
          // 不认识 → 本次会话内尽快重现
          p.nextReviewAt = new Date(now.getTime() + 5 * 60000).toISOString()
          break
      }
      p.status = p.stage >= KNOWN_STAGE ? 'KNOWN' : 'LEARNING'
      p.reviewCount += 1
      p.lastReviewAt = now.toISOString()
      db.progress[payload.wordId] = p

      // 错题本联动：点「不认识」收录，练到掌握后自动移出
      syncWordError(db, word, p, payload.result)

      if (payload.mode === 'review' && !isNew) addCheckin(db, 0, 1)
      else addCheckin(db, 1, 0)

      return toVo(word, p, payload.mode === 'review' ? 'review' : 'new')
    })
  },

  async toggleNotebook(wordId: string, flag: number): Promise<WordVo> {
    await ensureAllWords()
    return update((db) => {
      const all = [...(wordCache.CET4 ?? []), ...(wordCache.CET6 ?? [])]
      const word = all.find((w) => w.id === wordId)
      if (!word) throw new Error('单词不存在')
      const p: WordProgressRec = db.progress[wordId] ?? {
        status: 'LEARNING',
        stage: 0,
        familiarity: 0,
        reviewCount: 0,
        lapseCount: 0,
        inNotebook: 0,
        nextReviewAt: null,
        lastReviewAt: null,
      }
      p.inNotebook = flag === 1 ? 1 : 0
      if (flag === 1) {
        p.status = 'LEARNING'
        p.nextReviewAt = nextReviewDate(1)
      }
      db.progress[wordId] = p
      return toVo(word, p, 'review')
    })
  },

  async notebook(): Promise<WordVo[]> {
    await ensureAllWords()
    const db = load()
    const all = [...(wordCache.CET4 ?? []), ...(wordCache.CET6 ?? [])]
    return all
      .filter((w) => db.progress[w.id]?.inNotebook === 1)
      .map((w) => toVo(w, db.progress[w.id], 'review'))
  },

  async wordsByStatus(level: Level, status: string): Promise<WordVo[]> {
    const db = load()
    const words = await loadWords(level)
    return words
      .filter((w) => (db.progress[w.id]?.status ?? 'NEW') === status)
      .map((w) => toVo(w, db.progress[w.id], 'review'))
  },

  async resetWords(level: Level): Promise<number> {
    return update((db) => {
      const words = wordCache[level] ?? []
      let n = 0
      for (const w of words) {
        if (db.progress[w.id]) {
          delete db.progress[w.id]
          n++
        }
      }
      return n
    })
  },

  async dueCount(level: Level): Promise<number> {
    const db = load()
    const words = await loadWords(level)
    const now = new Date()
    return words.filter((w) => {
      const p = db.progress[w.id]
      return p && p.status !== 'KNOWN' && p.nextReviewAt && new Date(p.nextReviewAt) <= now
    }).length
  },

  /* ---------------- 打卡 ---------------- */
  async todayCheckin(): Promise<CheckinRecord> {
    const db = load()
    const c = today(db)
    return {
      id: 0,
      date: toDateString(),
      learnCount: c.learnCount,
      reviewCount: c.reviewCount,
      targetCount: c.targetCount,
      done: c.done === 1,
    }
  },

  async streak(): Promise<StreakInfo> {
    const db = load()
    const dates = Object.entries(db.checkins)
      .filter(([, v]) => v.done === 1)
      .map(([k]) => k)
      .sort()
      .reverse()

    let current = 0
    let cursor = todayStart()
    if (!dates.includes(toDateString(cursor))) cursor = addDays(cursor, -1)
    while (dates.includes(toDateString(cursor))) {
      current++
      cursor = addDays(cursor, -1)
    }

    let longest = 0
    let run = 0
    let prev: Date | null = null
    for (const d of [...dates].reverse()) {
      const cur = new Date(d + 'T00:00:00')
      if (prev && Math.round((cur.getTime() - prev.getTime()) / 86400000) === 1) run++
      else run = 1
      longest = Math.max(longest, run)
      prev = cur
    }

    return { current, longest, totalDays: dates.length, dates }
  },

  async checkinList(days = 30): Promise<CheckinRecord[]> {
    const db = load()
    const out: CheckinRecord[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(todayStart(), -i)
      const key = toDateString(d)
      const c = db.checkins[key]
      out.push({
        id: 0,
        date: key,
        learnCount: c?.learnCount ?? 0,
        reviewCount: c?.reviewCount ?? 0,
        targetCount: c?.targetCount ?? db.user.dailyGoal,
        done: c?.done === 1,
      })
    }
    return out
  },

  /* ---------------- 翻译 ---------------- */
  async listTranslations(level: Level, type?: string, difficulty?: number): Promise<TranslationQuestion[]> {
    const all = await loadTranslations()
    return all
      .filter((q) => !level || q.level === level)
      .filter((q) => !type || q.type === type)
      .filter((q) => difficulty == null || q.difficulty === difficulty)
  },

  async getTranslation(id: string): Promise<TranslationQuestion> {
    const all = await loadTranslations()
    const q = all.find((x) => x.id === id)
    if (!q) throw new Error('题目不存在')
    return q
  },

  /** 翻译常用词汇（只有词，没有句子题） */
  async listTranslationVocab(): Promise<VocabWord[]> {
    return loadTranslationVocab()
  },

  async submitTranslation(payload: { questionId: string; answer: string }): Promise<TranslationResult> {
    const q = await this.getTranslation(payload.questionId)
    const answer = (payload.answer ?? '').trim()

    // 与后端 TranslationGrader 同一套规则（核心词覆盖 55 + 篇幅贴合 30 + 语言规范 15）
    const g = grade(answer, q.reference, q.coreWords ?? [])
    const score = g.score
    const wrong = score < WRONG_SCORE

    const attempt: TranslationAttempt = {
      id: 0,
      questionId: q.id,
      answer,
      score,
      hitWords: g.hit,
      missWords: g.miss,
      isWrong: wrong,
      createTime: new Date().toISOString(),
    }

    update((db) => {
      attempt.id = seqNext(db, 'attempt')
      db.attempts.push(attempt)
      if (wrong) {
        const exist = db.errors.find((e) => e.sourceType === 'TRANSLATION' && e.sourceId === q.id)
        const note = `得分 ${score}；未命中核心词：${g.miss.join('、')}`
        if (exist) {
          exist.userAnswer = answer
          exist.note = note
          exist.resolved = false
        } else {
          db.errors.push({
            id: seqNext(db, 'error'),
            sourceType: 'TRANSLATION',
            sourceId: q.id,
            title: truncate(q.prompt, 60),
            content: q.prompt,
            userAnswer: answer,
            rightAnswer: q.reference,
            note,
            resolved: false,
            createTime: new Date().toISOString(),
          })
        }
      }
    })

    return {
      questionId: q.id,
      score,
      answer,
      question: q,
      hitWords: g.hit,
      reorderWords: g.reorder,
      nearWords: g.near,
      missWords: g.miss,
      wrong,
      comment: machineComment(g),
      breakdown: g.breakdown,
      attemptId: attempt.id,
    }
  },

  /** 回填 LLM 二次润色评分（本地模式：写入 attempts 并按综合分复判错题本） */
  async reviewTranslation(payload: {
    questionId: string
    answer?: string
    llmScore?: number
    finalScore?: number
    llmComment?: string
    polish?: string
    llmIssues?: string[]
  }): Promise<TranslationResult> {
    const q = await this.getTranslation(payload.questionId)
    const db = load()
    const list = db.attempts.filter((a) => a.questionId === q.id)
    const want = (payload.answer ?? '').trim()
    const target =
      (want ? [...list].reverse().find((a) => a.answer === want) : undefined) ?? list[list.length - 1]
    if (!target) throw new Error('未找到对应的作答记录，请先提交译文')

    target.llmScore = payload.llmScore
    target.finalScore = payload.finalScore ?? target.score
    target.llmComment = payload.llmComment
    target.polish = payload.polish
    target.llmIssues = payload.llmIssues
    target.isWrong = target.finalScore < WRONG_SCORE
    const wrong = target.isWrong

    update((d) => {
      const idx = d.attempts.findIndex((a) => a.id === target.id)
      if (idx >= 0) d.attempts[idx] = target
      const exist = d.errors.find((e) => e.sourceType === 'TRANSLATION' && e.sourceId === q.id)
      if (wrong) {
        const note =
          `得分 ${target.finalScore}` +
          `${payload.llmComment ? `；AI 点评：${truncate(payload.llmComment, 300)}` : ''}`
        if (exist) {
          exist.userAnswer = target.answer
          exist.rightAnswer = payload.polish ? `${q.reference}\n\n【AI 润色】${payload.polish}` : q.reference
          exist.note = note
          exist.resolved = false
        } else {
          d.errors.push({
            id: seqNext(d, 'error'),
            sourceType: 'TRANSLATION',
            sourceId: q.id,
            title: truncate(q.prompt, 60),
            content: q.prompt,
            userAnswer: target.answer,
            rightAnswer: payload.polish ? `${q.reference}\n\n【AI 润色】${payload.polish}` : q.reference,
            note,
            resolved: false,
            createTime: new Date().toISOString(),
          })
        }
      } else if (exist) {
        d.errors = d.errors.filter((e) => e.id !== exist.id)
      }
    })

    const g = grade(target.answer, q.reference, q.coreWords ?? [])
    return {
      questionId: q.id,
      score: target.score,
      answer: target.answer,
      question: q,
      hitWords: g.hit,
      reorderWords: g.reorder,
      nearWords: g.near,
      missWords: g.miss,
      wrong,
      comment: machineComment(g),
      breakdown: g.breakdown,
      attemptId: target.id,
      llmScore: payload.llmScore,
      finalScore: target.finalScore,
      llmComment: payload.llmComment,
      polish: payload.polish,
      llmIssues: payload.llmIssues,
    }
  },

  async translationAttempts(_level: Level): Promise<TranslationAttempt[]> {
    return load().attempts.slice(-100).reverse()
  },

  async translationWrongs(): Promise<TranslationAttempt[]> {
    // 与后端 wrongs() 保持同一语义：按题目去重，只保留最新一次作答仍判错的题。
    // 否则同一题答错多次会出现多行，且 AI 复核达标后旧记录仍留在错题本里。
    // attempts 是按时间正序存的，倒序遍历即可让每题先遇到最新一次。
    const latest = new Map<string, TranslationAttempt>()
    for (const a of [...load().attempts].reverse()) {
      if (!latest.has(a.questionId)) latest.set(a.questionId, a)
    }
    return [...latest.values()].filter((a) => a.isWrong)
  },

  /* ---------------- 真题 ---------------- */
  async listPapers(): Promise<Paper[]> {
    return load().papers.map(stripDetail)
  },

  async listPresets(): Promise<Paper[]> {
    return (await loadPresetPapers()).map(stripDetail)
  },

  async getPaper(id: number): Promise<PaperDetail> {
    if (id >= 9000) {
      const presets = await loadPresetPapers()
      const p = presets.find((x) => x.id === id)
      if (p) return p
    }
    const db = load()
    const p = db.papers.find((x) => x.id === id)
    if (!p) throw new Error('试卷不存在')
    return p
  },

  async createPaper(req: {
    title: string
    level: Level
    yearMonth?: string
    source?: string
    rawText?: string
    sections: Array<{
      type: string
      title: string
      passage: string
      questions: Array<{
        orderNo: number
        stem: string
        options: string[]
        answer: string
        analysis: string
      }>
    }>
  }): Promise<{ id: number }> {
    return update((db) => {
      const id = seqNext(db, 'paper')
      let total = 0
      const sectionList = req.sections.map((s, si) => {
        const sid = seqNext(db, 'section')
        const questions: PaperQuestion[] = (s.questions ?? []).map((q) => ({
          id: seqNext(db, 'question'),
          paperId: id,
          sectionId: sid,
          orderNo: q.orderNo ?? total + 1,
          stem: q.stem ?? '',
          options: q.options ?? [],
          answer: q.answer ?? '',
          analysis: q.analysis ?? '',
          userAnswer: '',
          done: false,
          favorite: false,
        }))
        total += questions.length
        return {
          id: sid,
          type: (s.type as PaperDetail['sectionList'][number]['type']) ?? 'reading',
          title: s.title ?? '',
          passage: s.passage ?? '',
          orderNo: si + 1,
          questions,
        }
      })

      db.papers.unshift({
        id,
        userId: 1,
        title: req.title,
        level: req.level,
        yearMonth: req.yearMonth ?? '',
        source: req.source ?? '粘贴/上传',
        rawText: req.rawText ?? '',
        totalCount: total,
        doneCount: 0,
        sectionList,
      })
      return { id }
    })
  },

  async clonePaper(id: number): Promise<{ id: number }> {
    const src = await this.getPaper(id)
    return this.createPaper({
      title: src.title,
      level: src.level,
      yearMonth: src.yearMonth,
      source: '内置示范卷',
      rawText: src.rawText,
      sections: src.sectionList.map((s) => ({
        type: s.type,
        title: s.title,
        passage: s.passage,
        questions: s.questions.map((q) => ({
          orderNo: q.orderNo,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
        })),
      })),
    })
  },

  async deletePaper(id: number): Promise<void> {
    update((db) => {
      db.papers = db.papers.filter((p) => p.id !== id)
    })
  },

  async updatePaper(id: number, body: Partial<Paper>): Promise<Paper> {
    return update((db) => {
      const p = db.papers.find((x) => x.id === id)
      if (!p) throw new Error('试卷不存在')
      Object.assign(p, body)
      return stripDetail(p)
    })
  },

  async updateQuestion(
    questionId: number,
    body: { userAnswer?: string; done?: boolean; favorite?: boolean }
  ): Promise<PaperQuestion> {
    return update((db) => {
      for (const p of db.papers) {
        for (const s of p.sectionList) {
          const q = s.questions.find((x) => x.id === questionId)
          if (q) {
            if (body.userAnswer !== undefined) q.userAnswer = body.userAnswer
            if (body.done !== undefined) q.done = body.done
            if (body.favorite !== undefined) q.favorite = body.favorite
            p.doneCount = p.sectionList.reduce(
              (n, sec) => n + sec.questions.filter((x) => x.done).length,
              0
            )
            // 错题本联动：有答案键时答错自动收录、答对/重做自动移出
            if (body.userAnswer !== undefined) syncPaperError(db, p, s, q)
            return q
          }
        }
      }
      throw new Error('题目不存在')
    })
  },

  async paperProgress(id: number): Promise<{ paperId: number; total: number; done: number; percent: number }> {
    const p = await this.getPaper(id)
    return {
      paperId: id,
      total: p.totalCount,
      done: p.doneCount,
      percent: p.totalCount ? Math.round((p.doneCount * 100) / p.totalCount) : 0,
    }
  },

  async favorites(): Promise<PaperQuestion[]> {
    const db = load()
    const out: PaperQuestion[] = []
    for (const p of db.papers) {
      for (const s of p.sectionList) {
        out.push(...s.questions.filter((q) => q.favorite).map((q) => ({ ...q, _key: p.title })))
      }
    }
    return out
  },

  /* ---------------- 错题本 ---------------- */
  async listErrors(sourceType?: ErrorSourceType, resolved?: boolean): Promise<ErrorItem[]> {
    return load()
      .errors.filter((e) => !sourceType || e.sourceType === sourceType)
      .filter((e) => resolved === undefined || e.resolved === resolved)
      .reverse()
  },

  async updateError(id: number, body: { resolved?: boolean; note?: string }): Promise<ErrorItem> {
    return update((db) => {
      const e = db.errors.find((x) => x.id === id)
      if (!e) throw new Error('错题不存在')
      if (body.resolved !== undefined) e.resolved = body.resolved
      if (body.note !== undefined) e.note = body.note
      return e
    })
  },

  async deleteError(id: number): Promise<void> {
    update((db) => {
      db.errors = db.errors.filter((e) => e.id !== id)
    })
  },

  async clearErrors(sourceType?: ErrorSourceType): Promise<void> {
    update((db) => {
      db.errors = sourceType ? db.errors.filter((e) => e.sourceType !== sourceType) : []
    })
  },

  /* ---------------- 统计 ---------------- */
  async stats(): Promise<Stats> {
    const db = load()
    const words = await loadWords(db.user.currentLevel)
    const progresses = Object.values(db.progress)
    const now = new Date()

    const attempts = db.attempts
    const avg = attempts.length
      ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
      : 0

    return {
      level: db.user.currentLevel,
      learnedTotal: progresses.length,
      reviewTotal: progresses.reduce((s, p) => s + p.reviewCount, 0),
      knownTotal: progresses.filter((p) => p.status === 'KNOWN').length,
      notebookTotal: progresses.filter((p) => p.inNotebook === 1).length,
      dueTotal: progresses.filter(
        (p) => p.status !== 'KNOWN' && p.nextReviewAt && new Date(p.nextReviewAt) <= now
      ).length,
      wordTotal: words.length,
      streak: (await this.streak()).current,
      longestStreak: (await this.streak()).longest,
      checkinDays: (await this.streak()).totalDays,
      todayDone: today(db).done === 1,
      learnedToday: today(db).learnCount,
      reviewedToday: today(db).reviewCount,
      dailyGoal: db.user.dailyGoal,
      translationCount: new Set(attempts.map((a) => a.questionId)).size,
      translationAvgScore: avg,
      paperCount: db.papers.length,
      paperDoneCount: db.papers.reduce((s, p) => s + p.doneCount, 0),
      paperTotalCount: db.papers.reduce((s, p) => s + p.totalCount, 0),
      errorCount: db.errors.filter((e) => !e.resolved).length,
    }
  },

  /** 预加载词库，避免首次切等级时白屏 */
  async warmup(level: Level): Promise<void> {
    await loadWords(level)
  },
}

/* ---------------------------------- 评分辅助（与后端 TranslationGrader 一致） ---------------------------------- */

/** 机器点评：分数档位 + 三项得分 + 具体扣分点 */
function machineComment(g: GradeResult): string {
  const s = g.score
  const base =
    s >= 90
      ? '译文质量很高，核心表达基本到位。'
      : s >= 70
        ? '整体不错，主要失分在细节表达。'
        : s >= 50
          ? '基本意思传达到了，但漏译、生硬处较多。'
          : '与参考译文差距较大，建议先背熟核心词再重译。'

  const total = g.hit.length + g.reorder.length + g.near.length + g.miss.length
  const parts: string[] = []
  if (g.miss.length) parts.push(`未命中：${g.miss.join('、')}`)
  if (g.reorder.length) parts.push(`词都在但语序存疑：${g.reorder.join('、')}`)
  if (g.near.length) parts.push(`拼写近似：${g.near.map((n) => `${n.found}→${n.expected}`).join('、')}`)

  return (
    base +
    ` 核心词得分 ${g.breakdown.coreScore}/${W_CORE}（命中 ${g.hit.length}/${total}）` +
    `，篇幅得分 ${g.breakdown.lengthScore}/${W_LENGTH}` +
    `，语言规范 ${g.breakdown.languageScore}/${W_LANGUAGE}。` +
    (parts.length ? ` ${parts.join('；')}。` : '') +
    (g.breakdown.languageIssues.length ? ` 规范提示：${g.breakdown.languageIssues.join('、')}。` : '')
  )
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function stripDetail(p: PaperDetail): Paper {
  const { sectionList: _s, ...rest } = p
  return rest
}
