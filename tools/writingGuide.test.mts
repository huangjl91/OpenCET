/**
 * 作文方法（重点词 + 金句造句）的内容与逻辑测试。
 *
 * 重点守两件事：
 *   1. **内容自洽** —— 金句的「例句」必须能通过自己的造句检查（否则用户照着例句抄都会被判错）；
 *      判断题的候选与答案必须对得上。
 *   2. **判分可复现** —— 同一个 seed 出同一套题，造句检查的判定边界固定。
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/writingGuide.test.mts
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

const {
  WRITING_WORDS,
  WORD_GROUPS,
  GOLDEN_PATTERNS,
  PATTERN_GROUPS,
  buildWordBlanks,
  buildPatternBlanks,
  answerWords,
  hintsOf,
  checkBlanks,
  checkSentence,
  taskKeys,
} = await import('../frontend/src/utils/writingGuide')

/* ---------------- 1. 重点词数据 ---------------- */
console.log('\n=== 1. 重点词数据 ===')
{
  ok('词量够多（≥ 60）', WRITING_WORDS.length >= 60, String(WRITING_WORDS.length))
  ok('分组数 ≥ 8', WORD_GROUPS.length >= 8, String(WORD_GROUPS.length))
  ok(
    '每条都有中文/英文/提醒/分组',
    WRITING_WORDS.every((w) => w.zh.trim() && w.en.trim() && w.note.trim() && w.group.trim()),
  )
  ok('id 不重复', new Set(WRITING_WORDS.map((w) => w.id)).size === WRITING_WORDS.length)
  const dup = WRITING_WORDS.map((w) => w.zh + '|' + w.en)
  ok('没有重复的中英对照', new Set(dup).size === dup.length)
  ok(
    '英文列里没有多余中文（括号里的词性提示除外）',
    WRITING_WORDS.every((w) => !/[\u4e00-\u9fa5]/.test(w.en)),
    WRITING_WORDS.filter((w) => /[\u4e00-\u9fa5]/.test(w.en)).map((w) => w.en).join(' | '),
  )
  ok(
    '每个分组都有词',
    WORD_GROUPS.every((g) => WRITING_WORDS.some((w) => w.group === g)),
  )
  ok(
    '提醒都不是空话（≥ 6 字）',
    WRITING_WORDS.every((w) => w.note.length >= 6),
  )
  const advanced = WRITING_WORDS.filter((w) => w.group === '高级替换词')
  ok('含高级替换词组（≥ 12 条）', advanced.length >= 12, String(advanced.length))

  // 这一组曾经把基础词写在题面里（「帮助（help）」），
  // 看起来像答案已经给了，用户不知道要写什么。
  ok(
    '高级替换词的题面不含英文（不泄露答案）',
    advanced.every((w) => !/[A-Za-z]/.test(w.zh)),
    advanced.filter((w) => /[A-Za-z]/.test(w.zh)).map((w) => w.zh).join(' | '),
  )
  ok(
    '高级替换词都给了「把 X 换成书面说法」的提示',
    advanced.every((w) => w.hint.includes('换成')),
    advanced.filter((w) => !w.hint.includes('换成')).map((w) => w.zh).join(' | '),
  )
  ok(
    '只有高级替换词组带提示（其余组 hint 为空）',
    WRITING_WORDS.filter((w) => w.group !== '高级替换词').every((w) => w.hint === ''),
  )
  ok(
    '没有题面把答案本身写进去（默写才有意义）',
    WRITING_WORDS.every((w) => {
      const bare = w.en.replace(/\.\.\./g, '').trim().toLowerCase()
      return !bare || !w.zh.toLowerCase().includes(bare)
    }),
  )
}

