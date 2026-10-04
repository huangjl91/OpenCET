/**
 * 错题本功能体检：驱动真实 mockApi 走完整生命周期。
 *
 * 检查项：
 *   1. 翻译答错 → 自动收录
 *   2. 同一题再答错 → 去重（只更新，不堆记录）
 *   3. AI 复核后达标 → 自动移出
 *   4. 手动标记已掌握 / 取消
 *   5. 删除单条 / 按类型清空
 *   6. 列表筛选（类型 / 已掌握）
 *   7. 真题答错、单词不认识 → 当前是否收录（记录实际行为）
 *   8. 统计口径 errorCount
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/errorbook.test.mts
 */
import fs from 'node:fs'
import path from 'node:path'

let pass = 0
let fail = 0
const notes: string[] = []
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`)
  }
}
function note(msg: string) {
  notes.push(msg)
  console.log(`  ⚠ ${msg}`)
}

/* ---------------- localStorage / fetch 桩 ---------------- */
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
const root = process.cwd()
const realFetch = globalThis.fetch
// @ts-expect-error 测试环境
globalThis.fetch = async (input: unknown, init?: unknown) => {
  const url = String(input)
  if (url.startsWith('/data/')) {
    return new Response(fs.readFileSync(path.resolve(root, 'frontend/public' + url), 'utf8'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return realFetch(input as RequestInfo, init as RequestInit)
}

const { mockApi } = await import('../frontend/src/api/mock')

const list = await mockApi.listTranslations('CET4')
const q = list[0]
const WRONG_ANSWER = 'totally unrelated garbage answer'
const RIGHT_ANSWER = q.reference

console.log(`\n用题：${q.id}「${q.prompt.slice(0, 30)}…」`)

/* ---------------- 1. 答错自动收录 ---------------- */
console.log('\n=== 1. 翻译答错自动收录 ===')
{
  const r = await mockApi.submitTranslation({ questionId: q.id, answer: WRONG_ANSWER })
  ok('分数低于 70（收录门槛）', r.score < 70, `score=${r.score}`)
  const errs = await mockApi.listErrors()
  ok('错题本里有 1 条', errs.length === 1, String(errs.length))
  const e = errs[0]
  ok('来源类型是 TRANSLATION', e?.sourceType === 'TRANSLATION', e?.sourceType)
  ok('记录了题目原文', e?.content === q.prompt)
  ok('记录了参考答案', e?.rightAnswer === q.reference)
  ok('记录了用户作答', e?.userAnswer === WRONG_ANSWER, e?.userAnswer)
  ok('note 里带分数与未命中核心词', (e?.note ?? '').includes('得分'), e?.note)
  ok('初始未掌握', e?.resolved === false)
  ok('有创建时间', !!e?.createTime)
}

/* ---------------- 2. 同题再答错去重 ---------------- */
console.log('\n=== 2. 同题重复答错应去重 ===')
{
  const before = (await mockApi.listErrors()).length
  await mockApi.submitTranslation({ questionId: q.id, answer: WRONG_ANSWER + ' v2' })
  const errs = await mockApi.listErrors()
  ok('记录数没有增加', errs.length === before, `${before} → ${errs.length}`)
  ok('作答被更新成最新一次', errs[0].userAnswer === WRONG_ANSWER + ' v2', errs[0].userAnswer)
}

/* ---------------- 3. 答对也不该自动移出（只有 AI 复核才移） ---------------- */
console.log('\n=== 3. 机器分达标时的行为 ===')
{
  const r = await mockApi.submitTranslation({ questionId: q.id, answer: RIGHT_ANSWER })
  ok('参考答案拿高分', r.score >= 70, `score=${r.score}`)
  const errs = await mockApi.listErrors()
  note(
    `机器分达标（${r.score}）时错题记录仍然留在错题本里（${errs.length} 条）——` +
      `只有走 AI 复核（reviewTranslation）才会按综合分自动移出`
  )
  ok('提交接口本身不会误删', errs.length >= 1)
}

/* ---------------- 4. AI 复核达标 → 自动移出 ---------------- */
console.log('\n=== 4. AI 复核达标自动移出 ===')
{
  await mockApi.submitTranslation({ questionId: q.id, answer: WRONG_ANSWER })
  ok('先制造一条错题', (await mockApi.listErrors()).length === 1)

  const r = await mockApi.reviewTranslation({
    questionId: q.id,
    answer: WRONG_ANSWER,
    llmScore: 95,
    finalScore: 95,
    llmComment: '语义完整',
    polish: 'A polished version.',
  })
  ok('复核返回综合分', r.score === (r.score ?? 0))
  const errs = await mockApi.listErrors()
  ok('达标后错题被移出', errs.length === 0, String(errs.length))
}

/* ---------------- 5. 复核仍不达标 → 保留并带上 AI 润色 ---------------- */
console.log('\n=== 5. AI 复核仍不达标 ===')
{
  await mockApi.submitTranslation({ questionId: q.id, answer: WRONG_ANSWER })
  await mockApi.reviewTranslation({
    questionId: q.id,
    answer: WRONG_ANSWER,
    llmScore: 20,
    finalScore: 25,
    llmComment: '语法错误较多',
    polish: 'A polished version.',
  })
  const errs = await mockApi.listErrors()
  ok('错题保留', errs.length === 1, String(errs.length))
  ok('参考答案附上了 AI 润色', (errs[0].rightAnswer ?? '').includes('【AI 润色】'), errs[0].rightAnswer?.slice(0, 60))
  ok('note 带 AI 点评', (errs[0].note ?? '').includes('AI 点评'), errs[0].note)
}

/* ---------------- 6. 手动标记 / 取消 ---------------- */
console.log('\n=== 6. 手动标记已掌握 ===')
{
  const e = (await mockApi.listErrors())[0]
  const up = await mockApi.updateError(e.id, { resolved: true })
  ok('返回已掌握', up.resolved === true)
  ok('库里已更新', (await mockApi.listErrors())[0].resolved === true)
  const down = await mockApi.updateError(e.id, { resolved: false })
  ok('可以取消', down.resolved === false)
  const noted = await mockApi.updateError(e.id, { note: '自己加的备注' })
  ok('可以写备注', noted.note === '自己加的备注')
}

/* ---------------- 7. 列表筛选 ---------------- */
console.log('\n=== 7. 列表筛选 ===')
{
  const all = await mockApi.listErrors()
  const trans = await mockApi.listErrors('TRANSLATION')
  const paperOnly = await mockApi.listErrors('PAPER')
  const wordOnly = await mockApi.listErrors('WORD')
  const unresolved = await mockApi.listErrors(undefined, false)
  const resolved = await mockApi.listErrors(undefined, true)
  ok('按 TRANSLATION 过滤拿到全部', trans.length === all.length)
  ok('此时还没有 PAPER 来源', paperOnly.length === 0, String(paperOnly.length))
  ok('此时还没有 WORD 来源', wordOnly.length === 0, String(wordOnly.length))
  ok('未掌握计数正确', unresolved.length === all.length)
  ok('已掌握计数正确', resolved.length === 0, String(resolved.length))
}

/* ---------------- 8. 删除 / 清空 ---------------- */
console.log('\n=== 8. 删除与清空 ===')
{
  const e = (await mockApi.listErrors())[0]
  await mockApi.deleteError(e.id)
  ok('删除单条生效', (await mockApi.listErrors()).length === 0)

  // 造 3 条翻译错题
  for (const item of list.slice(0, 3)) {
    await mockApi.submitTranslation({ questionId: item.id, answer: WRONG_ANSWER })
  }
  ok('造出 3 条', (await mockApi.listErrors()).length === 3, String((await mockApi.listErrors()).length))

  await mockApi.clearErrors('PAPER')
  ok('按类型清空 PAPER 不影响 TRANSLATION', (await mockApi.listErrors()).length === 3)

  await mockApi.clearErrors()
  ok('全部清空生效', (await mockApi.listErrors()).length === 0)
}

/* ---------------- 9. 真题答错 / 单词不认识 是否收录 ---------------- */
console.log('\n=== 9. 真题来源 ===')
{
  await mockApi.clearErrors()

  // 造一份带答案键的真题
  const { id: paperId } = await mockApi.createPaper({
    title: '错题本体检卷',
    level: 'CET4',
    sections: [
      {
        type: 'reading',
        title: 'Passage One',
        passage: 'Some passage.',
        questions: [
          { orderNo: 46, stem: 'What is it?', options: ['A) x', 'B) y', 'C) z', 'D) w'], answer: 'A', analysis: '因为…' },
          { orderNo: 47, stem: 'Another one?', options: ['A) p', 'B) q', 'C) r', 'D) s'], answer: 'C', analysis: '' },
        ],
      },
    ],
  })
  const paper = await mockApi.getPaper(paperId)
  const [pqWrong, pqRight] = paper.sectionList[0].questions

  // 故意答错（正确答案 A，选 B）
  await mockApi.updateQuestion(pqWrong.id, { userAnswer: 'B', done: true })
  const afterWrong = await mockApi.listErrors()
  ok('真题答错自动收录', afterWrong.length === 1, String(afterWrong.length))
  const pe = afterWrong[0]
  ok('来源类型是 PAPER', pe?.sourceType === 'PAPER', pe?.sourceType)
  ok('标题带试卷名与题号', (pe?.title ?? '').includes('错题本体检卷') && (pe?.title ?? '').includes('第 46 题'), pe?.title)
  ok('记录了题干', (pe?.content ?? '').includes('What is it?'), pe?.content)
  ok('记录了用户选择与正确答案', pe?.userAnswer === 'B' && (pe?.rightAnswer ?? '').startsWith('A'), `${pe?.userAnswer} / ${pe?.rightAnswer}`)
  ok('note 说明对错', (pe?.note ?? '').includes('答错'), pe?.note)

  // 同一题再答错 → 去重
  await mockApi.updateQuestion(pqWrong.id, { userAnswer: 'D', done: true })
  ok('同一题重复答错去重', (await mockApi.listErrors()).length === 1, String((await mockApi.listErrors()).length))
  ok('作答更新为最新', (await mockApi.listErrors())[0].userAnswer === 'D')

  // 答对 → 自动移出
  await mockApi.updateQuestion(pqWrong.id, { userAnswer: 'A', done: true })
  ok('改答对后自动移出', (await mockApi.listErrors()).length === 0, String((await mockApi.listErrors()).length))

  // 重做本题（清空作答）→ 也移出
  await mockApi.updateQuestion(pqRight.id, { userAnswer: 'A', done: true })
  ok('先制造一条（47 题答错）', (await mockApi.listErrors()).length === 1)
  await mockApi.updateQuestion(pqRight.id, { userAnswer: '', done: false })
  ok('重做本题清空作答后移出', (await mockApi.listErrors()).length === 0)

  // 没有答案键的卷子不能瞎判
  const { id: noKeyId } = await mockApi.createPaper({
    title: '无答案键的卷子',
    level: 'CET4',
    sections: [
      {
        type: 'reading',
        title: 'Section B 长篇阅读',
        passage: 'A) foo\nB) bar\nC) baz',
        questions: [{ orderNo: 36, stem: 'No key here.', options: ['A', 'B', 'C'], answer: '', analysis: '' }],
      },
    ],
  })
  const noKeyPaper = await mockApi.getPaper(noKeyId)
  await mockApi.updateQuestion(noKeyPaper.sectionList[0].questions[0].id, { userAnswer: 'B', done: true })
  ok('没有答案键的题不收录（不瞎判对错）', (await mockApi.listErrors()).length === 0, String((await mockApi.listErrors()).length))
}

console.log('\n=== 10. 单词来源 ===')
{
  await mockApi.clearErrors()
  const words = await mockApi.listWords('CET4')

  await mockApi.submitWord({ wordId: words[0].id, result: 'UNKNOWN', mode: 'new' })
  const afterUnknown = await mockApi.listErrors()
  ok('点「不认识」自动收录', afterUnknown.length === 1, String(afterUnknown.length))
  const we = afterUnknown[0]
  ok('来源类型是 WORD', we?.sourceType === 'WORD', we?.sourceType)
  ok('标题是单词本身', we?.title === words[0].word, we?.title)
  ok('记录了释义', (we?.rightAnswer ?? '').includes(words[0].meaning.slice(0, 6)), we?.rightAnswer)
  ok('作答记为「不认识」', we?.userAnswer === '不认识', we?.userAnswer)
  ok('note 带答错次数', (we?.note ?? '').includes('答错'), we?.note)

  ok('生词本也同时收到（两者用途不同）', (await mockApi.notebook()).length === 1)

  // 重复答错去重
  await mockApi.submitWord({ wordId: words[0].id, result: 'UNKNOWN', mode: 'review' })
  ok('重复答错去重', (await mockApi.listErrors()).length === 1, String((await mockApi.listErrors()).length))

  // 「模糊」不算答错，不收录
  await mockApi.submitWord({ wordId: words[1].id, result: 'FUZZY', mode: 'new' })
  ok('「模糊」不收录（只进生词本）', (await mockApi.listErrors()).length === 1, String((await mockApi.listErrors()).length))

  // 练到掌握 → 自动移出（familiarity 到 3）
  for (let i = 0; i < 3; i++) {
    await mockApi.submitWord({ wordId: words[0].id, result: 'KNOWN', mode: 'review' })
  }
  ok('练到掌握后自动移出', (await mockApi.listErrors()).length === 0, String((await mockApi.listErrors()).length))
}

/* ---------------- 11. 统计口径 ---------------- */
console.log('\n=== 11. 统计口径 ===')
{
  await mockApi.clearErrors()
  for (const item of list.slice(0, 2)) {
    await mockApi.submitTranslation({ questionId: item.id, answer: WRONG_ANSWER })
  }
  const s = await mockApi.stats()
  ok('errorCount 统计未掌握的错题', s.errorCount === 2, String(s.errorCount))
  const e = (await mockApi.listErrors())[0]
  await mockApi.updateError(e.id, { resolved: true })
  const s2 = await mockApi.stats()
  ok('标记已掌握后计数减 1', s2.errorCount === 1, String(s2.errorCount))
}

console.log(`\n${'='.repeat(56)}`)
console.log(`错题本体检：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(56))
if (notes.length) {
  console.log('\n发现的问题：')
  notes.forEach((n, i) => console.log(`  ${i + 1}. ${n}`))
}
process.exit(fail === 0 ? 0 : 1)
