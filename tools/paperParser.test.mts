import { parsePaper, countQuestions, extractParagraphLabels } from '../frontend/src/utils/paperParser'
import { itemsToLines } from '../frontend/src/utils/pdfLines'
import {
  answerKey,
  isChoice,
  isLetterOptions,
  optionLetter,
  optionStyle,
  stemText,
} from '../frontend/src/utils/paperDisplay'

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

/* ---------------- 用例 1：标准结构（含选词填空 / 区间导语） ---------------- */
const sample = `2023年6月大学英语四级考试真题（第1套）

Part I Writing
(30 minutes)
Directions: For this part, you are allowed 30 minutes to write an essay titled "The Importance of Reading". You should write at least 120 words but no more than 180 words.

Part II Listening Comprehension
Section A
Directions: In this section, you will hear three news reports.
1. A) She travelled around the province. B) She taught English in a village school. C) She worked on a local farm. D) She did research on local culture.
2. A) To investigate a local accident. B) To visit her friends. C) To attend a meeting. D) To take a vacation.
Section B
3. A) He lost his wallet. B) He missed the bus. C) He was late for work. D) He forgot the key.

Part III Reading Comprehension
Section A
Directions: In this section, there is a passage with several blanks. You are required to select one word for each blank from a list of choices given in a word bank.
The __26__ of online learning has changed education. Many students __27__ it helpful. A good __28__ can improve outcomes. Teachers should __29__ new tools. Schools need more __30__.
A) adoption B) find C) method D) adopt E) support F) believe G) system H) consider I) resource J) prefer

Section B
Directions: In this section, you are to match headings.
41. The first paragraph introduces the topic.
42. The second paragraph gives examples.

Section C
Passage One
Questions 46 to 50 are based on the following passage.
46. A) It is growing fast. B) It is declining. C) It remains stable. D) It is unknown.
47. A) Cost. B) Time. C) Quality. D) Location.

Part IV Translation
(30 minutes)
Directions: For this part, you are to translate a passage from Chinese into English.
剪纸是中国最受欢迎的传统民间艺术之一。`

console.log('用例 1：标准结构')
const r1 = parsePaper(sample, 'CET4')
const types1 = r1.sections.map((s) => s.type)
check('识别 5 个模块', types1.includes('writing') && types1.includes('listening') && types1.includes('cloze') && types1.includes('reading') && types1.includes('translation'))
check('总题数 > 0', countQuestions(r1.sections) > 0)
const cloze1 = r1.sections.find((s) => s.type === 'cloze')
check('选词填空按空号生成 5 题', (cloze1?.questions.length ?? 0) === 5, `got ${cloze1?.questions.length}`)
check('选词填空词库 10 个选项', (cloze1?.questions[0]?.options.length ?? 0) === 10)
const q46 = r1.sections.flatMap((s) => s.questions).find((q) => q.orderNo === 46)
check('区间导语 "Questions 46 to 50" 未生成幽灵题', !!q46 && q46.options.length === 4 && q46.options[0].includes('growing fast'), `q46=${JSON.stringify(q46)}`)
check('标题识别为真题名', r1.title.includes('大学英语四级'), r1.title)
check('等级识别为 CET4', r1.level === 'CET4')
check('年份识别 2023-06', r1.yearMonth === '2023-06', r1.yearMonth)

/* ---------------- 用例 2：PDF 导出文本（含页眉页脚噪声） ---------------- */
const pdfLike = `第 1 页
2022年12月大学英语六级考试真题
— 12 —
Part I Writing
Directions: For this part, you should write an essay.
第 2 页
Part II Listening Comprehension
1. A) He arrived early. B) He was late. C) He canceled. D) He forgot.
2. A) By bus. B) By train. C) By car. D) On foot.
3. A) Rainy. B) Sunny. C) Windy. D) Cloudy.
第 3 页
Part III Reading Comprehension
Section A
36. A) one. B) two. C) three. D) four.
37. A) red. B) blue. C) green. D) yellow.`

console.log('\n用例 2：PDF 导出文本（页眉页脚噪声）')
const r2 = parsePaper(pdfLike, 'CET6')
const types2 = r2.sections.map((s) => s.type)
check('剥离页码后仍识别出写作/听力/阅读', types2.includes('writing') && types2.includes('listening') && types2.includes('reading'))
const listenQ = r2.sections.find((s) => s.type === 'listening')?.questions.length ?? 0
check('听力切出 3 题', listenQ === 3, `got ${listenQ}`)
const anyJunk = r2.rawText.includes('第 1 页') || r2.rawText.includes('— 12 —')
check('页眉页脚被剥离', !anyJunk)
check('等级识别为 CET6', r2.level === 'CET6')

/* ---------------- 用例 3：无任何模块标题（纯题号列表）兜底切分 ---------------- */
const flat = `四级练习题

1. A) apple B) banana C) cat D) dog
2. A) one B) two C) three D) four
3. A) red B) blue C) green D) yellow
4. A) big B) small C) tall D) short`

console.log('\n用例 3：无标题纯题号列表（兜底切分）')
const r3 = parsePaper(flat, 'CET4')
check('无标题时也能切出题目（兜底）', countQuestions(r3.sections) === 4, `got ${countQuestions(r3.sections)}`)
check('兜底模块存在', r3.sections.length >= 1)

