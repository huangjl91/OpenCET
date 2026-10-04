/**
 * 从《翻译常用词汇》Word 笔记里抽出词条，供人工整理成 shared/translation-vocab.json。
 *
 * 用法：
 *   node tools/parse-vocab-docx.mjs "<翻译常用词汇.docx 路径>"
 *
 * 说明：**只输出原始行，不自动入库**。
 * 原笔记是手写笔记，一行里常混着多个词条、还夹着笔误
 * （`Start form` 应为 start from、`特俗的含义` 应为特殊的含义、
 * `all year around` 应为 all year round），自动切分一定会切错，
 * 所以这一步只负责把内容倒出来，整理由人来做。
 *
 * 已整理的成果：shared/translation-vocab.json（100 条 / 11 组），
 * 同步到 frontend/public/data/translation-vocab.json 供页面加载。
 */
import fs from 'node:fs'
import path from 'node:path'

const src = process.argv[2]
if (!src) {
  console.error('用法：node tools/parse-vocab-docx.mjs "<翻译常用词汇.docx 路径>"')
  console.error('（这个脚本只用于把 Word 笔记倒成文本，日常使用不需要它）')
  process.exit(1)
}
if (!fs.existsSync(src)) {
  console.error('找不到文件：' + src)
  process.exit(1)
}

// 只在需要时加载 python-docx；Node 读不了 docx，走 Python 更省事
const { spawnSync } = await import('node:child_process')
const PY = process.env.OPEN_CET_PYTHON ?? 'python'

const script = `
import json, sys
from docx import Document
d = Document(sys.argv[1])
out = []
for p in d.paragraphs:
    t = (p.text or '').strip()
    if t:
        out.append(t)
print(json.dumps(out, ensure_ascii=False))
`

const r = spawnSync(PY, ['-X', 'utf8', '-c', script, src], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error('调用 python-docx 失败：')
  console.error(r.stderr || r.stdout)
  console.error('\n可先设置环境变量 OPEN_CET_PYTHON 指向带 python-docx 的解释器。')
  process.exit(1)
}

const lines = JSON.parse(r.stdout)
const out = path.join(process.cwd(), '.runtime', 'vocab-raw.txt')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, lines.join('\n'), 'utf8')

console.log(`已抽出 ${lines.length} 行原始内容 → ${path.relative(process.cwd(), out)}`)
console.log('整理成 shared/translation-vocab.json 后，跑 tools/build-spell-dict.mjs 把新词并进拼写词典。')
