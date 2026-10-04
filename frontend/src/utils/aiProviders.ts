/**
 * 模型服务商预设。
 *
 * 只收**提供 OpenAI 兼容接口**的服务商 —— 本站的调用逻辑就是
 * `POST {baseUrl}/chat/completions` + `Authorization: Bearer <key>`，换了不兼容的协议就对不上。
 *
 * 关于模型名：这个领域模型名变得非常快（DeepSeek 从 `deepseek-chat` 换成了
 * `deepseek-flash`/`deepseek-v4-pro`，百炼也换了域名），写死在代码里迟早过期。
 * 所以这里的 `models` 只是**开箱可用的默认值**，界面另有「拉取模型列表」按钮
 * 直接问服务商要 `GET /models`，以及「自定义」输入框兜底。
 *
 * 地址以各家官方文档为准（2026-01 核对）：
 *   DeepSeek  https://api-docs.deepseek.com/
 *   智谱      https://docs.bigmodel.cn/cn/api/introduction
 *   Kimi      https://platform.kimi.com/docs/api/overview
 *   阿里百炼  https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope
 */

export interface AiProvider {
  id: string
  /** 显示名 */
  name: string
  /** OpenAI 兼容 baseUrl（不含 /chat/completions） */
  baseUrl: string
  /** 常见模型名，仅作默认值 */
  models: string[]
  /** 备注：申请入口、注意事项 */
  note?: string
  /** 本地部署，Key 随便填 */
  local?: boolean
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    note: '国内直连、价格低，备考问答够用。Key 在 platform.deepseek.com 申请。',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼（通义千问）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
    note: '也可换成控制台里的工作空间专属域名（性能更稳）。Key 按地域绑定，注意与地址一致。',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'],
    note: 'glm-4-flash 有免费额度，适合先试。',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0711-preview'],
    note: '长文本见长，适合让模型读整篇真题。',
  },
  {
    id: 'ark',
    name: '火山方舟（豆包）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-32k', 'doubao-lite-32k'],
    note: '方舟的 model 要填**接入点 ID**（ep- 开头），先在控制台创建接入点。',
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: ['hunyuan-turbo', 'hunyuan-pro', 'hunyuan-standard'],
    note: 'Key 在腾讯云控制台的混元大模型页面申请。',
  },
  {
    id: 'qianfan',
    name: '百度千帆（文心）',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k'],
    note: '用的是千帆 v2 的 OpenAI 兼容地址。',
  },
  {
    id: 'spark',
    name: '讯飞星火',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    models: ['generalv3.5', '4.0Ultra', 'lite'],
    note: 'Key 在讯飞开放平台控制台获取。',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: ['abab6.5s-chat', 'MiniMax-Text-01'],
    note: '',
  },
  {
    id: 'stepfun',
    name: '阶跃星辰',
    baseUrl: 'https://api.stepfun.com/v1',
    models: ['step-1-8k', 'step-1-32k', 'step-2-16k'],
    note: '',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'],
    note: '聚合了大量开源模型，model 名要带 `厂商/模型` 前缀。有免费额度。',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat'],
    note: '一个 Key 打通多家模型，model 名形如 `厂商/模型`。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    note: '国内网络通常需要代理才能直连。',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    note: '推理速度极快，有免费额度。',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo'],
    note: '',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    note: '',
  },
  {
    id: 'ollama',
    name: 'Ollama（本机部署）',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5:7b', 'llama3.2', 'gemma2'],
    note: '完全离线、不花钱。API Key 随便填一个非空字符串即可（本地不校验）。',
    local: true,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本机部署）',
    baseUrl: 'http://localhost:1234/v1',
    models: ['local-model'],
    note: '在 LM Studio 里启动本地服务后使用。API Key 随便填。',
    local: true,
  },
  {
    id: 'custom',
    name: '自定义（其它兼容服务）',
    baseUrl: '',
    models: [],
    note: '任何提供 OpenAI 兼容接口的服务都行：填上 baseUrl（到 /v1 为止，不要带 /chat/completions）。',
  },
]

/** 去掉结尾斜杠，便于比较 */
export function normalizeBaseUrl(url: string): string {
  return (url ?? '').trim().replace(/\/+$/, '')
}

/** 根据 baseUrl 反查是哪家（找不到就是自定义）；比较时忽略大小写与结尾斜杠 */
export function providerOf(baseUrl: string): AiProvider | undefined {
  const b = normalizeBaseUrl(baseUrl).toLowerCase()
  if (!b) return undefined
  return AI_PROVIDERS.find((p) => p.baseUrl && normalizeBaseUrl(p.baseUrl).toLowerCase() === b)
}

/** 界面上给某个 baseUrl 显示的厂商名 */
export function providerNameOf(baseUrl: string): string {
  return providerOf(baseUrl)?.name ?? (normalizeBaseUrl(baseUrl) ? '自定义' : '未选择')
}

/** 一个厂商可用作下拉选项的模型名（预设 + 已拉取的，去重保序） */
export function modelOptions(provider: AiProvider | undefined, fetched: string[], current: string): string[] {
  const out: string[] = []
  const push = (m: string) => {
    const v = (m ?? '').trim()
    if (v && !out.includes(v)) out.push(v)
  }
  if (provider) provider.models.forEach(push)
  fetched.forEach(push)
  // 用户手填过、或换过厂商留下的模型名，也要能在下拉里看到，否则会被静默改掉
  push(current)
  return out
}
