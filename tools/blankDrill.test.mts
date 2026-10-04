/**
 * 「写错可以重写」的测试。
 *
 * 两部分：
 *   1. **当场重写**（blanksToRewrite）—— 只清写错的格子，写对的保留
 *   2. **汇总重练**（addMiss）—— 写错的题进错题集，按 id 去重不重复
 *
 * 再加一条端到端：故意写错 → 重写 → 全部填对 → 必须判定全对
 * （这条最要紧：如果重写清错了格子，用户改完还是错的，功能就等于废了）
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/blankDrill.test.mts
 */
import fs from 'node:fs'
import path from 'node:path'

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

const { checkBlanks, blanksToRewrite, addMiss, answerWords } = await import('../frontend/src/utils/blankFill')
type BlankItem = import('../frontend/src/utils/blankFill').BlankItem

/* ---------------- 1. blanksToRewrite：只清错的 ---------------- */
console.log('\n=== 1. 重写：只清写错的格子 ===')
{
  const ans = 'with the rapid development of'
  // 故意混进两种错：'teh'（短词错 2 个字母 → 判错）、'developmant'（长词差 1 个字母 → 判「笔误算对」）
  const typed = ['with', 'teh', 'rapid', 'developmant', 'of']
  const r = checkBlanks(typed, ans)
  ok('前提：这一遍有 1 格写错', !r.allOk && r.okCount === 4, `${r.okCount}/${r.total}`)

  const { typed: next, firstBad } = blanksToRewrite(r.marks, typed)
  ok('写对的格子原样保留', next[0] === 'with' && next[2] === 'rapid' && next[4] === 'of')
  ok('写错的格子被清空', next[1] === '')
  ok('判定为「笔误算对」的格子不清（已经算对了，不该让用户改）', next[3] === 'developmant')
  ok('光标落在第一个错格', firstBad === 1, String(firstBad))
  ok('格子总数不变', next.length === typed.length)

  // 原数组不能被改掉（否则「取消重写」就没法还原）
  ok('不修改传入的数组', typed[1] === 'teh' && typed[3] === 'developmant')

  // 全错 / 全对 / 空格
  const allWrong = checkBlanks(['x', 'y', 'z', 'w', 'v'], ans)
  const aw = blanksToRewrite(allWrong.marks, ['x', 'y', 'z', 'w', 'v'])
  ok('全错时全部清空', aw.typed.every((t) => t === ''))
  ok('全错时光标落在第 1 格', aw.firstBad === 0)

  const allRight = checkBlanks(answerWords(ans), ans)
  const ar = blanksToRewrite(allRight.marks, answerWords(ans))
  ok('全对时什么都不清', ar.typed.join(' ') === answerWords(ans).join(' '))
  ok('全对时没有「第一个错格」', ar.firstBad === -1)

  const half = checkBlanks(['with', '', 'rapid', '', ''], ans)
  const hf = blanksToRewrite(half.marks, ['with', '', 'rapid', '', ''])
  ok('没填的格子也算要重写', hf.typed.filter((t) => t === '').length === 3, JSON.stringify(hf.typed))
  ok('没填格子的光标位置正确', hf.firstBad === 1)

  // 笔误（close，算对）不该被清掉 —— 它已经判定为对了
  const typo = checkBlanks(['with', 'the', 'rapid', 'developmant', 'of'], ans)
  ok('前提：单个词笔误算对', typo.marks[3].level === 'close' && typo.marks[3].ok)
  const tp = blanksToRewrite(typo.marks, ['with', 'the', 'rapid', 'developmant', 'of'])
  ok('判定为对的笔误不被清掉（不该让用户改已经算对的）', tp.firstBad === -1 && tp.typed[3] === 'developmant')
}

