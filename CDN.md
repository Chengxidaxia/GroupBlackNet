# jsDelivr 数据源准备

> 群书阁的 `.book` 与 `index.json` 不一定和站点在同一个仓库。
> 站点可以部署在 Netlify（GroupBlackNet 仓库），书籍放在 `BookBlackNet` 仓库，
> 这时只能靠 CDN / raw 读取 —— 这份文档就是这条链路的配置与验收说明。

## 1. 读取链路

`book/assets/js/core/api.js` 里 `loadIndex()` 与 `fetchBook()` 用同一套顺序：

```
① 同源          <站点>/docs/books/index.json      站点仓库里就有 → 最快，天然免 CORS
② jsDelivr 并发   cdn / fastly / gcore 三个节点同时发，谁先回用谁
③ raw           https://raw.githubusercontent.com/OWNER/REPO/BRANCH/docs/books/...
```

三层之间是串行，CDN 层内部是**并发竞速**（`Promise.any`）。
失败 / 超时 / 内容不对（站点返回 404 页或 SPA 的 HTML）都会自动落到下一层。
每层都有超时（同源 5s、CDN 8s），卡住的源不会拖死整页。

为什么 CDN 层要并发：实测国内 `cdn.jsdelivr.net` 和 `fastly.jsdelivr.net` 会整段超时
（各等 8 秒），串行的话首屏要白等十几秒；并发之后总耗时 = 最快节点（`gcore` 约 0.7–3s）。

顺序理由：同源永远最快；书籍仓库单独存在时同源 404，几百毫秒内落到 CDN；
raw 只作最后兜底（国内直连不稳，但路径最短）。

配置全在 `book/assets/js/config.js`：

```js
CDN: {
  enabled: true,
  hosts: ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net'],
  base: '',          // 填了就用它，忽略 hosts（自建反代 / Netlify 子域）
  timeout: 8000,     // CDN / raw 单源超时
  siteTimeout: 5000  // 同源超时
}
```

## 2. 缓存：为什么需要 `?v=`

jsDelivr 对 `@branch` 形式的 URL 有边缘缓存（官方口径约 12 小时），
`@commit` 才是永久缓存。所以「发布完立刻打开却还是旧书」是常态。

项目用的办法是**给 URL 加版本戳**：

| 场景 | 戳 | 效果 |
|---|---|---|
| 读 `index.json` | `?v=t<3 分钟桶>` | 3 分钟内共用缓存，之后自动换新 |
| 读 `.book` | `?v=<索引里的 updatedAt 数字>` | 内容变了戳才变，同版本永远命中缓存 |
| 发布 / 下架成功后 | `bustCdn()` → `?v=b<时间戳>` | 本会话立刻读新文件，不碰旧的 |

也就是说：**日常靠缓存，发布后立刻生效**，不需要手动刷新 CDN。
换浏览器或新会话第一次打开时，最多等一个 3 分钟桶。

需要强制刷新全网缓存时，用 jsDelivr 的 purge 接口（返回 JSON，几秒内生效）：

```bash
node scripts/cdn-urls.mjs --purge
```

## 3. 上线前验收

```bash
node scripts/cdn-urls.mjs            # 列出全部数据源 URL
node scripts/cdn-urls.mjs --check    # 逐个实测（状态码 / 耗时 / 大小）
```

**基线状态（2026-10-29 实测，仓库已建好并推送）**：

| 源 | index.json | .book | 备注 |
|---|---|---|---|
| 同源（`book.blacknet.cc.cd`） | — | — | 正式域名，站点根就带 `docs/books/`，最快 |
| 同源（`grp.blacknet.cc.cd/book/`） | 200 | 200 | 备用入口，GitHub Pages 直出 |
| `gcore.jsdelivr.net` | 200 / 3.1s | 200 / 0.7s | 当前最稳的 CDN 节点 |
| `cdn.jsdelivr.net` | 200 / 3.5s（曾超时） | 200 / 3.5s | 波动大 |
| `fastly.jsdelivr.net` | 超时 | — | 本机网络下不可用 |
| `raw.githubusercontent.com` | 失败 | 失败 | 本机网络下不可用 |

