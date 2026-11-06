# 部署与运维

> 线上两个站点都跑在 **Vercel**；Netlify 与 GitHub Pages 保留为备用通道。
> 书籍数据源的三层链路见 [CDN.md](CDN.md)。

| 站点 | 域名 | Vercel 项目连的仓库 | 根目录 |
|---|---|---|---|
| 群档案（主站） | <https://grp.blacknet.cc.cd> | `Chengxidaxia/GroupBlackNet` | 仓库根 |
| 群书阁（子站） | <https://book.blacknet.cc.cd> | `Chengxidaxia/BookBlackNet` | 仓库根 |

两站都是纯静态 + 同源 Serverless Function，**没有数据库、没有容器**。

---

## 1. 主站（Vercel）

`vercel.json` 已写死全部配置，面板上不需要改任何构建设置。

| 项 | 值 |
|---|---|
| Framework Preset | Other |
| Build Command | `bash scripts/netlify-build.sh`（脚本名沿用历史，Vercel 也在用） |
| Output Directory | `dist` |
| Install Command | 无（没有依赖，`package.json` 只声明 `"type": "module"`） |
| Node | 22.x |

构建做的事：把页面、`assets/`、`img/`、`vditor/`、`book/`（按需）复制到 `dist/`，
再跑三道自检，然后打印产物文件数与体积。源码、`scripts/`、`.md`、`_edge*/` 一律不进产物。

### 1.1 路由

| 规则 | 作用 |
|---|---|
| `cleanUrls: true` | 线上路径没有 `.html`：`/about`、`/archive`、`/subscribe` |
| `trailingSlash: false` | `/about/` 会跳回 `/about` |
| `/feed.xml` → `/api/feed` | RSS 2.0，每次请求实时读 Discussions |
| `/api/discussions`、`/api/gh/*`、`/api/oauth/*` | 同源 Function |
| `/proxy/<host>/*` → 对应上游 | 前端同源反代（见 §4） |

> **`cleanUrls` 的副作用**：`location.pathname` 里没有 `.html`，任何「按文件名比对」的逻辑都会失效
> （导航高亮就踩过这个坑，现在按「去扩展名后比对」实现）。新写脚本时注意。

### 1.2 环境变量

| 变量 | 必填 | 用途 |
|---|---|---|
| `GH_TOKEN` | 是 | 读 Discussions 的只读令牌（`/api/discussions`、`/feed.xml`） |
| `GITHUB_CLIENT_ID` | 是 | OAuth App 的 Client ID |
| `GITHUB_CLIENT_SECRET` | 是 | OAuth App 的 Secret |
| `OAUTH_REDIRECT_URI` | 否 | 默认 `https://grp.blacknet.cc.cd/api/oauth/callback` |
| `FRONTEND_URL` | 否 | 登录完成后回跳地址，默认主站 |
| `GLOBAL_CONFIG` | 建议 | Global Config 连接串（`https://global-config.vercel.com/<id>?token=…`），分类与公告从它读；缺失时 `/api/content` 回退内置默认值 |

改动环境变量后必须 **Redeploy** 才会带进新的 Function 实例。
`GH_TOKEN` 缺失时列表页直接空 —— 这是最常见的「线上打不开」原因。

> 分类与公告已改为读 **Vercel Global Config**（与 `vercel-proxy` 同一个服务），在面板里改 JSON
> 即可秒级生效、不用 Redeploy。仓库里的 `assets/data/categories.json`、`announcements.json`
> 保留为兜底：线上优先走 `/api/content`，读不到才回落静态文件。

### 1.3 缓存与安全头

`vercel.json → headers`：

| 路径 | Cache-Control | 理由 |
|---|---|---|
| `/assets/*` | `max-age=0, must-revalidate` | 站点脚本/样式，改版要立刻生效 |
| `/img/*` | `max-age=2592000` | 静态图片 |
| `/vditor/*` | `max-age=31536000, immutable` | 带版本号的第三方库目录 |

