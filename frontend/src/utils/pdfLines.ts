/**
 * PDF 文本行还原。
 *
 * pdfjs 的 `getTextContent()` 返回的是一堆**文本碎片**（item），每个碎片只带自己的
 * 字符串和坐标矩阵，不含任何换行信息。旧实现是
 * `content.items.map(it => it.str).join(' ')` —— 把**一整页**拼成一行，
 * 于是一份 10 页的真题只得到 10 行、每行几千字符：
 *   - 切分引擎的「标题行 ≤90 字」把所有模块标题全部拒绝；
 *   - 题号正则 `^\s*\d+\.` 只能匹配到每页开头的第一个数字。
 * 最终每页只切出 1 道题，题干是一整页文本。
 *
 * 现在按**视觉行**还原：所有碎片先按纵坐标 `transform[5]` 分桶（容差取字号的一半），
 * 桶内再按横坐标 `transform[4]` 排序，最后按水平间隙决定是否补空格。
 *
 * 为什么必须是「先分桶再排序」而不是「流式扫描」：CET 真题的**选项是双栏网格**，
 * 例如
 *     1. A) Met the computer technician.        C) Called the man's company.
 *        B) Told the man about her trouble.     D) Visited Alpha Maintenance.
 * 同一 y 上左栏是 A/B、右栏是 C/D。而 PDF 的文字流是**栏序**的（先把左栏读完再读右栏），
 * 流式扫描会把 16.A 16.B 17.A 17.B 16.C 16.D 17.C 17.D 依次吐出——
 * 选项顺序变成 ACBD，甚至把下一题的 C/D 塞进上一题（出现 8 个选项的怪题）。
 * 先按 y 分桶正好能把左右栏重新拼回同一视觉行，再按 x 排序就得到正确顺序。
 */
interface PdfTextItem {
  str?: unknown
  transform?: number[]
  width?: number
  height?: number
}

interface Frag {
  str: string
  x: number
  y: number
  w: number
  h: number
}

export function itemsToLines(items: unknown[]): string[] {
  const frags: Frag[] = []
  const noTransform: string[] = []

  for (const raw of items) {
    const it = raw as PdfTextItem
    if (!it || typeof it.str !== 'string') continue
    const tr = it.transform
    if (!Array.isArray(tr) || tr.length < 6) {
      noTransform.push(it.str)
      continue
    }
    frags.push({
      str: it.str,
      x: tr[4],
      y: tr[5],
      w: it.width ?? 0,
      h: Math.abs(tr[3]) || it.height || 10,
    })
  }

  // 1) 按纵坐标分桶成「视觉行」：从页面顶部往下
  const rows: { y: number; items: Frag[] }[] = []
  for (const f of [...frags].sort((a, b) => b.y - a.y)) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(last.y - f.y) <= Math.max(2, f.h * 0.5)) last.items.push(f)
    else rows.push({ y: f.y, items: [f] })
  }

  // 2) 桶内按横坐标排序拼成文本，按水平间隙补空格
  const lines: string[] = []

  /** 行首是否像题号/选项（这类行内部的换行不是段落边界） */
  const questionish = (s: string) =>
    /^\s*\d{1,3}\s*[.、．)）]/.test(s) || /^\s*[A-D]\s*[)）.、]/.test(s)

  const buildLine = (row: { items: Frag[] }): string => {
    const sorted = [...row.items].sort((a, b) => a.x - b.x)
    let buf = ''
    let lastX: number | null = null
    let lastW = 0
    for (const f of sorted) {
      if (lastX !== null) {
        const gap = f.x - (lastX + lastW)
        // 有间隙才补空格，否则 "In this section" 会被粘成 "Inthissection"
        if (gap > f.h * 0.22 && !/\s$/.test(buf) && !/^\s/.test(f.str)) buf += ' '
      }
      buf += f.str
      lastX = f.x
      lastW = f.w
    }
    return buf.replace(/\s+$/, '')
  }

  const xMins = rows.map((r) => Math.min(...r.items.map((i) => i.x)))

  // 段落边界的两个信号（两者都要，因为不同卷用不同排版风格）：
  //   a) 行距明显变大 —— 实测这份六级卷正文 15.0~15.9、段间 24~30；
  //   b) 首行缩进 —— 仔细阅读用的是「段首缩进约 18pt、续行贴左边距」，
  //      这种情况下行距几乎没差别（14.8 vs 15.6），只有缩进能区分。
  const gaps: number[] = []
  for (let i = 1; i < rows.length; i++) {
    const g = rows[i - 1].y - rows[i].y
    if (g > 0) gaps.push(g)
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const normalGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0
  const paraGap = normalGap > 0 ? normalGap * 1.35 : Number.POSITIVE_INFINITY
  const INDENT = 8

  let prevY: number | null = null
  let prevX: number | null = null
  let prevText = ''
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    const text = buildLine(row)
    const xMin = xMins[ri]
    const gapBreak = prevY !== null && prevY - row.y > paraGap
    const indentBreak = prevX !== null && xMin > prevX + INDENT
    // 缩进信号要避开题号/选项行内部的续行（如「37. …」的下一行缩进接排）
    if (gapBreak || (indentBreak && !questionish(text) && !questionish(prevText))) lines.push('')
    lines.push(text)
    prevY = row.y
    prevX = xMin
    prevText = text
  }

  if (noTransform.length) lines.push(noTransform.join('').trim())

  return lines.filter((l, i) => l.trim() !== '' || (i > 0 && i < lines.length - 1))
}
