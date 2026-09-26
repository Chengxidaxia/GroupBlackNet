// ============================================================
// assets/demo.js — 本地预览用演示数据（仅在 localhost 生效）
// 目的：后端 CORS 只放行 https://grp.blacknet.cc.cd，本地/预览面板
//       无法请求 api / oauth，故提供一份结构与真实接口一致的兜底数据，
//       让设计、分类、封面、评论交互等都能在本机完整预览。
// 生产环境（grp.blacknet.cc.cd）不会进入该分支。
// ============================================================
(function () {
  'use strict';

  const b64 = s => { try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return ''; } };

  function mkBody(meta, md) {
    return JSON.stringify({
      info: b64(meta.info || ''),
      icon: b64(meta.icon || ''),
      coverText: meta.coverText || '',
      category: meta.category,
      allowComments: meta.allowComments !== false,
      tags: meta.tags || []
    }) + '\n\n' + md;
  }

  const MD_LONG = `## 为什么要做这件事

群里的讨论每天都在发生，但它们的生命周期太短了。一条有价值的消息，往往在 **48 小时**内就被新的消息冲到看不见的地方。

> 记录的意义，不只是保存过去，更是让未来的人有迹可循。

## 它是怎么工作的

1. 把每次讨论归档为一条结构化记录
2. 分类信息（数字 ID）写入正文首行的 JSON
3. 正文用 Markdown 书写，渲染时自动处理 @提及 与 #编号

首行的元数据大致长这样：

\`\`\`json
{"info":"<base64>","icon":"<base64>","coverText":"","category":3,"allowComments":true,"tags":["归档"]}
\`\`\`

这样即便平台自身的分类能力有限，我们也能维护自己的分类体系。相关讨论可以互相引用，比如 #123 与 @chengxidaxia。

## 接下来

- 更好的搜索与标签
- 相关阅读推荐
- 让旧内容重新被看见

如果你也相信记录的价值，欢迎一起参与。`;

  const MD_SHORT = `这里是演示正文。

- 支持 **加粗**、\`行内代码\`、[链接](https://github.com/Chengxidaxia/GroupBlackNet)
- 支持引用：

> 群档案收录群内的每一次发声。

- 也支持图片与代码块（双击图片可放大）。`;

  const posts = [
    {
      number: 128, title: '群档案正式上线：关于记录、连接与一点点执念',
      category: { name: 'Announcements' }, author: { login: 'chengxidaxia' },
      createdAt: '2026-09-24T09:30:00+08:00', updatedAt: '2026-09-24T10:00:00+08:00',
      comments: { totalCount: 3 },
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 128 }, viewerHasReacted: false },
        { content: 'HEART', users: { totalCount: 36 }, viewerHasReacted: false },
        { content: 'HOORAY', users: { totalCount: 12 }, viewerHasReacted: false }
      ],
      upvoteCount: 96, _md: MD_LONG,
      _meta: { info: '经过数月的打磨，群档案正式与大家见面。它收录群内的每一次发声，也试图在这些碎片之间，织出一条可以被回看的线索。', icon: 'img/landscapenoe.jpg', category: 1, tags: ['公告', '归档'] }
    },
    {
      number: 127, title: '本周社群观察｜七条你不能错过的动态',
      category: { name: '资讯' }, author: { login: 'editor' },
      createdAt: '2026-09-23T08:10:00+08:00', updatedAt: '2026-09-23T09:00:00+08:00',
      comments: { totalCount: 18 },
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 64 }, viewerHasReacted: false },
        { content: 'EYES', users: { totalCount: 12 }, viewerHasReacted: false }
      ],
      upvoteCount: 40, _md: MD_SHORT,
      _meta: { info: '从开放内容生态到社区治理，我们挑出了本周最值得留意的七条消息，并附上简短点评。', category: 2, tags: ['周报'] }
    },
    {
      number: 126, title: '从零到一：我把群消息做成了一本会呼吸的档案',
      category: { name: '技术' }, author: { login: 'builder' },
      createdAt: '2026-09-21T20:45:00+08:00', updatedAt: '2026-09-22T11:00:00+08:00',
      comments: { totalCount: 27 },
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 91 }, viewerHasReacted: false },
        { content: 'ROCKET', users: { totalCount: 20 }, viewerHasReacted: false },
        { content: 'HEART', users: { totalCount: 14 }, viewerHasReacted: false }
      ],
      upvoteCount: 88, _md: MD_LONG,
      _meta: { info: '一次真实的技术实践——如何把零散的讨论，整理成可检索、可迭代的结构化内容。', category: 3, tags: ['归档', 'Markdown', '结构化内容'] }
    },
    {
      number: 125, title: '2026 秋季线下聚会回顾：我们在城市里见面了',
      category: { name: '活动' }, author: { login: 'events' },
      createdAt: '2026-09-18T14:00:00+08:00', updatedAt: '2026-09-18T15:00:00+08:00',
      comments: { totalCount: 33 },
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 205 }, viewerHasReacted: false },
        { content: 'HOORAY', users: { totalCount: 48 }, viewerHasReacted: false }
      ],
      upvoteCount: 150, _md: MD_SHORT,
      _meta: { info: '40 个人，一间不大的空间，三小时没有停下的聊天。这是我们第一次真正意义上的线下相见。', icon: 'img/pole.jpg', category: 4, tags: ['线下', '回顾'] }
    },
    {
      number: 124, title: '关于「记录」这件事，我们聊了三个小时',
      category: { name: '随笔' }, author: { login: 'essay' },
      createdAt: '2026-09-15T21:20:00+08:00', updatedAt: '2026-09-15T22:00:00+08:00',
      comments: { totalCount: 12 },
      reactionGroups: [{ content: 'HEART', users: { totalCount: 58 }, viewerHasReacted: false }],
      upvoteCount: 33, _md: MD_SHORT,
      _meta: { info: '记录究竟是为了保存，还是为了遗忘？在一次漫长的讨论之后，我们写下了一些还没想清楚的答案。', category: 5, tags: ['随笔'] }
    },
    {
      number: 123, title: '深度｜当社区成为基础设施',
      category: { name: '资讯' }, author: { login: 'editor' },
      createdAt: '2026-09-12T10:05:00+08:00', updatedAt: '2026-09-12T11:00:00+08:00',
      comments: { totalCount: 21 },
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 77 }, viewerHasReacted: false },
        { content: 'EYES', users: { totalCount: 15 }, viewerHasReacted: false }
      ],
      upvoteCount: 51, _md: MD_SHORT,
      _meta: { info: '当越来越多的信息在社区里流转，我们开始重新理解「公共」这个词的含义。', coverText: '社区即基础设施', category: 2, tags: ['深度'] }
    },
    {
      number: 122, title: '编辑部招募：欢迎加入内容共建计划',
      category: { name: 'Announcements' }, author: { login: 'chengxidaxia' },
      createdAt: '2026-09-09T11:40:00+08:00', updatedAt: '2026-09-09T12:00:00+08:00',
      comments: { totalCount: 15 },
      reactionGroups: [{ content: 'HOORAY', users: { totalCount: 44 }, viewerHasReacted: false }],
      upvoteCount: 29, _md: MD_SHORT,
      _meta: { info: '我们正在寻找愿意一起整理、撰写和策划的伙伴。如果你也相信记录的价值，欢迎加入。', coverText: '招募共建者', category: 1, tags: ['招募'] }
    },
    {
      number: 121, title: '搜索、标签与索引：让旧内容重新被看见',
      category: { name: '技术' }, author: { login: 'builder' },
      createdAt: '2026-09-05T19:30:00+08:00', updatedAt: '2026-09-06T09:00:00+08:00',
      comments: { totalCount: 19 },
      reactionGroups: [
        { content: 'THUMBS_UP', users: { totalCount: 62 }, viewerHasReacted: false },
        { content: 'HEART', users: { totalCount: 11 }, viewerHasReacted: false }
      ],
      upvoteCount: 44, _md: MD_SHORT,
      _meta: { info: '内容的生命周期不该止于发布。一个更聪明的检索方式，能让三年前的讨论在今天依然有价值。', category: 3, tags: ['搜索', '索引'] }
    },
    {
      number: 120, title: '随手记：一条没有分类的消息',
      category: { name: 'General' }, author: { login: 'guest' },
      createdAt: '2026-09-01T12:00:00+08:00', updatedAt: '2026-09-01T12:30:00+08:00',
      comments: { totalCount: 1 },
      reactionGroups: [{ content: 'THUMBS_UP', users: { totalCount: 7 }, viewerHasReacted: false }],
      upvoteCount: 5, _md: MD_SHORT,
      _meta: { info: '这篇没有设置分类（GitHub 默认的 General），前端不应显示分类标签，封面用站名占位。', category: null, tags: [] }
    }
  ];

  // 组装为“与真实接口一致”的形态：body = 首行 JSON + Markdown
  posts.forEach(p => { p.body = mkBody(p._meta, p._md); });

  const COMMENT_SEED = [
    {
      id: 'demo-c1', body: '这套「分类写进正文 JSON」的思路很实用 👍 平台分类有限，自建分类体系更灵活。',
      createdAt: '2026-09-22T09:10:00+08:00', author: { login: 'chengxidaxia' },
      reactionGroups: [{ content: 'THUMBS_UP', users: { totalCount: 12 }, viewerHasReacted: false }],
      upvoteCount: 8, viewerHasUpvoted: false, replies: { nodes: [] }
    },
    {
      id: 'demo-c2', body: '@builder 想问下：如果正文第一行是普通文字而不是 JSON，兼容吗？',
      createdAt: '2026-09-22T11:42:00+08:00', author: { login: 'essay' },
      reactionGroups: [{ content: 'HEART', users: { totalCount: 6 }, viewerHasReacted: false }],
      upvoteCount: 3, viewerHasUpvoted: false,
      replies: {
        nodes: [{
          id: 'demo-c2r1', body: '@essay 兼容的。解析失败会退化为「首行即简介」，不影响渲染。',
          createdAt: '2026-09-22T12:05:00+08:00', author: { login: 'builder' },
          reactionGroups: [{ content: 'THUMBS_UP', users: { totalCount: 3 }, viewerHasReacted: false }],
          upvoteCount: 1, viewerHasUpvoted: false, replies: { nodes: [] }
        }]
      }
    },
    {
      id: 'demo-c3', body: '已收藏。期待标签与相关阅读那部分 🙌',
      createdAt: '2026-09-23T08:02:00+08:00', author: { login: 'reader' },
      reactionGroups: [{ content: 'ROCKET', users: { totalCount: 4 }, viewerHasReacted: false }],
      upvoteCount: 2, viewerHasUpvoted: false, replies: { nodes: [] }
    }
  ];

  function discussion(number) {
    const p = posts.find(x => x.number === Number(number)) || posts[0];
    return {
      id: 'demo-d' + p.number,
      number: p.number,
      title: p.title,
      body: p.body,
      author: p.author,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      category: p.category,
      reactionGroups: p.reactionGroups,
      upvoteCount: p.upvoteCount,
      viewerHasUpvoted: false,
      comments: { totalCount: COMMENT_SEED.length, nodes: JSON.parse(JSON.stringify(COMMENT_SEED)) }
    };
  }

  window.GB_DEMO = { posts, discussion, mdLong: MD_LONG };
})();
