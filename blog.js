// ============================================================
// blog.js - 文章详情页（含 Discussion Upvote + 评论 Reaction）
// ============================================================

(function() {
  'use strict';

  const API_URL = 'https://api.blacknet.cc.cd';
  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const COMMENTS_PER_PAGE = 20;
  const DEFAULT_AVATAR = 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';

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
  let isSubmitting = false;

  // ---------- 样式 ----------
  function injectStyles() {
    if (document.getElementById('blog-styles')) return;
    const style = document.createElement('style');
    style.id = 'blog-styles';
    style.textContent = `
      .image-viewer-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); display: flex; align-items: center;
        justify-content: center; z-index: 9999; cursor: pointer;
      }
      .image-viewer-overlay img { max-width: 90%; max-height: 90%; object-fit: contain; }
      .image-viewer-close {
        position: fixed; top: 20px; right: 30px; font-size: 40px; color: #fff;
        opacity: 0.7; cursor: pointer; z-index: 10000; background: none; border: none; padding: 10px;
      }
      .image-viewer-close:hover { opacity: 1; }
      .temp-comment, .temp-reply {
        opacity: 0.7; background: #f0f9f0; border-left: 3px solid #2da44e; padding-left: 8px;
      }

      .pagination-btn {
        margin: 0 2px; padding: 4px 10px; border: 1px solid #ccc; background: #fff;
        color: #333; cursor: pointer; border-radius: 4px; font-size: 12pt;
        transition: background 0.2s;
      }
      .pagination-btn:hover { background: #e9ecef; }
      .pagination-btn.active { background: #B1782E; color: #fff; border-color: #B1782E; }
      .pagination-btn.disabled { opacity: 0.5; cursor: not-allowed; }
      .pagination-ellipsis {
        margin: 0 4px; font-size: 12pt; cursor: pointer; color: #0366d6; user-select: none;
      }
      .pagination-ellipsis:hover { text-decoration: underline; }

      .markdown-body pre {
        background: #F0F1F2 !important; border-radius: 8px !important;
        padding: 16px !important; overflow: auto !important; position: relative !important;
      }
      .markdown-body pre code {
        background: transparent !important; color: #000 !important; padding: 0 !important;
        font-family: SFMono-Regular, Consolas, monospace !important; font-size: 13px !important;
        line-height: 1.45 !important; white-space: pre !important; border-radius: 0 !important;
      }
      .markdown-body code:not(pre code) {
        background: #F0F1F2 !important; padding: 0.2em 0.4em !important; border-radius: 3px !important;
        color: #000 !important; font-size: 85% !important;
        font-family: SFMono-Regular, Consolas, monospace !important;
      }
      .markdown-body img {
        max-width: 100% !important; max-height: 500px !important;
        width: auto !important; height: auto !important;
        display: block !important; margin: 10px 0 !important;
      }
      blockquote {
        border-left: 4px solid #dfe2e5 !important; color: #6a737d !important;
        padding-left: 16px !important; margin-left: 0 !important;
        margin-top: 0 !important; margin-bottom: 0 !important;
      }
      .task-list-item {
        list-style-type: none !important; display: flex !important;
        align-items: flex-start !important;
      }
      .task-list-item input[type="checkbox"] {
        margin-right: 6px; margin-top: 4px; width: 16px; height: 16px;
        flex-shrink: 0; accent-color: #2da44e;
      }
      .comment-item .markdown-body { font-size: 14px; line-height: 1.6; }

      .reactions-container {
        display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; align-items: center;
      }
      .reaction-item {
        display: flex; align-items: center; gap: 4px; padding: 4px 8px;
        border: 1px solid #ddd; border-radius: 16px; background: #f6f8fa;
        cursor: default;
      }
      .reaction-item.reaction-btn { cursor: pointer; }
      .upvote-item {
        margin-right: 16px !important;
        border-radius: 8px; padding: 4px 12px;
      }
      .upvote-item .upvote-icon { font-size: 18px; line-height: 1; }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  // ---------- 图片查看器 ----------
  function initImageViewer() {
    document.addEventListener('dblclick', function(e) {
      const img = e.target.closest('.markdown-body img, .comment-item img');
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
    overlay.innerHTML = `<img src="${src}" alt="查看大图" /><button class="image-viewer-close" title="关闭">✕</button>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.image-viewer-close').addEventListener('click', function(e) {
      e.stopPropagation();
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  // ---------- 辅助函数 ----------
  function base64Decode(str) {
    try { return decodeURIComponent(escape(atob(str))); } catch(e) { return atob(str); }
  }
  function getAvatarUrl(user) {
    return (user && user.avatarUrl) ? user.avatarUrl : DEFAULT_AVATAR;
  }
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  const EMOJI_MAP = {
    'THUMBS_UP': '👍', 'THUMBS_DOWN': '👎', 'LAUGH': '😄',
    'HOORAY': '🎉', 'CONFUSED': '😕', 'HEART': '❤️',
    'ROCKET': '🚀', 'EYES': '👀'
  };
  function parseFirstLine(body) {
    const lines = body.split('\n');
    const firstLine = lines.find(line => line.trim() !== '') || '';
    let info = null, bodyText = '', isJson = false;
    try {
      const data = JSON.parse(firstLine);
      isJson = true;
      info = data.info ? base64Decode(data.info) : firstLine;
      bodyText = lines.slice(1).join('\n').trim();
    } catch(e) {
      isJson = false;
      info = firstLine.replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[.*?\]\(.*?\)/g, '$1')
                     .replace(/[#*`>_\-]/g, '').trim() || '无简介';
      bodyText = lines.slice(1).join('\n').trim();
    }
    return { info, bodyText, isJson };
  }

  // ---------- Markdown 渲染 ----------
  let markedConfigured = false;
  function renderMarkdown(text, imgMaxHeight = 500) {
    if (!text) return '';
    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }
    if (!markedConfigured) {
      try {
        marked.use({
          gfm: true, breaks: true, pedantic: false, mangle: false, headerIds: false,
          highlight: function(code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
              try { return hljs.highlight(code, { language: lang }).value; } catch(e) {}
            }
            return code;
          }
        });
        markedConfigured = true;
      } catch(e) { console.warn('marked 配置失败:', e); }
    }
    let html;
    try { html = marked.parse(text); } catch(e) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }
    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html, {
        ADD_TAGS: ['input', 'task-list', 'task-list-item', 'blockquote', 'pre', 'code'],
        ADD_ATTR: ['type', 'checked', 'disabled', 'class', 'id', 'style', 'aria-label', 'data-*'],
        FORCE_ATTR: { 'input': { 'disabled': '' } },
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|geo):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    }
    html = html.replace(/<pre>/gi, function(match) {
      if (/style\s*=/i.test(match)) {
        return match.replace(/style\s*=\s*(["'])([^"']*)\1/i, function(m, quote, style) {
          return `style="${quote}${style}; background:#F0F1F2; border-radius:8px; padding:16px; overflow:auto; position:relative;${quote}"`;
        });
      } else {
        return '<pre style="background:#F0F1F2; border-radius:8px; padding:16px; overflow:auto; position:relative;">';
      }
    });
    html = html.replace(/<pre/g, '<pre class="markdown-body"');
    const linkPlaceholders = [];
    html = html.replace(/<a\b[^>]*>.*?<\/a>/gi, function(match) {
      const index = linkPlaceholders.length;
      linkPlaceholders.push(match);
      return `@@PLACEHOLDER${index}@@`;
    });
    html = html.replace(/(^|\s)@([a-zA-Z0-9\-_]+)/g, function(match, prefix, username) {
      return `${prefix}<a href="https://github.com/${username}" target="_blank" class="mention" style="color:#0366d6;text-decoration:none;">@${username}</a>`;
    });
    html = html.replace(/(^|\s)#(\d+)/g, function(match, prefix, num) {
      return `${prefix}<a href="/blog.html?d=${num}" class="issue-link" style="color:#0366d6;text-decoration:none;">#${num}</a>`;
    });
    html = html.replace(/@@PLACEHOLDER(\d+)@@/g, function(match, index) {
      return linkPlaceholders[parseInt(index)];
    });
    html = html.replace(/<img([^>]*)>/gi, function(match, attrs) {
      if (/style\s*=/i.test(attrs)) {
        attrs = attrs.replace(/style\s*=\s*(["'])([^"']*)\1/i, function(m, quote, style) {
          return `style="${quote}${style}; display:block; margin:10px 0; max-width:100%; max-height:${imgMaxHeight}px; width:auto; height:auto;${quote}"`;
        });
      } else {
        attrs += ` style="display:block; margin:10px 0; max-width:100%; max-height:${imgMaxHeight}px; width:auto; height:auto;"`;
      }
      return `<img${attrs}>`;
    });
    return html;
  }

  // ---------- 代码块复制按钮 ----------
  function addCopyButtonsToCodeBlocks() {
    document.querySelectorAll('.markdown-body pre, .comment-item pre, #text pre').forEach(pre => {
      if (pre.querySelector('.copy-code-btn')) return;
      const code = pre.querySelector('code');
      if (!code) return;
      let codeText = code.textContent;
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.textContent = '复制';
      btn.style.cssText = `
        position: absolute; top: 8px; right: 8px; padding: 4px 10px;
        background: #2da44e; color: white; border: none; border-radius: 4px;
        font-size: 12px; cursor: pointer; opacity: 0.7; transition: opacity 0.2s;
        z-index: 10;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
      btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.7'; });
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(codeText);
          btn.textContent = '已复制!';
          setTimeout(() => { btn.textContent = '复制'; }, 2000);
        } catch (err) {
          const textarea = document.createElement('textarea');
          textarea.value = codeText;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          btn.textContent = '已复制!';
          setTimeout(() => { btn.textContent = '复制'; }, 2000);
        }
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }

  // ============================================================
  // Reaction 渲染（评论使用 👍，Discussion 不含 THUMBS_UP）
  // ============================================================
  function renderReactions(reactionGroups, subjectId, canInteract = false, isDiscussion = false) {
    let reactionHtml = '<div class="reactions-container">';

    if (reactionGroups && reactionGroups.length > 0) {
      reactionGroups.forEach(group => {
        const count = group.users.totalCount;
        const emoji = EMOJI_MAP[group.content] || group.content;
        const countId = `reaction-count-${subjectId}-${group.content}`;
        const viewerReacted = group.viewerHasReacted === true;
        if (canInteract) userReactions[`${subjectId}-${group.content}`] = viewerReacted;
        const isActive = viewerReacted && canInteract;
        const borderColor = isActive ? '#0366d6' : '#ddd';
        const bgColor = isActive ? '#dbedff' : '#f6f8fa';
        const interactiveClass = canInteract ? 'reaction-btn' : '';

        // Discussion 跳过 THUMBS_UP（Upvote 按钮独立）
        if (isDiscussion && group.content === 'THUMBS_UP') return;

        reactionHtml += `
          <div class="reaction-item ${interactiveClass}"
               data-subject-id="${subjectId}" data-reaction="${group.content}"
               style="border:1px solid ${borderColor}; border-radius:16px; background:${bgColor}; ${canInteract ? 'cursor:pointer;' : ''}">
            <span style="font-size:18px;">${emoji}</span>
            <span id="${countId}" style="font-weight:bold;">${count}</span>
          </div>
        `;
      });
    }
    reactionHtml += '</div>';
    return reactionHtml;
  }

  // ---------- 评论树渲染 ----------
  function renderCommentTree(comments, level = 0) {
    if (!comments || comments.length === 0) return '';
    const sorted = [...comments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let html = '';
    const indent = level * 20;
    sorted.forEach(comment => {
      const author = comment.author ? comment.author.login : '未知';
      const avatar = comment.author ? getAvatarUrl(comment.author) : DEFAULT_AVATAR;
      const createdAt = formatDate(comment.createdAt);
      const isTemp = comment.isTemp || false;
      const tempClass = isTemp ? (level === 0 ? 'temp-comment' : 'temp-reply') : '';
      const bodyHtml = `<div class="markdown-body">${renderMarkdown(comment.body, 250)}</div>`;
      const reactionHtml = renderReactions(comment.reactionGroups || [], comment.id, isLoggedIn && !isTemp, false);
      const replies = comment.replies && comment.replies.nodes ? comment.replies.nodes : [];
      const sortedReplies = replies.length ? [...replies].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
      const hasReplies = sortedReplies.length > 0;

      html += `
        <div class="comment-item ${tempClass}" style="border-bottom:1px solid #e1e4e8;padding:12px 0; text-align:left; margin-left:${indent}px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <a href="https://github.com/${author}" target="_blank" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit;">
              <img src="${avatar}" style="width:32px; height:32px; border-radius:50%;" alt="avatar" onerror="this.src='${DEFAULT_AVATAR}'" />
              <span style="font-weight:bold;">${author}</span>
            </a>
            <span style="color:#888;font-size:12px;">${createdAt}</span>
            ${isLoggedIn && !isTemp ? `<button class="reply-btn" data-comment-id="${comment.id}" style="border:none;background:none;cursor:pointer;color:#0366d6;font-size:12px;">回复</button>` : ''}
            ${isTemp ? '<span style="color:#2da44e;font-size:12px;margin-left:8px;">⏳ 发送中...</span>' : ''}
          </div>
          <div style="margin-left:40px; font-size:14px; line-height:1.6;">${bodyHtml}</div>
          ${reactionHtml}
          <div class="reply-container" data-parent-id="${comment.id}" style="margin-top:8px;"></div>
          ${hasReplies ? `<div class="replies-container" style="margin-left:20px;">${renderCommentTree(sortedReplies, level + 1)}</div>` : ''}
        </div>
      `;
    });
    return html;
  }
  function renderComments(comments) {
    if (!comments || comments.length === 0) return '<p style="text-align:center;color:#888;">暂无评论</p>';
    const sortedTop = [...comments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return `<div style="border:1px solid #ddd; border-radius:8px; padding:10px; background:#ffffff; text-align:left;">${renderCommentTree(sortedTop)}</div>`;
  }

  // ---------- 分页 ----------
  function renderPagination(container, currentPage, totalPages, onPageChange) {
    container.innerHTML = '';
    if (totalPages <= 0) return;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap; padding:10px 0;';
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹';
    prevBtn.className = 'pagination-btn' + (currentPage <= 1 ? ' disabled' : '');
    if (currentPage > 1) prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
    wrapper.appendChild(prevBtn);
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
      if (item === '…') {
        const span = document.createElement('span');
        span.textContent = '…';
        span.className = 'pagination-ellipsis';
        span.title = '点击跳转至指定页';
        span.addEventListener('click', function() {
          const input = prompt('请输入要跳转的页码（1-' + totalPages + '）:', currentPage);
          if (input === null) return;
          const page = parseInt(input, 10);
          if (isNaN(page) || page < 1 || page > totalPages) {
            alert('请输入有效页码（1-' + totalPages + '）');
            return;
          }
          onPageChange(page);
        });
        wrapper.appendChild(span);
      } else {
        const btn = document.createElement('button');
        btn.textContent = item;
        btn.className = 'pagination-btn' + (item === currentPage ? ' active' : '');
        btn.addEventListener('click', () => onPageChange(item));
        wrapper.appendChild(btn);
      }
    });
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '›';
    nextBtn.className = 'pagination-btn' + (currentPage >= totalPages ? ' disabled' : '');
    if (currentPage < totalPages) nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
    wrapper.appendChild(nextBtn);
    container.appendChild(wrapper);
  }

  // ---------- 查找嵌套评论 ----------
  function findCommentById(comments, id) {
    for (let c of comments) {
      if (c.id === id) return c;
      if (c.replies && c.replies.nodes) {
        const found = findCommentById(c.replies.nodes, id);
        if (found) return found;
      }
    }
    return null;
  }

  let currentCommentPage = 1;
  function renderCommentsPage(page) {
    const start = (page - 1) * COMMENTS_PER_PAGE;
    const end = Math.min(start + COMMENTS_PER_PAGE, allComments.length);
    const pageComments = allComments.slice(start, end);
    const listDiv = document.getElementById('comment-list');
    if (listDiv) {
      listDiv.innerHTML = renderComments(pageComments);
      addCopyButtonsToCodeBlocks();
      bindReplyEvents();
      bindReactionEvents();
    }
    const paginationTop = document.getElementById('comment-pagination-top');
    const paginationBottom = document.getElementById('comment-pagination-bottom');
    if (paginationTop) renderPagination(paginationTop, page, totalPages, (newPage) => renderCommentsPage(newPage));
    if (paginationBottom) renderPagination(paginationBottom, page, totalPages, (newPage) => renderCommentsPage(newPage));
    currentCommentPage = page;
  }

  // ---------- 回复事件 ----------
  function bindReplyEvents() {
    document.querySelectorAll('.reply-btn').forEach(btn => {
      btn.removeEventListener('click', handleReplyClick);
      btn.addEventListener('click', handleReplyClick);
    });
  }
  function handleReplyClick(e) {
    const btn = e.currentTarget;
    const parentId = btn.dataset.commentId;
    const container = document.querySelector(`.reply-container[data-parent-id="${parentId}"]`);
    if (!container) return;
    const existing = container.querySelector('.reply-editor');
    if (existing) { container.innerHTML = ''; return; }
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
      if (!body) { console.error('回复内容为空'); return; }
      if (isSubmitting) return;
      const parentId = this.dataset.parentId;
      const tempReply = {
        id: 'temp-reply-' + Date.now(),
        body: body,
        createdAt: new Date().toISOString(),
        author: {
          login: currentUser ? currentUser.login : '你',
          avatarUrl: currentUser ? currentUser.avatarUrl : DEFAULT_AVATAR
        },
        reactionGroups: [],
        isTemp: true
      };
      let parentComment = findCommentById(allComments, parentId);
      if (!parentComment) { console.error('找不到父评论'); return; }
      if (!parentComment.replies) parentComment.replies = { nodes: [] };
      parentComment.replies.nodes.unshift(tempReply);
      renderCommentsPage(currentCommentPage);
      container.innerHTML = '';
      isSubmitting = true;
      try {
        const payload = { discussionId: discussionData.id, body: body, parentCommentId: parentId };
        console.log('[回复] 提交 payload:', payload);
        const res = await fetch(`${OAUTH_BASE}/comment`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('[回复] 响应:', data);
        if (res.ok) {
          await loadDiscussionFull(discussionData.number);
        } else {
          parentComment.replies.nodes = parentComment.replies.nodes.filter(r => r.id !== tempReply.id);
          renderCommentsPage(currentCommentPage);
          console.error('回复失败:', data.error, data.details);
        }
      } catch (error) {
        parentComment.replies.nodes = parentComment.replies.nodes.filter(r => r.id !== tempReply.id);
        renderCommentsPage(currentCommentPage);
        console.error('回复网络错误:', error);
      } finally {
        isSubmitting = false;
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
    if (!isLoggedIn) { console.error('未登录，无法使用表情'); return; }
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
        method: 'POST', credentials: 'include',
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
        await fetch(`${OAUTH_BASE}/reaction`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, content, action: reverseAction })
        });
        userReactions[key] = !newActive;
        toggleReactionHighlight(item, !newActive);
        updateReactionCount(subjectId, content, newActive ? -1 : 1);
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
        return;
      }
      const errData = await res.json();
      console.error('Reaction 错误:', errData);
      userReactions[key] = isActive;
      toggleReactionHighlight(item, isActive);
      updateReactionCount(subjectId, content, isActive ? 1 : -1);
      item.style.opacity = '1';
      item.style.pointerEvents = 'auto';
    } catch (error) {
      console.error('Reaction 异常:', error);
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

  // ============================================================
  // Discussion Upvote
  // ============================================================
  let discussionUpvoteState = false;
  let discussionUpvoteCount = 0;

  async function toggleDiscussionUpvote() {
    if (!isLoggedIn) { console.error('请先登录'); return; }
    if (!discussionData) return;
    const discussionId = discussionData.id;
    const action = discussionUpvoteState ? 'remove' : 'add';
    const newCount = discussionUpvoteState ? discussionUpvoteCount - 1 : discussionUpvoteCount + 1;

    discussionUpvoteState = !discussionUpvoteState;
    discussionUpvoteCount = newCount;
    updateDiscussionUpvoteUI();

    try {
      const res = await fetch(`${OAUTH_BASE}/upvote`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discussionId, action })
      });
      const data = await res.json();
      if (!res.ok) {
        discussionUpvoteState = !discussionUpvoteState;
        discussionUpvoteCount = newCount;
        updateDiscussionUpvoteUI();
        console.error('Upvote 失败:', data.error);
      }
    } catch (error) {
      discussionUpvoteState = !discussionUpvoteState;
      discussionUpvoteCount = newCount;
      updateDiscussionUpvoteUI();
      console.error('Upvote 网络错误:', error);
    }
  }

  function updateDiscussionUpvoteUI() {
    const countSpan = document.getElementById('discussion-upvote-count');
    const btn = document.getElementById('discussion-upvote-btn');
    if (countSpan) countSpan.textContent = discussionUpvoteCount;
    if (btn) {
      if (discussionUpvoteState) {
        btn.style.borderColor = '#0366d6';
        btn.style.background = '#dbedff';
      } else {
        btn.style.borderColor = '#ddd';
        btn.style.background = '#f6f8fa';
      }
    }
  }

  // ---------- 提交评论 ----------
  async function submitComment() {
    if (isSubmitting) return;
    if (!vditorInstance) { console.error('编辑器未初始化'); return; }
    const body = vditorInstance.getValue().trim();
    if (!body) { console.error('评论内容为空'); return; }
    if (!discussionData) { console.error('讨论数据未加载'); return; }
    const tempComment = {
      id: 'temp-' + Date.now(),
      body: body,
      createdAt: new Date().toISOString(),
      author: { login: currentUser ? currentUser.login : '你', avatarUrl: currentUser ? currentUser.avatarUrl : DEFAULT_AVATAR },
      reactionGroups: [], replies: { nodes: [] }, isTemp: true
    };
    allComments.unshift(tempComment);
    renderCommentsPage(currentCommentPage);
    vditorInstance.setValue('');
    isSubmitting = true;
    const toolbarBtn = document.querySelector('.vditor-toolbar__item[data-name="submit"]');
    if (toolbarBtn) toolbarBtn.style.pointerEvents = 'none';
    try {
      const payload = { discussionId: discussionData.id, body: body };
      console.log('[评论] 提交 payload:', payload);
      const res = await fetch(`${OAUTH_BASE}/comment`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log('[评论] 响应:', data);
      if (res.ok) {
        await loadDiscussionFull(discussionData.number);
      } else {
        allComments = allComments.filter(c => c.id !== tempComment.id);
        renderCommentsPage(currentCommentPage);
        console.error('评论失败:', data.error, data.details);
      }
    } catch (error) {
      allComments = allComments.filter(c => c.id !== tempComment.id);
      renderCommentsPage(currentCommentPage);
      console.error('评论网络错误:', error);
    } finally {
      isSubmitting = false;
      if (toolbarBtn) toolbarBtn.style.pointerEvents = 'auto';
    }
  }

  // ---------- 初始化 Vditor ----------
  function initVditor() {
    const editorContainer = document.getElementById('vditor-container');
    if (!editorContainer) return;
    if (!isLoggedIn) {
      editorContainer.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">登录后即可评论</p>';
      return;
    }
    if (typeof Vditor === 'undefined') {
      editorContainer.innerHTML = '<p style="color:red;">Vditor 未加载</p>';
      return;
    }
    if (vditorInstance) {
      vditorInstance.destroy();
      vditorInstance = null;
    }
    editorContainer.innerHTML = '';
    vditorInstance = new Vditor(editorContainer, {
      height: 200,
      minHeight: 150,
      mode: 'wysiwyg',
      placeholder: '写下你的评论...',
      value: '',
      cache: { enable: false },
      lang: 'zh_CN',
      cdn: 'https://cdn.jsdelivr.net/npm/vditor@3.10.6',
      icon: 'ant',
      theme: 'classic',
      upload: {
        url: `${UPLOAD_URL}/`,
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml',
        max: 32 * 1024 * 1024,
        multiple: false,
        withCredentials: true,
      },
      toolbar: [
        'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
        'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
        'quote', 'line', 'code', 'inline-code', 'insert-before', 'insert-after', '|',
        'upload', 'record', 'table', '|',
        'undo', 'redo', '|',
        'fullscreen', 'edit-mode', 'both', 'more',
        '|',
        {
          name: 'submit',
          icon: '<svg viewBox="0 0 32 32" style="fill: #2da44e; width: 18px; height: 18px;"><path d="M6 4l20 12-20 12z"></path></svg>',
          tip: '提交评论',
          click: submitComment
        }
      ],
      toolbarConfig: { pin: true },
      outline: { enable: true, position: 'left' }
    });
    setTimeout(function() {
      const outline = document.querySelector('.vditor-outline');
      if (outline) { outline.style.left = '0'; outline.style.right = 'auto'; }
    }, 200);
  }

  // ---------- 加载讨论 ----------
  async function loadDiscussionFull(discussionNumber) {
    userReactions = {};
    try {
      const res = await fetch(`${API_URL}/?d=${discussionNumber}&cfirst=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      discussionData = data.discussion;
      if (!discussionData) throw new Error('Discussion not found');

      commentContainer.innerHTML = '';

      const titleText = discussionData.title || '无标题';
      document.title = titleText + ' - 群档案';
      titleEl.innerHTML = `<span style="font-size:26pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${titleText}</span>`;

      const { info, bodyText } = parseFirstLine(discussionData.body);
      if (info && info.trim()) {
        infoEl.innerHTML = `<span style="font-size:14pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${renderMarkdown(info)}</span>`;
      } else {
        infoEl.innerHTML = '';
      }

      textEl.innerHTML = `<div class="markdown-body" style="padding:0 10px; text-align:left;">${renderMarkdown(bodyText)}</div>`;
      addCopyButtonsToCodeBlocks();

      // ---- Discussion Upvote + Reaction ----
      const discussionId = discussionData.id;

      discussionUpvoteCount = discussionData.upvoteCount || 0;
      discussionUpvoteState = discussionData.viewerHasUpvoted || false;

      // 生成 Reaction（不含 THUMBS_UP）
      const reactionHtml = renderReactions(
        discussionData.reactionGroups || [],
        discussionId,
        isLoggedIn,
        true
      );
      const reactionDiv = document.createElement('div');
      reactionDiv.id = 'discussion-reactions';
      reactionDiv.innerHTML = reactionHtml;

      // 插入 Upvote 按钮
      const container = reactionDiv.querySelector('.reactions-container');
      if (container) {
        const upvoteBtn = document.createElement('div');
        upvoteBtn.id = 'discussion-upvote-btn';
        upvoteBtn.className = 'reaction-item reaction-btn upvote-item';
        upvoteBtn.innerHTML = `<span class="upvote-icon">↑</span><span class="upvote-count" id="discussion-upvote-count">${discussionUpvoteCount}</span>`;
        upvoteBtn.style.marginRight = '16px';
        upvoteBtn.addEventListener('click', toggleDiscussionUpvote);
        container.prepend(upvoteBtn);
        updateDiscussionUpvoteUI();
      }
      commentContainer.appendChild(reactionDiv);

      // ---- 编辑器 ----
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

      const paginationTop = document.createElement('div');
      paginationTop.id = 'comment-pagination-top';
      commentContainer.appendChild(paginationTop);

      const commentListDiv = document.createElement('div');
      commentListDiv.id = 'comment-list';
      commentListDiv.style.cssText = 'text-align:left; margin-top:20px;';
      commentContainer.appendChild(commentListDiv);

      const paginationBottom = document.createElement('div');
      paginationBottom.id = 'comment-pagination-bottom';
      commentContainer.appendChild(paginationBottom);

      allComments = discussionData.comments.nodes || [];
      allComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      totalComments = discussionData.comments.totalCount || 0;
      totalPages = Math.ceil(totalComments / COMMENTS_PER_PAGE) || 1;
      currentCommentPage = 1;

      renderCommentsPage(1);
      bindReplyEvents();
      bindReactionEvents();

      setTimeout(() => updateDiscussionUpvoteUI(), 100);

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
    } catch(e) {
      isLoggedIn = false;
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    if (!d) { window.location.href = '/404.html'; return; }
    const number = parseInt(d, 10);
    if (isNaN(number) || number <= 0) { window.location.href = '/404.html'; return; }
    await checkLoginStatus();
    await loadDiscussionFull(number);
    initImageViewer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