/* ---------------- 用例 4：卷末答案键回填 ---------------- */
const withKey = `六级真题
Part I Writing
Directions: write an essay.
Part II Listening Comprehension
1. A) a B) b C) c D) d
2. A) a B) b C) c D) d
3. A) a B) b C) c D) d
Part III Reading Comprehension
36. A) x B) y C) z D) w
37. A) x B) y C) z D) w
38. A) x B) y C) z D) w

Keys:
1. B
2. C
3. A
36. D
37. B
38. C`

console.log('\n用例 4：卷末答案键回填')
const r4 = parsePaper(withKey, 'CET6')
// 只看真实客观题：写作/翻译是整块合成的「大题」（synthetic），不占卷面题号
const findAns = (no: number) => {
  for (const s of r4.sections)
    for (const q of s.questions) if (!q.synthetic && q.orderNo === no) return q.answer
  return ''
}
check('答案键 1 → B 回填', findAns(1) === 'B', `got ${findAns(1)}`)
check('答案键 3 → A 回填', findAns(3) === 'A', `got ${findAns(3)}`)
check('答案键 37 → B 回填', findAns(37) === 'B', `got ${findAns(37)}`)
const writing4 = r4.sections.find((s) => s.type === 'writing')?.questions[0]
check('写作合成题未被答案键「1. B」污染', writing4?.answer === '', `got ${writing4?.answer}`)
check('写作合成题被标记为 synthetic', writing4?.synthetic === true)

/* ---------------- 用例 5：真实 PDF 罗马数字标题 Ⅰ Ⅱ Ⅲ Ⅳ + 完整选词填空(10空) ---------------- */
const romanFull = `2022年12月大学英语六级考试真题（第1套）

Part Ⅰ Writing
(30 minutes)
Directions: For this part, you are allowed 30 minutes to write an essay.

Part Ⅱ Listening Comprehension
Section A
1. A) He was touched. B) He went hiking. C) He stayed home. D) He read a book.
2. A) By car. B) By train. C) By bus. D) On foot.
Section B
3. A) Rainy. B) Sunny. C) Windy. D) Cloudy.

Part Ⅲ Reading Comprehension
Section A
Directions: In this section, there is a passage with several blanks.
The __26__ of online study is important. Many students __27__ it useful. A good __28__ can help. Teachers should __29__ new tools. Schools need more __30__. We must __31__ the method. He will __32__ the plan. They __33__ the result. She __34__ a lot. This is a __35__ chance.
A) adoption B) find C) method D) adopt E) support F) believe G) system H) consider I) resource J) prefer

Section C
Passage One
Questions 46 to 50 are based on the following passage.
46. A) It grows fast. B) It declines. C) It is stable. D) It is unknown.
47. A) Cost. B) Time. C) Quality. D) Location.

Part Ⅳ Translation
(30 minutes)
Directions: For this part, you are to translate.
丝绸之路是中国古代的一项重要成就。`

console.log('\n用例 5：罗马数字标题 Ⅰ Ⅱ Ⅲ Ⅳ（真实 PDF 常见）')
const r5 = parsePaper(romanFull, 'CET6')
const types5 = r5.sections.map((s) => s.type)
check('罗马数字卷识别 5 个模块类型', ['writing', 'listening', 'reading', 'translation'].every((t) => types5.includes(t)), types5.join(','))
check('阅读模块(part III)未被错判成听力', !r5.sections.some((s) => s.title.includes('Passage One') && s.type === 'listening'))
const cloze5 = r5.sections.find((s) => s.type === 'cloze')
check('选词填空按 10 个空号生成 10 题', (cloze5?.questions.length ?? 0) === 10, `got ${cloze5?.questions.length}`)
check('选词填空词库 10 个选项', (cloze5?.questions[0]?.options.length ?? 0) === 10)
check('听力共切出 3 题（Section A 2 + Section B 1）', r5.sections.filter((s) => s.type === 'listening').reduce((n, s) => n + s.questions.length, 0) === 3)

/* ---------------- 用例 6：真实整卷结构（Part 级壳 + Section 子模块 + 分行选项 + 15 词词库） ----------------
 * 这是从真实 PDF 抽出文本里最常见的形态，也是旧实现翻车的形态：
 *   - `Part II Listening Comprehension` 后面紧跟 `Section A`，Part 级模块只剩一行 `(25 minutes)`
 *     → 旧实现会给它合成一道题干为“(25 minutes)”的幽灵题，并占用题号 2
 *   - 词库 15 个选项各自占一行 → 旧实现要求「一行内 ≥4 个选项」，完全抓不到 → 选词填空 0 选项
 */
