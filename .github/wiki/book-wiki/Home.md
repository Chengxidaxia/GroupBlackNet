# 群书阁 · BookBlackNet

[book.blacknet.cc.cd](https://book.blacknet.cc.cd) —— 群档案的长篇阅读与写作区：读别人的书、自己写书、把书整理成作品集。

## 仓库即站点

**这个仓库的根目录就是站点根目录**，没有构建步骤、没有打包：改完 `.html` / `.js` / `.css` 直接 push，Vercel 就发布了。

```text
BookBlackNet/
├─ *.html            13 个页面
├─ assets/
│  ├─ js/core/       api / crypto / store / markdown / nav / fav / ui …
│  ├─ js/*.js        各页面逻辑（read / write / editor / works / shelf …）
│  ├─ css/           base / detail / read / write / editor …
│  └─ vendor/        marked 12 + DOMPurify 3 + JSZip
├─ api/              Vercel Functions（publish / works / shelf / imgup / collections …）
└─ docs/
   ├─ books/         index.json + 每本书一个目录（.book 密文 + 章节）
   └─ collections/   作品集 + by-book.json 反查索引
```

## 页面

| 页面 | 作用 |
|---|---|
| `index.html` | 首页：推荐书目、公告 |
| `books.html` | 全部书目，24 本/页 |
| `book.html?id=` | 书籍详情：简介、目录、收录于哪些作品集 |
| `read.html?id=&c=` | 阅读器：分章、目录、进度、字体与主题 |
| `write.html` | 新建 / 编辑书籍信息 |
| `editor.html?id=` | 章节编辑器（Vditor，所见即所得） |
| `works.html` | 我的作品，含草稿与已发布 |
| `collections.html` | 作品集 |
| `shelf.html` | 书架：收藏与最近阅读 |
| `author.html` | 作者页 |
| `convert.html` | 格式转换 / 导入 |
| `sponsor.html` | 赞助 |
| `404.html` | 未找到 |

## 数据从哪来

书目与正文是**公开仓库里的静态文件**，读取走三层降级：

1. 同源 `docs/…`（快，但受部署与缓存影响）
2. jsDelivr CDN（三个节点竞速）
3. `raw.githubusercontent.com`（最后兜底）

页面的 `<html data-book-source="site|cdn|raw|none">` 会标出当前用的哪一层，排查时先看这个属性。

写入方向不同：**草稿存 Upstash**（`bu:<uid>:…`，只有自己看得到），**发布才写进本仓库** `docs/`。所以「保存」和「发布」是两件完全不同的事。

正文以 `.book` 密文存放（AES-GCM），浏览器端解密后渲染，仓库里看不到明文。

## 和主站的关系

- 账号共用一套 OAuth（`grp/api/oauth`），登录一次两边都认。
- 主站导航栏可以进书阁；书阁顶栏有返回主站的入口。
- 图片上传走 `book/api/imgup`（主站没有上传能力）。
- 分类与公告存在 Upstash 的 `bn:content`，两个站点读同一份。

## 文档

| 文档 | 内容 |
|---|---|
| [book/README.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/book/README.md) | 功能地图、格式体系、加密链路、接口表、已知限制 |
| [CDN.md](https://github.com/Chengxidaxia/GroupBlackNet/blob/main/CDN.md) | 三层数据源与缓存策略 |

想写书看 [[发布一本书]]，读书遇到问题看 [[FAQ]]。
