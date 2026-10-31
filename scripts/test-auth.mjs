/* auth.me 状态语义单测：200→user / 401→null / 5xx→缓存兜底 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = path.resolve(process.argv[2] || '.');
const dir = (p) => path.join(root, 'book', p);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } };

function loadAuth(fetchMock) {
  const store = {};
  const sandbox = {
    window: {},
    fetch: fetchMock,
    sessionStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    location: { href: 'https://book.blacknet.cc.cd/editor.html' },
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(dir('assets/js/core/auth.js'), 'utf8'), sandbox);
  return sandbox.window.BKN.auth;
}

// 1) 200 → 用户对象 + 写缓存
let a = loadAuth(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ login: 'neo', name: '尼奥', avatar_url: 'https://a/1.png' }) }));
let u = await a.me();
ok(u && u.login === 'neo' && u.name === '尼奥', '200 返回用户');

// 2) 401 → null 且清缓存
a = loadAuth(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }));
u = await a.me(true);
ok(u === null, '401 返回 null');

// 3) 5xx → 未知（读不到缓存时 undefined/null）
a = loadAuth(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }));
u = await a.me(true);
ok(u === null || u === undefined, '5xx 不误报登录');

// 4) 网络异常 → undefined/null
a = loadAuth(() => Promise.reject(new Error('offline')));
u = await a.me(true);
ok(u === null || u === undefined, '断网不 throw');

// 5) displayName
ok(a.displayName({ name: '', login: 'abc' }) === 'abc', 'displayName 兜底 login');

console.log(`test-auth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
