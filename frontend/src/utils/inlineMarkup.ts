/**
 * 极简行内标记：只支持 `**加粗**`。
 *
 * 教学内容里到处都是要点，需要局部加粗，但不值得为此引入 markdown 渲染器
 * （体积、XSS 面、以及「用户内容不能当 HTML」的安全约束）。
 * 抽成共享模块是因为阅读示范和作文方法两块内容都要用。
 */

export interface BoldPiece {
  text: string
  bold: boolean
}

/**
 * 把 `**加粗**` 切成 [{text, bold}]。
 *
 * `**` 数量为奇数（没闭合）时**原样保留**，避免把内容吃掉 ——
 * 少写一个星号只是显示难看，吞字就是内容事故了。
 */
export function splitBold(text: string): BoldPiece[] {
  const out: BoldPiece[] = []
  let rest = text
  while (rest.length) {
    const i = rest.indexOf('**')
    if (i < 0) {
      out.push({ text: rest, bold: false })
      break
    }
    const j = rest.indexOf('**', i + 2)
    if (j < 0) {
      out.push({ text: rest, bold: false })
      break
    }
    if (i > 0) out.push({ text: rest.slice(0, i), bold: false })
    const inner = rest.slice(i + 2, j)
    if (inner) out.push({ text: inner, bold: true })
    rest = rest.slice(j + 2)
  }
  return out
}

/** 去掉标记，得到纯文本（用于校验、日志） */
export function stripBold(text: string): string {
  return text.replace(/\*\*/g, '')
}

/** 标记是否成对（写内容时的自检） */
export function hasBalancedBold(text: string): boolean {
  return (text.match(/\*\*/g) ?? []).length % 2 === 0
}
