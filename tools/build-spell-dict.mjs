/**
 * 生成作文页「检查句式」用的拼写词典。
 *
 * 词典来源是**站内全部真实英文内容**（词库例句 + 翻译题库 + 真题原文），
 * 而不是只取四六级大纲词 —— 大纲词里没有 the / and / is 这类功能词，
 * 拿它当词典会把正常句子全判成拼写错。
 *
 * 用近似匹配（见 frontend/src/utils/languageCheck.ts）而不是「在不在词典里」：
 * 词典永远不可能收全，但「一个词和某个正确词只差一个字母」这件事本身就很可疑。
 *
 * 用法：node tools/build-spell-dict.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'frontend/src/utils/spellWords.ts')

const WORDS_RE = /[A-Za-z][A-Za-z'-]*/g
/** 这些字段是元数据，不是英文内容 */
const SKIP_KEYS = new Set([
  'id',
  'level',
  'type',
  'pos',
  'phonetic',
  'source',
  'category',
  'difficulty',
  'freqRank',
  'answerKey',
  'id',
])

const bag = new Map()
/**
 * 教学词集合：**只用来当改错候选**。
 *
 * 语料（真题原文）里什么词都有，拿它当候选池会出笑话 ——
 * `status` 会被「纠正」成 `states`、`dairy` 成 `daily`、`prosper` 成 `proper`，
 * 因为这些生僻的邻居恰好在真题里出现过。候选池必须是**我们真正教过的词**。
 */
const teach = new Map()

function eat(text) {
  if (typeof text !== 'string') return
  for (const m of text.match(WORDS_RE) ?? []) {
    const w = m.replace(/^['-]+|['-]+$/g, '').toLowerCase()
    if (w.length >= 1) bag.set(w, (bag.get(w) ?? 0) + 1)
  }
}

function teach_(text) {
  if (typeof text !== 'string') return
  for (const m of text.match(WORDS_RE) ?? []) {
    const w = m.replace(/^['-]+|['-]+$/g, '').toLowerCase()
    if (w.length >= 2) teach.set(w, (teach.get(w) ?? 0) + 1)
  }
}

function walk(o) {
  if (typeof o === 'string') eat(o)
  else if (Array.isArray(o)) o.forEach(walk)
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (SKIP_KEYS.has(k)) continue
      walk(v)
    }
  }
}

for (const f of ['shared/words.json', 'shared/translations.json', 'shared/papers.json']) {
  const full = path.join(ROOT, f)
  if (!fs.existsSync(full)) {
    console.error('缺少数据文件：' + f)
    process.exit(1)
  }
  walk(JSON.parse(fs.readFileSync(full, 'utf8')))
  console.log('已读取 ' + f)
}

/* ---- 教学词：背单词表的词条本身 + 翻译核心词 + 翻译常用词汇表 ---- */
{
  const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/words.json'), 'utf8'))
  const list = Array.isArray(words) ? words : words.list ?? []
  // 只取词条本身，不取例句 —— 例句里的词形（states / celebrated）会把候选池撑脏
  for (const w of list) teach_(w.word ?? '')
  console.log(`教学词：词库词条 ${list.length} 条`)

  const tr = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/translations.json'), 'utf8'))
  const tlist = Array.isArray(tr) ? tr : tr.list ?? []
  let core = 0
  for (const q of tlist) {
    for (const cw of q.coreWords ?? []) {
      teach_(cw.en ?? '')
      core++
    }
  }
  console.log(`教学词：翻译核心词 ${core} 条`)

  const vocabPath = path.join(ROOT, 'shared/translation-vocab.json')
  if (fs.existsSync(vocabPath)) {
    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'))
    for (const v of vocab) {
      teach_(v.en ?? '')
      eat(v.en ?? '')
      eat(v.zh ?? '')
    }
    console.log(`教学词：翻译常用词汇 ${vocab.length} 条`)
  }
}

/* ---- 教学页里手写的英文（词典里不能只有题库的词，否则自己的范文都会被判错拼） ---- */
for (const f of ['frontend/src/utils/writingGuide.ts', 'frontend/src/utils/readingGuide.ts']) {
  const full = path.join(ROOT, f)
  if (!fs.existsSync(full)) continue
  const src = fs.readFileSync(full, 'utf8')
  // 只取字符串字面量，避免把 export / const 这类代码标识符当成英文单词收进来
  for (const m of src.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)) {
    const s = m[1] ?? m[2] ?? ''
    eat(s)
    teach_(s)
  }
  console.log('已读取 ' + f + '（字符串字面量）')
}

