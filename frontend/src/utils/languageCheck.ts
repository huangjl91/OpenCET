/**
 * 句子级语言检查：拼写 + 语法。
 *
 * 设计上只做**低误报**的判定 —— 一个把正确句子标红的检查器比没有检查器更糟，
 * 用户会直接不看了。所以：
 *   - 拼写不是「在不在词典里」（词典永远收不全），而是**是否和某个正确词只差一个字母**
 *     （`developmant` → `development`）；能通过词形变化还原成正确词的也不报
 *     （`improves` 是 `improve` 的变形，不是错拼）。
 *   - 语法只收录** unambiguous** 的搭配错误，宁可漏报不误报：
 *     每个规则都拿站内 72 条自己写的范文（36 例句 + 36 参考答案）验证过，
 *     有一条误报就说明规则太激进，得收窄。
 *
 * 真要做到全面还得靠 AI 点评（需要配 Key），这里是**离线可用的第一道筛子**。
 */
import { SPELL_SET, TEACH_SET } from './spellWords'

export type IssueKind = 'spelling' | 'grammar' | 'punctuation'

export interface LanguageIssue {
  kind: IssueKind
  /** 出问题的原文片段（给界面高亮用） */
  snippet: string
  /** 给人看的一句话 */
  message: string
  /** 建议改成什么；没有就空串 */
  suggest: string
}

/* ==================================================================== */
/* 拼写                                                                  */
/* ==================================================================== */

/** 距离 ≤1（含一次相邻换位，如 recieve → receive） */
export function within1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false

  if (la === lb) {
    let i = 0
    while (i < la && a[i] === b[i]) i++
    if (i === la) return true
    // 相邻两字母写反了
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true
    // 单个字母写错
    return a.slice(i + 1) === b.slice(i + 1)
  }

  const short = la < lb ? a : b
  const long = la < lb ? b : a
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  return short.slice(i) === long.slice(i + 1)
}

/**
 * 把可能的词形变化还原成原形候选。
 * 用来避免把 `improves` / `stopped` / `studies` 判成拼写错。
 */
export function baseForms(w: string): string[] {
  const out: string[] = []
  const push = (s: string) => {
    if (s.length >= 2 && !out.includes(s)) out.push(s)
  }
  if (w.endsWith('ies')) push(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) push(w.slice(0, -2))
  if (w.endsWith('s')) push(w.slice(0, -1))
  if (w.endsWith('ed')) {
    push(w.slice(0, -2))
    push(w.slice(0, -1))
  }
  if (w.endsWith('ing')) {
    push(w.slice(0, -3))
    push(w.slice(0, -3) + 'e')
  }
  if (w.endsWith('est')) push(w.slice(0, -3))
  if (w.endsWith('er')) {
    push(w.slice(0, -2))
    push(w.slice(0, -1))
  }
  if (w.endsWith('ly')) push(w.slice(0, -2))
  // 双写末辅音：stopped → stop
  const m = w.match(/^(.*?)([bdgklmnprt])\2(ed|ing|er|est)$/)
  if (m) push(m[1] + m[2])
  return out
}

/**
 * 按长度分桶，避免每个生词都扫全表。桶里只放**教学词**。
 *
 * 候选池用教学词而不是全语料：真题原文里什么词都有，
 * `status` 会被「纠正」成 `states`、`dairy` 成 `daily`、`prosper` 成 `proper`。
 */
const byLen = new Map<number, string[]>()
for (const w of TEACH_SET) {
  const arr = byLen.get(w.length)
  if (arr) arr.push(w)
  else byLen.set(w.length, [w])
}

/** 找出教学词里与 `w` 只差一个字母的词；没有返回 null */
export function nearestWord(w: string): string | null {
  for (const len of [w.length - 1, w.length, w.length + 1]) {
    for (const cand of byLen.get(len) ?? []) {
      if (within1(w, cand)) return cand
    }
  }
  return null
}

/** 短词太容易和别的词撞车，不判拼写；这几个经典错拼单独列出来 */
const SHORT_TYPOS: Record<string, string> = {
  teh: 'the',
  adn: 'and',
  taht: 'that',
  hte: 'the',
  ot: 'to',
  fo: 'of',
  si: 'is',
  itn: 'int',
  wich: 'which',
  thier: 'their',
  ther: 'there',
  recieve: 'receive',
  beleive: 'believe',
  acheive: 'achieve',
  occured: 'occurred',
  begining: 'beginning',
  definately: 'definitely',
  seperate: 'separate',
  goverment: 'government',
  enviroment: 'environment',
  tomorow: 'tomorrow',
  untill: 'until',
  wich2: 'which',
}

