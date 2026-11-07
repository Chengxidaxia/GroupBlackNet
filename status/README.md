# 服务状态页（独立项目）

`status.blacknet.cc.cd` 的源码。Vercel 项目 `groupblacknet-status`，Root Directory 指向本目录。

## 版式与样式

**样式沿用主站设计系统**（`assets/site.css`）：设计令牌、基础排版、按钮，以及第 10 节
「服务状态页（`.st-*`）」整段，取值逐一照搬，没有另起一套视觉。

| 文件 | 说明 |
|---|---|
| `style.css` | 设计令牌 + 基础 + `.st-*` 全套。与 `assets/site.css` 同源，改一处要两边一起改 |
| `index.html` | 页面骨架：标题 → 总状态横幅 → 工具条 → 服务卡片列表 → 近 7 天表格 → 一行页脚 |
| `app.js` | 拉 `/api/status`，按分组渲染卡片（48 格细条、24h 与近 7 天可用率）与 7 天表格 |
| `api/status.js` | 只读取数：直连 Upstash；未配密钥时回退 `grp.blacknet.cc.cd/api/status` |
| `vercel.json` | 缓存与安全头 |
| `package.json` | `"type": "module"`，**不能删**（见下） |

与主站版的差异只有三处，都是为了独立部署：

1. 去掉了主站页头 / 页脚（`#header-placeholder` / `#footer-placeholder`）与三栏说明，
   顶部只留标题与一行副标题，底部只留一行小字；
2. 深色从 `[data-theme="dark"]` 改为 `prefers-color-scheme` 跟随系统（独立项目没有主题按钮）；
3. 每张卡片的可用率多显示一个「7 天」，悬停还能看到 HTTP 状态码与原始错误。

**探测项目前 25 个**，按 `group` 分四组显示：

| 组 | 内容 |
|---|---|
| `site` 主站页面 | 主站、归档、写稿台、关于、联系、赞助、订阅 |
| `book` 书阁页面 | 书库、全部书籍、我的书架、作品管理、阅读器、写作台、写作编辑器、作品集 |
| `api` 接口与数据 | 主站接口（Discussions / RSS / 函数自检 / 样式 / 分类公告）、书阁接口自检、书目清单 |
| `ext` 外部依赖 | jsDelivr 书目源、GitHub Raw、GitHub API |

增删只能在 `backend/status-probe.blacknet.cc.cd.js` 的 `TARGETS` **末尾**追加，
插在中间会让历史位串错位（`group` 只影响显示，不影响位序）。

## 可用率怎么算（新上线项不背锅）

监控项是陆续加的，某天 12:00 才上线的项当天只有一半样本，拿全天轮次当分母会被算成 50%。

- `since[i]`：该项开始被监控的时刻，`0` = 早于历史（一直存在）。
- `days[k].cnt[i]`：该项当天真实样本数，可用率 = `ok[i] / cnt[i]`。
- 老数据没有 `cnt`：按 `n × (当天剩余时长 / 24h)` 折算；Worker 首次补 `cnt` 时用同一套算法给基线。
- 上线不足 12 小时：卡片右侧显示「数据累积中」，条只画已有数据并贴右；
  7 天表里那天还没上线的格子显示 `—`。

## 两个部署坑

1. **不能用 CLI 手动部署**：Root Directory 指向仓库内的 `status`，在 `status/` 里跑
   `vercel deploy` 会报 `Root Directory "status" does not exist`（CLI 上传的已是该目录内容，
   Vercel 又按项目设置去找 `status/status`）。改完 `git push`，Git 集成只构建 `status/`。
2. **`package.json` 的 `"type": "module"` 不能删**：Git 构建把整个仓库放进 `/var/task`，
   仓库根也是 ESM，而 Vercel 默认把 `api/*.js` 编译成 CJS，会 `exports is not defined`。

## 本地预览

```bash
node .workbuddy/preview/mock-status-synth.mjs                # 25 项合成数据（含中途上线场景），8144
node .workbuddy/preview/mock-status-site.mjs                 # 线上真实数据，8140
node .workbuddy/preview/test-status-probe.mjs                # Worker 单测：since / cnt / 去重
```
