/**
 * 双端评分一致性对照 —— 用例生成 + 前端侧结果输出
 *
 * 前端（frontend/src/utils/grade.ts）与后端（TranslationGrader.java）是同一套评分规则的两份实现，
 * 任何一侧改了规则都必须跑通这个对照，否则「本地模式」与「连后端」会给出不同分数。
 *
 * 不要单独运行本文件，用 tools/grader-sync.sh 一键跑完整对照（含 Java 侧与 diff）。
 */
import { writeFileSync } from 'node:fs'
import { grade } from '../frontend/src/utils/grade'
import type { CoreWord } from '../frontend/src/types'

interface Q {
  prompt: string
  reference: string
  coreWords?: CoreWord[]
}

const all = await import('./data/translations.mjs')
const questions = all.TRANSLATIONS as Q[]

const core: CoreWord[] = [
  { en: 'traditional folk art', zh: '传统民间艺术' },
  { en: 'understand', zh: '理解' },
  { en: 'important', zh: '重要的' },
]

const ref =
  'Paper cutting is a traditional folk art in China. People can understand its important role in culture.'

interface Case {
  id: string
  answer: string
  reference: string
  cores: CoreWord[]
}

const cases: Case[] = []

// 1) 全库题目：用参考译文自己作答，两端都必须 100 分
questions.forEach((q, i) => {
  cases.push({ id: 'lib-' + i, answer: q.reference, reference: q.reference, cores: q.coreWords ?? [] })
})

// 2) 规则边界用例（与 tools/grade.test.mts 同源）
const scenarios: Array<[string, string, string, CoreWord[]]> = [
  ['sc-normal', 'Paper cutting is a traditional folk art in China. People understand its important role in culture.', ref, core],
  ['sc-scramble', 'Paper cutting is a folk art which is traditional in China. People understand its important role in culture.', ref, core],
  ['sc-spell', 'Paper cutting is a traditional folk art in China. People can understnad its important role in culture.', ref, core],
  ['sc-padded', 'Paper cutting is a traditional folk art in China. Paper cutting is very very traditional. People understand its important important role in culture and it is important.', ref, core],
  ['sc-tiny', 'Paper cutting is art.', ref, core],
  ['sc-sloppy', 'paper cutting is a traditional folk art in china people understand its important role in culture', ref, core],
  ['sc-empty', '', ref, core],
  ['sc-irregular', 'Paper cutting is a traditional folk art in China. People understood its important role in culture.', ref, core],
  ['sc-article', 'Papermaking and printing have exerted a profound influence on world civilization.', 'Papermaking and printing have exerted an influence on world civilization.', [{ en: 'exert an influence on', zh: '对……产生影响' }]],
  ['sc-possessive', 'Lucy followed his teacher’s advice and read widely.', 'Lucy followed my advice and read widely.', [{ en: 'follow one’s advice', zh: '听从建议' }]],
  ['sc-be-prefix', 'Set against the blue sky, the pagoda looks magnificent.', 'Be set against the blue sky, the pagoda looks magnificent.', [{ en: 'be set against', zh: '以……为背景' }]],
  ['sc-dup-comma', 'Over the past decade and more, more than 150 countries have joined.', 'Over the past decade and more, more than 150 countries have joined.', []],
  ['sc-e-ending', 'Reading can improve our knowledge, and it also improves our writing ability.', 'Reading can improve our knowledge and improve our writing ability.', [{ en: 'improve', zh: '提高' }]],
  ['sc-ied', 'The rules were unified last year.', 'The rules were unified last year.', [{ en: 'unify', zh: '统一' }]],
]

for (const [id, answer, reference, cores] of scenarios) {
  cases.push({ id, answer, reference, cores })
}

const tsv = (s: string) => s.replace(/[\t\r\n]+/g, ' ')
const caseLines = cases.map((c) =>
  [c.id, tsv(c.answer), tsv(c.reference), c.cores.map((x) => tsv(x.en)).join('||')].join('\t')
)
writeFileSync('.runtime/sync-cases.tsv', caseLines.join('\n') + '\n', 'utf-8')

const out: string[] = []
for (const c of cases) {
  const g = grade(c.answer, c.reference, c.cores)
  const kind = c.cores
    .map((cw) => {
      if (g.hit.includes(cw.en)) return 'H'
      if (g.reorder.includes(cw.en)) return 'R'
      if (g.near.some((n) => n.expected === cw.en)) return 'N'
      if (g.miss.includes(cw.en)) return 'M'
      return '?'
    })
    .join('')
  out.push(
    [
      c.id,
      g.score,
      g.breakdown.coreScore,
      g.breakdown.lengthScore,
      g.breakdown.languageScore,
      g.breakdown.coreRate.toFixed(3),
      g.breakdown.lengthFit.toFixed(3),
      g.breakdown.redundancy.toFixed(3),
      kind || '-',
    ].join('\t')
  )
}
writeFileSync('.runtime/sync-ts.tsv', out.join('\n') + '\n', 'utf-8')
console.log('前端侧用例 ' + cases.length + ' 条 → .runtime/sync-ts.tsv')
