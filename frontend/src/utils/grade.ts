/**
 * 翻译自动批改引擎（本地启发式，与后端 TranslationGrader.java 保持同一套规则）
 *
 * 评分构成（合计 100）：
 *   - 核心词覆盖 55 分：命中满分，拼写近似 / 语序存疑记半分
 *   - 篇幅贴合 30 分：与参考译文词数比对，过长罚分更重（抑制灌水冗余）
 *   - 语言规范 15 分：句首大写、句末标点、连续重复词、拼写疑似错误
 */
import type { CoreWord, NearMiss, ScoreBreakdown } from '@/types'

export const W_CORE = 55
export const W_LENGTH = 30
export const W_LANGUAGE = 15

/** 过长译文相对过短译文的罚分倍率 */
const OVER_LENGTH_FACTOR = 1.25
/** 词组匹配允许的位置跨度余量 */
const SPAN_SLACK = 2
/** 拼写近似判定的最大编辑距离 */
const MAX_SPELL_DISTANCE = 2
/** 冗余判定的绝对下限：低于此比例一律不罚（短句里重复一次很正常） */
const REDUNDANCY_FLOOR = 0.2
/** 冗余判定的相对余量：比参考译文高出这么多才算「学生自己灌水」 */
const REDUNDANCY_MARGIN = 0.1

/** 可缺省的虚词：冠词在译文中允许省略或换用（exert an influence on ↔ exert a great influence on） */
const OPTIONAL_TOKENS = new Set(['a', 'an', 'the'])

/** 所有格限定词 */
const POSSESSIVES = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their', 'one', 'ones'])

/** 计算跨度时不计入的「填充词」：冠词与所有格，它们是名词短语的附属成分，不是语序打乱的证据 */
function isFiller(t: string): boolean {
  return OPTIONAL_TOKENS.has(t) || POSSESSIVES.has(t) || t.endsWith("'s") || t.endsWith("'")
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'by', 'from', 'that', 'this',
  'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
  'he', 'she', 'his', 'her', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'must', 'not', 'no', 'so', 'than', 'then',
  'there', 'here', 'also', 'very', 'more', 'most', 'much', 'many', 'some', 'any', 'all',
  'both', 'each', 'other', 'such', 'into', 'over', 'under', 'about', 'up', 'down', 'out',
  'off', 'during', 'between', 'while', 'when', 'where', 'which', 'who', 'whom', 'what',
])

