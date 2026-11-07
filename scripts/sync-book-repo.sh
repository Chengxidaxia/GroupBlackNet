#!/usr/bin/env bash
# ============================================================
# sync-book-repo.sh — 把 book/ 同步到 BookBlackNet 仓库并推送
# ------------------------------------------------------------
# 用途：本地改完站点文件后，一条命令同步到书籍仓库（jsDelivr 与
#       独立部署都读这个仓库）。走 SSH，不会弹凭据框。
#
# 用法：
#   bash scripts/sync-book-repo.sh            同步 + 提交 + 推送
#   DRY=1 bash scripts/sync-book-repo.sh      只看会改什么，不提交
#
# 注意：书籍数据（docs/）以远端为准 —— 线上写作台发布的书直接写这个
#       仓库，本地 book/docs 只是开发快照。本站脚本对 docs/ 只做「补入
#       远端没有的文件」+「索引合并」，绝不会覆盖线上已有的书与条目。
#       确实要用本地文件覆盖同名书时：FORCE_BOOKS=1 bash scripts/sync-book-repo.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${BOOK_REPO_REMOTE:-git@github.com:Chengxidaxia/BookBlackNet.git}"
WORK="${BOOK_REPO_DIR:-$ROOT/.workbuddy/tmp/book-repo}"
SSH_CMD="ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15"

# ---- 准备本地克隆 ----
if [ ! -d "$WORK/.git" ]; then
  echo "· 首次同步，克隆 $REMOTE → $WORK"
  mkdir -p "$(dirname "$WORK")"
  if ! GIT_SSH_COMMAND="$SSH_CMD" git clone -q "$REMOTE" "$WORK" 2>/dev/null; then
    mkdir -p "$WORK"
    git -C "$WORK" init -q -b main
    git -C "$WORK" remote add origin "$REMOTE" 2>/dev/null || \
      git -C "$WORK" remote set-url origin "$REMOTE"
  fi
fi

# ---- 复制站点文件（覆盖同名；源里删掉的文件不会跟着删） ----
# 注意：docs/ 不在这里复制 —— 书籍数据的真源是远端仓库，
#       线上写作台发布的书直接写进去，用本地快照覆盖会丢条目。
cd "$ROOT/book"
for item in index.html book.html books.html collections.html author.html works.html shelf.html convert.html sponsor.html read.html write.html editor.html 404.html CNAME assets vditor vercel.json api lib README.md; do
  [ -e "$item" ] && cp -r "$item" "$WORK/"
done

# ---- 书籍数据 docs/：远端为准，本地只补「远端没有的」 ----
# FORCE_BOOKS=1 时才允许用本地文件覆盖同名书（改示例书时用）
# SKIP_DOCS=1 时整段跳过（只想同步页面改动、不想把本地测试书推到线上书库时用）
if [ -d "$ROOT/book/docs" ] && [ "${SKIP_DOCS:-0}" != "1" ]; then
  mkdir -p "$WORK/docs"
  ( cd "$ROOT/book/docs" && find . -type f ! -path './books/index.json' -print ) | while IFS= read -r rel; do
    rel="${rel#./}"
    [ -n "$rel" ] || continue
    tgt="$WORK/docs/$rel"
    if [ ! -e "$tgt" ]; then
      mkdir -p "$(dirname "$tgt")"
      cp "$ROOT/book/docs/$rel" "$tgt"
      echo "  + 补入书籍文件 $rel"
    elif [ "${FORCE_BOOKS:-0}" = "1" ]; then
      cp "$ROOT/book/docs/$rel" "$tgt"
      echo "  * 覆盖书籍文件 $rel（FORCE_BOOKS=1）"
    fi
  done

  # 索引：远端条目为主体，只补本地独有条目（远端有的一律保留）
  if [ -f "$ROOT/book/docs/books/index.json" ]; then
    mrc=0
    node "$ROOT/scripts/book-index-merge.mjs" \
      "$ROOT/book/docs/books/index.json" "$WORK/docs/books/index.json" || mrc=$?
    if [ "$mrc" = "0" ]; then
      :
    elif [ "$mrc" = "2" ]; then
      echo "· 索引无新增条目"
    else
      echo "!! 索引合并失败（exit $mrc）" >&2
      exit 1
    fi
  fi
fi
touch "$WORK/.nojekyll"

# ---- 提交 ----
cd "$WORK"
if [ -z "$(git status --porcelain)" ]; then
  echo "· 无变化，跳过提交"
  exit 0
fi

git status --short | head -20
if [ "${DRY:-0}" = "1" ]; then
  echo "· DRY=1，未提交"
  exit 0
fi

git add -A
git commit -q -m "sync: 从主仓库同步 book/（$(date +%Y-%m-%d\ %H:%M)）"

# 不要接管道（tail / head 会提前关闭 stdout，git 拿到 SIGPIPE 可能没推完就退出）
GIT_SSH_COMMAND="$SSH_CMD" git push origin main || true

if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  echo "· 已推送。jsDelivr 缓存约 3 分钟内自动换新；急用可：node scripts/cdn-urls.mjs --purge"
else
  echo "!! 推送没完成（本地领先远端）。重跑一次本脚本即可，或手动：cd \"$WORK\" && git push origin main" >&2
  exit 1
fi
