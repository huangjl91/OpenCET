/**
 * 「上传真题练阅读 + AI 按方法批改」的测试。
 *
 * 三条主线：
 *   1. **切分**：整卷里认出阅读部分，且分得清段落匹配与仔细阅读
 *   2. **提示词里必须带着方法** —— 这是本功能与「随便找个 AI 对答案」的区别：
 *      提示词要写死关键词定位 / 首句主旨 / 同义替换，并要求先判题型再讲步骤
 *   3. **解析不可信输出**：模型说「对了」不算数，一律按答案本地重算
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/readingPractice.test.mts
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
  splitReading,
  readingKindOf,
  optionsOf,
  hasLocalAnswers,
  judgeLocally,
  normalizeAnswer,
  buildJudgeMessages,
  parseJudgeResult,
  guessQuestionType,
  normalizeQuestionType,
  methodHintOf,
} = await import('../frontend/src/utils/readingPractice')
const { extractParagraphLabels } = await import('../frontend/src/utils/paperParser')
const { STEP_TEMPLATES, TYPE_LABEL } = await import('../frontend/src/utils/readingGuide')

/* ---------------- 造一份「像真题」的切分结果 ---------------- */
const MATCH_PASSAGE = [
  'A) The local library has become a place where people can borrow much more than books.',
  'B) Volunteers help children with their homework after school every weekday.',
  'C) The number of visitors has grown steadily over the past five years.',
  'D) Many readers say the quiet reading room is the main reason they come.',
  'E) The library also lends tools such as drills and sewing machines.',
  'F) Funding comes partly from the city and partly from private donors.',
].join('\n')

const CAREFUL_PASSAGE = [
  'Chronic absence from school has become a crisis in many districts.',
  'The U.S. secretary of education said in an open letter that the problem is deplorable.',
  'Researchers found that students who miss school regularly perform worse in tests.',
].join('\n')

const matching = {
  type: 'reading',
  title: 'Part III Reading Comprehension Section B 长篇阅读',
  passage: MATCH_PASSAGE,
  key: 'k1',
  questions: Array.from({ length: 6 }, (_, i) => ({
    orderNo: 36 + i,
    stem: `Statement number ${36 + i} about the library.`,
    options: [],
    answer: '',
    analysis: '',
  })),
}

const careful = {
  type: 'reading',
  title: 'Part III Reading Comprehension Passage One',
  passage: CAREFUL_PASSAGE,
  key: 'k2',
  questions: [
    {
      orderNo: 46,
      stem: 'What does the U.S. secretary of education say in his open letter?',
      options: [
        'A) It is vital to respond promptly to the school absence crisis.',
        'B) The academic performance of absent students is deplorable.',
        'C) Low achievement is mainly attributed to school absences.',
        'D) Schools should hire more teachers.',
      ],
      answer: 'A',
      analysis: '',
    },
    {
      orderNo: 47,
      stem: 'What did researchers find?',
      options: ['A) Students like school.', 'B) Regular absence hurts test performance.', 'C) Teachers are absent.', 'D) Tests are hard.'],
      answer: '',
      analysis: '',
    },
  ],
}

const paper = {
  title: '2025年6月六级真题（第1套）',
  level: 'CET6',
  yearMonth: '2025-06',
  rawText: '',
  sections: [
    { type: 'writing', title: 'Part I Writing', passage: '', questions: [], key: 'w' },
    matching,
    careful,
    { type: 'translation', title: 'Part IV Translation', passage: '', questions: [], key: 't' },
  ],
}

