/* ============================================================
   imgmap.js — 图床迁移期旧图 URL 改写（渲染层兜底）
   数据源: /assets/data/imgmap.json（img-migrate.mjs export 生成）
   作用: 正文/评论里的 img.blacknet.cc.cd 旧链接 → pixhost 新直链。
   机制: 预加载映射 + MutationObserver 全局改写 <img>，映射文件
         不存在时静默空操作，零侵入。
   ============================================================ */
window.GB = window.GB || {};

(function (G) {
  'use strict';
  let map = null;      // {oldUrl: newUrl}
  let loading = null;

  function load() {
    if (map) return Promise.resolve(map);
    if (!loading) {
      loading = fetch('/assets/data/imgmap.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then(j => { map = j || {}; return map; });
    }
    return loading;
  }

  /** 同步改写（映射已加载才生效；未加载返回原文，交给 DOM 兜底） */
  function peekRewrite(text) {
    if (!text || !map) return text;
    let t = String(text);
    for (const o in map) {
      if (t.indexOf(o) >= 0) t = t.split(o).join(map[o]);
    }
    return t;
  }

  /** 异步改写文本（映射未加载时等待后改写） */
  function rewrite(text) {
    if (!text) return Promise.resolve(text);
    return load().then(() => peekRewrite(text));
  }

  /** 扫 DOM 改写 <img src>（map 未加载则先等加载再全页扫一遍） */
  function sweep(root) {
    return load().then(m => {
      const keys = Object.keys(m);
      if (!keys.length) return;
      (root || document).querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        const n = map[src];
        if (n) img.src = n;
      });
    });
  }

  // 全局兜底：任何新插入的 <img> 都会被改写（列表、详情、评论一次覆盖）
  const mo = new MutationObserver(muts => {
    if (!map || !Object.keys(map).length) return;
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') {
          const n = map[node.getAttribute('src') || ''];
          if (n) node.src = n;
        } else if (node.querySelectorAll) {
          node.querySelectorAll('img').forEach(img => {
            const n = map[img.getAttribute('src') || ''];
            if (n) img.src = n;
          });
        }
      });
    }
  });

  function boot() {
    load().then(() => {
      if (map && Object.keys(map).length) {
        mo.observe(document.documentElement, { childList: true, subtree: true });
        sweep(document);   // 首屏静态图
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  G.imgmap = { load: load, rewrite: rewrite, peekRewrite: peekRewrite, sweep: sweep };
})(window.GB);
