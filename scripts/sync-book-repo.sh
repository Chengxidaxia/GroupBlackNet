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
# 注意：在线写作台发布的书籍是直接写这个仓库的，本地 book/docs 只是
#       开发副本。同步前先确认本地的书不比线上新，否则会被覆盖。
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
cd "$ROOT/book"
for item in index.html read.html write.html editor.html 404.html CNAME assets docs vercel.json api README.md; do
  [ -e "$item" ] && cp -r "$item" "$WORK/"
done
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
