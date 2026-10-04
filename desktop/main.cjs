/**
 * OpenCET 桌面版主进程。
 *
 * 为什么不用 `loadFile()` 直接以 file:// 打开：
 *   - 本项目在「本地模式」下把所有学习数据存在 localStorage，
 *     而 Chromium 对 file:// 这种不透明来源的存储行为并不稳定；
 *   - 以 http://127.0.0.1:<随机端口> 提供页面，来源语义和网页版完全一致，
 *     localStorage / fetch 的行为都可预期。
 *
 * 静态服务器会把 /api/* 透传到 127.0.0.1:8080：
 *   后端起着就用后端（数据跨设备），没起就返回 503，前端自动降级为本地模式，
 *   两种情况下应用都能正常用。
 */
/**
 * 环境自愈：有些工具链会在环境里留下 `ELECTRON_RUN_AS_NODE=1`
 * （VS Code / Cursor 的集成终端、部分 Node 安装器都会设），
 * 设了它 Electron 就退化成纯 Node —— `require('electron')` 只剩一个二进制路径字符串，
 * 应用会在 `app.requestSingleInstanceLock` 处直接崩掉。
 *
 * 这里清掉该变量并用干净的进程重启自己，保证双击、命令行、IDE 终端里都能正常启动。
 * （CommonJS 模块顶层允许 return，所以这样写是安全的。）
 */
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE
  const { spawn } = require('node:child_process')
  const child = spawn(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: process.env,
    windowsHide: false,
  })
  child.on('exit', (code) => process.exit(code ?? 0))
  return
}

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { createStaticServer } = require('./server.cjs')

const DIST = path.join(__dirname, 'dist')

function buildMenu(win) {
  const template = [
    {
      label: '应用',
      submenu: [
        {
          label: '关于 OpenCET',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于 OpenCET',
              message: 'OpenCET · 英语四六级在线学习平台',
              detail: `桌面版 ${app.getVersion()}\n\n每日打卡背单词 · 句子翻译练习 · 真题拆解 · AI 问答`,
              buttons: ['好'],
            }),
        },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '重置缩放', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

let server = null
let win = null

/* ---------------- 窗口尺寸记忆 ----------------
 * 默认按「和 DSH 主界面一样大」开窗（实测那个窗口是 1292×826，没有最大化），
 * 之后记住用户自己的调整（最大化状态 + 还原后的位置尺寸），下次打开还是那样。 */
function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'))
    return s && typeof s === 'object' ? s : null
  } catch {
    return null
  }
}

function saveWindowState(w) {
  if (!w || w.isDestroyed()) return
  try {
    const b = w.getNormalBounds()
    fs.writeFileSync(
      windowStateFile(),
      JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: w.isMaximized() })
    )
  } catch {
    /* 记不住就算了，不影响使用 */
  }
}

/** 默认窗口尺寸（约等于 DSH 主界面的 1292×826） */
const DEFAULT_SIZE = { width: 1292, height: 826 }

/* ------------------------------ 稳定的本地端口 ------------------------------
 * 这里**绝对不能**用 listen(0) 拿随机端口。
 *
 * localStorage 是**按 origin 隔离**的，而 origin 里带端口号：
 *     http://127.0.0.1:53027  ≠  http://127.0.0.1:58922
 * 对浏览器来说这是两个毫不相干的站点。之前用随机端口，等于每次启动都换一个
 * 「新网站」，用户昨天背的单词今天就「消失」了——数据其实还在，只是换了个域读不到。
 *
 * 首选端口就是历史数据所在的那个，升级后旧数据能直接被读到；万一被占用再依次退让。
 */
const PREFERRED_PORTS = [53027, 47820, 47821, 47822]

function listenStable(server, onReady) {
  let i = 0
  const tryNext = () => {
    if (i >= PREFERRED_PORTS.length) {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port
        console.warn(`[server] 首选端口全被占用，退回随机端口 ${port}（origin 变了，将尝试自动迁移数据）`)
        onReady(port)
      })
      return
    }
    const port = PREFERRED_PORTS[i++]
    const onError = (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[server] 端口 ${port} 被占用，试下一个`)
        server.removeListener('listening', onListening)
        tryNext()
      } else {
        console.error('[server] 监听失败:', err.message)
      }
    }
    const onListening = () => {
      server.removeListener('error', onError)
      console.log(`[server] http://127.0.0.1:${port}（origin 固定，localStorage 不会漂移）`)
      onReady(port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  }
  tryNext()
}

