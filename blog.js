// ============================================================
// blog.js - 文章详情页 + Vditor 编辑器（图片上传至 ImgBB）
// 依赖：marked.js、DOMPurify（可选）、Vditor（CDN）
// ============================================================

(function() {
  'use strict';

  // ---------- 配置 ----------
  const API_URL = 'https://api.blacknet.cc.cd';
  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd'; // Worker 上传代理
  const COMMENTS_PER_PAGE = 20;

  // ---------- DOM 引用 ----------
  const titleEl = document.getElementById('title');
  const infoEl = document.getElementById('information');
  const textEl = document.getElementById('text');
  const commentContainer = document.getElementById('comment');

  // ---------- 状态 ----------
  let discussionData = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoggedIn = false;
  let currentUser = null;
  let vditorInstance = null;

  // ---------- 辅助函数 ----------
  function base64Decode(str) {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return atob(str);
    }
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      return marked.parse(text);
    }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function sanitizeHtml(html) {
    if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(html);
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

  // ---------- 解析第一行 ----------
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
    let html = '<div class="reactions-container" style="display:flex; flex-wrap:wrap; gap:8px; margin:10px 0;">';
    reactionGroups.forEach(group => {
      const count = group.users.totalCount;
      const emoji = EMOJI_MAP[group.content] || group.content;
      const countId = `reaction-count-${subjectId}-${group.content}`;
      html += `
        <div class="reaction-item" style="display:flex; align-items:center; gap:4px; padding:4px 8px; border:1px solid #ddd; border-radius:16px; background:#f6f8fa;">
          <span style="font-size:18px;">${emoji}</span>
          <span id="${countId}" style="font-weight:bold;">${count}</span>
          ${canInteract ? `<button class="reaction-btn" data-subject-id="${subjectId}" data-reaction="${group.content}" style="border:none;background:none;cursor:pointer;padding:0 4px;font-size:14px;">➕</button>` : ''}
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  // ---------- 渲染评论列表 ----------
  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      return '<p style="text-align:center;color:#888;">暂无评论</p>';
    }
    let html = '';
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

      html += `
        <div class="comment-item" style="border-bottom:1px solid #e1e4e8;padding:12px 0;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <img src="${avatar}" style="width:32px; height:32px; border-radius:50%;" alt="avatar" />
            <span style="font-weight:bold;">${author}</span>
            <span style="color:#888;font-size:12px;">${createdAt}</span>
          </div>
          <div style="margin-left:40px; font-size:14px; line-height:1.6;">${bodyHtml}</div>
          ${reactionHtml}
        </div>
      `;
    });
    return html;
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

  async function handleReactionClick(e) {
    const btn = e.currentTarget;
    const subjectId = btn.dataset.subjectId;
    const content = btn.dataset.reaction;
    if (!subjectId || !content) return;

    updateReactionCount(subjectId, content, 1);
    btn.disabled = true;

    try {
      const addRes = await fetch(`${OAUTH_BASE}/reaction`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, content, action: 'add' })
      });

      if (addRes.ok) {
        btn.disabled = false;
        return;
      }

      if (addRes.status === 409) {
        const removeRes = await fetch(`${OAUTH_BASE}/reaction`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, content, action: 'remove' })
        });
        if (removeRes.ok) {
          updateReactionCount(subjectId, content, -2);
        } else {
          updateReactionCount(subjectId, content, -1);
        }
        btn.disabled = false;
        return;
      }

      const errData = await addRes.json();
      console.error('Reaction error:', errData);
      updateReactionCount(subjectId, content, -1);
      btn.disabled = false;
    } catch (error) {
      console.error('Reaction exception:', error);
      updateReactionCount(subjectId, content, -1);
      btn.disabled = false;
    }
  }

  function bindReactionEvents() {
    document.removeEventListener('click', reactionDelegate);
    document.addEventListener('click', reactionDelegate);
  }

  function reactionDelegate(e) {
    const btn = e.target.closest('.reaction-btn');
    if (!btn) return;
    if (!isLoggedIn) {
      alert('请先登录以使用表情功能');
      return;
    }
    handleReactionClick({ currentTarget: btn });
  }

  // ---------- 分页控件 ----------
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

  // ---------- 初始化 Vditor ----------
  function initVditor() {
    if (!isLoggedIn) {
      // 未登录不显示编辑器，显示提示
      const editorContainer = document.getElementById('vditor-container');
      if (editorContainer) {
        editorContainer.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">登录后即可评论</p>';
      }
      return;
    }

    // 确保容器存在
    let editorContainer = document.getElementById('vditor-container');
    if (!editorContainer) {
      // 如果不存在则创建
      editorContainer = document.createElement('div');
      editorContainer.id = 'vditor-container';
      editorContainer.style.cssText = 'margin:20px 0;';
      // 插入到 comment 容器中合适位置（评论列表之前或之后？我们放在评论列表之前）
      // 但评论列表已经渲染，我们可以插入在 WIP 占位后面。
      const wipDiv = document.getElementById('wip-comment');
      if (wipDiv) {
        wipDiv.parentNode.insertBefore(editorContainer, wipDiv.nextSibling);
      } else {
        commentContainer.appendChild(editorContainer);
      }
    }

    // 如果已存在实例，先销毁
    if (vditorInstance) {
      vditorInstance.destroy();
      vditorInstance = null;
    }

    // 检查 Vditor 是否已加载
    if (typeof Vditor === 'undefined') {
      console.warn('Vditor 未加载，请确保已引入 Vditor CDN');
      editorContainer.innerHTML = '<p style="color:red;">编辑器加载失败，请刷新页面重试。</p>';
      return;
    }

    // 创建 Vditor 实例
    vditorInstance = new Vditor(editorContainer, {
      height: 200,
      mode: 'ir', // 即时渲染模式
      placeholder: '写下你的评论...',
      upload: {
        url: `${UPLOAD_URL}/`, // 指向我们的 Worker
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml',
        max: 32 * 1024 * 1024, // 32MB
        multiple: false,
        // 需要携带 Cookie 以便 Worker 验证登录
        withCredentials: true,
        // Vditor 默认会通过 fetch 发送，我们无需额外配置
        // 成功/失败回调可选
        success: (res) => {
          // 上传成功，Vditor 自动处理
        },
        error: (msg) => {
          console.error('上传失败:', msg);
        }
      },
      // 工具栏自定义
      toolbar: ['emoji', 'headings', 'bold', 'italic', 'strike', 'link', 'quote', 'upload', 'preview'],
    });
  }

  // ---------- 加载文章数据 ----------
  async function loadDiscussionFull(discussionNumber) {
    try {
      const res = await fetch(`${API_URL}/?d=${discussionNumber}&cfirst=100`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      discussionData = data.discussion;
      if (!discussionData) {
        throw new Error('未找到该讨论');
      }

      // 清空评论容器（保留后续添加的元素）
      commentContainer.innerHTML = '';

      // 标题
      titleEl.textContent = discussionData.title;

      const { info, bodyText, isJson } = parseFirstLine(discussionData.body);

      infoEl.innerHTML = sanitizeHtml(renderMarkdown(info));
      textEl.innerHTML = sanitizeHtml(renderMarkdown(bodyText));

      // 顶部 Reaction
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

      // WIP 评论功能占位（但我们将用 Vditor 替代，但仍保留提示）
      const wipDiv = document.createElement('div');
      wipDiv.id = 'wip-comment';
      wipDiv.style.cssText = 'border:1px dashed #ccc;padding:10px;margin:10px 0;text-align:center;color:#888;';
      wipDiv.textContent = '💬 发表评论 (WIP)';
      commentContainer.appendChild(wipDiv);

      // ---- 插入 Vditor 容器 ----
      const editorContainer = document.createElement('div');
      editorContainer.id = 'vditor-container';
      editorContainer.style.cssText = 'margin:10px 0;';
      commentContainer.appendChild(editorContainer);
      // 立即初始化 Vditor（如果已登录）
      if (isLoggedIn) {
        // 但 Vditor 的 CDN 可能还未加载，我们延迟初始化
        // 使用 MutationObserver 或定时检查？简单起见，直接调用 initVditor，内部会检查。
        // 但需确保 Vditor 库已加载，我们可以等待。
        // 如果 Vditor 未定义，等待。
        if (typeof Vditor === 'undefined') {
          // 尝试动态加载
          loadVditorScript().then(() => {
            initVditor();
          }).catch(err => console.error('Vditor 加载失败:', err));
        } else {
          initVditor();
        }
      } else {
        editorContainer.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">登录后即可评论</p>';
      }

      // ----- 评论列表 -----
      const commentListDiv = document.createElement('div');
      commentListDiv.id = 'comment-list';
      commentContainer.appendChild(commentListDiv);

      const paginationTop = document.createElement('div');
      paginationTop.id = 'comment-pagination-top';
      const paginationBottom = document.createElement('div');
      paginationBottom.id = 'comment-pagination-bottom';
      commentContainer.appendChild(paginationTop);
      commentContainer.appendChild(paginationBottom);

      const comments = discussionData.comments.nodes || [];
      const totalComments = discussionData.comments.totalCount || 0;
      totalPages = Math.ceil(totalComments / COMMENTS_PER_PAGE) || 1;
      let currentPage = 1;

      function renderCommentsPage(page) {
        const start = (page - 1) * COMMENTS_PER_PAGE;
        const end = Math.min(start + COMMENTS_PER_PAGE, comments.length);
        const pageComments = comments.slice(start, end);
        const html = renderComments(pageComments);
        commentListDiv.innerHTML = html;
        renderPagination(paginationTop, page, totalPages, (newPage) => {
          renderCommentsPage(newPage);
        });
        renderPagination(paginationBottom, page, totalPages, (newPage) => {
          renderCommentsPage(newPage);
        });
      }

      renderCommentsPage(1);

      bindReactionEvents();

    } catch (error) {
      console.error('加载讨论失败:', error);
      textEl.innerHTML = '<p style="color:red;">加载失败，请稍后重试。</p>';
    }
  }

  // ---------- 动态加载 Vditor ----------
  function loadVditorScript() {
    return new Promise((resolve, reject) => {
      if (typeof Vditor !== 'undefined') {
        resolve();
        return;
      }
      // 加载 CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.css';
      document.head.appendChild(link);
      // 加载 JS
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Vditor 加载失败'));
      document.head.appendChild(script);
    });
  }

  // ---------- 检查登录状态 ----------
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

  // ---------- 初始化 ----------
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