const realPaper = `2023年6月大学英语四级考试真题（第1套）

Part I Writing
(30 minutes)
Directions: For this part, you are allowed 30 minutes to write an essay.

Part II Listening Comprehension
(25 minutes)
Section A
Directions: In this section, you will hear three news reports.
Questions 1 to 2 are based on the news report you have just heard.
1.
A) She was seriously injured.
B) She survived the accident.
C) She lost her way in the forest.
D) She was rescued by a passer-by.
2.
A) The cause of the accident.
B) The rescue work.
C) The traffic rules.
D) The weather condition.
Section B
Directions: In this section, you will hear two long conversations.
Questions 8 to 9 are based on the conversation you have just heard.
8.
A) He is a teacher.
B) He is a doctor.
C) He is a driver.
D) He is a farmer.
Section C
Directions: In this section, you will hear three passages.
Questions 16 to 17 are based on the passage you have just heard.
16.
A) It is cheap.
B) It is slow.
C) It is safe.
D) It is noisy.

Part III Reading Comprehension
(40 minutes)
Section A
Directions: In this section, there is a passage with ten blanks.
The idea of __26__ has become popular. Many people __27__ that it saves time. A good __28__ can help. Teachers should __29__ new methods. Schools need more __30__.
A) accessible
B) advocate
C) approach
D) assume
E) conventional
F) demonstrate
G) efficiency
H) funding
I) genuine
J) illustrate
K) numerous
L) obviously
M) pursue
N) reject
O) virtually

Section B
Directions: In this section, you are going to read a passage with ten statements attached to it.
36. The author suggests that online courses are cheaper than traditional ones.
37. Some employers doubt the value of online degrees.
38. Students in rural areas benefit most from online education.

Section C
Directions: There are 2 passages in this section. Each passage is followed by some questions.
Passage One
Questions 46 to 47 are based on the following passage.
Many researchers have studied the effect of sleep on memory.
46.
A) It improves memory.
B) It weakens memory.
C) It has no effect.
D) It is unknown.
47.
A) Sleep duration.
B) Sleep quality.
C) Diet.
D) Exercise.
Passage Two
Questions 51 to 52 are based on the following passage.
Urbanization has changed the way people live.
51.
A) It is harmful.
B) It is beneficial.
C) It is neutral.
D) It is temporary.
52.
A) Housing.
B) Transport.
C) Education.
D) Health.

Part IV Translation
(30 minutes)
Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.
近年来，中国的高速铁路发展迅速，运营里程居世界首位。`

console.log('\n用例 6：真实整卷结构（Part 级壳 + Section 子模块）')
const r6 = parsePaper(realPaper, 'CET4')
const all6 = r6.sections.flatMap((s) => s.questions)
check('只切出 9 个模块（不含 Part 级空壳）', r6.sections.length === 9, `got ${r6.sections.length}: ${r6.sections.map((s) => s.title).join(' | ')}`)
check(
  '不存在题干为「(25 minutes)」的幽灵题',
  !all6.some((q) => /^[（(]?\s*\d+\s*minutes?\s*[)）]?$/i.test(q.stem.trim())),
  JSON.stringify(all6.filter((q) => q.stem.length < 15).map((q) => q.stem)),
)
const listen6 = r6.sections.filter((s) => s.type === 'listening')
check('听力切成 3 个 Section 模块', listen6.length === 3, `got ${listen6.length}`)
check('听力共 4 题（1,2,8,16）', listen6.reduce((n, s) => n + s.questions.length, 0) === 4)
check('听力选项分行也解析出 4 个选项', (listen6[0]?.questions[0]?.options.length ?? 0) === 4)
check(
  '听力 Section 标题带上了 Part 上下文',
  (listen6[0]?.title ?? '').includes('Listening'),
  listen6[0]?.title,
)
const cloze6 = r6.sections.find((s) => s.type === 'cloze')
check('选词填空 5 空 5 题', cloze6?.questions.length === 5, `got ${cloze6?.questions.length}`)
check('词库「每行一个选项」抓出 15 个选项', (cloze6?.questions[0]?.options.length ?? 0) === 15, `got ${cloze6?.questions[0]?.options.length}`)
check('词库首尾正确', cloze6?.questions[0]?.options[0] === 'A) accessible' && cloze6?.questions[0]?.options[14] === 'O) virtually')
const read6 = r6.sections.filter((s) => s.type === 'reading')
check(
  '阅读切成 3 个模块、共 7 题',
  read6.length === 3 && read6.reduce((n, s) => n + s.questions.length, 0) === 7,
  `mods=${read6.length} q=${read6.reduce((n, s) => n + s.questions.length, 0)} :: ` +
    r6.sections.map((s) => `${s.type}「${s.title}」#${s.questions.length}`).join(' | '),
)
const q36b = read6.flatMap((s) => s.questions).find((q) => q.orderNo === 36)
check('长篇阅读题不挂选项', (q36b?.options.length ?? -1) === 0, `got ${q36b?.options.length}`)
check('写作题号取 Part I → 1', r6.sections.find((s) => s.type === 'writing')?.questions[0]?.orderNo === 1)
check('翻译题号取 Part IV → 4', r6.sections.find((s) => s.type === 'translation')?.questions[0]?.orderNo === 4)

/* ---------------- 用例 7：词库三种排布都要抓得到 ---------------- */
function clozePaper(bank: string): string {
  return `六级真题
Part III Reading Comprehension
Section A
Directions: In this section, there is a passage with ten blanks.
The idea of __26__ is popular. Many __27__ it useful. A good __28__ helps. Teachers __29__ tools. Schools need __30__.
${bank}`
}
const bankOnePerLine = ['accessible', 'advocate', 'approach', 'assume', 'conventional', 'demonstrate', 'efficiency', 'funding', 'genuine', 'illustrate']
  .map((w, i) => `${String.fromCharCode(65 + i)}) ${w}`)
  .join('\n')
