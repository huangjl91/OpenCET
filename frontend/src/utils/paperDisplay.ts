/**
 * 真题练习页的显示判定（纯函数，便于单独验证）。
 *
 * 抽出来的直接原因：这里的判定曾经写在 PaperDetailView.vue 内部，而
 * `isChoice` 要求「必须有答案」才算选择题，导致**导入卷的选项完全不渲染**——
 * 真题 PDF 抽出来的题目普遍不带答案（答案是另附一册的），于是每一道选择题
 * 都被判成主观题、只显示一个文本框。内置示范卷每题都写了答案，所以看起来正常，
 * 两边显示才对不上。抽成模块后可以用脚本对两种卷子跑同一套判定做对照。
 */

export interface ChoiceLike {
  options: string[]
  answer?: string | null
  userAnswer?: string | null
}

/** 全角字母归一化成半角大写（`Ａ` → `A`） */
function normalizeLetter(ch: string): string {
  return ch.normalize('NFKC').toUpperCase()
}

/**
 * 选项字母必须跟分隔符或行尾：`A)` / `A.` / `（A）` / 单独一个 `A`。
 *
 * 字母范围放到 **A~O**：长篇阅读（段落匹配）的答案是段落标号，会用到 E~O。
 * 同时必须要求分隔符 —— 否则 `Books are useful` 会被读成选项 B、`I think so` 会被读成 I。
 */
const LETTER_RE = /^[（(]?\s*([A-Oa-oＡ-Ｏａ-ｏ])\s*(?:[).、．）:：]|$)/

/** 客观题取答案首字母，如 “A” / “A) xxx” / “（Ａ）” → A；本卷没附答案时返回空串 */
export function answerKey(q: ChoiceLike): string {
  const m = (q.answer ?? '').trim().match(LETTER_RE)
  return m ? normalizeLetter(m[1]) : ''
}

/** 卷面是否附了答案键 */
export function hasKey(q: ChoiceLike): boolean {
  return !!answerKey(q)
}

/** 是不是选择题：只看有没有选项，**不能看有没有答案** */
export function isChoice(q: ChoiceLike): boolean {
  // 旧版本存下来的卷子可能没有 options 字段，这里必须容错——
  // 否则 `undefined.length` 会让整个练习页渲染报错、什么都点不动
  return (q.options?.length ?? 0) >= 2
}

/**
 * 选项是不是「清一色的单个字母」（A、B、C…）。
 *
 * 长篇阅读（段落匹配 36-45）就是这样：选项是原文的段落标号，最多到 O。
 * 界面上要把它们排成一行紧凑的字母片，而不是 14 个整行按钮叠起来。
 */
export function isLetterOptions(options?: string[] | null): boolean {
  if (!options || options.length < 2) return false
  return options.every((o) => /^[（(]?\s*[A-Oa-oＡ-Ｏａ-ｏ]\s*[)）.、）:：]?$/.test(o.trim()))
}

/** 从 “A) xxx” / “A. xxx” / “（A）xxx” / “Ａ）xxx” 里取选项字母 */
export function optionLetter(opt: string): string {
  const m = opt.trim().match(LETTER_RE)
  return m ? normalizeLetter(m[1]) : opt
}

/**
 * 练习页要显示的题干。
 *
 * 真实真题 PDF 里听力题**根本不印题干**（问题是念出来的），阅读匹配题也可能没有题干。
 * 直接渲染空字符串会留下一片空白，看起来像坏了；这里给出明确说明，
 * 顺便把「题干没切出来」这种解析缺陷暴露给用户，而不是静静地什么都不显示。
 */
export function stemText(q: { stem: string }, sectionType?: string): string {
  const s = (q.stem ?? '').trim()
  if (s) return s
  if (sectionType === 'listening') return '（听力题干在音频中，请根据选项作答）'
  if (sectionType === 'reading') return '（本题为匹配/判断题，原文未给出题干）'
  return '（本题未切出题干，可在「导入并切分」里手工补充）'
}

/** 选项按钮的作答态样式：有答案键 → 对绿错红；没答案键 → 只标出用户所选 */
export function optionStyle(q: ChoiceLike, opt: string): string {
  if (!q.userAnswer) return ''
  const letter = optionLetter(opt)
  const chosen = letter === q.userAnswer
  const key = answerKey(q)
  if (!key) return chosen ? 'border-color: var(--brand); background: var(--brand-soft)' : ''
  if (letter === key) return 'border-color: var(--ok); background: var(--ok-soft); color: var(--ok)'
  if (chosen) return 'border-color: var(--danger); background: var(--danger-soft); color: var(--danger)'
  return ''
}
