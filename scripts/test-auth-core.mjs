// test-auth-core.mjs — Netlify Function auth-core 逻辑单测（内存 store）
import { handleAuth } from '../book/netlify/functions/auth-core.mjs';

function memStore() {
  const m = new Map();
  return {
    get: async k => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async k => { m.delete(k); },
    _m: m,
  };
}

function req(method, path, { body, token } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  return new Request('https://x.n' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok', name); }
  catch (e) { fail++; console.error('  FAIL', name, '-', e.message); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || 'assert'); };

const store = memStore();
const EMAIL = 'Alice@Example.com', PW = 'p@ssw0rd123';

await t('注册成功，返回 token+user', async () => {
  const r = await handleAuth(req('POST', '/register', { body: { email: EMAIL, password: PW } }), store);
  assert(r.status === 200, 'status ' + r.status);
  const d = await r.json();
  assert(d.token && d.user.email === 'alice@example.com');
});
await t('重复注册 409', async () => {
  const r = await handleAuth(req('POST', '/register', { body: { email: EMAIL, password: PW } }), store);
  assert(r.status === 409);
});
await t('口令 <8 位 400', async () => {
  const r = await handleAuth(req('POST', '/register', { body: { email: 'b@x.io', password: '123' } }), store);
  assert(r.status === 400);
});
await t('邮箱格式 400', async () => {
  const r = await handleAuth(req('POST', '/register', { body: { email: 'bad', password: PW } }), store);
  assert(r.status === 400);
});
await t('登录成功（大小写无关）', async () => {
  const r = await handleAuth(req('POST', '/login', { body: { email: EMAIL, password: PW } }), store);
  assert(r.status === 200, 'status ' + r.status);
});
await t('错误口令 401', async () => {
  const r = await handleAuth(req('POST', '/login', { body: { email: EMAIL, password: 'wrong-pass-1' } }), store);
  assert(r.status === 401);
});
await t('/me 用登录令牌', async () => {
  const r1 = await handleAuth(req('POST', '/login', { body: { email: EMAIL, password: PW } }), store);
  const { token } = await r1.json();
  const r = await handleAuth(req('GET', '/me', { token }), store);
  const d = await r.json();
  assert(d.user.email === 'alice@example.com' && d.user.provider === 'email');
});
await t('/me 无令牌 401', async () => {
  const r = await handleAuth(req('GET', '/me'), store);
  assert(r.status === 401);
});
await t('logout 后令牌失效', async () => {
  const r1 = await handleAuth(req('POST', '/login', { body: { email: EMAIL, password: PW } }), store);
  const { token } = await r1.json();
  await handleAuth(req('POST', '/logout', { token }), store);
  const r = await handleAuth(req('GET', '/me', { token }), store);
  assert(r.status === 401);
});
await t('未知路径 404', async () => {
  const r = await handleAuth(req('GET', '/whatever'), store);
  assert(r.status === 404);
});
await t('OPTIONS 预检 204', async () => {
  const r = await handleAuth(req('OPTIONS', '/login'), store);
  assert(r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === '*');
});
await t('带重定向路径前缀也能路由（/.netlify/functions/auth/login）', async () => {
  const r = await handleAuth(req('POST', '/.netlify/functions/auth/login', { body: { email: EMAIL, password: PW } }), store);
  assert(r.status === 200, 'status ' + r.status);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
