import * as pdfjsLib from 'pdfjs-dist'
// Vite 会把 worker 文件作为静态资源处理，返回可加载的 URL
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
// 必须直接引用浏览器包，否则 Vite 会走 Node 入口（依赖 fs/path 在浏览器不可用）
import * as mammoth from 'mammoth/mammoth.browser.js'
import { itemsToLines } from './pdfLines'

// 让 pdfjs 在浏览器里用我们提供的 worker URL（避免跨域 / 路径问题）
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker

export type ExtractKind = 'txt' | 'pdf' | 'docx' | 'doc' | 'unknown'

export interface ExtractResult {
  text: string
  name: string
  size: number
  kind: ExtractKind
}

const TEXT_EXTS = ['txt', 'md', 'markdown', 'json', 'text', 'csv', 'tsv', 'xml', 'html', 'htm']

/** 文本解码：优先 UTF-8；若替换符过多（乱码），回退 GBK（中文 Windows 常见） */
function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const replacement = (utf8.match(/�/g) || []).length
  if (replacement > utf8.length * 0.02) {
    try {
      return new TextDecoder('gbk', { fatal: false }).decode(buf)
    } catch {
      return utf8
    }
  }
  return utf8
}

async function extractPdf(buf: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(itemsToLines(content.items).join('\n'))
  }
  return pages.join('\n\n')
}

async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const res = await mammoth.extractRawText({ arrayBuffer: buf })
  return res.value
}

/**
 * 从用户选择的文件中抽取纯文本。
 * 支持：.txt/.md/.json/.csv/.xml/.html（文本，带 GBK 回退）、.pdf、.docx。
 * 旧版 .doc 暂不支持，给出明确提示。
 */
export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const name = file.name || '未命名文件'
  const size = file.size
  const ext = (name.toLowerCase().split('.').pop() || '').replace(/^_/, '')
  const buf = await file.arrayBuffer()

  if (TEXT_EXTS.includes(ext)) {
    return { text: decodeText(buf), name, size, kind: 'txt' }
  }
  if (ext === 'pdf') {
    return { text: await extractPdf(buf), name, size, kind: 'pdf' }
  }
  if (ext === 'docx') {
    return { text: await extractDocx(buf), name, size, kind: 'docx' }
  }
  if (ext === 'doc') {
    throw new Error('暂不支持旧版 .doc（请用 Word 另存为 .docx，或导出为 PDF / .txt 后上传）')
  }
  // 未知扩展名：当文本读，读不到内容再报错
  const txt = decodeText(buf)
  if (!txt.trim()) {
    throw new Error('无法识别该文件内容，请上传 .pdf / .docx / .txt / .md / .json 文本文件。')
  }
  return { text: txt, name, size, kind: 'unknown' }
}

/** 人类可读的文件大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
