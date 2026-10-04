/**
 * 四六级 710 分换算表的测试。
 *
 * 换算表是「查表」不是「按比例算」，所以数据错一格，用户估出来的分就是错的。
 * 重点：
 *   1. **逐格和 Word 原件对上** —— 直接重新解析那份 docx 比对（文件不在就明确跳过）
 *   2. 表是完整的（0..满分每一档都有）且单调（原始分越高，标准分不会更低）
 *   3. 生成的前端模块与 shared/cet-scale.json 一致（忘了重跑生成脚本要能发现）
 *   4. 边界：超出范围夹取、NaN、只填部分
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/cetScale.test.mts
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

let pass = 0
let fail = 0
let skip = 0
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`)
  }
}
function skipped(name: string, why: string) {
  skip++
  console.log(`  ⊘ 跳过 ${name}（${why}）`)
}

const { SCALE_TABLES, CET_SECTIONS, PASS_LINE, toStandard, totalScore, tableOf } = await import(
  '../frontend/src/utils/cetScale'
)

const SRC = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'shared/cet-scale.json'), 'utf8'))

/* ---------------- 1. 表结构与完整性 ---------------- */
console.log('\n=== 1. 换算表结构 ===')
{
  ok('有两张表', SCALE_TABLES.length === 2, String(SCALE_TABLES.length))
  const s35 = tableOf('s35')
  const s15 = tableOf('s15')
  ok('35 分表存在且满分 248.5', s35?.scaleMax === 248.5 && s35?.max === 35)
  ok('15 分表存在且满分 106.5', s15?.scaleMax === 106.5 && s15?.max === 15)

  ok('35 分表覆盖 0–35 共 36 档', s35!.rows.length === 36, String(s35!.rows.length))
  ok('15 分表覆盖 0–15 共 16 档', s15!.rows.length === 16, String(s15!.rows.length))

  for (const t of SCALE_TABLES) {
    const raws = t.rows.map((r) => r.raw).sort((a, b) => a - b)
    const expect = Array.from({ length: t.max + 1 }, (_, i) => i)
    if (raws.join() !== expect.join()) {
      ok(`${t.name} 的档位不缺不重`, false, raws.join())
      break
    }
  }
  ok('两张表的档位都不缺不重', SCALE_TABLES.every((t) => {
    const raws = t.rows.map((r) => r.raw).sort((a, b) => a - b)
    return raws.join() === Array.from({ length: t.max + 1 }, (_, i) => i).join()
  }))

  ok(
    '原始分越高，标准分不会更低（单调不降）',
    SCALE_TABLES.every((t) => {
      const asc = [...t.rows].sort((a, b) => a.raw - b.raw)
      return asc.every((r, i) => i === 0 || asc[i - 1].score <= r.score)
    }),
  )
  ok('满原始分对应满标准分', SCALE_TABLES.every((t) => t.rows.find((r) => r.raw === t.max)?.score === t.scaleMax))
  ok('所有标准分都是正数', SCALE_TABLES.every((t) => t.rows.every((r) => r.score > 0)))

  // 710 = 两个 248.5 + 两个 106.5
  ok('四项满分相加正好 710', 248.5 * 2 + 106.5 * 2 === 710)
  ok(
    '四个部分都有归属的表',
    CET_SECTIONS.length === 4 && CET_SECTIONS.every((s) => !!tableOf(s.tableId)),
    CET_SECTIONS.map((s) => `${s.name}:${s.tableId}`).join(' '),
  )
  ok('过线分数是 425', PASS_LINE === 425)
  ok(
    '每项满分与表的满分对得上',
    CET_SECTIONS.every((s) => s.max === tableOf(s.tableId)?.max),
  )
}

