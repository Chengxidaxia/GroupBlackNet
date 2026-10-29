# Netlify 部署准备

> 目标：**不改功能、不改后端**，让整个项目可以整体切到 Netlify。
> 书籍读取的多源（同源 → jsDelivr → raw）见 [CDN.md](CDN.md)。

## 1. 三种部署形态

| 形态 | 仓库 / 目录 | 配置 | 访问 |
|---|---|---|---|
| 主站 + 书阁（推荐） | `GroupBlackNet`，根目录 | 根 `netlify.toml` | `https://<域>/` 与 `https://<域>/book/` |
| 书阁独立站 | `BookBlackNet`，`book/` 内容为仓库根 | `book/netlify.toml` | `https://<书域>/` |
| 书阁挂在主站子目录 | 同「主站 + 书阁」 | 同上 | 无需额外配置 |

两套配置都在仓库里：

- 根 `netlify.toml` → `command = bash scripts/netlify-build.sh`，`publish = dist`
- `book/netlify.toml` → 无构建，`publish = "."`（Netlify 站点的 **Base directory 填 `book`**）

> ⚠️ Netlify 只读取 **Base directory 下面**的 `netlify.toml`。
> 用 `book/netlify.toml` 时，站点设置里 Base directory 必须填 `book`，
> 否则 Netlify 会去读根目录那份（那是主站的配置）。

## 2. 构建产物

`scripts/netlify-build.sh` 只把站点真正需要的东西复制到 `dist/`：

```
index.html blog.html edit.html about.html contact.html 404.html
head.html foot.html load-commons.js config.js oauth.js main.js blog.js edit.js
assets/ img/ vditor/ favicon.ico .nojekyll
book/{index.html,read.html,write.html,404.html,assets,docs}
```

**不会**进产物：`backend/`（本就被 ignore）、`.workbuddy/`、`CLIENTApplication/`、
`scripts/`、`*.toml`、`dist/`、`_edge*/`、所有 `.md`。

脚本末尾有三道自检，任一失败构建即中止：

1. 关键文件存在（含 `book/404.html`、`book/docs/books/index.json`）；
2. 每个 `.book` 是 JSON 且含 `"crypto"` 字段（防明文入库）；
3. 打印文件数与体积。

可选环境变量：

| 变量 | 默认 | 作用 |
|---|---|---|
| `BOOKS_INCLUDE` | `1` | 设 `0` 时产物不带 `*.book`，正文全部走 jsDelivr / raw；首页列表仍在（`index.json` 保留） |

想让 Netlify 瘦身、书籍只放 `BookBlackNet` 仓库时，在站点环境变量里加 `BOOKS_INCLUDE=0` 即可。

本地先跑一遍：

```bash
bash scripts/netlify-build.sh
```

## 3. 本地预览

```bash
netlify dev          # 自动跑构建 + 起 8888 端口，带重定向/头规则模拟
```

或者不装 CLI，直接静态服务（重定向规则不会生效，页面本身可正常用）：

```bash
python -m http.server 8123 --directory dist
python -m http.server 8123 --directory book     # 只调试书阁
```

## 4. 切换清单

| # | 事项 | 说明 |
|---|---|---|
| 1 | 绑定同一域名 | 把 `grp.blacknet.cc.cd` 的 DNS 从 GitHub Pages 改到 Netlify。**域名不变 ⇒ 后端 CORS 不用动** |
| 2 | GitHub OAuth 回调 | 回调在 `oauth.blacknet.cc.cd`，与站点域无关；Worker 的 `FRONTEND_URL` 仍是该域，域名不变就不用改 |
| 3 | 预览域（可选） | `deploy-preview-*.netlify.app` 会被后端 CORS 拦住，需要把该域加进 CF Worker 白名单 |
| 4 | 自定义域 HTTPS | Netlify 自动签发 Let's Encrypt；DNS 用 CNAME 到 `<site>.netlify.app`，签发完成前不要开代理（灰云） |
| 5 | 缓存 | HTML / `assets` / `book` 不缓存，`vditor/` 长缓存，`docs/books/*.book` 60 秒 |
| 6 | 404 | 主站用产物根 `404.html`；`/book/*` 由 toml 显式指向 `book/404.html`（Netlify 不会自动按目录找 404） |
| 7 | 大小写 | Netlify 是 Linux，**区分大小写**。现有引用全部小写，新增文件保持一致 |
| 8 | 构建缓存 | `vditor/` 约 24MB / 300+ 文件，首次构建 1–2 分钟，之后走缓存 |

## 5. 数据源

书籍不走 Netlify Functions，直接按下面的顺序取：

```
同源 /docs/books/... → cdn.jsdelivr.net → fastly → gcore → raw.githubusercontent
```

版本戳机制、缓存刷新、国内可达性与验收命令都在 **[CDN.md](CDN.md)**。

排查时看 `<html data-book-source="site|cdn|raw|none">`：
首页与阅读页都会写这个属性，一眼看出当前用的是哪一层。

## 6. 已知差异

- **Pretty URLs**：Netlify 会把 `/book/read.html` 301 到 `/book/read`。项目内资源全是相对路径，
  页面都只在一级目录，解析结果正确；`netlify.toml` 里另有 `/book/read`、`/book/write` 的
  `status = 200` 兜底，关掉 Pretty URLs 也能用。
  万一出现重定向循环，删掉这两条 200 规则、只靠 Netlify 默认行为即可。
- **`.nojekyll` / `CNAME`**：对 Netlify 无意义，保留不影响；`CNAME` 不进 `dist/`。
- **表单/函数**：纯静态，不需要 Netlify Functions；后端仍在 Cloudflare。
- **并发构建**：书籍仓库若与站点仓库分开，书籍更新不会触发站点重建 —— 这正是 CDN 层的意义。

## 7. 回滚

Netlify 控制台 → Deploys → 选上一个成功部署 → **Publish deploy**。
或把 DNS 改回 GitHub Pages 的 A 记录，一分钟内生效（Pages 侧文件未删）。

## 8. 群书阁不依赖后端

- 读书：同源 / CDN 取 `.book`，浏览器本地解密；
- 发布：浏览器直连 GitHub Contents API（PAT 只存 `localStorage`）。

所以书阁在 Netlify 上可独立运行，不需要任何服务端。
