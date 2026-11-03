// ============================================================
// archive.js — 归档页：全部文章按年月分组 + 搜索 + 分类/年份筛选
// 数据：/api/discussions（同源 Function，失败自动落 CF）
// 不复用 main.js：归档的排序与分组语义和首页不同（纯时间倒序、不做公告置顶）。
// ============================================================
(function () {
  'use strict';

  const API_URL = (window.BLACKNET && window.BLACKNET.API_URL) || '/api/discussions';
  const netFetch = (window.GB && GB.net && GB.net.fetch) ? GB.net.fetch : fetch;

  const $ = id => document.getElementById(id);
  const els = {
    search: $('arcSearch'), years: $('arcYears'), cats: $('arcCats'),
    count: $('arcCount'), list: $('arcList'), empty: $('arcEmpty')
  };

  let all = [];
  let year = 0;          // 0 = 全部年份
  let catId = 0;         // 0 = 全部分类
  let q = '';

  const meta = p => p._meta || (p._meta = GB.parseFirstLine(p.body || ''));
  const catOf = p => { const m = meta(p); return GB.catInfo(GB.catIdOf(p, m), p.category && p.category.name); };
  const infoOf = p => meta(p).info || '';
  const authorOf = p => (p.author && p.author.login) || '匿名';
  const commentsOf = p => (p.comments && p.comments.totalCount) || 0;

  function yearOf(p) {
    const d = new Date(p.createdAt);
    return isNaN(d) ? 0 : d.getFullYear();
  }
  function monthOf(p) {
    const d = new Date(p.createdAt);
    return isNaN(d) ? 0 : d.getMonth() + 1;
  }
  function dayStr(p) {
    const d = new Date(p.createdAt);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------------- 筛选 ---------------- */
  function filtered() {
    const text = q.trim().toLowerCase();
    return all.filter(p => {
      if (year && yearOf(p) !== year) return false;
      if (catId && catOf(p).id !== catId) return false;
      if (text) {
        const hay = [p.title, infoOf(p), p.body].join(' ').toLowerCase();
        if (hay.indexOf(text) < 0) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /* ---------------- 筛选器 ---------------- */
  function renderYears() {
    const ys = [];
    all.forEach(p => {
      const y = yearOf(p);
      if (y && ys.indexOf(y) < 0) ys.push(y);
    });
    ys.sort((a, b) => b - a);
    els.years.innerHTML = '';
    const mk = (val, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arc-chip' + (year === val ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => { year = val; renderYears(); render(); });
      els.years.appendChild(b);
    };
    mk(0, '全部年份');
    ys.forEach(y => mk(y, y + ' 年'));
  }

  function renderCats() {
    const used = (window.GB && GB.cats ? GB.cats.slice() : [])
      .filter(c => c && c.id && !GB.isGeneral(c))
      .sort((a, b) => a.id - b.id);
    els.cats.innerHTML = '';
    const mk = (val, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arc-chip' + (catId === val ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => { catId = val; renderCats(); render(); });
      els.cats.appendChild(b);
    };
    mk(0, '全部');
    used.forEach(c => mk(c.id, c.name));
  }

  /* ---------------- 渲染 ---------------- */
  const esc = s => GB.esc(s);

  function itemHTML(p) {
    const c = catOf(p);
    const info = infoOf(p);
    return `
      <a class="arc-item" href="/blog.html?d=${p.number}">
        <div class="arc-date"><b>${esc(dayStr(p))}</b></div>
        <div class="arc-main">
          <h3>${esc(p.title || '无标题')}</h3>
          ${info ? `<p>${esc(info)}</p>` : ''}
          <div class="arc-meta">
            ${GB.isGeneral(c) ? '' : `<span class="arc-cat" style="--h:${c.hue}">${esc(c.name)}</span>`}
            <span>${esc(authorOf(p))}</span>
            <span class="sep">·</span>
            <span>💬 ${commentsOf(p)}</span>
          </div>
        </div>
      </a>`;
  }

  function render() {
    const list = filtered();
    els.count.textContent = list.length
      ? `共 ${list.length} 篇` + (year ? ` · ${year} 年` : '') + (q ? ` · 搜索「${q}」` : '')
      : '';

    if (!list.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;

    let html = '';
    let curY = null, curM = null;
    list.forEach(p => {
      const y = yearOf(p), m = monthOf(p);
      if (y !== curY) {
        if (curY !== null) html += '</div>';
        html += `<section class="arc-year"><h2 class="arc-year-h">${y || '未标注年份'}<span>${list.filter(x => yearOf(x) === y).length} 篇</span></h2>`;
        curY = y; curM = null;
      }
      if (m !== curM) {
        html += `<div class="arc-month"><div class="arc-month-h">${m} 月</div>`;
        curM = m;
      }
      html += itemHTML(p);
    });
    if (curY !== null) html += '</div></section>';
    els.list.innerHTML = html;
  }

  /* ---------------- 数据 ---------------- */
  async function fetchAll() {
    const acc = [];
    let after = null, hasNext = true, guard = 0;
    while (hasNext && guard < 60) {
      guard++;
      const url = after
        ? `${API_URL}/?first=100&after=${encodeURIComponent(after)}`
        : `${API_URL}/?first=100`;
      const res = await netFetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      acc.push(...(data.nodes || []));
      hasNext = !!(data.pageInfo && data.pageInfo.hasNextPage);
      after = (data.pageInfo && data.pageInfo.endCursor) || null;
    }
    return acc;
  }

  async function boot() {
    if (!els.list) return;
    if (window.GB) await GB.catReady;
    renderCats();

    els.list.innerHTML = `<div class="arc-loading">${GB.loadingHTML ? GB.loadingHTML('正在整理归档…') : '正在整理归档…'}</div>`;

    try {
      all = await fetchAll();
      if (!all.length && window.GB.demoMode && window.GB_DEMO) {
        all = window.GB_DEMO.posts.slice();
      }
    } catch (e) {
      all = (window.GB.demoMode && window.GB_DEMO) ? window.GB_DEMO.posts.slice() : [];
      if (!all.length) {
        els.list.innerHTML = `<div class="arc-loading">归档读取失败：${esc(e.message || e)}</div>`;
        return;
      }
    }

    renderYears();
    renderCats();
    render();

    let timer = 0;
    els.search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { q = els.search.value; render(); }, 200);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