/* ---------------- 2. 逐格和 Word 原件比对 ---------------- */
console.log('\n=== 2. 与 Word 原件逐格比对 ===')
{
  // 换算表来自一份 Word 原件。文件不在手边时这一段会**明确跳过**（打印原因），
  // 不会让整套回归失败 —— 源数据本身的一致性由第 1、3 组断言守住。
  const DOCX = process.env.OPEN_CET_SCALE_DOCX ?? ''
  const PY = process.env.OPEN_CET_PYTHON ?? 'python'

  if (!DOCX) {
    skipped('逐格比对', '未设置 OPEN_CET_SCALE_DOCX（指向 7_35分换算表.docx）')
  } else if (!fs.existsSync(DOCX)) {
    skipped('逐格比对', '找不到 ' + DOCX)
  } else {
    const script = `
import json, sys
from docx import Document
d = Document(sys.argv[1])
out = []
for t in d.tables:
    rows = []
    for r in t.rows:
        rows.append([c.text.strip() for c in r.cells])
    out.append(rows)
print(json.dumps(out, ensure_ascii=False))
`
    const r = spawnSync(PY, ['-X', 'utf8', '-c', script, DOCX], { encoding: 'utf8' })
    if (r.status !== 0) {
      skipped('逐格比对', 'python-docx 不可用：' + String(r.stderr || '').slice(0, 60))
    } else {
      const docTables = JSON.parse(r.stdout) as string[][][]
      ok('docx 里确实是两张表', docTables.length === 2, String(docTables.length))

      // docx 的列结构是「得分 | 标准分 | 得分 | 标准分」，左右两半各覆盖一部分档位
      const parse = (rows: string[][], offset: number) => {
        const out: Record<string, number> = {}
        for (const row of rows) {
          for (const col of [offset, offset + 2]) {
            const raw = row[col]
            const score = row[col + 1]
            if (/^\d+$/.test(raw) && score !== undefined && score !== '') {
              out[raw] = Number(score)
            }
          }
        }
        return out
      }

      for (const [ti, tableId] of [
        [0, 's35'],
        [1, 's15'],
      ] as const) {
        const fromDoc = parse(docTables[ti], 0)
        const table = tableOf(tableId)!
        const mismatch: string[] = []
        for (const row of table.rows) {
          const want = fromDoc[String(row.raw)]
          if (want === undefined) mismatch.push(`${row.raw} 档在 docx 里找不到`)
          else if (want !== row.score) mismatch.push(`${row.raw}: 应用 ${row.score}，docx ${want}`)
        }
        ok(`${table.name} 与应用内数值完全一致`, mismatch.length === 0, mismatch.slice(0, 5).join(' ;; '))
      }
    }
  }
}

/* ---------------- 3. 生成模块与源数据一致 ---------------- */
console.log('\n=== 3. 生成模块与 shared 源数据一致 ===')
{
  const srcTables = SRC.tables as { id: string; rows: { raw: number; score: number }[] }[]
  const mismatch: string[] = []
  for (const st of srcTables) {
    const t = tableOf(st.id)
    if (!t) {
      mismatch.push(`应用里没有 ${st.id}`)
      continue
    }
    if (t.rows.length !== st.rows.length) {
      mismatch.push(`${st.id} 档数不一致：应用 ${t.rows.length}，源 ${st.rows.length}`)
      continue
    }
    for (let i = 0; i < st.rows.length; i++) {
      if (t.rows[i].raw !== st.rows[i].raw || t.rows[i].score !== st.rows[i].score) {
        mismatch.push(`${st.id} 第 ${i} 档不一致`)
        break
      }
    }
  }
  ok('两份数据完全一致（改了 shared 要重跑 tools/build-cet-scale.mjs）', mismatch.length === 0, mismatch.join(' ;; '))
}

