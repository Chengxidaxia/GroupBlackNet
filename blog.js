// ============================================================
// Worker：ImgBB 图片上传代理（增强 Cookie 读取）
// ============================================================

const ALLOWED_ORIGIN = 'https://grp.blacknet.cc.cd';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 1. 从 Cookie 获取用户的 GitHub Token
    const cookie = request.headers.get('Cookie') || '';
    let token = cookie.match(/github_token=([^;]+)/)?.[1] || null;

    // 如果没有 token，尝试从 Authorization 头获取（备用）
    if (!token) {
      const auth = request.headers.get('Authorization');
      if (auth && auth.startsWith('Bearer ')) {
        token = auth.slice(7);
      }
    }

    if (!token) {
      return jsonResponse({ code: 1, msg: '请先登录' }, 401);
    }

    // 2. 验证用户 Token 是否有效
    try {
      const verifyRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'MyBlog/1.0',
        },
      });
      if (!verifyRes.ok) {
        return jsonResponse({ code: 1, msg: '登录已过期，请重新登录' }, 401);
      }
    } catch {
      return jsonResponse({ code: 1, msg: '身份验证失败' }, 401);
    }

    // 3. 获取上传的图片文件
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return jsonResponse({ code: 1, msg: '没有上传文件' }, 400);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return jsonResponse({ code: 1, msg: '仅支持 JPEG/PNG/GIF/WEBP/SVG 格式' }, 400);
    }

    // 4. 调用 ImgBB API
    const apiKey = env.IMGBB_API_KEY;
    if (!apiKey) {
      return jsonResponse({ code: 1, msg: '服务器配置错误' }, 500);
    }

    const imgbbForm = new FormData();
    imgbbForm.append('image', file, file.name);

    const imgbbUrl = `https://api.imgbb.com/1/upload?key=${apiKey}`;

    try {
      const imgbbRes = await fetch(imgbbUrl, {
        method: 'POST',
        body: imgbbForm,
      });
      const imgbbData = await imgbbRes.json();

      if (!imgbbData.success) {
        console.error('ImgBB 错误:', imgbbData);
        return jsonResponse({ code: 1, msg: imgbbData.error?.message || '上传失败' }, 500);
      }

      const url = imgbbData.data.url;
      const fileName = file.name;
      const result = {
        code: 0,
        data: {
          errFiles: [],
          succMap: {
            [fileName]: url,
          },
        },
      };

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    } catch (error) {
      console.error('上传异常:', error);
      return jsonResponse({ code: 1, msg: '服务器内部错误' }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}
