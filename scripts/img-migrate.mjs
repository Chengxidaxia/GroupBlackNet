#!/usr/bin/env node
// ============================================================
// img-migrate.mjs — 档案站图床迁移工具（CF img Worker → pixhost.to）
//
// 子命令:
//   inventory        盘点：抓全部 Discussions（正文+评论+回复），提取图片 URL
//   migrate          迁移：下载盘点到的图片 → 逐张传 pixhost.to → 写映射
//   export           导出前端映射 assets/data/imgmap.json（渲染时改写 <img>）
//   verify           抽查映射：随机 N 条验证 pixhost 直链可访问
//
// 产物目录（不进仓库）: _img-migrate/
//   inventory.json  盘点结果
//   files/          下载的原始图片
//   imgmap.json     旧 URL → pixhost 三种 URL 的映射（增量可续跑）
// 用法: node scripts/img-migrate.mjs <command> [--limit N] [--dry]
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = path.join(ROOT, '_img-migrate');
const FILES = path.join(OUT, 'files');
const API = 'https://api.blacknet.cc.cd';
const IMG_HOST = 'img.blacknet.cc.cd';
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?\S*)?$/i;

for (const d of [OUT, FILES]) fs.mkdirSync(d, { recursive: true });
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

function readJSON(p, dflt) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; } }
function writeJSON(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 2)); }

/* ---------------- 抓取 ---------------- */

// 令牌来源（优先级）：环境变量 GB_GH_TOKEN → backend/.env 的 GITHUB_TOKEN → .workbuddy/tmp/gh_token.txt（单行）
const GH_TOKEN = process.env.GB_GH_TOKEN
  || (() => { try {
        const envTxt = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8');
        const m = envTxt.match(/^GITHUB_TOKEN\s*=\s*["']?([^\s"']+)["']?\s*$/m);
        if (m) return m[1].trim();
      } catch (e) {}
      try { return fs.readFileSync(path.join(ROOT, '.workbuddy', 'tmp', 'gh_token.txt'), 'utf8').trim(); } catch (e) { return ''; }
    })();
let SOURCE = null;   // 'api' | 'graphql'，首次请求时探测

async function ghGraphQL(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GH_TOKEN, 'User-Agent': 'GroupBlackNet-img-migrate/1.0' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(180000),
  });
  const j = await r.json();
  if (j.errors) throw new Error('GraphQL: ' + (j.errors[0]?.message || '?'));
  return j.data;
}

const Q_LIST = `
  query($owner:String!,$repo:String!,$first:Int!,$after:String) {
    repository(owner:$owner,name:$repo) {
      discussions(first:$first,after:$after,orderBy:{field:CREATED_AT,direction:DESC}) {
        nodes { id number title body createdAt updatedAt
                author { login avatarUrl } category { name }
                comments { totalCount }
                reactionGroups { content users { totalCount } viewerHasReacted }
                upvoteCount viewerHasUpvoted }
        pageInfo { endCursor hasNextPage }
      }
    }
  }`;
const Q_SINGLE = `
  query($owner:String!,$repo:String!,$number:Int!,$cfirst:Int!,$cafter:String) {
    repository(owner:$owner,name:$repo) {
      discussion(number:$number) {
        number body createdAt updatedAt author { login avatarUrl } category { name }
        comments(first:$cfirst,after:$cafter) {
          nodes { id body createdAt updatedAt author { login avatarUrl }
                  replies(first:50) { nodes { id body createdAt author { login avatarUrl } } } }
          pageInfo { endCursor hasNextPage } totalCount
        }
      }
    }
  }`;
const GH = { owner: 'Chengxidaxia', repo: 'GroupBlackNet' };

async function sourceFetch(url) {
  if (SOURCE === 'graphql' || (!SOURCE && GH_TOKEN)) {
    SOURCE = 'graphql';
    const u = new URL(url);
    const first = parseInt(u.searchParams.get('first') || '100', 10);
    const after = u.searchParams.get('after');
    const d = u.searchParams.get('d');
    if (d === null) {
      const data = await ghGraphQL(Q_LIST, { ...GH, first, after });
      return data.repository.discussions;
    }
    const data = await ghGraphQL(Q_SINGLE, { ...GH, number: parseInt(d, 10), cfirst: parseInt(u.searchParams.get('cfirst') || '100', 10) || 100, cafter: u.searchParams.get('cafter') });
    return { discussion: data.repository.discussion };
  }
  SOURCE = 'api';
  return apiJSON(url);
}

