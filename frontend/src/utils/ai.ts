import type { AiConfig, AiContext, ChatMessage } from '@/types'
import { readLocal, writeLocal } from './storage'

const AI_CONFIG_KEY = 'ai.config'
const AI_HISTORY_KEY = 'ai.history'

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.4,
}

/**
 * AI 配置只存在浏览器 localStorage，请求由浏览器直连模型服务商，
 * 不经过本站后端，因此 API Key 不会以明文形式上传到任何服务器。
 */
export function getAiConfig(): AiConfig {
  return { ...DEFAULT_AI_CONFIG, ...readLocal<Partial<AiConfig>>(AI_CONFIG_KEY, {}) }
}

export function saveAiConfig(cfg: Partial<AiConfig>): AiConfig {
  const next = { ...getAiConfig(), ...cfg }
  writeLocal(AI_CONFIG_KEY, next)
  return next
}

export function hasApiKey(): boolean {
  return !!getAiConfig().apiKey.trim()
}

export function loadHistory(): ChatMessage[] {
  return readLocal<ChatMessage[]>(AI_HISTORY_KEY, [])
}

export function saveHistory(list: ChatMessage[]): void {
  // 只保留最近 60 条，避免 localStorage 膨胀
  writeLocal(AI_HISTORY_KEY, list.slice(-60))
}

export function clearHistory(): void {
  writeLocal(AI_HISTORY_KEY, [])
}

/** 拼装带题目上下文的 system prompt */
export function buildSystemPrompt(ctx?: AiContext): string {
  const base = [
    '你是一位专业的英语四六级（CET-4 / CET-6）备考教练。',
    '回答要求：',
    '1. 中文讲解为主，英文例句保留原文，并对长难句给出结构拆解与翻译；',
    '2. 涉及单词时给出音标、词性、释义、常见搭配与真题语境；',
    '3. 涉及长难句时指出主干、从句类型、关键连接词与翻译技巧；',
    '4. 涉及题目时先给答案与依据，再讲排除项与解题策略；',
    '5. 输出简洁，条理清晰，适度使用列表。',
  ].join('\n')

  if (!ctx || !ctx.content) return base

  const label =
    ctx.kind === 'word' ? '当前单词' : ctx.kind === 'translation' ? '当前翻译题' : ctx.kind === 'paper' ? '当前真题题目' : '当前上下文'

  return [
    base,
    '',
    `【${label}】${ctx.title ? ctx.title + '\n' : ''}${ctx.content}`,
    ctx.extra ? `\n补充信息：${ctx.extra}` : '',
    '',
    '请紧密围绕上述上下文作答；若上下文信息不足，可基于四六级考纲补充说明。',
  ].join('\n')
}

function endpoint(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions'
}

/**
 * 调用 OpenAI 兼容接口（支持流式）
 *
 * @param messages 完整对话（含 system）
 * @param onDelta 流式增量回调
 */
export async function chat(
  messages: ChatMessage[],
  onDelta?: (chunk: string) => void
): Promise<string> {
  const cfg = getAiConfig()
  if (!cfg.apiKey.trim()) {
    throw new Error('尚未配置 API Key，请在顶栏右侧的「AI 问答」抽屉里点「模型设置」填写（仅保存在本机浏览器）')
  }

  const body = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    stream: !!onDelta,
  }

  const res = await fetch(endpoint(cfg.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`请求失败（${res.status}）：${detail.slice(0, 300)}`)
  }

  if (!onDelta) {
    const json = await res.json()
    return json?.choices?.[0]?.message?.content ?? ''
  }

  // 流式：解析 SSE
  const reader = res.body?.getReader()
  if (!reader) throw new Error('当前环境不支持流式响应')

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const data = t.slice(5).trim()
        if (data === '[DONE]') return full
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta?.content
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch {
          // 忽略非 JSON 心跳行
        }
      }
    }
  }
  return full
}

/** 连通性自检：发一条极短消息 */
export async function testConnection(): Promise<string> {
  const reply = await chat([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Reply with exactly: OK' },
  ])
  return reply.trim().slice(0, 120) || '(空响应)'
}

/**
 * 问服务商要**当前**可用的模型列表（`GET {baseUrl}/models`）。
 *
 * 模型名变得太快（DeepSeek 从 deepseek-chat 换成了 deepseek-flash），
 * 写死在代码里的默认值迟早过期，这个接口能拿到服务商此刻真实的列表。
 *
 * 不是所有 OpenAI 兼容服务都实现了 `/models`，所以失败时要把原因讲清楚，
 * 而不是静默返回空列表 —— 用户分不清「没拉取到」和「这家没有这个接口」。
 */
export async function fetchModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  const cfg = getAiConfig()
  const base = (baseUrl ?? cfg.baseUrl).trim().replace(/\/+$/, '')
  const key = (apiKey ?? cfg.apiKey).trim()
  if (!base) throw new Error('先填接口地址 Base URL')

  const res = await fetch(base + '/models', {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `拉取失败（${res.status}）：${detail.slice(0, 200) || '无返回内容'}。` +
        '该服务可能没有实现 /models 接口，可以直接手填模型名。'
    )
  }

  const json = (await res.json().catch(() => null)) as unknown
  const raw = (json as { data?: unknown[]; models?: unknown[] })?.data ?? (json as { models?: unknown[] })?.models ?? []
  const ids = (Array.isArray(raw) ? raw : [])
    .map((x) => {
      if (typeof x === 'string') return x
      const o = x as { id?: unknown; name?: unknown; model?: unknown }
      return [o?.id, o?.name, o?.model].find((v) => typeof v === 'string' && v) as string | undefined
    })
    .filter((x): x is string => !!x)

  if (!ids.length) throw new Error('接口通了，但返回的列表是空的（该服务可能不提供 /models）')
  return [...new Set(ids)].sort()
}
