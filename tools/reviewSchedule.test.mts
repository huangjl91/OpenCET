/**
 * 复习调度回归测试
 *
 * 复现并验证这个 bug：遗忘曲线用「当前时刻 + N 天」算下一次复习，
 * 会导致昨晚背的词要等到**今晚同一时刻**才到期，第二天白天复习队列是空的。
 *
 * 运行： npx tsx tools/reviewSchedule.test.mts
 */
import { addDays, toDateString, todayStart } from '../frontend/src/utils/date'

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

const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30, 60]

/* ---------- 旧算法：时刻 + N 天 ---------- */
function oldSchedule(learnedAt: Date, stage: number): Date {
  return new Date(learnedAt.getTime() + INTERVAL_DAYS[stage] * 86400000)
}

/* ---------- 新算法：按「天」调度，落在目标日 00:00 ---------- */
function newSchedule(learnedAt: Date, stage: number): Date {
  const base = new Date(learnedAt)
  base.setHours(0, 0, 0, 0)
  return addDays(base, INTERVAL_DAYS[stage])
}

/** 是否到期 */
function isDue(nextReviewAt: Date, at: Date): boolean {
  return nextReviewAt <= at
}

console.log('\n=== 用例 1：昨晚 22:00 背的词，今天 10:00 该不该到期 ===')
{
  const learnedAt = new Date('2026-03-10T22:00:00')
  const checkAt = new Date('2026-03-11T10:00:00') // 第二天早上打开应用

  const oldNext = oldSchedule(learnedAt, 1) // stage 1 → 1 天后
  const newNext = newSchedule(learnedAt, 1)

  console.log(`  学于 2026-03-10 22:00，检查于 2026-03-11 10:00`)
  console.log(`  旧算法到期时间: ${oldNext.toLocaleString()}`)
  console.log(`  新算法到期时间: ${newNext.toLocaleString()}`)

  ok('旧算法：第二天早上「不到期」（这就是 bug）', !isDue(oldNext, checkAt))
  ok('新算法：第二天早上「到期」，复习队列能看到', isDue(newNext, checkAt))
}

console.log('\n=== 用例 2：同一天内不该重复出现 ===')
{
  const learnedAt = new Date('2026-03-10T09:00:00')
  const sameDayLater = new Date('2026-03-10T21:00:00')
  const nextDay = new Date('2026-03-11T08:00:00')

  const newNext = newSchedule(learnedAt, 1)
  ok('当天晚上仍未到期（不会一天内反复出现）', !isDue(newNext, sameDayLater))
  ok('第二天早上已到期', isDue(newNext, nextDay))
}

console.log('\n=== 用例 3：各阶段间隔都落在正确日期的 00:00 ===')
{
  const learnedAt = new Date('2026-03-10T15:30:00')
  const expect = [0, 1, 2, 4, 7, 15, 30, 60]
  let allOk = true
  for (let stage = 0; stage < INTERVAL_DAYS.length; stage++) {
    const d = newSchedule(learnedAt, stage)
    const want = addDays(new Date('2026-03-10T00:00:00'), expect[stage])
    const same = d.getTime() === want.getTime()
    if (!same) {
      allOk = false
      console.log(`    stage ${stage}: 得到 ${d.toLocaleString()}，期望 ${want.toLocaleString()}`)
    }
    if (d.getHours() !== 0 || d.getMinutes() !== 0) {
      allOk = false
      console.log(`    stage ${stage}: 不是 00:00 → ${d.toLocaleString()}`)
    }
  }
  ok('stage 0..7 全部落在目标日 00:00', allOk)
}

console.log('\n=== 用例 4：迁移旧数据（把历史 nextReviewAt 抹到当天 00:00）===')
{
  // 模拟旧版存下来的数据：昨晚 22:00 背的词，nextReviewAt = 今晚 22:00
  const legacy = {
    w1: { nextReviewAt: new Date('2026-03-11T22:00:00').toISOString() },
    w2: { nextReviewAt: new Date('2026-03-18T22:00:00').toISOString() }, // 7 天后
    w3: { nextReviewAt: null },
  }

  for (const p of Object.values(legacy)) {
    if (!p.nextReviewAt) continue
    const d = new Date(p.nextReviewAt)
    d.setHours(0, 0, 0, 0)
    p.nextReviewAt = d.toISOString()
  }

  const checkAt = new Date('2026-03-11T10:00:00')
  ok(
    '历史 w1 迁移后当天早上即到期（用户能立刻看到昨天的词）',
    isDue(new Date(legacy.w1.nextReviewAt!), checkAt)
  )
  ok('w2 迁移后仍在 7 天后 00:00，不会被提前', toDateString(new Date(legacy.w2.nextReviewAt!)) === '2026-03-18')
  ok('w3 保持 null 不炸', legacy.w3.nextReviewAt === null)
}

console.log('\n=== 用例 5：统计口径（待复习计数）与队列一致 ===')
{
  const now = new Date('2026-03-11T10:00:00')
  const progresses = [
    { status: 'LEARNING', nextReviewAt: newSchedule(new Date('2026-03-10T22:00:00'), 1).toISOString() },
    { status: 'KNOWN', nextReviewAt: newSchedule(new Date('2026-03-10T22:00:00'), 6).toISOString() },
    { status: 'LEARNING', nextReviewAt: newSchedule(new Date('2026-03-11T09:00:00'), 1).toISOString() }, // 明天
  ]
  const due = progresses.filter(
    (p) => p.status !== 'KNOWN' && p.nextReviewAt && new Date(p.nextReviewAt) <= now
  )
  ok('昨天的词计入待复习', due.length === 1, `实际 ${due.length}`)
  ok('已掌握(6阶)的词不再计入', !due.some((d) => d.status === 'KNOWN'))
  ok('今天刚学的词不重复计入', due.length !== 3)
}

console.log(`\n${'='.repeat(46)}`)
console.log(`复习调度测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(46))
process.exit(fail === 0 ? 0 : 1)
