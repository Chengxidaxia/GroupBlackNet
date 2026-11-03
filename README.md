# 群档案 · GroupBlackNet

群内内容的公开档案站。**文章即 GitHub Discussions**，前端是手写 HTML/CSS/JS 的纯静态站，
读取走同源 Serverless Function，写入走 GitHub OAuth —— 没有数据库，没有框架，
也没有编译步骤（部署时只做一次文件组装）。

同一个仓库里挂着两个站点：

| 站点 | 地址 | 代码位置 | 说明 |
|---|---|---|---|
| **群档案**（主站） | <https://grp.blacknet.cc.cd> | 仓库根目录 | 文章列表 / 详情 / 写稿 / 归档 / 订阅 |
| **群书阁**（子站） | <https://book.blacknet.cc.cd> | 独立仓库 `Chengxidaxia/BookBlackNet` | 长篇小说的写作与阅读；本仓库 `book/` 只是工作副本（已 gitignore） |
| 桌面客户端 | — | `CLIENTApplication/` | JDK 21 + Swing，对齐核心页面（不含归档 / 订阅 / 赞助） |

---

## 1. 架构

```
浏览器
 ├─ 静态页面：index / blog / edit / about / contact / sponsor / archive / subscribe
 │            资源：assets/site.css（设计系统）· assets/site.js（运行时 window.GB）
 ├─ 同源 /api/*  ──▶ Vercel Functions（api/*.js）
 │                    ├─ /api/discussions   Discussions 只读代理（GraphQL）
 │                    ├─ /api/oauth/*       登录 / 评论 / 反应 / 顶 / 发帖（GitHub OAuth）
 │                    ├─ /api/gh/*          同源登录态（/me、/logout）
 │                    └─ /feed.xml          RSS 2.0，每次请求实时生成
 ├─ 跨域兜底 ──▶ Cloudflare Workers（api / auth / oauth / upload / img 五个子域）
 └─ 书籍数据 ──▶ 同源 docs/books → jsDelivr 三节点并发 → raw.githubusercontent
```

- **数据真源**：`Chengxidaxia/GroupBlackNet` 仓库的 Discussions。Function 用 `GH_TOKEN`
  以服务端身份读，浏览器不接触令牌。
- **写入**：GitHub OAuth 授权后把令牌放进 `github_token` Cookie（`Domain=.blacknet.cc.cd`，
  HttpOnly），写接口靠它鉴权。Cookie 全子域生效，所以书阁也用同一套登录态。
- **后端不在本仓库**：`backend/` 是 CF Worker 源码，含凭据，已 gitignore。仓库里的
  `netlify/functions/*-core.mjs` 是与平台无关的核心逻辑，Vercel Function 与 Netlify Function
  共用同一份。

### 为什么「后端不变」

Discussions 的接口形状是固定的，无法新增字段。所有站点自定义信息（分类、封面、标签、
是否允许评论）都塞进**正文首行的 JSON**：

```jsonc
{"info":"<base64 简介>","icon":"<base64 封面>","coverText":"","category":3,"allowComments":true,"tags":["前端"]}
```

`category` 用数字 ID（兼容旧数据里的英文分类名），数据源是 `assets/data/categories.json`：

| ID | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 分类 | 公告 | 新闻 | 资讯 | 技术 | 活动 | 随笔 |

`icon` 与 `coverText` 都为空时，用分类渐变色 + 分类首字做占位封面。

---

## 2. 目录结构

```
GroupBlackNet/
├─ index.html            首页：Hero + 公告置顶 + 卡片流（排序/搜索/分类/分页）
├─ blog.html             详情页：正文 + 顶/多表情 + 评论（嵌套回复、表情、分页）
├─ edit.html             写稿页：Vditor 编辑器 + 封面 / 分类 / 标签 / 简介
├─ archive.html archive.js   归档：按年月分组、年份与分类筛选、标题正文搜索
├─ subscribe.html        订阅说明：RSS / Discussions Watch / 邮件
├─ about.html            关于
├─ contact.html          联系
├─ sponsor.html          无偿赞助说明
├─ 404.html
├─ head.html foot.html   公共头尾（load-commons.js 注入 #header-placeholder / #footer-placeholder）
├─ assets/
│  ├─ site.css           设计系统（变量、组件、响应式）
│  ├─ site.js            全站运行时 window.GB：分类、封面、Markdown 元数据、轻提示、主题
│  ├─ demo.js            仅 localhost 生效的演示数据
│  ├─ imgmap.js          图片域名映射
│  ├─ net.js             可选同源反代的 fetch 封装（书阁共用同一份）
│  ├─ data/              categories.json / announcements.json / imgmap.json
│  └─ vendor/            marked.min.js / purify.min.js
├─ vditor/4.0.0/dist/    自托管 Vditor（编辑器与预览）
├─ api/                  Vercel Functions 入口
├─ netlify/functions/    平台无关核心 + Netlify 入口（与 api/ 共用 -core.mjs）
├─ netlify.toml          Netlify 备用部署配置（redirects / headers）
├─ vercel.json           Vercel 配置（cleanUrls / rewrites / headers）
├─ scripts/              构建、同步、迁移、单测脚本
├─ CLIENTApplication/    Swing 桌面客户端
└─ book/                 群书阁工作副本（gitignore，真源在独立仓库）
```

`main.js`（首页）、`blog.js`（详情）、`edit.js`（写稿）、`oauth.js`（登录）、
`load-commons.js`（公共头尾注入）、`config.js`（`window.BLACKNET` 全站配置）。

