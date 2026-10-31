/* ============================================================
   test-proxy.mjs — 同源反代层（assets/net.js）的行为回归
   用法：node scripts/test-proxy.mjs
   纯逻辑，不碰网络：fetch 全部由桩函数接管。
   ============================================================ */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/net.js'), 'utf8');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      期望 ' + JSON.stringify(want) + '\n      实际 ' + JSON.stringify(got)); }
}

/** 造一个够用的 Response 替身 */
function res(status, body, type) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: k => (k.toLowerCase() === 'content-type' ? type || 'text/plain' : null) },
    text: async () => String(body),
    json: async () => JSON.parse(String(body))
  };
}

/**
 * 建一个隔离环境
 * @param {(url:string)=>any} route 返回 res / 'throw' / 'hang'
 */
function load(route) {
  const calls = [];
  const ctx = vm.createContext({
    console: { log() { }, info() { }, warn() { }, error: console.error },
    URL,
    location: { href: 'https://site.example.com/book/index.html' },
    fetch: async (url) => {
      calls.push(String(url));
      const r = route(String(url));
      if (r === 'throw') throw new TypeError('Failed to fetch');
      if (r === 'hang') return new Promise(() => { });
      return r;
    }
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInContext(SRC, ctx);
  return { create: ctx.window.BNNET.create, calls };
}

const API = 'https://api.blacknet.cc.cd/?first=24';
const HOSTS = ['api.blacknet.cc.cd', 'api.github.com'];

console.log('\n[同源反代] 判定与降级\n');

/* T1 off 模式：一律直连 */
{
  const { create, calls } = load(() => res(200, '{"a":1}', 'application/json'));
  const net = create({ mode: 'off', base: '/proxy', hosts: HOSTS });
  const r = await net.fetch(API);
  eq('T1 off 模式不代理', calls, [API]);
  eq('T1 结果正常', r.status, 200);
}

/* T2 同源地址：本来就不用代理 */
{
  const { create, calls } = load(() => res(200, '{}', 'application/json'));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  await net.fetch('/docs/books/index.json?v=1');
  eq('T2 同源不代理', calls, ['/docs/books/index.json?v=1']);
}

/* T3 白名单外的 host：不代理（jsDelivr 等 CDN 自己就通 CORS） */
{
  const { create, calls } = load(() => res(200, '{}', 'application/json'));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  await net.fetch('https://gcore.jsdelivr.net/gh/x/y@main/a.json');
  eq('T3 白名单外不代理', net.canProxy('https://gcore.jsdelivr.net/gh/x/y@main/a.json'), false);
  eq('T3 直连', calls.length, 1);
}

/* T4 站点没配反代（返回自己的 404 页）→ 自动降级直连 */
{
  const { create, calls } = load(u =>
    u.startsWith('/proxy/') ? res(404, '<html>Not Found</html>', 'text/html') : res(200, '{"ok":1}', 'application/json')
  );
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  const r = await net.fetch(API);
  eq('T4 先试反代再直连', calls, ['/proxy/api.blacknet.cc.cd/?first=24', API]);
  eq('T4 拿到直连结果', r.status, 200);
  eq('T4 标记不可用', net.state.dead, true);
  eq('T4 计数', [net.state.misses, net.state.hits], [1, 0]);
}

/* T5 反代可用：只发一次请求，地址被改写且 query 保留 */
{
  const { create, calls } = load(() => res(200, '{"ok":1}', 'application/json'));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  const r = await net.fetch(API);
  eq('T5 只走反代一次', calls, ['/proxy/api.blacknet.cc.cd/?first=24']);
  eq('T5 结果正常', r.status, 200);
  eq('T5 计数', [net.state.hits, net.state.misses], [1, 0]);
}

/* T6 降级过一次之后，本会话不再试反代 */
{
  const { create, calls } = load(u =>
    u.startsWith('/proxy/') ? res(404, '<html>404</html>', 'text/html') : res(200, '{}', 'application/json')
  );
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  await net.fetch(API);
  await net.fetch(API);
  eq('T6 第二次直接直连', calls, ['/proxy/api.blacknet.cc.cd/?first=24', API, API]);
}

/* T7 反代本身网络错误 → 也降级 */
{
  const { create, calls } = load(u => (u.startsWith('/proxy/') ? 'throw' : res(200, '{}', 'application/json')));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  const r = await net.fetch(API);
  eq('T7 网络错误降级', calls, ['/proxy/api.blacknet.cc.cd/?first=24', API]);
  eq('T7 结果正常', r.status, 200);
}

/* T8 后端自己返回 404（JSON）→ 不当成「站点没配反代」，不降级 */
{
  const { create, calls } = load(() => res(404, '{"error":"not found"}', 'application/json'));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  const r = await net.fetch(API);
  eq('T8 JSON 404 不降级', calls, ['/proxy/api.blacknet.cc.cd/?first=24']);
  eq('T8 状态原样', r.status, 404);
  eq('T8 未标记不可用', net.state.dead, false);
}

/* T9 always 模式：失败就失败，不偷偷降级（排查用） */
{
  const { create, calls } = load(() => res(404, '<html>404</html>', 'text/html'));
  const net = create({ mode: 'always', base: '/proxy', hosts: HOSTS });
  const r = await net.fetch(API);
  eq('T9 always 不降级', calls, ['/proxy/api.blacknet.cc.cd/?first=24']);
  eq('T9 把 404 交给调用方', r.status, 404);
}

/* T10 便捷方法 */
{
  const { create } = load(() => res(200, '{"a":1}', 'application/json'));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  eq('T10 json()', await net.json(API), { a: 1 });
}
{
  const { create } = load(() => res(500, 'boom', 'text/plain'));
  const net = create({ mode: 'auto', base: '/proxy', hosts: HOSTS });
  let msg = '';
  try { await net.json(API); } catch (e) { msg = e.message; }
  eq('T10 非 2xx 抛错', msg, 'HTTP 500');
}

/* T11 地址改写：保留 path 与 query，自定义 base */
{
  const { create } = load(() => res(200, '{}', 'application/json'));
  const net = create({ mode: 'auto', base: '/gw/', hosts: HOSTS });
  eq('T11 改写规则',
    net.toProxy('https://api.github.com/repos/o/r/contents/docs/books/index.json?ref=main'),
    '/gw/api.github.com/repos/o/r/contents/docs/books/index.json?ref=main');
}

/* T12 默认值：不传任何配置也不炸，mode=auto、base=/proxy */
{
  const { create, calls } = load(() => res(200, '{}', 'application/json'));
  const net = create();
  eq('T12 默认 auto', net.config.mode, 'auto');
  eq('T12 默认 base', net.config.base, '/proxy');
  await net.fetch('https://api.github.com/user');
  eq('T12 无白名单时跨域都可代理', calls, ['/proxy/api.github.com/user']);
}

/* T13 skipOn：本页域名已在后端放行 → 直连，不发探测请求 */
{
  const { create, calls } = load(() => res(200, '{}', 'application/json'));
  const net = create({
    mode: 'auto', base: '/proxy', hosts: HOSTS,
    skipOn: ['site.example.com']
  });
  await net.fetch(API);
  eq('T13 skipOn 命中时直连', calls, [API]);
  eq('T13 未写反代标记', net.state.hits + net.state.misses, 0);
}

/* T14 skipOn 只按本页域名判断：换个域部署就照常走反代 */
{
  const { create, calls } = load(() => res(200, '{}', 'application/json'));
  const net = create({
    mode: 'auto', base: '/proxy', hosts: HOSTS,
    skipOn: ['other.example.com']
  });
  await net.fetch(API);
  eq('T14 未命中 skipOn 则走反代', calls, ['/proxy/api.blacknet.cc.cd/?first=24']);
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
