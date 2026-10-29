/* 数据源回退逻辑单测：node scripts/test-datasource.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const configSrc = fs.readFileSync(ROOT + '/book/assets/js/config.js', 'utf8');
const apiSrc = fs.readFileSync(ROOT + '/book/assets/js/core/api.js', 'utf8');

const INDEX = JSON.stringify({
  format: 'bookblacknet.index', v: 1,
  books: [
    { id: 'b1', title: '书一', file: 'b1.book', updatedAt: '2026-10-21T21:40:00.000Z' },
    { id: 'b2', title: '书二', file: 'b2.book', updatedAt: '2026-10-20T08:00:00.000Z' }
  ]
});
const BOOK = JSON.stringify({ format: 'bookblacknet.book', v: 1, title: '书一', chapters: [] });

const mem = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

function load(routes, patch) {
  const calls = [];
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, AbortController, Response, URL
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.localStorage = mem();
  ctx.sessionStorage = mem();

  ctx.fetch = async (raw, opt = {}) => {
    const u = String(raw);
    const abs = /^https?:/i.test(u) ? u : 'http://site.local/' + u.replace(/^\/+/, '');
    calls.push(abs);
    const r = routes(abs);
    if (r === 'hang') {
      return new Promise((_, rej) => {
        if (opt.signal) {
          opt.signal.addEventListener('abort', () =>
            rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }
      });
    }
    if (!r) return new Response('not found', { status: 404 });
    return new Response(r.body, { status: r.status || 200 });
  };

  vm.runInContext(configSrc, ctx);
  Object.assign(ctx.window.BOOK, patch || {});
  vm.runInContext(apiSrc, ctx);
  return { api: ctx.window.BKN.api, calls };
}

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  ok ? pass++ : fail++;
};

const isSite = u => u.startsWith('http://site.local/docs/books/');
const isCdn = u => u.includes('jsdelivr.net/gh/Chengxidaxia/BookBlackNet@main/');
const isRaw = u => u.includes('raw.githubusercontent.com/Chengxidaxia/BookBlackNet/main/');

/* T1 同源命中 */
{
  const { api, calls } = load(u => (isSite(u) && u.includes('index.json')) ? { body: INDEX } : null);
  const r = await api.loadIndex();
  eq('T1 同源命中', [r.source, r.books.length, calls.length], ['site', 2, 1]);
}

/* T2 同源 404 → jsDelivr */
{
  const { api, calls } = load(u => (isCdn(u) && u.includes('index.json')) ? { body: INDEX } : null);
  const r = await api.loadIndex();
  eq('T2 同源失败回退 CDN', [r.source, r.books.length], ['cdn', 2]);
  eq('T2 首个请求是同源', calls[0].startsWith('http://site.local/'), true);
  eq('T2 第二个请求是 CDN', isCdn(calls[1]), true);
}

/* T3 CDN 全挂 → raw */
{
  const { api } = load(u => (isRaw(u) && u.includes('index.json')) ? { body: INDEX } : null);
  const r = await api.loadIndex();
  eq('T3 CDN 失败回退 raw', r.source, 'raw');
}

/* T4 全挂 */
{
  const { api } = load(() => null);
  const r = await api.loadIndex();
  eq('T4 全部失败', [r.source, r.books.length], ['none', 0]);
}

/* T5 同源挂起 → 超时后换源（不发请求就卡死） */
{
  const t0 = Date.now();
  const { api } = load(
    u => (isSite(u) && u.includes('index.json')) ? 'hang' : ((isCdn(u) && u.includes('index.json')) ? { body: INDEX } : null),
    { CDN: { enabled: true, hosts: ['cdn.jsdelivr.net'], base: '', timeout: 800, siteTimeout: 200 } }
  );
  const r = await api.loadIndex();
  const ms = Date.now() - t0;
  eq('T5 同源超时自动换源', r.source, 'cdn');
  eq('T5 耗时受控(<1.5s)', ms < 1500, true);
}

/* T6 版本戳取自索引 updatedAt */
{
  const { api, calls } = load(u => {
    if (isSite(u) && u.includes('index.json')) return { body: INDEX };
    if (isSite(u) && u.includes('b1.book')) return { body: BOOK };
    return null;
  });
  await api.loadIndex();
  const txt = await api.fetchBook('b1');
  const last = calls[calls.length - 1];
  eq('T6 书籍内容取回', txt.slice(0, 20), BOOK.slice(0, 20));
  eq('T6 用 updatedAt 作版本戳', last.includes('v=20261021214000000'), true);
}

/* T7 同源返回 HTML 错误页 → 跳过 */
{
  const { api, calls } = load(u => {
    if (isSite(u) && u.includes('index.json')) return { body: '<!doctype html><html>SPA</html>' };
    if (isCdn(u) && u.includes('index.json')) return { body: INDEX };
    return null;
  });
  const r = await api.loadIndex();
  eq('T7 HTML 响应被跳过', r.source, 'cdn');
  eq('T7 确实请求过同源', calls.some(isSite), true);
}

/* T8 所有源都返回 HTML → 抛错 */
{
  const { api } = load(() => ({ body: '<html>nope</html>' }));
  let err = '';
  try { await api.fetchBook('b1'); } catch (e) { err = e.message; }
  eq('T8 全源无效时报错', /不是 \.book|无法获取/.test(err), true);
}

/* T9 bustCdn 后版本戳变化 */
{
  const { api, calls } = load(u => (isSite(u) && u.includes('index.json')) ? { body: INDEX } : null);
  await api.loadIndex();
  const before = calls[calls.length - 1];
  api.bustCdn();
  await api.loadIndex();
  const after = calls[calls.length - 1];
  eq('T9 发布后换戳', before !== after, true);
  eq('T9 换戳仍是合法 URL', /[?&]v=b\d+/.test(after), true);
}

/* T10 CDN 多节点并发竞速：慢节点不拖累整体 */
{
  const t0 = Date.now();
  const { api } = load(
    u => {
      if (isSite(u)) return null;
      if (u.includes('cdn.jsdelivr.net') && u.includes('index.json')) return 'hang';
      if (u.includes('gcore.jsdelivr.net') && u.includes('index.json')) return { body: INDEX };
      return null;
    },
    { CDN: { enabled: true, hosts: ['cdn.jsdelivr.net', 'gcore.jsdelivr.net'], base: '', timeout: 8000, siteTimeout: 200 } }
  );
  const r = await api.loadIndex();
  const ms = Date.now() - t0;
  eq('T10 竞速取到可用节点', r.source, 'cdn');
  eq('T10 不被 hang 节点拖住(<1.5s)', ms < 1500, true);
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