const bankTwoPerLine = ['accessible', 'advocate', 'approach', 'assume', 'conventional', 'demonstrate', 'efficiency', 'funding', 'genuine', 'illustrate']
  .map((w, i) => `${String.fromCharCode(65 + i)}) ${w}`)
  .reduce<string[]>((acc, cur, i) => {
    if (i % 2 === 0) acc.push(cur)
    else acc[acc.length - 1] += '   ' + cur
    return acc
  }, [])
  .join('\n')
const bankSingleLine = ['accessible', 'advocate', 'approach', 'assume', 'conventional', 'demonstrate', 'efficiency', 'funding', 'genuine', 'illustrate']
  .map((w, i) => `${String.fromCharCode(65 + i)}) ${w}`)
  .join('  ')

console.log('\n用例 7：词库三种排布')
for (const [name, bank] of [
  ['每行一个选项', bankOnePerLine],
  ['每行两个选项', bankTwoPerLine],
  ['十个挤在一行', bankSingleLine],
] as const) {
  const r7 = parsePaper(clozePaper(bank), 'CET6')
  const c7 = r7.sections.find((s) => s.type === 'cloze')
  check(`词库「${name}」抓出 10 个选项`, (c7?.questions[0]?.options.length ?? 0) === 10, `got ${c7?.questions[0]?.options.length}`)
}

/* ---------------- 用例 8：长篇阅读的段落标号不能被误判成词库 ----------------
 * 段落标号形如 `A) The idea of online learning…`，与词库 `A) accessible` 只差「标号后还有没有正文」。
 */
const paraPaper = `六级真题
Part III Reading Comprehension
Section B
Directions: In this section, you are going to read a passage with ten statements attached to it.
A) The idea of online learning has become increasingly popular among students.
B) Many universities now offer courses that can be taken entirely online.
C) Some employers still doubt the value of an online degree.
D) Students in rural areas may benefit most from online education.
E) Critics argue that online courses lack real interaction.
F) Supporters say the flexibility outweighs the drawbacks.
G) Tuition for online programs is usually lower than on campus.
H) Completion rates remain a concern for many institutions.
I) Employers increasingly accept online credentials.
J) Regulators are still working out quality standards.
36. The author suggests that online courses are cheaper.
37. Some employers doubt the value of online degrees.
38. Students in rural areas benefit most.`

console.log('\n用例 8：段落标号不误判成词库')
const r8 = parsePaper(paraPaper, 'CET6')
const read8 = r8.sections.filter((s) => s.type === 'reading').flatMap((s) => s.questions)
check('段落标号未被当成词库', read8.every((q) => q.options.length === 0), JSON.stringify(read8.map((q) => q.options.length)))
check('长篇阅读仍切出 3 题', read8.length === 3, `got ${read8.length}`)

/* ---------------- 用例 9：PDF 文本行还原（pdfjs 碎片 → 带换行的行） ----------------
 * 旧实现把一整页碎片 join(' ') 成一行，导致模块标题和题号全部失配。
 * 这里用合成的 pdfjs 碎片验证换行与空格补全是否正确。
 */
console.log('\n用例 9：PDF 文本碎片还原成行')
const items = [
  { str: 'Part I ', transform: [10, 0, 0, 10, 50, 700], width: 40, height: 10 },
  { str: 'Writing', transform: [10, 0, 0, 10, 95, 700], width: 40, height: 10 },
  { str: '1.', transform: [10, 0, 0, 10, 50, 680], width: 12, height: 10 },
  { str: 'A) ', transform: [10, 0, 0, 10, 70, 680], width: 16, height: 10 },
  { str: 'alpha', transform: [10, 0, 0, 10, 88, 680], width: 25, height: 10 },
  { str: 'next line', transform: [10, 0, 0, 10, 50, 660], width: 45, height: 10, hasEOL: true },
  { str: 'tail', transform: [10, 0, 0, 10, 50, 640], width: 20, height: 10 },
]
const reconstructed = itemsToLines(items)
check('碎片按纵坐标还原成 4 行、无空行', reconstructed.length === 4, JSON.stringify(reconstructed))
check('同一行按间隙补空格、不重复补', reconstructed[0] === 'Part I Writing', JSON.stringify(reconstructed[0]))
check('行内选项保持可切分', reconstructed[1] === '1. A) alpha', JSON.stringify(reconstructed[1]))
check('hasEOL 与纵坐标跳变各成一行', reconstructed[2] === 'next line' && reconstructed[3] === 'tail', JSON.stringify(reconstructed.slice(2)))
check('空输入不炸', itemsToLines([]).length === 0)

/* ---------------- 用例 10：PDF 折行产生的半句话不能被当成模块标题 ----------------
 * `reading aloud to children…` 这种折行行首命中旧的 `^\s*reading\b` 规则，
 * 会把选词填空的正文腰斩成好几个「阅读理解」模块。
 */