/**
 * 补充词表。语料里必然缺这些：
 *   - **不规则动词的过去式/过去分词**（paid / went / bought…），词形还原规则还原不出来
 *   - **英美拼写变体**（favor/favour、color/colour…），语料里可能只有其中一种
 *   - 少量语料没覆盖到的常用词
 * 缺词会让「近似匹配」把正确写法判成错拼，所以这份表是必要的。
 */
const EXTRA_WORDS = [
  // 不规则动词
  'paid', 'went', 'bought', 'brought', 'thought', 'taught', 'caught', 'found', 'held',
  'kept', 'left', 'lost', 'made', 'meant', 'met', 'said', 'sold', 'sent', 'sat', 'spent',
  'stood', 'took', 'told', 'understood', 'won', 'wore', 'wrote', 'built', 'chose', 'drew',
  'drove', 'felt', 'fought', 'flew', 'forgot', 'got', 'gave', 'grew', 'heard', 'knew',
  'led', 'lay', 'ran', 'rose', 'saw', 'sang', 'spoke', 'swam', 'threw', 'began', 'broke',
  'came', 'did', 'drank', 'ate', 'fell', 'hid', 'hit', 'hurt', 'let', 'put', 'read', 'rode',
  'shook', 'shone', 'shot', 'shut', 'slept', 'spread', 'stole', 'stuck', 'swept', 'swore',
  'woke', 'wore', 'wound', 'became', 'arose', 'awoke', 'bore', 'beat', 'bound', 'dealt',
  'dug', 'fed', 'froze', 'hung', 'laid', 'lit', 'overcame', 'quit', 'rang', 'sank', 'sought',
  'sped', 'split', 'sprang', 'struck', 'swung', 'tore', 'undertook', 'wound',
  // 英美拼写变体
  'favor', 'favorable', 'favorite', 'color', 'colorful', 'honor', 'honorable', 'humor',
  'labor', 'neighbor', 'neighborhood', 'behavior', 'rumor', 'vapor', 'flavor', 'armor',
  'center', 'centered', 'meter', 'liter', 'theater', 'fiber', 'somber', 'caliber',
  'organize', 'organized', 'organizing', 'organization', 'realize', 'realized', 'realizing',
  'recognize', 'recognized', 'analyze', 'analyzed', 'apologize', 'apologized', 'criticize',
  'emphasize', 'emphasized', 'memorize', 'minimize', 'maximize', 'summarize', 'specialize',
  'defense', 'offense', 'license', 'practice', 'practise', 'program', 'programs', 'catalog',
  'dialog', 'analog', 'traveled', 'traveling', 'traveler', 'canceled', 'modeled', 'labeled',
  'favour', 'favourite', 'colour', 'honour', 'humour', 'labour', 'neighbour', 'behaviour',
  'centre', 'metre', 'litre', 'theatre', 'fibre', 'organise', 'realise', 'recognise',
  'analyse', 'apologise', 'criticise', 'emphasise', 'memorise', 'minimise', 'maximise',
  'summarise', 'specialise', 'defence', 'offence', 'licence', 'programme', 'catalogue',
  'dialogue', 'travelled', 'travelling', 'traveller', 'cancelled', 'modelled', 'labelled',
  // 语料里可能缺的常用词
  'cite', 'varied', 'regulation', 'regulations', 'conducive', 'detrimental', 'tremendous',
  'crucial', 'numerous', 'exceedingly', 'beneficial', 'ultimately', 'demonstrate',
  'acknowledged', 'sustainable', 'harmonious', 'prospect', 'promising', 'priority',
  'awareness', 'regulation', 'phenomenon', 'phenomena', 'decade', 'decades', 'trend',
  'trends', 'factor', 'factors', 'aspect', 'aspects', 'issue', 'issues', 'measure',
  'measures', 'solution', 'solutions', 'approach', 'approaches', 'benefit', 'benefits',
  'drawback', 'drawbacks', 'merit', 'merits', 'demerit', 'demerits', 'shortcoming',
  'shortcomings', 'advantage', 'advantages', 'disadvantage', 'disadvantages', 'efficient',
  'efficiency', 'effective', 'effectively', 'essential', 'significant', 'significance',
  'substantial', 'considerable', 'adequate', 'appropriate', 'approximately', 'eventually',
  'furthermore', 'moreover', 'nevertheless', 'nonetheless', 'therefore', 'thus', 'hence',
  'consequently', 'accordingly', 'similarly', 'likewise', 'conversely', 'otherwise',
  'whereas', 'whilst', 'although', 'though', 'despite', 'regardless', 'whether',
  'billion', 'million', 'thousand', 'hundred', 'percent', 'percentage', 'average',
  'increase', 'increased', 'increasing', 'decrease', 'decreased', 'decreasing', 'decline',
  'declined', 'rise', 'rose', 'risen', 'growth', 'grow', 'grew', 'grown', 'expand',
  'expanded', 'expansion', 'reduce', 'reduced', 'reduction', 'improve', 'improved',
  'improvement', 'promote', 'promoted', 'promotion', 'enhance', 'enhanced', 'ensure',
  'ensure', 'provide', 'provided', 'providing', 'require', 'required', 'requirement',
  'achieve', 'achieved', 'achievement', 'succeed', 'succeeded', 'success', 'successful',
  'successfully', 'fail', 'failed', 'failure', 'effort', 'efforts', 'attempt', 'attempts',
  'opportunity', 'opportunities', 'challenge', 'challenges', 'challenging', 'responsibility',
  'responsibilities', 'responsible', 'contribute', 'contributed', 'contribution',
  'communicate', 'communication', 'cooperate', 'cooperation', 'participate', 'participation',
  'environment', 'environmental', 'pollution', 'polluted', 'protect', 'protection',
  'preserve', 'preservation', 'resource', 'resources', 'energy', 'renewable', 'recycle',
  'recycling', 'waste', 'wasted', 'climate', 'emission', 'emissions', 'carbon', 'ecosystem',
  'technology', 'technological', 'digital', 'online', 'internet', 'website', 'software',
  'hardware', 'device', 'devices', 'application', 'applications', 'platform', 'platforms',
  'education', 'educational', 'educate', 'educated', 'student', 'students', 'teacher',
  'teachers', 'school', 'schools', 'university', 'universities', 'college', 'colleges',
  'graduate', 'graduates', 'graduation', 'degree', 'degrees', 'knowledge', 'skill', 'skills',
  'ability', 'abilities', 'talent', 'talents', 'potential', 'intelligence', 'intelligent',
  'creative', 'creativity', 'innovation', 'innovative', 'culture', 'cultural', 'tradition',
  'traditional', 'heritage', 'custom', 'customs', 'festival', 'festivals', 'history',
  'historical', 'society', 'social', 'economy', 'economic', 'economical', 'politics',
  'political', 'government', 'policy', 'policies', 'law', 'laws', 'legal', 'illegal',
  'population', 'citizen', 'citizens', 'public', 'private', 'individual', 'individuals',
  'community', 'communities', 'family', 'families', 'parent', 'parents', 'child', 'children',
  'teenager', 'teenagers', 'youth', 'adult', 'adults', 'elderly', 'generation', 'generations',
  'health', 'healthy', 'unhealthy', 'disease', 'diseases', 'medical', 'medicine', 'hospital',
  'exercise', 'exercises', 'diet', 'nutrition', 'mental', 'physical', 'psychological',
  'stress', 'pressure', 'anxiety', 'confident', 'confidence', 'optimistic', 'pessimistic',
  'positive', 'negative', 'attitude', 'attitudes', 'behavior', 'behavioral', 'habit',
  'habits', 'personality', 'character', 'quality', 'qualities', 'virtue', 'virtues',
  'honest', 'honesty', 'sincere', 'sincerity', 'patient', 'patience', 'persistent',
  'persistence', 'diligent', 'diligence', 'independent', 'independence', 'reliable',
  'reliability', 'responsible', 'generous', 'modest', 'humble', 'courage', 'courageous',
  'ambitious', 'ambition', 'enthusiasm', 'enthusiastic', 'curious', 'curiosity',
]

