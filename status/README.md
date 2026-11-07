# 服务状态页（独立项目）

`status.blacknet.cc.cd` 的源码。Vercel 项目 `groupblacknet-status`，Root Directory 指向本目录。

## 版式与样式

**样式沿用主站设计系统**（`assets/site.css`）：设计令牌、基础排版、按钮，以及第 10 节
「服务状态页（`.st-*`）」整段，取值逐一照搬，没有另起一套视觉。

| 文件 | 说明 |
|---|---|
| `style.css` | 设计令牌 + 基础 + `.st-*` 全套。与 `assets/site.css` 同源，改一处要两边一起改 |
| `index.html` | 页面骨架：标题 → 总状态横幅 → 工具条 → 服务卡片列表 → 近 7 天表格 → 一行页脚 |
| `app.js` | 拉 `/api/status`，渲染卡片（含 48 格条、24h 与近 7 天可用率）与 7 天表格 |
| `api/status.js` | 只读取数：直连 Upstash；未配密钥时回退 `grp.blacknet.cc.cd/api/status` |
| `vercel.json` | 缓存与安全头 |
| `package.json` | `"type": "module"`，**不能删**（见下） |

与主站版的差异只有三处，都是为了独立部署：

1. 去掉了主站页头 / 页脚（`#header-placeholder` / `#footer-placeholder`）与三栏说明，
   顶部只留标题与一行副标题，底部只留一行小字；
2. 深色从 `[data-theme="dark"]` 改为 `prefers-color-scheme` 跟随系统（独立项目没有主题按钮）；
3. 每张卡片的可用率多显示一个「7 天」，悬停还能看到 HTTP 状态码与原始错误。

**探测项目前 12 个**：主站、主站接口、RSS、主站函数自检、书阁、书阁接口自检、
归档页、写稿台、书库页、书架、作品管理、书目源（jsDelivr）。
增删只能在 `backend/status-probe.blacknet.cc.cd.js` 的 `TARGETS` **末尾**追加，
插在中间会让历史位串错位。

## 两个部署坑

1. **不能用 CLI 手动部署**：Root Directory 指向仓库内的 `status`，在 `status/` 里跑
   `vercel deploy` 会报 `Root Directory "status" does not exist`（CLI 上传的已是该目录内容，
   Vercel 又按项目设置去找 `status/status`）。改完 `git push`，Git 集成只构建 `status/`。
2. **`package.json` 的 `"type": "module"` 不能删**：Git 构建把整个仓库放进 `/var/task`，
   仓库根也是 ESM，而 Vercel 默认把 `api/*.js` 编译成 CJS，会 `exports is not defined`。

## 本地预览

```bash
node .workbuddy/preview/mock-status-anomaly.mjs              # 12 项、2 项失败，8142
PORT=8143 MODE=ok node .workbuddy/preview/mock-status-anomaly.mjs  # 12 项全绿
node .workbuddy/preview/mock-status-site.mjs                 # 线上真实数据，8140
```
