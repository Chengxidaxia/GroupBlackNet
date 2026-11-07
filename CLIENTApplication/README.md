# 群档案 · 桌面客户端（CLIENTApplication）

JDK 21 + Swing 实现的「群档案」桌面客户端，**功能对齐网页端**，零第三方依赖
（只用 JDK 自带模块，`javac` 直接可编译，不需要 Maven / Gradle）。

- 后端：站点自身的 Vercel Functions —— `grp.blacknet.cc.cd/api/discussions`（只读数据）、
  `/api/oauth`（登录/写入）；图片上传走书阁 `book.blacknet.cc.cd/api/imgup`
- 数据源：GitHub Discussions
- **2026-11-07 换源**：CF Worker（`api` / `oauth` / `upload` / `auth` 四个子域）全线返回
  `530 Origin DNS error`，已彻底不可用。客户端与网页端现在统一走 Vercel 同源 Functions，
  路径参数与返回结构完全一致（`?first=` / `?d=` / `?after=` / `?cafter=`）
- 默认**亮色主题**，可切暗色并持久化

---

## 分发形态（对齐 `K:\Play\Mindustry`）

`dist/` 就是可以直接打包发走的完整目录：

```
dist/
├─ GroupBlackNet.exe     原生启动器（Go 编译，约 3 MB，GUI 子系统无控制台）
├─ GroupBlackNet.json    配置：jrePath / classPath / mainClass / vmArgs
├─ GroupBlackNet.jar     应用本体（外置，不内嵌进 exe）
└─ jre/                  便携运行时（jlink 裁剪，48 MB，目标机无需装 Java）
```

**exe 与 json 必须同名同级** —— 启动器按自己的文件名去找配置。字段名与 Mindustry 用的
packr 配置逐字一致：

| 字段 | 含义 |
|---|---|
| `jrePath` | 运行时目录（相对 exe 或绝对路径）。留空或目录不存在时回退到系统 PATH 上的 java |
| `classPath` | jar 列表；相对路径按 **exe 所在目录**解析，与当前工作目录无关 |
| `mainClass` | 入口类 |
| `useZgcIfSupportedOs` | 为 true 时追加 `-XX:+UseZGC`（JDK 21 起已无需 UnlockExperimentalVMOptions） |
| `vmArgs` | 其余 JVM 参数，排在 `-cp` 与主类之前 |

只发 `exe + json + jar` 也能跑（目标机自备 Java 21）；连 `jre/` 一起发就是「解压即用」。
启动器会把 Java 侧的 stdout/stderr 写进 `GroupBlackNet.log`（同目录，不可写时退到临时目录），
出错时弹 MessageBox 并指向这个日志。

---

## 快速开始

```bat
cd /d K:\GroupBlackNet\CLIENTApplication
build.bat
run.bat
```

`build.bat` 一条命令产出全套（详见上面「分发形态」）：

