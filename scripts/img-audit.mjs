#!/usr/bin/env node
// ============================================================
// img-audit.mjs — 全量盘点站内图片引用（正文 / 封面 icon / 评论 / 回复）
// 用法: node scripts/img-audit.mjs [--json]
// 令牌: GB_GH_TOKEN → backend/.env GITHUB_TOKEN → .workbuddy/tmp/gh_token.txt
// 产物: _img-migrate/audit.json（{url: [位置]}）
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = path.join(ROOT, '_img-migrate');
const OWNER = 'Chengxidaxia';
const REPO = 'GroupBlackNet';

const TOKEN = process.env.GB_GH_TOKEN
  || (() => {
    try {
      const t = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8');
      const m = t.match(/^GITHUB_TOKEN\s*=\s*["']?([^\s"']+)["']?\s*$/m);
      if (m) return m[1].trim();
    } catch (e) {}
    try { return fs.readFileSync(path.join(ROOT, '.workbuddy', 'tmp', 'gh_token.txt'), 'utf8').trim(); } catch (e) { return ''; }
  })();

if (!TOKEN) { console.error('缺少 GitHub 令牌'); process.exit(1); }

async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'GBN-img-audit/1.0' },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

const Q = `query($owner:String!,$name:String!,$after:String){
  repository(owner:$owner,name:$name){
    discussions(first:50,after:$after){
      pageInfo{hasNextPage endCursor}
      nodes{
        number id body
        comments(first:100){
          totalCount
          nodes{ id body replies(first:50){nodes{id body}} }
        }
      }
    }
  }
}`;

const b64d = s => { try { return Buffer.from(s, 'base64').toString('utf8'); } catch (e) { return ''; } };
const IMG_RE = /https?:\/\/[^\s)"'<>\]]+/g;
const EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|mp4|webm|mov)(\?|$)/i;

const found = new Map();
const add = (u, where) => {
  if (!EXT_RE.test(u)) return;
  if (!found.has(u)) found.set(u, []);
  const arr = found.get(u);
  if (!arr.includes(where)) arr.push(where);
};

let after = null, all = [], cmtCount = 0;
for (let i = 0; i < 20; i++) {
  const d = await gql(Q, { owner: OWNER, name: REPO, after });
  const p = d.repository.discussions;
  all.push(...p.nodes);
  if (!p.pageInfo.hasNextPage) break;
  after = p.pageInfo.endCursor;
}

for (const d of all) {
  const body = String(d.body || '');
  for (const u of body.match(IMG_RE) || []) add(u, '#' + d.number + ':body');
  const first = body.split('\n')[0].trim();
  if (first.startsWith('{')) {
    try {
      const j = JSON.parse(first);
      if (j.icon) { const u = b64d(j.icon); if (/^https?:/.test(u)) add(u, '#' + d.number + ':icon'); }
    } catch (e) {}
  }
  for (const c of (d.comments.nodes || [])) {
    cmtCount++;
    for (const u of (String(c.body || '').match(IMG_RE) || [])) add(u, '#' + d.number + ':comment');
    for (const r of (c.replies.nodes || [])) for (const u of (String(r.body || '').match(IMG_RE) || [])) add(u, '#' + d.number + ':reply');
  }
}

const map = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'imgmap.json'), 'utf8')); } catch (e) { return {}; } })();
const rows = [...found].map(([u, where]) => ({ url: u, where, mapped: !!map[u], new: map[u] || '' }));
const miss = rows.filter(r => !r.mapped);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(rows, null, 2));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ discussions: all.length, comments: cmtCount, images: rows.length, mapped: rows.length - miss.length, missing: miss.length, rows }, null, 2));
} else {
  console.log('讨论', all.length, '| 评论', cmtCount, '| 唯一图片/视频', rows.length);
  console.log('已映射', rows.length - miss.length, '| 未映射', miss.length);
  if (miss.length) {
    console.log('--- 未映射 ---');
    for (const r of miss) console.log('  [' + r.where.slice(0, 3).join(',') + ']', r.url);
  }
  // 顺带列出「已映射但仍在正文/封面里存旧地址」的位置统计
  const byKind = {};
  for (const r of rows) for (const w of r.where) {
    const k = w.split(':')[1];
    byKind[k] = byKind[k] || { total: 0, mapped: 0 };
    byKind[k].total++; if (r.mapped) byKind[k].mapped++;
  }
  console.log('--- 按位置 ---');
  for (const k in byKind) console.log('  ' + k, byKind[k].total, '（已映射', byKind[k].mapped + '）');
}
