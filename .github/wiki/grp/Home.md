# 群档案 · GroupBlackNet

以 **GitHub Discussions** 为数据源的个人站点群。三个站点、一套部署方式、一套后端：纯静态页面托管在 Vercel，动态能力由同仓库的 Vercel Functions 提供。

> 这一页只做「地图」——告诉你东西在哪、改哪儿推哪个仓库。技术细节在仓库里的 Markdown 文档。

## 三个站点

| 站点 | 域名 | 是什么 | 代码在哪 | Root Directory |
|---|---|---|---|---|
| 群档案（主站） | [grp.blacknet.cc.cd](https://grp.blacknet.cc.cd) · [blacknet.cc.cd](https://blacknet.cc.cd) | 文章、评论、公告，数据来自 Discussions | 主仓库根目录 | 仓库根 |
| 群书阁 | [book.blacknet.cc.cd](https://book.blacknet.cc.cd) | 长篇阅读器 + 写作编辑器 + 作品集 | 主仓库 `book/`，另有独立仓库 [BookBlackNet](https://github.com/Chengxidaxia/BookBlackNet) | `book` |
| 服务状态 | [status.blacknet.cc.cd](https://status.blacknet.cc.cd) | 各站点每 2 分钟探测一次，展示可用率与故障记录 | 主仓库 `status/` | `status` |

## 一张图

```text
浏览器
  │
  ├─ grp.blacknet.cc.cd ─────┐
  ├─ book.blacknet.cc.cd ────┤  静态页面（Vercel）
  └─ status.blacknet.cc.cd ──┘        │
                                      │ 同源 /api/*
                                      ▼
                            Vercel Functions
                     discussions / oauth / content / feed
                     book: publish / works / shelf / imgup / collections
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    GitHub Discussions        Upstash Redis            GitHub 仓库文件
    文章 · 评论 · 反应        分类公告 · 草稿 · 书架     书阁书目 · 正文 · 作品集
```

三个站点都**没有独立服务器**，也没有数据库进程：写操作要么落到 GitHub（Discussion / 仓库文件），要么落到 Upstash（Redis over HTTP）。

## 我要改 X，该动哪儿

| 想做的事 | 改哪里 | 推哪个仓库 |
|---|---|---|
| 改主站版式 / 样式 | `assets/site.css`、各页面 HTML | 主仓库 |
| 加一篇文章 | 不用改代码，在 Discussions 里发（分类决定归属） | — |
| 改文章分类 / 公告 | `assets/data/categories.json` + Upstash `bn:content` | 主仓库 |
| 改书阁阅读器 / 编辑器 | `book/assets/js/**`、`book/assets/css/**` | `book/`（`bash scripts/sync-book-repo.sh`） |
| 改书阁书目 | `book/docs/books/index.json` | 同上 |
| 加一个状态探测项 | `backend/status-probe.blacknet.cc.cd.js` 的 `TARGETS`，然后 `wrangler deploy` | **不进仓库**（backend 被 gitignore） |
| 改状态页展示 | `status/app.js`、`status/style.css` | 主仓库 |
| 改路由 / 环境变量 | `vercel.json`、Vercel 项目设置 | 主仓库 |

## 常用命令

```bash
# 本地预览主站（构建到 dist/）
bash scripts/netlify-build.sh && npx serve dist -l 8080

# 本地预览书阁（纯静态，直接起服务）
python -m http.server 8792 --bind 127.0.0.1   # 在 book/ 里跑

# 发一篇文章到 Discussions（正文首行必须是元数据 JSON）
node scripts/post-blog.mjs --title "标题" --file 正文.md

# 看「上次发稿到现在」有哪些更新
node scripts/collect-updates.mjs

# 把 book/ 同步到 BookBlackNet 仓库
bash scripts/sync-book-repo.sh
```

**push 即部署**：三个项目都是 Git 集成自动构建，`git push` 之后等 1–2 分钟即可。

## 判断线上是否真的更新了

别只看 `X-Vercel-Cache: HIT`：边缘缓存命中时返回的是旧文件。加个随机参数再请求：

```bash
curl -s "https://status.blacknet.cc.cd/app.js?cb=$RANDOM" | md5sum
md5sum status/app.js
```

或者用 `node .workbuddy/preview/wait-file.mjs <本地文件> <线上URL> <轮询次数>` 自动轮询到一致。

## 仓库文档

| 文档 | 内容 |
|---|---|
| [README.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/README.md) | 双站架构、页面与脚本清单、本地开发、约定 |
| [DEPLOY.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/DEPLOY.md) | Vercel 部署、环境变量、DNS、缓存、故障排查 |
| [CDN.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/CDN.md) | 书阁数据源三层与 CDN 策略 |
| [book/README.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/book/README.md) | 书阁功能地图、格式体系、加密链路、接口 |
| [status/README.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/status/README.md) | 探测规则、分级阈值、四档颜色口径 |

有问题先看 [[FAQ]]。
