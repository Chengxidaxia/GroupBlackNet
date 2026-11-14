// mock-server.mjs — 本地假后端，用来端到端验证 `bn book publish`
// 复刻 book/api/publish.js 的关键语义：分片落盘 → 清单 → 索引合并。
//
// 用法：node tools/mock-server.mjs [port] [rootDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = +(process.argv[2] || 8793);
const root = process.argv[3] || path.join(process.env.TEMP || '/tmp', 'bnmock');
const booksDir = path.join(root, 'docs', 'books');
fs.mkdirSync(booksDir, { recursive: true });

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

const INDEX = path.join(booksDir, 'index.json');
if (!fs.existsSync(INDEX)) {
  fs.writeFileSync(INDEX, JSON.stringify({ format: 'bookblacknet.index', v: 1, books: [] }, null, 2));
}

const readIndex = () => {
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return { books: [] }; }
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

  // 静态：docs/books/*
  if (req.method === 'GET' && url.pathname.startsWith('/docs/')) {
    const f = path.join(root, decodeURIComponent(url.pathname));
    if (!fs.existsSync(f)) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    return res.end(fs.readFileSync(f));
  }

  if (req.method === 'POST' && url.pathname === '/api/publish') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad json' }); }
      const file = String(body.file || '');
      if (!/^bk_[\w-]{1,60}\.book$/.test(file)) return json(res, 400, { error: 'bad file name' });

      if (!body.final) {
        const seq = +body.seq, total = +body.total;
        const name = file + '.p' + String(seq).padStart(3, '0');
        fs.writeFileSync(path.join(booksDir, name), String(body.text || ''));
        log('part', seq + '/' + total, name, (body.text || '').length + 'B');
        return json(res, 200, { ok: true, seq, total, bytes: Buffer.byteLength(body.text || '') });
      }

      const total = +body.total || 1;
      const names = [];
      for (let i = 1; i <= total; i++) names.push(file + '.p' + String(i).padStart(3, '0'));
      const merged = names.map((n) => fs.readFileSync(path.join(booksDir, n), 'utf8')).join('');
      const entry = body.entry || {};
      if (entry.id !== file.replace(/\.book$/, '')) return json(res, 400, { error: 'entry.id 与文件名不一致' });
      fs.writeFileSync(path.join(booksDir, file),
        JSON.stringify({ format: 'bookblacknet.chunks', v: 1, parts: names, size: merged.length,
                         updatedAt: new Date().toISOString() }));
      const idx = readIndex();
      const list = (idx.books || []).filter((b) => b.id !== entry.id);
      list.unshift({ ...entry, file, chunks: total });
      fs.writeFileSync(INDEX, JSON.stringify({ format: 'bookblacknet.index', v: 1,
        updatedAt: new Date().toISOString(), books: list }, null, 2));
      log('final', entry.id, total + ' 片', '合并 ' + merged.length + 'B');
      return json(res, 200, { ok: true, mode: 'server', id: entry.id, file, parts: total });
    });
    return;
  }

  json(res, 404, { error: 'not found' });
}).listen(port, '127.0.0.1', () => console.log('mock 就绪：http://127.0.0.1:' + port + '  root=' + root));