只要同源或任一 CDN 节点通，整条链路就算健康。
`.book` 从 jsDelivr 返回的 MIME 是 `application/vnd.framemaker`（jsDelivr 的扩展名猜测），
前端用 `res.text()` 读，不受影响。

> 站点自身始终可用 —— `book.blacknet.cc.cd` 的站点根就带 `docs/books/`；
> 主站 `scripts/netlify-build.sh` 也会把 `book/docs/` 一起复制进 `dist/book/docs/`，
> 于是 `grp.blacknet.cc.cd/book/` 同样能当同源兜底。CDN 服务于「书籍仓库独立」的部署形态。

## 4. jsDelivr 的硬限制

| 限制 | 数值 | 影响 |
|---|---|---|
| 单文件大小 | 20 MB | 一部书 100 万字 ≈ 2–3 MB 密文，够用；但别把整站图片塞进 gh |
| 仓库体积 | 建议 < 50 MB | 只放 `.book` 和 `index.json`，别放构建产物 |
| 私有仓库 | **不支持** | 书籍仓库必须是 public（正文本来就是密文，公开可接受） |
| `.book` 的 MIME | `application/octet-stream` | 前端按 `res.text()` 读，不受影响 |
| 目录列表 | `https://data.jsdelivr.com/v1/package/gh/OWNER/REPO@BRANCH` | 只用于排查，前端不依赖 |

## 5. 国内可达性

`cdn.jsdelivr.net` 在国内经常被干扰，所以 `hosts` 里放了三个域名按序降级：

| 域名 | 说明 |
|---|---|
| `cdn.jsdelivr.net` | 官方主域，海外最好 |
| `fastly.jsdelivr.net` | Fastly 直连节点，国内常比主域稳 |
| `gcore.jsdelivr.net` | Gcore 节点 |

都不行时的兜底顺序已经写好：`raw.githubusercontent.com`（同样不稳，但至少是不同的墙）。
如果目标是国内长期稳定，有两条路：

1. **自建反代**：Cloudflare Worker 反代 `cdn.jsdelivr.net`，把地址填进 `CDN.base`；
2. **换存储**：把书放对象存储（R2 / B2），同样填 `CDN.base`，路径结构保持一致即可。

`CDN.base` 的约定是「站点根 + 相对路径」。正式站 `book.blacknet.cc.cd` 的站点根里
本来就有 `docs/books/`，所以**默认留空**——同源这一层已经是最快、最近的源。
只有另建了镜像（Worker 反代 / 对象存储）时才填，例如填 `https://cdn.example.com`
就会请求 `https://cdn.example.com/docs/books/index.json`。

> 别把 `CDN.base` 填成本站域名：那等于绕开超时保护又跑一遍同源，纯浪费。

## 6. 上线步骤

1. 建仓库 `Chengxidaxia/BookBlackNet`（public）。
2. 把 `book/docs/books/` 原样推到该仓库（`index.json` + `*.book`）。
3. 确认默认分支是 `main`（不是就去改 `config.js` 的 `BRANCH`）。
4. 跑 `node scripts/cdn-urls.mjs --check`，至少同源或一个 CDN 节点可用即可。
5. 打开 `https://book.blacknet.cc.cd/`，F12 看 `<html data-book-source="...">` ——
   `site` 表示走同源（预期值），`cdn` 表示同源没书、成功落到 jsDelivr，`none` 表示三层全挂。
6. 发布一本书，看 Network 里 `.book` 请求是否带 `?v=b...` —— 带上了说明
   `bustCdn()` 生效，刷新即可看到新版本。

## 7. 同步本地改动到书籍仓库

`BookBlackNet` 仓库是书籍的唯一真源（在线写作台的发布直接写它），本地 `book/docs`
只是开发副本。改完站点文件后一条命令同步：

```bash
bash scripts/sync-book-repo.sh          # 复制 → 提交 → 推送（SSH，不弹凭据）
DRY=1 bash scripts/sync-book-repo.sh    # 只看会改什么
```

> 注意：脚本是「覆盖同名 + 新增」，**不会删除**目标仓库里多出来的文件。
> 要删书请在网页端下架，或手动 `git rm`。
