/**
 * 生成一份「可导入的试卷数据」用于界面验证。
 *
 * 走真实的 PDF → 切分 → mockApi.createPaper 链路，最后把 localStorage 里的
 * `opencet.db.v1` 导出成 JSON。把这个 JSON 灌进应用，就能在界面上看到
 * 长篇阅读（段落匹配）的选项到底渲染成什么样。
 *
 * 用法（工作目录必须是项目根）：
 *   npx tsx --tsconfig frontend/tsconfig.json tools/seed-paper.mts 输出路径.json
 */
import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from '../../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
import { itemsToLines } from '../../frontend/src/utils/pdfLines'
import { parsePaper, extractParagraphLabels } from '../../frontend/src/utils/paperParser'

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
pdfjs.GlobalWorkerOptions.workerSrc =
  'file://' + path.resolve(root, 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').replace(/\\/g, '/')

const realFetch = globalThis.fetch
// @ts-expect-error 测试环境
globalThis.fetch = async (input: unknown, init?: unknown) => {
  const url = String(input)
  if (url.startsWith('/data/')) {
    const file = path.resolve(root, 'frontend/public' + url)
    return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input as RequestInfo, init as RequestInit)
}

/* ---------------- 解析真实 PDF ---------------- */
const pdfPath = process.argv[3] || process.env.OPEN_CET_CET6_PDF || ''
if (!pdfPath || !fs.existsSync(pdfPath)) {
  console.error('用法：OPEN_CET_CET6_PDF="<六级真题.pdf>" npx tsx tools/dev/seed-paper.mts')
  console.error('（真题有版权、不进仓库，所以要自己指定路径）')
  process.exit(1)
}
const data = new Uint8Array(fs.readFileSync(pdfPath))
const doc = await pdfjs.getDocument({ data }).promise
const pages: string[] = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  pages.push(itemsToLines((await page.getTextContent()).items).join('\n'))
}
const parsed = parsePaper(pages.join('\n\n'), 'CET6')

/* ---------------- 通过 mockApi 落库 ---------------- */
const { mockApi } = await import('../../frontend/src/api/mock')
const { id } = await mockApi.createPaper({
  title: '2025年6月六级真题（第1套）',
  level: 'CET6',
  yearMonth: '2025-06',
  source: '界面验证用',
  rawText: parsed.rawText,
  sections: parsed.sections.map((s) => ({
    type: s.type,
    title: s.title,
    passage: s.passage,
    questions: s.questions.map((q) => ({
      orderNo: q.orderNo,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
    })),
  })),
})

const paper = await mockApi.getPaper(id)
console.log('已生成试卷 id=' + id)
console.log('  模块数:', paper.sectionList.length, ' 总题数:', paper.totalCount)
for (const s of paper.sectionList) {
  const labels = extractParagraphLabels(s.passage)
  console.log(
    `    [${s.type}] ${s.title}  q=${s.questions.length}  opts=${s.questions[0]?.options.length ?? 0}  段落标号=${labels.length}`
  )
}
// 认「阅读类型 + 原文带段落标号」：选词填空的原文里也有 A)~O) 的词库，只看标号会抓错
const matching = paper.sectionList.find((s) => s.type === 'reading' && extractParagraphLabels(s.passage).length >= 3)
console.log('  长篇阅读模块:', matching?.title)
console.log('  长篇阅读题数:', matching?.questions.length)
console.log('  第 36 题选项:', JSON.stringify(matching?.questions[0]?.options))

const out = process.argv[2] || '.build-tmp/seed-paper.json'

/* ---------------- 顺手造几条错题，方便看错题本页面 ---------------- */
if (process.env.SEED_ERRORS) {
  // 真题：真实真题 PDF 不附答案，另造一份带答案键的小卷来演示
  const { id: keyedId } = await mockApi.createPaper({
    title: '2023年6月六级真题（第2套）',
    level: 'CET6',
    yearMonth: '2023-06',
    source: '演示用（含答案键）',
    sections: [
      {
        type: 'reading',
        title: 'Part III Reading Comprehension · Passage One',
        passage: 'A short passage used for the error-book demo.',
        questions: [
          {
            orderNo: 46,
            stem: 'What can be inferred about the author\u2019s attitude towards remote work?',
            options: ['A) Supportive.', 'B) Indifferent.', 'C) Critical.', 'D) Unclear.'],
            answer: 'C',
            analysis: '第三段明确指出反对意见。',
          },
          {
            orderNo: 47,
            stem: 'Why does the author mention the 2020 survey?',
            options: ['A) To support a claim.', 'B) To criticize it.', 'C) To introduce a topic.', 'D) To give an example.'],
            answer: 'A',
            analysis: '举例支持论点。',
          },
        ],
      },
    ],
  })
  const keyed = await mockApi.getPaper(keyedId)
  // 46 题答错（正确 C，选 A）
  await mockApi.updateQuestion(keyed.sectionList[0].questions[0].id, { userAnswer: 'A', done: true })

  // 单词：点两次「不认识」
  const words = await mockApi.listWords('CET6')
  for (const w of words.slice(0, 2)) {
    await mockApi.submitWord({ wordId: w.id, result: 'UNKNOWN', mode: 'new' })
  }
  // 翻译：低分提交
  const trans = await mockApi.listTranslations('CET6')
  for (const t of trans.slice(0, 2)) {
    await mockApi.submitTranslation({ questionId: t.id, answer: 'unrelated wrong answer' })
  }
  const errs = await mockApi.listErrors()
  console.log(`  已造错题 ${errs.length} 条：`, errs.map((e) => e.sourceType).join('、'))
}

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(path.resolve(out), store.get('opencet.db.v1')!, 'utf8')
console.log('  已写入:', path.resolve(out))
