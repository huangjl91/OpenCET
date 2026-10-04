/**
 * 模型设置的测试：厂商预设 + 模型下拉 + 拉取模型列表。
 *
 * 重点：
 *   1. **预设地址不能写错**（写成 http、带 /chat/completions、重复 id）——
 *      地址错一个字符，用户点了保存就是连不上，而且很难自己查出来
 *   2. **下拉选项不能吃掉用户手填的模型名** —— 换厂商后旧模型名要能看见，
 *      否则会被静默改掉，用户以为设置没生效
 *   3. **拉取列表要能兼容各种返回结构**，并且失败时给出可读的原因
 *
 * 运行： npx tsx --tsconfig frontend/tsconfig.json tools/aiProviders.test.mts
 */
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

const { AI_PROVIDERS, providerOf, providerNameOf, normalizeBaseUrl, modelOptions } = await import(
  '../frontend/src/utils/aiProviders'
)

/* ---------------- 1. 厂商预设 ---------------- */
console.log('\n=== 1. 厂商预设 ===')
{
  ok('厂商够多（≥ 15 家）', AI_PROVIDERS.length >= 15, String(AI_PROVIDERS.length))

  const ids = AI_PROVIDERS.map((p) => p.id)
  ok('id 不重复', new Set(ids).size === ids.length, ids.join(','))

  const names = AI_PROVIDERS.map((p) => p.name)
  ok('名字不重复', new Set(names).size === names.length)

  const urls = AI_PROVIDERS.filter((p) => p.baseUrl).map((p) => normalizeBaseUrl(p.baseUrl).toLowerCase())
  ok('地址不重复', new Set(urls).size === urls.length, urls.join(' '))

  // 地址必须能拼出 /chat/completions
  const bad = AI_PROVIDERS.filter((p) => p.baseUrl).filter((p) => {
    const u = normalizeBaseUrl(p.baseUrl)
    if (!/^https?:\/\//.test(u)) return true
    if (/\/chat\/completions$/.test(u)) return true // 多写了后缀，拼起来会变成 .../chat/completions/chat/completions
    if (u.includes('/v1/v1')) return true
    return false
  })
  ok(
    '地址都是合法 http(s) 且不带 /chat/completions 后缀',
    bad.length === 0,
    bad.map((p) => `${p.name}: ${p.baseUrl}`).join(' ;; '),
  )

  ok(
    '只有自定义那家允许地址为空',
    AI_PROVIDERS.filter((p) => !p.baseUrl).every((p) => p.id === 'custom'),
  )
  ok(
    '非自定义厂商都给了默认模型',
    AI_PROVIDERS.filter((p) => p.id !== 'custom').every((p) => p.models.length > 0),
    AI_PROVIDERS.filter((p) => p.id !== 'custom' && !p.models.length).map((p) => p.name).join(' '),
  )
  ok(
    '本地部署用 localhost，其余用 https',
    AI_PROVIDERS.every((p) => !p.baseUrl || (p.local ? /^http:\/\/localhost/.test(p.baseUrl) : p.baseUrl.startsWith('https://'))),
  )
  ok('常见服务商都在列表里', ['deepseek', 'dashscope', 'zhipu', 'moonshot', 'openai', 'ollama', 'custom'].every((id) => ids.includes(id)))
}

/* ---------------- 2. 地址反查厂商 ---------------- */
console.log('\n=== 2. 地址反查 ===')
{
  ok('规范化去掉结尾斜杠', normalizeBaseUrl('https://api.deepseek.com///') === 'https://api.deepseek.com')
  ok('规范化去空格', normalizeBaseUrl('  https://a.b/v1  ') === 'https://a.b/v1')

  ok('能反查到 DeepSeek', providerOf('https://api.deepseek.com')?.id === 'deepseek')
  ok('结尾斜杠也能反查', providerOf('https://api.deepseek.com/')?.id === 'deepseek')
  ok('大小写不敏感', providerOf('HTTPS://API.DEEPSEEK.COM')?.id === 'deepseek')
  ok('没见过的地址 → undefined（界面显示「自定义」）', providerOf('https://my-own-llm.internal/v1') === undefined)
  ok('空地址 → undefined', providerOf('') === undefined)

  ok('显示名：认得的厂商', providerNameOf('https://api.moonshot.cn/v1').includes('Kimi'))
  ok('显示名：陌生的地址叫「自定义」', providerNameOf('https://x.y/v1') === '自定义')
  ok('显示名：空地址提示未选择', providerNameOf('') === '未选择')
}

/* ---------------- 3. 模型下拉选项 ---------------- */
console.log('\n=== 3. 模型下拉 ===')
{
  const ds = AI_PROVIDERS.find((p) => p.id === 'deepseek')!

  ok('预设模型都在选项里', ds.models.every((m) => modelOptions(ds, [], 'x').includes(m)))
  ok('当前模型不在预设里也要出现（否则会被静默改掉）', modelOptions(ds, [], 'my-old-model').includes('my-old-model'))
  ok('拉取到的模型并进选项', modelOptions(ds, ['deepseek-reasoner'], 'x').includes('deepseek-reasoner'))
  ok('不重复', (() => {
    const list = modelOptions(ds, ['deepseek-flash', 'deepseek-flash'], 'deepseek-flash')
    return new Set(list).size === list.length
  })(), JSON.stringify(modelOptions(ds, ['deepseek-flash', 'deepseek-flash'], 'deepseek-flash')))
  ok('预设排在拉取结果前面', (() => {
    const list = modelOptions(ds, ['zzz-fetched'], 'x')
    return list.indexOf(ds.models[0]) < list.indexOf('zzz-fetched')
  })())
  ok('没有厂商时也能给出手填的模型', modelOptions(undefined, [], 'hand-typed').join() === 'hand-typed')
  ok('空字符串不进选项', modelOptions(ds, ['', '  '], '').every((m) => m.trim().length > 0))
  ok('自定义厂商没有预设模型', modelOptions(AI_PROVIDERS.find((p) => p.id === 'custom'), [], '').length === 0)
}

/* ---------------- 4. 拉取模型列表 ---------------- */
console.log('\n=== 4. 拉取模型列表 ===')
{
  const { fetchModels } = await import('../frontend/src/utils/ai')
  const realFetch = globalThis.fetch
  const stub = (impl: (url: string, init?: RequestInit) => unknown) => {
    globalThis.fetch = ((url: string, init?: RequestInit) => Promise.resolve(impl(String(url), init))) as typeof fetch
  }

  // 标准 OpenAI 结构
  stub(() => ({
    ok: true,
    json: async () => ({ object: 'list', data: [{ id: 'b-model' }, { id: 'a-model' }] }),
  }))
  let got = await fetchModels('https://api.deepseek.com', 'k')
  ok('解析 data[].id 并排序', got.join(',') === 'a-model,b-model', got.join(','))

  // 别名结构 / 纯字符串数组
  stub(() => ({ ok: true, json: async () => ({ models: [{ name: 'x-1' }, 'y-2'] }) }))
  got = await fetchModels('https://x/v1', 'k')
  ok('兼容 models[] 与纯字符串数组', got.join(',') === 'x-1,y-2', got.join(','))

  // 校验请求本身
  let seenUrl = ''
  let seenAuth = ''
  stub((url, init) => {
    seenUrl = url
    seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '')
    return { ok: true, json: async () => ({ data: [{ id: 'm' }] }) }
  })
  await fetchModels('https://api.deepseek.com/', 'sk-test')
  ok('请求打到 {baseUrl}/models（去掉结尾斜杠）', seenUrl === 'https://api.deepseek.com/models', seenUrl)
  ok('带上了 Bearer Key', seenAuth === 'Bearer sk-test', seenAuth)

  // 没 Key 也要能拉（有些本地服务不要 Key）
  seenAuth = 'unset'
  stub((_u, init) => {
    seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '(none)')
    return { ok: true, json: async () => ({ data: [{ id: 'm' }] }) }
  })
  await fetchModels('http://localhost:11434/v1', '')
  ok('没有 Key 时不发 Authorization 头', seenAuth === '(none)', seenAuth)

  // 失败路径要有可读原因
  stub(() => ({ ok: false, status: 404, text: async () => 'not found' }))
  let err = ''
  try {
    await fetchModels('https://x/v1', 'k')
  } catch (e) {
    err = (e as Error).message
  }
  ok('404 时说明原因并提示手填', err.includes('404') && err.includes('手填'), err)

  stub(() => ({ ok: true, json: async () => ({ data: [] }) }))
  err = ''
  try {
    await fetchModels('https://x/v1', 'k')
  } catch (e) {
    err = (e as Error).message
  }
  ok('空列表也给出明确提示（而不是静默成功）', err.includes('空'), err)

  err = ''
  try {
    await fetchModels('   ', 'k')
  } catch (e) {
    err = (e as Error).message
  }
  ok('没填地址时直接报错', err.includes('Base URL'), err)

  stub(() => ({ ok: true, json: async () => ({}) }))
  err = ''
  try {
    await fetchModels('https://x/v1', 'k')
  } catch (e) {
    err = (e as Error).message
  }
  ok('返回结构认不出来也不炸', err.length > 0, err)

  globalThis.fetch = realFetch
}

/* ---------------- 5. 界面接线 ---------------- */
console.log('\n=== 5. 界面接线 ===')
{
  const fs = await import('node:fs')
  const path = await import('node:path')
  const view = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/components/AiPanel.vue'), 'utf8')
  ok('有厂商下拉', view.includes('v-model="providerId"') && view.includes('AI_PROVIDERS'))
  ok('模型是下拉（不是纯输入框）', view.includes('v-model="modelPick"') && view.includes('<select'))
  ok('下拉里有「自定义…」兜底', view.includes('MODEL_CUSTOM'))
  ok('有拉取列表按钮', view.includes('拉取列表') && view.includes('doFetchModels'))
  ok('地址随厂商自动填好并只读', view.includes(':readonly="!editableBaseUrl"'))
  ok('本地部署有 Key 说明', view.includes('随便填一个非空值'))
  ok('默认配置仍是 OpenAI 兼容形状', (await import('../frontend/src/utils/ai')).DEFAULT_AI_CONFIG.baseUrl.includes('/v1'))
}

console.log(`\n${'='.repeat(52)}`)
console.log(`模型设置测试：${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(52))
process.exit(fail === 0 ? 0 : 1)
