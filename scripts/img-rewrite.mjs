#!/usr/bin/env node
// ============================================================
// img-rewrite.mjs — 把 Discussion 正文里的旧图地址回写成新图床直链
//
// 背景：img-migrate 只做了「搬运 + 映射表」，站点靠 assets/imgmap.js 在
//       运行时改写 <img src>。帖子原文仍是旧 URL，GitHub 原生页面、
//       RSS、外部引用看到的还是旧图。
//
// 用法:
//   node scripts/img-rewrite.mjs            预览（dry-run，不写）
//   node scripts/img-rewrite.mjs --apply    真正回写（逐篇 updateDiscussion）
//   node scripts/img-rewrite.mjs --apply --only 45,42   只处理指定编号
//
// 改写范围:
//   1) 正文 markdown / HTML 里的旧 URL → pixhost 直链
//   2) 首行 JSON 的 icon 字段（base64 包着旧 URL）→ 换成新 URL 再编码
//
// 副作用: 每次 updateDiscussion 都会刷新 updatedAt，会改变「按修改排序」。
// 令牌: GB_GH_TOKEN → backend/.env GITHUB_TOKEN → .workbuddy/tmp/gh_token.txt
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const MAP_PATH = path.join(ROOT, '_img-migrate', 'imgmap.json');
const OWNER = 'Chengxidaxia';
const REPO = 'GroupBlackNet';

const APPLY = process.argv.includes('--apply');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > 0 && process.argv[onlyIdx + 1]
  ? new Set(process.argv[onlyIdx + 1].split(',').map(s => s.trim()).filter(Boolean))
  : null;

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

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
// 旧 URL → 新直链（只取字符串直链，忽略对象形式）
const pairs = Object.entries(map)
  .map(([oldU, v]) => [oldU, typeof v === 'string' ? v : (v && v.direct) || ''])
  .filter(([o, n]) => o && n && o !== n)
  .sort((a, b) => b[0].length - a[0].length);   // 长的先替换，避免前缀抢占

function rewriteText(s) {
  let t = s;
  for (const [o, n] of pairs) {
    if (t.indexOf(o) >= 0) t = t.split(o).join(n);
  }
  return t;
}

const b64d = s => { try { return Buffer.from(s, 'base64').toString('utf8'); } catch (e) { return ''; } };
const b64e = s => Buffer.from(String(s), 'utf8').toString('base64');

/** 处理整篇 body：首行 JSON（icon）+ 其余正文 */
function rewriteBody(body) {
  const nl = body.indexOf('\n');
  const first = nl < 0 ? body : body.slice(0, nl);
  const rest = nl < 0 ? '' : body.slice(nl);
  let newFirst = first;
  let iconChanged = false;

  if (first.trim().startsWith('{')) {
    try {
      const j = JSON.parse(first.trim());
      if (j && j.icon) {
        const oldIcon = b64d(j.icon);
        const newIcon = rewriteText(oldIcon);
        if (newIcon !== oldIcon) { j.icon = b64e(newIcon); newFirst = JSON.stringify(j); iconChanged = true; }
      }
    } catch (e) { /* 首行不是合法 JSON：原样保留 */ }
  }
  const newRest = rewriteText(rest);
  return { body: newFirst + newRest, iconChanged, bodyChanged: newRest !== rest, textChanged: newFirst !== first };
}

async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'GBN-img-rewrite/1.0' },
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
      nodes{ number id title body }
    }
  }
}`;

const M = `mutation($id:ID!,$body:String!){ updateDiscussion(input:{discussionId:$id, body:$body}){ discussion{ number updatedAt } } }`;

async function main() {
  let after = null, all = [];
  for (let i = 0; i < 20; i++) {
    const d = await gql(Q, { owner: OWNER, name: REPO, after });
    const p = d.repository.discussions;
    all.push(...p.nodes);
    if (!p.pageInfo.hasNextPage) break;
    after = p.pageInfo.endCursor;
  }
  console.log('讨论', all.length, '| 模式', APPLY ? '回写' : '预览（dry-run）');

  let changed = 0, iconCount = 0, ok = 0, fail = 0;
  for (const d of all) {
    if (ONLY && !ONLY.has(String(d.number))) continue;
    const r = rewriteBody(String(d.body || ''));
    if (r.body === d.body) continue;
    changed++;
    if (r.iconChanged) iconCount++;
    console.log('  #' + d.number, d.title, '|', r.iconChanged ? '封面+正文' : '仅正文', '| +' + (r.body.length - d.body.length) + 'B');
    if (!APPLY) continue;
    try {
      await gql(M, { id: d.id, body: r.body });
      ok++;
      await new Promise(res => setTimeout(res, 400));
    } catch (e) {
      fail++;
      console.error('  ✗ #' + d.number, e.message);
    }
  }
  console.log('需改写', changed, '篇（其中封面', iconCount, '篇）');
  if (APPLY) console.log('回写成功', ok, '失败', fail);
  else console.log('加 --apply 才会真正写回 GitHub');
}

main().catch(e => { console.error(e); process.exit(1); });
