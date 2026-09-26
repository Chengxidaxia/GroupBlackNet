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
  VDITOR_BASE: 'vditor/4.0.0'
};
