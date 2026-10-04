/**
 * 桌面版静态服务器的测试（纯 Node，不需要 Electron 图形环境）。
 *
 *   node test-server.cjs
 *
 * 验证打包后最容易坏的四件事：
 *   1. index.html 能加载，且里面引用的所有资源（相对路径）都能取到；
 *   2. MIME 类型正确（否则 Chromium 会拒绝执行 module script）；
 *   3. /api/* 在后端未启动时返回 503，前端可据此降级为本地模式；
 *   4. 目录穿越被挡掉。
 */
const http = require('node:http')
const path = require('node:path')
const { createStaticServer } = require('./server.cjs')

const DIST = path.join(__dirname, 'dist')

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log('  ✓', name)
  } else {
    fail++
    console.log('  ✗', name, extra)
  }
}

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.setTimeout(8000, () => req.destroy(new Error('timeout')))
  })
}

async function main() {
  const server = createStaticServer({ distDir: DIST })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  console.log(`静态服务器已启动：http://127.0.0.1:${port}\n`)

  console.log('════ 1. 首页与资源 ════')
  const home = await get(port, '/')
  check('GET / → 200', home.status === 200, `got ${home.status}`)
  check('返回的是应用 HTML', home.body.includes('id="app"'), home.body.slice(0, 80))
  check('Content-Type 是 html+utf8', /text\/html/.test(home.headers['content-type'] || ''))

  const refs = [...home.body.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^https?:|^data:|^#/.test(u))
  check('index.html 里引用了资源', refs.length > 0, JSON.stringify(refs))
  check(
    '资源用的是相对路径（file:// 与 http 都能用）',
    refs.every((u) => u.startsWith('./') || u.startsWith('/') === false),
    JSON.stringify(refs),
  )

  for (const ref of refs) {
    const urlPath = ref.startsWith('./') ? '/' + ref.slice(2) : ref
    const r = await get(port, urlPath)
    const ct = r.headers['content-type'] || ''
    const okType = urlPath.endsWith('.js')
      ? /javascript/.test(ct)
      : urlPath.endsWith('.css')
        ? /text\/css/.test(ct)
        : true
    check(`资源可取 ${ref}`, r.status === 200 && okType, `status=${r.status} ct=${ct}`)
  }

  console.log('\n════ 2. 懒加载分包（hash 路由会按需拉取）════')
  for (const name of ['StudyView', 'TranslationView', 'PapersView', 'PaperDetailView']) {
    const r = await get(port, '/assets/')
    void r
    break
  }
  const fs = require('node:fs')
  const assetDir = path.join(DIST, 'assets')
  const jsFiles = fs.readdirSync(assetDir).filter((f) => f.endsWith('.js'))
  check(`assets 下有 ${jsFiles.length} 个 js 分包`, jsFiles.length > 5)
  const sample = jsFiles.find((f) => f.startsWith('TranslationView')) || jsFiles[0]
  const sampleRes = await get(port, `/assets/${sample}`)
  check(`分包 ${sample} 可访问且是 js`, sampleRes.status === 200 && /javascript/.test(sampleRes.headers['content-type'] || ''))

  console.log('\n════ 3. /api 降级 ════')
  const api = await get(port, '/api/user/profile')
  check('后端未启动时返回 503（前端据此走本地模式）', api.status === 503, `got ${api.status}`)
  check('503 带 JSON 说明', api.body.includes('本地模式'), api.body.slice(0, 80))

  console.log('\n════ 4. 目录穿越防护 ════')
  const trav = await get(port, '/%2e%2e/package.json')
  check('穿越请求被拒绝或退回首页（不泄露文件）', trav.status === 403 || trav.body.includes('id="app"'), `status=${trav.status}`)
  check('未泄露 package.json 内容', !trav.body.includes('"devDependencies"'))

  console.log('\n════ 5. SPA 兜底 ════')
  const spa = await get(port, '/some/deep/route')
  check('未知路径回退到 index.html', spa.status === 200 && spa.body.includes('id="app"'))

  server.close()
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('测试失败:', e)
  process.exit(1)
})