/* ---------------- 1. 切分 ---------------- */
console.log('\n=== 1. 从整卷切出阅读部分 ===')
{
  const parts = splitReading(paper as never)
  ok('只挑出阅读部分（写作/翻译不算）', parts.length === 2, String(parts.length))
  ok('长篇阅读被认成段落匹配', parts[0].kind === 'matching', parts[0].kind)
  ok('仔细阅读被认成 careful', parts[1].kind === 'careful', parts[1].kind)
  ok('段落匹配拿到原文段落标号当选项', parts[0].labels.length === extractParagraphLabels(MATCH_PASSAGE).length, parts[0].labels.join())
  ok('仔细阅读不带段落标号', parts[1].labels.length === 0)
  ok('题数保留', parts[0].questions.length === 6 && parts[1].questions.length === 2)
  ok('id 唯一', new Set(parts.map((p) => p.id)).size === parts.length)
  ok('标题清掉了 Part III 前缀', !parts[0].title.includes('Part III'), parts[0].title)
  ok('标题保留了 Section / Passage 信息', /Section B|长篇阅读/.test(parts[0].title) && /Passage One/.test(parts[1].title), parts[0].title + ' | ' + parts[1].title)

  ok('没有阅读部分时返回空数组', splitReading({ sections: [] } as never).length === 0)
  ok('空 sections 不炸', splitReading({} as never).length === 0)
  // 纯标题含 Section B 但 passage 没标号 → 不该当成匹配
  const fake = { type: 'reading', title: 'Section B', passage: 'A lot of people believe this is true.', questions: [{ orderNo: 1, stem: 'x', options: [], answer: '', analysis: '' }], key: 'f' }
  ok('只有标题像 Section B 但没段落标号 → 不误判成匹配', readingKindOf(fake as never) === 'careful')
}

/* ---------------- 2. 选项与判分 ---------------- */
console.log('\n=== 2. 选项与本地判分 ===')
{
  const parts = splitReading(paper as never)
  const m = parts[0]
  const c = parts[1]

  ok('段落匹配的选项就是段落字母', optionsOf(m, m.questions[0]).join() === m.labels.join())
  ok('仔细阅读的选项是 A/B/C/D', optionsOf(c, c.questions[0]).join() === 'A,B,C,D', optionsOf(c, c.questions[0]).join())
  ok('选项里不会出现空字符串', optionsOf(c, c.questions[1]).every((x) => x.length === 1))

  ok('归一化：大写去标点', normalizeAnswer(' b) ') === 'B' && normalizeAnswer('a.') === 'A')
  ok('归一化：空值返回空串', normalizeAnswer('') === '' && normalizeAnswer('  ') === '')

  ok('卷面有答案时才谈本地判分', hasLocalAnswers(c) && !hasLocalAnswers(m))

  const judged = judgeLocally(c, { 46: 'A', 47: 'B' })
  ok('答对判对', judged[0].isCorrect)
  ok('没答案的题不算对也不算错（correctAnswer 为空）', judged[1].correctAnswer === '' && !judged[1].isCorrect)
  ok('小写作答也算对', judgeLocally(c, { 46: 'a' })[0].isCorrect)
  ok('没作答不算对', !judgeLocally(c, {})[0].isCorrect)
  ok('判分结果覆盖所有题', judged.length === c.questions.length)
}

/* ---------------- 3. 提示词必须带着方法 ---------------- */
console.log('\n=== 3. 提示词（「按方法教」就靠它）===')
{
  const parts = splitReading(paper as never)
  const m = parts[0]
  const msgs = buildJudgeMessages(m, { 36: 'B', 37: 'A' })

  ok('两条消息（system + user）', msgs.length === 2)
  const sys = msgs[0].content
  const user = msgs[1].content

  // 方法三件套必须出现
  ok('方法里有关键词', sys.includes('关键词'))
  ok('方法里有回原文定位', sys.includes('定位'))
  ok('方法里有同义替换', sys.includes('同义替换'))
  ok('方法里有主旨题读段首句', sys.includes('第一句'))
  ok('三种题型的方法都写进了提示词', sys.includes('长篇阅读') && sys.includes('主旨题') && sys.includes('细节题'))

  ok('要求先判题型', sys.includes('哪一类') || sys.includes('题型'))
  ok('要求讲清学生错在哪', sys.includes('说清学生错在哪') && sys.includes('whyWrong'))
  ok('要求输出 JSON', sys.includes('JSON') && sys.includes('results') && sys.includes('steps'))
  ok('要求逐题给出步骤', sys.includes('steps') && sys.includes('detail'))

  ok('原文进了提示词', user.includes('The local library has become a place'))
  ok('段落字母作为选项给出', user.includes('A / B / C / D / E / F'))
  ok('每道题的题干都进了提示词', m.questions.every((q) => user.includes(String(q.orderNo)) && user.includes(q.stem)))
  ok('学生的作答进了提示词', user.includes('学生选：B') && user.includes('学生选：A'))
  ok('未作答的题也标出来', buildJudgeMessages(m, {})[1].content.includes('未作答'))
  ok('要求 results 数量与题数一致', user.includes(`长度必须是 ${m.questions.length}`))

  // 仔细阅读：选项原文进提示词
  const cmsgs = buildJudgeMessages(parts[1], { 46: 'B' })
  ok('仔细阅读把 A/B/C/D 选项原文带上', cmsgs[1].content.includes('A) It is vital to respond promptly'))
  ok('仔细阅读不列段落字母', !cmsgs[1].content.includes('原文段落标号'))
}