let extraNew = 0
for (const w of EXTRA_WORDS) {
  const k = w.toLowerCase().trim()
  if (!k) continue
  if (!bag.has(k)) extraNew++
  bag.set(k, (bag.get(k) ?? 0) + 1)
}
console.log(`补充词表 ${EXTRA_WORDS.length} 条，其中新增 ${extraNew} 条`)

/**
 * 常被拼错的词：**同时进词典和候选池**。
 *
 * 这些词多半不是背单词表的词条，但恰恰是四六级写作里最常写错的一批。
 * 不放进候选池的话，`definitly` / `seperate` 这类错拼就找不到正确写法了。
 */
const SPELL_TARGETS = [
  'definitely', 'separate', 'receive', 'achieve', 'believe', 'occurred', 'occurring',
  'beginning', 'environment', 'government', 'necessary', 'necessarily', 'accommodate',
  'accommodation', 'embarrass', 'recommend', 'recommendation', 'tomorrow', 'until',
  'foreign', 'business', 'colleague', 'committee', 'conscious', 'convenient',
  'correspond', 'curiosity', 'develop', 'development', 'difference', 'difficult',
  'disappoint', 'excellent', 'exercise', 'experience', 'familiar', 'finally', 'forty',
  'fourth', 'friend', 'generally', 'grammar', 'immediately', 'independent', 'interest',
  'knowledge', 'library', 'maintain', 'management', 'necessary', 'opinion', 'opportunity',
  'particular', 'performance', 'permanent', 'persuade', 'possess', 'practical', 'preferred',
  'prejudice', 'privilege', 'probably', 'professional', 'pronunciation', 'publicly',
  'questionnaire', 'really', 'receive', 'referred', 'religion', 'responsible', 'restaurant',
  'rhythm', 'schedule', 'secretary', 'sincerely', 'successful', 'surprise', 'temperature',
  'tendency', 'therefore', 'throughout', 'truly', 'unfortunately', 'unusual', 'usually',
  'vacuum', 'vehicle', 'Wednesday', 'whether', 'writing', 'written',
]