/** 不规则变化表：动词过去式/过去分词/三单、名词不规则复数、比较级最高级 */
const IRREGULAR: Record<string, string> = (() => {
  const pairs: Array<[string, string]> = [
    ['went', 'go'], ['gone', 'go'], ['goes', 'go'], ['did', 'do'], ['done', 'do'], ['does', 'do'],
    ['had', 'have'], ['has', 'have'], ['was', 'be'], ['were', 'be'], ['been', 'be'], ['is', 'be'],
    ['are', 'be'], ['am', 'be'], ['made', 'make'], ['took', 'take'], ['taken', 'take'],
    ['came', 'come'], ['got', 'get'], ['gotten', 'get'], ['gave', 'give'], ['given', 'give'],
    ['saw', 'see'], ['seen', 'see'], ['said', 'say'], ['found', 'find'], ['thought', 'think'],
    ['told', 'tell'], ['became', 'become'], ['shown', 'show'], ['left', 'leave'],
    ['felt', 'feel'], ['brought', 'bring'], ['began', 'begin'], ['begun', 'begin'],
    ['kept', 'keep'], ['held', 'hold'], ['wrote', 'write'], ['written', 'write'],
    ['stood', 'stand'], ['heard', 'hear'], ['meant', 'mean'], ['met', 'meet'],
    ['ran', 'run'], ['paid', 'pay'], ['sat', 'sit'], ['spoke', 'speak'], ['spoken', 'speak'],
    ['led', 'lead'], ['grew', 'grow'], ['grown', 'grow'], ['lost', 'lose'], ['fell', 'fall'],
    ['fallen', 'fall'], ['sent', 'send'], ['built', 'build'], ['understood', 'understand'],
    ['drew', 'draw'], ['drawn', 'draw'], ['broke', 'break'], ['broken', 'break'],
    ['spent', 'spend'], ['rose', 'rise'], ['risen', 'rise'], ['drove', 'drive'],
    ['driven', 'drive'], ['bought', 'buy'], ['wore', 'wear'], ['worn', 'wear'],
    ['chose', 'choose'], ['chosen', 'choose'], ['ate', 'eat'], ['eaten', 'eat'], ['won', 'win'],
    ['flew', 'fly'], ['flown', 'fly'], ['sold', 'sell'], ['sang', 'sing'], ['sung', 'sing'],
    ['taught', 'teach'], ['caught', 'catch'], ['threw', 'throw'], ['thrown', 'throw'],
    ['slept', 'sleep'], ['swam', 'swim'], ['swum', 'swim'], ['drank', 'drink'], ['drunk', 'drink'],
    ['lay', 'lie'], ['lain', 'lie'], ['shook', 'shake'], ['shaken', 'shake'],
    ['rode', 'ride'], ['ridden', 'ride'], ['hid', 'hide'], ['hidden', 'hide'],
    ['blew', 'blow'], ['blown', 'blow'], ['froze', 'freeze'], ['frozen', 'freeze'],
    ['sought', 'seek'], ['fought', 'fight'], ['struck', 'strike'], ['hung', 'hang'],
    ['dug', 'dig'], ['bent', 'bend'], ['dealt', 'deal'], ['swept', 'sweep'],
    ['woven', 'weave'], ['wove', 'weave'], ['weaving', 'weave'], ['weaves', 'weave'],
    ['children', 'child'], ['feet', 'foot'], ['teeth', 'tooth'], ['men', 'man'],
    ['women', 'woman'], ['mice', 'mouse'], ['geese', 'goose'], ['oxen', 'ox'],
    ['criteria', 'criterion'], ['phenomena', 'phenomenon'], ['analyses', 'analysis'],
    ['crises', 'crisis'], ['theses', 'thesis'], ['bases', 'basis'], ['hypotheses', 'hypothesis'],
    ['lives', 'life'], ['wives', 'wife'], ['knives', 'knife'], ['leaves', 'leaf'],
    ['halves', 'half'], ['selves', 'self'], ['shelves', 'shelf'], ['wolves', 'wolf'],
    ['thieves', 'thief'], ['media', 'medium'], ['curricula', 'curriculum'], ['stimuli', 'stimulus'],
    ['nuclei', 'nucleus'], ['fungi', 'fungus'], ['alumni', 'alumnus'], ['cacti', 'cactus'],
    ['better', 'good'], ['best', 'good'], ['worse', 'bad'], ['worst', 'bad'],
    ['further', 'far'], ['furthest', 'far'], ['farther', 'far'], ['farthest', 'far'],
    ['less', 'little'], ['least', 'little'],
  ]
  const m: Record<string, string> = {}
  for (const [k, v] of pairs) m[k] = v
  return m
})()

export function stem(w: string): string {
  const s = w.toLowerCase()
  const irr = IRREGULAR[s]
  if (irr) return irr
  for (const suffix of ['ies', 'ing', 'ed', 'es', 's']) {
    if (s.length > suffix.length + 2 && s.endsWith(suffix)) {
      if (suffix === 'ies') return s.slice(0, s.length - 3) + 'y'
      let base = s.slice(0, s.length - suffix.length)
      // 双写辅音还原：running → run、stopped → stop
      if (base.length > 2) {
        const c1 = base[base.length - 1]
        const c2 = base[base.length - 2]
        if (c1 === c2 && 'bdgklmnprt'.includes(c1)) base = base.slice(0, -1)
      }
      return base
    }
  }
  return s
}