const wrappedProse = `2024年6月大学英语四级考试真题（第1套）

Part III Reading Comprehension
Section A
Directions: In this section, there is a passage with ten blanks.
The idea of __26__ has become popular. Many people __27__ that it saves time.
reading aloud to children before bed helps them __28__ better language habits
A) accessible
B) advocate
C) approach
D) assume
E) conventional
F) demonstrate
G) efficiency
H) funding
I) genuine
J) illustrate`

console.log('\n用例 10：折行正文不误判成模块标题')
const r10 = parsePaper(wrappedProse, 'CET4')
check('折行正文没有撑出多余模块', r10.sections.length === 1, `got ${r10.sections.length}: ${r10.sections.map((s) => s.type + '/' + s.title).join(' | ')}`)
check('整块仍识别为选词填空', r10.sections[0]?.type === 'cloze', r10.sections[0]?.type)
check('空号仍切出 3 题', r10.sections[0]?.questions.length === 3, `got ${r10.sections[0]?.questions.length}`)
check('折行正文留在 passage 里', (r10.sections[0]?.passage ?? '').includes('reading aloud to children'))

/* ---------------- 用例 11：Directions 折行的空模块要被丢掉 ---------------- */
const wrappedDirections = `2024年6月大学英语四级考试真题

Part III Reading Comprehension
Section B
Directions: In this section, you are going to read a passage with ten statements attached to it.
36. Online courses cost less than traditional ones.
Section C
Directions: There are 2 passages in this section. Each passage is followed by some
questions. In this section you will read two passages carefully.
Passage One
Questions 46 to 47 are based on the following passage.
46.
A) It improves memory.
B) It weakens memory.
C) It has no effect.
D) It is unknown.`

console.log('\n用例 11：Directions 折行的空模块被丢弃')
const r11 = parsePaper(wrappedDirections, 'CET4')
check(
  'Section C 空壳模块被丢弃',
  !r11.sections.some((s) => s.title.includes('Section C')),
  r11.sections.map((s) => s.title).join(' | '),
)
check('Passage One 正常保留', r11.sections.some((s) => s.title.includes('Passage One')))
check('Section B 的 36 题不受影响', r11.sections.flatMap((s) => s.questions).some((q) => q.orderNo === 36))

/* ---------------- 用例 12：写作 / 翻译对齐内置示范卷的 passage 与题干 ---------------- */
const essayPaper = `2024年6月大学英语四级考试真题

Part I Writing
(30 minutes)
Directions: For this part, you are allowed 30 minutes to write an essay on the use of short videos.

Part IV Translation
(30 minutes)
Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.
剪纸是中国传统的民间艺术，有着两千多年的历史。`

console.log('\n用例 12：写作 / 翻译的 passage 与题干分离')
const r12 = parsePaper(essayPaper, 'CET4')
const w12 = r12.sections.find((s) => s.type === 'writing')
const t12 = r12.sections.find((s) => s.type === 'translation')
check('写作 passage 非空且含 Directions', (w12?.passage ?? '').includes('Directions'), JSON.stringify((w12?.passage ?? '').slice(0, 40)))
check('写作题干不含时间标注', !/minutes\)/.test(w12?.questions[0]?.stem ?? ''), JSON.stringify((w12?.questions[0]?.stem ?? '').slice(0, 40)))
check('翻译 passage 只放 Directions', (t12?.passage ?? '').includes('Directions') && !(t12?.passage ?? '').includes('剪纸'), JSON.stringify(t12?.passage))
check('翻译题干只放中文段落', (t12?.questions[0]?.stem ?? '').includes('剪纸') && !(t12?.questions[0]?.stem ?? '').includes('Directions'), JSON.stringify((t12?.questions[0]?.stem ?? '').slice(0, 40)))

/* ---------------- 用例 13：选项标记变体（（A） / 全角 Ａ）） ----------------
 * 中文真题 PDF 里选项常写成 `（A）xxx` 或全角 `Ａ）xxx`，旧正则只认半角 `A)`，
 * 于是一整行选项被当成题干正文塞进 stem —— 练习页里就只剩一大段文字、没有可点的选项。
 */
const optionStyles = `2024年6月大学英语四级考试真题

Part II Listening Comprehension
Section A
1. What did the man do? （A）He stayed at home. （B）He went hiking. （C）He read a book. （D）He watched TV.
2. Ａ）By car. Ｂ）By train. Ｃ）By bus. Ｄ）On foot.`

console.log('\n用例 13：选项标记变体')
const r13 = parsePaper(optionStyles, 'CET4')
const qs13 = r13.sections.flatMap((s) => s.questions)
check('全角括号选项切出 4 个', qs13[0]?.options.length === 4, `got ${qs13[0]?.options.length} ${JSON.stringify(qs13[0]?.options)}`)
check('题干不含选项正文', qs13[0]?.stem === 'What did the man do?', JSON.stringify(qs13[0]?.stem))
check('选项字母归一化为半角大写', qs13[0]?.options[0] === 'A) He stayed at home.', JSON.stringify(qs13[0]?.options[0]))
check('全角字母选项也切出 4 个', qs13[1]?.options.length === 4, `got ${qs13[1]?.options.length} ${JSON.stringify(qs13[1]?.options)}`)

