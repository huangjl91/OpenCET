/**
 * 句子语言检查（拼写 + 语法）的测试。
 *
 * 三层：
 *   1. **不误报** —— 站内 36 条例句 + 36 条参考答案必须一条问题都没有。
 *      这一层最重要：一个把正确句子标红的检查器，用户会直接不看了。
 *   2. **能抓到** —— 各类错拼、主谓不一致、冠词、搭配错要能报出来
 *   3. **基础件** —— within1 / baseForms 的边界
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/languageCheck.test.mts
 */
import { GOLDEN_PATTERNS } from '../frontend/src/utils/writingGuide'

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`)
  }
}

const { checkSpelling, checkGrammar, checkLanguage, within1, baseForms, nearestWord } = await import(
  '../frontend/src/utils/languageCheck'
)

/* ---------------- 1. 绝不误报：站内范文必须干净 ---------------- */
console.log('\n=== 1. 不误报：36 例句 + 36 参考答案必须零问题 ===')
{
  const dirty: string[] = []
  for (const p of GOLDEN_PATTERNS) {
    for (const [label, s] of [
      ['例句', p.example],
      ['参考答案', p.taskRef],
    ] as const) {
      const issues = checkLanguage(s)
      if (issues.length) dirty.push(`${p.id} ${label}: ${issues.map((i) => i.message).join('；')} ← ${s}`)
    }
  }
  ok('72 条范文全部通过拼写 + 语法检查', dirty.length === 0, dirty.slice(0, 4).join('\n      '))

  // 再拿作文重点词的英文、翻译题库的参考译文一起过一遍，覆盖面更广
  const { WRITING_WORDS } = await import('../frontend/src/utils/writingGuide')
  const wordIssues: string[] = []
  for (const w of WRITING_WORDS) {
    const s = w.en.replace(/\.\.\./g, '').trim()
    if (!s || !/[a-z]/.test(s)) continue
    const issues = checkLanguage(/[.!?]$/.test(s) ? s : s + '.')
    if (issues.length) wordIssues.push(`${w.en}: ${issues.map((i) => i.message).join('；')}`)
  }
  ok(`${WRITING_WORDS.length} 条写作重点词也不误报`, wordIssues.length === 0, wordIssues.slice(0, 4).join(' ;; '))
}

/* ---------------- 2. 拼写要抓得到 ---------------- */
console.log('\n=== 2. 拼写 ===')
{
  const cases: [string, string][] = [
    ['I think this is a developmant issue.', 'development'],
    ['This is very importent for us.', 'important'],
    ['We should protect the enviroment.', 'environment'],
    ['The goverment should act now.', 'government'],
    ['I recieve many letters.', 'receive'],
    ['It is a seperate problem.', 'separate'],
    ['The definitly correct answer.', 'definitely'],
  ]
  const missed: string[] = []
  for (const [s, want] of cases) {
    const got = checkSpelling(s)
    if (!got.length) missed.push(`${s}（应报 ${want}）`)
    else if (got[0].suggest && !within1(got[0].suggest, want) && got[0].suggest !== want) {
      missed.push(`${s}: 建议 ${got[0].suggest}，期望 ${want}`)
    }
  }
  ok('典型错拼都能报出并给出正确词', missed.length === 0, missed.join(' ;; '))

  ok('正确拼写不报', checkSpelling('Development is important for the environment.').length === 0)
  ok('词形变化不报（improves/stopped/studies）', checkSpelling('He improves. They stopped. She studies hard.').length === 0)
  ok('专有名词不误报（China / Confucius 在词典里）', checkSpelling('China is a country.').length === 0)
  ok('空串不炸', checkSpelling('').length === 0)
  ok('纯中文不炸', checkSpelling('这是一个句子。').length === 0)
  ok('每个错词只报一次', checkSpelling('developmant developmant developmant.').length === 1)

  const one = checkSpelling('This is a developmant issue.')[0]
  ok('报出的片段是原文里的词', one.snippet === 'developmant', one.snippet)
  ok('提示里同时给出错误写法与正确写法', one.message.includes('developmant') && one.message.includes('development'), one.message)
  ok('kind 标成 spelling', one.kind === 'spelling')
}

/* ---------------- 3. 语法要抓得到 ---------------- */
console.log('\n=== 3. 语法 ===')
{
  const cases: [string, string][] = [
    ['He go to school every day.', '主谓不一致'],
    ['She make a lot of money.', '主谓不一致'],
    ['It become more and more popular.', '主谓不一致'],
    ['We must to protect the environment.', '情态动词'],
    ['He can goes there.', '第三人称单数'],
    ['I want to goes home.', '第三人称单数'],
    ['This is a important problem.', 'an'],
    ['It is an useful tool.', 'a'],
    ['There are many information here.', 'much'],
    ['Every students should work hard.', '单数名词'],
    ['This is more better than that.', '比较级'],
    ['He insisted on go with us.', '动名词'],
    ['Its a very good idea.', "it's"],
    ['This is more useful then that.', 'than'],
    ['这是一个句子。', '半角标点'],
  ]
  const missed: string[] = []
  for (const [s, want] of cases) {
    const got = checkGrammar(s)
    if (!got.some((i) => i.message.includes(want))) {
      missed.push(`${s}（应报「${want}」）→ ${got.map((i) => i.message).join('；') || '无'}`)
    }
  }
  ok('典型语法错都能报出且理由对得上', missed.length === 0, missed.join('\n      '))

  ok('空串不炸', checkGrammar('').length === 0)

  // 建议的改法必须是完整正确的词，不能是截断的片段
  {
    const fixes: [string, string][] = [
      ['We must to protect the environment.', 'must protect'],
      ['He can goes there.', 'can go'],
      ['This is a important problem.', 'an important'],
      ['Every students should work hard.', 'Every student'],
      ['This is more better than that.', 'better'],
      ['He insisted on go with us.', 'on going'],
    ]
    const badFix: string[] = []
    for (const [s, want] of fixes) {
      const got = checkGrammar(s)
      if (!got.some((i) => i.suggest === want)) {
        badFix.push(`${s}: 期望建议「${want}」，实际 ${JSON.stringify(got.map((i) => i.suggest))}`)
      }
    }
    ok('建议改法完整可用（不是被截断的片段）', badFix.length === 0, badFix.join(' ;; '))
  }

  const g = checkGrammar('He go to school every day.')[0]
  ok('语法问题带 kind=grammar', g.kind === 'grammar')
  ok('语法问题给出建议改法', g.suggest.length > 0, g.suggest)
  ok('提示里说清为什么错', g.message.includes('第三人称单数'), g.message)
}

/* ---------------- 4. 基础件 ---------------- */
console.log('\n=== 4. within1 / baseForms / nearestWord ===')
{
  ok('完全相同', within1('the', 'the'))
  ok('单字母替换', within1('developmant', 'development'))
  ok('相邻换位（recieve/receive）', within1('recieve', 'receive'))
  ok('少一个字母', within1('adress', 'address'))
  ok('多一个字母', within1('addresss', 'address'))
  ok('差两个字母 → 不算', !within1('abc', 'axy'))
  ok('长度差 2 → 不算', !within1('ab', 'abcd'))
  ok('完全不同的词 → 不算', !within1('apple', 'orange'))

  ok('baseForms 能还原 improves → improve', baseForms('improves').includes('improve'))
  ok('baseForms 能还原 studies → study', baseForms('studies').includes('study'))
  ok('baseForms 能还原 stopped → stop（双写）', baseForms('stopped').includes('stop'))
  ok('baseForms 能还原 making → make', baseForms('making').includes('make'))
  ok('baseForms 能还原 greater → great', baseForms('greater').includes('great'))

  ok('nearestWord 找得到接近的词', !!nearestWord('developmant'))
  ok('nearestWord 对完全正确的词返回自身或接近词', nearestWord('development') === 'development')
}

/* ---------------- 5. checkSentence 接好了 ---------------- */
console.log('\n=== 5. checkSentence 已经把语言检查接进去 ===')
{
  const { checkSentence } = await import('../frontend/src/utils/writingGuide')
  const p = GOLDEN_PATTERNS.find((x) => x.pattern.includes('It is widely acknowledged'))!

  const good = checkSentence(p.taskRef, p)
  ok('参考答案判定通过', good.ok, good.issues.concat(good.problems.map((x) => x.message)).join('；'))
  ok('通过时 problems 为空', good.problems.length === 0)

  const typo = checkSentence('It is widely acknowledged that reading is very importent for us.', p)
  ok('句子用了句式但拼写错 → 不通过', !typo.ok)
  ok('拼写错进了 problems', typo.problems.some((x) => x.kind === 'spelling'), JSON.stringify(typo.problems))

  const grammar = checkSentence('It is widely acknowledged that he go to school every day.', p)
  ok('句子用了句式但语法错 → 不通过', !grammar.ok)
  ok('语法错进了 problems', grammar.problems.some((x) => x.kind === 'grammar'), JSON.stringify(grammar.problems))

  const noPattern = checkSentence('Reading is good for everyone in the world.', p)
  ok('没用句式 → 仍然不通过（句式问题进 issues）', !noPattern.ok && noPattern.issues.length > 0)
}

console.log(`\n${'='.repeat(52)}`)
console.log(`语言检查测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