/* ---------------- 3b. 必须先判题型（这是用户点出来的问题） ---------------- */
console.log('\n=== 3b. 先判题型，再按对应方法讲 ===')
{
  const parts = splitReading(paper as never)
  const sys = buildJudgeMessages(parts[1], {})[0].content

  ok('明确要求第一步先判题型', sys.includes('第一步') && sys.includes('先判题型'))
  ok('给出题型判断依据', sys.includes('主旨题') && sys.includes('main idea') && sys.includes('细节题'))
  ok('点明「题型判错后面全错」', sys.includes('题型判错'))
  ok('要求 steps 第一步是「判断题型」', sys.includes('判断题型'))
  ok('主旨题要用读段首句的办法（不能套细节题）', sys.includes('读每段首句') && sys.includes('不能拿细节题那套'))

  // 三种题型的步骤序列都要出现，且与示范的骨架一致
  ok('三种题型的步骤序列都写进了提示词', sys.includes('主旨题：') && sys.includes('细节题：') && sys.includes('匹配题：'))
  ok(
    '主旨题步骤序列与示范骨架一致',
    STEP_TEMPLATES.main.every((s) => sys.includes(s)),
    STEP_TEMPLATES.main.join(' → '),
  )
  ok(
    '细节题步骤序列与示范骨架一致',
    STEP_TEMPLATES.detail.every((s) => sys.includes(s)),
    STEP_TEMPLATES.detail.join(' → '),
  )
  ok(
    '匹配题步骤序列与示范骨架一致',
    STEP_TEMPLATES.long.every((s) => sys.includes(s)),
    STEP_TEMPLATES.long.join(' → '),
  )

  // 每道题都带上题干特征的题型提示
  const user = buildJudgeMessages(parts[1], {})[1].content
  ok('每道题都带题型提示', (user.match(/题干特征提示/g) ?? []).length === parts[1].questions.length)
  ok('提示里说明只是参考、要通读原文确认', user.includes('请通读原文后确认'))
}

