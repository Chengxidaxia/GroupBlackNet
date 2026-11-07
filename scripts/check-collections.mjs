// 作品集反查索引的增量逻辑自检：node scripts/check-collections.mjs
// （只测纯函数，不连 GitHub，不需要任何凭据）
import { byBookApply } from '../book/api/collections.js';

let fail = 0;
const norm = (o) => {
  // by-book 内部数组顺序不影响显示（前端按 index.json 重排），
  // 但为便于断言，这里先把每个数组排序
  const r = {};
  Object.keys(o).sort().forEach((k) => { r[k] = Array.isArray(o[k]) ? [...o[k]].sort() : o[k]; });
  return r;
};
const eq = (name, got, want) => {
  const ok = JSON.stringify(norm(got)) === JSON.stringify(norm(want));
  if (!ok) { fail++; console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); }
  else console.log('ok  ', name);
};

// ① 新建集合：登记两本书
let books = {};
byBookApply(books, 'cl_a', ['bk_1', 'bk_2']);
eq('新建登记', books, { bk_1: ['cl_a'], bk_2: ['cl_a'] });

// ② 另一集合也收 bk_1
byBookApply(books, 'cl_b', ['bk_1', 'bk_3']);
eq('多集合共存', books, { bk_1: ['cl_a', 'cl_b'], bk_2: ['cl_a'], bk_3: ['cl_b'] });

// ③ 集合改书单：移出 bk_2，加入 bk_4
byBookApply(books, 'cl_a', ['bk_1', 'bk_4']);
eq('改书单', books, { bk_1: ['cl_a', 'cl_b'], bk_3: ['cl_b'], bk_4: ['cl_a'] });

// ④ 重复应用同一书单（幂等）
byBookApply(books, 'cl_a', ['bk_1', 'bk_4']);
eq('幂等', books, { bk_1: ['cl_a', 'cl_b'], bk_3: ['cl_b'], bk_4: ['cl_a'] });

// ⑤ 空掉一个集合（移出所有书）
byBookApply(books, 'cl_a', []);
eq('清空书单', books, { bk_1: ['cl_b'], bk_3: ['cl_b'] });

// ⑥ 删除集合
byBookApply(books, 'cl_b', []);
eq('删除集合', books, {});

// ⑦ 顺序稳定：先删后加不会重复
books = { bk_1: ['cl_x', 'cl_y'] };
byBookApply(books, 'cl_x', ['bk_1']);
eq('不产生重复', books, { bk_1: ['cl_x', 'cl_y'] });

// ⑧ 脏数据（value 不是数组）
books = { bk_1: 'oops' };
byBookApply(books, 'cl_z', ['bk_1']);
eq('脏数据自愈', books, { bk_1: ['cl_z'] });

console.log(fail ? '\n' + fail + ' 项失败' : '\n全部通过');
process.exit(fail ? 1 : 0);
