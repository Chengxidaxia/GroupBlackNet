#!/usr/bin/env node
// ============================================================
// 收集「上次发稿 → 现在」这段时间的更新记录，给每日发稿定时任务用
// ------------------------------------------------------------
// 用法：
//   node scripts/collect-updates.mjs              # 起点取 blog-last-post.json 的 lastPostAt
//   node scripts/collect-updates.mjs --since 2026-11-03T12:47:00+08:00
//   node scripts/collect-updates.mjs --json       # 机器可读
//
// 输出最后一行固定是：
//   RESULT: HAS_UPDATES <n>     有 n 条实质更新
//   RESULT: NO_UPDATES          这段时间没有任何实质更新（→ 当天不发稿）
//
// 过滤规则（和定时任务 prompt 里的口径一致）：
//   - 路径或标题含 proxy 的，一律丢掉
//   - 机械提交（sync: / index: publish / chore: / Merge / 只改 .workbuddy 或锁文件）不计入
//   - 主仓库按「提交涉及的文件」判定；书阁仓库只按提交信息判定（列表接口不带 files）
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, 'backend', '.env');
const LAST_POST = path.join(ROOT, '.workbuddy', 'memory', 'blog-last-post.json');
const BOOK_REPO = 'Chengxidaxia/BookBlackNet';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/* ---------- 起点 ---------- */
function sinceOf() {
  const s = opt('--since');
  if (s) return { iso: s, from: '--since 参数' };
  try {
    const j = JSON.parse(fs.readFileSync(LAST_POST, 'utf8'));
    if (j.lastPostAt) return { iso: j.lastPostAt, from: 'blog-last-post.json' };
  } catch { /* 没有就用兜底 */ }
  // 兜底：24 小时前
  return { iso: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), from: '兜底 24 小时' };
}

/* ---------- 过滤 ---------- */
const MECHANICAL = /^(sync:|index:\s*publish|chore[:(]|docs?:\s*bump|Merge\b|Revert\b)/i;
const SKIP_PATH = /^(\.workbuddy\/|_edge[^/]*\/|package-lock\.json$|\.DS_Store$|新建文本文档)/;

function isNoise(subject, files) {
  if (/proxy/i.test(subject)) return true;
  if (files && files.some((f) => /proxy/i.test(f))) return true;
  if (MECHANICAL.test(subject)) return true;
  if (files && files.length && files.every((f) => SKIP_PATH.test(f))) return true;
  return false;
}

/* ---------- 主仓库 ---------- */
function mainCommits(iso) {
  let out = '';
  try {
    out = execFileSync('git', [
      '-C', ROOT, 'log', '--no-merges', '--since=' + iso,
      '--pretty=format:%x01%h%x02%aI%x02%s', '--name-only',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    return [{ err: 'git log 失败：' + String(e.message).split('\n')[0] }];
  }
  const rows = [];
  out.split('\x01').forEach((chunk) => {
    if (!chunk.trim()) return;
    const lines = chunk.split('\n');
    const [hash, date, subject] = lines[0].split('\x02');
    const files = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    if (!hash || !subject) return;
    if (isNoise(subject, files)) return;
    rows.push({ repo: 'grp', hash, date, subject, files: files.slice(0, 12) });
  });
  return rows;
}

/* ---------- 书阁仓库 ---------- */
function readToken() {
  if (process.env.AI_GH_TOKEN) return process.env.AI_GH_TOKEN;
  if (process.env.BOT_GH_TOKEN) return process.env.BOT_GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  let txt = '';
  try { txt = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* 无文件 */ }
  const pick = (k) => {
    const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  return pick('AI_GH_TOKEN') || pick('BOT_GH_TOKEN') || pick('GITHUB_TOKEN');
}

async function bookCommits(iso) {
  const token = readToken();
  const url = 'https://api.github.com/repos/' + BOOK_REPO + '/commits?since='
    + encodeURIComponent(iso) + '&per_page=100';
  try {
    const r = await fetch(url, {
      headers: Object.assign(
        { Accept: 'application/vnd.github+json', 'User-Agent': 'blacknet-blog' },
        token ? { Authorization: 'Bearer ' + token } : {},
      ),
    });
    if (!r.ok) return [{ err: '书阁接口 HTTP ' + r.status }];
    const list = await r.json();
    return list.map((c) => ({
      repo: 'book',
      hash: c.sha.slice(0, 7),
      date: c.commit.author.date,
      subject: c.commit.message.split('\n')[0],
    })).filter((c) => !isNoise(c.subject));
  } catch (e) {
    return [{ err: '书阁接口请求失败：' + e.message }];
  }
}

/* ---------- 主流程 ---------- */
const since = sinceOf();
const grp = mainCommits(since.iso);
const book = await bookCommits(since.iso);
const errs = [...grp, ...book].filter((r) => r.err).map((r) => r.err);
const rows = [...grp, ...book].filter((r) => !r.err)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

const fmt = (d) => {
  const t = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
};

if (flag('--json')) {
  console.log(JSON.stringify({
    since: since.iso, sinceFrom: since.from,
    count: rows.length, updates: rows, errors: errs,
    result: rows.length ? 'HAS_UPDATES' : 'NO_UPDATES',
  }, null, 2));
} else {
  console.log('起点：' + since.iso + '（' + since.from + '）');
  if (errs.length) errs.forEach((e) => console.log('  [!] ' + e));
  console.log('主仓库：' + grp.filter((r) => !r.err).length + ' 条；书阁：' + book.filter((r) => !r.err).length + ' 条');
  rows.forEach((r) => {
    console.log('  ' + r.hash + '  ' + fmt(r.date) + '  [' + r.repo + '] ' + r.subject);
    if (r.files && r.files.length) console.log('           ' + r.files.join(', '));
  });
}
console.log('RESULT: ' + (rows.length ? 'HAS_UPDATES ' + rows.length : 'NO_UPDATES'));
