#!/usr/bin/env node
// ============================================================
// 发稿：把一段 Markdown 直接发成 GitHub Discussion（群档案的文章）
// ------------------------------------------------------------
// 用法：
//   node scripts/post-blog.mjs --title "标题" --file 正文.md
//   node scripts/post-blog.mjs --title "标题" --body "正文" --cat General
//   echo "正文" | node scripts/post-blog.mjs --title "标题" --stdin
//   node scripts/post-blog.mjs --list           # 列出分类与 id
//   node scripts/post-blog.mjs --dry ...        # 只打印将要提交的内容
//
// 发布成功后会自动把 {lastPostAt,lastPostUrl,lastPostNumber} 写回
// .workbuddy/memory/blog-last-post.json（下次发稿的起点），加 --no-stamp 可关闭。
//
// 正文规则（和站点一致）：
//   第一行必须是元数据 JSON，例如
//   {"info":"5peg566A5LuL","icon":"","coverText":"","category":4,"tpl":false,"allowComments":true,"tags":[]}
//   之后空一行，才是 Markdown 正文。
//   本脚本不会替你补 JSON —— 传进来什么就发什么，免得悄悄改掉原文。
//
// 令牌：backend/.env 里按 AI_GH_TOKEN → BOT_GH_TOKEN → GITHUB_TOKEN 顺序取第一个非空的。
//       AI_GH_TOKEN 是唯一带 Discussions: Read and write 的那个（2026-11-08 实测），
//       另外两个调 createDiscussion 会报 Resource not accessible by personal access token。
//       作者显示为令牌所属账号（Chengxidaxia）。
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, 'backend', '.env');
const OWNER = 'Chengxidaxia';
const REPO = 'GroupBlackNet';

function parseArgs(argv) {
  const out = { cat: 'General' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title' || a === '-t') out.title = argv[++i];
    else if (a === '--file' || a === '-f') out.file = argv[++i];
    else if (a === '--body' || a === '-b') out.body = argv[++i];
    else if (a === '--cat' || a === '-c') out.cat = argv[++i];
    else if (a === '--stdin') out.stdin = true;
    else if (a === '--list') out.list = true;
    else if (a === '--dry') out.dry = true;
    else if (a === '--no-stamp') out.noStamp = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function readToken() {
  if (process.env.AI_GH_TOKEN) return process.env.AI_GH_TOKEN;
  if (process.env.BOT_GH_TOKEN) return process.env.BOT_GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  let txt = '';
  try { txt = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* 没文件就走环境变量 */ }
  const pick = (k) => {
    const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  return pick('AI_GH_TOKEN') || pick('BOT_GH_TOKEN') || pick('GITHUB_TOKEN');
}

async function gql(token, query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'blacknet-blog' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors && j.errors.length) {
    throw new Error(j.errors.map((e) => e.message).join('; '));
  }
  return j.data;
}

function readBody(args) {
  if (args.body != null) return args.body;
  if (args.file) return fs.readFileSync(path.resolve(args.file), 'utf8');
  if (args.stdin) return fs.readFileSync(0, 'utf8');
  return '';
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

const token = readToken();
if (!token) {
  console.error('找不到令牌：backend/.env 里没有 BOT_GH_TOKEN / GITHUB_TOKEN');
  process.exit(1);
}

const repoQuery = `query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    discussionCategories(first: 20) { nodes { id name } }
  }
}`;

const repo = await gql(token, repoQuery, { owner: OWNER, name: REPO });
const cats = repo.repository.discussionCategories.nodes;

if (args.list) {
  console.log('分类：');
  cats.forEach((c) => console.log('  ' + c.name.padEnd(18) + c.id));
  process.exit(0);
}

const body = readBody(args);
if (!body.trim()) {
  console.error('正文为空：用 --file / --body / --stdin 指定');
  process.exit(1);
}
if (!args.title || !args.title.trim()) {
  console.error('缺少 --title');
  process.exit(1);
}

// 第一行必须是元的 JSON，检查一下，不合法就明确报错（而不是发出去变成普通段落）
const first = body.split('\n')[0].trim();
let meta = null;
try { meta = JSON.parse(first); } catch { /* 下面报错 */ }
if (!meta || typeof meta !== 'object') {
  console.error('正文第一行不是合法 JSON 元数据，拒绝发布。首行是：' + first.slice(0, 120));
  process.exit(2);
}

const cat = cats.find((c) => c.name.toLowerCase() === String(args.cat).toLowerCase()) || cats.find((c) => c.name === 'General');
if (!cat) {
  console.error('找不到分类：' + args.cat + '，可用：' + cats.map((c) => c.name).join(', '));
  process.exit(1);
}

if (args.dry) {
  console.log('[dry] title:', args.title);
  console.log('[dry] category:', cat.name, cat.id);
  console.log('[dry] body bytes:', Buffer.byteLength(body, 'utf8'));
  console.log('[dry] meta:', JSON.stringify(meta));
  process.exit(0);
}

const mutation = `mutation ($input: CreateDiscussionInput!) {
  createDiscussion(input: $input) {
    discussion { number url title createdAt }
  }
}`;

const data = await gql(token, mutation, {
  input: { repositoryId: repo.repository.id, categoryId: cat.id, title: args.title.trim(), body },
});

const d = data.createDiscussion.discussion;
console.log('OK #' + d.number + ' ' + d.url);

// 记下这次发稿时刻，作为下次「从上次发稿到当前」的起点
if (!args.noStamp) {
  const stampFile = path.join(ROOT, '.workbuddy', 'memory', 'blog-last-post.json');
  const t = new Date();
  const off = -t.getTimezoneOffset();
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
    + 'T' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds())
    + (off >= 0 ? '+' : '-') + pad(off / 60) + ':' + pad(off % 60);
  const rec = { lastPostAt: local, lastPostUrl: d.url, lastPostNumber: d.number };
  try {
    fs.mkdirSync(path.dirname(stampFile), { recursive: true });
    fs.writeFileSync(stampFile, JSON.stringify(rec) + '\n', 'utf8');
    console.log('起点已更新为 ' + local);
  } catch (e) {
    console.error('警告：写 blog-last-post.json 失败（' + e.message + '），下次请手动更新 lastPostAt');
  }
}
