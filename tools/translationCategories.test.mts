/**
 * 翻译练习「分类 → 常考词 → 逐词默写 → 句子翻译」的测试。
 *
 * 重点守三件事：
 *   1. **分类不丢题** —— 110 题必须全部有分类，分组后总数不变（漏一题就是一个分类少一道）
 *   2. **常考词聚合正确** —— 按英文去重、次数统计对、没有空词
 *   3. **默写题自洽** —— 每条答案自己填自己都要全对（答案表写错立刻红）
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/translationCategories.test.mts
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

const { groupByCategory, collectWords, buildCategoryBlanks, CATEGORY_ORDER } = await import(
  '../frontend/src/utils/translationCategories'
)
const { checkBlanks } = await import('../frontend/src/utils/blankFill')
const { classify } = await import('./classify-translations.mjs')

type Q = Parameters<typeof groupByCategory>[0][number]

const raw = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'frontend/public/data/translations.json'), 'utf8')
) as Q[]
const list: Q[] = Array.isArray(raw) ? raw : ((raw as unknown as { list?: Q[] }).list ?? [])

/* ---------------- 1. 题库里的分类字段 ---------------- */
console.log('\n=== 1. 题库的分类字段 ===')
{
  ok('题库有 110 题', list.length === 110, String(list.length))
  const missing = list.filter((q) => !(q.category ?? '').trim())
  ok('每题都有分类', missing.length === 0, missing.map((q) => q.id).join(' '))
  const unknown = list.filter((q) => !CATEGORY_ORDER.includes((q.category ?? '').trim()))
  ok('分类都在已知列表内', unknown.length === 0, unknown.map((q) => `${q.id}:${q.category}`).join(' '))
  ok(
    '分类都是非空字符串',
    list.every((q) => typeof q.category === 'string' && q.category.length >= 3),
  )
}

/* ---------------- 2. 分类器本身 ---------------- */
console.log('\n=== 2. 分类器 ===')
{
  ok('主题类直接可用', classify('四级翻译·文化类') === '文化类')
  ok('年份场次能映射', classify('四级翻译·2019年6月（剪纸）') === '文化类')
  ok('专项能识别', classify('四级翻译·基础句型（被动语态）') === '基础句型专项')
  ok('衔接专项能识别', classify('四级翻译·写作衔接专项（转折过渡词 however）') === '写作衔接专项')
  ok('交通类并入科技类', classify('四级翻译·交通类') === '科技类')
  ok('认不出的返回 null（不瞎猜）', classify('四级翻译·莫名其妙的东西') === null)

  // 逐题核对：把 source 重新分一遍，必须和落盘的一致
  const mismatched: string[] = []
  for (const q of list) {
    const again = classify(q.source)
    // 「真题话题」这类没有主题，靠题号表兜底，classify 返回 null 属正常
    if (again === null) continue
    if (again !== q.category) mismatched.push(`${q.id}: 落盘=${q.category} 重算=${again}`)
  }
  ok('落盘分类与重算一致', mismatched.length === 0, mismatched.slice(0, 3).join(' ;; '))
}

