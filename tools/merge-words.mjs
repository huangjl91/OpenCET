#!/usr/bin/env node
/**
 * 合并 CET4 / CET6 现有词库 + _expand/batch-*.tsv 新词，去重后
 * 生成一份“四六级通用必背词库”，并同时写出 words-cet4.mjs / words-cet6.mjs。
 *
 * 用法:
 *   node tools/merge-words.mjs            # 合并并生成（新词来源为 _expand/batch-*.tsv）
 *   node tools/merge-words.mjs --check    # 只统计不写文件
 *
 * 行格式（7 列）：优先按制表符切分；若切不出 7 列则回退按 `|` 切分。
 *   word | phonetic | pos | meaning | en | cn | source
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const EXPAND_DIR = path.join(DATA_DIR, '_expand')

const { CET4_WORDS } = await import('./data/words-cet4.mjs')
const { CET6_WORDS } = await import('./data/words-cet6.mjs')

const checkOnly = process.argv.includes('--check')

/** @type {Map<string, string[]>} 小写单词 -> 7 元组 */
const pool = new Map()
const stats = { cet4: 0, cet6: 0, dup: 0, batches: 0, badRows: [] }

function add(rows, tag) {
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 7) {
      stats.badRows.push(`${tag}:${JSON.stringify(r)?.slice(0, 60)}`)
      continue
    }
    const key = String(r[0]).trim().toLowerCase()
    if (!key) continue
    if (pool.has(key)) {
      stats.dup++
      continue
    }
    pool.set(key, r.map((x) => String(x).trim()))
    if (tag === 'cet4') stats.cet4++
    else if (tag === 'cet6') stats.cet6++
    else stats.batches++
  }
}

// 1) 现有词库（CET4 优先，保证已有 id 顺序尽量稳定）
add(CET4_WORDS, 'cet4')
add(CET6_WORDS, 'cet6')

// 2) _expand/batch-*.tsv 新词
const batchFiles = fs.existsSync(EXPAND_DIR)
  ? fs.readdirSync(EXPAND_DIR).filter((f) => /^batch-\d+\.tsv$/i.test(f)).sort()
  : []
for (const f of batchFiles) {
  const text = fs.readFileSync(path.join(EXPAND_DIR, f), 'utf8')
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const byTab = l.split('\t')
      if (byTab.length === 7) return byTab
      return l.split('|')
    })
  add(rows, f)
}

const list = [...pool.values()]

// 字母分布
const dist = {}
for (const r of list) {
  const c = r[0][0].toLowerCase()
  dist[c] = (dist[c] || 0) + 1
}

console.log('=== 合并统计 ===')
console.log('现有 CET4 采用 :', stats.cet4)
console.log('现有 CET6 采用 :', stats.cet6)
console.log('新批次 TSV 采用:', stats.batches, `(文件: ${batchFiles.length} 个)`)
console.log('去重丢弃(重复) :', stats.dup)
console.log('格式错误行     :', stats.badRows.length, stats.badRows.slice(0, 5))
console.log('合计词条       :', list.length)
console.log('字母分布       :', JSON.stringify(dist))
const target = Number(process.env.TARGET || 1500)
console.log(`距离目标 ${target}   :`, Math.max(0, target - list.length))

if (checkOnly) process.exit(0)

// 3) 按字母序输出（id 由 build-data.mjs 按下标生成，此处排序使 id 稳定可读）
list.sort((a, b) => a[0].localeCompare(b[0], 'en'))

function render(varName, header) {
  const body = list
    .map(
      (r) =>
        '  [' +
        r.map((v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(', ') +
        '],'
    )
    .join('\n')
  return `${header}\nexport const ${varName} = [\n${body}\n]\n`
}

fs.writeFileSync(
  path.join(DATA_DIR, 'words-cet4.mjs'),
  render('CET4_WORDS', '// CET-4 必背词汇库（与 CET-6 共用同一套四六级通用核心词）\n// 格式: [单词, 音标, 词性, 中文释义, 真题风格例句(英), 例句翻译(中), 例句来源]'),
  'utf8'
)
fs.writeFileSync(
  path.join(DATA_DIR, 'words-cet6.mjs'),
  render('CET6_WORDS', '// CET-6 必背词汇库（与 CET-4 共用同一套四六级通用核心词）\n// 格式: [单词, 音标, 词性, 中文释义, 真题风格例句(英), 例句翻译(中), 例句来源]'),
  'utf8'
)
console.log('\n已写出 words-cet4.mjs / words-cet6.mjs，各', list.length, '词')
