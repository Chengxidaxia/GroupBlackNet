// test-gh-core.mjs — GitHub 登录态 Function 核心逻辑单测（mock fetch）
import { handleGh } from '../book/netlify/functions/gh-core.mjs';

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok', name); }
  catch (e) { fail++; console.error('  FAIL', name, '-', e.message); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg || 'assert'); };
const req = (method, path, cookie) => new Request('https://x.n' + path, { method, headers: cookie ? { Cookie: cookie } : {} });

const GOOD = { login: 'octocat', name: 'The Octocat', avatar_url: 'https://a/b.png', email: '', extra: 'should-not-leak' };

await t('/me 无 Cookie 401', async () => {
  const r = await handleGh(req('GET', '/me'), async () => { throw new Error('不该调 GitHub'); });
  assert(r.status === 401);
});
await t('/me 有效令牌 → 精简字段', async () => {
  const r = await handleGh(req('GET', '/me', 'a=1; github_token=TOK; b=2'), async () => new Response(JSON.stringify(GOOD), { status: 200 }));
  assert(r.status === 200);
  const d = await r.json();
  assert(d.login === 'octocat' && d.avatar_url.includes('b.png'));
  assert(!('extra' in d), '敏感字段不应透传');
});
await t('/me 令牌无效 401 + 清 Cookie', async () => {
  const r = await handleGh(req('GET', '/me', 'github_token=BAD'), async () => new Response('{}', { status: 401 }));
  assert(r.status === 401);
  assert(/Max-Age=0/.test(r.headers.get('Set-Cookie') || ''), '应下发清除 Cookie');
});
await t('GitHub 网络异常 502', async () => {
  const r = await handleGh(req('GET', '/me', 'github_token=TOK'), async () => { throw new Error('net'); });
  assert(r.status === 502);
});
await t('/logout 清 Cookie 返回 ok', async () => {
  const r = await handleGh(req('POST', '/logout'), null);
  assert(r.status === 200);
  const c = r.headers.get('Set-Cookie') || '';
  assert(/github_token=/.test(c) && /Max-Age=0/.test(c) && /Domain=\.blacknet\.cc\.cd/.test(c));
});
await t('带前缀路径也能路由（/.netlify/functions/gh-auth/me）', async () => {
  const r = await handleGh(req('GET', '/.netlify/functions/gh-auth/me', 'github_token=TOK'), async () => new Response(JSON.stringify(GOOD), { status: 200 }));
  assert(r.status === 200);
});
await t('未知路径 401（无 Cookie）', async () => {
  const r = await handleGh(req('GET', '/whatever'), async () => new Response('{}', { status: 200 }));
  assert(r.status === 401);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
