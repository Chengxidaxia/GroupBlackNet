# 服务状态页（独立项目）

`status.blacknet.cc.cd` 的源码。Vercel 项目 `groupblacknet-status`，Root Directory 指向本目录。

## 样式来源

页面样式**原样取自** [Upptime status-page](https://github.com/upptime/status-page)（MIT）：

| 文件 | 来源 | 是否改动 |
|---|---|---|
| `global.css` | `static/global.css` | **未改** |
| `themes/light.css` | `static/themes/light.css` | **未改**（跟随系统浅色） |
| `themes/dark.css` | `static/themes/dark.css` | **未改**（跟随系统深色） |

本地只在 `index.html` 的 `<style>` 里补了 4 条规则：24 小时条（`.bars`）与标题外链下划线。
其余结构（`nav` / `article` / `.f` / `.tag` / `footer`）全是模板原有写法。

## 我们自己的部分

| 文件 | 作用 |
|---|---|
| `index.html` | 页面骨架：导航、标题、总状态、服务列表、页脚 |
| `app.js` | 拉 `/api/status`，渲染成 `<article>` 列表（含 48 格 24 小时条） |
| `api/status.js` | 只读取数：直连 Upstash；未配密钥时回退 `grp.blacknet.cc.cd/api/status` |
| `vercel.json` | 缓存与安全头 |

## 本地预览

```bash
node .workbuddy/preview/mock-status-site.mjs   # 在仓库根目录执行，监听 8140
```

## 部署

**靠 Git 集成，不用 CLI 手动部署**：项目 Root Directory 指向仓库内的 `status`，
在 `status/` 里跑 `vercel deploy` 会报 `Root Directory "status" does not exist`
（CLI 上传的已是该目录内容，Vercel 又按项目设置去找 `status/status`）。

改完 `git push` 即可，Vercel 只构建 `status/`。
