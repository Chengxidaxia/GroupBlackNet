// ============================================================
// blog.js - 文章详情页（支持回复功能）
// ============================================================

(function() {
  'use strict';

  const API_URL = 'https://api.blacknet.cc.cd';
  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const COMMENTS_PER_PAGE = 20;

  const titleEl = document.getElementById('title');
  const infoEl = document.getElementById('information');
  const textEl = document.getElementById('text');
  const commentContainer = document.getElementById('comment');

  let discussionData = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoggedIn = false;
  let currentUser = null;
  let vditorInstance = null;
  let allComments = [];
  let totalComments = 0;
  let userReactions = {};

  // ---------- 辅助函数 ----------
  function base64Decode(str) {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return atob(str);
    }
  }

  // ---------- Markdown 渲染（支持 GFM 全部特性） ----------
  function renderMarkdown(text) {
    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
      // fallback
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    // 配置 marked 以支持 GFM 全部特性
    // 使用 marked.use 扩展（推荐）
    if (typeof marked.use === 'function') {
      marked.use({
        gfm: true,          // 启用 GFM（自动链接、任务列表、表格等）
        breaks: true,       // 换行符转 <br>
        pedantic: false,
        mangle: false,
        headerIds: false,
        highlight: function(code, lang) {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return code;
        }
      });
    }

    // 渲染 Markdown
    let html = marked.parse(text);

    // 清洗 HTML，但保留必要属性和标签
    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html, {
        ADD_TAGS: ['input', 'task-list', 'task-list-item'],  // 任务列表所需
        ADD_ATTR: ['type', 'checked', 'disabled', 'class', 'id', 'aria-label', 'data-*'],
        FORCE_ATTR: {
          'input': { 'disabled': '' }  // 防止用户交互
        },
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|geo):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    }

    // 给代码块添加样式（如果需要语法高亮，可配合 highlight.js）
    // 我们使用简单的背景和字体
    html = html.replace(/<pre>/g, '<pre style="background:#f6f8fa; padding:16px; border-radius:6px; overflow:auto; font-size:13px; line-height:1.45;">');
    html = html.replace(/<code>/g, '<code style="font-family:SFMono-Regular,Consolas,monospace;">');

    // 强制图片块级显示
    html = html.replace(/<img([^>]*)>/gi, function(match, attrs) {
      if (/style\s*=/i.test(attrs)) {
        attrs = attrs.replace(/style\s*=\s*(["'])([^"']*)\1/i, function(m, quote, style) {
          return `style=${quote}${style}; display:block; margin:10px 0; max-width:100%; height:auto;${quote}`;
        });
      } else {
        attrs += ` style="display:block; margin:10px 0; max-width:100%; height:auto;"`;
      }
      return `<img${attrs}>`;
    });

    return html;
  }

  function sanitizeHtml(html) {
    if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(html, {
        ADD_TAGS: ['pre', 'code'],
        ADD_ATTR: ['style', 'class'],
      });
    }
    return html;
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  const EMOJI_MAP = {
    'THUMBS_UP': '👍',
    'THUMBS_DOWN': '👎',
    'LAUGH': '😄',
    'HOORAY': '🎉',
    'CONFUSED': '😕',
    'HEART': '❤️',
    'ROCKET': '🚀',
    'EYES': '👀'
  };

  function parseFirstLine(body) {
    const lines = body.split('\n');
    const firstLine = lines.find(line => line.trim() !== '') || '';
    let info = null;
    let isJson = false;
    try {
      const data = JSON.parse(firstLine);
      isJson = true;
      if (data.info) {
        info = base64Decode(data.info);
      }
    } catch (e) {
      info = firstLine
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[.*?\]\(.*?\)/g, '$1')
        .replace(/[#*`>_\-]/g, '')
        .trim() || '无简介';
    }
    let bodyText = '';
    if (isJson) {
      const restLines = lines.slice(1);
      bodyText = restLines.join('\n').trim();
    } else {
      bodyText = body.replace(firstLine, '').trim();
    }
    return { info, bodyText, isJson };
  }

  // ---------- 渲染 Reaction ----------
  function renderReactions(reactionGroups, subjectId, canInteract = false) {
    if (!reactionGroups || reactionGroups.length === 0) {
      return '<div class="reactions-container" style="display:flex; flex-wrap:wrap; gap:8px; margin:10px 0;"></div>';
    }
    let html = '<div class="reactions-container" style="display:flex; flex-wrap:wrap; gap:8px; margin:10px 0;">';
    reactionGroups.forEach(group => {
      const count = group.users.totalCount;
      const emoji = EMOJI_MAP[group.content] || group.content;
      const countId = `reaction-count-${subjectId}-${group.content}`;
      const viewerReacted = group.viewerHasReacted === true;
      if (canInteract) {
        userReactions[`${subjectId}-${group.content}`] = viewerReacted;
      }
      const isActive = viewerReacted && canInteract;
      const borderColor = isActive ? '#0366d6' : '#ddd';
      const bgColor = isActive ? '#dbedff' : '#f6f8fa';
      const interactiveClass = canInteract ? 'reaction-btn' : '';
      html += `
        <div class="reaction-item ${interactiveClass}" 
             data-subject-id="${subjectId}" 
             data-reaction="${group.content}"
             style="display:flex; align-items:center; gap:4px; padding:4px 8px; border:1px solid ${borderColor}; border-radius:16px; background:${bgColor}; ${canInteract ? 'cursor:pointer;' : ''}">
          <span style="font-size:18px;">${emoji}</span>
          <span id="${countId}" style="font-weight:bold;">${count}</span>
          ${canInteract ? `<span style="font-size:12px;color:#888;">➕</span>` : ''}
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  // ---------- 渲染评论树（递归） ----------
  function renderCommentTree(comments, level = 0) {
    if (!comments || comments.length === 0) return '';
    let html = '';
    const indent = level * 20;
    comments.forEach(comment => {
      const author = comment.author.login;
      const avatar = comment.author.avatarUrl;
      const createdAt = formatDate(comment.createdAt);
      const bodyHtml = sanitizeHtml(renderMarkdown(comment.body));
      const reactionHtml = renderReactions(
        comment.reactionGroups || [],
        comment.id,
        isLoggedIn
      );
      const replyCount = comment.replies ? comment.replies.totalCount || 0 : 0;
      const hasReplies = replyCount > 0;

      html += `
        <div class="comment-item" style="border-bottom:1px solid #e1e4e8;padding:12px 0; text-align:left; margin-left:${indent}px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <a href="https://github.com/${author}" target="_blank" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit;">
              <img src="${avatar}" style="width:32px; height:32px; border-radius:50%;" alt="avatar" />
              <span style="font-weight:bold;">${author}</span>
            </a>
            <span style="color:#888;font-size:12px;">${createdAt}</span>
            ${isLoggedIn ? `<button class="reply-btn" data-comment-id="${comment.id}" style="border:none;background:none;cursor:pointer;color:#0366d6;font-size:12px;">回复</button>` : ''}
          </div>
          <div style="margin-left:40px; font-size:14px; line-height:1.6;">${bodyHtml}</div>
          ${reactionHtml}
          <div class="reply-container" data-parent-id="${comment.id}" style="margin-top:8px;"></div>
          ${hasReplies ? `<div class="replies-container" style="margin-left:20px;">${renderCommentTree(comment.replies.nodes, level + 1)}</div>` : ''}
        </div>
      `;
    });
    return html;
  }

  // ---------- 渲染评论列表 ----------
  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      return '<p style="text-align:center;color:#888;">暂无评论</p>';
    }
    return `<div style="border:1px solid #ddd; border-radius:8px; padding:10px; background:#f9f9f9; text-align:left;">${renderCommentTree(comments)}</div>`;
  }

  // ---------- 绑定回复按钮事件 ----------
  function bindReplyEvents() {
    document.querySelectorAll('.reply-btn').forEach(btn => {
      btn.removeEventListener('click', handleReplyClick);
      btn.addEventListener('click', handleReplyClick);
    });
    // 重新绑定 reaction 事件
    bindReactionEvents();
  }

  // ---------- 处理回复点击 ----------
  function handleReplyClick(e) {
    const btn = e.currentTarget;
    const parentId = btn.dataset.commentId;
    const container = document.querySelector(`.reply-container[data-parent-id="${parentId}"]`);
    if (!container) return;

    // 如果已经存在回复框则移除
    const existing = container.querySelector('.reply-editor');
    if (existing) {
      container.innerHTML = '';
      return;
    }

    // 创建内联编辑框（简单 textarea + 提交按钮）
    const editorDiv = document.createElement('div');
    editorDiv.className = 'reply-editor';
    editorDiv.style.cssText = 'margin-top:8px; padding:8px; border:1px solid #ddd; border-radius:4px; background:#fff;';
    editorDiv.innerHTML = `
      <textarea rows="3" placeholder="写下你的回复..." style="width:100%; padding:4px; font-size:14px; border:1px solid #ccc; border-radius:4px;"></textarea>
      <div style="margin-top:4px;">
        <button class="reply-submit" data-parent-id="${parentId}" style="background:#2da44e; color:white; border:none; border-radius:4px; padding:4px 12px; cursor:pointer;">提交回复</button>
        <button class="reply-cancel" style="background:#ccc; color:#333; border:none; border-radius:4px; padding:4px 12px; cursor:pointer; margin-left:4px;">取消</button>
      </div>
    `;
    container.appendChild(editorDiv);

    editorDiv.querySelector('.reply-cancel').addEventListener('click', function() {
      container.innerHTML = '';
    });

    editorDiv.querySelector('.reply-submit').addEventListener('click', async function() {
      const textarea = editorDiv.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body) {
        alert('请输入回复内容');
        return;
      }
      try {
        const res = await fetch(`${OAUTH_BASE}/comment`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            discussionId: discussionData.id,
            body: body,
            parentCommentId: parentId
          })
        });
        const data = await res.json();
        if (res.ok) {
          alert('回复成功！');
          // 重新加载讨论以显示新回复
          const d = discussionData.number;
          await loadDiscussionFull(d);
        } else {
          alert(data.error || '回复失败');
        }
      } catch (error) {
        console.error('回复异常:', error);
        alert('网络错误，请稍后重试');
      }
    });
  }

  // ---------- Reaction 交互 ----------
  function updateReactionCount(subjectId, content, delta) {
    const countId = `reaction-count-${subjectId}-${content}`;
    const el = document.getElementById(countId);
    if (el) {
      const current = parseInt(el.textContent, 10);
      el.textContent = Math.max(0, current + delta);
    }
  }

  function toggleReactionHighlight(item, active) {
    if (active) {
      item.style.borderColor = '#0366d6';
      item.style.background = '#dbedff';
    } else {
      item.style.borderColor = '#ddd';
      item.style.background = '#f6f8fa';
    }
  }

  async function handleReactionClick(e) {
    const item = e.currentTarget;
    const subjectId = item.dataset.subjectId;
    const content = item.dataset.reaction;
    if (!subjectId || !content) return;

    if (!isLoggedIn) {
      alert('请先登录以使用表情功能');
      return;
    }

    const key = `${subjectId}-${content}`;
    const isActive = userReactions[key] === true;
    const newActive = !isActive;
    userReactions[key] = newActive;

    toggleReactionHighlight(item, newActive);
    updateReactionCount(subjectId, content, newActive ? 1 : -1);
    item.style.opacity = '0.6';
    item.style.pointerEvents = 'none';

    try {
      const action = newActive ? 'add' : 'remove';
      const res = await fetch(`${OAUTH_BASE}/reaction`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, content, action })
      });

      if (res.ok) {
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
        return;
      }

      if (res.status === 409) {
        const reverseAction = newActive ? 'remove' : 'add';
        const reverseRes = await fetch(`${OAUTH_BASE}/reaction`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, content, action: reverseAction })
        });
        if (reverseRes.ok) {
          userReactions[key] = !newActive;
          toggleReactionHighlight(item, !newActive);
          updateReactionCount(subjectId, content, newActive ? -1 : 1);
        } else {
          userReactions[key] = isActive;
          toggleReactionHighlight(item, isActive);
          updateReactionCount(subjectId, content, isActive ? 1 : -1);
        }
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
        return;
      }

      const errData = await res.json();
      console.error('Reaction error:', errData);
      userReactions[key] = isActive;
      toggleReactionHighlight(item, isActive);
      updateReactionCount(subjectId, content, isActive ? 1 : -1);
      item.style.opacity = '1';
      item.style.pointerEvents = 'auto';
    } catch (error) {
      console.error('Reaction exception:', error);
      userReactions[key] = isActive;
      toggleReactionHighlight(item, isActive);
      updateReactionCount(subjectId, content, isActive ? 1 : -1);
      item.style.opacity = '1';
      item.style.pointerEvents = 'auto';
    }
  }

  function bindReactionEvents() {
    document.querySelectorAll('.reaction-item.reaction-btn').forEach(el => {
      el.removeEventListener('click', handleReactionClick);
      el.addEventListener('click', handleReactionClick);
    });
  }

  // ---------- 分页 ----------
  function renderPagination(container, currentPage, totalPages, onPageChange) {
    container.innerHTML = '';
    if (totalPages <= 1) return;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'text-align:center; padding:10px 0;';
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.style.cssText = `
        margin: 0 4px;
        padding: 4px 10px;
        border: 1px solid #ccc;
        background: ${i === currentPage ? '#B1782E' : '#fff'};
        color: ${i === currentPage ? '#fff' : '#333'};
        cursor: pointer;
        border-radius: 4px;
        font-size: 12pt;
      `;
      btn.addEventListener('click', (function(page) {
        return function() { onPageChange(page); };
      })(i));
      wrapper.appendChild(btn);
    }
    container.appendChild(wrapper);
  }

  // ---------- 提交评论（顶层） ----------
  async function submitComment() {
    if (!vditorInstance) {
      alert('编辑器未初始化');
      return;
    }
    const body = vditorInstance.getValue();
    if (!body || body.trim() === '') {
      alert('请输入评论内容');
      return;
    }
    if (!discussionData) {
      alert('讨论数据未加载');
      return;
    }
    const discussionId = discussionData.id;
    try {
      const res = await fetch(`${OAUTH_BASE}/comment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discussionId, body })
      });
      const data = await res.json();
      if (res.ok) {
        vditorInstance.setValue('');
        const d = discussionData.number;
        await loadDiscussionFull(d);
      } else {
        alert(data.error || '评论发表失败');
      }
    } catch (error) {
      console.error('提交评论异常:', error);
      alert('网络错误，请稍后重试');
    }
  }

  // ---------- Vditor 初始化 ----------
  function initVditor() {
    const editorContainer = document.getElementById('vditor-container');
    if (!editorContainer) return;
    if (!isLoggedIn) {
      editorContainer.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">登录后即可评论</p>';
      return;
    }
    if (typeof Vditor === 'undefined') {
      editorContainer.innerHTML = '<p style="color:red;">编辑器加载失败，请刷新页面重试。</p>';
      return;
    }
    if (vditorInstance) {
      vditorInstance.destroy();
      vditorInstance = null;
    }
    editorContainer.innerHTML = '';
    vditorInstance = new Vditor(editorContainer, {
      height: 200,
      mode: 'ir',
      placeholder: '写下你的评论...',
      cache: { enable: true, id: 'vditor-cache' },
      upload: {
        url: `${UPLOAD_URL}/`,
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml',
        max: 32 * 1024 * 1024,
        multiple: false,
        withCredentials: true,
        success: function(res) {},
        error: function(msg) { console.error('上传失败:', msg); }
      },
      toolbar: [
        'emoji', 'headings', 'bold', 'italic', 'strike', 'link', 'quote',
        'list', 'ordered-list', 'check', 'outdent', 'indent',
        'line', 'code', 'inline-code', 'table', 'upload', 'record',
        'preview', 'fullscreen', 'outline', 'edit-mode', 'both',
        'undo', 'redo', 'more'
      ],
      outline: { enable: true, position: 'left' }
    });
    let submitBtn = document.getElementById('comment-submit');
    if (!submitBtn) {
      submitBtn = document.createElement('button');
      submitBtn.id = 'comment-submit';
      submitBtn.textContent = '发表评论';
      submitBtn.style.cssText = `
        margin-top: 10px;
        padding: 8px 20px;
        background: #2da44e;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
      `;
      submitBtn.addEventListener('click', submitComment);
      editorContainer.parentNode.insertBefore(submitBtn, editorContainer.nextSibling);
    }
  }

  // ---------- 加载讨论 ----------
  async function loadDiscussionFull(discussionNumber) {
    try {
      const res = await fetch(`${API_URL}/?d=${discussionNumber}&cfirst=100`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      discussionData = data.discussion;
      if (!discussionData) throw new Error('未找到该讨论');

      commentContainer.innerHTML = '';

      const titleText = discussionData.title || '无标题';
      document.title = titleText + ' - 群档案';
      titleEl.innerHTML = `<span style="font-size:26pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${titleText}</span>`;

      const { info, bodyText, isJson } = parseFirstLine(discussionData.body);
      infoEl.innerHTML = `<span style="font-size:14pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${sanitizeHtml(renderMarkdown(info))}</span>`;

      textEl.innerHTML = `<div style="padding:0 10px; text-align:left;">${sanitizeHtml(renderMarkdown(bodyText))}</div>`;

      const discussionId = discussionData.id;
      const reactionHtml = renderReactions(
        discussionData.reactionGroups || [],
        discussionId,
        isLoggedIn
      );
      const reactionDiv = document.createElement('div');
      reactionDiv.id = 'discussion-reactions';
      reactionDiv.innerHTML = reactionHtml;
      commentContainer.appendChild(reactionDiv);

      const editorContainer = document.createElement('div');
      editorContainer.id = 'vditor-container';
      editorContainer.style.cssText = 'margin:10px 0; text-align:left;';
      commentContainer.appendChild(editorContainer);
      if (isLoggedIn) {
        if (typeof Vditor !== 'undefined') {
          initVditor();
        } else {
          loadVditorScript().then(initVditor).catch(err => console.error('Vditor 加载失败:', err));
        }
      } else {
        editorContainer.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">登录后即可评论</p>';
      }

      const commentListDiv = document.createElement('div');
      commentListDiv.id = 'comment-list';
      commentListDiv.style.cssText = 'text-align:left; margin-top:20px;';
      commentContainer.appendChild(commentListDiv);

      const paginationTop = document.createElement('div');
      paginationTop.id = 'comment-pagination-top';
      const paginationBottom = document.createElement('div');
      paginationBottom.id = 'comment-pagination-bottom';
      commentContainer.appendChild(paginationTop);
      commentContainer.appendChild(paginationBottom);

      allComments = discussionData.comments.nodes || [];
      totalComments = discussionData.comments.totalCount || 0;
      totalPages = Math.ceil(totalComments / COMMENTS_PER_PAGE) || 1;
      let currentPage = 1;

      function renderCommentsPage(page) {
        const start = (page - 1) * COMMENTS_PER_PAGE;
        const end = Math.min(start + COMMENTS_PER_PAGE, allComments.length);
        const pageComments = allComments.slice(start, end);
        const html = renderComments(pageComments);
        commentListDiv.innerHTML = html;
        renderPagination(paginationTop, page, totalPages, (newPage) => {
          renderCommentsPage(newPage);
        });
        renderPagination(paginationBottom, page, totalPages, (newPage) => {
          renderCommentsPage(newPage);
        });
        bindReplyEvents();
        bindReactionEvents();
      }

      renderCommentsPage(1);
      bindReplyEvents();
      bindReactionEvents();

    } catch (error) {
      console.error('加载讨论失败:', error);
      textEl.innerHTML = '<p style="color:red;">加载失败，请稍后重试。</p>';
    }
  }

  function loadVditorScript() {
    return new Promise((resolve, reject) => {
      if (typeof Vditor !== 'undefined') { resolve(); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Vditor 加载失败'));
      document.head.appendChild(script);
    });
  }

  async function checkLoginStatus() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      if (res.ok) {
        isLoggedIn = true;
        currentUser = await res.json();
        console.log('已登录:', currentUser.login);
      } else {
        isLoggedIn = false;
      }
    } catch (e) {
      isLoggedIn = false;
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    if (!d) {
      window.location.href = '/404.html';
      return;
    }
    const number = parseInt(d, 10);
    if (isNaN(number) || number <= 0) {
      window.location.href = '/404.html';
      return;
    }
    await checkLoginStatus();
    await loadDiscussionFull(number);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();