// ============================================================
// load-commons.js — 加载公共头部和底部（head.html / foot.html）
// 依赖：无
// 触发：window.commonsLoaded = true 及 'commonsLoaded' 事件
// 说明：使用相对路径，便于在仓库根目录 / 子路径下都能正确加载
// ============================================================

(function() {
  'use strict';

  const HEAD_URL = 'head.html';
  const FOOT_URL = 'foot.html';
  const HEAD_PLACEHOLDER = 'header-placeholder';
  const FOOT_PLACEHOLDER = 'footer-placeholder';

  const headContainer = document.getElementById(HEAD_PLACEHOLDER);
  const footContainer = document.getElementById(FOOT_PLACEHOLDER);

  function done() {
    window.commonsLoaded = true;
    document.dispatchEvent(new Event('commonsLoaded'));
  }

  if (!headContainer || !footContainer) {
    console.warn('load-commons: 未找到占位容器 #header-placeholder 或 #footer-placeholder');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', done);
    } else {
      done();
    }
    return;
  }

  function loadComponent(container, url) {
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(html => { container.innerHTML = html; })
      .catch(err => {
        console.error(`加载 ${url} 失败:`, err);
        container.innerHTML = '';
      });
  }

  Promise.all([
    loadComponent(headContainer, HEAD_URL),
    loadComponent(footContainer, FOOT_URL)
  ]).then(done).catch(done);
})();
