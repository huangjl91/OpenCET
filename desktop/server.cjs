/**
 * 桌面版的静态资源服务器（**不依赖 Electron**）。
 *
 * 抽成独立模块的原因：Electron 的 GUI 在某些受限环境里起不来，
 * 但「页面能不能正确加载、资源路径对不对、/api 是否正确降级」这些是打包后
 * 最容易坏的地方。抽出来后可以用纯 Node 跑完整测试（见 test-server.cjs），
 * 不必依赖图形环境。
 */
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
}

/**
 * @param {object} opts
 * @param {string} opts.distDir 前端构建产物目录
 * @param {{host:string, port:number}} [opts.backend] /api 透传目标
 * @returns {import('node:http').Server}
 */
function createStaticServer({ distDir, backend = { host: '127.0.0.1', port: 8080 } }) {
  /** 把 /api 的请求转给本地后端；后端没起就返回 503，前端会自动降级为本地模式 */
  function proxyApi(req, res) {
    const proxied = http.request(
      {
        host: backend.host,
        port: backend.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${backend.host}:${backend.port}` },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode || 502, upstream.headers)
        upstream.pipe(res)
      }
    )
    proxied.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end('{"code":503,"message":"后端未启动，前端将使用本地模式"}')
    })
    req.pipe(proxied)
  }

  return http.createServer((req, res) => {
    if (req.url && req.url.startsWith('/api/')) return proxyApi(req, res)

    let pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0])
    if (pathname === '/' || pathname === '') pathname = '/index.html'

    // 防目录穿越：解析后必须仍在 distDir 内
    const filePath = path.normalize(path.join(distDir, pathname))
    if (!filePath.startsWith(path.normalize(distDir))) {
      res.writeHead(403)
      return res.end('Forbidden')
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA 兜底：找不到就当路由处理回 index.html（本项目用 hash 路由，正常不会走到）
        fs.readFile(path.join(distDir, 'index.html'), (e2, html) => {
          if (e2) {
            res.writeHead(404)
            return res.end('Not Found')
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] })
          res.end(html)
        })
        return
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      })
      res.end(data)
    })
  })
}

module.exports = { createStaticServer, MIME }
