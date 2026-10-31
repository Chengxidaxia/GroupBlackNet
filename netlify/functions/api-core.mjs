// ============================================================
// api-core.mjs — GitHub Discussions 只读代理核心（移植自 CF api Worker）
// 环境变量: GH_TOKEN（Netlify Site configuration → Environment variables）
// 路由: /api/discussions?first=N&after=… | /api/discussions?d=N&cfirst=…&cafter=…
// 分类/公告已改静态 JSON（assets/data/），不再走本 Function。
// ============================================================

const MAX_FIRST = 100;
const OWNER = 'Chengxidaxia';
const REPO = 'GroupBlackNet';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

export async function handleApi(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'GET') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  const token = env && env.GH_TOKEN;
  if (!token) return jsonResponse({ error: '服务器配置错误：缺少 GH_TOKEN 环境变量' }, 500);

  try {
    const url = new URL(request.url);
    const dParam = url.searchParams.get('d');

    if (dParam !== null) {
      const number = parseInt(dParam, 10);
      if (!Number.isInteger(number) || number <= 0) return jsonResponse({ error: '参数 d 必须为正整数' }, 400);
      const commentsFirst = Math.min(parseInt(url.searchParams.get('cfirst') || '20', 10) || 20, 100);
      const commentsAfter = url.searchParams.get('cafter') || null;
      const discussion = await fetchSingleDiscussion(number, token, commentsFirst, commentsAfter);
      return jsonResponse({ discussion });
    }

    const first = Math.min(parseInt(url.searchParams.get('first') || '20', 10) || 20, MAX_FIRST);
    const after = url.searchParams.get('after') || null;
    const result = await fetchDiscussions(first, after, token);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: '内部服务器错误', detail: String(error && error.message || error) }, 500);
  }
}

async function fetchSingleDiscussion(number, token, commentsFirst, commentsAfter) {
  const query = `
    query GetDiscussion($owner: String!, $repo: String!, $number: Int!, $cfirst: Int!, $cafter: String) {
      repository(owner: $owner, name: $repo) {
        discussion(number: $number) {
          id number title body createdAt updatedAt
          author { login avatarUrl }
          category { name }
          reactionGroups { content users { totalCount } viewerHasReacted }
          upvoteCount viewerHasUpvoted
          comments(first: $cfirst, after: $cafter) {
            nodes {
              id body createdAt updatedAt
              author { login avatarUrl }
              reactionGroups { content users { totalCount } viewerHasReacted }
              upvoteCount viewerHasUpvoted
              replies(first: 50) {
                nodes { id body createdAt author { login avatarUrl }
                        reactionGroups { content users { totalCount } viewerHasReacted }
                        upvoteCount viewerHasUpvoted }
              }
            }
            pageInfo { endCursor hasNextPage }
            totalCount
          }
        }
      }
    }
  `;
  const variables = { owner: OWNER, repo: REPO, number, cfirst: commentsFirst, cafter: commentsAfter };
  const data = await graphqlRequest(query, variables, token);
  const discussion = data.repository && data.repository.discussion;
  if (!discussion) throw new Error('Discussion 不存在');
  return discussion;
}

async function fetchDiscussions(first, after, token) {
  const query = `
    query GetDiscussions($owner: String!, $repo: String!, $first: Int!, $after: String) {
      repository(owner: $owner, name: $repo) {
        discussions(first: $first, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            id number title body createdAt updatedAt
            author { login avatarUrl }
            category { name }
            comments { totalCount }
            reactionGroups { content users { totalCount } viewerHasReacted }
            upvoteCount viewerHasUpvoted
          }
          pageInfo { endCursor hasNextPage }
        }
      }
    }
  `;
  const variables = { owner: OWNER, repo: REPO, first, after };
  const data = await graphqlRequest(query, variables, token);
  const discussions = data.repository && data.repository.discussions;
  if (!discussions) return { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } };
  return discussions;
}

async function graphqlRequest(query, variables, token) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'User-Agent': 'GroupBlackNet-Netlify/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok || result.errors) {
    throw new Error((result.errors && result.errors[0] && result.errors[0].message) || 'GitHub API 请求失败');
  }
  return result.data;
}
