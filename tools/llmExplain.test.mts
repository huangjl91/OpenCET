/**
 * 「AI 讲解」解析健壮性测试
 *
 * 直接驱动真实的 llmExplain()：桩掉 localStorage 和 fetch，
 * 用各种真实模型可能吐出来的形状（代码围栏、前后废话、字段缺失、类型不对）验证解析。
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/llmExplain.test.mts
 */

/* ---------------- localStorage 桩 ---------------- */
const store = new Map<string, string>()
// @ts-expect-error 测试环境提供最小实现
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
// 配好 API Key，否则 chat() 直接抛错
store.set(
  'opencet.ai.config',
  JSON.stringify({ baseUrl: 'https://example.com/v1', apiKey: 'sk-test', model: 'test-model', temperature: 0.4 })
)

/* ---------------- fetch 桩：返回指定的模型回复 ---------------- */
let reply = ''
const calls: Array<{ url: string; body: unknown }> = []
// @ts-expect-error 测试环境提供最小实现
globalThis.fetch = async (url: unknown, init: unknown) => {
  calls.push({ url: String(url), body: JSON.parse(String((init as { body?: string })?.body ?? '{}')) })
  return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const { llmExplain, llmExplainCached, getCachedExplain, clearCachedExplain } = await import(
  '../frontend/src/utils/llmExplain'
)
type Q = Parameters<typeof llmExplain>[0]

const question: Q = {
  id: 'q-1',
  level: 'CET4',
  type: 'sentence',
  difficulty: 2,
  source: '2023年6月',
  prompt: '剪纸是中国最受欢迎的民间艺术之一。',
  reference: 'Paper-cutting is one of the most popular folk arts in China.',
  tips: '注意最高级形式',
  coreWords: [{ en: 'paper-cutting', zh: '剪纸' }, { en: 'folk art', zh: '民间艺术' }],
  grammarPoints: ['one of the + 最高级 + 复数名词'],
}

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

const GOOD = {
  vocab: [
    {
      zh: '剪纸',
      en: 'paper-cutting',
      pos: 'n.',
      phonetic: '/ˈpeɪpə ˌkʌtɪŋ/',
      meaning: '剪纸（不可数）',
      usage: '作定语用单数：paper-cutting art',
    },
    { zh: '民间艺术', en: 'folk art', pos: 'n.', phonetic: '/fəʊk ɑːt/', meaning: '民间艺术', usage: '常与 traditional 搭配' },
  ],
  structure: {
    main: 'Paper-cutting is one of the most popular folk arts in China.',
    pattern: 'one of the + 最高级 + 复数名词',
    parts: [
      { role: '主语', text: 'Paper-cutting', note: '专有名词作主语，谓语用单数' },
      { role: '表语', text: 'one of the most popular folk arts', note: 'one of 后接复数名词' },
      { role: '状语', text: 'in China', note: '地点状语后置' },
    ],
    summary: '先立主干，再把「最…之一」翻成 one of the most…',
  },
  tips: ['「之一」必须用 one of the + 复数', '剪纸作主语视为单数'],
}

console.log('\n=== 用例 1：标准 JSON ===')
reply = JSON.stringify(GOOD)
{
  const r = await llmExplain(question)
  ok('词汇解析出 2 条', r.vocab.length === 2, String(r.vocab.length))
  ok('第一个词英文正确', r.vocab[0].en === 'paper-cutting')
  ok('音标保留', r.vocab[0].phonetic.includes('peɪpə'))
  ok('主干解析正确', r.structure.main.startsWith('Paper-cutting is'))
  ok('句型套路保留', r.structure.pattern.includes('最高级'))
  ok('成分拆出 3 条', r.structure.parts.length === 3, String(r.structure.parts.length))
  ok('成分 role 正确', r.structure.parts[0].role === '主语')
  ok('注意点 2 条', r.tips.length === 2)
  ok('请求打到了 chat/completions', calls[0].url.endsWith('/chat/completions'), calls[0].url)
  const body = calls[0].body as { messages: Array<{ role: string; content: string }> }
  ok('prompt 里带了原文', body.messages[1].content.includes('剪纸是中国最受欢迎的民间艺术之一。'))
  ok('prompt 里带了参考译文', body.messages[1].content.includes('Paper-cutting is one of'))
  ok('prompt 里带了核心词', body.messages[1].content.includes('paper-cutting'))
  ok('system 要求只输出 JSON', body.messages[0].content.includes('只输出 JSON'))
}

console.log('\n=== 用例 2：带 ```json 代码围栏 ===')
reply = '```json\n' + JSON.stringify(GOOD) + '\n```'
{
  const r = await llmExplain(question)
  ok('仍能解析出 2 条词汇', r.vocab.length === 2)
  ok('结构解析正常', r.structure.parts.length === 3)
}

console.log('\n=== 用例 3：前后带废话 ===')
reply = '好的，我来讲解这道题：\n' + JSON.stringify(GOOD) + '\n希望对你有帮助！'
{
  const r = await llmExplain(question)
  ok('前后废话被忽略', r.vocab.length === 2 && r.structure.parts.length === 3)
}

console.log('\n=== 用例 4：字段缺失 / 类型不对 ===')
reply = JSON.stringify({
  vocab: [{ zh: '剪纸', en: 'paper-cutting', meaning: 123, usage: null }],
  structure: { main: 'X is Y.', parts: 'not-an-array', summary: undefined },
  tips: 'not-an-array',
})
{
  const r = await llmExplain(question)
  ok('缺 pos/phonetic 不报错', r.vocab[0].pos === '' && r.vocab[0].phonetic === '')
  ok('数字 meaning 转成字符串', r.vocab[0].meaning === '123', r.vocab[0].meaning)
  ok('null usage 转成空串', r.vocab[0].usage === '')
  ok('parts 不是数组时退化为空数组', r.structure.parts.length === 0)
  ok('tips 不是数组时退化为空数组', r.tips.length === 0)
  ok('主干仍保留', r.structure.main === 'X is Y.')
}

console.log('\n=== 用例 5：中文字段名下仍能兜住 ===')
reply = JSON.stringify({
  vocab: [{ word: '剪纸', english: 'paper-cutting', pos: 'n.' }],
  structure: { main: 'A is B.', parts: [{ role: '主语', text: 'A', note: '' }] },
  tips: [],
})
{
  const r = await llmExplain(question)
  ok('兼容 word/english 字段名', r.vocab[0].en === 'paper-cutting' && r.vocab[0].zh === '剪纸')
}

console.log('\n=== 用例 6：模型返回不可用时给出可读错误 ===')
{
  reply = '抱歉，我无法回答。'
  let msg = ''
  try {
    await llmExplain(question)
  } catch (e) {
    msg = (e as Error).message
  }
  ok('抛错而不是静默返回空', msg.length > 0)
  ok('错误信息可读', msg.includes('模型未返回可解析的 JSON') || msg.includes('没有返回可用的讲解内容'), msg)

  reply = JSON.stringify({ vocab: [], structure: {}, tips: [] })
  let msg2 = ''
  try {
    await llmExplain(question)
  } catch (e) {
    msg2 = (e as Error).message
  }
  ok('全空结果也报错', msg2.includes('没有返回可用的讲解内容'), msg2)
}

console.log('\n=== 用例 7：本地缓存（同一题只花一次 token）===')
{
  clearCachedExplain()
  reply = JSON.stringify(GOOD)
  const before = calls.length

  const first = await llmExplainCached(question)
  const afterFirst = calls.length
  const second = await llmExplainCached(question)
  const afterSecond = calls.length

  ok('首次调用会请求模型', afterFirst === before + 1)
  ok('二次调用命中缓存，不再请求', afterSecond === afterFirst, `${afterFirst} → ${afterSecond}`)
  ok('两次拿到同样内容', JSON.stringify(first) === JSON.stringify(second))
  ok('缓存可读回', getCachedExplain('q-1')?.vocab.length === 2)
  ok('未缓存的题返回 null', getCachedExplain('q-999') === null)

  clearCachedExplain('q-1')
  ok('按题目清除缓存', getCachedExplain('q-1') === null)
}

console.log('\n=== 用例 8：脏缓存不能让界面崩（回归）===')
{
  const put = (v: unknown) => store.set('opencet.llm.explain.v1', JSON.stringify({ 'q-1': v }))

  // 这正是实际踩到的坑：缓存里存的是「字符串」而不是对象，
  // 旧代码直接返回，模板读 structure.main 时抛 TypeError，把整个结果区一起搞崩。
  put(JSON.stringify(GOOD))
  ok('缓存是字符串时返回 null 而不是崩', getCachedExplain('q-1') === null)

  put({ vocab: GOOD.vocab })
  ok('缺 structure 时返回 null', getCachedExplain('q-1') === null)

  put({ vocab: GOOD.vocab, structure: { main: 'A is B.' } })
  ok('structure 缺 parts 时返回 null', getCachedExplain('q-1') === null)

  put({ structure: GOOD.structure })
  ok('缺 vocab 时返回 null', getCachedExplain('q-1') === null)

  put(null)
  ok('null 时返回 null', getCachedExplain('q-1') === null)

  put([1, 2, 3])
  ok('数组时返回 null', getCachedExplain('q-1') === null)

  // 合法但字段有缺，应被补成字符串而不是原样返回
  put({ vocab: GOOD.vocab, structure: { parts: GOOD.structure.parts }, tips: 'oops' })
  const patched = getCachedExplain('q-1')
  ok('缺 main/pattern/summary 补成空串', patched?.structure.main === '' && patched?.structure.summary === '')
  ok('tips 非数组补成空数组', Array.isArray(patched?.tips) && patched!.tips.length === 0)
  ok('parts 完整保留', patched?.structure.parts.length === 3)

  // 合法缓存仍能正常读回
  put(GOOD)
  const good = getCachedExplain('q-1')
  ok('正常缓存读回不变', good?.vocab.length === 2 && good?.structure.main === GOOD.structure.main)

  clearCachedExplain()
}

console.log(`\n${'='.repeat(48)}`)
console.log(`AI 讲解解析测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(48))
process.exit(fail === 0 ? 0 : 1)