/* ---------------- 2. addMiss：错题入集去重 ---------------- */
console.log('\n=== 2. 错题集：按 id 去重 ===')
{
  const item = (id: string): BlankItem => ({
    id,
    group: 'g',
    prompt: '中文',
    hint: '',
    answer: 'a b',
    words: ['a', 'b'],
    note: '',
  })
  const a = item('a')
  const b = item('b')

  let list: BlankItem[] = []
  list = addMiss(list, a)
  list = addMiss(list, b)
  ok('依次加入两题', list.length === 2 && list[0].id === 'a' && list[1].id === 'b')

  list = addMiss(list, a)
  ok('重复加入同一题不会变多（重写又写错也不重复）', list.length === 2, String(list.length))

  const same = addMiss(list, a)
  ok('去重时不改动原数组', list.length === 2)
  ok('去重后顺序不变', same.map((x) => x.id).join(',') === 'a,b')

  // 同 id 不同内容：以先进入的为准（不覆盖）
  const a2: BlankItem = { ...a, answer: 'changed' }
  const kept = addMiss(list, a2)
  ok('同 id 不覆盖已有内容', kept[0].answer === 'a b', kept[0].answer)

  let empty: BlankItem[] = []
  empty = addMiss(empty, a)
  ok('空集能加入', empty.length === 1)
}

/* ---------------- 3. 端到端：写错 → 重写 → 全对 ---------------- */
console.log('\n=== 3. 端到端：改完必须真的变成全对 ===')
{
  const cases = [
    ['with the rapid development of', ['with', 'teh', 'rapid', 'developmant', 'of']],
    ['an increasing number of people', ['an', 'increasing', 'amount', 'of', 'people']],
    ['in conclusion', ['the', 'conclusion']],
    ['be conducive to', ['', 'conducive', 'to']],
  ] as const

  for (const [answer, wrong] of cases) {
    const first = checkBlanks([...wrong], answer)
    if (first.allOk) {
      ok(`前提：${answer} 的第一遍确实是错的`, false, wrong.join('|'))
      continue
    }
    // 模拟：点「重写错的格子」→ 把清空的位置按正确答案补上
    const { typed: cleared, firstBad } = blanksToRewrite(first.marks, [...wrong])
    const filled = cleared.map((t, i) => (t === '' ? answerWords(answer)[i] ?? '' : t))
    const second = checkBlanks(filled, answer)
    ok(`「${answer}」重写后全对`, second.allOk, `${second.okCount}/${second.total} 填的是 ${filled.join('|')}`)
    ok(`「${answer}」重写保留了写对的格子`, firstBad >= 0 && cleared[firstBad] === '')
  }

  // 重写不改动原本写对的那几格的内容
  const answer = 'with the rapid development of'
  const wrong = ['with', 'teh', 'rapid', 'developmant', 'of']
  const { typed: cleared } = blanksToRewrite(checkBlanks(wrong, answer).marks, wrong)
  ok('写对的格子内容与原来完全一致', cleared[0] === 'with' && cleared[2] === 'rapid' && cleared[4] === 'of')
}

/* ---------------- 4. 组件接线 ---------------- */
console.log('\n=== 4. 组件接线 ===')
{
  const drill = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/components/BlankDrill.vue'), 'utf8')
  ok('有「重写错的格子」按钮', drill.includes('重写错的格子'))
  ok('有「重练写错的 N 题」按钮', drill.includes('重练写错的'))
  ok('重写走 blanksToRewrite', drill.includes('blanksToRewrite(r.marks, typed.value)'))
  ok('错题入集走 addMiss', drill.includes('addMiss(missList.value, q)'))
  ok('重写后会标记不计分', drill.includes("retrying.value = true") && drill.includes('这题不计分'))
  ok('只有第一次作答计分', drill.includes('if (!retrying.value)'))
  ok('对外抛出 practice 事件', drill.includes("practice: [items: BlankItem[]]"))
  ok('写完还有入口能重练', drill.includes("v-else-if=\"done\"") && drill.includes('practiceMissed'))

  const writing = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/WritingView.vue'), 'utf8')
  const translation = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/TranslationView.vue'), 'utf8')
  ok('作文页接了重练事件', writing.includes('@practice="practiceSubset"'))
  ok('翻译页接了重练事件', translation.includes('@practice="practiceCategorySubset"'))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`重写功能测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
