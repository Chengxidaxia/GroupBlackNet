# 服务状态页（独立项目）

`status.blacknet.cc.cd` 的源码。Vercel 项目 `groupblacknet-status`，Root Directory 指向本目录。

## 版式

参照 `status.deepseek.com` / `www.githubstatus.com` / `status.natfrp.com` 三家的共同做法：

- **没有导航栏**。顶部只有一行：左边标题，右边「最后更新 x · 每 2 分钟探测」。
- 中间是**一块总状态横幅**（全绿 / 部分异常 / 全断三态）＋**一张服务列表**。
- 每项一行：状态图标 + 名称 + 当前耗时，右侧 24 小时可用率，下方一条 48 格细条（每格 30 分钟）。
- 底部**只有一行小字**：探测说明 + 主站 / 书阁 / API 三个链接。

## 样式来源

| 文件 | 来源 | 说明 |
|---|---|---|
| `global.css` | [Upptime status-page](https://github.com/upptime/status-page)（MIT）`static/global.css` | **原样未改**，提供 reset、`.container`、基线排版 |
| `themes/light.css` `themes/dark.css` | 同上 `static/themes/*.css` | **变量名沿用**，取值换成参考站点的中性色（白底 / 绿 #22c55e / 深色 #0a0a0a） |

页面自带的 `<style>` 只覆盖三块：顶部一行、总状态横幅、服务行 + 24 小时条。
模板里 `article` 原本是「带左侧色边的卡片」，这里覆盖成表格行（`border:0` + 行间 1px 分隔线）。

## 我们自己的部分

| 文件 | 作用 |
|---|---|
| `index.html` | 页面骨架：顶部一行、横幅、卡片（标题栏 + 列表）、底部一行 |
| `app.js` | 拉 `/api/status`，渲染横幅与服务行（含 48 格条、24h 与近 7 天可用率） |
| `api/status.js` | 只读取数：直连 Upstash；未配密钥时回退 `grp.blacknet.cc.cd/api/status` |
| `vercel.json` | 缓存与安全头 |
| `package.json` | `"type": "module"`，**不能删**（见下） |

## 两个部署坑

1. **不能用 CLI 手动部署**：Root Directory 指向仓库内的 `status`，在 `status/` 里跑
   `vercel deploy` 会报 `Root Directory "status" does not exist`（CLI 上传的已是该目录内容，
   Vercel 又按项目设置去找 `status/status`）。改完 `git push`，Git 集成只构建 `status/`。
2. **`package.json` 的 `"type": "module"` 不能删**：Git 构建把整个仓库放进 `/var/task`，
   仓库根也是 ESM，而 Vercel 默认把 `api/*.js` 编译成 CJS，会 `exports is not defined`。

## 本地预览

```bash
node .workbuddy/preview/mock-status-site.mjs    # 线上真实数据，监听 8140
node .workbuddy/preview/mock-status-anomaly.mjs # 构造的异常态，监听 8142
```