/* ---------------- 3c. 题型判定本身 ---------------- */
console.log('\n=== 3c. 题型判定 ===')
{
  const MAIN_STEMS = [
    'What is the passage mainly about?',
    'What is the main idea of the passage?',
    'Which of the following is the best title for the passage?',
    "What is the author's purpose in writing this passage?",
    'The passage mainly discusses ____.',
    'What is the text mainly concerned with?',
  ]
  for (const s of MAIN_STEMS) {
    ok(`「${s.slice(0, 34)}…」判为主旨题`, guessQuestionType(s, 'careful') === 'main', guessQuestionType(s, 'careful'))
  }

  const DETAIL_STEMS = [
    'What does the U.S. secretary of education say in his open letter?',
    'What did researchers find?',
    'Why did the company cut working hours?',
    'How many students were absent last year?',
  ]
  for (const s of DETAIL_STEMS) {
    ok(`「${s.slice(0, 34)}…」判为细节题`, guessQuestionType(s, 'careful') === 'detail', guessQuestionType(s, 'careful'))
  }

  ok('段落匹配一律判成匹配题', guessQuestionType('What is the main idea?', 'matching') === 'long')
  ok('空题干不炸', guessQuestionType('', 'careful') === 'detail')
  ok('大小写不敏感', guessQuestionType('WHAT IS THE MAIN IDEA?', 'careful') === 'main')

  // 归一化
  ok('模型说「主旨题」→ 主旨题', normalizeQuestionType('主旨题', 'detail') === '主旨题')
  ok('模型说 main idea → 主旨题', normalizeQuestionType('main idea question', 'detail') === '主旨题')
  ok('模型说 detail → 细节题', normalizeQuestionType('detail', 'main') === '细节题')
  ok('模型说 matching → 匹配题', normalizeQuestionType('段落匹配', 'detail') === '匹配题')
  ok('词汇题照实保留', normalizeQuestionType('词汇题', 'detail') === '词汇题')
  ok('推断题照实保留', normalizeQuestionType('inference', 'detail') === '推断题')
  ok('模型没给 → 用题干特征猜的结果', normalizeQuestionType('', 'main') === '主旨题')
  ok('认不出来 → 退回猜测结果', normalizeQuestionType('乱七八糟', 'detail') === '细节题')

  // 解析时也用上：模型没给题型时用猜测值
  const m2 = splitReading(paper as never)[1]
  const out = parseJudgeResult('{"results":[{"orderNo":46,"correctAnswer":"A"}]}', m2, { 46: 'A' })
  ok('模型没给题型 → 用题干特征猜的题型', out[0].questionType === '细节题', out[0].questionType)
  const out2 = parseJudgeResult('{"results":[{"orderNo":46,"correctAnswer":"A","questionType":"主旨题"}]}', m2, { 46: 'A' })
  ok('模型给了题型 → 用模型的', out2[0].questionType === '主旨题')
  const out3 = parseJudgeResult('{"results":[{"orderNo":46,"correctAnswer":"A","questionType":"main"}]}', m2, { 46: 'A' })
  ok('模型的英文题型也归一', out3[0].questionType === '主旨题')

  // 每种题型都要有配套的方法提示（之前漏了，界面上那块是空的）
  for (const t of ['主旨题', '细节题', '匹配题', '词汇题', '推断题']) {
    ok(`「${t}」有配套的方法提示`, methodHintOf(t).length > 0, methodHintOf(t))
  }
  ok('主旨题的方法提示是「读每段第一句」', methodHintOf('主旨题').includes('第一句'))
  ok('细节题的方法提示是「关键词定位」', methodHintOf('细节题').includes('定位'))
  ok('主旨题与细节题的方法提示不同', methodHintOf('主旨题') !== methodHintOf('细节题'))
  ok('未知题型返回空串（不显示假提示）', methodHintOf('玄学题') === '')
}

