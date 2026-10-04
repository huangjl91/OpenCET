/**
 * 复习调度 —— 集成测试（直接驱动真实的 mockApi，不是重算公式）
 *
 * 场景：昨晚 22:00 背了 3 个词，今天上午 10:00 打开应用，
 *       这 3 个词**必须**出现在「待复习 / 今日任务」里。
 *
 * 运行： npx tsx tools/reviewIntegration.test.mts
 */

/* ---------------- 假时钟：拦掉 Date，让代码以为「现在」是任意时刻 ---------------- */
const RealDate = Date
let fakeNow = new RealDate('2026-03-10T22:00:00')

class FakeDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(fakeNow.getTime())
    else super(...(args as [number]))
  }
  static now() {
    return fakeNow.getTime()
  }
  static parse = RealDate.parse
  static UTC = RealDate.UTC
}
// @ts-expect-error 测试需要替换全局 Date
globalThis.Date = FakeDate

function setNow(iso: string) {
  fakeNow = new RealDate(iso)
}

/* ---------------- localStorage 桩 ---------------- */
const store = new Map<string, string>()
// @ts-expect-error 测试环境提供最小实现
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}

/* ---------------- fetch 桩：把 /data/*.json 映射到 frontend/public/data ---------------- */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const realFetch = globalThis.fetch
// @ts-expect-error 测试环境提供最小实现
globalThis.fetch = async (input: unknown, init?: unknown) => {
  const url = String(input)
  if (url.startsWith('/data/')) {
    const file = fileURLToPath(new URL('../frontend/public' + url, import.meta.url))
    return new Response(readFileSync(file, 'utf8'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return realFetch(input as RequestInfo, init as RequestInit)
}

/* ---------------- 加载被测模块 ---------------- */
const { mockApi } = await import('../frontend/src/api/mock')

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`)
  }
}

console.log('\n=== 场景：昨晚 22:00 背 3 个词，今天 10:00 打开应用 ===')

// 1) 昨晚 22:00：学 3 个词，都点「认识」
setNow('2026-03-10T22:00:00')
const words = await mockApi.listWords('CET4')
const three = words.slice(0, 3)
for (const w of three) {
  await mockApi.submitWord({ wordId: w.id, result: 'KNOWN', mode: 'new' })
}
console.log(`  昨晚 22:00 学了 ${three.length} 个词（都点「认识」）`)

// 看一下落库的到期时间
const rawAfterLearn = JSON.parse(store.get('opencet.db.v1')!)
const nextAt = three.map((w) => rawAfterLearn.progress[w.id].nextReviewAt)
console.log(`  写入的 nextReviewAt: ${nextAt[0]}  (UTC)`)
console.log(`  本地时间:           ${new RealDate(nextAt[0]).toLocaleString()}(UTC+8 即 3/11 00:00)`)
ok(
  '到期时间落在本地 00:00:00（按天调度）',
  nextAt.every((s: string) => {
    const d = new RealDate(s)
    return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
  }),
  nextAt[0]
)
ok(
  '到期「本地日期」是明天，而不是今晚 22:00',
  nextAt.every((s: string) => {
    const d = new RealDate(s)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}` === '2026-03-11'
  }),
  new RealDate(nextAt[0]).toLocaleString()
)

// 2) 今天 10:00 打开应用
setNow('2026-03-11T10:00:00')
const today = await mockApi.todayQueue('CET4')
const dueIds = today.reviewWords.map((w) => w.id)
console.log(`  今天 10:00 查询：新学 ${today.newWords.length} 个，待复习 ${today.reviewWords.length} 个`)

ok('昨天的 3 个词全部出现在复习队列里', three.every((w) => dueIds.includes(w.id)))
ok('待复习数量 == 3', today.reviewWords.length === 3, `实际 ${today.reviewWords.length}`)

// 3) 统计口径（首页「待复习」数字）也要一致
const stats = await mockApi.stats()
console.log(`  首页统计：待复习 ${stats.dueTotal}`)
ok('首页「待复习」计数与队列一致', stats.dueTotal === 3, `实际 ${stats.dueTotal}`)

console.log('\n=== 边界：当天不该重复出现 ===')
setNow('2026-03-10T23:30:00')
const sameDay = await mockApi.todayQueue('CET4')
ok('刚学完的当天不再重复列入复习', sameDay.reviewWords.length === 0, `实际 ${sameDay.reviewWords.length}`)

console.log('\n=== 边界：不认识 → 5 分钟后立即重现 ===')
setNow('2026-03-12T09:00:00')
const unknownWord = words[10]
await mockApi.submitWord({ wordId: unknownWord.id, result: 'UNKNOWN', mode: 'new' })
const rawAfterUnknown = JSON.parse(store.get('opencet.db.v1')!)
const unknownNext = new RealDate(rawAfterUnknown.progress[unknownWord.id].nextReviewAt)
const deltaMin = Math.round((unknownNext.getTime() - fakeNow.getTime()) / 60000)
ok('「不认识」的词 5 分钟后到期（本次会话内重现）', deltaMin === 5, `实际 ${deltaMin} 分钟`)

console.log('\n=== 迁移：旧数据（v1）升级后立刻可见 ===')
// 造一份 v1 的旧数据：昨晚 22:00 学、nextReviewAt 被写成「今晚 22:00」
store.clear()
setNow('2026-03-11T10:00:00')
const legacyDb = {
  user: { id: 1, nickname: 'CET 考生', currentLevel: 'CET4', dailyGoal: 20, reviewGoal: 40 },
  progress: {
    [three[0].id]: {
      status: 'LEARNING',
      stage: 1,
      familiarity: 1,
      reviewCount: 1,
      lapseCount: 0,
      inNotebook: 0,
      nextReviewAt: new RealDate('2026-03-11T22:00:00').toISOString(),
      lastReviewAt: new RealDate('2026-03-10T22:00:00').toISOString(),
    },
  },
  checkins: {},
  attempts: [],
  papers: [],
  errors: [],
  seq: { paper: 1, section: 1, question: 1, attempt: 1, error: 1 },
  // 故意不带 schemaVersion，模拟旧版本写入的数据
}
store.set('opencet.db.v1', JSON.stringify(legacyDb))

const migrated = await mockApi.todayQueue('CET4')
ok('旧数据被迁移，昨天的词今天上午就能复习到', migrated.reviewWords.length === 1, `实际 ${migrated.reviewWords.length}`)
const rawMigrated = JSON.parse(store.get('opencet.db.v1')!)
ok('迁移后 schemaVersion 标记为 2', rawMigrated.schemaVersion === 2, String(rawMigrated.schemaVersion))
ok(
  '迁移后到期时间对齐到本地 00:00',
  (() => {
    const d = new RealDate(String(rawMigrated.progress[three[0].id].nextReviewAt))
    return d.getHours() === 0 && d.getMinutes() === 0
  })(),
  String(rawMigrated.progress[three[0].id].nextReviewAt)
)

console.log(`\n${'='.repeat(48)}`)
console.log(`复习调度集成测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(48))
// @ts-expect-error 恢复全局
globalThis.Date = RealDate
process.exit(fail === 0 ? 0 : 1)
