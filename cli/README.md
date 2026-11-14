# bn — 群档案 / 群书阁 命令行客户端

一个可执行文件同时管两个站：**grp**（主站，内容站）与 **book**（书阁，长篇小说站）。
面向两类使用者：**人和 agent**。所以每个命令都有 `--json`，错误走 stderr，退出码有语义。

- 语言：C++17，**零第三方运行时依赖**（HTTPS 用系统 WinHTTP，加密用系统 BCrypt，gzip 用 zlib）
- 产物：**单个 `bn.exe`（约 1.7 MB，静态链接，拖到哪都能跑）**
- 只支持 Windows（用到 WinHTTP / BCrypt / DPAPI），不需要 Node、Python 或 Git

---

## 一、编译

```cmd
cd /d K:\GroupBlackNet\cli
build.bat
```

产物在 `cli\build\bn.exe`。想放到 PATH 里全局可用：

```cmd
setx PATH "%PATH%;K:\GroupBlackNet\cli\build"
```

（`setx` 后要新开 CMD 才生效。也可以直接把 `bn.exe` 拷到任意已在 PATH 的目录。）

用 MSYS2 / Git Bash 的话也可以 `make`（需要 `g++`、`zlib`，见 `Makefile`）。

---

## 二、登录

写操作（发稿、评论、发书、作品集）都要 GitHub 身份。任选一种：

```cmd
:: 1) 交互式粘贴令牌（输入不回显）
bn login

:: 2) 直接给令牌
bn login --token ghp_xxx

:: 3) 从管道读，适合脚本
type token.txt | bn login --token-stdin

:: 4) 完全不用登录，临时用环境变量
set BLACKNET_TOKEN=ghp_xxx
```

令牌要求：**classic PAT 勾 `public_repo`**（发书走服务端代写，`public_repo` 就够），
或者 fine-grained 令牌对本仓库有 **Discussions 写** 权限。

令牌存放：`%USERPROFILE%\.blacknet\config.json`，**用 Windows DPAPI 加密**，只能当前用户在本机解开，
文件里搜不到明文。`bn logout` 直接删这个文件。

```cmd
bn whoami
bn logout
```

---

## 三、主站 grp

```cmd
bn grp list                          :: 最新 20 篇
bn grp list -n 50 --cat 技术          :: 按分类过滤（1公告 2新闻 3资讯 4技术 5活动 6随笔）
bn grp list --after <游标>            :: 翻页（游标由上一条命令输出）
bn grp show 48                       :: 看一篇
bn grp show 48 --comments 20         :: 连带 20 条评论
bn grp search 状态页 -n 50            :: 标题/正文/简介里搜（会翻多页）
bn grp status                        :: 各服务当前状态
bn grp feed -n 20                    :: 最新文章 RSS
```

### 发稿

```cmd
bn grp post -t "标题" -f 正文.md
bn grp post -t "标题" -f - --cat 技术 --tags CLI,工具 --info "一句话简介"
bn grp post -t "标题" -f 正文.md --dry          :: 只打印将要提交的内容
```

参数：

| 参数 | 含义 |
|---|---|
| `-t/--title` | 标题（上限 120 字）|
| `-f/--file` | 正文 Markdown，`-f -` 从 stdin 读 |
| `--cat` | 分类，可写名字或 id；不写＝无分类 |
| `--tags` | 标签，逗号分隔（中文逗号也行）|
| `--info` | 简介，缺省「无简介」|
| `--cover URL` | 图片封面 |
| `--cover-text 字` | 纯文字封面 |
| `--tpl` | 用分类模板封面 |
| `--no-comments` | 关闭评论 |
| `--dry` | 只打印，不提交 |

首行 JSON（`{"info":base64,...}`）由 CLI 自动生成，和网页写稿器完全一致，网页端能正常渲染分类、封面、标签。

### 互动

```cmd
bn grp comment 48 -m "说得对"
bn grp comment 48 -f reply.md --reply <评论ID>
bn grp react 48 heart              :: +1/-1/laugh/hooray/confused/heart/rocket/eyes
bn grp react 48 heart --remove
bn grp upvote 48
bn grp delete 48                   :: 删除自己的文章（不可恢复，-y 跳过确认）
```

---

## 四、书阁 book

```cmd
bn book list
bn book list --cat 悬疑 --status done --q 长夜
bn book search 星图
bn book show bk_sample_longnight                  :: 章节列表
bn book show bk_sample_longnight --chapter 1      :: 读第 1 章
bn book show bk_sample_longnight --chapter 1 --raw :: 输出原始 Markdown
bn book get bk_sample_longnight -o longnight.book :: 下载 .book
```

`.book` 是 AES-GCM 密文。公开书用站点密钥自动解密，**私密书会提示输入阅读口令**，
非交互场景用 `--password`：

```cmd
bn book show bk_xxx --password "口令"
```

### 「目录 + Markdown」与 `.book` 互转

