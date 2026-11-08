# 服务状态页（独立项目）

`status.blacknet.cc.cd` 的源码。Vercel 项目 `groupblacknet-status`，Root Directory 指向本目录。

## 版式与样式

**样式沿用的是主站设计令牌**（配色 / 圆角 / 字号 / 间距都取自 `assets/site.css`），
`.st-*` 这一套则已经独立演进，**不再要求与主站同步**：

> `assets/site.css` §10 里那套 `.st-*` 是主站早年托管状态页时的版本（div 网格 48 格），
> 状态页搬到 `status.blacknet.cc.cd` 后前端已换成 SVG 细条 + 状态徽章 + 详情块。
> 两边结构不同，不要按「改一处两边一起改」处理，改样式只改本目录的 `style.css`。

| 文件 | 说明 |
|---|---|
| `style.css` | 设计令牌 + 基础 + `.st-*` 全套（本项目的唯一来源） |
| `index.html` | 页面骨架：标题 → 总状态横幅 → 工具条 → 细条图例 → 服务卡片列表 → 近 24 小时故障记录 → 近 7 天表格 → 页脚 |
| `app.js` | 拉 `/api/status`，按分组渲染卡片（动态格数细条、状态徽章、异常详情、24h/7 天可用率）与故障记录、7 天表格 |
| `api/status.js` | 只读取数：直连 Upstash；未配密钥时回退 `grp.blacknet.cc.cd/api/status` |
| `vercel.json` | 缓存与安全头 |
| `package.json` | `"type": "module"`，**不能删**（见下） |

与主站版的差异只有三处，都是为了独立部署：

1. 去掉了主站页头 / 页脚（`#header-placeholder` / `#footer-placeholder`）与三栏说明，
   顶部只留标题与一行副标题，底部只留一行小字；
2. 深色从 `[data-theme="dark"]` 改为 `prefers-color-scheme` 跟随系统（独立项目没有主题按钮）；
3. 每张卡片的可用率多显示一个「7 天」，悬停还能看到 HTTP 状态码与原始错误。

## 状态口径（不再是「正常 / 异常」二元）

每次探测除了 `ok` 布尔，还会写一个更细的 `level`；细条位串也扩成三态：

| level | 页面显示 | 判定 |
|---|---|---|
| `up` | 正常 | 2xx/3xx，耗时 < 1.5 秒 |
| `slow` | 偏慢 | 2xx/3xx，但耗时 ≥ 1.5 秒（**可用率仍算成功**，单独标黄） |
| `timeout` | 超时 | 10 秒内无响应（AbortError） |
| `dns` | 解析失败 | `ENOTFOUND` / `EAI_AGAIN` / `getaddrinfo` |
| `tls` | 证书错误 | 证书 / TLS 握手失败 |
| `connect` | 连接失败 | `ECONNREFUSED/RESET` / fetch failed |
| `http4` | 客户端错误 | 4xx |
| `http5` | 服务端错误 | 5xx |
| `error` | 未知错误 | 其他失败 |

- 位串每位：`1` 正常 / `2` 偏慢 / `0` 异常。老数据只有 `0`/`1`，前端把缺失的 `level`
  按同一套规则现算，不会退化成笼统的「异常」。
- 卡片上异常详情**默认展开**：故障类型、已持续多久（起点时间）、最近成功时间、
  24h 内失败次数、原始错误字符串 —— 不用悬停也能看。
- 页面底部「近 24 小时故障记录」按连续失败段聚合，时间区间统一
  `11-08 12:12 ~ 12:16`（半角 `~`，同一天省略后一半的日期），仍在失败的段标「持续中」。
- 偏慢阈值在 Worker 里是 `SLOW_MS = 1500`，单项可用 `slowMs` 覆盖。

## 分组（5 组，按 id 映射）

分组由前端 `app.js` 的 `ID_GROUP` 决定，**不依赖 Worker 的 `group` 字段**，
所以调整分组只要改前端、不用等下一轮探测。组标题右侧显示「N 项 / 几项不达标」。

| 组 | 内容 |
|---|---|
| 主站页面 | 主站、归档、写稿台、关于、联系、赞助、订阅 |
| 书阁页面 | 书库、全部书籍、我的书架、作品管理、阅读器、写作台、写作编辑器、作品集 |
| 接口与自检 | 主站接口（Discussions / RSS / 函数自检 / 分类公告）、书阁接口自检 |
| 资源与书目 | 主站样式、书阁书目清单、jsDelivr 书目源、GitHub Raw |
| 外部依赖 | GitHub API |

每张卡片上还有一个角色标签（页面 / 接口 / 资源 / 外部），分类不用去数分组标题。

增删只能在 `backend/status-probe.blacknet.cc.cd.js` 的 `TARGETS` **末尾**追加，
插在中间会让历史位串错位（`group` 只影响显示，不影响位序）。新项没登记 `ID_GROUP`
时会按 `group` 或 id 前缀兜底，但最好顺手补一行映射。

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
node .workbuddy/preview/mock-status-synth.mjs                # 25 项合成数据（含中途上线 / 偏慢 / 各类故障），8144
PORT=8188 node .workbuddy/preview/mock-status-synth.mjs     # 8144 被 Windows 保留端口占了就用这个
node .workbuddy/preview/mock-status-site.mjs                 # 线上真实数据，8140
NOLV=1 PORT=8189 node .workbuddy/preview/mock-status-synth.mjs   # 去掉 level 字段，验证老数据兼容
node .workbuddy/preview/test-status-probe.mjs                # Worker 单测：since / cnt / 去重
```
