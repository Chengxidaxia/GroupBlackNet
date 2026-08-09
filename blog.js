// ============================================================
// blog.js - 文章详情页（稳定版，禁用缓存，修复 setValue）
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

  // ---------- 样式注入 ----------
  function injectStyles() {
    if (document.getElementById('blog-styles')) return;
    const style = document.createElement('style');
    style.id = 'blog-styles';
    style.textContent = `
      .task-list-item {
        list-style-type: none !important;
        display: flex !important;
        align-items: flex-start !important;
      }
      .task-list-item input[type="checkbox"] {
        margin-right: 6px;
        margin-top: 4px;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        accent-color: #2da44e;
      }
      .task-list-item p { margin: 0; }
      .comment-item ul, .comment-item ol { padding-left: 24px; }
      blockquote {
        border-left: 4px solid #dfe2e5 !important;
        color: #6a737d !important;
        padding-left: 16px !important;
        margin-left: 0 !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      .markdown-body code:not(pre code) {
        background: #F0F1F2 !important;
        padding: 0.2em 0.4em !important;
        border-radius: 3px !important;
        color: #000 !important;
        font-size: 85% !important;
        font-family: SFMono-Regular, Consolas, monospace !important;
      }
      .markdown-body pre {
        background: #F0F1F2 !important;
        border-radius: 8px !important;
        padding: 16px !important;
        overflow: auto !important;
        position: relative;
      }
      .markdown-body pre code {
        background: transparent !important;
        color: #000 !important;
        padding: 0 !important;
        font-family: SFMono-Regular, Consolas, monospace !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
        white-space: pre !important;
        border-radius: 0 !important;
      }
      .markdown-body img {
        max-width: 100% !important;
        max-height: 500px !important;
        width: auto !important;
        height: auto !important;
        display: block !important;
        margin: 10px 0 !important;
      }
      .comment-item { text-align: left; }
      .comment-item .markdown-body { font-size: 14px; line-height: 1.6; }
      .image-viewer-overlay {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        cursor: pointer;
      }
      .image-viewer-overlay img {
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        box-shadow: 0 0 30px rgba(0,0,0,0.5);
      }
      .image-viewer-close {
        position: fixed;
        top: 20px;
        right: 30px;
        font-size: 40px;
        color: #fff;
        opacity: 0.7;
        cursor: pointer;
        z-index: 10000;
        font-family: Arial, sans-serif;
        transition: opacity 0.2s, background 0.2s;
        background: rgba(0,0,0,0.4);
        border: none;
        border-radius: 8px;
        padding: 12px 20px;
        line-height: 1;
        user-select: none;
      }
      .image-viewer-close:hover {
        opacity: 1;
        background: rgba(0,0,0,0.7);
      }
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
    overlay.innerHTML = `
      <img src="${src}" alt="查看大图" />
      <button class="image-viewer-close" title="关闭">✕</button>
    `;
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
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return atob(str);
    }
  }

  // ---------- Markdown 渲染 ----------
  let markedConfigured = false;

  function renderMarkdown(text, imgMaxHeight = 500) {
    if (!text) return '';

    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
      console.warn('marked 未加载，使用纯文本 fallback');
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    if (!markedConfigured) {
      try {
        marked.use({
          gfm: true,
          breaks: true,
          pedantic: false,
          mangle: false,
          headerIds: false,
          highlight: function(code, lang) {
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
              try {
                return hljs.highlight(code, { language: lang }).value;
              } catch (e) {}
            }
            return code;
          }
        });
        markedConfigured = true;
      } catch (e) {
        console.warn('marked 配置失败:', e);
      }
    }

    let html;
    try {
      html = marked.parse(text);
    } catch (e) {
      console.error('marked.parse 异常:', e);
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

    // 给 <pre> 添加内联样式
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

    // 后处理 @ 和 #
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

    // 图片限制高度
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
        position: absolute;
        top: 8px;
        right: 8px;
        padding: 4px 10px;
        background: #2da44e;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
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

  // ---------- 其他函数 ----------
  function sanitizeHtml(html) {
    if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(html, {
        ADD_TAGS: ['pre', 'code', 'input', 'task-list', 'task-list-item', 'blockquote'],
        ADD_ATTR: ['style', 'class', 'type', 'checked', 'disabled', 'id', 'aria-label', 'data-*'],
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
    let bodyText = '';
    let isJson = false;

    try {
      const data = JSON.parse(firstLine);
      isJson = true;
      if (data.info) {
        info = base64Decode(data.info);
      } else {
        info = firstLine;
      }
      const restLines = lines.slice(1);
      bodyText = restLines.join('\n').trim();
    } catch (e) {
      isJson = false;
      info = firstLine
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[.*?\]\(.*?\)/g, '$1')
        .replace(/[#*`>_\-]/g, '')
        .trim() || '无简介';
      const restLines = lines.slice(1);
      bodyText = restLines.join('\n').trim();
    }

    if (!bodyText) bodyText = '';
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
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  // ---------- 评论树渲染 ----------
  function renderCommentTree(comments, level = 0) {
    if (!comments || comments.length === 0) return '';
    const sorted = [...comments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let html = '';
    const indent = level * 20;
    sorted.forEach(comment => {
      const author = comment.author.login;
      const avatar = comment.author.avatarUrl;
      const createdAt = formatDate(comment.createdAt);
      const bodyHtml = `<div class="markdown-body">${renderMarkdown(comment.body, 250)}</div>`;
      const reactionHtml = renderReactions(
        comment.reactionGroups || [],
        comment.id,
        isLoggedIn
      );
      const replies = comment.replies && comment.replies.nodes ? comment.replies.nodes : [];
      const sortedReplies = replies.length ? [...replies].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
      const hasReplies = sortedReplies.length > 0;

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
          ${hasReplies ? `<div class="replies-container" style="margin-left:20px;">${renderCommentTree(sortedReplies, level + 1)}</div>` : ''}
        </div>
      `;
    });
    return html;
  }

  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      return '<p style="text-align:center;color:#888;">暂无评论</p>';
    }
    const sortedTop = [...comments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return `<div style="border:1px solid #ddd; border-radius:8px; padding:10px; background:#ffffff; text-align:left;">${renderCommentTree(sortedTop)}</div>`;
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
    if (existing) {
      container.innerHTML = '';
      return;
    }

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

  // ---------- 提交评论 ----------
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
    const payload = { discussionId, body };
    try {
      const res = await fetch(`${OAUTH_BASE}/comment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        vditorInstance.setValue('');
        const d = discussionData.number;
        await loadDiscussionFull(d);
      } else {
        console.error('评论提交失败:', data);
        alert(data.error || '评论发表失败');
      }
    } catch (error) {
      console.error('提交评论异常:', error);
      alert('网络错误，请稍后重试');
    }
  }

  // ---------- Vditor 初始化（修复 setValue 问题） ----------
  // 只修改 initVditor 函数
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

  try {
    vditorInstance = new Vditor(editorContainer, {
      height: 200,
      mode: 'ir',
      placeholder: '写下你的评论...',
      cache: { enable: false },
      cdn: 'https://unpkg.com/vditor@3.10.6',
      upload: {
        url: `${UPLOAD_URL}/`,
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml',
        max: 32 * 1024 * 1024,
        multiple: false,
        withCredentials: true,
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

    // 延迟清空内容（确保实例已创建）
    setTimeout(function() {
      try {
        if (vditorInstance && typeof vditorInstance.setValue === 'function') {
          vditorInstance.setValue('');
        }
      } catch (e) {
        console.warn('清空编辑器内容失败:', e);
      }
    }, 300);

    // 强制大纲左侧
    setTimeout(function() {
      const outline = document.querySelector('.vditor-outline');
      if (outline) {
        outline.style.left = '0';
        outline.style.right = 'auto';
      }
    }, 400);
  } catch (e) {
    console.error('Vditor 初始化失败:', e);
    editorContainer.innerHTML = '<p style="color:red;text-align:center;padding:20px;">编辑器加载失败，请刷新页面重试。</p>';
  }

  // 提交按钮逻辑（如果有）
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

      if (info && info.trim()) {
        infoEl.innerHTML = `<span style="font-size:14pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${renderMarkdown(info)}</span>`;
      } else {
        infoEl.innerHTML = '';
      }

      const renderedBody = `<div class="markdown-body" style="padding:0 10px; text-align:left;">${renderMarkdown(bodyText)}</div>`;
      textEl.innerHTML = renderedBody;
      addCopyButtonsToCodeBlocks();

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
        addCopyButtonsToCodeBlocks();
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
    initImageViewer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