/* --------------------------- 换端口时的本地库迁移 ---------------------------
 * 万一首选端口全被占用、origin 还是变了，就读 Chromium 的 LevelDB 文件，
 * 找出历史上「进度记录最多」的那份 opencet.db.v1 搬到当前 origin，
 * 保证用户的数据不会因为一次端口变化而看起来丢失。
 */
function decodeDbRecord(buf) {
  for (const enc of ['utf16le', 'utf8', 'latin1']) {
    for (let off = 0; off < 8; off++) {
      let text
      try {
        text = buf.subarray(off).toString(enc)
      } catch {
        continue
      }
      const s = text.indexOf('{')
      if (s < 0) continue
      let depth = 0
      let inStr = false
      let esc = false
      let end = -1
      for (let i = s; i < text.length; i++) {
        const ch = text[i]
        if (esc) { esc = false; continue }
        if (ch === '\\') { esc = true; continue }
        if (ch === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break } }
      }
      if (end < 0) continue
      try {
        const obj = JSON.parse(text.slice(s, end))
        if (obj && typeof obj === 'object' && obj.progress) return obj
      } catch {
        /* 换下一种编码 */
      }
    }
  }
  return null
}

function scanLegacyDb() {
  const dir = path.join(app.getPath('userData'), 'Local Storage', 'leveldb')
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.log') || f.endsWith('.ldb'))
  } catch {
    return null
  }
  const KEY = Buffer.from('opencet.db.v1', 'ascii')
  let best = null
  for (const f of files) {
    let raw
    try {
      raw = fs.readFileSync(path.join(dir, f))
    } catch {
      continue
    }
    let from = 0
    for (;;) {
      const at = raw.indexOf(KEY, from)
      if (at < 0) break
      from = at + 1
      const obj = decodeDbRecord(raw.subarray(at + KEY.length, at + KEY.length + 400000))
      if (!obj) continue
      const n = Object.keys(obj.progress || {}).length
      if (!best || n > best.count) best = { count: n, data: obj }
    }
  }
  return best
}

async function seedFromLegacy(win) {
  if (!win || win.isDestroyed()) return
  let best
  try {
    best = scanLegacyDb()
  } catch {
    return
  }
  if (!best || best.count === 0) return
  try {
    const cur = await win.webContents.executeJavaScript(`(() => {
      try { return Object.keys((JSON.parse(localStorage.getItem('opencet.db.v1') || '{}')).progress || {}).length }
      catch { return 0 }
    })()`)
    if (cur >= best.count) return // 当前 origin 的数据没更少，什么都不做
    const payload = JSON.stringify(JSON.stringify(best.data))
    await win.webContents.executeJavaScript(`localStorage.setItem('opencet.db.v1', ${payload}); true`)
    console.log(`[migrate] 本地库已从旧 origin 迁移：${cur} → ${best.count} 条进度记录，刷新页面生效`)
    win.webContents.reload()
  } catch (e) {
    console.error('[migrate] 迁移失败:', e.message)
  }
}

