// ============================================================
// assets/site.js — 全站共享运行时
//   · 设计相关的公共能力（分类、封面、Markdown 元数据解析、轻提示…）
//   · 公共头部交互（主题切换、吸顶、移动端菜单、品牌链接指向主站）
//   · 公告条（数据源：CF 存储，经 Worker 暴露为 JSON）
// 依赖：config.js（window.BLACKNET）
// 暴露：window.GB
// ============================================================
(function () {
  'use strict';

  const CFG = window.BLACKNET || {};

  /* ---------------- 常量 ---------------- */
  // GitHub reaction 枚举 → emoji
  const EMOJI_MAP = {
    THUMBS_UP: '👍', THUMBS_DOWN: '👎', LAUGH: '😄', HOORAY: '🎉',
    CONFUSED: '😕', HEART: '❤️', ROCKET: '🚀', EYES: '👀'
  };
  const EMOJI = ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'];

  // 分类数字 ID → 名称 / 色相（兜底；正式环境从 CF 存储读取）
  const CATS_FALLBACK = [
    { id: 1, name: '公告', hue: 352 },
    { id: 2, name: '资讯', hue: 214 },
    { id: 3, name: '技术', hue: 168 },
    { id: 4, name: '活动', hue: 32 },
    { id: 5, name: '随笔', hue: 276 }
  ];
  // 旧数据可能是 GitHub Discussion 分类名（英文）
  const LEGACY_CAT = { Announcements: 1, 公告: 1, 资讯: 2, 技术: 3, 活动: 4, 随笔: 5 };

  let CATS = CATS_FALLBACK.slice();

  /* ---------------- 基础工具 ---------------- */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function b64d(str) {
    if (!str) return '';
    try { return decodeURIComponent(escape(atob(str))); }
    catch (e) { try { return atob(str); } catch (e2) { return ''; } }
  }
  function b64e(str) {
    try { return btoa(unescape(encodeURIComponent(str || ''))); }
    catch (e) { return ''; }
  }

  const ini = s => (s || '?').trim().charAt(0).toUpperCase();

  function fmtDate(d) {
    if (!d) return '';
    const t = new Date(d);
    if (isNaN(t)) return '';
    return t.toLocaleString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
  function fmtShort(d) {
    if (!d) return '';
    const t = new Date(d);
    if (isNaN(t)) return '';
    const now = new Date();
    if (t.getFullYear() === now.getFullYear()) return `${t.getMonth() + 1}月${t.getDate()}日`;
    return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
  }

  /* ---------------- 分类 ---------------- */
  const hueOf = id => (CATS.find(c => c.id === id) || { hue: 214 }).hue;
  const nameOf = id => (CATS.find(c => c.id === id) || { name: '随笔' }).name;
  function catInfo(id, fallbackName) {
    const c = CATS.find(x => x.id === id);
    if (c) return c;
    return { id: id || 0, name: fallbackName || '随笔', hue: 214 };
  }
  const grad = h => `linear-gradient(135deg,hsl(${h} 62% 58%),hsl(${h + 28} 66% 40%))`;

  // 「General」是 GitHub Discussions 的默认分类，站内不作为分类展示（不显示标签、不进筛选）
  const GENERAL_RE = /^general$/i;
  function isGeneral(cat) {
    return !cat || !cat.id || GENERAL_RE.test((cat && cat.name) || '');
  }
  // 封面占位文字：未分类时用站名，而不是「General」
  function coverLabel(cat) {
    return isGeneral(cat) ? '群档案' : ((cat && cat.name) || '群档案');
  }

  // 从文章（含首行 JSON）推断分类数字 ID
  function catIdOf(post, parsed) {
    if (parsed && parsed.category != null) {
      const n = Number(parsed.category);
      if (!isNaN(n) && n > 0) return n;
      const byName = LEGACY_CAT[String(parsed.category)];
      if (byName) return byName;
    }
    const nm = (post && post.category && post.category.name) || '';
    return LEGACY_CAT[nm] || 0;
  }
  function isAnnouncement(post, parsed) {
    if (catIdOf(post, parsed) === 1) return true;
    const nm = (post && post.category && post.category.name) || '';
    return nm === 'Announcements';
  }

  // 分类列表：正式环境从 CF 存储（KV / D1，经 Worker 暴露 JSON）读取；失败则用内置兜底
  let catReadyResolve;
  const catReady = new Promise(res => { catReadyResolve = res; });
  async function loadCategories() {
    const url = CFG.CATEGORY_URL;
    if (!url) { GB.catSource = 'fallback'; catReadyResolve(CATS); return CATS; }
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.list || data.categories || []);
      const norm = list.map((c, i) => ({
        id: Number(c && c.id != null ? c.id : i + 1),
        name: (c && (c.name || c.label)) || String(c),
        hue: Number(c && c.hue != null ? c.hue : (214 + i * 29) % 360)
      })).filter(c => c.name);
      if (norm.length) { CATS = norm; GB.catSource = 'remote'; }
      else { GB.catSource = 'fallback'; }
    } catch (e) {
      console.warn('[categories] 远端不可用，使用内置兜底：', e);
      GB.catSource = 'fallback';
    }
    catReadyResolve(CATS);
    return CATS;
  }

  /* ---------------- 首行 JSON（文章元数据） ---------------- */
  // 结构：{"info":b64,"icon":b64,"coverText":"","category":3,"tpl":false,"allowComments":true,"tags":[...]}
  // tpl（可选布尔）：是否使用分类模板封面。缺省时按「有分类→模板、无分类→默认」裁定。
  function parseFirstLine(body) {
    const src = String(body == null ? '' : body);
    const lines = src.split('\n');
    const first = (lines[0] || '').trim();
    const rest = lines.slice(1).join('\n').trim();
    const out = { info: null, icon: null, coverText: '', category: null, tpl: null, allowComments: true, tags: [], bodyText: rest, isJson: false };
    if (first.charAt(0) !== '{') { out.info = first || null; return out; }
    try {
      const d = JSON.parse(first);
      out.isJson = true;
      out.info = d.info ? b64d(d.info) : null;
      out.icon = d.icon ? b64d(d.icon) : null;
      out.coverText = d.coverText || '';
      out.category = (d.category != null ? d.category : null);
      out.tpl = (typeof d.tpl === 'boolean') ? d.tpl : null;
      out.allowComments = d.allowComments !== false;
      out.tags = Array.isArray(d.tags) ? d.tags.filter(Boolean) : [];
    } catch (e) {
      out.isJson = false;
      out.info = first || null;
    }
    if (out.info === '') out.info = null;
    return out;
  }

  /* ---------------- 封面裁定（tpl > 分类 > 默认） ---------------- */
  // 返回一段 HTML；请放在 position:relative 的容器内
  // 规则（与编辑页写入的 tpl 布尔键配套，解决新旧封面方案冲突）：
  //   1) tpl=true  → 分类模板封面（渐变）
  //   2) tpl=false → 自定义封面：icon > coverText > 模板兜底
  //   3) 无 tpl 键  → 有分类 → 模板封面；无分类 → 默认封面（icon/coverText 原样）
  function coverHTML(meta, opts) {
    const o = opts || {};
    const cat = catInfo(meta && meta.category, o.fallbackName);
    const tpl = `<div class="cover-fill" style="background:${grad(cat.hue)}"><span style="font-size:${o.small ? 15 : (o.size || 42)}px">${esc(coverLabel(cat))}</span></div>`;
    const hasCat = !!(meta && meta.category != null && Number(meta.category) !== 0);
    const useTpl = (meta && typeof meta.tpl === 'boolean') ? meta.tpl : hasCat;
    if (useTpl) return tpl;
    if (meta && meta.icon) {
      // 图标 404 / 加载失败被移除后自动露出下层渐变，不再留空白
      return `<img src="${esc(meta.icon)}" alt="" loading="lazy" style="position:relative;z-index:1" onerror="this.remove()">` + tpl;
    }
    if (meta && meta.coverText) {
      return `<div class="cover-fill" style="background:${grad(cat.hue)}"><span style="font-size:${o.small ? 16 : Math.round((o.size || 40) * 0.66)}px">${esc(meta.coverText)}</span></div>`;
    }
    return tpl;
  }

  /* ---------------- 加载动画 ---------------- */
  // 容器内联版：塞进任意盒子，如 box.innerHTML = GB.loadingHTML('正在加载…')
  function loadingHTML(label) {
    return `<div class="gb-loading" role="status" aria-live="polite"><div class="spin"></div><div class="txt">${esc(label || '加载中…')}</div></div>`;
  }
  // 全屏遮罩版：GB.pageLoading(true) 显示，GB.pageLoading(false) 移除
  function pageLoading(show, label) {
    let el = document.getElementById('gbPageLoading');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'gbPageLoading';
        el.className = 'gb-loading overlay';
        el.setAttribute('role', 'status');
        el.innerHTML = `<div class="spin"></div><div class="txt">${esc(label || '加载中…')}</div>`;
        document.body.appendChild(el);
      } else {
        const t = el.querySelector('.txt');
        if (t && label) t.textContent = label;
      }
    } else if (el) el.remove();
  }

  /* ---------------- 轻提示（替代 alert） ---------------- */
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------------- 公告条 ---------------- */
  function renderTicker(titles) {
    const track = document.getElementById('tickerTrack');
    if (!track) return;
    const bar = track.closest('.ticker');
    if (!titles || !titles.length) { if (bar) bar.hidden = true; return; }
    if (bar) bar.hidden = false;
    const items = titles.map(t => `<span>${esc(typeof t === 'string' ? t : (t && t.title) || '')}</span>`).join('');
    track.innerHTML = items + items;   // 复制一份以实现无缝滚动
  }
  async function loadAnnouncements() {
    const url = CFG.ANNOUNCEMENTS_URL;
    if (!url) return null;           // 未配置 → 交给页面自行降级（如首页用「公告」分类）
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.list || data.announcements || []);
      const titles = list.map(x => (typeof x === 'string' ? x : (x && (x.title || x.text)) || '')).filter(Boolean);
      renderTicker(titles);
      return titles;
    } catch (e) {
      console.warn('[announcements] 远端不可用：', e);
      return null;
    }
  }

  /* ---------------- 本地演示模式 ----------------
     后端 CORS 目前只放行 https://grp.blacknet.cc.cd，本机（localhost / 预览面板）
     无法请求 api / oauth。故在 localhost 下启用演示数据兜底，方便本机完整预览。
     生产域名下 demoMode 恒为 false，不受影响。 */
  const demoMode = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  let demoNoticeShown = false;
  function showDemoNotice() {
    if (demoNoticeShown) return;
    demoNoticeShown = true;
    const el = document.createElement('div');
    el.className = 'demo-note';
    el.textContent = '本地预览 · 演示数据（后端未放行本机域名）';
    document.body.appendChild(el);
  }

  /* ---------------- 公共头部交互 ---------------- */
  function applyBrandLinks() {
    const main = CFG.MAIN_SITE;
    if (!main) return;
    document.querySelectorAll('[data-brand-link]').forEach(a => { a.href = main; });
  }

  function initHeader() {
    // 品牌链接（「群档案」→ 主站）
    applyBrandLinks();

    // 导航高亮
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('#siteNav [data-nav]').forEach(a => {
      const k = a.dataset.nav;
      const on = (k === 'home' && (page === '' || page === 'index.html'))
              || (k === 'about' && page === 'about.html')
              || (k === 'contact' && page === 'contact.html');
      a.classList.toggle('active', on);
    });

    // 主题切换
    const root = document.documentElement;
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('gb-theme', next); } catch (e) {}
        document.dispatchEvent(new CustomEvent('gb:theme', { detail: next }));
      });
    }

    // 吸顶投影
    const header = document.getElementById('siteHeader');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // 移动端菜单
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        const nav = document.querySelector('.nav');
        if (!nav) return;
        const open = nav.style.display === 'flex';
        nav.style.cssText = open ? '' : 'display:flex;position:absolute;top:100%;left:0;right:0;flex-direction:column;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 18px';
      });
    }
  }

  /* ---------------- 入场动效 ---------------- */
  function initReveal(root) {
    const nodes = (root || document).querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { nodes.forEach(n => n.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: .12 });
    nodes.forEach(n => io.observe(n));
  }

  /* ---------------- 暴露 ---------------- */
  const GB = {
    CFG, EMOJI, EMOJI_MAP, CATS_FALLBACK, LEGACY_CAT,
    get cats() { return CATS; },
    catSource: 'fallback',
    catReady,
    esc, b64d, b64e, ini, fmtDate, fmtShort,
    hueOf, nameOf, catInfo, catIdOf, isAnnouncement, grad, isGeneral, coverLabel,
    parseFirstLine, coverHTML,
    toast, renderTicker, loadAnnouncements, loadCategories,
    loadingHTML, pageLoading,
    initHeader, initReveal,
    demoMode, showDemoNotice,
    emojiOf: content => EMOJI_MAP[content] || content
  };
  window.GB = GB;

  /* ---------------- 启动 ---------------- */
  // 分类：立刻开始加载（页面可用 GB.catReady 等待）
  loadCategories();

  // 公告条：有配置就拉取；无配置则等页面（首页）用文章数据兜底
  if (CFG.ANNOUNCEMENTS_URL) loadAnnouncements();

  // 头部与动效：公共部分（head.html）注入完成后再执行
  function onCommons() {
    initHeader();
    initReveal();
  }
  if (window.commonsLoaded) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onCommons);
    else onCommons();
  } else {
    document.addEventListener('commonsLoaded', onCommons);
  }
})();
