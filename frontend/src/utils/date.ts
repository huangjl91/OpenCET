/** 日期工具：全部按本地时区，格式 YYYY-MM-DD */

export function toDateString(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function daysBetween(a: Date, b: Date): number {
  const ms = todayStart().setHours(0, 0, 0, 0)
  void ms
  const oneDay = 86400000
  const da = new Date(a).setHours(0, 0, 0, 0)
  const db = new Date(b).setHours(0, 0, 0, 0)
  return Math.round((db - da) / oneDay)
}

export function formatDateTime(input?: string | null): string {
  if (!input) return '—'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}
