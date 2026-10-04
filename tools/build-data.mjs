/**
 * 数据构建脚本
 *   node tools/build-data.mjs
 *
 * 产出：
 *   1. shared/*.json                       —— 全项目唯一数据源
 *   2. frontend/public/data/*.json         —— 前端本地模式（无后端也能跑）读取
 *   3. backend/src/main/resources/db/data.sql —— MySQL 种子数据
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CET4_WORDS } from './data/words-cet4.mjs'
import { CET6_WORDS } from './data/words-cet6.mjs'
import { TRANSLATIONS } from './data/translations.mjs'
import { PAPERS } from './data/papers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

/* ---------------- 词库 ---------------- */
function buildWords(level, rows) {
  return rows.map(([word, phonetic, pos, meaning, exampleEn, exampleZh, source], i) => ({
    id: `${level.toLowerCase()}-${String(i + 1).padStart(3, '0')}`,
    level,
    word,
    phonetic,
    pos,
    meaning,
    exampleEn,
    exampleZh,
    source,
    freqRank: i + 1,
  }))
}

const wordsCet4 = buildWords('CET4', CET4_WORDS)
const wordsCet6 = buildWords('CET6', CET6_WORDS)
const words = [...wordsCet4, ...wordsCet6]

/* ---------------- 翻译题库 ---------------- */
const translations = TRANSLATIONS.map((t, i) => ({
  id: `tr-${String(i + 1).padStart(3, '0')}`,
  level: t.level,
  type: t.type,
  difficulty: t.difficulty,
  source: t.source,
  prompt: t.prompt,
  reference: t.reference,
  coreWords: t.coreWords,
  grammarPoints: t.grammarPoints,
  tips: t.tips,
}))

/* ---------------- 真题 ---------------- */
const papers = PAPERS.map((p, pi) => ({
  id: `paper-${String(pi + 1).padStart(3, '0')}`,
  title: p.title,
  level: p.level,
  yearMonth: p.yearMonth,
  source: p.source,
  sections: p.sections.map((s, si) => ({
    id: `paper-${String(pi + 1).padStart(3, '0')}-s${si + 1}`,
    type: s.type,
    title: s.title,
    passage: s.passage,
    orderNo: si + 1,
    questions: (s.questions || []).map((q, qi) => ({
      id: `paper-${String(pi + 1).padStart(3, '0')}-s${si + 1}-q${qi + 1}`,
      orderNo: q.no ?? qi + 1,
      stem: q.stem,
      options: q.options || [],
      answer: q.answer,
      analysis: q.analysis,
    })),
  })),
}))

/* ---------------- 输出 JSON ---------------- */
const sharedDir = join(ROOT, 'shared')
const publicDir = join(ROOT, 'frontend', 'public', 'data')
ensureDir(sharedDir)
ensureDir(publicDir)

const jsonFiles = {
  'words-cet4.json': wordsCet4,
  'words-cet6.json': wordsCet6,
  'words.json': words,
  'translations.json': translations,
  'papers.json': papers,
}
for (const [name, data] of Object.entries(jsonFiles)) {
  const text = JSON.stringify(data, null, 0)
  writeFileSync(join(sharedDir, name), text, 'utf8')
  writeFileSync(join(publicDir, name), text, 'utf8')
}

/* ---------------- 输出 MySQL 种子 SQL ---------------- */
const esc = (v) => (v == null ? '' : String(v).replace(/\\/g, '\\\\').replace(/'/g, "''"))

function batchInsert(table, columns, rows) {
  if (!rows.length) return `-- ${table}: 无数据\n`
  const size = 100
  const out = []
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    out.push(
      `INSERT INTO ${table} (${columns.map((c) => '`' + c + '`').join(', ')}) VALUES\n` +
        chunk.map((r) => `  (${r.map(esc).map((v) => `'${v}'`).join(', ')})`).join(',\n') +
        ';'
    )
  }
  return out.join('\n\n') + '\n'
}

const now = '2026-01-01 00:00:00'

const wordRows = words.map((w) => [
  w.id, w.level, w.word, w.phonetic, w.pos, w.meaning,
  w.exampleEn, w.exampleZh, w.source, w.freqRank, now, now,
])

const translationRows = translations.map((t) => [
  t.id, t.level, t.type, t.difficulty, t.source,
  t.prompt, t.reference, t.tips,
  JSON.stringify(t.coreWords), JSON.stringify(t.grammarPoints),
  now, now,
])

const paperRows = []
const sectionRows = []
const questionRows = []
let pid = 1
let sid = 1
let qid = 1
for (const p of papers) {
  paperRows.push([pid, 0, p.title, p.level, p.yearMonth, p.source, '', 0, 0, now, now])
  for (const s of p.sections) {
    sectionRows.push([sid, pid, s.type, s.title, s.passage, s.orderNo, now, now])
    for (const q of s.questions) {
      questionRows.push([
        qid, pid, sid, q.orderNo, q.stem, JSON.stringify(q.options),
        q.answer, q.analysis, '', 0, 0, now, now,
      ])
      qid++
    }
    sid++
  }
  pid++
}

const sql = `-- ============================================================
-- OpenCET 种子数据（由 tools/build-data.mjs 自动生成，请勿手工编辑）
-- 生成时间：${new Date().toISOString()}
-- 词库：CET-4 ${wordsCet4.length} 词 / CET-6 ${wordsCet6.length} 词
-- 翻译题：${translations.length} 题   真题示范卷：${papers.length} 套
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE paper_question;
TRUNCATE TABLE paper_section;
TRUNCATE TABLE paper;
TRUNCATE TABLE translation_question;
TRUNCATE TABLE word;

-- ---------------- 词汇库 ----------------
${batchInsert(
  'word',
  ['id', 'level', 'word', 'phonetic', 'pos', 'meaning', 'example_en', 'example_zh', 'source', 'freq_rank', 'create_time', 'update_time'],
  wordRows
)}
-- ---------------- 翻译题库 ----------------
${batchInsert(
  'translation_question',
  ['id', 'level', 'type', 'difficulty', 'source', 'prompt', 'reference', 'tips', 'core_words', 'grammar_points', 'create_time', 'update_time'],
  translationRows
)}
-- ---------------- 内置真题示范卷（user_id = 0 表示系统预设，用户可一键克隆）----------------
${batchInsert(
  'paper',
  ['id', 'user_id', 'title', 'level', 'year_month', 'source', 'raw_text', 'total_count', 'done_count', 'create_time', 'update_time'],
  paperRows
)}
${batchInsert(
  'paper_section',
  ['id', 'paper_id', 'section_type', 'title', 'passage', 'order_no', 'create_time', 'update_time'],
  sectionRows
)}
${batchInsert(
  'paper_question',
  ['id', 'paper_id', 'section_id', 'order_no', 'stem', 'options', 'answer', 'analysis', 'user_answer', 'done', 'favorite', 'create_time', 'update_time'],
  questionRows
)}

SET FOREIGN_KEY_CHECKS = 1;
`

const dbDir = join(ROOT, 'backend', 'src', 'main', 'resources', 'db')
ensureDir(dbDir)
writeFileSync(join(dbDir, 'data.sql'), sql, 'utf8')

console.log('✓ 数据构建完成')
console.log(`  词库      CET-4 ${wordsCet4.length} / CET-6 ${wordsCet6.length} = ${words.length} 词`)
console.log(`  翻译题    ${translations.length} 题`)
console.log(`  真题      ${papers.length} 套 / ${sectionRows.length} 个模块 / ${questionRows.length} 道题`)
console.log(`  输出      shared/、frontend/public/data/、backend/src/main/resources/db/data.sql`)