/**
 * 拼写检查。
 *
 * 跳过：长度 ≤2 的词、词典里的词、能还原成词典词的词形变化。
 * 命中：与某个词典词只差一个字母（含换位），或命中已知错拼表。
 */
export function checkSpelling(text: string): LanguageIssue[] {
  const out: LanguageIssue[] = []
  const seen = new Set<string>()

  for (const raw of (text ?? '').match(/[A-Za-z][A-Za-z'-]*/g) ?? []) {
    const w = raw.replace(/^['-]+|['-]+$/g, '').toLowerCase()
    if (!w || seen.has(w)) continue
    if (SPELL_SET.has(w)) continue
    if (baseForms(w).some((b) => SPELL_SET.has(b))) continue
    seen.add(w)

    const known = SHORT_TYPOS[w]
    if (known) {
      out.push({ kind: 'spelling', snippet: raw, message: `拼写错了：${raw} 应为 ${known}`, suggest: known })
      continue
    }
    // 太短的词（3 个字母以内）近邻太多，误报率高，只认上表
    if (w.length <= 3) continue

    const near = nearestWord(w)
    if (!near) continue
    // 反向词形变化：候选词是当前词的变形（contain ← contains / celebrate ← celebrated），
    // 那当前词本身就对，只是词典里只收了变形。
    if (baseForms(near).includes(w)) continue
    out.push({ kind: 'spelling', snippet: raw, message: `拼写可能有误：${raw} → ${near}`, suggest: near })
  }
  return out
}

/* ==================================================================== */
/* 语法                                                                  */
/* ==================================================================== */

/** 无歧义的实义动词：原形 ↔ 第三人称单数。刻意避开名词/形容词兼用的词（work/change/love…），
 *  否则「The only constant is change」这种正确句子会被判成「is + 动词原形」的错。 */
const VERB_FORMS: [string, string][] = [
  ['go', 'goes'], ['come', 'comes'], ['make', 'makes'], ['take', 'takes'], ['do', 'does'],
  ['know', 'knows'], ['think', 'thinks'], ['get', 'gets'], ['eat', 'eats'], ['sleep', 'sleeps'],
  ['arrive', 'arrives'], ['happen', 'happens'], ['exist', 'exists'], ['belong', 'belongs'],
  ['appear', 'appears'], ['disappear', 'disappears'], ['become', 'becomes'], ['seem', 'seems'],
  ['receive', 'receives'], ['achieve', 'achieves'], ['prefer', 'prefers'], ['refuse', 'refuses'],
  ['arrange', 'arranges'], ['attend', 'attends'], ['compare', 'compares'], ['complain', 'complains'],
  ['concentrate', 'concentrates'], ['consist', 'consists'], ['depend', 'depends'],
  ['deserve', 'deserves'], ['escape', 'escapes'], ['hesitate', 'hesitates'], ['insist', 'insists'],
  ['participate', 'participates'], ['persuade', 'persuades'], ['pretend', 'pretends'],
  ['rely', 'relies'], ['respond', 'responds'], ['succeed', 'succeeds'], ['suffer', 'suffers'],
  ['volunteer', 'volunteers'], ['apologize', 'apologizes'], ['graduate', 'graduates'],
  ['compete', 'competes'], ['have', 'has'], ['be', 'is'],
]

const SAFE_BASE = VERB_FORMS.map((v) => v[0])
const SAFE_THIRD = VERB_FORMS.map((v) => v[1])

/** 动词原形 → 第三人称单数 */
function thirdOf(base: string): string {
  return VERB_FORMS.find((v) => v[0] === base)?.[1] ?? base + 's'
}
/** 第三人称单数 → 动词原形 */
function baseOf(third: string): string {
  return VERB_FORMS.find((v) => v[1] === third)?.[0] ?? third.replace(/es$/, '').replace(/s$/, '')
}

/** 介词（后面接动词要用动名词，不能接原形） */
const PREPS = ['in', 'of', 'for', 'by', 'with', 'about', 'without', 'after', 'before', 'from', 'at', 'on', 'into', 'through', 'against', 'upon']

/** 比较级 / 最高级（不能再加 more / most） */
const COMPARATIVES = [
  'better', 'worse', 'more', 'less', 'fewer', 'easier', 'harder', 'faster', 'slower',
  'higher', 'lower', 'bigger', 'smaller', 'longer', 'shorter', 'older', 'younger',
  'stronger', 'weaker', 'richer', 'poorer', 'earlier', 'later', 'further', 'farther',
  'greater', 'safer', 'closer', 'cheaper', 'busier', 'happier', 'healthier',
]
const SUPERLATIVES = [
  'best', 'worst', 'most', 'least', 'fewest', 'easiest', 'hardest', 'fastest', 'slowest',
  'highest', 'lowest', 'biggest', 'smallest', 'longest', 'shortest', 'oldest', 'youngest',
  'strongest', 'weakest', 'richest', 'poorest', 'earliest', 'latest', 'greatest', 'safest',
  'closest', 'cheapest', 'busiest', 'happiest', 'healthiest',
]

/** 不可数 / 单数名词（前面不用 many） */
const UNCOUNTABLE = [
  'information', 'money', 'water', 'homework', 'advice', 'news', 'furniture',
  'equipment', 'luggage', 'baggage', 'progress', 'knowledge', 'research',
  'traffic', 'weather', 'bread', 'music', 'work', 'time', 'help', 'evidence',
]

const list = (a: string[]) => a.join('|')
/**
 * 规则正则**不能带 g 标志**：带 g 时 `String.match` 返回的是所有匹配的字符串数组，
 * 捕获组取不到（m[1] 会是下一个匹配而不是分组），调试起来很费劲。
 */
const re = (s: string) => new RegExp(s, 'i')

/**
 * 语法检查。每条规则都写清楚「为什么错、应该怎么改」。
 *
 * 只做搭配层面的硬错（主谓一致、情态动词、冠词、搭配），
 * 不做句法分析 —— 那需要真正的解析器，靠正则会做出一堆误报。
 */
export function checkGrammar(text: string): LanguageIssue[] {
  const out: LanguageIssue[] = []
  const t = text ?? ''
  const add = (kind: IssueKind, snippet: string, message: string, suggest = '') =>
    out.push({ kind, snippet, message, suggest })

  /* 主谓一致：第三人称单数主语 + 动词原形 */
  {
    const m = t.match(re(`\\b(he|she|it|this|everyone|everybody|someone|somebody|nobody|anyone|anybody|each)\\s+(${list(SAFE_BASE)})\\b`))
    if (m) {
      const fixed = thirdOf(m[2])
      add('grammar', m[0], `主谓不一致：「${m[1]}」是第三人称单数，动词要用 ${fixed}`, `${m[1]} ${fixed}`)
    }
  }

  /* 情态动词后不能加 to */
  {
    const m = t.match(re('\\b(can|could|may|might|must|should)\\s+to\\s+([a-z]+)'))
    if (m) add('grammar', m[0], `情态动词 ${m[1]} 后面直接跟动词原形，不用 to`, `${m[1]} ${m[2]}`)
  }

  /* 情态动词 / to 后面用第三人称单数 */
  {
    const m = t.match(re(`\\b(can|could|may|might|must|should|would|will|shall|to)\\s+(${list(SAFE_THIRD)})\\b`))
    if (m) {
      const base = baseOf(m[2])
      add('grammar', m[0], `「${m[1]}」后面要用动词原形 ${base}，不能用第三人称单数`, `${m[1]} ${base}`)
    }
  }

  /* 冠词：a / an 看读音，不看字母 */
  {
    const m = t.match(re('\\ba\\s+([aeiou][a-z]{2,})\\b'))
    if (m) {
      const w = m[1]
      const vowelSound = !/^(uni|use|usu|eu|one|once|ubiq|util|urol)/.test(w)
      if (vowelSound) add('grammar', m[0], `「${w}」以元音音素开头，要用 an`, `an ${w}`)
    }
    const m2 = t.match(re('\\ban\\s+([bcdfgjklmnpqrstvwxyz][a-z]{2,})\\b'))
    if (m2) {
      const w = m2[1]
      // h 开头可能是哑音（hour / honest / honor）
      if (!/^h(our|onest|onor|onour)/.test(w)) add('grammar', m2[0], `「${w}」以辅音音素开头，要用 a`, `a ${w}`)
    }
    // u 开头的词读 /juː/ 时用 a：a useful / a university / a European
    const m3 = t.match(re('\\ban\\s+((?:uni|use|usu|eu|ubiq|util)[a-z]*)\\b'))
    if (m3) add('grammar', m3[0], `「${m3[1]}」读作 /juː/ 开头，是辅音音素，要用 a`, `a ${m3[1]}`)
  }

  /* many / much 搭配 */
  {
    const m = t.match(re(`\\bmany\\s+(${list(UNCOUNTABLE)})\\b`))
    if (m) add('grammar', m[0], `「${m[1]}」不可数，前面要用 much 或 a great deal of`, `much ${m[1]}`)
    const m2 = t.match(re('\\bmuch\\s+([a-z]{3,}s)\\b'))
    if (m2 && !/(ss|us|sis|ics|news)$/.test(m2[1])) {
      add('grammar', m2[0], `「${m2[1]}」是可数名词复数，前面要用 many`, `many ${m2[1]}`)
    }
  }

  /* every / each + 复数名词 */
  {
    const m = t.match(re('\\b(every|each)\\s+([a-z]{3,}s)\\b'))
    if (m && !/(ss|us|ics|news|means|series|species)$/.test(m[2])) {
      add('grammar', m[0], `「${m[1]}」后面接单数名词`, `${m[1]} ${m[2].replace(/s$/, '')}`)
    }
  }

  /* 比较级叠加：more better / most easiest */
  {
    const m = t.match(re(`\\bmore\\s+(${list(COMPARATIVES)})\\b`))
    if (m) add('grammar', m[0], `「${m[1]}」本身已是比较级，前面不用再加 more`, m[1])
    const m2 = t.match(re(`\\bmost\\s+(${list(SUPERLATIVES)})\\b`))
    if (m2) add('grammar', m2[0], `「${m2[1]}」本身已是最高级，前面不用再加 most`, m2[1])
  }

  /* 介词后面接动词原形（要用动名词） */
  {
    const m = t.match(re(`\\b(${list(PREPS)})\\s+(${list(SAFE_BASE)})\\b`))
    if (m) {
      const v = m[2]
      const ger = /e$/.test(v) ? v.slice(0, -1) + 'ing' : v + 'ing'
      add('grammar', m[0], `介词 ${m[1]} 后面要用动名词 ${ger}`, `${m[1]} ${ger}`)
    }
  }

  /* its → it's（后接冠词或形容词时几乎一定是 it is） */
  {
    const m = t.match(re('\\bits\\s+(a|an|the|not|very|important|essential|necessary|possible|clear|true|hard|easy)\\b'))
    if (m) add('grammar', m[0], `这里应该是 it is，写成 it's`, `it's ${m[1]}`)
  }

  /* 比较级后用 then */
  {
    const m = t.match(re('\\b(more|less|better|worse|rather|other)\\s+[a-z]+\\s+then\\b'))
    if (m) add('grammar', m[0], `比较「比……」用 than，不用表示时间的 then`, m[0].replace(/then$/, 'than'))
    const m2 = t.match(re('\\bdifferent\\s+then\\b'))
    if (m2) add('grammar', m2[0], `different from / different than 里不用 then`, 'different than')
  }

  /* 中式标点混入 */
  {
    const m = t.match(/[，。、；：！？（）【】《》“”‘’]/)
    if (m) add('punctuation', m[0], `英文句子要用半角标点，把「${m[0]}」换掉`, '')
  }

  /* 标点后缺空格 */
  {
    const m = t.match(/[a-z][,;:][A-Za-z]/)
    if (m) add('punctuation', m[0], `标点后面要空一格`, m[0][0] + m[0][1] + ' ' + m[0][2])
    const m2 = t.match(/[a-z]\.[A-Z][a-z]/)
    if (m2) add('punctuation', m2[0], `句号后面要空一格`, m2[0][0] + '. ' + m2[0][2])
  }

  return out
}

/** 拼写 + 语法一起 */
export function checkLanguage(text: string): LanguageIssue[] {
  return [...checkSpelling(text), ...checkGrammar(text)]
}
