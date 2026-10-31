/* test-shelf.mjs — 书架筛选纯函数单测 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
global.window = global;
eval(fs.readFileSync(path.join(root, 'book/assets/js/core/util.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'book/assets/js/core/shelf.js'), 'utf8'));
const { shelfFilter, bookWords } = window.BKN.shelf;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('  ✗', name); } };

const books = [
  { id: 'a', meta: { title: '星辰变', author: '甲', intro: '修仙', tags: ['热血', '升级'], category: '玄幻', visibility: 'public' }, chapters: [{ content: '一二三四五' }], published: { at: 'x' }, createdAt: '2026-01-01', updatedAt: '2026-03-01' },
  { id: 'b', meta: { title: '都市之巅', author: '乙', intro: '都市生活', tags: ['日常'], category: '都市', visibility: 'private' }, chapters: [{ content: '一二' }, { content: '三四五六七八九十' }], published: null, createdAt: '2026-02-01', updatedAt: '2026-03-10' },
  { id: 'c', meta: { title: '星海孤舟', author: '甲', intro: '科幻冒险', tags: ['热血'], category: '科幻', visibility: 'public' }, chapters: [{ content: 'ab cd' }], published: null, createdAt: '2026-03-01', updatedAt: '2026-02-15' }
];

// 搜索：命中书名/作者/简介/标签
ok(shelfFilter(books, { q: '星辰' }).length === 1 && shelfFilter(books, { q: '星辰' })[0].id === 'a', '按书名搜');
ok(shelfFilter(books, { q: '热血' }).length === 2, '按标签搜');
ok(shelfFilter(books, { q: '甲' }).length === 2, '按作者搜');
ok(shelfFilter(books, { q: 'STAR' }).length === 0, '大小写不敏感但无命中');
// 分类
ok(shelfFilter(books, { cat: '玄幻' }).map(b => b.id).join() === 'a', '按分类筛');
// 状态
ok(shelfFilter(books, { status: 'published' }).length === 1, '已发布');
ok(shelfFilter(books, { status: 'draft' }).length === 2, '草稿');
ok(shelfFilter(books, { status: 'private' }).map(b => b.id).join() === 'b', '私密');
// 排序
ok(shelfFilter(books, { sort: 'updated' })[0].id === 'b', '按更新时间排');
ok(shelfFilter(books, { sort: 'created' })[0].id === 'c', '按创建时间排');
ok(shelfFilter(books, { sort: 'words' })[0].id === 'b', '按字数排');
ok(bookWords(books[1]) === 10, '字数统计');
// 组合
ok(shelfFilter(books, { q: '热血', status: 'draft', sort: 'title' }).map(b => b.id).join() === 'c', '组合筛选');
// 不改原数组
const before = books.map(b => b.id).join();
shelfFilter(books, { sort: 'words' });
ok(books.map(b => b.id).join() === before, '不修改原数组');

console.log(`test-shelf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
