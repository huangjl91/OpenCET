/**
 * localStorage 读写封装（所有用户数据本地持久化，服务端只做备份同步）
 */
const PREFIX = 'opencet.'

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.warn('[storage] 写入失败', key, e)
  }
}

export function removeLocal(key: string): void {
  localStorage.removeItem(PREFIX + key)
}

export function clearAllLocal(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

/** 本地用户 token（免注册，首次访问生成；后端用同一个 token 建档案） */
const TOKEN_KEY = 'token'

export function getUserToken(): string {
  let token = localStorage.getItem(PREFIX + TOKEN_KEY)
  if (!token) {
    token =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem(PREFIX + TOKEN_KEY, token)
  }
  return token
}
