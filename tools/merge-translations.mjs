#!/usr/bin/env node
/**
 * 合并翻译题库：现有 translations.mjs + tools/data/_expand/tr-batch-*.mjs
 * → 按 prompt 去重 → 覆盖写出 translations.mjs
 *
 * 用法:
 *   node tools/merge-translations.mjs           # 合并并写文件
 *   node tools/merge-translations.mjs --check   # 只统计不写
 *
 * 新增批次文件格式（ESM）:
 *   export const TRANSLATIONS_EXTRA_01 = [ {...}, {...} ]
 *
 * 单题字段:
 *   level(CET4|CET6), type(sentence|paragraph), difficulty(1-3), source,
 *   prompt(中文原文), reference(参考译文), coreWords[{en,zh}],
 *   grammarPoints[string], tips
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Windows 下动态 import 绝对路径必须是 file:// URL，否则报 ERR_UNSUPPORTED_ESM_URL_SCHEME
const toModuleUrl = (p) => pathToFileURL(p).href
const DATA_DIR = path.join(__dirname, 'data')
const EXPAND_DIR = path.join(DATA_DIR, '_expand')

const { TRANSLATIONS } = await import('./data/translations.mjs')
const checkOnly = process.argv.includes('--check')

const REQUIRED = ['level', 'type', 'difficulty', 'source', 'prompt', 'reference', 'coreWords', 'grammarPoints', 'tips']

/** @type {Map<string, any>} prompt -> 题 */
const pool = new Map()
const stats = { base: 0, batches: 0, dup: 0, invalid: [] }

function add(list, tag) {
  for (const t of list) {
    const missing = REQUIRED.filter((k) => t[k] === undefined || t[k] === null)
    if (missing.length) {
      stats.invalid.push(`${tag}: 缺字段 ${missing.join(',')} @ ${(t.prompt || '').slice(0, 20)}`)
      continue
    }
    const key = `${t.level}|${String(t.prompt).trim()}`
    if (pool.has(key)) {
      stats.dup++
      continue
    }
    pool.set(key, t)
    if (tag === 'base') stats.base++
    else stats.batches++
  }
}

add(TRANSLATIONS, 'base')

const batchFiles = fs.existsSync(EXPAND_DIR)
  ? fs.readdirSync(EXPAND_DIR).filter((f) => /^tr-batch-\d+\.mjs$/i.test(f)).sort()
  : []
for (const f of batchFiles) {
  const mod = await import(toModuleUrl(path.join(EXPAND_DIR, f)))
  const key = Object.keys(mod).find((k) => /^TRANSLATIONS_EXTRA/.test(k))
  if (!key) {
    stats.invalid.push(`${f}: 未导出 TRANSLATIONS_EXTRA_*`)
    continue
  }
  add(mod[key], f)
}

const list = [...pool.values()]

// 统计
const dist = {}
for (const t of list) {
  const k = `${t.level} / ${t.type} / 难度${t.difficulty}`
  dist[k] = (dist[k] || 0) + 1
}

console.log('=== 翻译题库合并统计 ===')
console.log('现有题目     :', stats.base)
console.log('新批次       :', stats.batches, `(文件: ${batchFiles.length} 个)`)
console.log('去重丢弃     :', stats.dup)
console.log('格式错误     :', stats.invalid.length, stats.invalid.slice(0, 5))
console.log('合计         :', list.length)
console.log('分布         :', JSON.stringify(dist, null, 0))

if (checkOnly) process.exit(0)

const body = list
  .map((t) => {
    const cw = t.coreWords.map((c) => `      { en: ${jstr(c.en)}, zh: ${jstr(c.zh)} },`).join('\n')
    const gp = t.grammarPoints.map((g) => `      ${jstr(g)},`).join('\n')
    return `  {
    level: ${jstr(t.level)}, type: ${jstr(t.type)}, difficulty: ${t.difficulty}, source: ${jstr(t.source)},
    prompt: ${jstr(t.prompt)},
    reference: ${jstr(t.reference)},
    coreWords: [
${cw}
    ],
    grammarPoints: [
${gp}
    ],
    tips: ${jstr(t.tips)},
  },`
  })
  .join('\n')

const out = `// 四六级翻译题库（汉译英）
// 段落题主题取自历年四六级翻译真题（详见 source 字段）；参考译文为本系统编写，供评分比照使用。
// type: sentence=单句翻译 / paragraph=段落翻译
// difficulty: 1=基础 2=进阶 3=挑战
export const TRANSLATIONS = [
${body}
]
`
fs.writeFileSync(path.join(DATA_DIR, 'translations.mjs'), out, 'utf8')
console.log('\n已写出 translations.mjs，共', list.length, '题')

function jstr(v) {
  return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
}