/** 抓单篇列表节点（统一 shape：list 节点带 comments.totalCount） */
async function fetchAllDiscussions() {
  const all = [];
  let after = null;
  for (let page = 0; ; page++) {
    const u = API + '/?first=100' + (after ? '&after=' + encodeURIComponent(after) : '');
    let j;
    try {
      j = await sourceFetch(u);
    } catch (e) {
      if (SOURCE === 'api' && GH_TOKEN) { log('api 域不可达（' + e.message + '），切换 GraphQL'); SOURCE = 'graphql'; after = null; continue; }
      throw e;
    }
    const nodes = j.nodes || [];
    all.push(...nodes);
    log(`列表第 ${page + 1} 页，累计 ${all.length} 篇`);
    if (!j.pageInfo || !j.pageInfo.hasNextPage) break;
    after = j.pageInfo.endCursor;
  }
  return all;
}

async function fetchDiscussionComments(number) {
  const comments = [];
  let cafter = null;
  for (let page = 0; ; page++) {
    const u = API + '/?d=' + number + '&cfirst=100' + (cafter ? '&cafter=' + encodeURIComponent(cafter) : '');
    const j = await sourceFetch(u);
    const d = j.discussion;
    if (!d) break;
    comments.push(...(d.comments?.nodes || []));
    const pi = d.comments?.pageInfo;
    if (!pi || !pi.hasNextPage) break;
    cafter = pi.endCursor;
  }
  return comments;
}

/* ---------------- 提取 ---------------- */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
// 已知图床域名（无扩展名也收）：QQ 群图、CF img、pixhost
const KNOWN_HOST_RE = /img\.blacknet\.cc\.cd|[a-z0-9.]+\.pixhost\.to|(^|\.)qpic\.cn|multimedia\.nt\.qq\.com(\.cn)?|[a-z0-9.]+\.qq\.com|gchat\.qpic\.cn/i;

function extractImages(text) {
  if (!text) return [];
  const out = new Set();
  for (const m of String(text).matchAll(URL_RE)) {
    let u = m[0].replace(/[),.]+$/, '');
    if (!KNOWN_HOST_RE.test(u) && !IMG_EXT.test(u)) continue;
    out.add(u);
  }
  return [...out];
}

async function cmdInventory(limit) {
  const list = await fetchAllDiscussions();
  const inv = { at: new Date().toISOString(), discussions: 0, images: {}, urls: {} };
  const targets = limit ? list.slice(0, limit) : list;
  let i = 0;
  for (const d of targets) {
    i++;
    try {
      const full = await sourceFetch(API + '/?d=' + d.number + '&cfirst=100');
      const disc = full.discussion;
      const bodies = [[disc?.body, 'body']];
      const comments = await fetchDiscussionComments(d.number);
      for (const c of comments) {
        bodies.push([c.body, 'comment']);
        for (const rep of c.replies?.nodes || []) bodies.push([rep.body, 'reply']);
      }
      for (const [text, where] of bodies) {
        for (const u of extractImages(text)) {
          inv.images[u] = inv.images[u] || { first: d.number, where: where, count: 0 };
          inv.images[u].count++;
          const dk = new URL(u).hostname;
          inv.urls[dk] = (inv.urls[dk] || 0) + 1;
        }
      }
      inv.discussions++;
      if (i % 20 === 0) log(`已扫 ${i}/${targets.length} 篇…`);
    } catch (e) {
      log(`✗ #${d.number} ${e.message}`);
    }
  }
  writeJSON(path.join(OUT, 'inventory.json'), inv);
  const imgs = Object.keys(inv.images);
  log(`完成：${inv.discussions} 篇文档，${imgs.length} 张图片`);
  log('按图源分布:', JSON.stringify(inv.urls, null, 2));
}

/* ---------------- 迁移 ---------------- */

