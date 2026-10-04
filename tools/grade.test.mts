/**
 * 翻译评分引擎回归测试（前端启发式实现，规则与后端 TranslationGrader.java 一致）
 *
 * 覆盖此前 4 条局限对应的新能力：
 *   1. 语序/搭配 —— 词组内各词位置跨度过大时折半计分（REORDER）
 *   2. 冗余 —— 篇幅贴合对"过长"罚分更重
 *   3. 词形还原 —— 不规则变化（went/children/better）能识别为命中
 *   4. 拼写 —— 近形拼写错误记半分并给出提示，不再一错全丢
 */
import { grade, stem, distance, W_CORE, W_LENGTH, W_LANGUAGE } from '../frontend/src/utils/grade'
import type { CoreWord } from '../frontend/src/types'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const core: CoreWord[] = [
  { en: 'traditional folk art', zh: '传统民间艺术' },
  { en: 'understand', zh: '理解' },
  { en: 'important', zh: '重要的' },
]

const reference =
  'Paper cutting is a traditional folk art in China. People can understand its important role in culture.'

console.log('加权分之和 = 100:', W_CORE + W_LENGTH + W_LANGUAGE === 100 ? 'OK' : 'FAIL')

/* ---------- 1. 词形还原（不规则变化） ---------- */
console.log('\n[1] 词形还原（局限 3）')
check('stem(went) = go', stem('went') === 'go', stem('went'))
check('stem(children) = child', stem('children') === 'child', stem('children'))
check('stem(better) = good', stem('better') === 'good', stem('better'))
check('stem(running) = run', stem('running') === 'run', stem('running'))

const irregular = grade(
  'Paper cutting is a traditional folk art in China. People understood its important role in culture.',
  reference,
  core
)
check(
  'understood 仍算命中 understand',
  irregular.hit.includes('understand'),
  JSON.stringify(irregular.hit) + ' miss=' + JSON.stringify(irregular.miss)
)

// e 结尾动词的 -ed / -ing 变形（improve → improved / improving）
const eEnding = grade(
  'Reading can improve our knowledge, and it also improves our writing ability.',
  'Reading can improve our knowledge and improve our writing ability.',
  [{ en: 'improve', zh: '提高' }]
)
check(
  'improves 命中 improve（e 结尾词干还原）',
  eEnding.hit.includes('improve'),
  JSON.stringify(eEnding.hit) + ' miss=' + JSON.stringify(eEnding.miss)
)
const eEnding2 = grade(
  'The government has increased investment in education.',
  'The government has increased investment in education.',
  [{ en: 'increase', zh: '增加' }]
)
check(
  'increased 命中 increase',
  eEnding2.hit.includes('increase'),
  JSON.stringify(eEnding2.hit) + ' miss=' + JSON.stringify(eEnding2.miss)
)
const eEnding3 = grade(
  'The city is developing rapidly.',
  'The city is developing rapidly.',
  [{ en: 'develop', zh: '发展' }]
)
check('developing 命中 develop（双写/常规后缀）', eEnding3.hit.includes('develop'), JSON.stringify(eEnding3.hit))

/* ---------- 2. 语序 / 搭配（词组跨度） ---------- */
console.log('\n[2] 语序与搭配（局限 1）')
const inOrder = grade(
  'Paper cutting is a traditional folk art in China. People understand its important role in culture.',
  reference,
  core
)
const scrambled = grade(
  'Paper cutting is a folk art which is traditional in China. People understand its important role in culture.',
  reference,
  core
)
check(
  '正常语序 → 满分命中',
  inOrder.hit.includes('traditional folk art'),
  JSON.stringify(inOrder.hit)
)
check(
  '词组被拆散且跨度大 → 记为语序存疑',
  scrambled.reorder.includes('traditional folk art'),
  JSON.stringify(scrambled.hit) + ' reorder=' + JSON.stringify(scrambled.reorder)
)
check('语序存疑题得分低于正常语序题', scrambled.score < inOrder.score, `${scrambled.score} vs ${inOrder.score}`)

/* ---------- 3. 拼写近似 ---------- */
console.log('\n[3] 拼写近似（局限 1 & 3）')
const misspelled = grade(
  'Paper cutting is a traditional folk art in China. People can understnad its important role in culture.',
  reference,
  core
)
check(
  'understnad → 记为拼写近似（expected=understand）',
  misspelled.near.some((n) => n.expected === 'understand' && n.found === 'understnad'),
  JSON.stringify(misspelled.near)
)
check('编辑距离 understnad↔understand = 2', distance('understnad', 'understand') === 2)
check(
  '拼写近似仍拿到一半核心词分',
  misspelled.breakdown.coreScore > 0 && misspelled.breakdown.coreScore < W_CORE,
  String(misspelled.breakdown.coreScore)
)
check(
  '参考译文比对能识别拼写疑似错误',
  misspelled.breakdown.spellingIssues.length > 0,
  JSON.stringify(misspelled.breakdown.spellingIssues)
)

/* ---------- 4. 冗余与篇幅（不对称罚分） ---------- */
console.log('\n[4] 冗余与篇幅（局限 2）')
const good = grade(
  'Paper cutting is a traditional folk art in China. People understand its important role in culture.',
  reference,
  core
)
const padded = grade(
  'Paper cutting is a traditional folk art in China. Paper cutting is very very traditional. People understand its important important role in culture and it is important.',
  reference,
  core
)
check(
  '灌水译文篇幅得分低于贴合译文',
  padded.breakdown.lengthScore < good.breakdown.lengthScore,
  `${padded.breakdown.lengthScore} vs ${good.breakdown.lengthScore}`
)
check(
  '灌水译文被检出高频重复词',
  padded.breakdown.repeatedWords.length > 0,
  JSON.stringify(padded.breakdown.repeatedWords)
)
check('灌水译文总分低于贴合译文', padded.score < good.score, `${padded.score} vs ${good.score}`)
check(
  '过短同样罚分（不对称的另一侧）',
  grade('Paper cutting is art.', reference, core).breakdown.lengthScore < good.breakdown.lengthScore
)

/* ---------- 5. 语言规范 ---------- */
console.log('\n[5] 语言规范（局限 1）')
const sloppy = grade('paper cutting is a traditional folk art in china people understand its important role', reference, core)
check(
  '句首未大写被检出',
  sloppy.breakdown.languageIssues.some((s) => s.includes('句首')),
  JSON.stringify(sloppy.breakdown.languageIssues)
)
check(
  '句末缺标点被检出',
  sloppy.breakdown.languageIssues.some((s) => s.includes('标点')),
  JSON.stringify(sloppy.breakdown.languageIssues)
)
check(
  '规范问题扣分（languageScore < 15）',
  sloppy.breakdown.languageScore < W_LANGUAGE,
  String(sloppy.breakdown.languageScore)
)

/* ---------- 6. 三项加权与边界 ---------- */
console.log('\n[6] 加权与边界')
check(
  '总分 = 三项之和',
  good.score === good.breakdown.coreScore + good.breakdown.lengthScore + good.breakdown.languageScore,
  `${good.score} vs ${good.breakdown.coreScore}+${good.breakdown.lengthScore}+${good.breakdown.languageScore}`
)
check('空译文得 0 分', grade('', reference, core).score === 0)
check('分数恒在 0-100', [good, padded, sloppy, scrambled].every((r) => r.score >= 0 && r.score <= 100))

console.log(`\n通过 ${pass} / 失败 ${fail}`)
console.log('SANITY_PASS =', fail === 0)
process.exit(fail === 0 ? 0 : 1)
