// test-netlify-cores.mjs — api-core / oauth-core 单测（mock fetch / env）
import { handleApi } from '../netlify/functions/api-core.mjs';
import { handleOauth } from '../netlify/functions/oauth-core.mjs';

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok', name); }
  catch (e) { fail++; console.error('  FAIL', name, '-', e.message); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const R = (url, opt) => new Request('https://x.n' + url, opt);

await t('api: 缺 GH_TOKEN → 500', async () => {
  const r = await handleApi(R('/api/discussions?first=5'), {});
  assert(r.status === 500 && /GH_TOKEN/.test(await r.text()));
});
await t('api: d 非法 → 400', async () => {
  const r = await handleApi(R('/api/discussions?d=abc'), { GH_TOKEN: 'T' });
  assert(r.status === 400);
});
await t('api: 列表查询透传 GraphQL', async () => {
  let captured;
  const env = { GH_TOKEN: 'T', fetch: null };
  const orig = global.fetch;
  global.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: { repository: { discussions: { nodes: [{ number: 1 }], pageInfo: { endCursor: 'c1', hasNextPage: true } } } } }), { status: 200 });
  };
  try {
    const r = await handleApi(R('/api/discussions?first=7&after=abc'), { GH_TOKEN: 'T' });
    const j = await r.json();
    assert(r.status === 200 && j.nodes.length === 1 && j.pageInfo.hasNextPage === true);
    assert(captured.variables.first === 7 && captured.variables.after === 'abc');
  } finally { global.fetch = orig; }
});
await t('api: 单篇 404 转错误信息', async () => {
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ data: { repository: { discussion: null } } }), { status: 200 });
  try {
    const r = await handleApi(R('/api/discussions?d=999'), { GH_TOKEN: 'T' });
    assert(r.status === 500 && /不存在/.test(await r.text()));
  } finally { global.fetch = orig; }
});

await t('oauth: 缺环境变量 login → 500', async () => {
  const r = await handleOauth(R('/api/oauth/login'), {});
  assert(r.status === 500);
});
await t('oauth: login 302 + 设置 state/remember Cookie', async () => {
  const r = await handleOauth(R('/api/oauth/login?remember=true'), { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' });
  assert(r.status === 302);
  const loc = r.headers.get('Location');
  assert(loc.includes('github.com/login/oauth/authorize') && loc.includes('client_id=id'));
  const setc = r.headers.getSetCookie ? r.headers.getSetCookie().join(' ') : r.headers.get('Set-Cookie') || '';
  assert(/oauth_state=/.test(setc) && /remember_me=1/.test(setc));
  assert(/redirect_uri=https%3A%2F%2Fgrp\.blacknet\.cc\.cd%2Fapi%2Foauth%2Fcallback/.test(loc));
});
await t('oauth: callback state 不匹配 → 400', async () => {
  const r = await handleOauth(R('/api/oauth/callback?code=c&state=bad'), { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' });
  assert(r.status === 400);
});
await t('oauth: me 无 Cookie → 401', async () => {
  const r = await handleOauth(R('/api/oauth/me'), {});
  assert(r.status === 401);
});
await t('oauth: me 有效 → 透传用户', async () => {
  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ login: 'octo', name: 'Octo' }), { status: 200 });
  try {
    const r = await handleOauth(new Request('https://x.n/api/oauth/me', { headers: { Cookie: 'github_token=TOK' } }), {});
    const j = await r.json();
    assert(r.status === 200 && j.login === 'octo');
  } finally { global.fetch = orig; }
});
await t('oauth: logout 清三枚 Cookie', async () => {
  const r = await handleOauth(new Request('https://x.n/api/oauth/logout', { method: 'POST' }), {});
  assert(r.status === 200);
  const setc = r.headers.getSetCookie ? r.headers.getSetCookie().join(' ') : r.headers.get('Set-Cookie') || '';
  assert(/github_token=/.test(setc) && /remember_me=/.test(setc) && /oauth_state=/.test(setc));
  assert((setc.match(/Max-Age=0/g) || []).length >= 3);
});
await t('oauth: reaction 缺参数 → 400', async () => {
  const r = await handleOauth(new Request('https://x.n/api/oauth/reaction', {
    method: 'POST', headers: { Cookie: 'github_token=TOK', 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId: 'x' }),
  }), {});
  assert(r.status === 400);
});
await t('oauth: 未知段 → 404', async () => {
  const r = await handleOauth(R('/api/oauth/whatever'), {});
  assert(r.status === 404);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
