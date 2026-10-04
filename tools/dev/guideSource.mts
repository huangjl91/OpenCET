/**
 * 从真题 PDF 里导出长篇阅读的段落与题干全文（撰写阅读示范内容时用）。
 *
 * 用法：
 *   OPEN_CET_CET6_PDF="<真题.pdf>" npx tsx tools/dev/guideSource.mts [段落字母...] [题号...]
 *   默认导出 A D 段与 39/40 题
 *
 * 真题有版权、不进仓库，所以要自己指定 PDF 路径。
 */
import fs from 'node:fs'
import path from 'node:path'
import * as pdfjs from '../../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
import { itemsToLines } from '../../frontend/src/utils/pdfLines'
import { parsePaper, extractParagraphLabels } from '../../frontend/src/utils/paperParser'

const root = process.cwd()
pdfjs.GlobalWorkerOptions.workerSrc =
  'file://' + path.resolve(root, 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').replace(/\\/g, '/')

const pdfPath = process.env.OPEN_CET_CET6_PDF ?? ''
if (!pdfPath || !fs.existsSync(pdfPath)) {
  console.error('用法：OPEN_CET_CET6_PDF="<六级真题.pdf>" npx tsx tools/dev/guideSource.mts')
  process.exit(1)
}
const data = new Uint8Array(fs.readFileSync(pdfPath))
const doc = await pdfjs.getDocument({ data }).promise
const pages: string[] = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  pages.push(itemsToLines((await page.getTextContent()).items).join('\n'))
}
const paper = parsePaper(pages.join('\n\n'), 'CET6')
const sec = paper.sections.find((s) => s.type === 'reading' && extractParagraphLabels(s.passage).length >= 3)
if (!sec) throw new Error('没找到长篇阅读模块')

const wantLabels = (process.argv[2] || 'A,D').split(',')
const wantNos = (process.argv[3] || '39,40').split(',').map(Number)

console.log('# 长篇阅读段落全文\n')
for (const para of sec.passage.split('\n\n')) {
  const m = /^\s*([A-O])\s*[).、）:：]\s*/.exec(para)
  if (m && wantLabels.includes(m[1])) {
    console.log(`## ${m[1]})\n${para.replace(/^\s*[A-O]\s*[).、）:：]\s*/, '')}\n`)
  }
}

console.log('\n# 题干全文\n')
for (const q of sec.questions) {
  if (wantNos.includes(q.orderNo)) {
    console.log(`## ${q.orderNo}. ${q.stem}\n`)
  }
}
