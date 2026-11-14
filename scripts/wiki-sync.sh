#!/usr/bin/env bash
# ============================================================
# 把 .github/wiki/<grp|book>/ 的内容同步到对应仓库的 Wiki
# ------------------------------------------------------------
# 用法：
#   bash scripts/wiki-sync.sh grp          # 同步主仓库 wiki
#   bash scripts/wiki-sync.sh book         # 同步书阁 wiki
#   bash scripts/wiki-sync.sh grp --dry    # 只看会改哪些文件
#
# 前提：对应仓库的 Wiki 已经**在网页上创建过首页**（Home 页）。
#       GitHub 不会自动建 *.wiki.git，没建过的话 clone 会报 Repository not found。
#
# 源文件：.github/wiki/grp/ 与 .github/wiki/book-wiki/（随主仓库版本管理，不进构建产物）
# 目标：  git@github.com:Chengxidaxia/<Repo>.wiki.git
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHICH="${1:-}"
DRY="${2:-}"

case "$WHICH" in
  grp)  REPO="GroupBlackNet"; SRCNAME="grp" ;;
  book) REPO="BookBlackNet";  SRCNAME="book-wiki" ;;   # 目录叫 book-wiki：.gitignore 里有 book/ 规则
  *) echo "用法：bash scripts/wiki-sync.sh <grp|book> [--dry]"; exit 1 ;;
esac

SRC="$ROOT/.github/wiki/$SRCNAME"
WORK="$ROOT/.workbuddy/tmp/wiki-$WHICH"
URL="git@github.com:Chengxidaxia/$REPO.wiki.git"

[ -d "$SRC" ] || { echo "源目录不存在：$SRC"; exit 1; }

export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15"

if [ ! -d "$WORK/.git" ]; then
  echo "→ clone $URL"
  rm -rf "$WORK"
  git clone --quiet "$URL" "$WORK" || {
    echo
    echo "clone 失败：这个仓库的 Wiki 还没创建。"
    echo "打开 https://github.com/Chengxidaxia/$REPO/wiki ，点「Create the first page」，随便写两字保存，再重跑本脚本。"
    exit 2
  }
else
  echo "→ 复用已有 clone"
  git -C "$WORK" pull --quiet --rebase || true
fi

# 只同步 Markdown；不删目标端多余文件之外的任何东西（这里用 --delete 保证以本地为准）
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --include='*.md' --exclude='*' "$SRC/" "$WORK/"
else
  find "$WORK" -maxdepth 1 -type f -name '*.md' -delete
  cp "$SRC"/*.md "$WORK"/
fi

echo "→ 变更："
git -C "$WORK" add -A
git -C "$WORK" status --short

if [ "$DRY" = "--dry" ]; then
  echo "[dry] 未提交"
  exit 0
fi

if git -C "$WORK" diff --cached --quiet; then
  echo "没有变更，结束。"
  exit 0
fi

git -C "$WORK" -c user.name="Chengxidaxia" -c user.email="Chengxidaxia@users.noreply.github.com" \
  commit --quiet -m "wiki: sync from .github/wiki/$SRCNAME"
git -C "$WORK" push --quiet origin HEAD
echo "✓ 已推送：https://github.com/Chengxidaxia/$REPO/wiki"
