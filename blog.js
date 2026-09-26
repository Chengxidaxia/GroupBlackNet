// ============================================================
// blog.js — 详情页：正文 + 顶/表情 + 评论（含回复、表情、分页）
// 数据：api.blacknet.cc.cd（读取）/ oauth.blacknet.cc.cd（写入）
// 功能对齐旧版：@提及、#编号、代码复制、图片查看器、评论分页、
//              嵌套回复、评论表情（每人每表情只计一次）、顶、相关阅读
// ============================================================
(function () {
  'use strict';

  const API_URL = (window.BLACKNET && window.BLACKNET.API_URL) || 'https://api.blacknet.cc.cd';
  const OAUTH_BASE = (window.BLACKNET && window.BLACKNET.OAUTH_BASE) || 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = (window.BLACKNET && window.BLACKNET.UPLOAD_URL) || 'https://upload.blacknet.cc.cd';
  const DEFAULT_AVATAR = (window.BLACKNET && window.BLACKNET.DEFAULT_AVATAR) || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
  const COMMENTS_PER_PAGE = 20;

  const $ = id => document.getElementById(id);
  const esc = s => (window.GB ? GB.esc(s) : String(s == null ? '' : s));
  const toast = msg => (window.GB ? GB.toast(msg) : console.warn(msg));

  let discussionData = null;
  let isLoggedIn = false;
  let currentUser = null;
  let vditorInstance = null;
  let allComments = [];
  let totalComments = 0;
  let currentCommentPage = 1;
  let totalCommentPages = 1;
  let isSubmitting = false;
  let allowComments = true;
  let demoLocal = false;   // 本地预览：后端 CORS 未放行本机域名 → 使用演示数据并本地化交互
  const myReactions = new Set();   // `${subjectId}|${content}`；顶用 content = 'UPVOTE'

  /* ================= Markdown ================= */
  let markedReady = false;
  function renderMarkdown(text, imgMax) {
    if (!text) return '';
    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
      return esc(text).replace(/\n/g, '<br>');
    }
    if (!markedReady) {
      try { marked.use({ gfm: true, breaks: true }); } catch (e) { /* 忽略 */ }
      markedReady = true;
    }
    let html;
    try { html = marked.parse(text); } catch (e) { return esc(text).replace(/\n/g, '<br>'); }
    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html, {
        ADD_TAGS: ['input'],
        ADD_ATTR: ['type', 'checked', 'disabled', 'class', 'id', 'style', 'aria-label', 'target', 'rel']
      });
    }
    // 保护已有 <a>，避免二次处理
    const links = [];
    html = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, m => { links.push(m); return `@@L${links.length - 1}@@`; });
    html = html.replace(/(^|[\s（(>])@([a-zA-Z0-9\-_]{1,39})/g,
      (m, p, u) => `${p}<a class="mention" href="https://github.com/${u}" target="_blank" rel="noopener">@${u}</a>`);
    html = html.replace(/(^|[\s（(>])#(\d+)/g,
      (m, p, n) => `${p}<a href="/blog.html?d=${n}">#${n}</a>`);
    html = html.replace(/@@L(\d+)@@/g, (m, i) => links[+i]);
    return html;
  }

  /* ================= 代码复制 / 图片查看器 ================= */
  function addCopyButtons() {
    document.querySelectorAll('.article-body pre, .comment .c-body pre').forEach(pre => {
      if (pre.querySelector('.copy-code-btn')) return;
      const code = pre.querySelector('code');
      if (!code) return;
      const codeText = code.textContent;
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(codeText); }
        catch (err) {
          const ta = document.createElement('textarea');
          ta.value = codeText; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (e2) {}
          document.body.removeChild(ta);
        }
        btn.textContent = '已复制!';
        setTimeout(() => { btn.textContent = '复制'; }, 2000);
      });
      pre.appendChild(btn);
    });
  }

  function initImageViewer() {
    document.addEventListener('dblclick', e => {
      const img = e.target.closest('.article-body img, .comment .c-body img');
      if (!img) return;
      const src = img.getAttribute('src');
      if (!src) return;
      e.preventDefault();
      showImageViewer(src);
    });
  }

  function showImageViewer(src) {
    const overlay = document.createElement('div');
    overlay.className = 'image-viewer-overlay';
    const img = document.createElement('img');
    img.src = src; img.className = 'viewer-img'; img.draggable = false;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-viewer-close'; closeBtn.textContent = '✕'; closeBtn.title = '关闭 (ESC)';
    const info = document.createElement('div');
    info.className = 'image-viewer-info'; info.textContent = '滚轮缩放 · 拖拽移动 · 双击图片打开';
    overlay.append(img, closeBtn, info);
    document.body.appendChild(overlay);

    let scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0, stx = 0, sty = 0;
    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    overlay.addEventListener('wheel', e => {
      e.preventDefault();
      scale = Math.min(Math.max(0.2, scale + (e.deltaY > 0 ? -0.1 : 0.1)), 5);
      apply();
    }, { passive: false });
    overlay.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      dragging = true; overlay.classList.add('dragging');
      sx = e.clientX; sy = e.clientY; stx = tx; sty = ty;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
    function move(e) { if (!dragging) return; tx = stx + (e.clientX - sx); ty = sty + (e.clientY - sy); apply(); }
    function up() { dragging = false; overlay.classList.remove('dragging'); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
    overlay.addEventListener('dragstart', e => e.preventDefault());
    closeBtn.addEventListener('click', e => { e.stopPropagation(); close(); });
    overlay.addEventListener('click', e => { if (e.target === overlay && !dragging) close(); });
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
  }

  /* ================= 反应（顶 / 表情） ================= */
  const EMOJI_TO_CONTENT = {
    '👍': 'THUMBS_UP', '👎': 'THUMBS_DOWN', '😄': 'LAUGH', '🎉': 'HOORAY',
    '😕': 'CONFUSED', '❤️': 'HEART', '🚀': 'ROCKET', '👀': 'EYES'
  };

  function rxBarHTML() {
    const d = discussionData, sid = d.id;
    const up = d.upvoteCount || 0;
    if (isLoggedIn && d.viewerHasUpvoted) myReactions.add(sid + '|UPVOTE');
    let html = `<button class="rx${myReactions.has(sid + '|UPVOTE') ? ' on' : ''}" data-kind="upvote" data-sid="${esc(sid)}" ${isLoggedIn ? '' : 'disabled'} title="顶这篇文章">↑ <span class="n">${up}</span></button>`;
    (d.reactionGroups || []).forEach(g => {
      const n = (g.users && g.users.totalCount) || 0;
      if (n <= 0) return;
      const on = isLoggedIn && g.viewerHasReacted;
      if (on) myReactions.add(sid + '|' + g.content);
      html += `<button class="rx${on ? ' on' : ''}" data-kind="reaction" data-sid="${esc(sid)}" data-content="${esc(g.content)}" ${isLoggedIn ? '' : 'disabled'}>
        ${GB.emojiOf(g.content)} <span class="n">${n}</span></button>`;
    });
    if (isLoggedIn) html += `<button class="rx add" data-kind="add" title="添加表情">＋</button>`;
    return html;
  }

  // 兼容两种元素：文章的 <button class="rx">（内有 .n）与评论的 <span class="c-rx">（计数写在文本里）
  function rxReadCount(el) {
    const nEl = el.querySelector('.n');
    if (nEl) return parseInt(nEl.textContent, 10) || 0;
    return parseInt((el.textContent || '').replace(/[^\d]/g, ''), 10) || 0;
  }
  function rxWriteCount(el, n) {
    const v = String(Math.max(0, n));
    const nEl = el.querySelector('.n');
    if (nEl) { nEl.textContent = v; return; }
    const emoji = el.dataset.emoji || '';
    el.textContent = emoji ? `${emoji} ${v}` : v;
  }
  function rxSetBusy(el, busy) {
    if (el.tagName === 'BUTTON') el.disabled = busy;
    else if (busy) el.setAttribute('data-busy', '1'); else el.removeAttribute('data-busy');
  }

  async function toggleSubjectReaction(el) {
    if (!isLoggedIn) { toast('请先登录'); return; }
    const sid = el.dataset.sid || el.dataset.id;
    const content = el.dataset.content;
    if (!sid || !content) return;
    const key = sid + '|' + content;
    const wasActive = myReactions.has(key);
    const next = !wasActive;
    const cur = rxReadCount(el);

    if (next) myReactions.add(key); else myReactions.delete(key);
    el.classList.toggle('on', next);
    rxWriteCount(el, cur + (next ? 1 : -1));
    if (demoLocal) return;      // 演示模式：仅本地生效
    rxSetBusy(el, true);
    try {
      const res = await fetch(`${OAUTH_BASE}/reaction`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: sid, content, action: next ? 'add' : 'remove' })
      });
      if (res.status === 409) {   // 状态已存在/不存在 → 反向修正
        await fetch(`${OAUTH_BASE}/reaction`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: sid, content, action: next ? 'remove' : 'add' })
        });
        if (next) myReactions.delete(key); else myReactions.add(key);
        el.classList.toggle('on', !next);
        rxWriteCount(el, cur + (next ? -1 : 1));
      } else if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      console.error('Reaction 失败:', e);
      // 回滚
      if (next) myReactions.delete(key); else myReactions.add(key);
      el.classList.toggle('on', wasActive);
      rxWriteCount(el, cur);
      toast('操作失败，请稍后重试');
    } finally {
      rxSetBusy(el, false);
    }
  }

  async function toggleUpvote(el, sid) {
    if (!isLoggedIn) { toast('请先登录'); return; }
    if (!sid) return;
    const key = sid + '|UPVOTE';
    const wasActive = myReactions.has(key);
    const next = !wasActive;
    const cur = el.querySelector('.n')
      ? (parseInt(el.querySelector('.n').textContent, 10) || 0)
      : (parseInt(el.dataset.count || '0', 10) || 0);

    if (next) myReactions.add(key); else myReactions.delete(key);
    el.classList.toggle('on', next);
    rxWriteCount(el, cur + (next ? 1 : -1));
    if (el.querySelector('.n')) el.dataset.count = String(cur + (next ? 1 : -1));

    if (demoLocal) return;      // 演示模式：仅本地生效
    rxSetBusy(el, true);
    try {
      const res = await fetch(`${OAUTH_BASE}/upvote`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: sid, action: next ? 'add' : 'remove' })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      console.error('Upvote 失败:', e);
      if (next) myReactions.delete(key); else myReactions.add(key);
      el.classList.toggle('on', wasActive);
      rxWriteCount(el, cur);
      if (el.querySelector('.n')) el.dataset.count = String(cur);
      toast('操作失败，请稍后重试');
    } finally {
      rxSetBusy(el, false);
    }
  }

  /* ================= 评论渲染 ================= */
  function commentRxHTML(c) {
    const sid = c.id;
    const up = c.upvoteCount || 0;
    const myUp = myReactions.has(sid + '|UPVOTE');
    if (isLoggedIn && c.viewerHasUpvoted) myReactions.add(sid + '|UPVOTE');
    const upOn = isLoggedIn && (c.viewerHasUpvoted || myUp);
    let html = `<span class="c-rx${upOn ? ' on' : ''}" data-kind="cup" data-id="${esc(sid)}" data-count="${up}" data-emoji="↑">↑ ${up}</span>`;
    (c.reactionGroups || []).forEach(g => {
      const n = (g.users && g.users.totalCount) || 0;
      if (n <= 0) return;
      const on = isLoggedIn && g.viewerHasReacted;
      if (on) myReactions.add(sid + '|' + g.content);
      const emo = GB.emojiOf(g.content);
      html += `<span class="c-rx${on ? ' on' : ''}" data-kind="crx" data-id="${esc(sid)}" data-content="${esc(g.content)}" data-emoji="${emo}">${emo} ${n}</span>`;
    });
    return html;
  }

  function renderComment(c) {
    const author = (c.author && c.author.login) || '未知';
    const avatar = (c.author && c.author.avatarUrl) || DEFAULT_AVATAR;
    const isTemp = !!c.isTemp;
    const replies = (c.replies && c.replies.nodes) || [];
    const sorted = replies.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return `
      <div class="comment ${isTemp ? 'temp-comment' : ''}" data-id="${esc(c.id)}">
        <span class="avatar lg"><img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.remove()">${esc(GB.ini(author))}</span>
        <div style="flex:1;min-width:0">
          <div class="c-head">
            <a href="https://github.com/${esc(author)}" target="_blank" rel="noopener"><b>@${esc(author)}</b></a>
            <span class="muted">· ${GB.fmtDate(c.createdAt)}</span>
            ${isTemp ? '<span style="color:var(--accent);font-size:12px">· 发送中…</span>' : ''}
          </div>
          <div class="c-body">${renderMarkdown(c.body, 280)}</div>
          ${isTemp ? '' : `
            <div class="c-acts">
              ${isLoggedIn ? `<button type="button" data-act="reply" data-id="${esc(c.id)}">↩ 回复</button>` : ''}
              ${isLoggedIn ? `<button type="button" data-act="emoji" data-id="${esc(c.id)}">😊 表情</button>` : ''}
              ${commentRxHTML(c)}
            </div>
            <div class="reply-box" data-reply-for="${esc(c.id)}">
              <textarea placeholder="回复 @${esc(author)}…"></textarea>
              <div class="cf-side">
                <button class="btn btn-ghost btn-sm" data-act="cancel-reply" data-id="${esc(c.id)}" type="button">取消</button>
                <button class="btn btn-primary btn-sm" data-act="send-reply" data-id="${esc(c.id)}" type="button">回复</button>
              </div>
            </div>`}
          ${sorted.length ? `<div class="replies">${sorted.map(renderComment).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  function findCommentById(list, id) {
    for (const c of list) {
      if (String(c.id) === String(id)) return c;
      const replies = (c.replies && c.replies.nodes) || [];
      const found = findCommentById(replies, id);
      if (found) return found;
    }
    return null;
  }

  function renderCommentsPage(page) {
    const listDiv = $('comment-list');
    if (!listDiv) return;
    totalCommentPages = Math.max(1, Math.ceil(allComments.length / COMMENTS_PER_PAGE));
    currentCommentPage = Math.min(Math.max(1, page), totalCommentPages);
    const start = (currentCommentPage - 1) * COMMENTS_PER_PAGE;
    const pageItems = allComments.slice(start, start + COMMENTS_PER_PAGE);

    listDiv.innerHTML = pageItems.length
      ? pageItems.map(renderComment).join('')
      : '<div class="empty-note">还没有评论，来做第一个留言的人吧。</div>';

    addCopyButtons();
    renderCommentPager();
  }

  function buildPager(container, page, total, onChange) {
    if (!container) return;
    if (total <= 1) { container.innerHTML = ''; return; }
    let html = `<button type="button" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹</button>`;
    const maxVisible = 5;
    let pages = [];
    if (total <= maxVisible + 2) { for (let i = 1; i <= total; i++) pages.push(i); }
    else {
      pages.push(1);
      let s = Math.max(2, page - 2), e = Math.min(total - 1, page + 2);
      if (e - s < maxVisible - 1) {
        if (s === 2) e = Math.min(total - 1, s + maxVisible - 2);
        else if (e === total - 1) s = Math.max(2, e - maxVisible + 2);
      }
      if (s > 2) pages.push('…');
      for (let i = s; i <= e; i++) pages.push(i);
      if (e < total - 1) pages.push('…');
      pages.push(total);
    }
    pages.forEach(p => {
      if (p === '…') html += `<span class="ellipsis" data-jump="1" title="跳转到指定页">…</span>`;
      else html += `<button type="button" class="${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
    });
    html += `<button type="button" ${page >= total ? 'disabled' : ''} data-page="${page + 1}">›</button>`;
    container.innerHTML = html;

    if (container._boundFor !== onChange) {
      container._boundFor = onChange;
      container.addEventListener('click', e => {
        const j = e.target.closest('[data-jump]');
        if (j) {
          const input = document.createElement('input');
          input.className = 'jump'; input.type = 'number'; input.min = '1'; input.max = String(total);
          input.placeholder = '页码';
          j.replaceWith(input); input.focus();
          const commit = () => {
            const v = parseInt(input.value, 10);
            if (v >= 1 && v <= total) onChange(v);
            else { renderCommentPager(); toast('请输入 1 - ' + total + ' 之间的页码'); }
          };
          input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') commit();
            if (ev.key === 'Escape') renderCommentPager();
          });
          input.addEventListener('blur', () => { if (input.isConnected) renderCommentPager(); });
          return;
        }
        const b = e.target.closest('button[data-page]');
        if (!b || b.disabled) return;
        const p = parseInt(b.dataset.page, 10);
        if (p >= 1 && p <= total) onChange(p);
      });
    }
  }

  function renderCommentPager() {
    const go = p => { renderCommentsPage(p); };
    buildPager($('comment-pagination-top'), currentCommentPage, totalCommentPages, go);
    buildPager($('comment-pagination-bottom'), currentCommentPage, totalCommentPages, go);
  }

  /* ================= 评论事件 ================= */
  function bindCommentEvents() {
    const listDiv = $('comment-list');
    if (!listDiv || listDiv._bound) return;
    listDiv._bound = true;

    listDiv.addEventListener('click', async e => {
      // 表情 chip / 评论顶
      const chip = e.target.closest('.c-rx');
      if (chip) {
        if (!isLoggedIn) { toast('请先登录'); return; }
        const cid = chip.dataset.id;
        if (chip.dataset.kind === 'cup') {
          chip.dataset.count = chip.dataset.count || '0';
          await toggleUpvote(chip, cid);
          return;
        }
        if (chip.dataset.kind === 'crx') {
          if (findCommentById(allComments, cid)) await toggleSubjectReaction(chip);
          return;
        }
      }

      const act = e.target.closest('[data-act]');
      if (!act) return;
      const id = act.dataset.id;
      const name = act.dataset.act;

      if (name === 'reply') {
        const box = listDiv.querySelector(`.reply-box[data-reply-for="${id}"]`);
        if (!box) return;
        box.classList.toggle('open');
        if (box.classList.contains('open')) box.querySelector('textarea').focus();
        return;
      }
      if (name === 'cancel-reply') {
        const box = listDiv.querySelector(`.reply-box[data-reply-for="${id}"]`);
        if (box) box.classList.remove('open');
        return;
      }
      if (name === 'emoji') {
        openEmojiPicker(act, id);
        return;
      }
      if (name === 'send-reply') {
        const box = listDiv.querySelector(`.reply-box[data-reply-for="${id}"]`);
        if (!box) return;
        const ta = box.querySelector('textarea');
        const body = (ta.value || '').trim();
        if (!body) { toast('回复内容不能为空'); return; }
        await sendComment(body, id);
        return;
      }
    });
  }

  // targetId：评论 id；传文章 id（discussionData.id）时作用于文章本体
  function openEmojiPicker(anchor, targetId) {
    const existing = document.querySelector('.picker');
    if (existing) existing.remove();
    const picker = document.createElement('div');
    picker.className = 'picker';
    picker.innerHTML = GB.EMOJI.map(x => `<button type="button" data-pick="${x}">${x}</button>`).join('');
    document.body.appendChild(picker);
    const r = anchor.getBoundingClientRect();
    picker.style.top = Math.min(r.bottom + 6, window.innerHeight - picker.offsetHeight - 10) + 'px';
    picker.style.left = Math.min(Math.max(8, r.left), window.innerWidth - picker.offsetWidth - 12) + 'px';

    const close = ev => { if (!picker.contains(ev.target) && !anchor.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
    picker.addEventListener('click', async ev => {
      const t = ev.target.closest('[data-pick]');
      if (!t) return;
      const emoji = t.dataset.pick;
      const content = EMOJI_TO_CONTENT[emoji];
      picker.remove();
      if (!content) return;

      const isArticle = !!(discussionData && String(targetId) === String(discussionData.id));
      const kind = isArticle ? 'reaction' : 'crx';
      const attr = isArticle ? 'data-sid' : 'data-id';
      const scope = isArticle ? '#reactions' : '#comment-list';
      // 若该表情已在页面上存在，直接切换它的按钮
      const btn = document.querySelector(`${scope} [data-kind="${kind}"][${attr}="${targetId}"][data-content="${content}"]`);
      if (btn) { await toggleSubjectReaction(btn); return; }

      if (demoLocal) {
        // 演示模式：直接在内存中新增该表情
        if (isArticle) {
          discussionData.reactionGroups = discussionData.reactionGroups || [];
          discussionData.reactionGroups.push({ content, users: { totalCount: 1 }, viewerHasReacted: true });
          myReactions.add(targetId + '|' + content);
          $('reactions').innerHTML = rxBarHTML();
        } else {
          const comment = findCommentById(allComments, targetId);
          if (!comment) return;
          if (!comment.reactionGroups) comment.reactionGroups = [];
          comment.reactionGroups.push({ content, users: { totalCount: 1 }, viewerHasReacted: true });
          myReactions.add(targetId + '|' + content);
          renderCommentsPage(currentCommentPage);
        }
        return;
      }

      // 否则先调用接口，再重载
      try {
        const res = await fetch(`${OAUTH_BASE}/reaction`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: targetId, content, action: 'add' })
        });
        if (!res.ok && res.status !== 409) throw new Error('HTTP ' + res.status);
        myReactions.add(targetId + '|' + content);
        await loadDiscussionFull(discussionData.number);
      } catch (err) {
        console.error('添加表情失败:', err);
        toast('添加表情失败，请稍后重试');
      }
    });
  }

  /* ================= 评论编辑器（Vditor） ================= */
  async function initVditor() {
    const host = $('vditor-container');
    if (!host) return;
    if (!isLoggedIn) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="vd-status">评论编辑器加载中…</div>';
    const ok = await waitVditor();
    if (!ok) {
      host.innerHTML = '';
      const ta = document.createElement('textarea');
      ta.className = 'inp'; ta.rows = 4; ta.placeholder = '写下你的评论…（支持 Markdown 与 @提及）';
      host.appendChild(ta);
      host._fallback = ta;
      toast('Vditor 未加载，已降级为普通文本框');
      return;
    }
    host.innerHTML = '';
    if (vditorInstance) { try { vditorInstance.destroy(); } catch (e) {} vditorInstance = null; }

    vditorInstance = new Vditor(host, {
      cdn: (window.BLACKNET && window.BLACKNET.VDITOR_BASE) || 'vditor/4.0.0',
      height: 220,
      minHeight: 150,
      mode: 'wysiwyg',
      placeholder: '写下你的评论… 支持 Markdown 与 @提及',
      value: '',
      cache: { enable: false },
      lang: 'zh_CN',
      icon: 'ant',
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'classic',
      upload: {
        url: `${UPLOAD_URL}/`,
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml',
        max: 32 * 1024 * 1024,
        multiple: false,
        withCredentials: true
      },
      toolbar: [
        'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
        'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
        'quote', 'line', 'code', 'inline-code', 'insert-before', 'insert-after', '|',
        'upload', 'record', 'table', '|',
        'undo', 'redo', '|',
        'fullscreen', 'edit-mode',
        { name: 'more', toolbar: ['both', 'code-theme', 'content-theme', 'export', 'outline', 'preview', 'devtools', 'info', 'help'] },
        '|',
        {
          name: 'submit',
          tip: '发送评论',
          className: 'toolbar-send',
          icon: '<span class="tb-send">发送</span>',
          click: () => {
            const body = getCommentBody();
            if (!body) { toast('请先输入评论内容'); return; }
            sendComment(body, null);
          }
        }
      ],
      toolbarConfig: { pin: true },
      outline: { enable: false },
      input: () => {},
      after: () => {}
    });
  }

  function waitVditor(timeout) {
    const limit = timeout || 10000;
    return new Promise(resolve => {
      let waited = 0;
      (function poll() {
        if (typeof Vditor !== 'undefined') return resolve(true);
        if (waited >= limit) return resolve(false);
        waited += 200; setTimeout(poll, 200);
      })();
    });
  }

  function getCommentBody() {
    if (vditorInstance && typeof vditorInstance.getValue === 'function') return vditorInstance.getValue().trim();
    const host = $('vditor-container');
    if (host && host._fallback) return (host._fallback.value || '').trim();
    return '';
  }
  function clearCommentBody() {
    if (vditorInstance) vditorInstance.setValue('');
    const host = $('vditor-container');
    if (host && host._fallback) host._fallback.value = '';
  }

  /* ================= 评论提交 ================= */
  async function sendComment(body, parentCommentId) {
    if (isSubmitting) return;
    if (!discussionData) { toast('文章数据未加载完成'); return; }
    if (!body) { toast('内容不能为空'); return; }

    // 本地演示：评论 / 回复直接写入内存，便于完整预览交互
    if (demoLocal) {
      const node = {
        id: 'demo-' + Date.now(), body,
        createdAt: new Date().toISOString(),
        author: { login: (currentUser && currentUser.login) || 'demo-user' },
        reactionGroups: [], upvoteCount: 0, viewerHasUpvoted: false, replies: { nodes: [] }
      };
      if (parentCommentId) {
        const parent = findCommentById(allComments, parentCommentId);
        if (!parent) { toast('找不到被回复的评论'); return; }
        if (!parent.replies) parent.replies = { nodes: [] };
        parent.replies.nodes.unshift(node);
        renderCommentsPage(currentCommentPage);
      } else {
        allComments.unshift(node);
        clearCommentBody();
        renderCommentsPage(1);
      }
      totalComments = allComments.length;
      if ($('cCount')) $('cCount').textContent = String(totalComments);
      toast(parentCommentId ? '回复已发布（演示）' : '评论已发布（演示）');
      return;
    }

    const temp = {
      id: 'temp-' + Date.now(),
      body,
      createdAt: new Date().toISOString(),
      author: {
        login: (currentUser && currentUser.login) || '你',
        avatarUrl: (currentUser && currentUser.avatarUrl) || DEFAULT_AVATAR
      },
      reactionGroups: [], upvoteCount: 0, replies: { nodes: [] }, isTemp: true
    };

    if (parentCommentId) {
      const parent = findCommentById(allComments, parentCommentId);
      if (!parent) { toast('找不到被回复的评论'); return; }
      if (!parent.replies) parent.replies = { nodes: [] };
      parent.replies.nodes.unshift(temp);
      renderCommentsPage(currentCommentPage);
    } else {
      allComments.unshift(temp);
      renderCommentsPage(1);
      clearCommentBody();
    }

    isSubmitting = true;
    try {
      const payload = { discussionId: discussionData.id, body };
      if (parentCommentId) payload.parentCommentId = parentCommentId;
      const res = await fetch(`${OAUTH_BASE}/comment`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadDiscussionFull(discussionData.number);
        toast(parentCommentId ? '回复已发布' : '评论已发布');
      } else {
        removeTemp(temp.id);
        toast('发布失败：' + (data.error || ('HTTP ' + res.status)));
      }
    } catch (e) {
      console.error('评论提交失败:', e);
      removeTemp(temp.id);
      toast('网络错误，发布失败');
    } finally {
      isSubmitting = false;
    }
  }

  function removeTemp(id) {
    allComments = allComments.filter(c => c.id !== id);
    allComments.forEach(c => {
      if (c.replies && c.replies.nodes) c.replies.nodes = c.replies.nodes.filter(r => r.id !== id);
    });
    renderCommentsPage(currentCommentPage);
  }

  /* ================= 主流程 ================= */
  async function loadDiscussionFull(number, prefetched) {
    if (demoLocal && window.GB_DEMO) prefetched = window.GB_DEMO.discussion(number);
    let data;
    if (prefetched) {
      data = { discussion: prefetched };
    } else {
      const res = await fetch(`${API_URL}/?d=${number}&cfirst=100`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    }
    discussionData = data.discussion;
    if (!discussionData) throw new Error('Discussion not found');

    const titleText = discussionData.title || '无标题';
    document.title = titleText + ' · 群档案';

    const meta = GB.parseFirstLine(discussionData.body || '');
    allowComments = meta.allowComments !== false;
    const cat = GB.catInfo(GB.catIdOf(discussionData, meta), discussionData.category && discussionData.category.name);

    // 文章头
    $('title').textContent = titleText;
    $('lede').textContent = meta.info || '';
    const catEl = $('category');
    const general = GB.isGeneral(cat);
    catEl.hidden = general;                       // General 类默认不显示分类标签
    if (!general) {
      catEl.textContent = cat.name;
      catEl.style.background = `hsl(${cat.hue} 62% 42%)`;
    }
    const crumbCat = $('crumbCat');
    if (crumbCat) {
      crumbCat.hidden = general;
      crumbCat.textContent = general ? '' : cat.name;
      const sep = crumbCat.previousElementSibling;   // 前面的「/」
      if (sep && sep.classList.contains('s')) sep.hidden = general;
    }
    $('cover').innerHTML = GB.coverHTML({ icon: meta.icon, coverText: meta.coverText, category: cat.id }, { fallbackName: cat.name, size: 44 });

    const author = (discussionData.author && discussionData.author.login) || '匿名';
    const avatar = (discussionData.author && discussionData.author.avatarUrl) || DEFAULT_AVATAR;
    const upv = discussionData.upvoteCount || 0;
    const reactTotal = (discussionData.reactionGroups || []).reduce((a, g) => a + ((g.users && g.users.totalCount) || 0), 0);
    $('meta').innerHTML = `
      <span class="who">
        <span class="avatar lg"><img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.remove()">${esc(GB.ini(author))}</span>
        <a href="https://github.com/${esc(author)}" target="_blank" rel="noopener">@${esc(author)}</a>
      </span>
      <span class="stat">🕑 ${GB.fmtDate(discussionData.createdAt)}</span>
      <span class="right">
        <span class="stat">↑ ${upv}</span>
        <span class="stat">🔥 ${reactTotal}</span>
        <span class="stat">💬 ${(discussionData.comments && discussionData.comments.totalCount) || 0}</span>
      </span>`;

    // 正文
    $('body').innerHTML = meta.bodyText ? renderMarkdown(meta.bodyText) : '<p class="muted">（本文没有正文内容）</p>';
    addCopyButtons();

    // 反应条
    const bar = $('reactions');
    bar.innerHTML = rxBarHTML();
    if (!bar._bound) {
      bar._bound = true;
      bar.addEventListener('click', e => {
        const b = e.target.closest('.rx');
        if (!b) return;
        if (b.dataset.kind === 'upvote') { toggleUpvote(b, b.dataset.sid); return; }
        if (b.dataset.kind === 'reaction') { toggleSubjectReaction(b); return; }
        if (b.dataset.kind === 'add') { openEmojiPicker(b, discussionData.id); }
      });
    }

    // 标签
    const tags = meta.tags && meta.tags.length ? meta.tags : [];
    $('tags').innerHTML = tags.length
      ? `<span class="muted" style="font-size:13px">标签</span>` + tags.map(t => `<a class="tag" href="/index.html#list"># ${esc(t)}</a>`).join('')
      : '';

    // 评论
    allComments = ((discussionData.comments && discussionData.comments.nodes) || [])
      .slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    totalComments = (discussionData.comments && discussionData.comments.totalCount) || 0;
    $('cCount').textContent = totalComments ? `${totalComments}` : '';
    renderCommentsPage(1);

    // 评论区可用性
    const hint = $('loginHint');
    const form = $('commentForm');
    const closed = $('closedHint');
    if (!allowComments) {
      hint.hidden = true; form.hidden = true; closed.hidden = false;
    } else if (isLoggedIn) {
      hint.hidden = true; form.hidden = false; closed.hidden = true;
      if (typeof Vditor === 'undefined' && !$('vditor-container')._fallback) {
        // 编辑器脚本尚未加载：先等一次（blog.js 在 head 里同步引入，通常已就绪）
      }
      initVditor();
    } else {
      hint.hidden = false; form.hidden = true; closed.hidden = true;
    }
  }

  async function loadRelated(number) {
    let pool = null;
    if (demoLocal && window.GB_DEMO) {
      pool = window.GB_DEMO.posts.filter(p => p.number !== number);
    } else {
      try {
        const res = await fetch(`${API_URL}/?first=24`);
        if (!res.ok) return;
        const data = await res.json();
        pool = (data.nodes || []).filter(p => p.number !== number);
      } catch (e) {
        console.warn('相关阅读加载失败:', e);
        return;
      }
    }
    if (!pool || !pool.length) return;
      const cur = GB.parseFirstLine(discussionData.body || '');
      const curCat = GB.catIdOf(discussionData, cur);
      pool.sort((a, b) => {
        const ca = GB.catIdOf(a, GB.parseFirstLine(a.body || '')) === curCat ? 1 : 0;
        const cb = GB.catIdOf(b, GB.parseFirstLine(b.body || '')) === curCat ? 1 : 0;
        if (ca !== cb) return cb - ca;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      const picks = pool.slice(0, 3);
      $('related').innerHTML = picks.map(p => {
        const pm = GB.parseFirstLine(p.body || '');
        const pc = GB.catInfo(GB.catIdOf(p, pm), p.category && p.category.name);
        return `
          <a class="card" href="/blog.html?d=${p.number}">
            <div class="thumb">
              ${GB.coverHTML({ icon: pm.icon, coverText: pm.coverText, category: pc.id }, { fallbackName: pc.name, size: 30 })}
              ${GB.isGeneral(pc) ? '' : `<span class="chip" style="background:hsl(${pc.hue} 62% 42%)">${esc(pc.name)}</span>`}
            </div>
            <div class="card-body">
              <h3>${esc(p.title || '无标题')}</h3>
              <div class="card-foot"><span>${GB.fmtShort(p.createdAt)}</span><span>💬 ${(p.comments && p.comments.totalCount) || 0}</span></div>
            </div>
          </a>`;
      }).join('');
      $('relatedSection').hidden = false;
  }

  async function checkLogin() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      if (res.ok) { isLoggedIn = true; currentUser = await res.json(); return; }
      isLoggedIn = false;
    } catch (e) { isLoggedIn = false; }
    // 本地预览：登录接口同样被 CORS 拦，按演示登录处理，便于预览评论编辑器等交互
    if (window.GB && GB.demoMode) {
      isLoggedIn = true;
      currentUser = { login: 'demo-user' };
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    const number = parseInt(d, 10);
    if (!d || isNaN(number) || number <= 0) { window.location.href = '/404.html'; return; }

    if (window.GB) await GB.catReady;
    await checkLogin();

    GB.pageLoading(true, '正在加载文章…');
    try {
      await loadDiscussionFull(number);
    } catch (e) {
      console.error('加载失败:', e);
      if (window.GB && GB.demoMode && window.GB_DEMO) {
        demoLocal = true;
        GB.showDemoNotice();
        await loadDiscussionFull(number, window.GB_DEMO.discussion(number));
      } else {
        GB.pageLoading(false);
        $('body').innerHTML = '<p style="color:var(--accent)">加载失败，请稍后重试。</p>';
        return;
      }
    }
    GB.pageLoading(false);

    bindCommentEvents();
    const cs = $('cSubmit');
    if (cs) cs.addEventListener('click', () => {
      const body = getCommentBody();
      if (!body) { toast('请先输入评论内容'); return; }
      sendComment(body, null);
    });
    const ll = $('loginLink');
    if (ll) ll.addEventListener('click', () => {
      const btn = document.getElementById('login');
      if (btn) btn.click();
      else window.location.href = `${OAUTH_BASE}/login`;
    });

    initImageViewer();
    loadRelated(number);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
