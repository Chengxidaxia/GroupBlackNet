#!/usr/bin/env node
// local-proxy.mjs — 本机通用代理（白名单），配合 localhttps + ChmlFrp 公网使用
//
// 用法：
//   node scripts/local-proxy.mjs            # 默认 127.0.0.1:8907
//   node scripts/local-proxy.mjs 8907
//
// 请求格式：http://127.0.0.1:8907/proxy/<host>/<path>?<query>
// 白名单：环境变量 PROXY_ALLOW（逗号分隔）或同目录 proxy-allow.txt（一行一个域，# 注释）
// 口令：环境变量 PROXY_TOKEN（可选；设置后需 ?token= 或 Bearer）
//
// 挂到公网：localhttps 里把 8907 加进反代/端口清单，ChmlFrp 出隧道即可。
//   例：https://<你的frp域名>/proxy/img.blacknet.cc.cd/pole.jpg

import http from 'node:http';

const PORT = Number(process.argv[2] || process.env.PROXY_PORT || 8907);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36';

async function loadAllow() {
  if (process.env.PROXY_ALLOW) return process.env.PROXY_ALLOW.split(',').map(s => s.trim()).filter(Boolean);
  try {
    const txt = await import('node:fs').then(fs => fs.readFileSync(new URL('./proxy-allow.txt', import.meta.url), 'utf8'));
    return txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch { return []; }
}

const allow = await loadAllow();
console.log(`[local-proxy] 白名单 ${allow.length} 个域: ${allow.join(', ')}`);
console.log(`[local-proxy] 监听 http://127.0.0.1:${PORT}  用法: /proxy/<host>/<path>`);

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/proxy\/(.+)$/);
  if (!m) { res.writeHead(404).end('usage: /proxy/<host>/<path>'); return; }
  const rest = m[1];
  const host = rest.split('/')[0];
  if (!allow.includes(host)) { res.writeHead(403).end('host not allowed: ' + host); return; }

  const token = process.env.PROXY_TOKEN || '';
  if (token) {
    const q = u.searchParams.get('token');
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (q !== token && auth !== token) { res.writeHead(401).end('token required'); return; }
  }

  const target = 'https://' + rest + u.search;
  try {
    const headers = { 'User-Agent': UA };
    if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    // 流式转发请求体（POST 大文件不落盘）
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      // Node 22 fetch 默认走全局 dispatcher；如需代理可设 HTTPS_PROXY
    });

    const h = {};
    for (const k of ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified']) {
      const v = r.headers.get(k); if (v) h[k] = v;
    }
    h['access-control-allow-origin'] = '*';
    res.writeHead(r.status, h);
    if (req.method === 'HEAD') return res.end();
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.writeHead(502).end('proxy error: ' + e.message);
  }
}).listen(PORT, '0.0.0.0', () => {});
