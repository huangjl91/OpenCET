/**
 * 好词好句汇总的测试。
 *
 * 这一层的核心是**去重**：用户会把同一句在原文里、AI 讲解里各选一次，
 * 或者带着不同的首尾标点再选一次 —— 汇总里都不该出现两遍。
 * 另外就是脏数据的容错：localStorage 里的东西是不可信的。
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/favorites.test.mts
 */
import fs from 'node:fs'
import path from 'node:path'

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

/* ---------------- localStorage 桩 ---------------- */
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as unknown as Storage

const {
  addFavorite,
  listFavorites,
  removeFavorite,
  updateNote,
  clearFavorites,
  countFavorites,
  normalizeText,
  sourcesOf,
  filterFavorites,
  toMarkdown,
  MIN_LEN,
  MAX_LEN,
} = await import('../frontend/src/utils/favorites')

const KEY = 'opencet.favorites.v1'

function reset() {
  store.clear()
}

/* ---------------- 1. 收录与去重 ---------------- */
console.log('\n=== 1. 收录与去重 ===')
{
  reset()
  const r1 = addFavorite('Reading broadens our horizons.', '阅读方法')
  ok('首次收录成功', r1.added && r1.item.text === 'Reading broadens our horizons.')
  ok('记录了来源', r1.item.source === '阅读方法')
  ok('记录了时间', r1.item.createdAt > 0)
  ok('id 非空', r1.item.id.length > 0)
  ok('汇总里有一条', countFavorites() === 1)

  const r2 = addFavorite('Reading broadens our horizons.', '作文方法')
  ok('★ 同一句再收一次不重复', !r2.added && r2.reason === 'duplicate')
  ok('重复时返回的是已有那条', r2.item.source === '阅读方法')
  ok('汇总里仍是一条', countFavorites() === 1)

  // 大小写 / 空白 / 首尾标点都算同一句
  ok('忽略大小写', !addFavorite('reading BROADENS our horizons.', 'x').added)
  ok('忽略多余空白', !addFavorite('  Reading   broadens  our horizons.  ', 'x').added)
  ok('忽略首尾标点', !addFavorite('"Reading broadens our horizons."', 'x').added)

  const r3 = addFavorite('阅读开阔视野。', '阅读方法')
  ok('中文句子也能收', r3.added)
  ok('中文句子的首尾标点也算同一句', !addFavorite('阅读开阔视野', 'x').added)

  // 最新在前
  addFavorite('A second sentence here.', '翻译练习')
  const list = listFavorites()
  ok('最新的排在最前', list[0].text === 'A second sentence here.', list[0].text)
  ok('总条数正确', list.length === 3, String(list.length))
}

/* ---------------- 2. 长度与空值 ---------------- */
console.log('\n=== 2. 长度与空值 ===')
{
  reset()
  ok('空串不收', !addFavorite('', 'x').added && addFavorite('', 'x').reason === 'empty')
  ok('纯空格不收', !addFavorite('    ', 'x').added)
  ok('undefined 不炸', !addFavorite(undefined as never, 'x').added)
  ok('一个字符不收（多半是误选）', !addFavorite('a', 'x').added, `MIN_LEN=${MIN_LEN}`)
  ok('两个字符可以收', addFavorite('ok', 'x').added)

  reset()
  const long = 'x'.repeat(MAX_LEN + 1)
  const r = addFavorite(long, 'x')
  ok('超长不收', !r.added && r.reason === 'too-long', `MAX_LEN=${MAX_LEN}`)
  ok('刚好等于上限可以收', addFavorite('y'.repeat(MAX_LEN), 'x').added)
  ok('超长时汇总里没东西', countFavorites() === 1)
}

/* ---------------- 3. 删除 / 备注 / 清空 ---------------- */
console.log('\n=== 3. 删除 / 备注 / 清空 ===')
{
  reset()
  const a = addFavorite('First good sentence.', '阅读方法').item
  const b = addFavorite('Second good sentence.', '作文方法').item

  updateNote(a.id, '这个句式可以用在开头')
  ok('备注写进去了', listFavorites().find((x) => x.id === a.id)?.note === '这个句式可以用在开头')
  ok('改备注不影响别的条目', listFavorites().find((x) => x.id === b.id)?.note === '')

  removeFavorite(a.id)
  ok('删除生效', countFavorites() === 1)
  ok('删掉的是对的那条', listFavorites()[0].id === b.id)
  removeFavorite('不存在的 id')
  ok('删不存在的 id 不炸', countFavorites() === 1)

  clearFavorites()
  ok('清空生效', countFavorites() === 0)
  ok('清空后列表为空数组', listFavorites().length === 0)
}

/* ---------------- 4. 归一化函数 ---------------- */
console.log('\n=== 4. normalizeText ===')
{
  ok('小写化', normalizeText('ABC') === 'abc')
  ok('压缩空白', normalizeText('a   b\t c') === 'a b c')
  ok('去首尾标点', normalizeText('"Hello."') === 'hello')
  ok('去首尾空格', normalizeText('  hi  ') === 'hi')
  ok('空串', normalizeText('') === '')
  ok('undefined 不炸', normalizeText(undefined as never) === '')
  ok('两种写法归一后相等', normalizeText('"Reading broadens our horizons."') === normalizeText('reading  broadens our horizons'))
}

