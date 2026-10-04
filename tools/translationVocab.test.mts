/**
 * 《翻译常用词汇》词表的测试。
 *
 * 这份数据是从用户的 Word 笔记整理来的，手工成分高，所以重点是**数据自洽**：
 *   1. 每条都有中文和英文（缺一个就没法出默写题）
 *   2. **英文里不能有拼写错** —— 拿站内拼写检查器过一遍，
 *      等于让程序替我复核这 100 条有没有打错字（原笔记里确实有 Start form / all year around 这类错）
 *   3. 每条都能生成合法的默写题（横线条数对、自填自对）
 *   4. 界面接好了：分组出现、纯词表分类不显示空题库
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/translationVocab.test.mts
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

const { vocabCategoryGroup, buildCategoryBlanks, VOCAB_CATEGORY, CATEGORY_ORDER, groupByCategory } = await import(
  '../frontend/src/utils/translationCategories'
)
const { checkBlanks, answerWords } = await import('../frontend/src/utils/blankFill')
const { checkSpelling } = await import('../frontend/src/utils/languageCheck')

const raw = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'frontend/public/data/translation-vocab.json'), 'utf8')
) as { group: string; zh: string; en: string; note?: string }[]

/* ---------------- 1. 数据完整性 ---------------- */
console.log('\n=== 1. 词表数据 ===')
{
  ok('词条数合理（≥ 80）', raw.length >= 80, String(raw.length))
  ok('每条都有中文与英文', raw.every((w) => (w.zh ?? '').trim() && (w.en ?? '').trim()))
  ok('每条都有分组', raw.every((w) => (w.group ?? '').trim()))

  const en = raw.map((w) => w.en.trim().toLowerCase())
  ok('英文不重复', new Set(en).size === en.length, String(en.length - new Set(en).size) + ' 条重复')

  const groups = [...new Set(raw.map((w) => w.group))]
  ok('分组数合理（≥ 6）', groups.length >= 6, groups.join(' / '))
  ok('每个分组都有词', groups.every((g) => raw.some((w) => w.group === g)))

  ok(
    '中文不含半角标点混排（看着乱）',
    raw.every((w) => !/[\u4e00-\u9fa5][,;:!?]/.test(w.zh)),
  )
  ok(
    '用法提醒都不算空（要么没有，要么写清楚）',
    raw.filter((w) => w.note).every((w) => (w.note ?? '').trim().length >= 2),
  )
  ok('多数词条带用法提醒', raw.filter((w) => (w.note ?? '').trim()).length >= raw.length * 0.8)
}

/* ---------------- 2. 英文不能有拼写错（让程序复核我整理的内容） ---------------- */
console.log('\n=== 2. 英文拼写（复核手工整理的内容）===')
{
  const bad: string[] = []
  for (const w of raw) {
    const s = w.en.trim()
    // 检查器只认句子式的输入；短语补个句号，首字母大写避免误判
    const probe = /[.!?]$/.test(s) ? s : s + '.'
    const issues = checkSpelling(probe)
    if (issues.length) bad.push(`${w.en}  ← ${issues.map((i) => i.message).join('；')}`)
  }
  ok('100 条英文没有拼写错', bad.length === 0, bad.slice(0, 5).join('\n      '))
}