for (const w of SPELL_TARGETS) {
  const k = w.toLowerCase()
  bag.set(k, (bag.get(k) ?? 0) + 1)
  teach.set(k, (teach.get(k) ?? 0) + 1)
}
console.log(`常被拼错的词 ${new Set(SPELL_TARGETS.map((w) => w.toLowerCase())).size} 条已并入词典与候选池`)

// 教过的词一律算「正常单词」——否则自己的教学内容会被判成错拼
for (const w of teach.keys()) bag.set(w, (bag.get(w) ?? 0) + 1)


const words = [...bag.keys()].sort()
const body = words.map((w) => JSON.stringify(w)).join(', ')

const teachWords = [...teach.keys()].filter((w) => bag.has(w)).sort()
const teachBody = teachWords.map((w) => JSON.stringify(w)).join(', ')

const out = `/**
 * 拼写检查词典 —— **自动生成，不要手改**。
 *
 * 生成脚本：node tools/build-spell-dict.mjs
 *
 * 两个词表，用途不同：
 *
 *   SPELL_WORDS（${words.length} 个）—— 「这是不是一个正常单词」。
 *     来自站内全部英文：背单词词库、翻译题库与参考译文、真题原文与选项、教学页手写内容。
 *     判断宽松没关系，它的作用是**别把正确写法当错拼**。
 *
 *   TEACH_WORDS（${teachWords.length} 个）—— 「改错该改成什么」。
 *     只收我们真正教过的词：背单词词条本身 + 翻译核心词 + 翻译常用词汇 + 教学页手写内容。
 *     候选池必须是干净的 —— 拿真题原文当候选池会出笑话：
 *     status 会被「纠正」成 states、dairy 成 daily、prosper 成 proper，
 *     因为这些生僻的邻居恰好在真题里出现过。
 *
 * 判定逻辑见 utils/languageCheck.ts：不是「在不在词典里」，而是
 * 「是否和某个**教学词**只差一个字母」。
 */
export const SPELL_WORDS: string[] = [${body}]

/** 「这是不是一个正常单词」用（宽松，避免误报） */
export const SPELL_SET: Set<string> = new Set(SPELL_WORDS)

/** 改错候选池（只含教学词） */
export const TEACH_WORDS: string[] = [${teachBody}]

export const TEACH_SET: Set<string> = new Set(TEACH_WORDS)
`

fs.writeFileSync(OUT, out, 'utf8')
console.log(`\n已写入 ${path.relative(ROOT, OUT)}`)
console.log(`词典词数 ${words.length}，候选词数 ${teachWords.length}，文件 ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`)
const short = words.filter((w) => w.length <= 2)
console.log(`其中长度 ≤2 的 ${short.length} 个（判定时会跳过）`)
