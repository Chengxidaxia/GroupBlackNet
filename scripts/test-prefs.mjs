/* test-prefs.mjs — 偏好设置单测（mock localStorage） */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.window = global;
global.document = { body: { dataset: {} } };
eval(fs.readFileSync(path.join(root, 'book/assets/js/core/prefs.js'), 'utf8'));
const P = window.BKN.prefs;

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗', n); } };

ok(P.get('editor.fontSize') === 17, '默认值');
ok(P.get('reader.theme') === 'paper', '阅读默认主题');
ok(P.get('nope.key', 'x') === 'x', '未知键回退 dft');

let fired = null;
P.onChange((p, v) => { fired = [p, v]; });
P.set('editor.fontSize', 20);
ok(fired && fired[0] === 'editor.fontSize' && fired[1] === 20, 'onChange 触发');
ok(P.get('editor.fontSize') === 20, '写入后读取');
ok(P.get('editor.fontSize') === 20 && store['bbn.prefs.v1'] !== undefined, '持久化到 localStorage');

// 迁移旧 bbn.reader
store['bbn.reader'] = JSON.stringify({ fontSize: 22, theme: 'night' });
delete P.all; // no-op
const P2 = (function () { eval(fs.readFileSync(path.join(root, 'book/assets/js/core/prefs.js'), 'utf8')); return window.BKN.prefs; })();
ok(P2.get('reader.fontSize') === 22, '迁移旧阅读字号');
ok(P2.get('reader.theme') === 'night', '迁移旧阅读主题');
ok(!store['bbn.reader'], '旧键已清除');

console.log(`test-prefs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