```cmd
bn book unpack longnight.book -o ./longnight     :: 得到 meta.json + 0001-章节.md
bn book pack ./longnight -o out.book             :: 打回 .book
bn book pack ./longnight --password "口令"        :: 私密书（wrap=pass）
```

目录约定：`meta.json`（书号/书名/作者/简介/分类/标签/状态/可见性）+ 若干 `*.md`，
按文件名排序即为章节顺序，文件名前缀 `0001-` 会被剥掉当章节标题。

### 发布 / 更书

```cmd
bn book publish ./longnight                 :: 目录 → 自动打包 → 分片上传
bn book publish longnight.book              :: 已有 .book 直接发
bn book publish ./longnight --dry           :: 只看清单条目
```

- 文件自动切 2 MiB 一片，后缀 `.p001 .p002 …`，最后写清单（原子切换，读者看不到半成品）
- **更书就是同名 id 再 publish 一次**：同 id 覆盖并置顶，旧的多余分片会被清掉
- `entry` 里的 `account` 由服务端按登录身份写入，改不了别人的书
- 章节数/字数以服务端从 `.p001` 头部读到的为准，客户端传的不作数

### 作品集

```cmd
bn book collections                        :: 列出
bn book collections show cl_xxx            :: 详情（含每本书名）
bn book collections create --title "星图系列" --books bk_a,bk_b --desc "说明"
bn book collections create --title "改名" --id cl_xxx --books bk_a,bk_b
bn book collections delete cl_xxx -y
```

### 书架

```cmd
bn book shelf        :: 云端收藏 + 阅读进度
```

---

## 五、给 agent 用

### 机器可读输出

任何命令加 `--json`，stdout **只有一个 JSON 对象**，不会混进提示文字：

```cmd
bn grp list -n 3 --json
bn book show bk_sample_longnight --json
```

成功：`{"ok":true, ...}`；失败：`{"ok":false,"error":"...","kind":"auth","exit":3}`（同样写到 stdout，stderr 只给人看）。

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 一般失败 |
| 2 | 用法错误（参数缺失/非法）|
| 3 | 未登录 / 令牌无效 / 无权限 |
| 4 | 网络错误 |
| 5 | 目标不存在 |
| 6 | 冲突 |

### 环境变量

| 变量 | 作用 |
|---|---|
| `BLACKNET_TOKEN` | 令牌（优先级高于配置文件）|
| `BLACKNET_GRP_BASE` | 覆盖主站地址（自建 / 本地 mock）|
| `BLACKNET_BOOK_BASE` | 覆盖书阁地址 |
| `BLACKNET_JSON=1` | 等价于全局 `--json` |
| `NO_COLOR=1` | 关颜色（非 tty 时本来就自动关）|

### 典型 agent 用法

```cmd
bn grp list -n 20 --json                     :: 拿结构化的文章列表
bn grp show 48 --json                        :: 拿 markdown + 元信息
bn grp post -t "标题" -f draft.md --json      :: 发布并拿到 number/url
bn book publish ./book --json                :: 发书并拿到 id/url
```

---

## 六、实现说明

```
cli/
  src/util.*      base64 / UTF-8 宽度 / 文件 / gzip(zlib)
  src/http.*      WinHTTP 封装（GET/POST/PUT/DELETE、重定向、超时、系统代理）
  src/crypto.*    BCrypt：随机数、PBKDF2-SHA256、AES-256-GCM；DPAPI 存令牌
  src/bookfile.*  .book 格式（与 book/assets/js/core/crypto.js 逐字段同构）
  src/api.*       grp / book 接口（含同源 → jsDelivr → raw 三层兜底）
  src/config.*    配置与令牌
  src/ui.*        表格、颜色、JSON 输出、退出码
  src/main.cpp    命令分发
  tools/          verify-book.mjs（用站点同款 WebCrypto 校验 .book）、mock-server.mjs（本地假后端）
  third_party/    nlohmann/json 单头文件
```

几个容易踩的点，都已经在代码里处理：

- **argv 编码**：Windows 的 `argv` 是 ANSI 代码页（中文系统＝GBK），必须先 `GetCommandLineW` 转 UTF-8，
  否则 `bn grp search 状态词` 会变成乱码。
- **UTF-8 切分**：按分隔符切标签时逐字节比较会把中文从中间切断（`0x80/0x81` 常是多字节尾字节）→ 按码点比较。
- **PBKDF2**：BCrypt 必须用 `BCRYPT_ALG_HANDLE_HMAC_FLAG` 打开 SHA-256，否则派生必失败。
- **分片边界**：按字节切 2 MiB 时回退到 UTF-8 字符边界，不会切坏中文。
- **gcc 临时目录**：本机 MSYS2 gcc 默认往 `C:\Windows\` 写临时文件（被拒），Makefile 里已把 `TMPDIR` 指到 `build/tmp`。

`.book` 兼容性验证方式（不需要浏览器）：

```cmd
bn book pack ./longnight -o test.book
node tools/verify-book.mjs test.book
:: 用站点 crypto.js 同款 WebCrypto 逻辑解密，能解出正确的 title/chapters 即说明格式一致
```