| 产物 | 说明 |
|---|---|
| `out\classes\` | 编译输出 |
| `out\GroupBlackNet-Client.jar` | 可执行 jar（`Main-Class` 写进 manifest） |
| `dist\` | **完整分发目录**：exe + json + jar + jre |

`run.bat` 的启动顺序：`dist\GroupBlackNet.exe` → `dist\jre + jar` → `java -jar out\...`；
都没有就先自动 build。

要求：JDK 21（`javac` / `jar` / `jlink` 在 PATH 上；本机为 Temurin 21.0.12）。
生成 exe 需要 **Go**；生成带图标的 exe 需要 **windres**（MSYS2/MinGW 自带）。两者缺失时
脚本会跳过对应步骤并说明，不会让整个构建失败。

Linux / macOS：`./build.sh`（同样产出 `dist/`，Go 交叉编译需自行加 `GOOS=windows`）。

> **编码说明**：`build.bat` / `run.bat` 以 **GBK(936) + CRLF** 保存，首行 `chcp 936`，
> 这样中文版 CMD 不会把中文注释读成乱码命令。请勿用编辑器把它们另存成 UTF-8，否则会出现
> `'锛?rem' 不是内部或外部命令` 这类报错。用不了 .bat 时可直接手敲四步：
>
> ```bat
> mkdir out\classes
> dir /s /b src\main\java\*.java > out\sources.txt
> javac -encoding UTF-8 -d out\classes @out\sources.txt
> jar --create --file out\GroupBlackNet-Client.jar --main-class com.groupblacknet.client.App -C out\classes .
> ```
>
> 运行：`java -Dfile.encoding=UTF-8 -jar out\GroupBlackNet-Client.jar`

Linux / macOS：

```bash
./build.sh && ./run.sh
```

### 命令行参数（调试 / 自动化验证用）

| 参数 | 说明 |
|---|---|
| `--page=home\|detail\|editor\|about\|contact` | 启动后直接进入指定页面 |
| `--d=<文章号>` | 配合 `--page=detail` 打开指定文章 |
| `--theme=light\|dark` | 临时覆盖主题（会写入本地偏好） |

示例：`java -cp out\classes com.groupblacknet.client.App --page=detail --d=43`

---

## 功能对照（与网页端核心页面一致）

> 网页端后来新增的**归档**（`/archive`）、**订阅**（`/subscribe`）、**赞助**（`/sponsor`）
> 属于站点侧页面，客户端不提供；客户端只对齐「首页 / 详情 / 写稿 / 登录 / 关于」这几条主链路。

| 页面 | 功能 |
|---|---|
| 首页 | 公告置顶 Hero（1 主 + 3 侧）、公告条（KV）、分类筛选、排序（默认/创建时间/修改时间/点赞数）、升序、搜索、每页 20 条分页、热门榜、分类标签云 |
| 详情 | 封面（tpl 裁定规则）、分类角标（General 不显示）、标题/作者/时间/计数、Markdown 正文（标题/列表/引用/表格/代码块/链接/@提及/#编号）、顶（↑）与多表情反应、评论与嵌套回复（含每评论表情）、评论分页、相关阅读 |
| 写稿 | 标题（120 字计数）、分类（读 KV）、简介、标签、封面三模式（图片 / 文字 / 无 → 写 `tpl`）、图片上传、Markdown 编辑 + 实时预览、首行 JSON 预览、发布后跳转文章 |
| 登录 | GitHub Device Flow 或手动令牌；登出；登录后显示用户名 |
| 关于 / 联系 | 与站点 about.html / contact.html 内容一致 |
| 主题 | 默认亮色，切换后持久化到 `~/.groupblacknet-client/prefs.properties` |

### 封面裁定规则（与 site.js 的 coverHTML 完全一致）

首行 JSON 里 `tpl` 为可选布尔：

1. `tpl: true` → 分类模板封面（渐变）
2. `tpl: false` → 自定义封面：`icon` > `coverText` > 渐变兜底
3. 无 `tpl` 键 → 有分类（category ≠ 0）→ 模板封面；无分类 → 默认封面（icon 原样，即旧默认图）

编辑页写入规则：选「无封面」→ `tpl: true`；选图片/文字封面 → `tpl: false`。同时**不再兜底写入** `DEFAULT_ICON`，避免烤死的默认图压过模板/文字封面。

---

## 登录说明（后端零改动）

所有写入请求都带 `Cookie: github_token=<GitHub Token>`，与网页端同一条鉴权链路。

| 方式 | 说明 |
|---|---|
| **设备码登录（推荐）** | 客户端从 `grp.blacknet.cc.cd/api/oauth/login` 的 302 中解析公开的 `client_id`，走 GitHub Device Flow：展示 8 位验证码 → 打开 `github.com/login/device` → 后台轮询换取令牌。**需在 GitHub OAuth App 里勾选 `Enable Device Flow`** |
| 浏览器登录后粘贴令牌 | 打开登录页完成授权，再把令牌粘贴进来 |
| 手动粘贴 PAT | 经典令牌，勾选 `public_repo` 即可 |

未登录可浏览全部内容；写稿/评论/点赞/反应会提示先登录。
令牌仅保存在本机 `~/.groupblacknet-client/session.properties`，**不会写入仓库**。

---

## 启动器（Go）

```
launcher/
├─ GroupBlackNet.json      分发给用户的配置模板（构建时复制到 dist/）
├─ app.ico                 应用图标（7 种尺寸，16→256）
├─ win/                    原生启动器源码
│  ├─ main.go              读同名 json → 定位 jre → 拼参数 → 拉起 java
│  ├─ go.mod
│  └─ resource.rc          exe 的图标与版本资源（windres → rsrc_windows_amd64.syso）
└─ launch4j-config.xml     旧方案（Launch4j，jar 内嵌单文件）—— 已不再使用，仅留档
```

启动器行为，逐条对齐 packr（Mindustry 的启动器）：

| 行为 | 说明 |
|---|---|
| 找配置 | 用**自己的文件名**换扩展名找 `.json`，不是写死 `GroupBlackNet.json` |
| 找 Java | `jrePath/bin/javaw.exe` → `jrePath/bin/java.exe` → PATH 上的 `javaw` / `java` |
| 工作目录 | 强制设为 exe 所在目录，所以 json 里可以写相对路径 |
| 单实例 | 命名互斥体 `Local\GroupBlackNetClientSingleInstance`，重复双击弹提示而不是开第二个窗口 |
| 出错 | 弹 MessageBox（GUI 子系统没有控制台，不弹就什么也看不到） |
| 日志 | 把 Java 侧 stdout/stderr 写进 `GroupBlackNet.log`，`javaw` 的异常不再无声消失 |
| 退出码 | 等子进程结束并透传退出码 |

与 packr 的**唯一技术差异**：packr 用 JNI 在**同一进程内**创建 JVM（`Creating Java VM...` /
`Loading JAR file...`），本启动器是 **spawn 一个 `javaw.exe` 子进程**再等待。差异只在任务管理器里
会看到两个进程，功能等价；换来的好处是 JVM 崩溃不会把启动器一起带走、也不用处理 Go 与 JVM 的
信号/线程冲突。

构建（`build.bat` / `build.sh` 已内置，单独跑也可以）：

```bat
windres -i resource.rc -o rsrc_windows_amd64.syso --codepage=65001 --target=pe-x86-64 -O coff
go build -trimpath -ldflags "-s -w -H=windowsgui" -o ..\..\dist\GroupBlackNet.exe .
```

`-H=windowsgui` 决定「双击不弹黑框」；`resource.rc` 里的 `FILEVERSION` 必须和
`Config.VERSION` 同步（`build.sh` 会打印两者做比对）。

几个实测过的坑：

- **按启动器 PID 找窗口必然失败**：窗口属于 `javaw.exe` 子进程，验证时要按子进程 PID 枚举。
- **不要用工具后台启动 GUI**：本机的沙箱会回收 detached 子进程，进程还在但窗口一闪就没。
  验证脚本要在**同一进程内**完成「启动 → 等窗口 → 截图 → 结束」。
- windres 编出来的 `.syso` 不入库（`.gitignore` 已忽略），缺 windres 时 exe 只是没图标没版本号。



```
CLIENTApplication/
├─ build.bat / build.sh      一键构建：javac → jar → dist（exe + json + jar + jre）
├─ run.bat / run.sh          运行（dist 的 exe → dist 的 jre+jar → out 的 jar）
├─ dist/                     分发包（构建产物，不入库）
├─ launcher/                 图标 + 配置模板 + Go 启动器源码（win/）
├─ .gitignore                只忽略产物：out/ dist/ *.class *.jar *.log *.syso .gocache …
└─ src/main/java/com/groupblacknet/client/
   ├─ App.java               入口：主题/登录态加载、Look&Feel、命令行参数
   ├─ core/
   │  ├─ Config.java         后端地址（对齐站点 config.js）
   │  ├─ Json.java           极简 JSON 解析/序列化（无第三方依赖）
   │  ├─ Model.java          记录类：Post / Comment / Meta / Category / Reaction…
   │  ├─ MetaParser.java     首行 JSON、base64、分类推断、封面裁定、时间格式化
   │  ├─ Api.java            HTTP 层：列表/详情/KV/回帖/反应/上传 + 异步回调
   │  ├─ Session.java        登录态、Device Flow、令牌持久化
   │  ├─ Markdown.java       Markdown → 受限 HTML（JEditorPane）
   │  ├─ ImgCache.java       图片异步加载与缓存（cover/circle/rounded）
   │  └─ Theme.java          设计 token（对齐 site.css）+ 主题持久化
   └─ ui/
      ├─ Ui.java             圆角卡片、按钮、chip、封面视图、头像、加载动画、主题化弹窗
      ├─ MainFrame.java      工具栏 + 公告条 + 页面路由 + 轻提示
      ├─ HomePanel.java      首页
      ├─ DetailPanel.java    详情页
      ├─ EditorPanel.java    写稿页
      └─ AboutPanel.java     关于 / 联系
