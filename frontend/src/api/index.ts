/**
 * 统一 API 入口
 *
 * VITE_USE_MOCK=true  → 纯本地模式（localStorage 持久化，无需后端）
 * 其他（默认）        → 走 Spring Boot 后端；后端不可用时自动回退本地模式
 */
import { request } from './http'
import { mockApi } from './mock'
import type {
  CheckinRecord,
  ErrorItem,
  ErrorSourceType,
  Level,
  Paper,
  PaperDetail,
  PaperQuestion,
  Stats,
  StreakInfo,
  TodayQueue,
  TranslationAttempt,
  TranslationQuestion,
  TranslationResult,
  UserProfile,
  VocabWord,
  WordVo,
} from '@/types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

/** 后端是否已探活成功 */
let backendAlive = !USE_MOCK

export function isLocalMode(): boolean {
  return !backendAlive
}

export function setBackendAlive(v: boolean): void {
  backendAlive = v
}

/** 启动时探测后端；不可用则静默切换到本地模式 */
export async function probeBackend(): Promise<boolean> {
  if (USE_MOCK) {
    backendAlive = false
    return false
  }
  try {
    await request<UserProfile>('/api/user/profile')
    backendAlive = true
    return true
  } catch {
    backendAlive = false
    return false
  }
}

/* ------------------------------ 用户 ------------------------------ */
export const userApi = {
  get(): Promise<UserProfile> {
    return backendAlive ? request<UserProfile>('/api/user/profile') : mockApi.getUser()
  },
  update(body: Partial<UserProfile>): Promise<UserProfile> {
    return backendAlive
      ? request<UserProfile>('/api/user/profile', { method: 'PUT', body })
      : mockApi.updateUser(body)
  },
}

/* ------------------------------ 单词 ------------------------------ */
export const wordApi = {
  list(level: Level, keyword?: string, status?: string): Promise<WordVo[]> {
    return backendAlive
      ? request<WordVo[]>('/api/words', { query: { level, keyword, status } })
      : mockApi.listWords(level, keyword, status)
  },
  today(level: Level): Promise<TodayQueue> {
    return backendAlive
      ? request<TodayQueue>('/api/words/today', { query: { level } })
      : mockApi.todayQueue(level)
  },
  submit(payload: {
    wordId: string
    result: 'KNOWN' | 'FUZZY' | 'UNKNOWN'
    mode?: string
    inNotebook?: number
  }): Promise<WordVo> {
    return backendAlive
      ? request<WordVo>('/api/words/progress', { method: 'POST', body: payload })
      : mockApi.submitWord(payload)
  },
  notebook(): Promise<WordVo[]> {
    return backendAlive ? request<WordVo[]>('/api/words/notebook') : mockApi.notebook()
  },
  toggleNotebook(wordId: string, inNotebook: number): Promise<WordVo> {
    return backendAlive
      ? request<WordVo>('/api/words/notebook/toggle', { method: 'POST', body: { wordId, inNotebook } })
      : mockApi.toggleNotebook(wordId, inNotebook)
  },
  byStatus(level: Level, status: string): Promise<WordVo[]> {
    return backendAlive
      ? request<WordVo[]>('/api/words/status', { query: { level, status } })
      : mockApi.wordsByStatus(level, status)
  },
  reset(level: Level): Promise<number> {
    return backendAlive
      ? request<number>('/api/words/reset', { method: 'POST', body: { level } })
      : mockApi.resetWords(level)
  },
  dueCount(level: Level): Promise<number> {
    return backendAlive
      ? request<number>('/api/words/due-count', { query: { level } })
      : mockApi.dueCount(level)
  },
}

/* ------------------------------ 打卡 ------------------------------ */
export const checkinApi = {
  today(): Promise<CheckinRecord> {
    return backendAlive ? request<CheckinRecord>('/api/checkin/today') : mockApi.todayCheckin()
  },
  streak(): Promise<StreakInfo> {
    return backendAlive ? request<StreakInfo>('/api/checkin/streak') : mockApi.streak()
  },
  list(days = 30): Promise<CheckinRecord[]> {
    return backendAlive
      ? request<CheckinRecord[]>('/api/checkin/list', { query: { days } })
      : mockApi.checkinList(days)
  },
}