/* ---------------- 用例 14：显示层判定（练习页渲染用） ---------------- */
console.log('\n用例 14：显示层判定')
check('有选项即算选择题（不需要答案）', isChoice({ options: ['A) x', 'B) y'], answer: '' }))
check('没有选项不算选择题', !isChoice({ options: [], answer: 'A' }))
check('空答案键不误判', answerKey({ options: [], answer: '' }) === '')
check('全角答案键能取字母', answerKey({ options: [], answer: '（Ｂ）' }) === 'B', answerKey({ options: [], answer: '（Ｂ）' }))
check('带选项前缀的答案键能取字母', answerKey({ options: [], answer: 'B) because...' }) === 'B')
check('选项字母兼容全角', optionLetter('Ｃ）By bus.') === 'C', optionLetter('Ｃ）By bus.'))
check('无答案键时只标出所选', optionStyle({ options: [], answer: '', userAnswer: 'B' }, 'B) y').includes('brand'))
check('无答案键时不把未选项标红', optionStyle({ options: [], answer: '', userAnswer: 'B' }, 'A) x') === '')
check('有答案键时答对显示绿色', optionStyle({ options: [], answer: 'A', userAnswer: 'A' }, 'A) x').includes('--ok'))
check('听力空题干给出明确说明', stemText({ stem: '' }, 'listening').includes('听力'))
check('非空题干原样返回', stemText({ stem: 'Hello' }, 'reading') === 'Hello')