/* ---------------- 4. 查表与总分 ---------------- */
console.log('\n=== 4. 查表与总分 ===')
{
  ok('35 分 → 248.5', toStandard('s35', 35) === 248.5)
  ok('0 分 → 101.5', toStandard('s35', 0) === 101.5)
  ok('15 分 → 106.5', toStandard('s15', 15) === 106.5)
  ok('0 分 → 43.5', toStandard('s15', 0) === 43.5)
  // 阶梯：19 与 18 同分、10 与 9 同分
  ok('阶梯档位一致（19 与 18 同为 154）', toStandard('s35', 19) === 154 && toStandard('s35', 18) === 154)
  ok('阶梯档位一致（10 与 9 同为 126）', toStandard('s35', 10) === 126 && toStandard('s35', 9) === 126)

  // 每一档都查得到、和表一致
  const bad: string[] = []
  for (const t of SCALE_TABLES) {
    for (const r of t.rows) {
      if (toStandard(t.id, r.raw) !== r.score) bad.push(`${t.id}/${r.raw}`)
    }
  }
  ok('每一档查表都命中', bad.length === 0, bad.slice(0, 4).join(' '))

  // 边界
  ok('超出上限被夹取', toStandard('s35', 999) === 248.5)
  ok('负分被夹到 0 档', toStandard('s35', -5) === 101.5)
  ok('小数按四舍五入取档', toStandard('s35', 34.6) === 248.5)
  ok('NaN 不炸', toStandard('s35', Number.NaN) === 101.5)
  ok('不存在的表返回 0 而不是抛错', toStandard('nope', 10) === 0)

  const full = totalScore({ listening: 35, reading: 35, writing: 15, translation: 15 })
  ok('四项满分 = 710', full.total === 710, String(full.total))
  ok('满分判为过线', full.passed)
  ok('满分不缺项', full.filled === 4)

  const zero = totalScore({})
  ok('全不填 = 各表最低分之和 290', zero.total === 290, String(zero.total))
  ok('全不填不算过线', !zero.passed)
  ok('全不填 filled 为 0', zero.filled === 0)
  ok('全不填时提示离过线差多少', zero.gap === 135, String(zero.gap))

  const partial = totalScore({ listening: 25 })
  ok('只填一项时 filled 为 1', partial.filled === 1)
  // 听力 25 → 175；阅读未填 → 35 分表的 0 档 101.5；写作/翻译未填 → 15 分表的 0 档 43.5
  ok('只填一项也给出总分（未填按 0 档）', partial.total === 175 + 101.5 + 43.5 + 43.5, String(partial.total))

  const sample = totalScore({ listening: 25, reading: 25, writing: 10, translation: 10 })
  ok('示例组合总分 = 175+175+81+81', sample.total === 512, String(sample.total))
  ok('示例组合过线', sample.passed)

  // 挑一组真正低于 425 的：听力/阅读各 15（143.5），写作/翻译各 6（63）
  const below = totalScore({ listening: 15, reading: 15, writing: 6, translation: 6 })
  ok('低于 425 的组合算得出差距', below.total === 413 && !below.passed, String(below.total))
  ok('差距数值正确（425-413=12）', below.gap === 12, String(below.gap))
  // 同一组合再各加一分，应该正好过线或更接近
  const above = totalScore({ listening: 19, reading: 19, writing: 10, translation: 10 })
  ok('提高原始分后标准分也提高', above.total > below.total, `${above.total} vs ${below.total}`)
  ok('470 分判为过线', above.total === 470 && above.passed, String(above.total))

  ok('parts 顺序与 CET_SECTIONS 一致', full.parts.map((p) => p.id).join() === CET_SECTIONS.map((s) => s.id).join())
  ok('ratio 在 0–1 之间', full.parts.every((p) => p.ratio >= 0 && p.ratio <= 1))
}

/* ---------------- 5. 界面接线 ---------------- */
console.log('\n=== 5. 界面接线 ===')
{
  // 首页是 DashboardView（路由 '/'），不是 StudyView（'/study' 背单词）
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/DashboardView.vue'), 'utf8')
  ok('首页引了换算组件', view.includes("import ScoreConverter from '@/components/ScoreConverter.vue'"))
  ok('首页真的渲染了它', view.includes('<ScoreConverter />'))

  const router = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/router/index.ts'), 'utf8')
  ok('路由 / 指向 DashboardView', /path:\s*'\/'[^}]*DashboardView/.test(router))

  const comp = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/components/ScoreConverter.vue'), 'utf8')
  ok('组件有四个部分的输入', comp.includes('v-for="s in CET_SECTIONS"'))
  ok('组件显示总分', comp.includes('scale__total-num'))
  ok('组件有 425 线标记', comp.includes('scale__bar-line') && comp.includes('PASS_LINE'))
  ok('组件能展开完整换算表', comp.includes('showTable') && comp.includes('scale__rows'))

  // 放在模块进度卡之前（不打断背词/打卡的主流程，也不用翻到最后）
  const atConverter = view.indexOf('<ScoreConverter />')
  const atProgress = view.indexOf('词汇掌握进度')
  ok('放在词汇掌握进度之前', atConverter > 0 && atProgress > 0 && atConverter < atProgress, `换算@${atConverter} 进度@${atProgress}`)

  // 不要在背单词页重复放一份
  const study = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/views/StudyView.vue'), 'utf8')
  ok('背单词页没有重复放', !study.includes('<ScoreConverter'))

  ok('生成脚本存在（可重现）', fs.existsSync(path.resolve(process.cwd(), 'tools/build-cet-scale.mjs')))
  ok('源数据在 shared 留档', fs.existsSync(path.resolve(process.cwd(), 'shared/cet-scale.json')))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`换算分测试：${pass} 通过 / ${fail} 失败${skip ? ` / ${skip} 跳过` : ''}`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