/* ---------------- 4. 解析模型输出 ---------------- */
console.log('\n=== 4. 解析（不可信输出）===')
{
  const parts = splitReading(paper as never)
  const c = parts[1]
  const answers = { 46: 'B', 47: 'B' }

  const good = JSON.stringify({
    results: [
      {
        orderNo: 46,
        questionType: '细节题',
        correctAnswer: 'A',
        isCorrect: true, // 故意说谎：模型说答对了，实际学生选 B
        steps: [
          { name: '找关键词', detail: '题干里的 open letter 是定位词' },
          { name: '回原文定位', detail: '第二句 said in an open letter' },
          { name: '识别同义替换', detail: 'vital ↔ of vital importance' },
          { name: '得出结论', detail: '所以选 A' },
        ],
        evidence: 'The U.S. secretary of education said in an open letter that the problem is deplorable.',
        whyWrong: '学生被 deplorable 原词吸引，选了 B',
        takeaway: '看到原词照抄要警惕',
      },
      { orderNo: 47, questionType: '细节题', correctAnswer: 'B', steps: [{ name: '定位', detail: '第三句' }] },
    ],
  })
  const out = parseJudgeResult(good, c, answers)
  ok('结果数与题数一致', out.length === c.questions.length, String(out.length))
  ok('顺序按题号', out[0].orderNo === 46 && out[1].orderNo === 47)
  ok('题型解析出来', out[0].questionType === '细节题')
  ok('步骤解析成 name/detail', out[0].steps.length === 4 && out[0].steps[0].name === '找关键词')
  ok('原文证据解析出来', out[0].evidence.includes('open letter'))
  ok('错因与要点解析出来', out[0].whyWrong.includes('deplorable') && out[0].takeaway.includes('原词'))

  // 最关键：不采信模型自述的对错
  ok('★ 模型说 isCorrect=true，但仍按答案重算为错', out[0].isCorrect === false, String(out[0].isCorrect))
  ok('答对的题重算为对', out[1].isCorrect === true)

  // 畸形输出
  ok('纯文字无 JSON 不炸', parseJudgeResult('抱歉，我无法完成', c, answers).length === c.questions.length)
  ok('无 JSON 时步骤为空', parseJudgeResult('xxx', c, answers).every((r) => r.steps.length === 0))
  ok('results 不是数组不炸', parseJudgeResult('{"results":"oops"}', c, answers).length === c.questions.length)
  ok('空串不炸', parseJudgeResult('', c, answers).length === c.questions.length)

  const partial = parseJudgeResult('{"results":[{"orderNo":46,"correctAnswer":"A"}]}', c, answers)
  ok('缺字段填空串', partial[0].steps.length === 0 && partial[0].evidence === '' && partial[0].whyWrong === '')
  ok('缺字段仍能判定对错', partial[0].isCorrect === false)
  ok('没提到的题也返回（界面不缺位）', partial[1].orderNo === 47 && partial[1].correctAnswer === '')

  const wrongNo = parseJudgeResult('{"results":[{"orderNo":999,"correctAnswer":"A"}]}', c, answers)
  ok('题号对不上的条目被丢掉', wrongNo.every((r) => r.orderNo !== 999))

  const altKeys = parseJudgeResult('{"results":[{"no":46,"answer":"A","type":"主旨题","step":["只读首句"]}]}', c, answers)
  ok('兼容 no / answer / type 别名', altKeys[0].correctAnswer === 'A' && altKeys[0].questionType === '主旨题')
  ok('steps 支持纯字符串数组', altKeys[0].steps.length === 1 && altKeys[0].steps[0].detail === '只读首句')

  const codeFence = parseJudgeResult('```json\n{"results":[{"orderNo":46,"correctAnswer":"A"}]}\n```', c, answers)
  ok('带代码围栏也能解析', codeFence[0].correctAnswer === 'A')

  // 匹配题的题号也对得上
  const mout = parseJudgeResult('{"results":[{"orderNo":37,"correctAnswer":"D"}]}', parts[0], { 37: 'B' })
  ok('匹配题批改正常', mout.find((r) => r.orderNo === 37)?.isCorrect === false)
  ok('匹配题默认题型叫「匹配题」', mout.find((r) => r.orderNo === 36)?.questionType === '匹配题')
}

/* ---------------- 5. 界面接线 ---------------- */
console.log('\n=== 5. 界面接线 ===')
{
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/ReadingView.vue'), 'utf8')
  ok('阅读方法页引了练习组件', view.includes("import ReadingPractice from '@/components/ReadingPractice.vue'"))
  ok('页面上渲染了它', view.includes('<ReadingPractice />'))

  const comp = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/components/ReadingPractice.vue'), 'utf8')
  ok('有文件上传入口', comp.includes('type="file"') && comp.includes('extractTextFromFile'))
  ok('支持拖拽', comp.includes('@drop.prevent="onDrop"'))
  ok('用真实切分器', comp.includes('parsePaper') && comp.includes('splitReading'))
  ok('有段落字母选择器', comp.includes('letter-picker'))
  ok('仔细阅读选项可点', comp.includes('rp__opt'))
  ok('提交走 AI 批改', comp.includes('llmJudgeReading'))
  ok('没配 Key 时给出提示', comp.includes('hasApiKey()') && comp.includes('模型设置'))
  ok('卷面带答案时可本地先判', comp.includes('hasLocalAnswers') && comp.includes('runLocalJudge'))
  ok('无阅读部分时给出可读原因', comp.includes('没切出阅读部分'))
  ok('扫描版 PDF 有提示', comp.includes('扫描版'))

  const util = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/utils/readingPractice.ts'), 'utf8')
  ok('提示词直接引用页面上的方法卡（不会两边讲的不一样）', util.includes('METHOD_CARDS'))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`阅读练习测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
