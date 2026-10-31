/* test-undo.mjs — 撤销栈单测（伪造 textarea） */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
global.window = global;
eval(fs.readFileSync(path.join(root, 'book/assets/js/core/undo.js'), 'utf8'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('  ✗', name); } };

function fakeTA() {
  return {
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
    _ls: {},
    addEventListener(ev, fn) { (this._ls[ev] = this._ls[ev] || []).push(fn); },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    fire(ev) { (this._ls[ev] || []).forEach(fn => fn({})); }
  };
}

const ta = fakeTA();
const u = window.BKN.undo.attach(ta, { mergeMs: 50 });

// 模拟连续输入（合并）
ta.value = 'a'; ta.setSelectionRange(1, 1); ta.fire('input');
await new Promise(r => setTimeout(r, 60));
ta.value = 'ab'; ta.setSelectionRange(2, 2); ta.fire('input');
await new Promise(r => setTimeout(r, 60));
ta.value = 'abc'; ta.setSelectionRange(3, 3); ta.fire('input');
await new Promise(r => setTimeout(r, 60));

ok(u.canUndo(), '可撤销');
ok(u.undo() && ta.value === 'ab', '撤销到合并快照 ab');
ok(u.undo() && ta.value === 'a', '撤销到 a');
ok(u.undo() && ta.value === '', '撤销到空（初始快照）');
ok(!u.canUndo(), '栈底不可再撤');
ok(u.redo() && ta.value === 'a', '重做 a');
ok(u.redo() && ta.value === 'ab', '重做 ab');
ok(u.redo() && ta.value === 'abc', '重做 abc');
ok(!u.canRedo(), '栈顶不可再重做');

// 程序化修改 + 强制入栈
ta.value = 'abc **粗体**'; u.push(true);
ok(u.undo() && ta.value === 'abc', '强制入栈后可撤销程序化修改');
ok(u.redo() && ta.value === 'abc **粗体**', '重做程序化修改');

// 超限清理
const ta2 = fakeTA();
const u2 = window.BKN.undo.attach(ta2, { limit: 5, mergeMs: 0 });
for (let i = 0; i < 20; i++) { ta2.value = 'x'.repeat(i + 1); u2.push(true); }
ok(u2.canUndo(), '超限后仍可撤销');
let depth = 0;
while (u2.undo()) depth++;
ok(depth === 4, '深度限制生效（可撤销次数 = limit-1，实际 ' + depth + '）');

console.log(`test-undo: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