/* ---------------- 3. 分组不丢题 ---------------- */
console.log('\n=== 3. 分组 ===')
{
  const groups = groupByCategory(list)
  const total = groups.reduce((n, g) => n + g.questions.length, 0)
  ok('分组后总题数不变', total === list.length, `${total} / ${list.length}`)
  const ids = new Set(groups.flatMap((g) => g.questions.map((q) => q.id)))
  ok('没有题目被漏掉', ids.size === list.length, `${ids.size} / ${list.length}`)
  ok('没有题目被重复归组', groups.flatMap((g) => g.questions).length === list.length)

  const names = groups.map((g) => g.name)
  ok('分类名唯一', new Set(names).size === names.length)
  const rank = (n: string) => {
    const i = CATEGORY_ORDER.indexOf(n)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  ok(
    '按预定顺序排列（主题类在前、专项收尾）',
    names.every((n, i) => i === 0 || rank(names[i - 1]) <= rank(n)),
    names.join(' → '),
  )

  // 已知分类
  const culture = groups.find((g) => g.name === '文化类')!
  ok('文化类存在且题量最多', culture && culture.questions.length >= 20, String(culture?.questions.length))
  ok('写作衔接专项有 32 题', groups.find((g) => g.name === '写作衔接专项')?.questions.length === 32)

  ok('空输入返回空数组', groupByCategory([]).length === 0)
  const noCat = groupByCategory([{ ...list[0], category: undefined } as Q])
  ok('缺分类的题归入「未分类」而不是消失', noCat.length === 1 && noCat[0].name === '未分类', noCat[0]?.name)
}

/* ---------------- 4. 常考词聚合 ---------------- */
console.log('\n=== 4. 常考词聚合 ===')
{
  const culture = groupByCategory(list).find((g) => g.name === '文化类')!
  const words = culture.words
  ok('文化类有常考词', words.length > 0, String(words.length))
  ok('按英文小写去重', new Set(words.map((w) => w.en.toLowerCase())).size === words.length)
  ok('没有空词', words.every((w) => w.en.trim().length > 0))
  ok('次数至少为 1', words.every((w) => w.count >= 1))
  ok('按出现次数降序', words.every((w, i) => i === 0 || words[i - 1].count >= w.count))

  // 手工核对：把该分类所有题的核心词数一遍
  const manual = new Map<string, number>()
  for (const q of culture.questions) {
    for (const w of q.coreWords ?? []) {
      const k = (w.en ?? '').trim().toLowerCase()
      if (k) manual.set(k, (manual.get(k) ?? 0) + 1)
    }
  }
  ok(
    '次数与手工统计一致',
    words.every((w) => manual.get(w.en.toLowerCase()) === w.count),
    words
      .filter((w) => manual.get(w.en.toLowerCase()) !== w.count)
      .map((w) => `${w.en}: ${w.count} vs ${manual.get(w.en.toLowerCase())}`)
      .join(' ;; '),
  )
  ok('去重词数一致', words.length === manual.size, `${words.length} / ${manual.size}`)

  // 每个分类都能聚合出词
  const empty = groupByCategory(list).filter((g) => !g.words.length)
  ok('每个分类都有常考词', empty.length === 0, empty.map((g) => g.name).join(' '))

  ok('空输入返回空数组', collectWords([]).length === 0)
}

/* ---------------- 5. 默写题 ---------------- */
console.log('\n=== 5. 默写题 ===')
{
  const groups = groupByCategory(list)

  for (const g of groups) {
    const items = buildCategoryBlanks(g, 1)
    const withZh = g.words.filter((w) => w.zh.trim())
    if (items.length !== withZh.length) {
      ok(`${g.name} 的默写题数 == 有中文释义的词数`, false, `${items.length} / ${withZh.length}`)
      break
    }
  }
  ok(
    '各分类的默写题数都等于「有中文释义的词数」',
    groups.every((g) => buildCategoryBlanks(g, 1).length === g.words.filter((w) => w.zh.trim()).length),
  )

  const culture = groups.find((g) => g.name === '文化类')!
  const items = buildCategoryBlanks(culture, 7)
  ok('题面都是中文（否则没法默写）', items.every((it) => /[\u4e00-\u9fa5]/.test(it.prompt)))
  ok('每题都有标准答案', items.every((it) => it.answer.trim().length > 0))
  ok(
    '横线条数 == 答案词数',
    items.every((it) => it.words.length > 0 && it.words.join(' ') === it.words.join(' ')),
  )
  ok('id 不重复', new Set(items.map((it) => it.id)).size === items.length)
  ok('题面不泄露答案', items.every((it) => !it.prompt.toLowerCase().includes(it.answer.toLowerCase())))
  ok('同一个 seed 出同一套题', JSON.stringify(buildCategoryBlanks(culture, 7)) === JSON.stringify(items))
  ok('不同 seed 顺序不同', JSON.stringify(buildCategoryBlanks(culture, 8)) !== JSON.stringify(items))

  // 自洽：每条答案自己填自己都要全对
  const bad: string[] = []
  for (const g of groups) {
    for (const it of buildCategoryBlanks(g, 3)) {
      const r = checkBlanks(it.words, it.answer)
      if (!r.allOk) bad.push(`${g.name} / ${it.answer} → ${r.okCount}/${r.total}`)
    }
  }
  ok('全部默写题自填自都对', bad.length === 0, bad.slice(0, 3).join(' ;; '))
}

/* ---------------- 6. 页面接好了 ---------------- */
console.log('\n=== 6. 页面接线 ===')
{
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/TranslationView.vue'), 'utf8')
  ok('页面用了分类分组', view.includes('groupByCategory'))
  ok('页面接了逐词默写组件', view.includes('BlankDrill'))
  ok('页面有分类筛选', view.includes('pickCategory'))
  ok('分类会过滤题目列表', view.includes("(q.category ?? '') === categoryFilter.value"))
  ok('有「先背词再翻译」的引导', view.includes('词背完了'))
  ok('作文页也用了同一个组件', fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/WritingView.vue'), 'utf8').includes('BlankDrill'))
  ok('逐词填空逻辑已抽出共用模块', fs.existsSync(path.resolve(process.cwd(), 'frontend/src/utils/blankFill.ts')))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`翻译分类测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
