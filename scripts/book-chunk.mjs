#!/usr/bin/env node
/* ============================================================
   book-chunk.mjs — 把 docs/books/*.book 改写为「清单 + 分块」
   ------------------------------------------------------------
   用途：仓库落地分块机制。每个文件 ≤ 10MiB。
   用法：node scripts/book-chunk.mjs [--dir book/docs/books] [--dry]
   幂等：已是清单的文件跳过；单文件 .book 才改写。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const dry = process.argv.includes('--dry');
const dir = arg('--dir', 'book/docs/books');

const MAX = 10 * 1024 * 1024;

function utf8Len(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) n += 4;
    else if (c >= 0xDC00 && c <= 0xDFFF) { /* 低代理已计入高位 */ }
    else n += 3;
  }
  return n;
}

function splitChunks(str, max) {
  const parts = [];
  let start = 0, n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    let b = c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xD800 && c <= 0xDBFF) ? 4 : (c >= 0xDC00 && c <= 0xDFFF) ? 0 : 3;
    if (n + b > max) {
      let cut = i;
      if (str.charCodeAt(i - 1) >= 0xD800 && str.charCodeAt(i - 1) <= 0xDBFF) cut = i - 1;
      parts.push(str.slice(start, cut));
      start = cut; n = 0;
    }
    n += b;
  }
  if (start < str.length) parts.push(str.slice(start));
  return parts;
}

if (!fs.existsSync(dir)) { console.error('目录不存在:', dir); process.exit(1); }
const files = fs.readdirSync(dir).filter(f => f.endsWith('.book'));
let changed = 0;
for (const f of files) {
  const p = path.join(dir, f);
  const txt = fs.readFileSync(p, 'utf8');
  let j;
  try { j = JSON.parse(txt); } catch (e) { console.error('✗ 非 JSON，跳过:', f); continue; }
  if (j && j.format === 'bookblacknet.chunks') { console.log('· 已是清单，跳过:', f); continue; }

  const parts = splitChunks(txt, MAX);
  const names = parts.map((_, i) => f + '.p' + String(i + 1).padStart(3, '0'));
  const manifest = JSON.stringify({
    format: 'bookblacknet.chunks', v: 1,
    parts: names, size: utf8Len(txt),
    updatedAt: new Date().toISOString()
  }, null, 2);
  console.log(`${dry ? '[dry] ' : ''}${f} (${utf8Len(txt)}B) → 清单 + ${parts.length} 块 [${names.join(', ')}]`);
  if (!dry) {
    names.forEach((nm, i) => fs.writeFileSync(path.join(dir, nm), parts[i]));
    fs.writeFileSync(p, manifest);
  }
  changed++;
}
console.log(dry ? `dry-run：将改写 ${changed} 个文件` : `完成：改写 ${changed} 个文件`);
