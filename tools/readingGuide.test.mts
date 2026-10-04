/**
 * 阅读方法示范内容的完整性测试。
 *
 * 这类「教学内容」最容易出的问题是**和题库/原文对不上**：答案写错、把 A 段的证据挂到 B 段、
 * 高亮片段在原文里根本不存在。所以除了结构自检，还有两道交叉校验：
 *   1. sourceRef 指向内置示范卷的题 → 答案必须与题库一致
 *   2. 长篇阅读的证据片段 → 必须在**真实解析出来的原文**里存在（PDF 在才校验）
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/readingGuide.test.mts
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

const { GUIDES, METHOD_CARDS, splitMarks, splitBold } = await import('../frontend/src/utils/readingGuide')

/* ---------------- 1. 方法卡 ---------------- */
console.log('\n=== 1. 三种题型的方法卡 ===')
{
  ok('三种题型都有方法卡', METHOD_CARDS.length === 3, String(METHOD_CARDS.length))
  const kinds = METHOD_CARDS.map((m) => m.kind).sort().join(',')
  ok('覆盖 长篇/主旨/细节', kinds === 'detail,long,main', kinds)
  ok(
    '每张卡都有要点',
    METHOD_CARDS.every((m) => m.points.length >= 3),
    METHOD_CARDS.map((m) => m.points.length).join(','),
  )
  ok(
    '细节题那卡强调了「同义替换」',
    METHOD_CARDS.find((m) => m.kind === 'detail')!.points.some((p) => p.includes('同义替换')),
  )
  ok(
    '主旨题那卡强调了「每段第一句」',
    METHOD_CARDS.find((m) => m.kind === 'main')!.points.some((p) => p.includes('第一句')),
  )
}

/* ---------------- 2. 结构完整性 ---------------- */
console.log('\n=== 2. 每份示范的结构 ===')
{
  ok('示范数量为 4', GUIDES.length === 4, String(GUIDES.length))
  ok('id 不重复', new Set(GUIDES.map((d) => d.id)).size === GUIDES.length)
  ok(
    '每份都有题干与出处',
    GUIDES.every((d) => d.question.trim() && d.source.trim()),
  )
  ok(
    '每份至少 3 步',
    GUIDES.every((d) => d.steps.length >= 3),
    GUIDES.map((d) => `${d.id}:${d.steps.length}`).join(' '),
  )
  ok(
    '每步都有标题与说明',
    GUIDES.every((d) => d.steps.every((s) => s.title.trim() && s.hint.trim())),
  )
  ok(
    '每份最后一步给出答案',
    GUIDES.every((d) =>
      d.steps.some((s) => s.chips?.some((c) => c.kind === 'answer' && c.value === d.answer)),
    ),
  )
  ok(
    'answerText 解释了答案来源',
    GUIDES.every((d) => d.answerText.trim().length > 10),
  )
  ok('三道示范 + 一道练习', GUIDES.filter((d) => d.practice).length === 1)
  ok('三种题型都覆盖到', new Set(GUIDES.map((d) => d.kind)).size === 3)
}

/* ---------------- 3. 选项与答案自洽 ---------------- */
console.log('\n=== 3. 答案必须落在选项里 ===')
{
  const { optionLetter } = await import('../frontend/src/utils/paperDisplay')
  for (const d of GUIDES) {
    if (!d.options?.length) continue
    const letters = d.options.map((o) => optionLetter(o))
    ok(`${d.id}：答案 ${d.answer} 在选项内`, letters.includes(d.answer), letters.join(' '))
  }
  const detail = GUIDES.find((d) => d.kind === 'detail')!
  ok('细节题是四选一', detail.options?.length === 4)
  const long = GUIDES.find((d) => d.id === 'long-40')!
  ok('长篇阅读选项是段落字母 A~N', long.options?.join('') === 'ABCDEFGHIJKLMN', long.options?.join(''))
}

/* ---------------- 4. 高亮片段必须在正文里 ---------------- */
console.log('\n=== 4. 高亮片段必须是正文的子串 ===')
{
  let bad = 0
  for (const d of GUIDES) {
    for (const s of d.steps) {
      if (!s.marks?.length) continue
      if (!s.body) {
        bad++
        console.log(`    ${d.id} / ${s.title}：有 marks 但没有 body`)
        continue
      }
      for (const m of s.marks) {
        if (!s.body.includes(m)) {
          bad++
          console.log(`    ${d.id} / ${s.title}：正文里找不到「${m}」`)
        }
      }
    }
  }
  ok('所有 marks 都能在对应正文里找到', bad === 0, `${bad} 处不匹配`)
}

