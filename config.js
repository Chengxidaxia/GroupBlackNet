// ============================================================
// config.js — 全局配置（集中管理，避免各脚本重复硬编码）
// 修改后端域名 / 数据源时只需改这里；各页面脚本通过 window.BLACKNET 读取，
// 并保留原值为兜底，确保即使本文件未加载也不影响功能。
// ============================================================
window.BLACKNET = {
  // ---- 后端服务（Cloudflare Workers）----
  API_URL:        'https://api.blacknet.cc.cd',        // 数据接口（GitHub Discussions 只读代理）
  OAUTH_BASE:     'https://oauth.blacknet.cc.cd',      // GitHub OAuth 代理（登录/评论/反应/顶/发帖）
  UPLOAD_URL:     'https://upload.blacknet.cc.cd',     // 图片上传
  DEFAULT_AVATAR: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
  DEFAULT_ICON:   'https://grp.blacknet.cc.cd/img/pole.jpg',

  // ---- 站点 ----
  MAIN_SITE:      'https://grp.blacknet.cc.cd',            // 主站：头部「群档案」标题点击后跳转至此

  // ---- Cloudflare 存储（注意：不是 CF R2；用 KV / D1，经 Worker 暴露为 JSON 接口）----
  // 留空即使用内置兜底数据；填写后自动切换（页面会显示数据来源）。
  CATEGORY_URL:      'https://api.blacknet.cc.cd/categories',       // 分类列表（KV: categories）
  ANNOUNCEMENTS_URL: 'https://api.blacknet.cc.cd/announcements',    // 公告列表（KV: announcements）

  // ---- Vditor（自托管，带版本号便于升级与缓存隔离）----
  // 目录结构：vditor/4.0.0/dist/…（Vditor 的 cdn 选项会自动在其后拼 dist/）
  VDITOR_BASE: 'vditor/4.0.0',

  // ---- 前端同源反代（仅前端使用，后端不需要任何改动）----
  // 后端 CORS 只放行固定域名，站点换域名部署（Netlify / 自定义域 / 预览域）
  // 后数据接口会被浏览器拦掉。这里让前端在「需要的时候」改走站点同源路径：
  //     https://api.blacknet.cc.cd/?first=24  →  /proxy/api.blacknet.cc.cd/?first=24
  // 转发规则写在 netlify.toml（同源请求不做 CORS 校验，后端一行都不用改）。
  //
  // mode : 'auto'   先试反代，站点没配就自动改直连（默认，推荐）
  //        'always' 只走反代（强制，站点没配就直接失败，便于排查）
  //        'off'    完全直连（关掉这套机制）
  // hosts: 允许走反代的地址。**只放只读接口**；oauth / upload 依赖 Cookie，
  //        经反代后 Cookie 的 Domain 对不上会掉登录态，绝不能加进来。
  PROXY: {
    mode: 'auto',
    base: '/proxy',
    hosts: [
      'api.blacknet.cc.cd'        // 文章列表 / 详情 / 分类 / 公告（全部 GET）
    ]
  }
};
