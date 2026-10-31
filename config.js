// ============================================================
// config.js — 全局配置（集中管理，避免各脚本重复硬编码）
// 后端已迁移到 Netlify Functions（同源 /api/*），CF Worker 仅作兜底。
// 修改后端域名 / 数据源时只需改这里；各页面脚本通过 window.BLACKNET 读取。
// ============================================================
window.BLACKNET = {
  // ---- 后端服务（主：同源 Netlify Function；兜底：CF Worker）----
  // 主路径走站点自身 Functions（零 CORS、零质询、Netlify 边缘）；
  // Function 缺失（如本地静态预览）时各调用点经 GB.apiFetch 自动落 CF。
  API_URL:        '/api/discussions',                  // 数据接口（GitHub Discussions 只读代理）
  OAUTH_BASE:     '/api/oauth',                        // GitHub OAuth（登录/评论/反应/顶/发帖）
  API_URL_CF:     'https://api.blacknet.cc.cd',        // 兜底：CF api Worker
  OAUTH_BASE_CF:  'https://oauth.blacknet.cc.cd',      // 兜底：CF oauth Worker
  UPLOAD_URL:     'https://upload.blacknet.cc.cd',     // 图片上传（旧；新图走 pixhost，见 imgup）
  DEFAULT_AVATAR: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
  DEFAULT_ICON:   'https://grp.blacknet.cc.cd/img/pole.jpg',

  // ---- 站点 ----
  MAIN_SITE:      'https://grp.blacknet.cc.cd',            // 主站：头部「群档案」标题点击后跳转至此

  // ---- 分类 / 公告：已改静态 JSON（随站点发布），CF KV 不再参与 ----
  CATEGORY_URL:      '/assets/data/categories.json',
  ANNOUNCEMENTS_URL: '/assets/data/announcements.json',

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
  //
  // skipOn: 在这些「本页域名」上直接直连 —— 后端 CORS 本来就放行它们，
  //         没必要先发一次 /proxy 探测（只会白多几百毫秒）。
  //         换成别的域部署时不用改这里，新域没命中 skipOn 就会自动走反代。
  PROXY: {
    mode: 'auto',
    base: '/proxy',
    hosts: [
      'api.blacknet.cc.cd'        // 文章列表 / 详情 / 分类 / 公告（全部 GET）
    ],
    skipOn: [
      'grp.blacknet.cc.cd'        // 生产域：后端 CORS 白名单里，直连即可
    ]
  }
};