/* ---------------- 5. splitMarks 高亮切分 ---------------- */
console.log('\n=== 5. splitMarks 切分正确性 ===')
{
  const r1 = splitMarks('abcdef', [])
  ok('没有 marks 时整段返回', r1.length === 1 && r1[0].text === 'abcdef' && !r1[0].mark)

  const r2 = splitMarks('abcdef', ['cd'])
  ok('切出三段', r2.length === 3, JSON.stringify(r2))
  ok('中间段被标记', r2[1].mark && r2[1].text === 'cd')
  ok('拼接后与原文一致', r2.map((p) => p.text).join('') === 'abcdef')

  const r3 = splitMarks('aXbXc', ['X'])
  ok('同一片段出现多次都标记', r3.filter((p) => p.mark).length === 2, JSON.stringify(r3))
  ok('多次标记后拼接仍一致', r3.map((p) => p.text).join('') === 'aXbXc')

  const r4 = splitMarks('abcdef', ['bc', 'cd'])
  ok('重叠片段合并成一段', r4.filter((p) => p.mark).length === 1, JSON.stringify(r4))
  ok('合并后内容是并集', r4.find((p) => p.mark)!.text === 'bcd', JSON.stringify(r4))

  const r5 = splitMarks('abcdef', ['zz'])
  ok('找不到的 mark 不影响原文', r5.map((p) => p.text).join('') === 'abcdef' && r5.every((p) => !p.mark))

  const r6 = splitMarks('abc', ['abc'])
  ok('整段就是一个 mark', r6.length === 1 && r6[0].mark)

  const r7 = splitMarks('abcdef', ['ab', 'ef'])
  ok('首尾各标记一段', r7.filter((p) => p.mark).map((p) => p.text).join(',') === 'ab,ef', JSON.stringify(r7))
}

/* ---------------- 6. 行内加粗 **…** 的切分 ---------------- */
console.log('\n=== 6. splitBold 行内加粗 ===')
{
  const r1 = splitBold('没有加粗')
  ok('没有标记时整段返回', r1.length === 1 && !r1[0].bold)

  const r2 = splitBold('先看**这里**再看')
  ok('切出三段', r2.length === 3, JSON.stringify(r2))
  ok('中间段加粗', r2[1].bold && r2[1].text === '这里')
  ok('文本不丢字', r2.map((p) => p.text).join('') === '先看这里再看')
  ok('** 标记本身被吃掉', !r2.some((p) => p.text.includes('**')))

  const r3 = splitBold('**全段**')
  ok('整段加粗', r3.length === 1 && r3[0].bold && r3[0].text === '全段')

  const r4 = splitBold('a**b**c**d**e')
  ok('多处加粗都识别', r4.filter((p) => p.bold).map((p) => p.text).join(',') === 'b,d', JSON.stringify(r4))
  ok('多处加粗不丢字', r4.map((p) => p.text).join('') === 'abcde')

  const r5 = splitBold('未闭合的**标记')
  ok('未闭合时原样保留（不吞内容）', r5.map((p) => p.text).join('') === '未闭合的**标记', JSON.stringify(r5))
  ok('未闭合时不产生加粗段', r5.every((p) => !p.bold))

  const r6 = splitBold('空的****标记')
  ok('空加粗段被跳过', r6.every((p) => p.text !== ''), JSON.stringify(r6))

  // 内容里真的有 ** 才需要这个渲染；没闭合的不能把文案吃掉
  const allMarks = [...METHOD_CARDS.flatMap((m) => m.points), ...GUIDES.flatMap((d) => d.steps.map((s) => s.hint))]
  const odd = allMarks.filter((t) => ((t.match(/\*\*/g) ?? []).length % 2 === 1))
  ok('所有文案的 ** 都是成对的', odd.length === 0, odd.length ? odd[0] : '')
  const lost = allMarks.filter((t) => splitBold(t).map((p) => p.text).join('') !== t.replace(/\*\*/g, ''))
  ok('所有文案加粗后不丢字', lost.length === 0, lost.length ? lost[0] : '')
}

