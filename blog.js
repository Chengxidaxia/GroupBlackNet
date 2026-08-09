// ============================================================
// blog.js - 文章详情页（带官方工具栏替换）
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
      /* 编辑器容器 */
      #vditor-container .vditor {
        border-radius: 8px;
        border: 1px solid #ddd;
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

  // ---------- 工具栏替换（核心修复） ----------
  function replaceToolbar() {
    const toolbar = document.querySelector('#vditor-container .vditor-toolbar');
    if (!toolbar) return;

    // 官方工具栏 HTML（已移除 padding-left 内联样式）
    const officialToolbarHTML = `
      <div class="vditor-toolbar__item"><button data-type="emoji" class="vditor-tooltipped vditor-tooltipped__ne" aria-label="表情 &lt;Ctrl+E&gt;"><svg><use xlink:href="#vditor-icon-emoji"></use></svg></button><div class="vditor-panel vditor-panel--arrow" style="display: none;"><div class="vditor-emojis" style="max-height: 828px"><button data-value="👍 " data-key="+1"><span class="vditor-emojis__icon">👍</span></button><button data-value="👎 " data-key="-1"><span class="vditor-emojis__icon">👎</span></button><button data-value="😕 " data-key="confused"><span class="vditor-emojis__icon">😕</span></button><button data-value="👀 " data-key="eyes"><span class="vditor-emojis__icon">👀</span></button><button data-value="❤️ " data-key="heart"><span class="vditor-emojis__icon">❤️</span></button><button data-value="🎉 " data-key="tada"><span class="vditor-emojis__icon">🎉</span></button><button data-value="😄 " data-key="smile"><span class="vditor-emojis__icon">😄</span></button><button data-value="🚀 " data-key="rocket"><span class="vditor-emojis__icon">🚀</span></button></div><div class="vditor-emojis__tail">
        <span class="vditor-emojis__tip"></span><span><a href="https://ld246.com/settings/function" target="_blank">设置常用表情</a></span>
    </div></div></div><div class="vditor-toolbar__item"><button data-type="headings" class="vditor-tooltipped vditor-tooltipped__ne" aria-label="标题 &lt;Ctrl+H&gt;"><svg><use xlink:href="#vditor-icon-headings"></use></svg></button><div class="vditor-hint vditor-panel--arrow" style="display: none;"><button data-tag="h1" data-value="# ">一级标题 &lt;Alt+Ctrl+1&gt;</button>
    <button data-tag="h2" data-value="## ">二级标题 &lt;Alt+Ctrl+2&gt;</button>
    <button data-tag="h3" data-value="### ">三级标题 &lt;Alt+Ctrl+3&gt;</button>
    <button data-tag="h4" data-value="#### ">四级标题 &lt;Alt+Ctrl+4&gt;</button>
    <button data-tag="h5" data-value="##### ">五级标题 &lt;Alt+Ctrl+5&gt;</button>
    <button data-tag="h6" data-value="###### ">六级标题 &lt;Alt+Ctrl+6&gt;</button></div></div><div class="vditor-toolbar__item"><button data-type="bold" class="vditor-tooltipped vditor-tooltipped__ne" aria-label="粗体 &lt;Ctrl+B&gt;"><svg><use xlink:href="#vditor-icon-bold"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="italic" class="vditor-tooltipped vditor-tooltipped__ne" aria-label="斜体 &lt;Ctrl+I&gt;"><svg><use xlink:href="#vditor-icon-italic"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="strike" class="vditor-tooltipped vditor-tooltipped__ne" aria-label="删除线 &lt;Ctrl+D&gt;"><svg><use xlink:href="#vditor-icon-strike"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="link" class="vditor-tooltipped vditor-tooltipped__n" aria-label="链接 &lt;Ctrl+K&gt;"><svg><use xlink:href="#vditor-icon-link"></use></svg></button></div><div class="vditor-toolbar__divider"></div><div class="vditor-toolbar__item"><button data-type="list" class="vditor-tooltipped vditor-tooltipped__n" aria-label="无序列表 &lt;Ctrl+L&gt;"><svg><use xlink:href="#vditor-icon-list"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="ordered-list" class="vditor-tooltipped vditor-tooltipped__n" aria-label="有序列表 &lt;Ctrl+O&gt;"><svg><use xlink:href="#vditor-icon-ordered-list"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="check" class="vditor-tooltipped vditor-tooltipped__n" aria-label="任务列表 &lt;Ctrl+J&gt;"><svg><use xlink:href="#vditor-icon-check"></use></svg></button></div><div class="vditor-toolbar__item" style="display: block;"><button data-type="outdent" class="vditor-tooltipped vditor-tooltipped__n vditor-menu--disabled" aria-label="列表反向缩进 &lt;Ctrl+Shift+I&gt;"><svg><use xlink:href="#vditor-icon-outdent"></use></svg></button></div><div class="vditor-toolbar__item" style="display: block;"><button data-type="indent" class="vditor-tooltipped vditor-tooltipped__n vditor-menu--disabled" aria-label="列表缩进 &lt;Ctrl+Shift+O&gt;"><svg><use xlink:href="#vditor-icon-indent"></use></svg></button></div><div class="vditor-toolbar__divider"></div><div class="vditor-toolbar__item"><button data-type="quote" class="vditor-tooltipped vditor-tooltipped__n" aria-label="引用 &lt;Ctrl+;&gt;"><svg><use xlink:href="#vditor-icon-quote"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="line" class="vditor-tooltipped vditor-tooltipped__n" aria-label="分隔线 &lt;Ctrl+Shift+H&gt;"><svg><use xlink:href="#vditor-icon-line"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="code" class="vditor-tooltipped vditor-tooltipped__n" aria-label="代码块 &lt;Ctrl+U&gt;"><svg><use xlink:href="#vditor-icon-code"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="inline-code" class="vditor-tooltipped vditor-tooltipped__n" aria-label="行内代码 &lt;Ctrl+G&gt;"><svg><use xlink:href="#vditor-icon-inline-code"></use></svg></button></div><div class="vditor-toolbar__item" style="display: block;"><button data-type="insert-before" class="vditor-tooltipped vditor-tooltipped__n" aria-label="起始插入行 &lt;Ctrl+Shift+B&gt;"><svg><use xlink:href="#vditor-icon-before"></use></svg></button></div><div class="vditor-toolbar__item" style="display: block;"><button data-type="insert-after" class="vditor-tooltipped vditor-tooltipped__n" aria-label="末尾插入行 &lt;Ctrl+Shift+E&gt;"><svg><use xlink:href="#vditor-icon-after"></use></svg></button></div><div class="vditor-toolbar__divider"></div><div class="vditor-toolbar__item"><div data-type="upload" class="vditor-tooltipped vditor-tooltipped__n" aria-label="上传图片或文件"><svg><use xlink:href="#vditor-icon-upload"></use></svg><input type="file" multiple="multiple" accept=".zip,.rar,.7z,.tar,.gzip,.bz2,.jar,.jpg,.jpeg,.png,.gif,.webp,.webm,.bmp,.mp3,.mp4,.wav,.mov,.weba,.mkv"></div></div><div class="vditor-toolbar__item"><button data-type="record" class="vditor-tooltipped vditor-tooltipped__n" aria-label="开始录音/结束录音"><svg><use xlink:href="#vditor-icon-record"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="table" class="vditor-tooltipped vditor-tooltipped__n" aria-label="表格 &lt;Ctrl+M&gt;"><svg><use xlink:href="#vditor-icon-table"></use></svg></button></div><div class="vditor-toolbar__divider"></div><div class="vditor-toolbar__item"><button data-type="undo" class="vditor-tooltipped vditor-tooltipped__nw" aria-label="撤销 &lt;Ctrl+Z&gt;"><svg><use xlink:href="#vditor-icon-undo"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="redo" class="vditor-tooltipped vditor-tooltipped__nw vditor-menu--disabled" aria-label="重做 &lt;Ctrl+Y&gt;"><svg><use xlink:href="#vditor-icon-redo"></use></svg></button></div><div class="vditor-toolbar__divider"></div><div class="vditor-toolbar__item"><button data-type="fullscreen" class="vditor-tooltipped vditor-tooltipped__nw" aria-label="全屏切换 &lt;Ctrl+'&gt;"><svg><use xlink:href="#vditor-icon-fullscreen"></use></svg></button></div><div class="vditor-toolbar__item"><button data-type="edit-mode" class="vditor-tooltipped vditor-tooltipped__nw" aria-label="切换编辑模式"><svg><use xlink:href="#vditor-icon-edit"></use></svg></button><div class="vditor-hint vditor-panel--arrow vditor-panel--left" style="display: none;"><button data-mode="wysiwyg" class="vditor-menu--current">所见即所得 &lt;Alt+Ctrl+7&gt;</button>
    <button data-mode="ir">即时渲染 &lt;Alt+Ctrl+8&gt;</button>
    <button data-mode="sv">分屏预览 &lt;Alt+Ctrl+9&gt;</button></div></div><div class="vditor-toolbar__item"><button data-type="more" class="vditor-tooltipped vditor-tooltipped__e" aria-label="更多"><svg><use xlink:href="#vditor-icon-more"></use></svg></button><div class="vditor-hint vditor-panel--arrow vditor-panel--left" style="display: none;"><div style="display: none;"><button data-type="both" class="vditor-menu--current">编辑 &amp; 预览 &lt;Ctrl+P&gt;</button></div><div><button data-type="code-theme" class="">代码块主题预览</button><div class="vditor-hint vditor-panel--left" style="display: none;"><div style="overflow: auto;max-height:514px"><button>a11y-dark</button><button>agate</button><button>an-old-hope</button><button>androidstudio</button><button>arta</button><button>atom-one-dark</button><button>atom-one-dark-reasonable</button><button>base16/3024</button><button>base16/apathy</button><button>base16/apprentice</button><button>base16/ashes</button><button>base16/atelier-cave</button><button>base16/atelier-dune</button><button>base16/atelier-estuary</button><button>base16/atelier-forest</button><button>base16/atelier-heath</button><button>base16/atelier-lakeside</button><button>base16/atelier-plateau</button><button>base16/atelier-savanna</button><button>base16/atelier-seaside</button><button>base16/atelier-sulphurpool</button><button>base16/atlas</button><button>base16/bespin</button><button>base16/black-metal</button><button>base16/black-metal-bathory</button><button>base16/black-metal-burzum</button><button>base16/black-metal-dark-funeral</button><button>base16/black-metal-gorgoroth</button><button>base16/black-metal-immortal</button><button>base16/black-metal-khold</button><button>base16/black-metal-marduk</button><button>base16/black-metal-mayhem</button><button>base16/black-metal-nile</button><button>base16/black-metal-venom</button><button>base16/brewer</button><button>base16/bright</button><button>base16/brogrammer</button><button>base16/brush-trees-dark</button><button>base16/chalk</button><button>base16/circus</button><button>base16/classic-dark</button><button>base16/codeschool</button><button>base16/colors</button><button>base16/danqing</button><button>base16/darcula</button><button>base16/dark-violet</button><button>base16/darkmoss</button><button>base16/darktooth</button><button>base16/decaf</button><button>base16/default-dark</button><button>base16/dracula</button><button>base16/edge-dark</button><button>base16/eighties</button><button>base16/embers</button><button>base16/equilibrium-dark</button><button>base16/equilibrium-gray-dark</button><button>base16/espresso</button><button>base16/eva</button><button>base16/eva-dim</button><button>base16/flat</button><button>base16/framer</button><button>base16/gigavolt</button><button>base16/google-dark</button><button>base16/grayscale-dark</button><button>base16/green-screen</button><button>base16/gruvbox-dark-hard</button><button>base16/gruvbox-dark-medium</button><button>base16/gruvbox-dark-pale</button><button>base16/gruvbox-dark-soft</button><button>base16/hardcore</button><button>base16/harmonic16-dark</button><button>base16/heetch-dark</button><button>base16/helios</button><button>base16/hopscotch</button><button>base16/horizon-dark</button><button>base16/humanoid-dark</button><button>base16/ia-dark</button><button>base16/icy-dark</button><button>base16/ir-black</button><button>base16/isotope</button><button>base16/kimber</button><button>base16/london-tube</button><button>base16/macintosh</button><button>base16/marrakesh</button><button>base16/materia</button><button>base16/material</button><button>base16/material-darker</button><button>base16/material-palenight</button><button>base16/material-vivid</button><button>base16/mellow-purple</button><button>base16/mocha</button><button>base16/monokai</button><button>base16/nebula</button><button>base16/nord</button><button>base16/nova</button><button>base16/ocean</button><button>base16/oceanicnext</button><button>base16/onedark</button><button>base16/outrun-dark</button><button>base16/papercolor-dark</button><button>base16/paraiso</button><button>base16/pasque</button><button>base16/phd</button><button>base16/pico</button><button>base16/pop</button><button>base16/porple</button><button>base16/qualia</button><button>base16/railscasts</button><button>base16/rebecca</button><button>base16/ros-pine</button><button>base16/ros-pine-moon</button><button>base16/sandcastle</button><button>base16/seti-ui</button><button>base16/silk-dark</button><button>base16/snazzy</button><button>base16/solar-flare</button><button>base16/solarized-dark</button><button>base16/spacemacs</button><button>base16/summercamp</button><button>base16/summerfruit-dark</button><button>base16/synth-midnight-terminal-dark</button><button>base16/tango</button><button>base16/tender</button><button>base16/tomorrow-night</button><button>base16/twilight</button><button>base16/unikitty-dark</button><button>base16/vulcan</button><button>base16/windows-10</button><button>base16/windows-95</button><button>base16/windows-high-contrast</button><button>base16/windows-nt</button><button>base16/woodland</button><button>base16/xcode-dusk</button><button>base16/zenburn</button><button>codepen-embed</button><button>dark</button><button>devibeans</button><button>far</button><button>felipec</button><button>github-dark</button><button>github-dark-dimmed</button><button>gml</button><button>gradient-dark</button><button>hybrid</button><button>ir-black</button><button>isbl-editor-dark</button><button>kimbie-dark</button><button>lioshi</button><button>monokai</button><button>monokai-sublime</button><button>night-owl</button><button>nnfx-dark</button><button>nord</button><button>obsidian</button><button>panda-syntax-dark</button><button>paraiso-dark</button><button>pojoaque</button><button>qtcreator-dark</button><button>rainbow</button><button>shades-of-purple</button><button>srcery</button><button>stackoverflow-dark</button><button>sunburst</button><button>tomorrow-night-blue</button><button>tomorrow-night-bright</button><button>tokyo-night-dark</button><button>vs2015</button><button>xt256</button><button>ant-design</button><button>a11y-light</button><button>arduino-light</button><button>ascetic</button><button>atom-one-light</button><button>base16/atelier-cave-light</button><button>base16/atelier-dune-light</button><button>base16/atelier-estuary-light</button><button>base16/atelier-forest-light</button><button>base16/atelier-heath-light</button><button>base16/atelier-lakeside-light</button><button>base16/atelier-plateau-light</button><button>base16/atelier-savanna-light</button><button>base16/atelier-seaside-light</button><button>base16/atelier-sulphurpool-light</button><button>base16/brush-trees</button><button>base16/classic-light</button><button>base16/cupcake</button><button>base16/cupertino</button><button>base16/default-light</button><button>base16/dirtysea</button><button>base16/edge-light</button><button>base16/equilibrium-gray-light</button><button>base16/equilibrium-light</button><button>base16/fruit-soda</button><button>base16/github</button><button>base16/google-light</button><button>base16/grayscale-light</button><button>base16/gruvbox-light-hard</button><button>base16/gruvbox-light-medium</button><button>base16/gruvbox-light-soft</button><button>base16/harmonic16-light</button><button>base16/heetch-light</button><button>base16/humanoid-light</button><button>base16/horizon-light</button><button>base16/ia-light</button><button>base16/material-lighter</button><button>base16/mexico-light</button><button>base16/one-light</button><button>base16/papercolor-light</button><button>base16/ros-pine-dawn</button><button>base16/sagelight</button><button>base16/shapeshifter</button><button>base16/silk-light</button><button>base16/solar-flare-light</button><button>base16/solarized-light</button><button>base16/summerfruit-light</button><button>base16/synth-midnight-terminal-light</button><button>base16/tomorrow</button><button>base16/unikitty-light</button><button>base16/windows-10-light</button><button>base16/windows-95-light</button><button>base16/windows-high-contrast-light</button><button>brown-paper</button><button>base16/windows-nt-light</button><button>color-brewer</button><button>docco</button><button>foundation</button><button>github</button><button>googlecode</button><button>gradient-light</button><button>grayscale</button><button>idea</button><button>intellij-light</button><button>isbl-editor-light</button><button>kimbie-light</button><button>lightfair</button><button>magula</button><button>mono-blue</button><button>nnfx-light</button><button>panda-syntax-light</button><button>paraiso-light</button><button>purebasic</button><button>qtcreator-light</button><button>routeros</button><button>school-book</button><button>stackoverflow-light</button><button>tokyo-night-light</button><button>vs</button><button>xcode</button><button>default</button></div></div></div><div><button data-type="content-theme" class="">内容主题预览</button><div class="vditor-hint" style="display: none;"><div style="overflow: auto;max-height:514px"><button data-type="ant-design">Ant Design</button><button data-type="dark">Dark</button><button data-type="light">Light</button><button data-type="wechat">WeChat</button></div></div></div><div><button data-type="export" class="">导出</button><div class="vditor-hint" style="display: none;"><button data-type="markdown">Markdown</button>
    <button data-type="pdf">PDF</button>
    <button data-type="html">HTML</button></div></div><div style="display: block;"><button data-type="outline" class="vditor-menu--current">大纲</button></div><div><button data-type="preview" class="">预览</button></div><div><button data-type="devtools" class="">开发者工具</button></div><div><button data-type="info" class="">关于</button></div><div><button data-type="help" class="">帮助</button></div></div></div>
    `;

    toolbar.innerHTML = officialToolbarHTML;
    // 移除内联 padding-left，让工具栏自适应
    toolbar.style.paddingLeft = '';
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
      minHeight: 150,
      mode: 'wysiwyg',
      placeholder: '写下你的评论...',
      value: '',
      cache: { enable: false },
      lang: 'zh_CN',
      cdn: 'https://unpkg.com/vditor@3.10.6',
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
        'emoji', 'headings', 'bold', 'italic', 'strike', 'link', 'quote',
        'list', 'ordered-list', 'check', 'outdent', 'indent',
        'line', 'code', 'inline-code', 'table', 'upload', 'record',
        'preview', 'fullscreen', 'outline', 'edit-mode', 'both',
        'undo', 'redo', 'more'
      ],
      toolbarConfig: {
        pin: true,
      },
      outline: {
        enable: true,
        position: 'left',
      }
    });

    // 延迟替换工具栏（确保 Vditor 渲染完成）
    setTimeout(replaceToolbar, 500);

    // 强制大纲左侧
    setTimeout(function() {
      const outline = document.querySelector('.vditor-outline');
      if (outline) {
        outline.style.left = '0';
        outline.style.right = 'auto';
      }
    }, 600);

    // 提交按钮
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
