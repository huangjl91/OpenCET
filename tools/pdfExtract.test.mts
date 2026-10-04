/**
 * PDF 抽取 + 自动切分的端到端回归测试。
 *
 * 为什么必须有这一层：切分规则再好，只要 PDF 抽取把一整页拼成一行，
 * 模块标题和题号就会全部失配——旧实现 `items.map(it => it.str).join(' ')`
 * 在真实的四级整卷 PDF 上只切出 1 个模块 5 道题，而正确答案是 8 个模块 15 道题。
 * 规则层的单测（paperParser.test.mts）用的是「已经带好换行的文本」，
 * 永远发现不了这个问题，所以这里必须走一遍真实 PDF。
 *
 * fixture：tools/fixtures/cet4-sample.pdf（由 LibreOffice 从 DOCX 导出，
 * 含 Part I~IV、听力/阅读 Section A/B/C、选词填空 10 空、中文翻译段落）。
 *
 * 用法（工作目录必须是项目根）：
 *   bash tools/verify-parser.sh
 */
import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from '../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
import { itemsToLines } from '../frontend/src/utils/pdfLines'
import { parsePaper, countQuestions } from '../frontend/src/utils/paperParser'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++
    console.log('  ✓', name)
  } else {
    fail++
    console.log('  ✗', name, extra)
  }
}

const root = process.cwd()
// Node 里没有 Worker，pdfjs 会退化成 fake worker，需要显式告诉它 worker 文件在哪
pdfjs.GlobalWorkerOptions.workerSrc =
  'file://' + path.resolve(root, 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').replace(/\\/g, '/')

const pdfPath = path.resolve(root, 'tools/fixtures/cet4-sample.pdf')
const data = new Uint8Array(fs.readFileSync(pdfPath))
const doc = await pdfjs.getDocument({ data }).promise

const pages: string[] = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  pages.push(itemsToLines(content.items).join('\n'))
}
const text = pages.join('\n\n')
const lines = text.split('\n').filter((l) => l.trim())

console.log('════ PDF 抽取层 ════')
check('PDF 能打开并有多页', doc.numPages >= 2, `pages=${doc.numPages}`)
check('还原出足够多的行（旧实现只有「页数」行）', lines.length > 40, `lines=${lines.length}`)
check('模块标题独占一行', lines.includes('Part I Writing') && lines.includes('Part II Listening Comprehension'))
check(
  '长句没有被折断成「每页一行」',
  lines.every((l) => l.length < 200),
  `最长行 ${Math.max(...lines.map((l) => l.length))} 字`,
)

console.log('\n════ 端到端切分结果 ════')
const paper = parsePaper(text, 'CET4')
const types = paper.sections.map((s) => s.type)
console.log(`  模块 ${paper.sections.length} 个 / 共 ${countQuestions(paper.sections)} 题`)
for (const s of paper.sections) {
  console.log(`    [${s.type}] ${s.title}  q=${s.questions.length}`)
}

check('不再是「整卷」兜底模块', !paper.sections.some((s) => s.title.includes('整卷')), paper.sections.map((s) => s.title).join(' | '))
check('五个模块类型齐全', ['writing', 'listening', 'cloze', 'reading', 'translation'].every((t) => types.includes(t)), types.join(','))
check('听力切出 3 个 Section、共 4 题', paper.sections.filter((s) => s.type === 'listening').reduce((n, s) => n + s.questions.length, 0) === 4)

const cloze = paper.sections.find((s) => s.type === 'cloze')
check('选词填空 5 题', cloze?.questions.length === 5, `got ${cloze?.questions.length}`)
check('选词填空词库 10 个选项', cloze?.questions[0]?.options.length === 10, `got ${cloze?.questions[0]?.options.length}`)
check(
  '选词填空题干是含空格的整句（对齐内置示范卷）',
  cloze?.questions[0]?.stem === 'Reading books has a __26__ effect on children.',
  JSON.stringify(cloze?.questions[0]?.stem),
)

const reading = paper.sections.filter((s) => s.type === 'reading')
check('阅读切出 2 个模块、共 4 题', reading.length === 2 && reading.reduce((n, s) => n + s.questions.length, 0) === 4, `mods=${reading.length}`)
check('仔细阅读 Passage One 独立成模块', reading.some((s) => s.title.includes('Passage One')))

const tr = paper.sections.find((s) => s.type === 'translation')
check('翻译 passage 是 Directions', (tr?.passage ?? '').startsWith('Directions:'), JSON.stringify(tr?.passage))
check(
  '翻译题干是中文段落（对齐内置示范卷）',
  (tr?.questions[0]?.stem ?? '').includes('剪纸') && !(tr?.questions[0]?.stem ?? '').includes('Directions'),
  JSON.stringify((tr?.questions[0]?.stem ?? '').slice(0, 40)),
)

const writing = paper.sections.find((s) => s.type === 'writing')
check('写作 passage 非空', (writing?.passage ?? '').length > 40)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
