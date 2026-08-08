// ============================================================
// Worker：GitHub OAuth 认证代理（完整版）
// 支持：登录/回调/登出/用户信息/反应/评论（含回复）
// 域名：oauth.blacknet.cc.cd
// 环境变量：GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, FRONTEND_URL
// ============================================================

const ALLOWED_ORIGIN = 'https://grp.blacknet.cc.cd';

// ---------- 辅助：CORS 响应 ----------
function corsResponse(body, status = 200, extraHeaders = {}) {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Set-Cookie',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  return new Response(body, { status, headers });
}

// ---------- 处理 OPTIONS 预检 ----------
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Set-Cookie',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    // 预检
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ---------- 登录 ----------
    if (path === '/login') {
      const state = crypto.randomUUID();
      const remember = url.searchParams.get('remember') === 'true' ? '1' : '0';
      const cookies = [
        `oauth_state=${state}; HttpOnly; Secure; Max-Age=600; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd`,
        `remember_me=${remember}; HttpOnly; Secure; Max-Age=2592000; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd`
      ];
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: 'https://oauth.blacknet.cc.cd/callback',
        scope: 'public_repo user:email',
        state: state,
      });
      const githubAuthUrl = `https://github.com/login/oauth/authorize?${params}`;
      const headers = new Headers({
        'Location': githubAuthUrl,
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      });
      cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
      return new Response(null, { status: 302, headers });
    }

    // ---------- 回调 ----------
    if (path === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const cookieState = request.headers.get('Cookie')?.match(/oauth_state=([^;]+)/)?.[1];
      const rememberMe = request.headers.get('Cookie')?.match(/remember_me=([^;]+)/)?.[1] === '1';

      if (!state || state !== cookieState) {
        return corsResponse(JSON.stringify({ error: 'State mismatch' }), 400);
      }
      if (!code) {
        return corsResponse(JSON.stringify({ error: 'Missing code' }), 400);
      }

      try {
        // 换取 access_token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: code,
            redirect_uri: 'https://oauth.blacknet.cc.cd/callback',
          }),
        });
        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
          return corsResponse(JSON.stringify({ error: tokenData.error }), 400);
        }

        // 获取用户信息
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'User-Agent': 'MyBlog/1.0',
          }
        });
        if (!userResponse.ok) throw new Error('GitHub user API error');
        const userData = await userResponse.json();

        // 获取邮箱
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'User-Agent': 'MyBlog/1.0',
          }
        });
        if (!emailResponse.ok) throw new Error('GitHub email API error');
        const emails = await emailResponse.json();
        const primaryEmail = emails.find(e => e.primary)?.email || userData.email || '';
        userData.primary_email = primaryEmail;

        // 设置登录 Cookie（Domain 跨子域）
        const maxAge = rememberMe ? 2592000 : undefined;
        let loginCookie = `github_token=${tokenData.access_token}; HttpOnly; Secure; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd`;
        if (maxAge) loginCookie += `; Max-Age=${maxAge}`;

        const clearCookies = [
          'oauth_state=; HttpOnly; Secure; Max-Age=0; Path=/; Domain=.blacknet.cc.cd',
          'remember_me=; HttpOnly; Secure; Max-Age=0; Path=/; Domain=.blacknet.cc.cd'
        ];

        const frontendUrl = env.FRONTEND_URL || 'https://grp.blacknet.cc.cd';
        const redirectUrl = new URL(frontendUrl);
        redirectUrl.hash = `user=${encodeURIComponent(JSON.stringify(userData))}`;

        const headers = new Headers({
          'Location': redirectUrl.toString(),
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        });
        [loginCookie, ...clearCookies].forEach(cookie => headers.append('Set-Cookie', cookie));

        return new Response(null, { status: 302, headers });
      } catch (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // ---------- /me ----------
    if (path === '/me') {
      const token = request.headers.get('Cookie')?.match(/github_token=([^;]+)/)?.[1];
      if (!token) {
        return corsResponse(JSON.stringify({ error: '未登录' }), 401);
      }
      try {
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'MyBlog/1.0',
          }
        });
        if (!userResponse.ok) {
          const clearCookie = 'github_token=; HttpOnly; Secure; Max-Age=0; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd';
          return corsResponse(JSON.stringify({ error: 'Token 无效' }), 401, {
            'Set-Cookie': clearCookie,
          });
        }
        const userData = await userResponse.json();
        return corsResponse(JSON.stringify(userData), 200);
      } catch (error) {
        return corsResponse(JSON.stringify({ error: '服务器错误' }), 500);
      }
    }

    // ---------- /logout ----------
    if (path === '/logout') {
      const clearCookie = 'github_token=; HttpOnly; Secure; Max-Age=0; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd';
      return corsResponse(JSON.stringify({ success: true }), 200, {
        'Set-Cookie': clearCookie,
      });
    }

    // ---------- /reaction ----------
    if (path === '/reaction') {
      if (request.method === 'OPTIONS') {
        return handleOptions();
      }
      if (request.method !== 'POST') {
        return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
      }

      const token = request.headers.get('Cookie')?.match(/github_token=([^;]+)/)?.[1];
      if (!token) {
        return corsResponse(JSON.stringify({ error: '未登录' }), 401);
      }

      try {
        const body = await request.json();
        const { subjectId, content, action } = body;
        if (!subjectId || !content || !['add', 'remove'].includes(action)) {
          return corsResponse(JSON.stringify({ error: '参数错误' }), 400);
        }

        const mutation = action === 'add' ? 'addReaction' : 'removeReaction';
        const query = `
          mutation ${mutation}($subjectId: ID!, $content: ReactionContent!) {
            ${mutation}(input: {subjectId: $subjectId, content: $content}) {
              reaction { id }
            }
          }
        `;
        const variables = { subjectId, content };

        const githubRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'MyBlog/1.0',
          },
          body: JSON.stringify({ query, variables }),
        });

        const data = await githubRes.json();
        if (data.errors) {
          const msg = data.errors[0]?.message || '';
          if (msg.includes('already reacted')) {
            return corsResponse(JSON.stringify({ error: 'already_reacted' }), 409);
          }
          return corsResponse(JSON.stringify({ error: msg }), 400);
        }
        return corsResponse(JSON.stringify({ success: true }), 200);
      } catch (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // ---------- /comment（支持回复） ----------
    if (path === '/comment') {
      if (request.method === 'OPTIONS') {
        return handleOptions();
      }
      if (request.method !== 'POST') {
        return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
      }

      const token = request.headers.get('Cookie')?.match(/github_token=([^;]+)/)?.[1];
      if (!token) {
        return corsResponse(JSON.stringify({ error: '未登录' }), 401);
      }

      try {
        const body = await request.json();
        const { discussionId, body: commentBody, parentCommentId } = body;
        if (!discussionId || !commentBody) {
          return corsResponse(JSON.stringify({ error: '参数错误' }), 400);
        }

        // 验证 token 有效性
        const verifyRes = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'MyBlog/1.0',
          },
        });
        if (!verifyRes.ok) {
          const clearCookie = 'github_token=; HttpOnly; Secure; Max-Age=0; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd';
          return corsResponse(JSON.stringify({ error: '登录已过期' }), 401, {
            'Set-Cookie': clearCookie,
          });
        }

        // GraphQL 添加评论（支持父评论）
        // 注意：顶层评论不传 parentCommentId，回复时传递
        let mutation, variables;
        if (parentCommentId) {
          mutation = `
            mutation AddReply($discussionId: ID!, $body: String!, $parentCommentId: ID!) {
              addDiscussionComment(input: {discussionId: $discussionId, body: $body, parentCommentId: $parentCommentId}) {
                comment { id }
              }
            }
          `;
          variables = { discussionId, body: commentBody, parentCommentId };
        } else {
          mutation = `
            mutation AddComment($discussionId: ID!, $body: String!) {
              addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
                comment { id }
              }
            }
          `;
          variables = { discussionId, body: commentBody };
        }

        const githubRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'MyBlog/1.0',
          },
          body: JSON.stringify({ query: mutation, variables }),
        });

        const data = await githubRes.json();
        if (data.errors) {
          return corsResponse(JSON.stringify({ error: data.errors[0]?.message || '发表评论失败' }), 400);
        }
        return corsResponse(JSON.stringify({ success: true, comment: data.data.addDiscussionComment?.comment }), 200);
      } catch (error) {
        return corsResponse(JSON.stringify({ error: error.message }), 500);
      }
    }

    // 未匹配路由
    return corsResponse(JSON.stringify({ error: 'Not Found' }), 404);
  },
};