/* ---------------- 2. 金句数据 ---------------- */
console.log('\n=== 2. 金句句式数据 ===')
{
  ok('句式够多（≥ 30）', GOLDEN_PATTERNS.length >= 30, String(GOLDEN_PATTERNS.length))
  ok('分组数 ≥ 7', PATTERN_GROUPS.length >= 7, String(PATTERN_GROUPS.length))
  ok('id 不重复', new Set(GOLDEN_PATTERNS.map((p) => p.id)).size === GOLDEN_PATTERNS.length)
  ok(
    '每条都有模板/中文/例句/提醒/骨架',
    GOLDEN_PATTERNS.every(
      (p) => p.pattern.trim() && p.zh.trim() && p.example.trim() && p.tip.trim() && p.markers.length,
    ),
  )
  ok(
    '每条都有最少词数要求',
    GOLDEN_PATTERNS.every((p) => p.minWords >= 5),
  )
  ok(
    '模板里都有填空处（___）',
    GOLDEN_PATTERNS.every((p) => /_{2,}/.test(p.pattern)),
    GOLDEN_PATTERNS.filter((p) => !/_{2,}/.test(p.pattern)).map((p) => p.pattern).join(' | '),
  )
  ok(
    '骨架片段不含填空符',
    GOLDEN_PATTERNS.every((p) => p.markers.every((m) => !/_/.test(m))),
  )
  ok(
    '例句是完整句（以标点结尾）',
    GOLDEN_PATTERNS.every((p) => /[.!?]$/.test(p.example.trim())),
  )
  const dupTpl = GOLDEN_PATTERNS.map((p) => p.pattern)
  ok('没有重复的句式模板', new Set(dupTpl).size === dupTpl.length)
}