function createWindow(port) {
  const st = loadWindowState()
  win = new BrowserWindow({
    width: st?.width ?? DEFAULT_SIZE.width,
    height: st?.height ?? DEFAULT_SIZE.height,
    x: st?.x,
    y: st?.y,
    minWidth: 960,
    minHeight: 640,
    title: 'OpenCET · 四六级在线学习',
    backgroundColor: '#0b1220',
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  win.once('ready-to-show', () => {
    win.show()
    // 只有用户自己最大化过才最大化；默认就是上面那个小窗口，不铺满屏幕
    if (st && st.maximized) win.maximize()
  })
  win.on('close', () => saveWindowState(win))

  // 外链走系统浏览器，不在应用里弹新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  buildMenu(win)
  // OPENCET_ROUTE 可指定启动时打开的页面（如 /translation），用于截图/联调
  const route = process.env.OPENCET_ROUTE || ''
  win.loadURL(`http://127.0.0.1:${port}/#${route}`)

  // 端口变过的话，把旧 origin 的本地库搬过来。正常情况下（端口固定）不会触发；
  // 刷新后当前 origin 已有数据，cur >= best.count 直接返回，不会死循环。
  win.webContents.once('did-finish-load', () => seedFromLegacy(win))

  // 无头自检：OPENCET_SMOKE=1 启动时，等页面加载完探测几项关键能力再退出。
  // 用来验证打包产物「页面能加载、Vue 挂载成功、localStorage 可读写」——
  // 本地模式的学习数据全靠 localStorage，这条必须实测过。
  if (process.env.OPENCET_SMOKE) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const probe = await win.webContents.executeJavaScript(`(async () => {
            const out = {}
            out.title = document.title
            out.origin = location.origin
            out.hash = location.hash
            out.innerWidth = window.innerWidth
            out.innerHeight = window.innerHeight
            out.devicePixelRatio = window.devicePixelRatio
            out.bodyFont = getComputedStyle(document.body).fontSize
            out.navLinkFont = (() => { const el = document.querySelector('.nav-link'); return el ? getComputedStyle(el).fontSize : null })()
            out.grid4Cols = (() => {
              const el = document.querySelector('.grid-4')
              return el ? getComputedStyle(el).gridTemplateColumns : null
            })()
            out.appMainWidth = (() => { const el = document.querySelector('.app-main'); return el ? Math.round(el.getBoundingClientRect().width) : null })()
            out.zoom = window.outerWidth ? +(window.outerWidth / window.innerWidth).toFixed(3) : null
            try {
              localStorage.setItem('__smoke__', 'ok')
              out.localStorage = localStorage.getItem('__smoke__') === 'ok'
              localStorage.removeItem('__smoke__')
            } catch (e) { out.localStorage = 'ERROR: ' + e.message }
            const appEl = document.querySelector('#app')
            out.mounted = !!(appEl && appEl.children.length)
            out.hasError = !!document.querySelector('.error, #error-overlay')
            // 点击顶栏的 AI 入口，验证右侧抽屉能打开
            const aiBtn = [...document.querySelectorAll('.nav-right button')].find((b) => (b.textContent || '').includes('AI'))
            if (aiBtn) {
              aiBtn.click()
              await new Promise((r) => setTimeout(r, 500))
              out.aiDrawerOpen = !!document.querySelector('.ai-drawer.is-open')
              out.aiPanelMounted = !!document.querySelector('.ai-panel')
              out.aiScrim = !!document.querySelector('.ai-scrim')
            } else {
              out.aiDrawerOpen = 'button not found'
            }
            return out
          })()`)
          console.log('[SMOKE] ' + JSON.stringify(probe))
        } catch (e) {
          console.error('[SMOKE] 探测失败: ' + e.message)
        } finally {
          // OPENCET_KEEP=1 时保留窗口，便于截图查看状态
          if (!process.env.OPENCET_KEEP) app.exit(0)
        }
      }, 2500)
    })
  }
}

// 单实例：重复启动时聚焦已有窗口，避免两个实例同时写 localStorage
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  // 无图形环境自检：OPENCET_SELFTEST=1 时不开窗口，只验证「模块能加载、静态服务器能起、
  // 构建产物在包里、/api 能正确降级」，然后退出。用于在 CI / 受限环境里检查打包产物。
  if (process.env.OPENCET_SELFTEST) {
    const http = require('node:http')
    app.whenReady().then(async () => {
      const results = {}
      let server = null
      try {
        results.electron = process.versions.electron
        results.distExists = fs.existsSync(path.join(DIST, 'index.html'))
        results.asar = __dirname.includes('app.asar')
        server = createStaticServer({ distDir: DIST })
        await new Promise((r) => server.listen(0, '127.0.0.1', r))
        const port = server.address().port
        const get = (p) =>
          new Promise((resolve, reject) => {
            http
              .get({ host: '127.0.0.1', port, path: p }, (res) => {
                let b = ''
                res.setEncoding('utf8')
                res.on('data', (c) => (b += c))
                res.on('end', () => resolve({ status: res.statusCode, body: b }))
              })
              .on('error', reject)
          })
        const home = await get('/')
        results.homeStatus = home.status
        results.appMountedHtml = home.body.includes('id="app"')
        const jsRef = (home.body.match(/src="([^"]+\.js)"/) || [])[1]
        results.assetRef = jsRef || null
        if (jsRef) {
          const asset = await get('/' + jsRef.replace(/^\.\//, ''))
          results.assetStatus = asset.status
        }
        results.apiStatus = (await get('/api/user/profile')).status
      } catch (e) {
        results.error = e.message
      } finally {
        if (server) server.close()
        console.log('[SELFTEST] ' + JSON.stringify(results))
        app.exit(0)
      }
    })
    return
  }

  app.whenReady().then(() => {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      dialog.showErrorBox('资源缺失', `找不到前端构建产物：\n${path.join(DIST, 'index.html')}\n\n请先在 frontend 目录执行 npm run build。`)
      app.quit()
      return
    }
    server = createStaticServer({ distDir: DIST })
    listenStable(server, (port) => createWindow(port))
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && server) createWindow(server.address().port)
  })

  app.on('before-quit', () => {
    if (server) server.close()
  })
}
