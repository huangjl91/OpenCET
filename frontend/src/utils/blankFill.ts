/**
 * 逐词填空的通用逻辑（答案有几个词就画几条横线）。
 *
 * 抽成独立模块的原因：**作文方法**的重点词/金句默写、**翻译练习**的分类常考词默写，
 * 用的是同一套「一个词一格」的机制。放在 writingGuide 里会让翻译那边 import 一个
 * 名字上跟写作绑定的模块，语义不对。
 */

/** 一条横线的判定结果 */
export interface BlankMark {
  /** 标准答案里这个位置该填的词 */
  expected: string
  /** 用户填的 */
  typed: string
  /** exact 完全一致 / close 拼写差一点（算对）/ wrong 写错 / empty 没填 */
  level: 'exact' | 'close' | 'wrong' | 'empty'
  ok: boolean
}

export interface BlankResult {
  /** 标准答案拆成的词，决定横线条数 */
  words: string[]
  marks: BlankMark[]
  /** 填对的条数（exact + close） */
  okCount: number
  total: number
  allOk: boolean
  issues: string[]
}

/** 一道逐词填空题 */
export interface BlankItem {
  id: string
  group: string
  /** 题面 */
  prompt: string
  /** 辅助提示（可为空） */
  hint: string
  /** 标准答案（完整英文） */
  answer: string
  /** 答案逐词拆开，决定横线条数 */
  words: string[]
  /** 用法提醒 */
  note: string
}

/**
 * 取答案的「标准写法」：`/` 分隔的多种写法取第一种，去掉 `...` 省略号占位。
 * **横线的条数由它决定** —— 所以这里必须干净，不然会多画一条空横线。
 */
export function canonicalAnswer(answer: string): string {
  return (answer ?? '')
    .split('/')[0]
    .replace(/…/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/[，。、；：！？（）【】《》]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 答案逐词拆开 —— 有几个词就画几条横线 */
export function answerWords(answer: string): string[] {
  return canonicalAnswer(answer).split(' ').filter(Boolean)
}

/** 每条横线的首字母提示 */
export function hintsOf(answer: string): string[] {
  return answerWords(answer).map((w) => {
    const core = w.replace(/[^A-Za-z]/g, '')
    if (!core) return w
    return w[0] + '_'.repeat(Math.max(1, core.length - 1))
  })
}

/** 归一化单个词：忽略大小写与首尾标点 */
function normWord(w: string): string {
  return (w ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'-]/g, '')
}

/** 编辑距离（只在很短的词上算，用于识别笔误） */
function editDistance(a: string, b: string): number {
  const n = a.length
  const m = b.length
  if (Math.abs(n - m) > 2) return 3
  const prev = new Array(m + 1).fill(0).map((_, j) => j)
  for (let i = 1; i <= n; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= m; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[m]
}

/**
 * 逐词判定。
 *
 * 一个词一个格子，**位置即对齐**，不需要做序列比对 —— 这也是这种设计比整句输入更清楚的地方：
 * 错在第几个词一眼就看出来。
 * 宽容度：忽略大小写与标点；单个词笔误（编辑距离 1，长词 2）算对但会标出来。
 */
export function checkBlanks(typed: string[], answer: string): BlankResult {
  const words = answerWords(answer)
  const marks: BlankMark[] = words.map((expected, i) => {
    const t = (typed[i] ?? '').trim()
    if (!t) return { expected, typed: '', level: 'empty', ok: false }
    const a = normWord(expected)
    const b = normWord(t)
    if (a === b) return { expected, typed: t, level: 'exact', ok: true }
    const tol = Math.max(a.length, b.length) >= 6 ? 2 : 1
    if (editDistance(a, b) <= tol) return { expected, typed: t, level: 'close', ok: true }
    return { expected, typed: t, level: 'wrong', ok: false }
  })

  const okCount = marks.filter((m) => m.ok).length
  const issues: string[] = []
  const empty = marks.filter((m) => m.level === 'empty').length
  const wrong = marks.filter((m) => m.level === 'wrong').length
  const close = marks.filter((m) => m.level === 'close').length
  if (!words.length) issues.push('这道题没有可填的内容')
  if (empty) issues.push(`还有 ${empty} 条没填`)
  if (wrong) issues.push(`${wrong} 条写错了`)
  if (close) issues.push(`${close} 条拼写差一点（算对）`)

  return {
    words,
    marks,
    okCount,
    total: words.length,
    allOk: words.length > 0 && okCount === words.length,
    issues,
  }
}

/** 可复现的伪随机（同一个 seed 出同一套题，便于测试） */
export function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ==================================================================== */
/* 写错了怎么办：当场重写 + 汇总重练                                      */
/* ==================================================================== */

/**
 * 重写时该清空哪些格子。
 *
 * **只清写错的，写对的保留** —— 用户需要集中改的是错的那几个词，
 * 把整句重敲一遍既费时又让人烦躁，反而把注意力从错词上移开了。
 * 返回 `firstBad` 让界面把光标落到第一个错格上。
 */
export function blanksToRewrite(marks: BlankMark[], typed: string[]): { typed: string[]; firstBad: number } {
  const next = [...typed]
  let firstBad = -1
  marks.forEach((m, i) => {
    if (!m.ok) {
      next[i] = ''
      if (firstBad < 0) firstBad = i
    }
  })
  return { typed: next, firstBad }
}

/**
 * 把写错的题加进错题集：按 `id` 去重并保持原顺序。
 *
 * 同一题可能被「重写」多次又写错，不能重复入集 —— 否则「重练写错的 N 题」
 * 会出现同一题好几遍。
 */
export function addMiss(list: BlankItem[], item: BlankItem): BlankItem[] {
  return list.some((w) => w.id === item.id) ? list : [...list, item]
}

