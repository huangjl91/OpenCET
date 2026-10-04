/**
 * 免费在线翻译（无需 API Key，浏览器直连）。
 *
 * 为什么用它而不是「百度翻译」：
 *   - 百度翻译开放平台 API 需要 appid + 密钥，而且**必须服务端做 MD5 签名**，
 *     浏览器直连会被 CORS 挡掉；把密钥放进前端也不安全；
 *   - 百度翻译网页虽然能被 iframe 嵌入，但会带广告和登录框，且对方随时可以加
 *     `X-Frame-Options` 把嵌入禁掉，不能作为产品功能依赖；
 *   - Google 翻译的公开端点在这类网络环境下直接不可达。
 *
 * MyMemory（https://mymemory.translated.net）是免费的翻译记忆服务，
 * 响应头带 `Access-Control-Allow-Origin: *`，可以放心从浏览器直接调，
 * 匿名每天有免费额度（约 5000 词），填邮箱可提到 50000 词。
 */

/** 翻译方向：中译英 / 英译中 */
export type TranslateDirection = 'zh2en' | 'en2zh'

const ENDPOINT = 'https://api.mymemory.translated.net/get'
/** 单次请求的字节上限，超了就按句子切开分多次翻（实测 1200 字节也能过，留足余量） */
const MAX_CHUNK_BYTES = 900

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/** 按句子边界切块，保证每块不超过 MAX_CHUNK_BYTES */
function chunkText(text: string): string[] {
  const parts = text.split(/(?<=[。！？；!?;.\n])/)
  const chunks: string[] = []
  let cur = ''
  for (const p of parts) {
    if (!p) continue
    if (cur && byteLength(cur + p) > MAX_CHUNK_BYTES) {
      chunks.push(cur)
      cur = ''
    }
    cur += p
  }
  if (cur.trim()) chunks.push(cur)
  return chunks.length ? chunks : [text]
}

async function requestOnce(q: string, langpair: string): Promise<string> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(langpair)}`
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('在线翻译请求失败：可能是网络不可达或被浏览器拦截（CORS）')
  }
  if (!res.ok) throw new Error(`在线翻译请求失败（${res.status}）`)

  const json = await res.json().catch(() => null)
  const text = String(json?.responseData?.translatedText ?? '').trim()
  const status = Number(json?.responseStatus ?? 200)
  const detail = String(json?.responseDetails ?? '')

  // 额度用尽时接口会把警告塞进译文里，而不是返回错误码
  if (/MYMEMORY WARNING|QUOTA|LIMIT EXCEEDED/i.test(text) || /QUOTA|LIMIT/i.test(detail)) {
    throw new Error('在线翻译今日免费额度已用完，可改用「AI 翻译」，或明天再试')
  }
  if (!text) throw new Error(`在线翻译返回空结果${detail ? '：' + detail : ''}`)
  if (status !== 200) throw new Error(`在线翻译失败：${detail || status}`)
  return text
}

/**
 * 免费在线翻译。长文本会自动按句切块、逐块翻译后拼接。
 */
export async function freeTranslate(text: string, direction: TranslateDirection): Promise<string> {
  const langpair = direction === 'zh2en' ? 'zh-CN|en' : 'en|zh-CN'
  const source = text.trim()
  if (!source) return ''

  const chunks = chunkText(source)
  const out: string[] = []
  for (const c of chunks) {
    out.push(await requestOnce(c, langpair))
  }
  // 多块之间用换行分隔，保持原段落感
  return out.join(chunks.length > 1 ? '\n' : '')
}
