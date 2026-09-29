/**
 * 极简静态资源服务 + /prod-api 代理（替代 vite preview）
 *
 * 用途：stepby-vue 未安装 node_modules（无法直接运行 vite preview）时，
 * 用 Node 原生 http 提供：
 *   - 静态资源：从 ../dist 读取（SPA fallback 到 index.html）
 *   - /prod-api、/dev-api、/stage-api 前缀：剥离后转发到后端 BASE
 *   - /ws：WebSocket 转发到后端（用于实时通知）
 *
 * 运行：node serve-preview.mjs [PORT] [DIST_DIR] [BACKEND_URL]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2] || 4173)
const DIST_DIR = path.resolve(__dirname, '..', process.argv[3] || 'dist')
const BACKEND = process.argv[4] || 'http://localhost:8080'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

function serveStatic(req, res, urlPath) {
  const filePath = path.join(DIST_DIR, decodeURIComponent(urlPath))
  // 路径穿越防护
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  const send = (fp) => {
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
      return send(path.join(fp, 'index.html'))
    }
    if (fs.existsSync(fp)) {
      const ext = path.extname(fp).toLowerCase()
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control':
          filePath.includes('assets') || filePath.includes('static')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache'
      })
      fs.createReadStream(fp).pipe(res)
      return
    }
    // SPA fallback
    const idx = path.join(DIST_DIR, 'index.html')
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] })
      fs.createReadStream(idx).pipe(res)
      return
    }
    res.writeHead(404)
    res.end('Not Found')
  }
  send(filePath)
}

function proxyHttp(req, res, urlPath) {
  const target = new URL(BACKEND)
  const fwdPath = urlPath.replace(/^\/(prod-api|dev-api|stage-api)/, '') || '/'
  const options = {
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: fwdPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
    method: req.method,
    headers: { ...req.headers, host: target.host }
  }
  const proto = target.protocol === 'https:' ? require('node:https') : http
  const pending = proto.request(options, (pres) => {
    res.writeHead(pres.statusCode || 502, pres.headers)
    pres.pipe(res)
  })
  pending.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('Proxy error: ' + e.message)
  })
  req.pipe(pending)
}

// 静态客户端连接错误静默处理，避免未捕获的 'error' 事件导致进程崩溃
const silenceSocket = (sock) => {
  sock.on('error', () => {})
}

const server = http.createServer((req, res) => {
  silenceSocket(req.socket)
  res.on('error', silenceSocket)
  req.on('error', silenceSocket)
  const urlPath = (req.url || '/').split('?')[0]
  if (
    urlPath.startsWith('/prod-api') ||
    urlPath.startsWith('/dev-api') ||
    urlPath.startsWith('/stage-api') ||
    urlPath.startsWith('/v3/api-docs')
  ) {
    return proxyHttp(req, res, urlPath)
  }
  serveStatic(req, res, urlPath === '/' ? '/index.html' : urlPath)
})

// 简易 WebSocket 中继：只转发字节流（适用于 stepby 通知 /ws）
// 若后端不可达或握手失败，直接关闭客户端连接并静默处理错误，不让进程崩溃。
server.on('upgrade', (req, socket, head) => {
  silenceSocket(socket)
  const target = new URL(BACKEND)
  const fwdPath = (req.url || '/').replace(/^\/(prod-api|dev-api|stage-api)/, '') || '/'
  const proto = target.protocol === 'https:' ? require('node:https') : http
  const options = {
    hostname: target.hostname,
    port: target.port || 80,
    path: fwdPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
    headers: { ...req.headers, host: target.host },
    method: 'GET'
  }
  const pending = proto.request(options)
  pending.on('error', () => socket.destroy())
  pending.on('upgrade', (res, remoteSocket, remoteHead) => {
    silenceSocket(remoteSocket)
    // 转发后端实际握手响应头（含 Sec-WebSocket-Accept），而非硬编码 101
    socket.write('HTTP/1.1 ' + (res.statusCode || 101) + ' ' + res.statusMessage + '\r\n')
    for (const [k, v] of Object.entries(res.headers)) {
      const val = Array.isArray(v) ? v.join(', ') : v
      if (/^sec-websocket/gi.test(k) || /^upgrade/gi.test(k) || /^connection/gi.test(k)) {
        socket.write(k + ': ' + val + '\r\n')
      }
    }
    socket.write('\r\n')
    if (remoteHead && remoteHead.length) socket.write(remoteHead)
    remoteSocket.pipe(socket).pipe(remoteSocket)
  })
  pending.end()
})

server.listen(PORT, () => {
  console.log(`serve-preview: ${PORT} (dist=${DIST_DIR}) -> backend ${BACKEND}`)
})