/* ------------------------------ 翻译 ------------------------------ */
export const translationApi = {
  list(level: Level, type?: string, difficulty?: number): Promise<TranslationQuestion[]> {
    return backendAlive
      ? request<TranslationQuestion[]>('/api/translation/questions', { query: { level, type, difficulty } })
      : mockApi.listTranslations(level, type, difficulty)
  },
  get(id: string): Promise<TranslationQuestion> {
    return backendAlive
      ? request<TranslationQuestion>(`/api/translation/questions/${id}`)
      : mockApi.getTranslation(id)
  },
  /**
   * 翻译常用词汇表。
   *
   * 只走本地数据：这份词表来自用户自己的 Word 笔记，不属于服务端题库，
   * 也没必要为了它在后端建表 —— 所以不按 backendAlive 分支。
   */
  vocab(): Promise<VocabWord[]> {
    return mockApi.listTranslationVocab()
  },
  submit(questionId: string, answer: string): Promise<TranslationResult> {
    return backendAlive
      ? request<TranslationResult>('/api/translation/submit', { method: 'POST', body: { questionId, answer } })
      : mockApi.submitTranslation({ questionId, answer })
  },
  /**
   * 回填 LLM 二次润色评分结果。
   *
   * 模型调用在浏览器端直连完成（API Key 不出本机），此接口只负责持久化与错题本复判。
   */
  review(payload: {
    questionId: string
    answer?: string
    llmScore?: number
    finalScore?: number
    llmComment?: string
    polish?: string
    llmIssues?: string[]
    llmModel?: string
  }): Promise<TranslationResult> {
    return backendAlive
      ? request<TranslationResult>('/api/translation/review', { method: 'POST', body: payload })
      : mockApi.reviewTranslation(payload)
  },
  attempts(level: Level): Promise<TranslationAttempt[]> {
    return backendAlive
      ? request<TranslationAttempt[]>('/api/translation/attempts', { query: { level } })
      : mockApi.translationAttempts(level)
  },
  wrongs(level: Level): Promise<TranslationAttempt[]> {
    return backendAlive
      ? request<TranslationAttempt[]>('/api/translation/wrongs', { query: { level } })
      : mockApi.translationWrongs()
  },
}

/* ------------------------------ 真题 ------------------------------ */
export interface CreatePaperInput {
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
}

export const paperApi = {
  list(): Promise<Paper[]> {
    return backendAlive ? request<Paper[]>('/api/papers') : mockApi.listPapers()
  },
  presets(): Promise<Paper[]> {
    return backendAlive ? request<Paper[]>('/api/papers/presets') : mockApi.listPresets()
  },
  create(body: CreatePaperInput): Promise<{ id: number }> {
    return backendAlive
      ? request<{ id: number }>('/api/papers', { method: 'POST', body })
      : mockApi.createPaper(body)
  },
  get(id: number): Promise<PaperDetail> {
    return backendAlive ? request<PaperDetail>(`/api/papers/${id}`) : mockApi.getPaper(id)
  },
  clone(id: number): Promise<{ id: number }> {
    return backendAlive
      ? request<{ id: number }>(`/api/papers/${id}/clone`, { method: 'POST' })
      : mockApi.clonePaper(id)
  },
  update(id: number, body: Partial<Paper>): Promise<Paper> {
    return backendAlive
      ? request<Paper>(`/api/papers/${id}`, { method: 'PUT', body })
      : mockApi.updatePaper(id, body)
  },
  remove(id: number): Promise<void> {
    return backendAlive
      ? request<void>(`/api/papers/${id}`, { method: 'DELETE' })
      : mockApi.deletePaper(id)
  },
  updateQuestion(
    id: number,
    body: { userAnswer?: string; done?: boolean; favorite?: boolean }
  ): Promise<PaperQuestion> {
    return backendAlive
      ? request<PaperQuestion>(`/api/papers/questions/${id}`, { method: 'PUT', body })
      : mockApi.updateQuestion(id, body)
  },
  progress(id: number): Promise<{ paperId: number; total: number; done: number; percent: number }> {
    return backendAlive
      ? request<{ paperId: number; total: number; done: number; percent: number }>(
          `/api/papers/${id}/progress`
        )
      : mockApi.paperProgress(id)
  },
  favorites(): Promise<PaperQuestion[]> {
    return backendAlive ? request<PaperQuestion[]>('/api/papers/favorites') : mockApi.favorites()
  },
}

/* ------------------------------ 错题本 ------------------------------ */
export const errorApi = {
  list(sourceType?: ErrorSourceType, resolved?: boolean): Promise<ErrorItem[]> {
    return backendAlive
      ? request<ErrorItem[]>('/api/errors', { query: { sourceType, resolved } })
      : mockApi.listErrors(sourceType, resolved)
  },
  update(id: number, body: { resolved?: boolean; note?: string }): Promise<ErrorItem> {
    return backendAlive
      ? request<ErrorItem>(`/api/errors/${id}`, { method: 'PUT', body })
      : mockApi.updateError(id, body)
  },
  remove(id: number): Promise<void> {
    return backendAlive
      ? request<void>(`/api/errors/${id}`, { method: 'DELETE' })
      : mockApi.deleteError(id)
  },
  clear(sourceType?: ErrorSourceType): Promise<void> {
    return backendAlive
      ? request<void>('/api/errors', { method: 'DELETE', query: { sourceType } })
      : mockApi.clearErrors(sourceType)
  },
}

/* ------------------------------ 统计 ------------------------------ */
export const statsApi = {
  overview(): Promise<Stats> {
    return backendAlive ? request<Stats>('/api/stats/overview') : mockApi.stats()
  },
}

/** 本地模式预加载词库 */
export function warmup(level: Level): Promise<void> {
  return backendAlive ? Promise.resolve() : mockApi.warmup(level)
}
