// ============================================================
// oauth-core.mjs — GitHub OAuth 全量移植（自 CF oauth Worker）
// 环境变量（Netlify UI 配置）:
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
//   OAUTH_REDIRECT_URI（默认 https://grp.blacknet.cc.cd/api/oauth/callback）
//   FRONTEND_URL（登录成功后回跳，默认 https://grp.blacknet.cc.cd）
// 路由: /api/oauth/{login,callback,logout,me,reaction,upvote,comment,discussion}
// Cookie: github_token / remember_me / oauth_state（Domain=.blacknet.cc.cd）
// ============================================================

const OWNER = 'Chengxidaxia';
const REPO = 'GroupBlackNet';
const CLEAR_TOKEN = 'github_token=; HttpOnly; Secure; Max-Age=0; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd';

function corsJSON(data, status = 200, origin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin || '*',
      'Vary': 'Origin',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function corsOptions(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin || '*',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  });
}

const cookieGet = (request, name) => {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
};
const bearerOf = (request) => {
  const a = request.headers.get('Authorization') || '';
  return a.startsWith('Bearer ') ? a.slice(7) : cookieGet(request, 'github_token');
};

export async function handleOauth(request, env) {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/\/+$/, '').split('/').pop() || '';
  const reqOrigin = request.headers.get('Origin');
  const allowed = reqOrigin && /^https:\/\/[a-z0-9.-]*blacknet\.cc\.cd$/.test(reqOrigin) ? reqOrigin : undefined;

  if (request.method === 'OPTIONS') return corsOptions(allowed);

  const clientId = env && env.GITHUB_CLIENT_ID;
  const clientSecret = env && env.GITHUB_CLIENT_SECRET;
  const redirectBase = (env && env.OAUTH_REDIRECT_URI) || 'https://grp.blacknet.cc.cd/api/oauth/callback';
  const frontendUrl = (env && env.FRONTEND_URL) || 'https://grp.blacknet.cc.cd';

  // ---------- 登录 ----------
  if (seg === 'login') {
    if (!clientId || !clientSecret) return corsJSON({ error: '缺少 GITHUB_CLIENT_ID/SECRET 环境变量' }, 500, allowed);
    const state = crypto.randomUUID();
    const remember = url.searchParams.get('remember') === 'true' ? '1' : '0';
    const headers = new Headers({
      Location: 'https://github.com/login/oauth/authorize?' + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectBase,
        scope: 'public_repo,user:email',
        state,
      }),
    });
    headers.append('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; Max-Age=600; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd`);
    headers.append('Set-Cookie', `remember_me=${remember}; HttpOnly; Secure; Max-Age=2592000; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd`);
    return new Response(null, { status: 302, headers });
  }

  // ---------- 回调 ----------
  if (seg === 'callback') {
    if (!clientId || !clientSecret) return corsJSON({ error: '缺少 GITHUB_CLIENT_ID/SECRET 环境变量' }, 500, allowed);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = cookieGet(request, 'oauth_state');
    const rememberMe = cookieGet(request, 'remember_me') === '1';
    if (!state || state !== cookieState) return corsJSON({ error: 'State mismatch' }, 400, allowed);
    if (!code) return corsJSON({ error: 'Missing code' }, 400, allowed);

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectBase }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) return corsJSON({ error: tokenData.error }, 400, allowed);

      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token, 'User-Agent': 'GroupBlackNet/1.0' },
      });
      if (!userRes.ok) throw new Error('GitHub user API error');
      const userData = await userRes.json();
      try {
        const emailRes = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: 'Bearer ' + tokenData.access_token, 'User-Agent': 'GroupBlackNet/1.0' },
        });
        const emails = emailRes.ok ? await emailRes.json() : [];
        userData.primary_email = (Array.isArray(emails) && emails.find(e => e.primary) && emails.find(e => e.primary).email) || userData.email || '';
      } catch (e) { userData.primary_email = userData.email || ''; }

      const loginCookie = 'github_token=' + tokenData.access_token + '; HttpOnly; Secure; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd' + (rememberMe ? '; Max-Age=2592000' : '');
      const redirect = new URL(frontendUrl);
      redirect.hash = 'user=' + encodeURIComponent(JSON.stringify(userData));
      const headers = new Headers({ Location: redirect.toString() });
      headers.append('Set-Cookie', loginCookie);
      headers.append('Set-Cookie', 'oauth_state=; HttpOnly; Secure; Max-Age=0; Path=/; Domain=.blacknet.cc.cd');
      headers.append('Set-Cookie', 'remember_me=; HttpOnly; Secure; Max-Age=0; Path=/; Domain=.blacknet.cc.cd');
      return new Response(null, { status: 302, headers });
    } catch (e) {
      return corsJSON({ error: String(e && e.message || e) }, 500, allowed);
    }
  }

  // ---------- me ----------
  if (seg === 'me') {
    const token = cookieGet(request, 'github_token');
    if (!token) return corsJSON({ error: '未登录' }, 401, allowed);
    const res = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'GroupBlackNet/1.0' } });
    if (!res.ok) return corsJSON({ error: 'Token 无效' }, 401, allowed, { 'Set-Cookie': CLEAR_TOKEN });
    return corsJSON(await res.json(), 200, allowed);
  }

  // ---------- logout ----------
  if (seg === 'logout') {
    const res = corsJSON({ success: true }, 200, allowed);
    ['github_token', 'remember_me', 'oauth_state'].forEach(n =>
      res.headers.append('Set-Cookie', `${n}=; HttpOnly; Secure; Max-Age=0; Path=/; SameSite=Lax; Domain=.blacknet.cc.cd`));
    return res;
  }

  // ---------- reaction ----------
  if (seg === 'reaction') {
    if (request.method !== 'POST') return corsJSON({ error: 'Method not allowed' }, 405, allowed);
    const token = bearerOf(request);
    if (!token) return corsJSON({ error: '未登录' }, 401, allowed);
    try {
      const { subjectId, content, action } = await request.json();
      if (!subjectId || !content || ['add', 'remove'].indexOf(action) < 0) return corsJSON({ error: '参数错误' }, 400, allowed);
      const mutation = action === 'add' ? 'addReaction' : 'removeReaction';
      const q = `mutation ${mutation}($subjectId: ID!, $content: ReactionContent!) { ${mutation}(input: {subjectId: $subjectId, content: $content}) { reaction { id } } }`;
      const data = await ghGraphQL(q, { subjectId, content }, token);
      if (data.errors) {
        const msg = data.errors[0] && data.errors[0].message || '';
        if (msg.includes('already reacted')) return corsJSON({ error: 'already_reacted' }, 409, allowed);
        return corsJSON({ error: msg }, 400, allowed);
      }
      return corsJSON({ success: true }, 200, allowed);
    } catch (e) { return corsJSON({ error: String(e && e.message || e) }, 500, allowed); }
  }

  // ---------- upvote ----------
  if (seg === 'upvote') {
    if (request.method !== 'POST') return corsJSON({ error: 'Method not allowed' }, 405, allowed);
    const token = bearerOf(request);
    if (!token) return corsJSON({ error: '未登录' }, 401, allowed);
    try {
      const { subjectId, action } = await request.json();
      if (!subjectId || ['add', 'remove'].indexOf(action) < 0) return corsJSON({ error: '参数错误' }, 400, allowed);
      const mutation = action === 'add' ? 'addUpvote' : 'removeUpvote';
      const q = `mutation ${mutation}($subjectId: ID!) { ${mutation}(input: {subjectId: $subjectId}) { clientMutationId } }`;
      const data = await ghGraphQL(q, { subjectId }, token);
      if (data.errors) return corsJSON({ error: data.errors[0] && data.errors[0].message || '操作失败', details: data.errors }, 400, allowed);
      return corsJSON({ success: true }, 200, allowed);
    } catch (e) { return corsJSON({ error: String(e && e.message || e) }, 500, allowed); }
  }

  // ---------- comment ----------
  if (seg === 'comment') {
    if (request.method !== 'POST') return corsJSON({ error: 'Method not allowed' }, 405, allowed);
    const token = bearerOf(request);
    if (!token) return corsJSON({ error: '未登录' }, 401, allowed);
    try {
      const body = await request.json();
      const { discussionId, body: commentBody, parentCommentId } = body;
      if (!discussionId || !commentBody) return corsJSON({ error: '参数错误' }, 400, allowed);
      const verify = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'GroupBlackNet/1.0' } });
      if (!verify.ok) return corsJSON({ error: '登录已过期' }, 401, allowed, { 'Set-Cookie': CLEAR_TOKEN });

      let mutation, variables;
      if (parentCommentId) {
        mutation = `mutation AddReply($discussionId: ID!, $body: String!, $replyToId: ID!) { addDiscussionComment(input: {discussionId: $discussionId, body: $body, replyToId: $replyToId}) { comment { id } } }`;
        variables = { discussionId, body: commentBody, replyToId: parentCommentId };
      } else {
        mutation = `mutation AddComment($discussionId: ID!, $body: String!) { addDiscussionComment(input: {discussionId: $discussionId, body: $body}) { comment { id } } }`;
        variables = { discussionId, body: commentBody };
      }
      const data = await ghGraphQL(mutation, variables, token);
      if (data.errors) return corsJSON({ error: data.errors[0] && data.errors[0].message || '发表失败', details: data.errors }, 400, allowed);
      return corsJSON({ success: true }, 200, allowed);
    } catch (e) { return corsJSON({ error: String(e && e.message || e) }, 500, allowed); }
  }

  // ---------- discussion（发帖） ----------
  if (seg === 'discussion') {
    if (request.method !== 'POST') return corsJSON({ error: 'Method not allowed' }, 405, allowed);
    const token = bearerOf(request);
    if (!token) return corsJSON({ error: '未登录' }, 401, allowed);
    try {
      const { title, body: discussionBody } = await request.json();
      if (!title || !discussionBody) return corsJSON({ error: '标题和内容不能为空' }, 400, allowed);
      const verify = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'GroupBlackNet/1.0' } });
      if (!verify.ok) return corsJSON({ error: '登录已过期' }, 401, allowed, { 'Set-Cookie': CLEAR_TOKEN });

      const repoData = await ghGraphQL(`
        query GetRepo($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) { id discussionCategories(first: 10) { nodes { id name } } }
        }`, { owner: OWNER, name: REPO }, token);
      const repo = repoData.data && repoData.data.repository;
      const general = repo && (repo.discussionCategories.nodes.find(c => c.name === 'General'));
      if (!repo || !repo.id || !general) return corsJSON({ error: '无法获取仓库或分类信息' }, 500, allowed);

      const createData = await ghGraphQL(`
        mutation Create($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
          createDiscussion(input: {repositoryId: $repoId, categoryId: $catId, title: $title, body: $body}) { discussion { id number } }
        }`, { repoId: repo.id, catId: general.id, title, body: discussionBody }, token);
      if (createData.errors) return corsJSON({ error: createData.errors[0] && createData.errors[0].message }, 400, allowed);
      return corsJSON({ success: true, discussion: createData.data.createDiscussion.discussion }, 200, allowed);
    } catch (e) { return corsJSON({ error: String(e && e.message || e) }, 500, allowed); }
  }

  return corsJSON({ error: 'Not Found' }, 404, allowed);
}

async function ghGraphQL(query, variables, token) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'User-Agent': 'GroupBlackNet/1.0' },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}