export function normalize(s: string): string {
  return s
    .replace(/[’‘`´]/g, "'") // 弯引号统一成直引号：题库里 one’s / teacher’s 用的是中文弯撇号
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  const n = normalize(s ?? '')
  return n ? n.split(' ').filter(Boolean) : []
}

/** Levenshtein 编辑距离 */
export function distance(a: string, b: string): number {
  if (a === b) return 0
  const n = a.length
  const m = b.length
  if (Math.abs(n - m) > MAX_SPELL_DISTANCE) return MAX_SPELL_DISTANCE + 1
  let prev = Array.from({ length: m + 1 }, (_, j) => j)
  for (let i = 1; i <= n; i++) {
    const cur = [i]
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[m]
}

/**
 * 词形候选集，用于「同词」判定。
 *
 * 只比 `stem()` 会漏掉一类高频情况：原词以 e 结尾时，`-ed/-ing` 变形会被还原成
 * 去掉 e 的词干（improve → improved → improv），与原词对不上。这里补一个「词干 + e」
 * 候选，把 improved / improving / improves 都拉回 improve。
 */
function variants(w: string): Set<string> {
  const s = w.toLowerCase()
  const st = stem(s)
  const out = new Set<string>([s, st, st + 'e'])
  // -ied 结尾：unified → unifi → unify、studied → studi → study
  if (st.endsWith('i')) out.add(st.slice(0, -1) + 'y')
  return out
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const va = variants(a)
  for (const v of variants(b)) {
    if (va.has(v)) return true
  }
  return false
}

/**
 * 清洗核心词里的「占位符」与「可缺省虚词」，让它们能被真实译文匹配。
 *
 * 题库里大量核心词是按语法结构书写的模板式短语，例如 `prefer A to B`、`enable sb. to do`、
 * `with one's own eyes`、`be regarded as`、`artificial intelligence (AI)`、`given (that)`。
 * 这类字符串按字面永远匹配不上任何译文，学生即使译对也拿不到分。清洗后只保留实词骨架，
 * 语义不变但可以被正常命中。
 *
 * 另外两处只在词首处理：
 *   - 去掉起首的 `be`（be set against → set against，译文里 Set against… 并没有 be）；
 *   - 去掉起首的冠词（题目里写 a variety of，学生写 varieties of 不该判未命中）。
 * 位于词组中间的冠词不在这里删，而是在 {@link matchCore} 里按「可缺省」处理，
 * 这样不会把 `exert an influence on` 缩成两个词、反而把语义骨架削掉。
 */
export function cleanCorePhrase(raw: string): string {
  let s = raw.replace(/[’‘`´]/g, "'")
  s = s.replace(/\([^)]*\)/g, ' ') // (AI) / (that)
  s = s.replace(/\bsb\.?'?s\b/gi, ' ') // sb's / sb.
  s = s.replace(/\bsb\b\.?/gi, ' ')
  s = s.replace(/\bsth\b\.?/gi, ' ')
  s = s.replace(/\bone'?s\b/gi, ' ') // one's
  s = s.replace(/\bto\s+do\b/gi, 'to') // enable sb. to do → enable to
  s = s.replace(/\bdo\b\s*$/i, '') // 末尾孤立的 do
  s = s.replace(/(^|\s)[A-Z](\s|$)/g, ' ') // 占位字母 A / B
  s = s.replace(/^\s*be\s+/i, '') // be set against → set against
  s = s.replace(/^\s*(?:a|an|the)\s+/i, '') // a variety of → variety of
  const cleaned = s.replace(/\s+/g, ' ').trim()
  // 兜底：若清洗后什么都不剩（极端模板词），保留原串，避免出现「必然未命中」的空词组
  return cleaned || raw.replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim()
}

function findWord(tokens: string[], target: string, used: boolean[], from: number): number {
  for (let i = Math.max(0, from); i < tokens.length; i++) {
    if (!used[i] && sameWord(tokens[i], target)) return i
  }
  return -1
}

type Kind = 'HIT' | 'REORDER' | 'NEAR' | 'MISS'

interface MatchResult {
  kind: Kind
  found?: string
  distance?: number
}

/** 匹配单条核心词：命中 / 语序存疑 / 拼写近似 / 未命中 */
export function matchCore(ansTokens: string[], phrase: string): MatchResult {
  const pTokens = tokens(cleanCorePhrase(phrase))
  if (!pTokens.length) return { kind: 'MISS' }

  /*
   * 冠词不参与「必需匹配」。原因有二：
   *   1. 学生换用/省略冠词（exert an influence on ↔ exert a great influence on）不该判错；
   *   2. 冠词是全文最高频的词，一旦纳入匹配，会锚到段落另一端（an influence 的 an 匹配到
   *      are an outstanding 的 an），跨度瞬间爆炸、被误判成语序问题。
   * 冠词在「跨度」统计里仍按填充词排除，所以窗口里多出来的冠词不会被罚。
   */
  const req = pTokens.filter((t) => !OPTIONAL_TOKENS.has(t))
  const need = req.length ? req : pTokens

  /*
   * 在所有可能的起点里挑「最紧凑」的匹配窗口。
   * 核心词里常含 the / of / on / to 这类高频词，若从句子开头贪心匹配，会锚定到错误位置、
   * 把跨度算得虚高，从而被误判成语序问题（例如 on the other hand 会锚到句首的 on the）。
   */
  let best: { span: number; backsweep: boolean } | null = null
  for (let start = 0; start < ansTokens.length; start++) {
    if (!sameWord(ansTokens[start], need[0])) continue
    const used = new Array(ansTokens.length).fill(false)
    used[start] = true
    const positions = [start]
    let cursor = start + 1
    let ok = true
    let backsweep = false

    for (let k = 1; k < need.length; k++) {
      let pos = findWord(ansTokens, need[k], used, cursor)
      if (pos < 0) {
        pos = findWord(ansTokens, need[k], used, 0)
        if (pos >= 0) backsweep = true // 需要回头找 = 顺序被破坏
      }
      if (pos < 0) {
        ok = false
        break
      }
      used[pos] = true
      positions.push(pos)
      cursor = pos + 1
    }
    if (!ok) continue

    const lo = Math.min(...positions)
    const hi = Math.max(...positions)
    // 跨度只数「实词」：冠词与所有格是名词短语的附属成分，
    // 学生写 followed his teacher's advice 不该因为插了个所有格就判成语序问题。
    let span = 0
    for (let i = lo; i <= hi; i++) {
      if (!isFiller(ansTokens[i])) span++
    }
    const cand = { span, backsweep }
    if (
      !best ||
      (best.backsweep && !cand.backsweep) ||
      (best.backsweep === cand.backsweep && cand.span < best.span)
    ) {
      best = cand
    }
  }

  if (best) {
    // 顺序被破坏，或各词散落跨度过大 → 语序/搭配存疑，折半计分
    return { kind: !best.backsweep && best.span <= need.length + SPAN_SLACK ? 'HIT' : 'REORDER' }
  }

  if (pTokens.length === 1) {
    const target = pTokens[0]
    let best: string | null = null
    let bestD = Number.MAX_SAFE_INTEGER
    for (const t of [...new Set(ansTokens)]) {
      if (t.length < 4 || target.length < 4) continue
      if (Math.abs(t.length - target.length) > MAX_SPELL_DISTANCE) continue
      if (t[0] !== target[0]) continue
      const d = distance(t, target)
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    if (best && bestD <= MAX_SPELL_DISTANCE && bestD > 0 && Math.max(best.length, target.length) >= 5) {
      return { kind: 'NEAR', found: best, distance: bestD }
    }
  }
  return { kind: 'MISS' }
}

/** 篇幅贴合（不对称：过长罚更重） */
export function lengthFit(answerWords: number, referenceWords: number): number {
  if (answerWords === 0) return 0
  if (referenceWords === 0) return 1
  let diff = Math.abs(answerWords - referenceWords) / referenceWords
  diff = Math.min(1, diff)
  const penalty = answerWords > referenceWords ? diff * OVER_LENGTH_FACTOR : diff
  return Math.max(0, 1 - penalty)
}

export interface GradeResult {
  score: number
  hit: string[]
  reorder: string[]
  near: NearMiss[]
  miss: string[]
  breakdown: ScoreBreakdown
}

/** 主入口：对一份译文给出机器分与明细 */
export function grade(answer: string, reference: string, coreWords: CoreWord[] = []): GradeResult {
  const ans = (answer ?? '').trim()
  const ansTokens = tokens(ans)
  const refTokens = tokens(reference ?? '')

  const hit: string[] = []
  const reorder: string[] = []
  const near: NearMiss[] = []
  const miss: string[] = []
  let gained = 0

  for (const cw of coreWords ?? []) {
    const m = matchCore(ansTokens, cw.en)
    if (m.kind === 'HIT') {
      hit.push(cw.en)
      gained += 1
    } else if (m.kind === 'REORDER') {
      reorder.push(cw.en)
      gained += 0.5
    } else if (m.kind === 'NEAR') {
      near.push({ expected: cw.en, found: m.found ?? '', distance: m.distance ?? 0 })
      gained += 0.5
    } else {
      miss.push(cw.en)
    }
  }

  const coreRate = coreWords.length === 0 ? 1 : gained / coreWords.length
  const coreScore = Math.round(coreRate * W_CORE)
  const fit = lengthFit(ansTokens.length, refTokens.length)
  const lengthScore = Math.round(fit * W_LENGTH)

  const spellingIssues = detectSpelling(ansTokens, refTokens)
  const repeatedWords = repeatedContentWords(ansTokens)
  const redundancy = redundancyRatio(ansTokens)
  const refRedundancy = redundancyRatio(refTokens)
  const { score: languageScore, issues: languageIssues } = checkLanguage(
    ans,
    spellingIssues,
    redundancy,
    refRedundancy
  )

  const score = Math.max(0, Math.min(100, coreScore + lengthScore + languageScore))

  return {
    score,
    hit,
    reorder,
    near,
    miss,
    breakdown: {
      coreScore,
      lengthScore,
      languageScore,
      coreRate: round3(coreRate),
      lengthFit: round3(fit),
      redundancy: round3(redundancy),
      languageIssues,
      spellingIssues,
      repeatedWords,
    },
  }
}

/** 对照参考译文识别疑似拼写错误 */
function detectSpelling(ansTokens: string[], refTokens: string[]): string[] {
  if (!ansTokens.length || !refTokens.length) return []
  const refStems = new Set(refTokens.map(stem))
  const issues: string[] = []
  const handled = new Set<string>()

  for (const t of [...new Set(ansTokens)]) {
    if (t.length < 5 || STOPWORDS.has(t) || handled.has(t)) continue
    if (refStems.has(stem(t))) continue
    let best: string | null = null
    let bestD = Number.MAX_SAFE_INTEGER
    for (const r of [...new Set(refTokens)]) {
      if (r.length < 4 || STOPWORDS.has(r)) continue
      if (Math.abs(r.length - t.length) > MAX_SPELL_DISTANCE) continue
      if (r[0] !== t[0]) continue
      const d = distance(t, r)
      if (d < bestD) {
        bestD = d
        best = r
      }
    }
    if (best && bestD <= MAX_SPELL_DISTANCE && bestD > 0) {
      handled.add(t)
      issues.push(`「${t}」疑为「${best}」拼写有误`)
    }
  }
  return issues
}

function repeatedContentWords(ansTokens: string[]): string[] {
  const freq = new Map<string, number>()
  for (const t of ansTokens) {
    if (t.length < 4 || STOPWORDS.has(t)) continue
    const s = stem(t)
    freq.set(s, (freq.get(s) ?? 0) + 1)
  }
  const threshold = ansTokens.length > 60 ? 3 : 2
  const out: string[] = []
  freq.forEach((c, w) => {
    if (c >= threshold) out.push(`${w}×${c}`)
  })
  return out
}

function redundancyRatio(ansTokens: string[]): number {
  const content = ansTokens.filter((t) => t.length >= 4 && !STOPWORDS.has(t)).map(stem)
  if (!content.length) return 0
  const freq = new Map<string, number>()
  content.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1))
  let extra = 0
  freq.forEach((c) => (extra += Math.max(0, c - 1)))
  return Math.min(1, extra / content.length)
}

function checkLanguage(
  ans: string,
  spellingIssues: string[],
  redundancy: number,
  refRedundancy = 0
): { score: number; issues: string[] } {
  let score = W_LANGUAGE
  const issues: string[] = []
  if (!ans) return { score: 0, issues }

  const first = ans.split('').find((c) => /[a-zA-Z]/.test(c))
  if (first && first === first.toLowerCase()) {
    score -= 3
    issues.push('句首单词未大写')
  }

  const last = ans[ans.length - 1]
  if (!['.', '!', '?'].includes(last)) {
    score -= 3
    issues.push('句末缺少终止标点（. ? !）')
  }

  /*
   * 连续重复词只看「原文里紧挨着的同一个词」，不能拿分词结果比 ——
   * 分词会抹掉标点，于是 "the past decade and more, more than 150 countries"
   * 这种完全正确的英文会被当成 "more more" 重复。用带空白的正则才准。
   */
  const dupRuns = (ans.match(/\b([A-Za-z]{3,})\s+\1\b/gi) ?? []).length
  if (dupRuns > 0) {
    score -= Math.min(6, dupRuns * 2)
    issues.push(`存在连续重复词 ${dupRuns} 处`)
  }

  /*
   * 冗余是「相对」概念：介绍高铁、丝绸之路、汉字这类段落，参考译文本身就会反复出现
   * high-speed / silk / Chinese 等词，这是原文决定的，不该算学生用词单调。
   * 因此只有在「超过绝对下限」且「明显高于参考译文自身重复率」时才扣分，
   * 这样既能放过正常段落，又能抓住真正靠重复凑字数的灌水译文。
   */
  if (redundancy > REDUNDANCY_FLOOR && redundancy - refRedundancy > REDUNDANCY_MARGIN) {
    score -= 4
    issues.push(`内容词重复率偏高（${Math.round(redundancy * 100)}%），注意用词多样性`)
  }

  if (spellingIssues.length) {
    score -= Math.min(4, spellingIssues.length * 2)
    issues.push(`疑似拼写错误 ${spellingIssues.length} 处`)
  }

  return { score: Math.max(0, score), issues }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
