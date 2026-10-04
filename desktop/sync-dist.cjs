/**
 * 把 frontend/dist 同步到 desktop/dist。
 *
 * 不直接引用 ../frontend/dist 是因为 electron-builder 的 files 只接受
 * 应用目录内的路径；拷一份进来最简单，也避免把 node_modules 之类卷进打包。
 */
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.resolve(__dirname, '..', 'frontend', 'dist')
const DST = path.resolve(__dirname, 'dist')

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error(`找不到前端构建产物：${SRC}\\index.html`)
  console.error('请先执行：cd frontend && npm run build')
  process.exit(1)
}

fs.rmSync(DST, { recursive: true, force: true })
fs.cpSync(SRC, DST, { recursive: true })

// 顺带把图标放进 dist，方便打包后仍能找到（虽然打包时图标由 build/icon.ico 提供）
let files = 0
let bytes = 0
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else {
      files++
      bytes += fs.statSync(p).size
    }
  }
}
walk(DST)
console.log(`已同步前端产物 → ${DST}`)
console.log(`  文件 ${files} 个 / ${(bytes / 1024 / 1024).toFixed(2)} MB`)
