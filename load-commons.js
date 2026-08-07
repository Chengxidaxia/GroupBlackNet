// ============================================================
// load-commons.js - 加载公共头部和底部（head.html / foot.html）
// 依赖：无
// 触发：window.commonsLoaded = true 及 'commonsLoaded' 事件
// ============================================================

(function() {
  'use strict';

  const HEAD_URL = '/head.html';
  const FOOT_URL = '/foot.html';
  const HEAD_PLACEHOLDER = 'header-placeholder';
  const FOOT_PLACEHOLDER = 'footer-placeholder';

  const headContainer = document.getElementById(HEAD_PLACEHOLDER);
  const footContainer = document.getElementById(FOOT_PLACEHOLDER);

  if (!headContainer || !footContainer) {
    console.warn('load-commons: 未找到占位容器 #header-placeholder 或 #footer-placeholder');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        window.commonsLoaded = true;
        document.dispatchEvent(new Event('commonsLoaded'));
      });
    } else {
      window.commonsLoaded = true;
      document.dispatchEvent(new Event('commonsLoaded'));
    }
    return;
  }

  function loadComponent(container, url) {
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(html => {
        container.innerHTML = html;
      })
      .catch(err => {
        console.error(`加载 ${url} 失败:`, err);
        container.innerHTML = `<p style="color:red;text-align:center;padding:10px;">加载公共部分失败</p>`;
      });
  }

  Promise.all([
    loadComponent(headContainer, HEAD_URL),
    loadComponent(footContainer, FOOT_URL)
  ]).then(() => {
    window.commonsLoaded = true;
    document.dispatchEvent(new Event('commonsLoaded'));
    console.log('✅ 公共部分加载完成');
  }).catch(() => {
    window.commonsLoaded = true;
    document.dispatchEvent(new Event('commonsLoaded'));
  });
})();