/* ---------------- 3. 每条都能出默写题 ---------------- */
console.log('\n=== 3. 默写题 ===')
{
  const group = vocabCategoryGroup(raw)
  ok('分组名是「翻译常用词汇」', group.name === VOCAB_CATEGORY)
  ok('词条数与数据一致', group.words.length === raw.length, `${group.words.length} / ${raw.length}`)
  ok('纯词表分类没有句子题', group.questions.length === 0)
  ok('分组排在分类列表最前', CATEGORY_ORDER[0] === VOCAB_CATEGORY)
  ok('用法提醒透传过来了', group.words.filter((w) => w.note).length === raw.filter((w) => w.note).length)

  const items = buildCategoryBlanks(group, 7)
  ok('每一条都能出题', items.length === group.words.length, `${items.length} / ${group.words.length}`)
  ok('题面是中文', items.every((it) => /[\u4e00-\u9fa5]/.test(it.prompt)))
  ok('横线条数 > 0', items.every((it) => it.words.length > 0))
  ok(
    '横线条数 == 答案词数',
    items.every((it) => it.words.length === answerWords(it.answer).length),
  )
  ok('题面不泄露答案', items.every((it) => !it.prompt.toLowerCase().includes(it.answer.toLowerCase())))
  ok('id 不重复', new Set(items.map((it) => it.id)).size === items.length)
  ok('同一 seed 出同一套题', JSON.stringify(buildCategoryBlanks(group, 7)) === JSON.stringify(items))
  ok('不同 seed 顺序不同', JSON.stringify(buildCategoryBlanks(group, 8)) !== JSON.stringify(items))

  const bad: string[] = []
  for (const it of items) {
    const r = checkBlanks(it.words, it.answer)
    if (!r.allOk) bad.push(`${it.answer} → ${r.okCount}/${r.total}`)
  }
  ok('每条自填自都对', bad.length === 0, bad.slice(0, 4).join(' ;; '))
  ok('用法提醒进了默写卡的 note', items.some((it) => it.note && it.note.length > 4))
}

/* ---------------- 4. 边界 ---------------- */
console.log('\n=== 4. 边界 ===')
{
  ok('空数组不炸', vocabCategoryGroup([]).words.length === 0)
  ok('缺字段的词被跳过', vocabCategoryGroup([{ group: 'g', zh: '', en: 'x' }]).words.length === 0)
  ok('按英文去重', vocabCategoryGroup([
    { group: 'g', zh: 'A', en: 'same' },
    { group: 'g', zh: 'B', en: 'Same' },
  ]).words.length === 1)
  ok('首尾空格被去掉', vocabCategoryGroup([{ group: 'g', zh: '  中文  ', en: '  spaced  ' }]).words[0].en === 'spaced')
  ok('undefined 不炸', vocabCategoryGroup(undefined as never).words.length === 0)
}

/* ---------------- 5. 与题库分组共存 ---------------- */
console.log('\n=== 5. 和题库分类共存 ===')
{
  const questions = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'frontend/public/data/translations.json'), 'utf8')
  )
  const fromQuestions = groupByCategory(questions)
  const vocab = vocabCategoryGroup(raw)
  const all = [...fromQuestions, vocab]
  ok('题库分类照旧', fromQuestions.length >= 10, String(fromQuestions.length))
  ok('词表分组能合并进去', all.some((g) => g.name === VOCAB_CATEGORY))
  ok('总题数不受影响（词表类没有题）', all.reduce((n, g) => n + g.questions.length, 0) === questions.length)
  ok('名字不冲突（题库里没有同名分类）', !fromQuestions.some((g) => g.name === VOCAB_CATEGORY))
}

/* ---------------- 6. 界面接线 ---------------- */
console.log('\n=== 6. 界面接线 ===')
{
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/TranslationView.vue'), 'utf8')
  ok('页面加载词表', view.includes('translationApi.vocab()'))
  ok('词表分组并进分类列表', view.includes('vocabCategoryGroup(vocabWords.value)'))
  ok('纯词表分类有判断', view.includes('isVocabOnly'))
  ok('纯词表分类不显示空题库', view.includes('v-if="!isVocabOnly"'))
  ok('有「只有词条」的说明', view.includes('只有词条，没有配套句子题'))
  ok('词表能显示用法提醒', view.includes('w.note ||'))

  const mock = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/api/mock.ts'), 'utf8')
  ok('mock 层有加载函数', mock.includes('loadTranslationVocab'))
  ok('mock 层读的是词表文件', mock.includes('/data/translation-vocab.json'))
  ok('数据文件已同步到 public', fs.existsSync(path.resolve(process.cwd(), 'frontend/public/data/translation-vocab.json')))
  ok('源数据在 shared 留档', fs.existsSync(path.resolve(process.cwd(), 'shared/translation-vocab.json')))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`翻译常用词汇测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
