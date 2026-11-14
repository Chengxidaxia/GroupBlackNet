# FAQ

## 页面打不开 / 显示的还是旧版本

**症状**：改了代码、`git push` 也成功了，但线上没变化。

1. 先确认构建真的跑完。Vercel 项目页 → Deployments，看最新一条是不是 `Ready`。
2. **不要只看 `X-Vercel-Cache: HIT`** —— 边缘缓存命中时返回的就是旧文件，`Age` 可能已经几十上百秒。加随机参数再请求：

   ```bash
   curl -sI "https://grp.blacknet.cc.cd/main.js?cb=$RANDOM" | grep -i -E "x-vercel-cache|age"
   ```

   `MISS` 才是打到源站的新版本。
3. 浏览器硬刷新（`Ctrl+F5`）或开无痕窗口，排除本地缓存。

## 首页能开，但文章列表是空的

按顺序排查：

1. `/api/discussions` 是否 200（浏览器直接访问看返回 JSON）。
2. Discussions 里文章是否还在，分类是否被删（分类 ID 变了会让筛选变空）。
3. 如果是书阁的数据（书目 / 正文），看 `<html data-book-source="site|cdn|raw|none">`：
   - `site` = 同源直取，正常
   - `cdn` = 降级到 jsDelivr（同源挂了）
   - `raw` = 再降级到 raw.githubusercontent（慢，但能读）
   - `none` = 三层全挂，检查仓库是否可公开访问

## 登录失败 / 评论发不出去（401）

- 登录态存在 `sessionStorage['bbn.auth.me.v1']`（书阁）/ 对应主站键；先退出再登一次。
- **旧 OAuth 令牌可能没有 `gist` 权限**（云同步会 403）→ 退出重登。
- 本地 `127.0.0.1` 预览时，预览面板的 CSP 不许跨域请求 `api.` 子域，后端 CORS 也只放行 `https://grp.blacknet.cc.cd` —— 这是**预期行为**，不是 bug；本地会自动走演示数据。

## 发文章报 `Resource not accessible by personal access token`

令牌没有 Discussions 写权限。

- 目前唯一能发 Discussion 的是 `AI_GH_TOKEN`（带 `Discussions: Read and write`）。
- `BOT_GH_TOKEN` / `GITHUB_TOKEN` 会报同样的错，别换着试。
- 顺带一提：拿一个不存在的 `categoryId` 去探测返回 `NOT_FOUND`，**不能证明有写权限**（校验顺序问题），别用这个方法判断。

## 加了新服务，状态页不显示

历史位串的顺序等于服务列表顺序，**新服务只能追加在 `TARGETS` 末尾**，插在中间会让所有历史数据错位。

改完要重新部署 Worker：

```bash
wrangler deploy -c backend/wrangler.status.toml
```

刚上线的服务会显示「数据累积中」，因为可用率按真实样本数算，不足 12 小时不给结论。

## 分类 / 标签不显示

分类兜底逻辑有三处副本，必须同步改：

- `api/content.js`
- `book/api/content.js`
- `book/assets/js/config.js` 的 `CATEGORIES`

漏一处就会出现「主站有、书阁没有」或反过来。

## 想删一台测试用的仓库

gh CLI 当前的登录令牌只有 `repo` / `workflow` / `gist` / `read:org`，**没有 `delete_repo`**，删不了仓库。去网页 Settings → Danger Zone 手动删，或临时用带 `delete_repo` 的 classic token。
