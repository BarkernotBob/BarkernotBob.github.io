// Static file server for the book club tests: serves ../../quartz at the root.
//
// Replaces `python3 -m http.server`, whose listen backlog of 5 dropped
// connections (ERR_CONNECTION_RESET, or a page whose app.js never arrived)
// when many test browsers loaded the page at once.
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../../quartz')
const PORT = Number(process.argv[2] || 5178)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

http
  .createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!file.startsWith(ROOT)) return res.writeHead(403).end()
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    fs.readFile(file, (err, body) => {
      if (err) return res.writeHead(404).end('not found')
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
      res.end(body)
    })
  })
  .listen(PORT, '127.0.0.1', 511)