/* ---------------- 2b. 造句的中文题目 ---------------- */
console.log('\n=== 2b. 造句题目（不给题目用户不知道写什么）===')
{
  const noTask = GOLDEN_PATTERNS.filter((p) => !p.task.trim())
  ok('每个句式都配了中文题目', noTask.length === 0, noTask.map((p) => p.pattern).join(' | '))

  const noRef = GOLDEN_PATTERNS.filter((p) => !p.taskRef.trim())
  ok('每个题目都有参考答案', noRef.length === 0, noRef.map((p) => p.pattern).join(' | '))

  ok(
    '题目是中文（否则不叫「译文」）',
    GOLDEN_PATTERNS.every((p) => /[\u4e00-\u9fa5]/.test(p.task)),
    GOLDEN_PATTERNS.filter((p) => !/[\u4e00-\u9fa5]/.test(p.task))
      .map((p) => p.task)
      .join(' | '),
  )
  ok(
    '题目里没有整句英文（不然答案摆在那儿了）',
    GOLDEN_PATTERNS.every((p) => !/[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(p.task)),
    GOLDEN_PATTERNS.filter((p) => /[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(p.task))
      .map((p) => p.task)
      .join(' | '),
  )
  ok(
    '参考答案是完整英文句',
    GOLDEN_PATTERNS.every((p) => /^[A-Z]/.test(p.taskRef.trim()) && /[.!?]$/.test(p.taskRef.trim())),
    GOLDEN_PATTERNS.filter((p) => !/^[A-Z]/.test(p.taskRef.trim()) || !/[.!?]$/.test(p.taskRef.trim()))
      .map((p) => p.taskRef)
      .join(' | '),
  )
  ok(
    '题目够长（不是「……很重要」这种没法翻译的）',
    GOLDEN_PATTERNS.every((p) => p.task.length >= 8),
    GOLDEN_PATTERNS.filter((p) => p.task.length < 8)
      .map((p) => p.task)
      .join(' | '),
  )
  // 题目答案必须和例句不同 —— 否则例句一展示，题目就等于给了答案
  const sameAsExample = GOLDEN_PATTERNS.filter((p) => p.taskRef.trim() === p.example.trim())
  ok('参考答案不等于例句（例句已展示，重了就泄露答案）', sameAsExample.length === 0, sameAsExample.map((p) => p.id).join(' '))

  // 题目表里不能有多余的键（句式改了但题目没跟着改）
  const tplSet = new Set(GOLDEN_PATTERNS.map((p) => p.pattern))
  const orphan = taskKeys().filter((k) => !tplSet.has(k))
  ok('题目表没有对不上句式的孤儿键', orphan.length === 0, orphan.join(' | '))
  ok('题目表键数 == 句式数', taskKeys().length === GOLDEN_PATTERNS.length, `${taskKeys().length} / ${GOLDEN_PATTERNS.length}`)
}

/* ---------------- 3. 例句必须通过自己的造句检查 ---------------- */
console.log('\n=== 3. 例句与参考答案都要能通过自己的检查（内容自洽）===')
{
  const bad: string[] = []
  for (const p of GOLDEN_PATTERNS) {
    const r = checkSentence(p.example, p)
    if (!r.ok) bad.push(`${p.id} 例句: ${r.issues.join('；')}`)
  }
  ok('所有例句都通过', bad.length === 0, bad.slice(0, 4).join(' || '))

  // 参考答案如果自己都过不了自己句式的检查，用户照着抄都会被判错
  const badRef: string[] = []
  for (const p of GOLDEN_PATTERNS) {
    const r = checkSentence(p.taskRef, p)
    if (!r.ok) badRef.push(`${p.id}: ${r.issues.join('；')}`)
  }
  ok('所有参考答案都通过', badRef.length === 0, badRef.slice(0, 4).join(' || '))
}

/* ---------------- 4. 出题：横线条数 -- 答案词数 ---------------- */
console.log('\n=== 4. 逐词填空：出题 ===')
{
  const w1 = buildWordBlanks(42)
  const w2 = buildWordBlanks(42)
  const w3 = buildWordBlanks(43)
  ok('重点词题数 == 词数', w1.length === WRITING_WORDS.length, `${w1.length} / ${WRITING_WORDS.length}`)
  ok('同一个 seed 出同一套题', JSON.stringify(w1) === JSON.stringify(w2))
  ok('不同 seed 顺序不同', JSON.stringify(w1) !== JSON.stringify(w3))
  ok('题目 id 不重复', new Set(w1.map((q) => q.id)).size === w1.length)
  ok(
    '每题都带中文题面与标准答案',
    w1.every((q) => {
      const w = WRITING_WORDS.find((x) => x.id === q.id)!
      return q.prompt === w.zh && q.answer === w.en && q.group === w.group && q.note === w.note
    }),
  )
  ok(
    '横线条数 == 该答案的词数',
    w1.every((q) => q.words.length === answerWords(q.answer).length && q.words.length > 0),
  )
  ok(
    '重点词题面都是中文（不然没法默写）',
    w1.every((q) => /[\u4e00-\u9fa5]/.test(q.prompt)),
  )
  ok(
    'hint 从词表透传到题目',
    w1.every((q) => {
      const w = WRITING_WORDS.find((x) => x.id === q.id)!
      return q.hint === w.hint
    }),
  )

  const p1 = buildPatternBlanks(7)
  ok('金句题数 == 句式数', p1.length === GOLDEN_PATTERNS.length, `${p1.length} / ${GOLDEN_PATTERNS.length}`)
  ok(
    '金句题面带中文题目与句式骨架',
    p1.every((q) => {
      const p = GOLDEN_PATTERNS.find((x) => x.id === q.id)!
      return q.prompt === p.task && q.hint === p.pattern && q.answer === p.taskRef && q.note === p.tip
    }),
  )
  ok(
    '金句的横线条数 == 参考答案词数',
    p1.every((q) => q.words.length === answerWords(q.answer).length && q.words.length >= 5),
    p1
      .filter((q) => q.words.length < 5)
      .map((q) => `${q.words.length}: ${q.answer}`)
      .join(' ;; '),
  )
  ok(
    '金句每题都有句式骨架提示',
    p1.every((q) => q.hint.includes('_')),
  )
}

/* ---------------- 5. 拆词：横线数由它决定，不能脏 ---------------- */
console.log('\n=== 5. 答案拆词（决定横线条数）===')
{
  ok('省略号占位不占横线', answerWords('with the rapid development of ...').join(' ') === 'with the rapid development of')
  ok('省略号不会变成一条空格', answerWords('with the rapid development of ...').length === 5)
  ok('多种写法只按第一种画横线', answerWords('for example / for instance').join(' ') === 'for example')
  ok('多余空格不产生空横线', answerWords('an  increasing   number of people').length === 5)
  ok('中文标点被清掉', answerWords('a，b。c').length === 0 || !answerWords('a，b。c').some((w) => /[，。]/.test(w)))
  ok('空答案拆出 0 条', answerWords('').length === 0)
  ok('只有省略号的答案拆出 0 条', answerWords('...').length === 0)

  // 全部题面都不该有脏词
  const all = [
    ...WRITING_WORDS.map((w) => w.en),
    ...GOLDEN_PATTERNS.map((p) => p.example),
  ]
  const dirty: string[] = []
  for (const a of all) {
    const ws = answerWords(a)
    if (!ws.length) dirty.push(`拆出 0 词：${a}`)
    if (ws.some((w) => w === '' || w.includes('...') || w.includes('…') || w.includes('/'))) {
      dirty.push(`脏词：${ws.join('|')} ← ${a}`)
    }
  }
  ok(`${all.length} 条答案拆出的词都干净`, dirty.length === 0, dirty.slice(0, 3).join(' ;; '))
}

/* ---------------- 6. 首字母提示 ---------------- */
console.log('\n=== 6. 每条横线的首字母提示 ===')
{
  const h = hintsOf('an increasing number of people')
  ok('提示条数 == 词数', h.length === 5, JSON.stringify(h))
  ok('每条形如 a__', h[0] === 'a_', h[0])
  ok('长词保留首字母', h[1].startsWith('i') && h[1].length === 'increasing'.length, h[1])
  ok('提示里不含完整单词', !h.some((x) => x.includes('increasing')), JSON.stringify(h))
  ok('省略号占位不影响提示条数', hintsOf('with the rapid development of ...').length === 5)
  ok(
    '所有答案都能出提示且条数对得上',
    [...WRITING_WORDS.map((w) => w.en), ...GOLDEN_PATTERNS.map((p) => p.example)].every(
      (a) => hintsOf(a).length === answerWords(a).length,
    ),
  )
}

/* ---------------- 7. 逐词判定：算对的情形 ---------------- */
console.log('\n=== 7. 逐词判定：应当算对 ===')
{
  const ans = 'with the rapid development of ...'
  const full = checkBlanks(['with', 'the', 'rapid', 'development', 'of'], ans)
  ok('横线条数与答案词数一致', full.total === 5, String(full.total))
  ok('全填对 → allOk', full.allOk && full.okCount === 5)
  ok('全对时没有提示', full.issues.length === 0, full.issues.join('；'))

  ok('忽略大小写', checkBlanks(['WITH', 'The', 'RAPID', 'Development', 'OF'], ans).allOk)
  ok('忽略多余空格', checkBlanks([' with ', ' the ', ' rapid ', ' development ', ' of '], ans).allOk)
  ok('忽略首尾标点', checkBlanks(['with,', 'the.', 'rapid', 'development', 'of'], ans).allOk)

  const typo = checkBlanks(['with', 'the', 'rapid', 'developmant', 'of'], ans)
  ok('单个词笔误 → 算对', typo.allOk, JSON.stringify(typo.marks.map((m) => m.level)))
  ok('笔误那格标成 close', typo.marks[3].level === 'close', typo.marks[3].level)
  ok('笔误会给出提示', typo.issues.some((s) => s.includes('差一点')), typo.issues.join('；'))

  const shortWordTypo = checkBlanks(['wifh', 'the', 'rapid', 'development', 'of'], ans)
  ok('短词一个字母之差错也算对', shortWordTypo.marks[0].level === 'close', shortWordTypo.marks[0].level)

  const wrongShort = checkBlanks(['xx', 'the', 'rapid', 'development', 'of'], ans)
  ok('短词错得离谱算错', wrongShort.marks[0].level === 'wrong', wrongShort.marks[0].level)

  // 全部词条自己填自己都必须全对
  const bad: string[] = []
  for (const w of WRITING_WORDS) {
    const r = checkBlanks(answerWords(w.en), w.en)
    if (!r.allOk) bad.push(`${w.en} → ${r.okCount}/${r.total}`)
  }
  for (const p of GOLDEN_PATTERNS) {
    const r = checkBlanks(answerWords(p.example), p.example)
    if (!r.allOk) bad.push(`${p.example} → ${r.okCount}/${r.total}`)
  }
  ok(`${WRITING_WORDS.length + GOLDEN_PATTERNS.length} 条答案自填自都对`, bad.length === 0, bad.slice(0, 3).join(' ;; '))
}

/* ---------------- 8. 逐词判定：该判错的情形 ---------------- */
console.log('\n=== 8. 逐词判定：应当算错 ===')
{
  const ans = 'with the rapid development of ...'

  const empty = checkBlanks(['', '', '', '', ''], ans)
  ok('全空 → 不算对', !empty.allOk && empty.okCount === 0)
  ok('空的那格标成 empty', empty.marks.every((m) => m.level === 'empty'))
  ok('提示里说明还有几条没填', empty.issues.some((s) => s.includes('没填')), empty.issues.join('；'))

  const partial = checkBlanks(['with', 'the', 'rapid', '', ''], ans)
  ok('填一半 → 3/5', partial.okCount === 3, `${partial.okCount}/${partial.total}`)
  ok('没填的两格标成 empty', partial.marks[3].level === 'empty' && partial.marks[4].level === 'empty')

  const wrong = checkBlanks(['with', 'the', 'slow', 'development', 'of'], ans)
  ok('词写错 → 那格标 wrong', wrong.marks[2].level === 'wrong', wrong.marks[2].level)
  ok('写错那格给出正确写法', wrong.marks[2].expected === 'rapid')
  ok('写错不影响其它格', wrong.marks[0].level === 'exact' && wrong.marks[4].level === 'exact')
  ok('提示里给出错了几条', wrong.issues.some((s) => s.includes('写错')), wrong.issues.join('；'))

  const shifted = checkBlanks(['the', 'with', 'rapid', 'development', 'of'], ans)
  ok('词序错 → 位置判定为错（不是错位对齐）', !shifted.allOk && shifted.okCount === 3, `${shifted.okCount}/5`)
}

/* ---------------- 9. 边界：任何输入都不炸 ---------------- */
console.log('\n=== 9. 边界：任何输入都不炸 ===')
{
  const cases: string[][] = [[], [''], ['a'], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['  '], ['...']]
  let threw = ''
  const allAnswers = [...WRITING_WORDS.map((w) => w.en), ...GOLDEN_PATTERNS.map((p) => p.example), '', '...', 'a / b']
  outer: for (const a of allAnswers) {
    for (const c of cases) {
      try {
        checkBlanks(c, a)
        answerWords(a)
        hintsOf(a)
      } catch (e) {
        threw = `answer=${JSON.stringify(a)} typed=${JSON.stringify(c)} → ${(e as Error).message}`
        break outer
      }
    }
  }
  ok('任意答案 × 任意输入的组合都安全', threw === '', threw)

  ok('答案为空时 total 为 0', checkBlanks(['a'], '').total === 0)
  ok('答案为空时不报 allOk', !checkBlanks(['a'], '').allOk)
}

/* ---------------- 8. 造句检查：通过的情形 ---------------- */
console.log('\n=== 8. 造句检查：应当通过 ===')
{
  const p = GOLDEN_PATTERNS.find((x) => x.markers.includes('only by'))! // Only by ... can we ...
  ok('找得到 Only by 句式', !!p)

  ok(
    '正确造句通过',
    checkSentence('Only by working hard can we achieve our goals.', p).ok,
    JSON.stringify(checkSentence('Only by working hard can we achieve our goals.', p).issues),
  )
  ok(
    '大小写不敏感（骨架小写也算）',
    checkSentence('only by trying again can we make progress.', p).hits.length === p.markers.length,
  )
  ok(
    '多余空格不影响',
    checkSentence('Only  by   working   hard   can we   achieve our goals.', p).ok,
    JSON.stringify(checkSentence('Only  by   working   hard   can we   achieve our goals.', p).issues),
  )
  ok('词数被正确统计', checkSentence('Only by working hard can we achieve our goals.', p).words === 9)
  ok('命中的骨架被列出', checkSentence('Only by working hard can we achieve our goals.', p).hits.length === 2)
}

/* ---------------- 6. 造句检查：各种不通过 ---------------- */
console.log('\n=== 9. 造句检查：应当拦下 ===')
{
  const p = GOLDEN_PATTERNS.find((x) => x.markers.includes('only by'))!

  const empty = checkSentence('', p)
  ok('空内容不通过', !empty.ok && empty.issues.length > 0)

  const noMarker = checkSentence('I think this is a very good idea for everyone.', p)
  ok('没用句式骨架 → 不通过', !noMarker.ok)
  ok('缺哪个骨架会说出来', noMarker.missing.length === p.markers.length, JSON.stringify(noMarker.missing))
  ok('提示里点名骨架', noMarker.issues.some((s) => s.includes('句式骨架')), noMarker.issues.join('；'))

  const withCn = checkSentence('Only by 努力 can we succeed.', p)
  ok('句子里有中文 → 不通过', !withCn.ok && withCn.issues.some((s) => s.includes('中文')))

  const short = checkSentence('Only by trying can we win.', p)
  ok('太短 → 不通过', !short.ok && short.issues.some((s) => s.includes('太短')), short.issues.join('；'))

  const noPunct = checkSentence('Only by working hard can we achieve our goals', p)
  ok('句末没标点 → 不通过', !noPunct.ok && noPunct.issues.some((s) => s.includes('标点')))

  const lower = checkSentence('only by working hard can we achieve our goals.', p)
  ok('句首没大写 → 不通过', !lower.ok && lower.issues.some((s) => s.includes('大写')))

  const repeat = checkSentence('Only by the the work can we win now.', p)
  ok('连续重复词 → 不通过', !repeat.ok && repeat.issues.some((s) => s.includes('重复')), repeat.issues.join('；'))

  const full = checkSentence('Only by working hard can we achieve our goals.', p)
  ok('改对了就通过', full.ok)
}

/* ---------------- 7. 造句检查对每个句式都不炸 ---------------- */
console.log('\n=== 10. 边界：每个句式喂空串/乱码都不炸 ===')
{
  let threw = ''
  for (const p of GOLDEN_PATTERNS) {
    try {
      checkSentence('', p)
      checkSentence('。。。', p)
      checkSentence('a'.repeat(500), p)
      checkSentence(p.example, p)
    } catch (e) {
      threw = `${p.id}: ${(e as Error).message}`
      break
    }
  }
  ok('全部句式都能安全处理', threw === '', threw)
}

/* ---------------- 8. AI 点评的 JSON 契约 ---------------- */
console.log('\n=== 11. AI 点评解析 ===')
{
  const store = new Map<string, string>()
  // @ts-expect-error 测试环境
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
  store.set(
    'opencet.ai.config',
    JSON.stringify({ baseUrl: 'https://example.com/v1', apiKey: 'sk-test', model: 'm', temperature: 0.4 }),
  )
  let reply = ''
  const calls: Array<Record<string, unknown>> = []
  // @ts-expect-error 测试环境
  globalThis.fetch = async (_u: unknown, init: unknown) => {
    calls.push(JSON.parse(String((init as { body?: string })?.body ?? '{}')))
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const { llmSentenceReview } = await import('../frontend/src/utils/llmWriting')
  const p = GOLDEN_PATTERNS[0]

  reply = JSON.stringify({
    score: 88,
    issues: ['第 2 句时态不一致'],
    better: 'It is widely acknowledged that reading broadens our horizons.',
    comment: '句式用对了，注意时态。',
  })
  const r = await llmSentenceReview(p, 'It is widely acknowledged that reading broaden our horizons.')
  ok('解析出分数', r.score === 88, String(r.score))
  ok('解析出问题列表', r.issues.length === 1)
  ok('解析出润色', r.better.startsWith('It is widely acknowledged'))
  ok('解析出点评', r.comment.includes('时态'))
  ok('prompt 里带了句式模板', String(calls[0].messages ? JSON.stringify(calls[0]) : '').includes(p.pattern.slice(0, 20)))

  reply = JSON.stringify({ score: 200, issues: 'not-array', better: null, comment: null })
  const r2 = await llmSentenceReview(p, 'x')
  ok('分数被夹到 0-100', r2.score === 100, String(r2.score))
  ok('issues 不是数组时退化为空', r2.issues.length === 0)
  ok('better 为 null 时转成空串', r2.better === '')

  reply = JSON.stringify({ score: 'abc' })
  let msg = ''
  try {
    await llmSentenceReview(p, 'x')
  } catch (e) {
    msg = (e as Error).message
  }
  ok('分数非法时给出可读错误', msg.includes('score'), msg)

  reply = '抱歉我无法回答'
  let msg2 = ''
  try {
    await llmSentenceReview(p, 'x')
  } catch (e) {
    msg2 = (e as Error).message
  }
  ok('非 JSON 回复也能报错而不是崩', msg2.includes('JSON'), msg2)
}

/* ---------------- 9. 行内标记不要漏渲染 ---------------- */
console.log('\n=== 12. 行内加粗标记成对 ===')
{
  const { hasBalancedBold, splitBold, stripBold } = await import('../frontend/src/utils/inlineMarkup')
  const all = [
    ...WRITING_WORDS.flatMap((w) => [w.note, w.zh, w.en]),
    ...GOLDEN_PATTERNS.flatMap((p) => [p.tip, p.zh, p.example, p.pattern]),
  ]
  const odd = all.filter((t) => !hasBalancedBold(t))
  ok('所有文案的 ** 都成对（否则页面上会漏出星号）', odd.length === 0, odd.slice(0, 3).join(' | '))

  const lost = all.filter((t) => splitBold(t).map((p) => p.text).join('') !== stripBold(t))
  ok('加粗切分不丢字', lost.length === 0, lost.slice(0, 2).join(' | '))

  ok('确实用到加粗（不是全都没写）', all.some((t) => t.includes('**')))

  // 页面必须真的调用渲染函数，否则内容里的 ** 会原样显示
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/WritingView.vue'), 'utf8')
  ok('词表 note 走了加粗渲染', view.includes('splitBold(w.note)'), '')
  ok('提醒 tip 走了加粗渲染', view.includes('splitBold(p.tip)'), '')
  ok('判断题 note 走了加粗渲染', fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/components/BlankDrill.vue'), 'utf8').includes('splitBold(current.note)'), '')
}

/* ---------------- 10. 页面挂载点存在 ---------------- */
console.log('\n=== 13. 页面与路由接好了 ===')
{
  const router = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/router/index.ts'), 'utf8')
  ok('路由里有 /writing', router.includes("path: '/writing'"), '')
  ok('路由指向 WritingView', router.includes('WritingView.vue'))
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/WritingView.vue'), 'utf8')
  ok('页面改成了逐词填空', view.includes('BlankDrill') && view.includes('buildWordBlanks'))
  ok('金句也用了同一套填空', view.includes('buildPatternBlanks'))
  // 逐词填空的实现搬进了共用组件（作文与翻译共用同一套），断言指向组件
  const drill = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/components/BlankDrill.vue'), 'utf8')
  ok('横线按答案词数渲染', drill.includes('v-for="(w, i) in current.words"'))
  ok('提交走逐词判定', drill.includes('checkBlanks'))
  ok('空格跳格 / 回车提交', drill.includes('focusNext(i)') && drill.includes('submit()'))
  ok('保留了首字母提示与跳过', drill.includes('首字母提示') && drill.includes('跳过看答案'))
  ok('提示标签就位', drill.includes('bk__hint-label'))
  // 顺序：先看词表，再往下默写
  const tableAt = view.indexOf('重点词表')
  const blankAt = view.indexOf('<BlankDrill')
  ok('重点词表排在默写之前', tableAt > 0 && blankAt > 0 && tableAt < blankAt, `词表@${tableAt} 默写@${blankAt}`)
  ok('页面用了造句检查', view.includes('checkSentence'))
  ok('页面接了 AI 点评', view.includes('llmSentenceReview'))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`作文方法测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
