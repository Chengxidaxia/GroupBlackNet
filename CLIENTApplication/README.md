# 群档案 · 桌面客户端（CLIENTApplication）

JDK 21 + Swing 实现的「群档案」桌面客户端，**功能对齐网页端**，零第三方依赖
（只用 JDK 自带模块，`javac` 直接可编译，不需要 Maven / Gradle）。

- 后端与网页端共用：`api.blacknet.cc.cd`（只读数据）、`oauth.blacknet.cc.cd`（登录/写入）、`upload.blacknet.cc.cd`（图片上传）
- 数据源：GitHub Discussions
- 默认**亮色主题**，可切暗色并持久化

---

## 快速开始

```bat
cd /d K:\GroupBlackNet\CLIENTApplication
build.bat
run.bat
```

`build.bat` 一次产出三样东西（都在 `out\` 下）：

| 产物 | 说明 |
|---|---|
| `out\classes\` | 编译输出 |
| `out\GroupBlackNet-Client.jar` | 可执行 jar（145 KB，`Main-Class` 写进 manifest） |
| `out\GroupBlackNet.exe` | **Windows 启动器**（Launch4j 生成，jar 已内嵌，双击即可运行） |

也可以绕过脚本直接跑：

```bat
java -Dfile.encoding=UTF-8 -jar out\GroupBlackNet-Client.jar
```

`run.bat` 会优先启动 `out\GroupBlackNet.exe`；没有 exe 就退回 jar；都没有就先自动 build。

要求：JDK 21（`javac`、`jar`、`java` 在 PATH 上；本机为 Temurin 21.0.12）。

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

## 功能对照（与网页端一致）

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
| **设备码登录（推荐）** | 客户端从 `oauth.blacknet.cc.cd/login` 的 302 中解析公开的 `client_id`，走 GitHub Device Flow：展示 8 位验证码 → 打开 `github.com/login/device` → 后台轮询换取令牌。**需在 GitHub OAuth App 里勾选 `Enable Device Flow`** |
| 浏览器登录后粘贴令牌 | 打开登录页完成授权，再把令牌粘贴进来 |
| 手动粘贴 PAT | 经典令牌，勾选 `public_repo` 即可 |

未登录可浏览全部内容；写稿/评论/点赞/反应会提示先登录。
令牌仅保存在本机 `~/.groupblacknet-client/session.properties`，**不会写入仓库**。

---

## Windows 启动器（Launch4j）

```
launcher/
├─ launch4j-config.xml     Launch4j 配置（jar/outfile/icon 的相对路径以本文件所在目录为基准）
├─ app.ico                 应用图标（由站点 favicon.ico 生成，7 种尺寸；想换图标直接替换本文件）
└─ launch4j.path           本机 Launch4j 目录（**机器相关**，可改可删）
```

`build.bat` 查找 Launch4j 的顺序：`launcher\launch4j.path` → 环境变量 `LAUNCH4J_HOME` → PATH 上的 `launch4jc.exe`；
都找不到就只生成 jar 并打印提示（不会让构建失败）。

生成 exe：

```bat
build.bat
```
或手动：
```bat
"C:\路径\launch4j\launch4jc.exe" "launcher\launch4j-config.xml"
```

配置要点：

| 项 | 设置 | 说明 |
|---|---|---|
| `dontWrapJar` | `false` | jar **内嵌**进 exe，单文件交付，旁边不需要放 jar |
| `headerType` | `gui` | 双击不弹黑色控制台窗口 |
| `minVersion` | `21.0.0` | 目标机需 JDK/JRE 21+；缺 JRE 时弹窗给出 Adoptium 下载页 |
| `singleInstance` | 开 | 重复双击不会开第二个窗口，会提示「已在运行」 |
| `icon` / `versionInfo` | 已设 | 图标 + 文件属性（产品名「群档案」、版本 1.0.0.0） |

几个实测过的坑：

- **Launch4j 的官方 Windows 发行包只有 32 位**（`launch4j-3.50-win32.zip`，生成 `machine=0x014c` 的 exe），
  但它用的是「spawn」版 head（`head/head.o`），只是拉起系统的 `javaw.exe`，**所以照样能跑 64 位 JDK**，不必找 64 位版本。
- **杀软误报**：Launch4j 打包时会自己警告 `Sign the executable to minimize antivirus false positives`。
  内嵌（wrapping）模式更容易被拦；真遇到就改成 `<dontWrapJar>true</dontWrapJar>`（需要把 jar 放在 exe 旁），或给 exe 签名。
- **不要用「按启动器 PID 找窗口」来验证**：exe 只是外壳，界面窗口属于它拉起的 `javaw.exe` 子进程，
  按启动器 PID 枚举必然找不到窗口（会被误判成启动失败）。
- exe 返回码 `2` 不一定是 JVM 报错——`gui` 版 head 会把**子进程的退出码**透传出来；
  若同时出现「An application instance is already running」，那是 `singleInstance` 互斥体被上一个实例占着（先结束残留进程）。
- 免装 Java 交付：把 `<jre><path>` 指向一个便携 JRE 目录，并把 `<bundledJre64Bit>` 设为 `true`，
  即可做出「目标机无需安装 Java」的绿色版。



```
CLIENTApplication/
├─ build.bat / build.sh      构建（javac → out/classes，jar 打包，可选 Launch4j 生成 exe）
├─ run.bat / run.sh          运行（优先 out/GroupBlackNet.exe，否则 java -jar）
├─ launcher/                 Launch4j 配置 + 图标（app.ico）+ 本机路径文件
├─ .gitignore                只忽略产物：out/ dist/ build/ *.class *.jar …
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

- **封面图源**：部分文章封面指向 `img.blacknet.cc.cd`，该 Worker 目前返回 500（B2 变量问题，与客户端无关）。
  此时客户端会按站点的兜底行为画**分类渐变 + 分类名**，不会出现空白块。
- **暗色下的系统控件**：已把排序等控件改为自绘分段按钮；`JFileChooser` 等系统对话框仍使用系统配色。
- **表情字体**：使用 `Segoe UI Emoji`，含 emoji 的文本会自动切换字体（Windows 自带）。
- 客户端不受浏览器 CORS 限制，可直接访问 api/oauth（网页端需要域名白名单）。

## 已验证

- 核心逻辑单测 33 项全通过：JSON 解析/转义、base64 往返、首行 JSON（含引号/换行/中文）、封面裁定 4 种组合、
  General 判定、公告判定、Markdown 8 类语法、时间与表情映射。
- GUI 实机验证（DPI 感知截图，5 个页面）：首页 / 详情 / 写稿 / 关于 / 暗色 —— 布局完整、无横向溢出、emoji 与 Markdown 正常渲染。
