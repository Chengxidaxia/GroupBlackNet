#!/usr/bin/env bash
# ============================================================
# netlify-build.sh — Netlify 发布目录组装
# 只把「站点真正需要的东西」复制到 dist/，源码与本地工具不进产物。
#
# 本地：bash scripts/netlify-build.sh
# 瘦身：BOOKS_INCLUDE=0 bash scripts/netlify-build.sh   （产物不带 .book）
# 换目录：DIST_DIR=dist2 bash scripts/netlify-build.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -n "${DIST_DIR:-}" ]; then
  case "$DIST_DIR" in
    /*|[A-Za-z]:[\\/]*) DIST="$DIST_DIR" ;;
    *) DIST="$ROOT/$DIST_DIR" ;;
  esac
else
  DIST="$ROOT/dist"
fi

# 清空旧产物。个别环境（Windows 本机的 safe-delete 钩子）会拒绝删除，
# 此时降级为就地覆盖，构建仍继续，只是可能残留上一轮的孤儿文件。
if [ -d "$DIST" ]; then
  if ! rm -rf "$DIST" 2>/dev/null; then
    echo "! 无法清空 $DIST，改为就地覆盖（本机限制，Netlify 上不会出现）" >&2
  fi
fi
mkdir -p "$DIST"

# ---- 页面 ----
for f in index.html blog.html edit.html about.html contact.html 404.html \
         head.html foot.html load-commons.js config.js oauth.js \
         main.js blog.js edit.js favicon.ico .nojekyll; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$DIST/"
  else
    echo "!! 缺少文件：$f" >&2
  fi
done

# ---- 静态资源目录 ----
for d in assets img vditor; do
  if [ -d "$ROOT/$d" ]; then
    cp -r "$ROOT/$d" "$DIST/"
  fi
done

# ---- 子站：群书阁（book/，同时也能独立部署） ----
if [ -d "$ROOT/book" ]; then
  mkdir -p "$DIST/book"

  # 页面与脚本
  (cd "$ROOT/book" && \
    for item in index.html read.html write.html 404.html assets; do
      [ -e "$item" ] && cp -r "$item" "$DIST/book/"
    done)

  # 书籍目录：按需决定是否带密文
  if [ "${BOOKS_INCLUDE:-1}" = "0" ]; then
    # 只保留书目索引，正文交给 jsDelivr / raw（首页列表照旧可用）
    mkdir -p "$DIST/book/docs/books"
    [ -f "$ROOT/book/docs/books/index.json" ] && \
      cp "$ROOT/book/docs/books/index.json" "$DIST/book/docs/books/"
    echo "· BOOKS_INCLUDE=0：产物不含 .book，正文改由 CDN 提供"
  elif [ -d "$ROOT/book/docs" ]; then
    cp -r "$ROOT/book/docs" "$DIST/book/"
  fi
fi

# ---- 清理开发期残留 ----
rm -f  "$DIST/book/netlify.toml" 2>/dev/null || true
find "$DIST" -name '.DS_Store' -delete 2>/dev/null || true
find "$DIST" -name '*.map' -delete 2>/dev/null || true

# ---- 自检 ----
count=$(find "$DIST" -type f | wc -l | tr -d ' ')
size=$(du -sh "$DIST" 2>/dev/null | cut -f1)
echo "产物：$DIST（$count 个文件，约 $size）"

for must in index.html assets/site.css assets/site.js \
            book/index.html book/read.html book/write.html book/404.html \
            book/assets/js/config.js book/docs/books/index.json; do
  [ -e "$DIST/$must" ] || { echo "!! 产物缺少 $must" >&2; exit 1; }
done

# 密文不该以明文出现：抽查 .book 是否都是 JSON 且带 crypto 字段
bad=0
for f in "$DIST"/book/docs/books/*.book; do
  [ -e "$f" ] || continue
  head -c 1 "$f" | grep -q '{' || { echo "!! 非法 .book：$f" >&2; bad=1; }
  grep -q '"crypto"' "$f" || { echo "!! 缺少加密信息：$f" >&2; bad=1; }
done
[ "$bad" -eq 0 ] || exit 1

echo "OK"