---

## 3. 本地开发

纯静态，起一个支持 Range 的静态服务器即可：

```bash
python -m http.server 8123
```

访问 <http://127.0.0.1:8123/>。

| 事项 | 说明 |
|---|---|
| 演示数据 | `assets/demo.js` 只在 hostname 为 `localhost` / `127.0.0.1` 时挂载，右上角会显示「本地预览 · 演示数据」角标；生产域名走真实接口 |
| 生产域名直连 | `config.js → PROXY.skipOn` 含 `grp.blacknet.cc.cd`，该域下不探测反代，直接请求 Function |
| 预览面板限制 | 面板响应头带 CSP（`connect-src` 只有自身），且 CF Worker 的 CORS 只放行正式域 —— 所以本地必须靠 `demo.js`，真接口在本地预览里必然被拦 |
| 验证渲染 | 本机 Edge 无头 + CDP 真实等待最可靠：`--virtual-time-budget` 会加速定时器，把 fetch 抢死，造成「页面渲染失败」的假象 |

---

## 4. 部署

生产跑在 **Vercel**（`grp.blacknet.cc.cd`，`server: Vercel`），Netlify 与 GitHub Pages 保留为备用通道。
完整步骤、环境变量、DNS、缓存与故障排查见 **[DEPLOY.md](DEPLOY.md)**。

| 关键点 | 说明 |
|---|---|
| 构建命令 | `bash scripts/netlify-build.sh`（脚本名沿用历史，Vercel 也在用） |
| 输出目录 | `dist` |
| `cleanUrls` | 线上路径没有 `.html`（`/about` 而不是 `/about.html`），导航高亮按「去扩展名后比对」实现；页面内链接两种写法都可用 |
| 构建自检 | 脚本会检查关键文件是否存在、每个 `.book` 是否为清单或密文、并打印产物文件数与体积，任一失败即中止 |

环境变量（Vercel 项目 → Settings → Environment Variables）：

| 变量 | 用途 |
|---|---|
| `GH_TOKEN` | 读 Discussions 的只读令牌（`/api/discussions`、`/feed.xml`） |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth 登录与写入 |
| `OAUTH_REDIRECT_URI` | 回调地址，默认 `https://grp.blacknet.cc.cd/api/oauth/callback` |
| `FRONTEND_URL` | 登录完成后回跳的前端地址 |

> 换域名时后端**不用改**：前端 `config.js → PROXY.mode = 'auto'` 会在跨域被拦时自动改走
> `/proxy/<host>/...` 同源路径，由 `vercel.json` 的 rewrites 转发。带 Cookie 的
> oauth / upload **不在**反代白名单里（Cookie Domain 会对不上）。

---

## 5. 脚本

| 脚本 | 作用 |
|---|---|
| `scripts/netlify-build.sh` | 组装 `dist/`：只复制站点需要的文件，排除源码、脚本、`.md`、`_edge*` |
| `scripts/sync-book-repo.sh` | 把 `book/` 同步到 `BookBlackNet` 仓库并推送（SSH）。书籍数据**远端为准**，只补本地独有文件 |
| `scripts/book-chunk.mjs` | 把单体 `.book` 改写成「清单 + `.pXXX` 分块」（单块 ≤ 10 MiB，不拆代理对） |
| `scripts/book-index-merge.mjs` | 合并书目索引：以远端为基底，只补本地独有条目，防止覆盖线上发布 |
| `scripts/cdn-urls.mjs` | 列出 / 探测书籍数据源（`--check` 实测、`--purge` 出刷新链接），见 [CDN.md](CDN.md) |
| `scripts/local-proxy.mjs` | 本机白名单代理，配合内网穿透调试跨域 |
| `scripts/img-*.mjs` | 历史上的图床迁移 / 重试 / 重写（一次性工具） |
| `scripts/test-*.mjs` | 单测：数据源、鉴权核心、同源反代、偏好、书架筛选、撤销栈、图片源 |

---

## 6. 约定

- **功能不变、后端不变**：新增字段写进正文首行 JSON，不改 Discussions 接口形状。
- **全站不用 `alert` / `prompt`**，统一走 `GB.toast`；不显示顶部滚动进度条。
- **不提交**：`backend/`、`.env`、`.workbuddy/`、`book/`、`dist/`、`_edge*/`、`Public/`、`vercel-proxy/`。
- 页面内资源用**相对路径**；跨子站跳转用绝对域名。
- 改完 `book/` 要跑 `bash scripts/sync-book-repo.sh`，并核对 `git ls-remote origin main`
  —— 脚本的 push 偶发被静默吞掉，只有远端 SHA 变了才算成功。

---

## 7. 文档

| 文档 | 内容 |
|---|---|
| [DEPLOY.md](DEPLOY.md) | 部署与运维：Vercel / Netlify / Pages、环境变量、DNS、缓存、故障表 |
| [CDN.md](CDN.md) | 书籍数据源三层链路、版本戳与缓存、jsDelivr 限制、验收命令 |
| [book/README.md](https://github.com/Chengxidaxia/BookBlackNet/blob/main/README.md) | 群书阁：页面、格式体系（`.book` / `.bookp` / `.zip` / `.epub`）、加密与账号 |
| [CLIENTApplication/README.md](CLIENTApplication/README.md) | 桌面客户端的构建、启动器与功能对照 |

---

## 许可

见 [LICENSE](LICENSE)。