async function pixhostUpload(buf, name) {
  const fd = new FormData();
  fd.append('content_type', '0');
  fd.append('max_th_size', '420');
  fd.append('img', new Blob([buf]), name || 'img');
  const r = await fetch('https://api.pixhost.to/images', {
    method: 'POST', body: fd, headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error('pixhost ' + r.status);
  const j = await r.json();
  // 直链：show 页里解析（imgN.pixhost.to/images/…）
  let direct = null;
  try {
    const page = await fetch(j.show_url, { signal: AbortSignal.timeout(180000) });
    const t = await page.text();
    const m = t.match(/https:\/\/[a-z0-9.]+\.pixhost\.to\/images\/[^\s"'<>]+/i);
    direct = m && m[0];
  } catch (e) { /* 直链解析失败则用 show_url 兜底 */ }
  return { show: j.show_url, th: j.th_url, direct: direct || j.show_url };
}

async function cmdMigrate(limit, dry) {
  const inv = readJSON(path.join(OUT, 'inventory.json'), null);
  if (!inv) return log('先跑 inventory');
  const mapPath = path.join(OUT, 'imgmap.json');
  const map = readJSON(mapPath, {});
  const urls = Object.keys(inv.images);
  const todo = urls.filter(u => !map[u]).slice(0, limit || Infinity);
  log(`共 ${urls.length} 张，已映射 ${urls.length - todo.length}，本次处理 ${dry ? '前 ' + Math.min(todo.length, limit || 5) : todo.length} 张`);
  let ok = 0, fail = 0;
  for (const [i, u] of todo.entries()) {
    if (dry && i >= (limit || 5)) break;
    try {
      const r = await fetch(u, {
        signal: AbortSignal.timeout(180000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36', 'Referer': 'https://grp.blacknet.cc.cd/' },
      });
      if (!r.ok) throw new Error('下载 ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      let name = (u.split('/').pop().split('?')[0] || ('img_' + i)).slice(0, 80);
      if (!/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(name)) {
        const ext = ct.includes('png') ? '.png' : ct.includes('gif') ? '.gif' : ct.includes('webp') ? '.webp' : '.jpg';
        name += ext;
      }
      if (!dry) {
        const up = await pixhostUpload(buf, name);
        map[u] = { ...up, size: buf.length, at: new Date().toISOString() };
        fs.writeFileSync(path.join(FILES, name.replace(/[^\w.-]/g, '_')), buf);
        writeJSON(mapPath, map);   // 每张都落盘，断了可续
      }
      ok++;
      log(`[${i + 1}/${todo.length}] ✓ ${u} → ${dry ? '(dry)' : map[u]?.direct || '?'}`);
      await new Promise(res => setTimeout(res, 1500));   // 温和限速
    } catch (e) {
      fail++;
      log(`[${i + 1}/${todo.length}] ✗ ${u} — ${e.message}`);
    }
  }
  log(`完成：成功 ${ok}，失败 ${fail}（失败重跑即可续）`);
}

/* ---------------- 导出 ---------------- */

async function cmdExport() {
  const map = readJSON(path.join(OUT, 'imgmap.json'), null);
  if (!map) return log('没有 imgmap.json，先跑 migrate');
  const front = {};
  for (const [oldU, v] of Object.entries(map)) front[oldU] = v.direct;
  const p = path.join(ROOT, 'assets', 'data', 'imgmap.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  writeJSON(p, front);
  log(`已写出 ${p}（${Object.keys(front).length} 条）`);
}

/* ---------------- 验证 ---------------- */

async function cmdVerify(n) {
  const map = readJSON(path.join(OUT, 'imgmap.json'), {});
  const entries = Object.entries(map);
  if (!entries.length) return log('映射为空');
  const step = Math.max(1, Math.floor(entries.length / (n || 10)));
  let bad = 0, checked = 0;
  for (let i = 0; i < entries.length; i += step) {
    const [oldU, v] = entries[i];
    try {
      const r = await fetch(v.direct, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
      checked++;
      if (!r.ok) { bad++; log('✗', oldU, '→', v.direct, r.status); }
    } catch (e) { bad++; checked++; log('✗', v.direct, e.message); }
  }
  log(`抽查 ${checked} 条，坏链 ${bad}`);
}

/* ---------------- 入口 ---------------- */

const cmd = process.argv[2] || 'inventory';
const argN = i => { const v = process.argv[process.argv.indexOf(i) + 1]; return v && !v.startsWith('--') ? parseInt(v, 10) : null; };
const limit = argN('--limit');
const dry = process.argv.includes('--dry');

({ inventory: () => cmdInventory(limit),
   migrate: () => cmdMigrate(limit, dry),
   export: cmdExport,
   verify: () => cmdVerify(limit) }[cmd] || (() => log('未知命令'))())();