// 段落匹配：答案可能到 E~O，字母判定必须跟上
check('段落匹配答案 M 能取出来', answerKey({ options: [], answer: 'M' }) === 'M', answerKey({ options: [], answer: 'M' }))
check('段落匹配答案（N）能取出来', answerKey({ options: [], answer: '（Ｎ）' }) === 'N')
check('段落匹配选项字母 M', optionLetter('M') === 'M')
check('段落匹配选项字母 O', optionLetter('O）') === 'O')
// 收紧后的正则：正文句子不能被读成选项字母
check('「Books are useful」不读成选项 B', optionLetter('Books are useful') === 'Books are useful', optionLetter('Books are useful'))
check('「I think so」不读成选项 I', optionLetter('I think so') === 'I think so', optionLetter('I think so'))
check('「It is harmful.」不读成选项 I', optionLetter('It is harmful.') === 'It is harmful.')
// 字母选项识别
check('A~N 全是单字母 → 字母选项', isLetterOptions(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']))
check('带右括号的字母也算', isLetterOptions(['A)', 'B)', 'C)']))
check('普通文字选项不算', !isLetterOptions(['A) It is useful.', 'B) It is useless.']))
check('单个选项不算', !isLetterOptions(['A']))
check('含 P 的超出范围不算（段落标号只到 O）', !isLetterOptions(['A', 'B', 'P']))

/* ---------------- 用例 15：真实试卷 PDF 的四个版式坑 ----------------
 * 全部来自一份真实六级真题 PDF（2025.06 第1套）实测：
 *   (a) 选项是双栏网格，文字流里顺序是 A,C,B,D
 *   (b) 文字层把 `Part III` 抽成 `Part ID`
 *   (c) 空号的下划线丢了，只剩裸数字
 *   (d) 每页重复同一行页眉页脚（只有页号不同）
 */
console.log('\n用例 15：真实 PDF 版式坑')

// (a) 双栏选项网格
const twoColPaper = `2025年6月大学英语六级考试真题
Part II Listening Comprehension
Section A
1. A) alpha.                C) gamma.
   B) beta.                 D) delta.`
const r15a = parsePaper(twoColPaper, 'CET6')
const q15a = r15a.sections.flatMap((s) => s.questions)[0]
check('双栏网格选项重排成 A,B,C,D', q15a?.options.map((o) => o[0]).join('') === 'ABCD', JSON.stringify(q15a?.options))
check('双栏网格下不串题（仍是 4 个选项）', q15a?.options.length === 4, `got ${q15a?.options.length}`)

// (b) OCR 把 Part III 读成 Part ID
const ocrPart = `2025年6月大学英语六级考试真题
Part II Listening Comprehension
Section A
1. A) a B) b C) c D) d
Part ID Reading Comprehension (40 minutes)
Section A
Directions: In this section, there is a passage with ten blanks.
The __26__ of study matters. A good __27__ helps. Teachers __28__ tools. Schools need __29__. We must __30__ it.
A) accessible B) advocate C) approach D) assume E) conventional F) demonstrate G) efficiency H) funding I) genuine J) illustrate`
const r15b = parsePaper(ocrPart, 'CET6')
check('「Part ID」仍被识别成阅读理解', r15b.sections.some((s) => s.type === 'cloze'), r15b.sections.map((s) => s.type).join(','))
check(
  '标题里的 Part 序号被归一化回 III',
  r15b.sections.some((s) => s.title.includes('Part III Reading')),
  r15b.sections.map((s) => s.title).join(' | '),
)
check(
  '后面的模块没有继承成听力',
  r15b.sections.filter((s) => s.type === 'listening').reduce((n, s) => n + s.questions.length, 0) === 1,
  r15b.sections.map((s) => `${s.type}:${s.questions.length}`).join(','),
)

// (c) 裸数字空号（下划线被文字层丢掉）
const bareBlank = `2025年6月大学英语六级考试真题
Part ID Reading Comprehension (40 minutes)
Section A
Directions: In this section, there is a passage with ten blanks. You are required to select one word from a word bank.
Reading builds vocabulary. Children who read every day 26 to do better. A good 27 helps them 28 new words. The 29 of reading matters. Parents are 30 to choose books.
A) advised B) acquire C) beneficial D) efficient E) impact F) frequency G) tend H) relax I) quality J) consequently`
const r15c = parsePaper(bareBlank, 'CET6')
const c15c = r15c.sections.find((s) => s.type === 'cloze')
check('裸数字空号也能识别选词填空', c15c?.questions.length === 5, `got ${c15c?.questions.length}`)
check('裸数字空号的题干含该空号', (c15c?.questions[0]?.stem ?? '').includes('26'), JSON.stringify(c15c?.questions[0]?.stem))
check('裸数字空号也挂上词库', (c15c?.questions[0]?.options.length ?? 0) === 10, `got ${c15c?.questions[0]?.options.length}`)

// (d) 每页重复的页眉页脚
const runningHead = `大学英语六级考试真题
Part I Writing
Directions: Write an essay.
・2025年6月六级真题（第一套）・ 2
Part II Listening Comprehension
1. A) a B) b C) c D) d
・2025年6月六级真题（第一套）・ 3
2. A) a B) b C) c D) d
・2025年6月六级真题（第一套）・ 4`
const r15d = parsePaper(runningHead, 'CET6')
check('重复出现的页脚被剥离', !r15d.rawText.includes('六级真题（第一套）'), JSON.stringify(r15d.rawText.slice(0, 60)))
check(
  '剥离页脚后听力仍是 2 题',
  r15d.sections.filter((s) => s.type === 'listening').reduce((n, s) => n + s.questions.length, 0) === 2,
)

// (e) itemsToLines：同一视觉行上的左右栏碎片要合并（双栏网格的成因）
const twoColItems = [
  { str: '1. A) alpha', transform: [10, 0, 0, 10, 36, 700], width: 70, height: 10 },
  { str: 'B) beta', transform: [10, 0, 0, 10, 36, 685], width: 50, height: 10 },
  { str: 'C) gamma', transform: [10, 0, 0, 10, 277, 700], width: 60, height: 10 },
  { str: 'D) delta', transform: [10, 0, 0, 10, 277, 685], width: 55, height: 10 },
]
const twoColLines = itemsToLines(twoColItems)
check('左右栏同 y 碎片合并成一行', twoColLines.length === 2, JSON.stringify(twoColLines))
check('合并后左栏在右栏之前', twoColLines[0] === '1. A) alpha C) gamma', JSON.stringify(twoColLines[0]))

/* ---------------- 用例 16：文章按原卷分段（段内合并、段间分开） ----------------
 * PDF 正文是硬折行的：一段话被切成若干等宽行。直接按行展示会把两三千字的文章
 * 变成几十条断句，完全不是原卷的样子。段落边界有两个来源：
 *   1. 行距变大（itemsToLines 按行距中位数判断）
 *   2. 首行缩进（仔细阅读用这种；行距几乎无差别，只有缩进能区分）
 * 另外长篇阅读的 A) B) C)… 段首标号也要另起一段。
 */
console.log('\n用例 16：文章按原卷分段')

// (a) 首行缩进 → 段落边界
const indentItems = [
  { str: 'The first paragraph starts here.', transform: [10, 0, 0, 10, 53, 700], width: 180, height: 10 },
  { str: 'and continues on the next line.', transform: [10, 0, 0, 10, 35, 685], width: 170, height: 10 },
  { str: 'The second paragraph begins.', transform: [10, 0, 0, 10, 53, 670], width: 160, height: 10 },
  { str: 'with its own continuation.', transform: [10, 0, 0, 10, 35, 655], width: 150, height: 10 },
]
const indentLines = itemsToLines(indentItems)
check('首行缩进插入段落空行', indentLines.filter((l) => l === '').length === 1, JSON.stringify(indentLines))
check('缩进不误伤续行', indentLines[1] === 'and continues on the next line.', JSON.stringify(indentLines[1]))

// (b) 行距变大 → 段落边界（要有足够多的正常行，中位数才有意义）
const gapItems = [
  { str: 'Line one.', transform: [10, 0, 0, 10, 35, 700], width: 80, height: 10 },
  { str: 'Line two.', transform: [10, 0, 0, 10, 35, 685], width: 80, height: 10 },
  { str: 'Line three.', transform: [10, 0, 0, 10, 35, 670], width: 80, height: 10 },
  { str: 'Line four.', transform: [10, 0, 0, 10, 35, 655], width: 90, height: 10 },
  { str: 'New paragraph after a bigger gap.', transform: [10, 0, 0, 10, 35, 625], width: 200, height: 10 },
]
check('行距变大插入段落空行', itemsToLines(gapItems).filter((l) => l === '').length === 1, JSON.stringify(itemsToLines(gapItems)))

// (c) 段落文本合并：段内折行并成一行，段间保留空行
const paraPaper16 = `2025年6月大学英语六级考试真题

Part III Reading Comprehension
Passage One
Questions 46 to 50 are based on the following passage.

The first paragraph starts here
and continues on the next line.

The second paragraph begins here.

46. What is the main idea of the passage?
A) One.
B) Two.
C) Three.
D) Four.`

const r16 = parsePaper(paraPaper16, 'CET6')
const p16 = r16.sections.find((s) => s.title.includes('Passage One'))?.passage ?? ''
const paras16 = p16.split('\n\n')
check(
  '文章的段内折行被合并成一行',
  paras16.some((p) => p.includes('The first paragraph starts here and continues on the next line.')),
  JSON.stringify(paras16),
)
check('段落边界保留为空行', paras16.length >= 3, JSON.stringify(paras16.map((p) => p.slice(0, 30))))

// (d) 长篇阅读的 A) B) 段首标号另起一段
const labelled = `2025年6月大学英语六级考试真题

Part III Reading Comprehension
Section B
Directions: In this section, you are going to read a passage with ten statements attached to it.
A) Librarians know the value
of their community services.
B) Many people point out the value
public libraries bring.

36. People going to the library can build connections.`

const r16b = parsePaper(labelled, 'CET6')
const pb = r16b.sections.find((s) => s.type === 'reading')?.passage ?? ''
check('A) 段首标号另起一段', pb.includes('A) Librarians know the value of their community services.'), JSON.stringify(pb))
check('B) 也另起一段', pb.includes('B) Many people point out the value public libraries bring.'), JSON.stringify(pb))

/* ---------------- 用例 17：长篇阅读（段落匹配）的选项要从段落标号补出来 ----------------
 * 原卷这类题**没有 ABCD 选项行**：题干是一句陈述，作答方式是从原文段落标号 A)~O)
 * 里挑一个填到答题卡。切分器只认选项行的话，这些题的 options 就是空的，
 * 界面上既没有可点的选项、也没法作答（用户实际反馈的就是这个）。
 */
console.log('\n用例 17：长篇阅读补选项')

const matching = `2025年6月大学英语六级考试真题

Part III Reading Comprehension
Section B
Directions: In this section, you are going to read a passage with ten statements attached to it.

A) Librarians know the value of their community services.
B) Many people point out the value public libraries bring to a town.
C) Libraries draw large crowds, thus creating business opportunities.
D) Various programs are organized for children and adolescents.
E) In an organized archive people can research their family history.
F) Public libraries organize cultural events for people of different ages.
G) Besides being an information provider, the library performs many roles.
H) Public libraries help build small communities of people with shared interests.
I) With the costs of education rising, libraries remain a free resource.
J) People going to the library can build connections with others.

36. People going to the library in search of information can build connections.
37. According to advocates of libraries as community builders, librarians matter.
38. With the costs of education continually rising, public libraries remain valuable.
39. Libraries draw large crowds, thus creating lots of business opportunities.
40. With the world more and more digitalized, people underestimate libraries.
41. Various programs organized by public libraries are for children and adolescents.
42. In an organized archive, people can do research on their family history.
43. Public libraries organize cultural events, allowing people of different ages to meet.
44. Besides being an information provider, the library performs many other roles.
45. Public libraries can help build small communities of people with shared interests.`

const r17 = parsePaper(matching, 'CET6')
const sec17 = r17.sections.find((s) => s.type === 'reading')
check('切出长篇阅读模块', !!sec17, String(r17.sections.length))
check('切出 10 道题', sec17?.questions.length === 10, String(sec17?.questions.length))
check(
  '每道题都补上了段落字母选项 A~J',
  sec17?.questions.every((q) => q.options.join('') === 'ABCDEFGHIJ') ?? false,
  JSON.stringify(sec17?.questions[0]?.options),
)
check('题干保持原样（没有被选项污染）', (sec17?.questions[0]?.stem ?? '').startsWith('People going to the library'), sec17?.questions[0]?.stem)
check('段落标号提取到 10 个', extractParagraphLabels(sec17?.passage ?? '').join('') === 'ABCDEFGHIJ')

// 普通选择题不能被误加段落字母
const withOpts = matching.replace(
  '36. People going to the library in search of information can build connections.',
  '36. People going to the library can build connections.\nA) It is useful.\nB) It is useless.\nC) It is unclear.\nD) It is harmful.',
)
const r17b = parsePaper(withOpts, 'CET6')
const q36dup = r17b.sections.find((s) => s.type === 'reading')?.questions.find((q) => q.orderNo === 36)
check('已有 ABCD 选项的题不会被改成段落字母', q36dup?.options.length === 4, JSON.stringify(q36dup?.options))

// 段落标号必须带分隔符才算，正文里的普通句子不能被当成标号
check('正文句子「A lot of people…」不算标号', extractParagraphLabels('A lot of people like reading books.').length === 0)
check('「I think so」不算标号', extractParagraphLabels('I think so, and so do many others.').length === 0)
check('「A) xxx」算标号', extractParagraphLabels('A) Librarians know the value.').join('') === 'A')
check('「B. xxx」算标号', extractParagraphLabels('B. Many people point out the value.').join('') === 'B')

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
