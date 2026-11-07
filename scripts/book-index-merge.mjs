/* ============================================================
   book-index-merge.mjs — 合并书阁书目索引
   ------------------------------------------------------------
   背景：书籍数据的真源是 BookBlackNet 仓库（线上写作台发布的
   书直接写它）。本地 book/docs/books/index.json 只是一份开发
   快照，直接 cp 过去会把线上发布的条目冲掉（2026-11-01 实际
   发生过一次：用户的「未test作品」被覆盖丢失）。

   策略：以远端索引为基底，只补「本地有、远端没有」的条目；
   远端已有的条目一律保留（不删除、不覆盖）。

   用法：node scripts/book-index-merge.mjs <本地index> <远端index>
        改动时原地写回远端文件；无变化则不动并返回码 2。
   ============================================================ */
import fs from 'node:fs';

const [, , localPath, remotePath] = process.argv;
if (!localPath || !remotePath) {
  console.error('用法: node book-index-merge.mjs <本地index> <远端index>');
  process.exit(1);
}

const readJSON = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
};

const local = readJSON(localPath);
const remote = readJSON(remotePath);

// 远端不存在 → 首次同步，直接用本地
if (!remote) {
  if (!local) { console.error('!! 本地与远端都没有 index.json'); process.exit(1); }
  fs.mkdirSync(remotePath.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(remotePath, JSON.stringify(local, null, 2) + '\n');
  console.log('· 远端无索引，写入本地版本（' + (local.books || []).length + ' 本）');
  process.exit(0);
}

const remoteBooks = Array.isArray(remote.books) ? remote.books : [];
const localBooks = Array.isArray(local && local.books) ? local.books : [];
const have = new Set(remoteBooks.map(b => b && b.id).filter(Boolean));

// 只补「远端真的有正文文件」的条目：书被 unpublish 后正文从仓库删除、
// 索引条目也随之移除，但本地快照里往往还留着这一行 —— 直接补回去会变成
// 点开 404 的死条目（2026-11-07 实际发生过）。
const remoteDir = remotePath.replace(/[\\/][^\\/]+$/, '');
const hasBody = (b) => {
  if (!b || !b.id) return false;
  return [b.file, b.id + '.book'].filter(Boolean)
    .some((n) => fs.existsSync(remoteDir + '/' + n));
};

const added = localBooks.filter(b => b && b.id && !have.has(b.id));
const skipped = added.filter((b) => !hasBody(b));
const keep = added.filter((b) => hasBody(b));
if (skipped.length) {
  skipped.forEach((b) => console.log('    - 跳过 ' + b.id + ' / ' + (b.title || '') + '（远端无正文文件）'));
}
if (!keep.length) {
  process.exit(2);            // 无变化，调用方据此跳过
}

// 新条目按 updatedAt 降序并入，与原发布逻辑（unshift 到最前）一致
const merged = remoteBooks.concat(keep).sort((a, b) => {
  const ta = Date.parse(a.updatedAt || 0) || 0;
  const tb = Date.parse(b.updatedAt || 0) || 0;
  return tb - ta;
});

const out = {
  format: remote.format || 'bookblacknet.index',
  v: remote.v || 1,
  updatedAt: new Date().toISOString(),
  books: merged.slice(0, 500)
};
fs.writeFileSync(remotePath, JSON.stringify(out, null, 2) + '\n');
console.log('· 索引合并：远端 ' + remoteBooks.length + ' 本 + 本地新增 ' + keep.length +
  ' 本 → ' + out.books.length + ' 本');
keep.forEach(b => console.log('    + ' + b.id + ' / ' + (b.title || '')));
process.exit(0);