/* ---------------- 5. 来源统计与筛选 ---------------- */
console.log('\n=== 5. 来源统计与筛选 ===')
{
  reset()
  addFavorite('One from reading.', '阅读方法')
  addFavorite('Two from reading.', '阅读方法')
  addFavorite('One from writing.', '作文方法')
  addFavorite('No source here.', '')
  const list = listFavorites()

  const src = sourcesOf(list)
  ok('统计出全部来源', src.length === 3, src.map((s) => s.name).join('/'))
  ok('按条数降序', src[0].name === '阅读方法' && src[0].count === 2)
  ok('空来源归到「未标注」', src.some((s) => s.name === '未标注'))

  ok('按来源筛选', filterFavorites(list, '', '阅读方法').length === 2)
  ok('按关键词筛选', filterFavorites(list, 'writing', '').length === 1)
  ok('关键词忽略大小写', filterFavorites(list, 'WRITING', '').length === 1)
  ok('关键词能搜到备注', (() => {
    updateNote(list[0].id, '记得背这个')
    return filterFavorites(listFavorites(), '记得背', '').length === 1
  })())
  ok('两个条件叠加', filterFavorites(list, 'reading', '阅读方法').length === 2)
  ok('没匹配返回空', filterFavorites(list, 'zzz', '').length === 0)
  ok('空列表不炸', sourcesOf([]).length === 0 && filterFavorites([], 'x', 'y').length === 0)
}

/* ---------------- 6. 导出 Markdown ---------------- */
console.log('\n=== 6. 导出 Markdown ===')
{
  reset()
  ok('空汇总导出空串', toMarkdown([]) === '')

  addFavorite('Reading broadens our horizons.', '阅读方法')
  const b = addFavorite('Practice makes perfect.', '阅读方法').item
  updateNote(b.id, '背下来')

  const md = toMarkdown(listFavorites())
  ok('有标题', md.startsWith('# 好词好句汇总'))
  ok('按来源分组', md.includes('## 阅读方法'))
  ok('句子带列表符', md.includes('- Reading broadens our horizons.'))
  ok('备注也导出', md.includes('备注：背下来'))
}

/* ---------------- 7. 脏数据容错 ---------------- */
console.log('\n=== 7. localStorage 脏数据 ===')
{
  reset()
  store.set(KEY, '不是 JSON')
  ok('坏 JSON → 返回空数组', listFavorites().length === 0)
  ok('坏 JSON 后还能正常收录', addFavorite('After bad json.', 'x').added)

  reset()
  store.set(KEY, JSON.stringify({ not: 'an array' }))
  ok('不是数组 → 返回空数组', listFavorites().length === 0)

  reset()
  store.set(
    KEY,
    JSON.stringify([
      { text: 'Good one.', source: '阅读方法' }, // 缺 id / createdAt / note
      { text: '', source: 'x' }, // 空文本
      { source: 'y' }, // 缺 text
      null,
      '字符串',
    ])
  )
  const list = listFavorites()
  ok('只保留有文本的条目', list.length === 1, String(list.length))
  ok('缺 id 时补一个', !!list[0].id)
  ok('缺 createdAt 时补当前时间', list[0].createdAt > 0)
  ok('缺 note 时补空串', list[0].note === '')
  ok('缺 source 时补空串', list[0].source === '阅读方法')
}

/* ---------------- 8. 界面接线 ---------------- */
console.log('\n=== 8. 界面接线 ===')
{
  const root = process.cwd()
  const read = (p: string) => fs.readFileSync(path.resolve(root, p), 'utf8')

  const router = read('frontend/src/router/index.ts')
  ok('路由里有 /favorites', router.includes("path: '/favorites'"))
  ok('导航会自动带上它（不在 hide 列表）', !/favorites[^}]*hide/.test(router))

  const app = read('frontend/src/App.vue')
  ok('App 里挂了收录按钮（全局生效）', app.includes("import CollectButton from '@/components/CollectButton.vue'") && app.includes('<CollectButton />'))

  const btn = read('frontend/src/components/CollectButton.vue')
  ok('监听选区变化', btn.includes("addEventListener('selectionchange'"))
  ok('监听鼠标抬起', btn.includes("addEventListener('mouseup'"))
  ok('★ 按钮阻止默认的 mousedown（否则点它选区就没了）', btn.includes('@mousedown.prevent'))
  ok('排除输入框里的选区', btn.includes('input, textarea'))
  ok('选区太短/太长不显示', btn.includes('text.length < 2') && btn.includes('MAX_LEN'))
  ok('收录后取消选区并收起', btn.includes('removeAllRanges'))
  ok('滚动/缩放时收起', btn.includes("addEventListener('scroll', hide") && btn.includes("addEventListener('resize', hide"))
  ok('来源取当前路由标题', btn.includes('route.meta?.title'))
  ok('重复收录有提示', btn.includes('已经在汇总里了'))
  ok('卸载时移除监听', btn.includes('removeEventListener'))

  const view = read('frontend/src/views/FavoritesView.vue')
  ok('汇总页能搜索', view.includes('v-model="keyword"'))
  ok('汇总页能按来源筛选', view.includes('v-model="sourceFilter"'))
  ok('汇总页能删除单条', view.includes('removeFavorite'))
  ok('汇总页能写备注', view.includes('updateNote'))
  ok('汇总页能手动添加', view.includes('addManual'))
  ok('汇总页能导出 Markdown', view.includes('exportMarkdown') && view.includes('toMarkdown'))
  ok('汇总页能复制', view.includes('clipboard.writeText'))
  ok('汇总页有清空但带确认', view.includes('doClear'))

  const css = read('frontend/src/styles/main.css')
  ok('浮出按钮有样式', css.includes('.collect-btn'))
  ok('提示条有样式', css.includes('.collect-toast'))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`好词好句测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