```

---

## 已知限制

- **封面图源**：部分文章封面指向 `img.blacknet.cc.cd`，该域目前对图片返回 404（B2 变量问题，与客户端无关）。
  此时客户端会按站点的兜底行为画**分类渐变 + 分类名**，不会出现空白块。
- **后端源**（1.0.2 起）：CF Worker 的 `api` / `oauth` / `upload` / `auth` 四个子域已全线
  返回 `530 Origin DNS error`，不要再写回客户端。现在的直连地址是
  `https://grp.blacknet.cc.cd/api/discussions`（只读）、`https://grp.blacknet.cc.cd/api/oauth`（写）、
  `https://book.blacknet.cc.cd/api/imgup`（上传，主站没有上传 Function）。
- **分类 / 公告数据源**（1.0.1 起已改）：不再请求旧 Worker 的 `/categories` 与
  `/announcements`（Worker 那版分支已下线，请求会失败）。现在的取数顺序是
  **站点 `/api/content`（Upstash 权威源，与网页端同库）→ 站点静态 JSON
  `/assets/data/categories.json`、`announcements.json` → 内置默认分类**。
  内置兜底 `MetaParser.CATS_FALLBACK` 与 `assets/data/categories.json` 取值一致（1 公告 / 2 新闻 /
  3 资讯 / 4 技术 / 5 活动 / 6 随笔），两级网络源全挂时界面仍可用，不会出现空白分类。
- **暗色下的系统控件**：已把排序等控件改为自绘分段按钮；`JFileChooser` 等系统对话框仍使用系统配色。
- **表情字体**：使用 `Segoe UI Emoji`，含 emoji 的文本会自动切换字体（Windows 自带）。
- 客户端不受浏览器 CORS 限制，可直接访问 api/oauth（网页端需要域名白名单）。

## 已验证

- 核心逻辑单测 33 项全通过：JSON 解析/转义、base64 往返、首行 JSON（含引号/换行/中文）、封面裁定 4 种组合、
  General 判定、公告判定、Markdown 8 类语法、时间与表情映射。
- GUI 实机验证（DPI 感知截图，5 个页面）：首页 / 详情 / 写稿 / 关于 / 暗色 —— 布局完整、无横向溢出、emoji 与 Markdown 正常渲染。