全站附带 `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、
`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy` 收紧摄像头/麦克风/定位。

---

## 2. 群书阁（Vercel）

| 项 | 值 |
|---|---|
| 仓库 | `Chengxidaxia/BookBlackNet`（**根即站点**，不是主仓库 + Base directory） |
| Build Command | 无 |
| Output Directory | `.` |
| 配置 | 该仓库根的 `vercel.json`（`cleanUrls`、`/api/*`、`/proxy/*`、`/docs/books/*` 头） |

> **为什么连 `BookBlackNet` 而不是主仓库的 `book/` 目录**：读书是「同源优先」。
> 连主仓库副本的话，线上写作台发布的新书不会出现在同源里，要等手动同步。
> 连 `BookBlackNet` 时同源就是真源，发布完刷新即见。

环境变量：

| 变量 | 用途 |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 邮箱账号、会话、账号书架（`/api/auth`、`/api/shelf`） |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 同上；Vercel Marketplace 集成写的是这套名字，代码两种都认 |

绑定方式：Vercel → Storage → 新建 Upstash Redis → Connect 到本项目，变量自动注入。
没有这两个变量时：`/api/auth` 返回 503，书架自动退回「仅保存在本机」，其余功能不受影响。

---

## 3. 域名与 DNS

两个域都在 Cloudflare，记录指向 Vercel：

| 域名 | 记录 | 目标 |
|---|---|---|
| `grp.blacknet.cc.cd` | CNAME | `cname.vercel-dns.com`（或 Vercel 面板给出的专用值） |
| `book.blacknet.cc.cd` | CNAME | 同上 |

要点：

1. **代理状态先设灰云（DNS only）**，等 Vercel 里证书状态变成 Valid 再考虑开橙云。
2. 如果该域**历史上指向过 GitHub Pages**（4 条 A 记录 `185.199.108-111.153`），必须
   **全部删掉**只留 CNAME —— 两种记录并存会一半请求打到旧站，表现为「页面时好时坏」。
3. Vercel 项目 → Settings → Domains 里加域，按提示加 TXT 验证（若提示需要）。

> `github_token` Cookie 的 Domain 是 `.blacknet.cc.cd`，所以主站与书阁共享登录态；
> 换域名会直接掉登录，届时 Cookie 的 Domain 与 oauth Worker 的 CORS / `FRONTEND_URL` 要一起改。

---

## 4. 同源反代（后端零改动）

后端的 CORS 只放行固定域名。站点换域（预览域 / 自定义域 / 本机）时，前端会在
「被拦或探不到」时自动把请求改写成站点同源路径，由 `vercel.json` 转发：

| 前端原本请求 | 改写为 | 转发到 |
|---|---|---|
| `https://api.blacknet.cc.cd/?first=24` | `/proxy/api.blacknet.cc.cd/?first=24` | 同上游 |
| `https://api.github.com/...` | `/proxy/api.github.com/...` | 同上游 |
| `https://raw.githubusercontent.com/...` | `/proxy/raw.githubusercontent.com/...` | 同上游 |
| `oauth` / `upload` / `img.blacknet.cc.cd` | `/proxy/<host>/...` | 同上游 |

同源请求浏览器不做 CORS 校验、不发预检，所以上游一行都不用改。

| 配置（`config.js → PROXY`） | 说明 |
|---|---|
| `mode: 'auto'`（默认） | 先试反代，站点没配这条转发（404）或网络错 → 本会话改直连，不再试 |
| `mode: 'always'` | 只走反代，失败就失败（排查用） |
| `mode: 'off'` | 完全直连 |
| `skipOn` | 在该域名下跳过探测直接直连（生产域已豁免，省一次往返） |
| `hosts` | 白名单，只放只读接口 |

**主站的 `hosts` 里只有只读接口**：oauth / upload 依赖 Cookie，主站那份一律不进白名单。
书阁那份包含 oauth / upload / img，是因为 Cookie 本身就在 `.blacknet.cc.cd` 下，同源代理会原样携带。

排查：Console 会打印 `[proxy] 站内反代不可用（HTTP 404），本会话改直连：/proxy/...`；
运行时状态在 `GB.net.state`（主站）/ `BKN.api.net.state`（书阁）的 `hits / misses / dead`。
单测：`node scripts/test-proxy.mjs`。

---

## 5. 构建产物与自检

`scripts/netlify-build.sh` 的复制清单：

```
主站：index blog edit about contact sponsor archive subscribe 404
      head foot load-commons config oauth main blog edit archive.js favicon.ico .nojekyll
      assets/ img/ vditor/
书阁：index book books shelf convert sponsor read write editor 404 + assets/ api/
      docs/（BOOKS_INCLUDE=0 时不带）
```

**不会**进产物：`backend/`、`.workbuddy/`、`CLIENTApplication/`、`scripts/`、`*.toml`、
`vercel.json`、`dist/`、`_edge*/`、所有 `.md`。

自检（任一失败即中止构建）：

1. 关键文件存在：`index.html`、`assets/site.css`、`assets/site.js`、`assets/net.js`；
2. 带书籍时检查 `book/docs/books/index.json`；
3. 每个 `.book`：
   - 是分块清单（`format: bookblacknet.chunks`）→ 校验清单里列出的 `.pXXX` 确实存在；
   - 是旧版单文件 → 必须是 JSON 且含 `"crypto"`（防止明文正文入库）。

可选环境变量：

| 变量 | 默认 | 作用 |
|---|---|---|
| `BOOKS_INCLUDE` | `1` | `0` 时产物不带 `book/docs`，书籍全部走 CDN 真源（主站生产用的就是 `0`） |
| `DIST_DIR` | `dist` | 换一个输出目录（本地对比测试用） |

本地先跑一遍：

```bash
bash scripts/netlify-build.sh
```

---

## 6. 备用通道：Netlify

根目录 `netlify.toml` 仍然可用（构建 + redirects + headers 与 Vercel 基本等价）：

| 项 | 值 |
|---|---|
| Build command | `bash scripts/netlify-build.sh` |
| Publish directory | `dist` |
| 环境变量 | 同 §1.2，外加 `BOOKS_INCLUDE=0` |

书阁走 Netlify 时连 `BookBlackNet` 仓库，Base directory 留空、无构建、`publish = "."`。

> Netlify 只读取 **Base directory 下面**的 `netlify.toml`。用 `book/` 里的那份配置时，
> Base directory 必须填 `book`，否则读的是根目录那份（主站配置）。
> 本机预览：`netlify dev`（会自动跑一次构建，起 8888）。

## 7. 备用通道：GitHub Pages

`.github/workflows/static.yml` 在 push 到 `main` 时把**整个仓库**作为站点发布，
`CNAME`（内容 `grp.blacknet.cc.cd`）随仓库下发。

- 书籍数据不在仓库里（`book/` 已 gitignore），所以 Pages 上 `/book/` 只是空壳；
- 没有 `/proxy/*` 转发，`net.js` 收到 404 会自动降级直连，功能不受影响；
- 与 Vercel 同时在跑会导致 DNS 抢流量，**只在 Vercel 故障时临时切回**。

---

## 8. 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| Vercel 构建报 `!! 产物缺少 xxx` | 关键文件没进仓库 | 本地跑一遍 `bash scripts/netlify-build.sh` 复现，补齐再 push |
| 构建报 `!! 清单分块缺失` | `.book` 清单里引用的 `.pXXX` 没提交 | 跑 `node scripts/book-chunk.mjs --dry` 看清单，补齐分块 |
| 构建报 `!! 缺少加密信息` | 有人把明文 `.book` 提交进来了 | 用站点重新发布那本书，或 `book-chunk.mjs` 重写 |
| 构建成功但页面 404 | Output Directory 被面板手改 | 改回 `dist`，或删掉面板里的覆盖值让 `vercel.json` 生效 |
| 首页一片空白 | 缺 `GH_TOKEN`，Function 读不到 Discussions | 补变量后 Redeploy |
| 导航高亮全部失效 | `cleanUrls` 下 pathname 无 `.html` | 比对前去掉扩展名 |
| Console 报 CORS | 上游白名单没有当前域 | 让前端走反代（`auto` 已是默认），或把域加进 Worker 白名单 |
| 登录后刷新掉登录 | Cookie Domain / `FRONTEND_URL` / 回调地址不一致 | 三处都必须是 `*.blacknet.cc.cd` 体系内的域 |
| 发布后书籍还是旧的 | CDN 边缘缓存 | 发布成功会 `bustCdn()` 换版本戳；全网刷新见 [CDN.md](CDN.md) §2 |
| 书阁仓库改了线上却没变 | 同步脚本的 push 被静默吞掉 | 手动 `git push` 后核对 `git ls-remote origin main`，SHA 变了才算成功 |

---

## 9. 回滚

| 平台 | 操作 |
|---|---|
| Vercel | Deployments → 选上一个成功部署 → **Promote to Production** |
| Netlify | Deploys → 选上一次成功部署 → **Publish deploy** |
| 书阁数据 | 书籍在 `BookBlackNet` 仓库，`git revert` 对应提交即可；书目索引是 `docs/books/index.json` |
| 域名 | 把 CNAME 改回上一家（Pages 的 A 记录需重新加回），几分钟生效 |
