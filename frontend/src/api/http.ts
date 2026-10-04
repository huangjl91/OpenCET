import { getUserToken } from '@/utils/storage'

/** 后端地址：默认同源（vite dev 已配置 /api 代理到 8080） */
export const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {
  constructor(public code: number, message: string) {
    super(message)
  }
}

interface BackendResult<T> {
  code: number
  message: string
  data: T
}

export async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    query?: Record<string, string | number | boolean | undefined | null>
  } = {}
): Promise<T> {
  const { method = 'GET', body, query } = options

  let url = API_BASE + path
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Token': getUserToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    throw new ApiError(res.status, `网络错误 ${res.status}`)
  }

  const json = (await res.json()) as BackendResult<T>
  if (json.code !== 0) {
    throw new ApiError(json.code, json.message || '请求失败')
  }
  return json.data
}
