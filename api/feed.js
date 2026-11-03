// ============================================================
// feed.js — Vercel Function：生成站点 RSS 2.0（/feed.xml）
// 数据源：GitHub Discussions（GraphQL，与 /api/discussions 同一份内容）
// 环境变量：GH_TOKEN
//
// 为什么用 Function 而不是预生成静态 feed.xml：
//   静态文件只有在构建时才有内容，新文章发布后要等下一次构建；
//   Function 每次请求实时读 Discussions，订阅源永远是最新的。
// ============================================================

const OWNER = 'Chengxidaxia';
const REPO = 'GroupBlackNet';
const SITE = 'https://grp.blacknet.cc.cd';
const FEED_URL = SITE + '/feed.xml';
const TITLE = '群档案 · 记录、连接与被看见';
const DESC = '收录群内的每一次发声，让碎片重新被看见。';

const QUERY = `
query ($owner: String!, $repo: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    discussions(first: $first, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        number
        title
        body
        createdAt
        updatedAt
        author { login }
        category { name }
      }
    }
  }
}`;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc822(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

/** 正文首行是元数据 JSON（{"info":base64,...}），摘要优先取 info */
function firstLineMeta(body) {
  const text = String(body || '');
  const nl = text.indexOf('\n');
  const head = (nl === -1 ? text : text.slice(0, nl)).trim();
  if (head[0] !== '{') return { info: '', rest: text };
  try {
    const j = JSON.parse(head);
    let info = '';
    if (j && j.info) {
      try { info = Buffer.from(String(j.info), 'base64').toString('utf8'); } catch (e) { info = ''; }
    }
    return { info: info, rest: nl === -1 ? '' : text.slice(nl + 1) };
  } catch (e) {
    return { info: '', rest: text };
  }
}

function summarize(body, max) {
  const { info, rest } = firstLineMeta(body);
  const plain = (info || rest)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? plain.slice(0, max) + '…' : plain;
}

function rss(items) {
  const now = new Date().toUTCString();
  const body = items.map((it) => {
    const link = SITE + '/blog.html?d=' + it.number;
    const summary = summarize(it.body, 240);
    return `    <item>
      <title>${esc(it.title || '无标题')}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${rfc822(it.createdAt)}</pubDate>
      <author>${esc((it.author && it.author.login) || '匿名')}</author>
      ${it.category && it.category.name ? `<category>${esc(it.category.name)}</category>` : ''}
      <description>${esc(summary)}</description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(TITLE)}</title>
    <link>${esc(SITE + '/')}</link>
    <description>${esc(DESC)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${esc(FEED_URL)}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>`;
}

export default async function handler(req, res) {
  const token = process.env.GH_TOKEN;
  if (!token) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('feed 生成失败：缺少 GH_TOKEN 环境变量');
  }

  try {
    const r = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'BookBlackNet-Feed',
      },
      body: JSON.stringify({ query: QUERY, variables: { owner: OWNER, repo: REPO, first: 30 } }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(j.errors.map((e) => e.message).join('; '));
    const nodes = (j.data && j.data.repository && j.data.repository.discussions && j.data.repository.discussions.nodes) || [];

    const xml = rss(nodes);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    res.end(xml);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('feed 生成失败：' + String((e && e.message) || e));
  }
}
