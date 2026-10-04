/**
 * 题库自检：用「参考译文自己作答」，每题都必须拿到满分、核心词全部命中。
 *
 * 若某题的核心词在标准答案里都匹配不上，说明该核心词与本引擎的词形还原规则不兼容，
 * 这类题对学生是不公平的（再怎么译对也扣分）——必须修掉。
 */
import { grade } from '../frontend/src/utils/grade'
import type { CoreWord } from '../frontend/src/types'

interface Q {
  level: string
  prompt: string
  reference: string
  coreWords?: CoreWord[]
}

function audit(name: string, list: Q[]): number {
  let bad = 0
  for (const q of list) {
    const g = grade(q.reference, q.reference, q.coreWords ?? [])
    const miss = [...g.miss, ...g.reorder, ...g.near.map((n) => n.expected)]
    if (g.score < 100 || miss.length) {
      bad++
      const head = q.prompt.slice(0, 24)
      console.log('  x ' + name + ' [' + head + '...] score=' + g.score + ' 未命中=' + JSON.stringify(miss))
    }
  }
  console.log(name + ': 共 ' + list.length + ' 题，异常 ' + bad + ' 题')
  return bad
}

async function main() {
  const batch07 = await import('../tools/data/_expand/tr-batch-07.mjs')
  const all = await import('../tools/data/translations.mjs')

  console.log('=== 新批次 07 自检 ===')
  const badNew = audit('batch-07', batch07.TRANSLATIONS_EXTRA_07 as Q[])

  console.log('\n=== 全库自检 ===')
  const badAll = audit('全部', all.TRANSLATIONS as Q[])

  console.log('\n结论：新增异常 ' + badNew + '，全库异常 ' + badAll)
  process.exit(badAll === 0 ? 0 : 1)
}

main()
