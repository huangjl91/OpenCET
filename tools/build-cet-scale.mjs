/**
 * 把 shared/cet-scale.json 生成为前端可直接 import 的 TS 模块。
 *
 * 为什么不像题库那样运行时 fetch：这张表是**不变的静态数据**（官方换算表），
 * 首页一打开就要用，异步加载只会多一次 loading 状态。生成成模块还能被 tree-shake。
 *
 * 用法：node tools/build-cet-scale.mjs
 *      （改了 shared/cet-scale.json 后要重跑，测试会校验两边一致）
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'shared/cet-scale.json')
const OUT = path.join(ROOT, 'frontend/src/utils/cetScaleData.ts')

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'))

const tables = data.tables
  .map((t) => {
    const rows = t.rows.map((r) => `      { raw: ${r.raw}, score: ${r.score} },`).join('\n')
    return `  {
    id: ${JSON.stringify(t.id)},
    name: ${JSON.stringify(t.name)},
    max: ${t.max},
    scaleMax: ${t.scaleMax},
    sections: ${JSON.stringify(t.sections)},
    rows: [
${rows}
    ],
  },`
  })
  .join('\n')

const out = `/**
 * CET 710 分换算表数据 —— **自动生成，不要手改**。
 *
 * 生成脚本：node tools/build-cet-scale.mjs
 * 源数据：shared/cet-scale.json（整理自用户的《7_35分换算表.docx》）
 */

export interface ScaleRowData {
  raw: number
  score: number
}

export interface ScaleTableData {
  id: string
  name: string
  max: number
  scaleMax: number
  sections: string[]
  rows: ScaleRowData[]
}

export const CET_SCALE_TITLE = ${JSON.stringify(data.title)}

export const CET_SCALE_NOTE = ${JSON.stringify(data.note)}

export const CET_SCALE_SOURCE = ${JSON.stringify(data.source)}

export const CET_SCALE_TABLES: ScaleTableData[] = [
${tables}
]
`

fs.writeFileSync(OUT, out, 'utf8')
console.log(`已写入 ${path.relative(ROOT, OUT)}`)
for (const t of tables?.length ? data.tables : []) {
  console.log(`  ${t.name}：${t.rows.length} 档，满分 ${t.scaleMax}，适用 ${t.sections.join(' / ')}`)
}
const full = data.tables.reduce((n, t) => n + t.scaleMax * (t.sections.length > 1 ? 1 : 1), 0)
console.log(`  两张表满分 ${data.tables.map((t) => t.scaleMax).join(' + ')}`)
