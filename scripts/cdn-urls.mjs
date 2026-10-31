#!/usr/bin/env node
/* ============================================================
   cdn-urls.mjs — jsDelivr / raw 数据源链接生成与连通性校验
   ------------------------------------------------------------
   用法：
     node scripts/cdn-urls.mjs              列出所有数据源链接
     node scripts/cdn-urls.mjs --check      逐个探测（GET，8s 超时）
     node scripts/cdn-urls.mjs --purge      输出 jsDelivr 缓存刷新链接
     node scripts/cdn-urls.mjs --json       JSON 输出（便于管道）
   ------------------------------------------------------------
   仓库与分支从 book/assets/js/config.js 读取，改配置无需改脚本。
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG_FILE = path.join(ROOT, 'book/assets/js/config.js');
const LOCAL_BOOKS = path.join(ROOT, 'book/docs/books');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);

if (!fs.existsSync(CFG_FILE)) {
  console.error('找不到 ' + CFG_FILE);
  process.exit(1);
}

const src = fs.readFileSync(CFG_FILE, 'utf8');
const pick = (key, fb) => {
  const m = src.match(new RegExp(key + "\\s*:\\s*'([^']*)'"));
  return m ? m[1] : fb;
};

const OWNER = pick('REPO_OWNER', 'Chengxidaxia');
const REPO = pick('REPO_NAME', 'BookBlackNet');
const BRANCH = pick('BRANCH', 'main');
const BOOKS_DIR = pick('BOOKS_DIR', 'docs/books');
const INDEX_FILE = pick('INDEX_FILE', 'docs/books/index.json');
const SITE_URL = (pick('SITE_URL', '') || '').replace(/\/+$/, '');   // 正式站域名

// hosts: [ 'a', 'b' ] —— 只取 CDN 段里的字符串
const cdnBlock = (src.match(/CDN\s*:\s*\{[\s\S]*?\n\s{2}\}/) || [''])[0];
const hosts = [...cdnBlock.matchAll(/'([a-z0-9.-]*jsdelivr[^']*)'/gi)].map(m => m[1]);
const HOSTS = hosts.length ? [...new Set(hosts)] : ['cdn.jsdelivr.net'];

const TIMEOUT = 8000;

/* ---------------- 文件清单 ---------------- */
function listBooks() {
  if (!fs.existsSync(LOCAL_BOOKS)) return [];
  return fs.readdirSync(LOCAL_BOOKS)
    .filter(f => f.endsWith('.book'))
    .sort();
}

const books = listBooks();
const files = [INDEX_FILE, ...books.map(f => BOOKS_DIR + '/' + f)];

/* ---------------- URL 生成 ---------------- */
const ghPath = p => '/gh/' + OWNER + '/' + REPO + '@' + BRANCH + '/' + p;
const siteUrl = p => SITE_URL ? SITE_URL + '/' + p : '';
const cdnUrl = (host, p) => 'https://' + host + ghPath(p);
const rawUrl = p => 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/' + p;
const purgeUrl = p => 'https://purge.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@' + BRANCH + '/' + p;
const apiUrl = p => 'https://data.jsdelivr.com/v1/package/gh/' + OWNER + '/' + REPO + '@' + BRANCH + (p ? '/' + p : '');

/* ---------------- 输出 ---------------- */
const out = { owner: OWNER, repo: REPO, branch: BRANCH, hosts: HOSTS, files, cdn: [], raw: [], purge: [], checked: [] };

if (has('--purge')) {
  out.purge = files.map(purgeUrl);
} else if (has('--json')) {
  for (const p of files) {
    for (const h of HOSTS) out.cdn.push(cdnUrl(h, p));
    out.raw.push(rawUrl(p));
  }
} else {
  console.log('');
  console.log('仓库  ' + OWNER + '/' + REPO + '@' + BRANCH);
  console.log('文件  index.json + ' + books.length + ' 本 .book');
  console.log('');
  if (SITE_URL) {
    console.log('— 同源「正式站」（最快，站点自带的书籍）—');
    console.log('    ' + siteUrl(INDEX_FILE));
    for (const f of books) console.log('    ' + siteUrl(BOOKS_DIR + '/' + f));
    console.log('');
  }
  console.log('— jsDelivr（按顺序尝试，前面的挂了自动换下一个）—');
  for (const h of HOSTS) {
    console.log('  [' + h + ']');
    console.log('    ' + cdnUrl(h, INDEX_FILE));
    for (const f of books) console.log('    ' + cdnUrl(h, BOOKS_DIR + '/' + f));
  }
  console.log('');
  console.log('— raw.githubusercontent（最后兜底）—');
  console.log('    ' + rawUrl(INDEX_FILE));
  for (const f of books) console.log('    ' + rawUrl(BOOKS_DIR + '/' + f));
  console.log('');
  console.log('— 列目录 / 元信息（可选）—');
  console.log('    ' + apiUrl(''));
  console.log('');
  console.log('加 --purge 看缓存刷新链接，加 --check 实测连通性。');
}

/* ---------------- 连通性探测 ---------------- */
const looksJson = t => /^[[{]/.test(String(t).trim());

async function probe(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    const body = await res.text();
    const ms = Date.now() - t0;
    const type = res.headers.get('content-type') || '';
    const len = body.length;
    // 不只是 200：站点 404 页 / SPA 兜底页也会是 200 + HTML，内容不对就当失败
    const ok = res.ok && len > 2 && looksJson(body);
    return { url, ok, status: res.status, ms, type, bytes: len, note: ok ? '' : body.slice(0, 80).replace(/\s+/g, ' ') };
  } catch (e) {
    return { url, ok: false, status: 0, ms: Date.now() - t0, type: '', bytes: 0, note: e.name === 'AbortError' ? '超时' : e.message };
  } finally {
    clearTimeout(t);
  }
}

if (has('--check')) {
  const targets = [];
  if (SITE_URL) targets.push(siteUrl(INDEX_FILE));
  for (const h of HOSTS) targets.push(cdnUrl(h, INDEX_FILE));
  targets.push(rawUrl(INDEX_FILE));

  for (const u of targets) {
    const r = await probe(u);
    out.checked.push(r);
    const tag = r.ok ? 'OK ' : 'FAIL';
    console.log(tag + '  ' + String(r.status).padEnd(4) + String(r.ms + 'ms').padEnd(8) +
      (r.bytes ? r.bytes + 'B' : '').padEnd(8) + r.url + (r.note ? '   ← ' + r.note : ''));
  }
  const good = out.checked.filter(r => r.ok).length;
  console.log('');
  console.log(good + '/' + out.checked.length + ' 个数据源可用');
  const siteHit = out.checked[0] && SITE_URL && out.checked[0].url.startsWith(SITE_URL);
  if (siteHit && !out.checked[0].ok) {
    console.log('提示：' + SITE_URL + ' 不通通常是「域名还没绑 / DNS 未生效」，绑好后再跑一次。');
  }
  if (has('--json')) console.log(JSON.stringify(out, null, 2));
}
