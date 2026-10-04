/**
 * 给翻译题库打上「分类」标签。
 *
 * 原数据的 `source` 是 `四级翻译·X`，X 有三种形态，没法直接当分类用：
 *   1. 主题类      文化类 / 社会类 / 科技类 …            → 直接用
 *   2. 年份场次    2019年6月（剪纸） / 2020年9月真题话题   → 按下表映射到主题
 *   3. 专项        基础句型（被动语态） / 写作衔接专项（…） → 归入对应专项
 *
 * 映射表写成**显式常量**而不是关键词猜：题库是死的，猜错一次就永久错，
 * 列出来还能一眼核对。改完跑 `node tools/classify-translations.mjs` 重新落盘。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'shared/translations.json')
const DEST = [SRC, path.join(ROOT, 'frontend/public/data/translations.json')]

/** 年份场次 / 纯主题 → 主题分类 */
const TOPIC_TO_CATEGORY = {
  // 文化类
  剪纸: '文化类',
  灯笼: '文化类',
  舞狮: '文化类',
  中国结: '文化类',
  中餐: '文化类',
  中国茶: '文化类',
  筷子: '文化类',
  苏州园林: '文化类',
  长城: '文化类',
  故宫: '文化类',
  中国姓氏: '文化类',
  春节团圆饭: '文化类',
  铁观音: '文化类',
  茅台: '文化类',
  太极拳: '文化类',
  莫高窟: '文化类',
  中国山水画: '文化类',
  国画: '文化类',
  红楼梦: '文化类',
  汉字: '文化类',
  四大发明: '文化类',
  唐诗: '文化类',
  长江: '文化类',
  海南岛: '文化类',
  // 科技类
  中国高铁: '科技类',
  共享单车: '科技类',
  移动支付: '科技类',
  快递业: '科技类',
  新能源汽车: '科技类',
  中国航天: '科技类',
  数字经济: '科技类',
  深海探测: '科技类',
  // 社会类
  深圳: '社会类',
  中国城市化: '社会类',
  人口老龄化: '社会类',
  中国家庭观念: '社会类',
  乡村旅游: '社会类',
  电商与乡村振兴: '社会类',
  // 教育类
  高等教育: '教育类',
  // 环境类
  生态文明建设: '环境类',
  // 经济类
  一带一路: '经济类',
  // 历史类
  丝绸之路: '历史类',
  延安: '历史类',
}

/** 直接可用的主题分类（交通类只有 1 题，并入科技类，避免出现只有一个题的分类） */
const DIRECT = new Set(['文化类', '社会类', '科技类', '教育类', '环境类', '经济类', '历史类'])

/** 原数据里出现但需要并入别的分类的 */
const MERGE = { 交通类: '科技类' }

/** 专项前缀 → 分类名 */
const SPECIAL = [
  ['基础句型', '基础句型专项'],
  ['难点句型', '难点句型专项'],
  ['高级句型', '高级句型专项'],
  ['写作衔接专项', '写作衔接专项'],
]

/**
 * 「YYYY年M月真题话题」这类 tag 里**没有主题**（主题只写在题干里），没法从 source 推出，
 * 只能按题号指定。下面每一条都逐题看过题干，不是猜的。
 */
const BY_ID = {
  'tr-009': '文化类', // 2021年6月 铁观音（中国茶）
  'tr-010': '文化类', // 2022年6月 筷子
  'tr-011': '文化类', // 2020年9月 茅台（白酒）
  'tr-012': '社会类', // 2023年3月 乡村旅游
  'tr-017': '历史类', // 2021年12月 延安（中国革命圣地）
  'tr-018': '文化类', // 2022年9月 太极拳
  'tr-019': '文化类', // 2020年12月 北京故宫
  'tr-020': '科技类', // 2023年6月 中国高铁网络
  'tr-021': '文化类', // 2022年12月 敦煌莫高窟
  'tr-022': '文化类', // 2021年6月 海南岛
  'tr-023': '文化类', // 2023年12月 中国传统绘画（国画）
  'tr-024': '文化类', // 2020年7月 《红楼梦》
}

/** 从 source 里取出 `·` 后面的标签 */
function tagOf(source) {
  const s = (source ?? '').trim()
  const i = s.lastIndexOf('·')
  return i >= 0 ? s.slice(i + 1).trim() : s
}

/** 取标签里的「主题」：有括号取括号内，否则去掉年份前后缀 */
function topicOf(tag) {
  const m = tag.match(/^(.+?)（(.+?)）$/)
  if (m) return m[2].trim()
  return tag.replace(/^\d{4}年(\d{1,2}月)?/, '').replace(/真题话题$/, '').trim()
}

export function classify(source) {
  const tag = tagOf(source)

  for (const [prefix, name] of SPECIAL) {
    if (tag.startsWith(prefix)) return name
  }
  if (MERGE[tag]) return MERGE[tag]
  if (DIRECT.has(tag)) return tag

  const topic = topicOf(tag)
  if (MERGE[topic]) return MERGE[topic]
  if (DIRECT.has(topic)) return topic
  if (TOPIC_TO_CATEGORY[topic]) return TOPIC_TO_CATEGORY[topic]

  return null
}

/* 直接跑脚本时：落盘 */
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (isMain) {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'))
  const items = Array.isArray(raw) ? raw : raw.list ?? raw.data ?? []
  const missed = []
  const counts = new Map()

  for (const q of items) {
    const c = BY_ID[q.id] ?? classify(q.source)
    if (c) {
      q.category = c
      counts.set(c, (counts.get(c) ?? 0) + 1)
    } else {
      missed.push(`${q.id} / ${q.source}`)
    }
  }

  if (missed.length) {
    console.error('❌ 有题目没能分类，请补 TOPIC_TO_CATEGORY：')
    missed.forEach((m) => console.error('   ' + m))
    process.exit(1)
  }

  const out = JSON.stringify(raw, null, 2) + '\n'
  for (const d of DEST) {
    fs.mkdirSync(path.dirname(d), { recursive: true })
    fs.writeFileSync(d, out, 'utf8')
    console.log('已写入 ' + path.relative(ROOT, d))
  }

  console.log('\n分类分布：')
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v} 题`)
  }
  console.log(`  合计 ${items.length} 题`)
}
