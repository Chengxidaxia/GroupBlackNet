# 书籍数据源与缓存

> 群书阁的书（`.book`）不一定和站点在同一个仓库，也可能被部署在同一仓库。
> 这份文档说明「一份书从仓库到读者浏览器」的完整链路：怎么取、怎么分块、怎么保证
> 发布后立刻可见、以及怎么验收。
>
> 站点部署见 [DEPLOY.md](DEPLOY.md)；格式与加密见
> [book/README.md](https://github.com/Chengxidaxia/BookBlackNet/blob/main/README.md)。

---

## 1. 读取链路

`book/assets/js/core/api.js` 里 `loadIndex()` 与 `fetchBook()` 用同一套顺序：

```
① 同源            <站点>/docs/books/...        站点根就有 → 最快，天然免 CORS
② jsDelivr 并发    cdn / fastly / gcore 三节点同时发，谁先回用谁（Promise.any）
③ raw            https://raw.githubusercontent.com/OWNER/REPO/BRANCH/docs/books/...
```

三层之间**串行**，CDN 层内部**并发竞速**。失败、超时、内容不对（站点把 404 包装成 HTML、
SPA 兜底页返回 200）都会自动落到下一层。每层都有超时：同源 5s、CDN / raw 8s，
卡住的源不会拖死整页。

为什么 CDN 层要并发：国内 `cdn.jsdelivr.net`、`fastly.jsdelivr.net` 常整段超时
（各 8 秒），串行的话首屏要白等十几秒；并发后总耗时 ≈ 最快节点。

排查时看 `<html data-book-source="site|cdn|raw|none">`，首页、详情页、阅读页都会写这个属性。

配置全在 `book/assets/js/config.js`：

```js
CDN: {
  enabled: true,
  hosts: ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net'],
  base: '',          // 填了就用它，忽略 hosts（自建反代 / 对象存储镜像）
  timeout: 8000,     // CDN / raw 单源超时
  siteTimeout: 5000  // 同源超时
}
```

---

## 2. 分块：一本书 = 一个清单 + N 个分块

仓库里每个文件都不超过 **10 MiB**（GitHub 单文件 25 MB 软限、jsDelivr 20 MB 硬限，
10 MiB 留足余量，也让 diff 与重推更轻）。

| 文件 | 内容 |
|---|---|
| `docs/books/<id>.book` | **清单**（小 JSON，明文）：分块文件名、总字节数、更新时间 |
| `docs/books/<id>.book.p001` | 正文 JSON 的字符串切片，按 `p001 → p002 → …` 顺序拼接即原文 |

清单长这样：

```json
{
  "format": "bookblacknet.chunks",
  "v": 1,
  "parts": ["bk_sample_longnight.book.p001"],
  "size": 4695,
  "updatedAt": "2026-11-01T11:04:15.155Z"
}
```

加载端（`fetchBook`）：

1. 取 `<id>.book`；
2. 能 `JSON.parse` 且 `format === 'bookblacknet.chunks'` → 认定是清单，逐块取回并拼接；
3. 否则当作旧版单文件直接返回（**两种格式长期共存**）。

细节：

- 切分按 **UTF-8 字节**计数，且**不拆散代理对**（emoji、生僻字不会出现半个字符）；
  切点由 `api.js → splitChunks()` 与 `scripts/book-chunk.mjs` 两处实现同一套规则。
- 分块**不走并发**，顺序取，避免一次打出几十个请求被 CDN 限速。
- 某层分块失败 → 整本换下一层重试（最多 3 轮），不会「一半来自 CDN 一半来自 raw」。
- 发布时若正文超过 10 MiB，线上写作台会**自动**生成清单 + 分块并逐个提交；
  历史单体书用 `node scripts/book-chunk.mjs` 批量改写（幂等，已是清单的跳过）。

---

## 3. 缓存与版本戳

jsDelivr 对 `@branch` 形式的 URL 有边缘缓存（官方口径约 12 小时），`@commit` 才是永久缓存。
所以「发布完立刻打开还是旧书」是常态，项目用**版本戳**解决：

| 场景 | 戳 | 效果 |
|---|---|---|
| 读 `index.json` | `?v=t<3 分钟桶>` | 3 分钟内共用缓存，之后自动换新 |
| 读 `.book` 与分块 | `?v=<索引里的 updatedAt 数字>` | 内容变了戳才变，同版本永远命中缓存 |
| 发布 / 下架成功后 | `bustCdn()` → `?v=b<时间戳>` | 本会话立刻读新文件，不碰旧缓存 |

**日常靠缓存，发布后立刻生效**，不需要手动刷 CDN；换浏览器或新会话第一次打开最多等一个 3 分钟桶。

需要全网强刷时用 jsDelivr 的 purge 接口（返回 JSON，几秒生效）：

```bash
node scripts/cdn-urls.mjs --purge     # 打印所有文件的 purge URL
```

> 站点自身的 `/assets/js/*` 与页面不走这套：`vercel.json` 里是 `max-age=0, must-revalidate`，
> 每次回源校验，改版立刻可见。

---

## 4. 验收

```bash
node scripts/cdn-urls.mjs            # 列出 index.json + 每本 .book + 每个分块的各源 URL
node scripts/cdn-urls.mjs --check    # 逐个实测（状态码 / 耗时 / 大小 / 内容是否合法 JSON）
node scripts/cdn-urls.mjs --json     # 机器可读输出
```

`--check` 不只判断 200：还会检查响应体是不是以 `{` / `[` 开头，避免把站点的 404 页、
SPA 兜底页当成成功。

**基线（2026-11-03 实测，3 本示例书 / 3 个分块）**：

| 源 | index.json | 备注 |
|---|---|---|
| 同源 `book.blacknet.cc.cd` | 200 / ~0.4s | 正式站，站点根就带 `docs/books/`，最快 |
| `cdn.jsdelivr.net` | 200 / ~5.1s | 波动大 |
| `fastly.jsdelivr.net` | 200 / ~1.2s | |
| `gcore.jsdelivr.net` | 200 / ~1.2s | 通常最稳 |
| `raw.githubusercontent.com` | 200 / ~1.1s | 最后兜底 |

只要同源或任一 CDN 节点通，整条链路就算健康。jsDelivr 给 `.book` 猜的 MIME 是
`application/vnd.framemaker` 之类，前端一律用 `res.text()` 读，不受影响。

---

## 5. jsDelivr 的硬限制

| 限制 | 数值 | 影响 |
|---|---|---|
| 单文件大小 | 20 MB | 分块上限设 10 MiB，正好留一倍余量 |
| 仓库体积 | 建议 < 50 MB | 只放书与索引，别放构建产物与图片 |
| 私有仓库 | **不支持** | 书籍仓库必须 public（正文本来就是密文，可接受） |
| `.book*` 的 MIME | 猜的，不可靠 | 前端按文本读，不依赖 Content-Type |
| 目录列表 | `https://data.jsdelivr.com/v1/package/gh/OWNER/REPO@BRANCH` | 仅排查用，前端不依赖 |

---

## 6. 国内可达性

三个 jsDelivr 域名按序降级，全挂还有 raw 兜底。要长期稳定有两条路：

1. **自建反代**：Cloudflare Worker 反代 `cdn.jsdelivr.net`，地址填进 `CDN.base`；
2. **换存储**：书放对象存储（R2 / B2），路径结构保持一致，同样填 `CDN.base`。

`CDN.base` 的约定是「站点根 + 相对路径」：填 `https://cdn.example.com` 就会请求
`https://cdn.example.com/docs/books/index.json`。

> **别把 `CDN.base` 填成本站域名**：那等于绕开超时保护又跑一遍同源，纯浪费。
> 正式站默认留空 —— 同源这一层本身就是最近、最快的源。

此外还有一层站点级兜底：`config.js → PROXY` 让浏览器直连 GitHub 不通时改走
`/proxy/<host>/...`（见 [DEPLOY.md](DEPLOY.md) §4），与 CDN 层互不影响。

---

## 7. 上线 / 换源步骤

1. 确认书籍仓库 `Chengxidaxia/BookBlackNet` 是 **public**，默认分支 `main`（不一致就改
   `config.js → BRANCH`）。
2. 把 `docs/books/` 推上去：`index.json` + `*.book` + `*.book.pXXX`（**分块必须一起推**，
   只推清单会导致「书籍分块下载失败」）。
3. 跑 `node scripts/cdn-urls.mjs --check`，至少同源或一个 CDN 节点可用。
4. 打开 <https://book.blacknet.cc.cd/>，F12 看 `<html data-book-source>`：
   `site` = 同源（预期），`cdn` = 同源没有、落到 jsDelivr，`none` = 三层全挂。
5. 发布一本新书，看 Network 里 `.book` 请求是否带 `?v=b...` —— 带上说明 `bustCdn()` 生效。

---

## 8. 本地改动同步到书籍仓库

`BookBlackNet` 是**唯一真源**（线上写作台发布直接写它），本地 `book/docs` 只是开发快照。
改完站点文件后一条命令同步：

```bash
bash scripts/sync-book-repo.sh          # 复制 → 提交 → 推送（SSH，不弹凭据）
DRY=1 bash scripts/sync-book-repo.sh    # 只看会改什么
```

同步策略（**远端为准**）：

- 页面 / 脚本 / 样式：同名覆盖；
- `docs/books/*`：只**补入远端没有的文件**，绝不覆盖线上已有的书；
- `index.json`：走 `scripts/book-index-merge.mjs`，以远端为基底，只追加本地独有条目
  （2026-11-01 曾因直接覆盖，把线上刚发布的一本冲掉）；
- 真要用本地文件强推：`FORCE_BOOKS=1 bash scripts/sync-book-repo.sh`。

> 脚本的 push 偶发被静默吞掉（exit 0 但远端没变）。同步后必须核对：
>
> ```bash
> cd .workbuddy/tmp/book-repo && git ls-remote origin main
> ```
>
> 远端 SHA 与本地 `git rev-parse HEAD` 一致才算成功，否则手动 `git push origin main` 再核。
