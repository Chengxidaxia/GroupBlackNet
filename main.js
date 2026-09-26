// ============================================================
// main.js — 首页：Hero + 卡片流 + 排序/搜索/分类筛选 + 分页
// 数据：api.blacknet.cc.cd（GitHub Discussions 只读代理）
// 功能对齐旧版：排序（默认/创建/修改/点赞）、升序、搜索、分页、公告置顶
// ============================================================
(function () {
  'use strict';

  const API_URL = (window.BLACKNET && window.BLACKNET.API_URL) || 'https://api.blacknet.cc.cd';
  const PAGE_SIZE = 20;
  const HERO_COUNT = 4;

  const $ = id => document.getElementById(id);

  let allPosts = [];
  let currentPage = 1;
  let totalPages = 1;
  let currentSort = 'Default';
  let isAscending = false;
  let searchQuery = '';
  let categoryFilter = 0;      // 0 = 全部
  let rendered = false;

  /* ---------------- 数据辅助 ---------------- */
  function meta(p) { return p._meta || (p._meta = GB.parseFirstLine(p.body || '')); }
  function catOf(p) { const m = meta(p); return GB.catInfo(GB.catIdOf(p, m), p.category && p.category.name); }
  function isAnn(p) { return GB.isAnnouncement(p, meta(p)); }

  function reactionList(p) {
    const out = [];
    (p.reactionGroups || []).forEach(g => {
      const n = (g.users && g.users.totalCount) || 0;
      if (n > 0) out.push({ emoji: GB.emojiOf(g.content), count: n });
    });
    return out;
  }
  function totalReactions(p) { return reactionList(p).reduce((a, b) => a + b.count, 0); }
  function upCount(p) {
    if (p.upvoteCount != null) return p.upvoteCount;
    const g = (p.reactionGroups || []).find(x => x.content === 'THUMBS_UP');
    return g ? (g.users && g.users.totalCount) || 0 : 0;
  }
  function commentCount(p) { return (p.comments && p.comments.totalCount) || 0; }
  function authorOf(p) { return (p.author && p.author.login) || '匿名'; }
  function avatarOf(p) { return (p.author && p.author.avatarUrl) || (window.BLACKNET && window.BLACKNET.DEFAULT_AVATAR) || ''; }

  /* ---------------- 卡片片段 ---------------- */
  function coverOf(p, opts) {
    const m = meta(p);
    const c = catOf(p);
    return GB.coverHTML({ icon: m.icon, coverText: m.coverText, category: c.id }, Object.assign({ fallbackName: c.name }, opts || {}));
  }
  function avatarHTML(p, cls) {
    const url = avatarOf(p);
    return `<span class="avatar ${cls || 'sm'}"><img src="${GB.esc(url)}" alt="" loading="lazy" onerror="this.remove()">${GB.esc(GB.ini(authorOf(p)))}</span>`;
  }
  function reactsHTML(p, max) {
    const list = reactionList(p);
    const show = max ? list.slice(0, max) : list;
    return show.map(r => `<span class="stat">${r.emoji} ${r.count}</span>`).join('');
  }

  function createCard(p) {
    const c = catOf(p);
    const m = meta(p);
    const info = m.info || '';
    const hue = c.hue;
    return `
      <a class="card reveal" href="/blog.html?d=${p.number}">
        <div class="thumb">
          ${coverOf(p)}
          <span class="chip" style="background:hsl(${hue} 62% 42%)">${GB.esc(c.name)}</span>
        </div>
        <div class="card-body">
          <h3>${GB.esc(p.title || '无标题')}</h3>
          ${info ? `<p>${GB.esc(info)}</p>` : ''}
          <div class="card-foot">
            ${avatarHTML(p)}
            <span>${GB.esc(authorOf(p))}</span><span>·</span><span>${GB.fmtShort(p.createdAt)}</span>
            <span class="grow">
              ${reactsHTML(p)}
              <span class="stat">💬 ${commentCount(p)}</span>
            </span>
          </div>
        </div>
      </a>`;
  }

  /* ---------------- 排序 / 筛选 ---------------- */
  function defaultOrder(posts) {
    const ann = posts.filter(isAnn).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const rest = posts.filter(p => !isAnn(p)).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return ann.concat(rest);
  }

  function sortPosts(posts) {
    let arr = posts.slice();
    if (currentSort === 'Default') {
      if (!searchQuery && !categoryFilter) return defaultOrder(arr);   // 默认排序时公告置顶
      return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    if (currentSort === 'CREATE_AT') arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (currentSort === 'UPDATED_AT') arr.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    else if (currentSort === 'UP_AT') arr.sort((a, b) => upCount(a) - upCount(b));
    if (!isAscending) arr.reverse();
    return arr;
  }

  function filteredPosts() {
    let arr = allPosts;
    if (categoryFilter) arr = arr.filter(p => catOf(p).id === categoryFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      arr = arr.filter(p => {
        const t = (p.title || '').toLowerCase();
        const b = (p.body || '').toLowerCase();
        return t.includes(q) || b.includes(q);
      });
    }
    return sortPosts(arr);
  }

  /* ---------------- 渲染：Hero ---------------- */
  function renderHero() {
    const heroBox = $('heroMain'), sideBox = $('heroSide');
    if (!heroBox) return;
    const order = defaultOrder(allPosts);
    if (!order.length) {
      heroBox.className = 'hero-main empty';
      heroBox.innerHTML = '<div style="padding:28px;text-align:center">还没有内容，登录后点右上角「写稿」发布第一篇。</div>';
      if (sideBox) sideBox.innerHTML = '';
      return;
    }
    const h = order[0], c = catOf(h), m = meta(h);
    heroBox.className = 'hero-main reveal';
    heroBox.innerHTML = `
      <a href="/blog.html?d=${h.number}" style="display:block;position:absolute;inset:0" aria-label="${GB.esc(h.title || '')}"></a>
      <div class="cover">${coverOf(h, { size: 56 })}</div>
      <div class="scrim"></div>
      <div class="hero-body">
        <span class="chip" style="background:hsl(${c.hue} 62% 42%)">${isAnn(h) ? '置顶 · ' : ''}${GB.esc(c.name)}</span>
        <h1>${GB.esc(h.title || '无标题')}</h1>
        ${m.info ? `<p>${GB.esc(m.info)}</p>` : ''}
        <div class="byline">
          ${avatarHTML(h)}
          <b style="color:#fff">${GB.esc(authorOf(h))}</b>
          <span class="sep">·</span><span>${GB.fmtShort(h.createdAt)}</span>
          <span class="sep">·</span><span>↑ ${upCount(h)}</span>
          ${reactsHTML(h, 2) ? `<span class="sep">·</span>${reactsHTML(h, 2)}` : ''}
          <span class="sep">·</span><span>💬 ${commentCount(h)}</span>
        </div>
      </div>`;

    if (sideBox) {
      sideBox.innerHTML = order.slice(1, HERO_COUNT).map(p => {
        const pc = catOf(p);
        return `
          <a class="side-item reveal" href="/blog.html?d=${p.number}">
            <div class="side-thumb">${coverOf(p, { small: true, size: 15 })}</div>
            <div>
              <span class="tag">${GB.esc(pc.name)}</span>
              <h3>${GB.esc(p.title || '无标题')}</h3>
              <div class="meta">
                <span>${GB.fmtShort(p.createdAt)}</span>
                <span>🔥 ${totalReactions(p)}</span>
                <span>💬 ${commentCount(p)}</span>
              </div>
            </div>
          </a>`;
      }).join('');
    }
  }

  /* ---------------- 渲染：分类 tabs / 侧栏 ---------------- */
  function renderTabs() {
    const used = [];
    allPosts.forEach(p => { const c = catOf(p); if (!used.some(x => x.id === c.id)) used.push(c); });
    used.sort((a, b) => a.id - b.id);
    const tabs = $('tabs');
    if (tabs) {
      tabs.innerHTML = `<button class="tab ${categoryFilter === 0 ? 'active' : ''}" data-cat="0">全部</button>`
        + used.map(c => `<button class="tab ${categoryFilter === c.id ? 'active' : ''}" data-cat="${c.id}">${GB.esc(c.name)}</button>`).join('');
    }
    const tagList = $('tagList');
    if (tagList) {
      tagList.innerHTML = used.map(c => `<button type="button" data-cat="${c.id}"># ${GB.esc(c.name)}</button>`).join('');
    }
  }

  function bindFilters() {
    const onCat = e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      categoryFilter = parseInt(b.dataset.cat, 10) || 0;
      currentPage = 1;
      renderTabs();
      renderList();
      const listEl = $('list');
      if (listEl) window.scrollTo({ top: listEl.offsetTop - 80, behavior: 'smooth' });
    };
    const tabs = $('tabs'), tagList = $('tagList');
    if (tabs) tabs.addEventListener('click', onCat);
    if (tagList) tagList.addEventListener('click', onCat);
  }

  function renderRank() {
    const rank = $('rank');
    if (!rank) return;
    const top = allPosts.slice().sort((a, b) => totalReactions(b) - totalReactions(a)).slice(0, 5);
    rank.innerHTML = top.map((p, i) => `
      <li class="${i < 3 ? 'top' : ''}">
        <div>
          <a href="/blog.html?d=${p.number}">${GB.esc(p.title || '无标题')}</a>
          <div class="m">🔥 ${totalReactions(p)} · 💬 ${commentCount(p)}</div>
        </div>
      </li>`).join('');
  }

  /* ---------------- 渲染：列表 + 分页 ---------------- */
  function renderList() {
    const box = $('cards');
    if (!box) return;
    const data = filteredPosts();
    const hint = $('countHint');
    if (hint) hint.textContent = `共 ${data.length} 篇`;

    if (!data.length) {
      box.innerHTML = `<div class="empty-note">没有匹配的内容${searchQuery ? '（试试别的关键词）' : ''}。</div>`;
      renderPager();
      return;
    }
    totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    box.innerHTML = data.slice(start, start + PAGE_SIZE).map(createCard).join('');
    renderPager();
    if (rendered) GB.initReveal(box);
  }

  function renderPager() {
    ['pagerTop', 'pagerBottom'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.innerHTML = buildPagerHTML();
    });
  }

  function buildPagerHTML() {
    if (totalPages <= 1) return '';
    const btn = (label, page, opts) => {
      const o = opts || {};
      return `<button ${o.disabled ? 'disabled' : ''} ${o.active ? 'class="active"' : ''} data-page="${page}">${label}</button>`;
    };
    let html = btn('‹', currentPage - 1, { disabled: currentPage <= 1 });

    const maxVisible = 5;
    let pages = [];
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 2);
      let end = Math.min(totalPages - 1, currentPage + 2);
      if (end - start < maxVisible - 1) {
        if (start === 2) end = Math.min(totalPages - 1, start + maxVisible - 2);
        else if (end === totalPages - 1) start = Math.max(2, end - maxVisible + 2);
      }
      if (start > 2) pages.push('…');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('…');
      pages.push(totalPages);
    }
    pages.forEach(item => {
      if (item === '…') html += `<span class="ellipsis" data-jump="1" title="跳转到指定页">…</span>`;
      else html += btn(item, item, { active: item === currentPage });
    });

    html += btn('›', currentPage + 1, { disabled: currentPage >= totalPages });
    return html;
  }

  function bindPager() {
    ['pagerTop', 'pagerBottom'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('click', e => {
        const jump = e.target.closest('[data-jump]');
        if (jump) { openJump(jump); return; }
        const b = e.target.closest('button[data-page]');
        if (!b || b.disabled) return;
        const page = parseInt(b.dataset.page, 10);
        if (!page || page < 1 || page > totalPages) return;
        currentPage = page;
        renderList();
        const listEl = $('list');
        if (listEl) window.scrollTo({ top: listEl.offsetTop - 80, behavior: 'smooth' });
      });
    });
  }

  // 「…」→ 就地输入页码（替代原生 prompt）
  function openJump(anchor) {
    const input = document.createElement('input');
    input.className = 'jump';
    input.type = 'number';
    input.min = '1';
    input.max = String(totalPages);
    input.placeholder = '页码';
    anchor.replaceWith(input);
    input.focus();
    const commit = () => {
      const v = parseInt(input.value, 10);
      if (v >= 1 && v <= totalPages) { currentPage = v; renderList(); }
      else { renderPager(); GB.toast('请输入 1 - ' + totalPages + ' 之间的页码'); }
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') renderPager();
    });
    input.addEventListener('blur', () => { if (input.isConnected) renderPager(); });
  }

  /* ---------------- 控件 ---------------- */
  function bindControls() {
    const sortSel = $('sort');
    if (sortSel) sortSel.addEventListener('change', function () {
      currentSort = this.value; currentPage = 1; renderList();
    });
    const asc = $('UP');
    if (asc) asc.addEventListener('change', function () {
      isAscending = this.checked; currentPage = 1; renderList();
    });
    const search = $('search');
    if (search) search.addEventListener('input', function () {
      searchQuery = this.value; currentPage = 1; renderList();
    });
    const sub = $('subForm');
    if (sub) sub.addEventListener('submit', () => {
      const mail = $('subMail');
      GB.toast(mail && mail.value ? '已记录订阅意向（演示）：' + mail.value : '请先填写邮箱');
    });
  }

  /* ---------------- 加载 ---------------- */
  async function fetchAllPosts() {
    const box = $('cards');
    if (box) box.innerHTML = '<div class="empty-note">加载中…</div>';
    const acc = [];
    let after = null, hasNext = true, guard = 0;
    while (hasNext && guard < 50) {
      guard++;
      const url = after
        ? `${API_URL}/?first=100&after=${encodeURIComponent(after)}`
        : `${API_URL}/?first=100`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const nodes = data.nodes || [];
      acc.push(...nodes);
      hasNext = !!(data.pageInfo && data.pageInfo.hasNextPage);
      after = (data.pageInfo && data.pageInfo.endCursor) || null;
    }
    return acc;
  }

  async function init() {
    if (!$('cards')) return;
    if (window.GB) await GB.catReady;
    bindControls();
    bindFilters();
    bindPager();

    try {
      allPosts = await fetchAllPosts();
      if (!allPosts.length && GB.demoMode && window.GB_DEMO) {
        allPosts = window.GB_DEMO.posts.slice();
        GB.showDemoNotice();
      }
    } catch (e) {
      console.error('加载失败:', e);
      if (GB.demoMode && window.GB_DEMO) {
        // 本地预览：后端 CORS 未放行本机域名 → 使用演示数据
        allPosts = window.GB_DEMO.posts.slice();
        GB.showDemoNotice();
      } else {
        const box = $('cards');
        if (box) box.innerHTML = '<div class="empty-note">加载失败，请稍后重试。</div>';
        return;
      }
    }

    renderHero();
    renderTabs();
    renderRank();
    renderList();
    rendered = true;
    GB.initReveal();

    // 公告条：未配置 CF 存储时，用「公告」分类的文章标题兜底
    if (!(window.BLACKNET && window.BLACKNET.ANNOUNCEMENTS_URL)) {
      const titles = defaultOrder(allPosts).filter(isAnn).slice(0, 8).map(p => p.title).filter(Boolean);
      if (titles.length) GB.renderTicker(titles);
      else GB.renderTicker(allPosts.slice(0, 5).map(p => p.title));
    }
  }

  function start() {
    if (window.commonsLoaded) init();
    else document.addEventListener('commonsLoaded', init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
