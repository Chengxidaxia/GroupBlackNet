// ============================================================
// config.js - 全局后端服务地址（集中管理，避免各脚本重复硬编码）
// 修改后端域名时只需改这里；各页面脚本通过 window.BLACKNET 读取，
// 并保留原值为兜底，确保即使本文件未加载也不影响功能。
// ============================================================
window.BLACKNET = {
  API_URL:        'https://api.blacknet.cc.cd',        // 数据接口
  OAUTH_BASE:     'https://oauth.blacknet.cc.cd',      // GitHub OAuth 代理
  UPLOAD_URL:     'https://upload.blacknet.cc.cd',     // 图片上传
  DEFAULT_AVATAR: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
  DEFAULT_ICON:   'https://grp.blacknet.cc.cd/img/pole.jpg'
};