/* ---------------- 7. 交叉校验：答案必须与内置示范卷一致 ---------------- */
console.log('\n=== 7. 与内置示范卷交叉校验答案 ===')
{
  const papers = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'shared/papers.json'), 'utf8')) as Array<{
    title: string
    sections?: Array<{ questions?: Array<{ orderNo: number; answer?: string; stem?: string }> }>
  }>
  for (const d of GUIDES) {
    if (!d.sourceRef) continue
    const paper = papers.find((p) => p.title === d.sourceRef!.paperTitle)
    ok(`${d.id}：找得到试卷「${d.sourceRef.paperTitle}」`, !!paper)
    if (!paper) continue
    const q = (paper.sections ?? [])
      .flatMap((s) => s.questions ?? [])
      .find((x) => x.orderNo === d.sourceRef!.orderNo)
    ok(`${d.id}：找得到第 ${d.sourceRef.orderNo} 题`, !!q)
    if (!q) continue
    ok(
      `${d.id}：示范答案与题库一致（${d.answer}）`,
      (q.answer ?? '').trim().startsWith(d.answer),
      `题库=${q.answer} 示范=${d.answer}`,
    )
    ok(`${d.id}：题干与题库一致`, (q.stem ?? '').trim() === d.question.trim(), `题库=${q.stem}`)
  }
}

/* ---------------- 7. 交叉校验：长篇阅读证据必须在真实原文里 ---------------- */
console.log('\n=== 8. 长篇阅读证据与真实原文比对 ===')
{
  // 用环境变量指向本机那份真题 PDF。真题有版权，不进仓库，
  // 所以没设置时明确跳过（不影响其余 59 条断言）。
  //   OPEN_CET_CET6_PDF="D:/.../2025.06六级真题第1套.pdf" bash tools/verify-parser.sh
  const pdfPath = process.env.OPEN_CET_CET6_PDF ?? ''
  if (!pdfPath) {
    console.log('  ⊘ 跳过（未设置 OPEN_CET_CET6_PDF；这项用于交叉校验示范内容与真题原文）')
  } else if (!fs.existsSync(pdfPath)) {
    console.log('  ⊘ 跳过（找不到 ' + pdfPath + '）')
  } else {
    const pdfjs = await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs')
    const { itemsToLines } = await import('../frontend/src/utils/pdfLines')
    const { parsePaper, extractParagraphLabels } = await import('../frontend/src/utils/paperParser')
    pdfjs.GlobalWorkerOptions.workerSrc =
      'file://' +
      path
        .resolve(process.cwd(), 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
        .replace(/\\/g, '/')

    const data = new Uint8Array(fs.readFileSync(pdfPath))
    const doc = await pdfjs.getDocument({ data }).promise
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      pages.push(itemsToLines((await page.getTextContent()).items).join('\n'))
    }
    const parsed = parsePaper(pages.join('\n\n'), 'CET6')
    const sec = parsed.sections.find((s) => s.type === 'reading' && extractParagraphLabels(s.passage).length >= 3)
    ok('真实卷里切出长篇阅读模块', !!sec)
    const realPassage = (sec?.passage ?? '').replace(/\s+/g, ' ')

    for (const d of GUIDES.filter((x) => x.kind === 'long')) {
      // 区分两类 marks：摘自**题干**的关键词 vs 摘自**原文**的证据句。
      // 只有原文那部分才该在真实卷的正文里出现。
      const all = d.steps.flatMap((s) => s.marks ?? [])
      const fromQuestion = all.filter((m) => d.question.replace(/\s+/g, ' ').includes(m.replace(/\s+/g, ' ')))
      const fromPassage = all.filter((m) => !fromQuestion.includes(m))

      ok(
        `${d.id}：题干关键词确实出自题干（${fromQuestion.length} 处）`,
        fromQuestion.length >= 2,
        fromQuestion.join(' | '),
      )
      const missing = fromPassage.filter((m) => !realPassage.includes(m.replace(/\s+/g, ' ')))
      ok(
        `${d.id}：引用的 ${fromPassage.length} 处原文全部真实存在`,
        missing.length === 0,
        missing.join(' | '),
      )
    }

    // 题干也要在真实卷里
    const realStems = (sec?.questions ?? []).map((q) => q.stem.replace(/\s+/g, ' ').trim())
    for (const d of GUIDES.filter((x) => x.kind === 'long')) {
      ok(
        `${d.id}：题干来自真实卷`,
        realStems.includes(d.question.replace(/\s+/g, ' ').trim()),
        d.question.slice(0, 50),
      )
    }
  }
}

console.log(`\n${'='.repeat(52)}`)
console.log(`阅读示范内容测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
