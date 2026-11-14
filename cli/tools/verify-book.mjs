// verify-book.mjs — 用 Node WebCrypto 复刻站点 crypto.js 的解包逻辑，
// 校验 `bn book pack` 产出的 .book 能否被网页端正常打开。
//
// 用法：node verify-book.mjs <file.book> [password]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { webcrypto as wc } from 'node:crypto';

const SITE_KEY = 'bbn-site-4f2c9a71d8e35b60a4c7e29f1d6b83ac';
const file = process.argv[2];
const password = process.argv[3] || '';

const subtle = wc.subtle;
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
if (doc.format !== 'bookblacknet.book') throw new Error('bad format: ' + doc.format);

const c = doc.crypto;
const secret = password || SITE_KEY;
const enc = new TextEncoder();
const b64d = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

const base = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
const kek = await subtle.deriveKey(
  { name: 'PBKDF2', salt: b64d(c.salt), iterations: c.iter, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const rawDek = await subtle.decrypt({ name: 'AES-GCM', iv: b64d(c.wrapIv) }, kek, b64d(c.wrapped));
const dek = await subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);
let buf = Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: b64d(c.dataIv) }, dek, b64d(c.data)));
if (c.zip === 'gzip') buf = zlib.gunzipSync(buf);

const payload = JSON.parse(buf.toString('utf8'));
const meta = { ...doc.meta, ...payload.meta };
console.log(JSON.stringify({
  ok: true,
  format: doc.format,
  wrap: c.wrap,
  zip: c.zip,
  iter: c.iter,
  title: meta.title,
  id: meta.id,
  chapters: (payload.chapters || []).length,
  words: meta.words,
  firstChapter: (payload.chapters || [])[0]?.title || '',
  cover: doc.meta.cover,
}, null, 2));
