// ============================================================
// blog.js - 文章详情页（完整修复版）
// 修复：图片独占一行、表情切换、标题更新、评论样式
// ============================================================

(function() {
  'use strict';

  // ---------- 配置 ----------
  const API_URL = 'https://api.blacknet.cc.cd';
  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
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
  let allComments = [];
  let totalComments = 0;

  // 存储当前用户对各个 subjectId 的反应状态
  let userReactions = {};

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

  // ---------- 检查用户是否已反应 ----------
  function hasUserReacted(reactionGroups) {
    // 如果 reactionGroups 中包含 viewerHasReacted 字段，直接使用
    // 否则通过查找当前用户的 login 来判断（备选方案）
    if (reactionGroups && reactionGroups.length > 0) {
      // 如果 API 返回了 viewerHasReacted，直接使用
      if (reactionGroups[0].viewerHasReacted !== undefined) {
        return reactionGroups.some(g => g.viewerHasReacted === true);
      }
    }
    return false;
  }

  // ---------- 渲染 Reaction（可交互） ----------
  function renderReactions(reactionGroups, subjectId, canInteract = false) {
    let html = '<div class="reactions-container" style="display:flex; flex-wrap:wrap; gap:8px; margin:10px 0;">';
    reactionGroups.forEach(group => {
      const count = group.users.totalCount;
      const emoji = EMOJI_MAP[group.content] || group.content;
      const countId = `reaction-count-${subjectId}-${group.content}`;
      const interactiveClass = canInteract ? 'reaction-btn' : '';
      
      // 检查用户是否已对此反应
      const viewerReacted = group.viewerHasReacted === true;
      const isActive = viewerReacted;
      
      // 存储用户反应状态
      if (canInteract && viewerReacted) {
        userReactions[`${subjectId}-${group.content}`] = true;
      }
      
      // 高亮样式
      const borderColor = isActive ? '#0366d6' : '#ddd';
      const bgColor = isActive ? '#dbedff' : '#f6f8fa';
      
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

  // ---------- 渲染评论列表 ----------
  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      return '<p style="text-align:center;color:#888;">暂无评论</p>';
    }
    let html = '<div style="border:1px solid #ddd; border-radius:8px; padding:10px; background:#f9f9f9; text-align:left;">';
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
        <div class="comment-item" style="border-bottom:1px solid #e1e4e8;padding:12px 0; text-align:left;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <a href="https://github.com/${author}" target="_blank" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit;">
              <img src="${avatar}" style="width:32px; height:32px; border-radius:50%;" alt="avatar" />
              <span style="font-weight:bold;">${author}</span>
            </a>
            <span style="color:#888;font-size:12px;">${createdAt}</span>
          </div>
          <div style="margin-left:40px; font-size:14px; line-height:1.6;">${bodyHtml}</div>
          ${reactionHtml}
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  // ---------- Reaction 交互（toggle） ----------
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

    // 获取当前状态
    const key = `${subjectId}-${content}`;
    const isActive = userReactions[key] === true;
    
    // 乐观更新：切换状态
    const newActive = !isActive;
    userReactions[key] = newActive;
    
    // 更新UI
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
        // 成功
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
        return;
      }

      // 如果操作失败，回滚
      if (res.status === 409) {
        // 冲突：尝试反向操作
        const reverseAction = newActive ? 'remove' : 'add';
        const reverseRes = await fetch(`${OAUTH_BASE}/reaction`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, content, action: reverseAction })
        });
        if (reverseRes.ok) {
          // 反向操作成功，恢复UI
          userReactions[key] = !newActive;
          toggleReactionHighlight(item, !newActive);
          updateReactionCount(subjectId, content, newActive ? -1 : 1);
        } else {
          // 完全失败，回滚到原始状态
          userReactions[key] = isActive;
          toggleReactionHighlight(item, isActive);
          updateReactionCount(subjectId, content, isActive ? 1 : -1);
        }
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
        return;
      }

      // 其他错误，回滚
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

    try {
      const res = await fetch(`${OAUTH_BASE}/comment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discussionId, body }),
      });

      const data = await res.json();
      if (res.ok) {
        alert('评论发表成功！');
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

  // ---------- 初始化 Vditor ----------
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
      cache: {
        enable: true,
        id: 'vditor-cache'
      },
      upload: {
        url: `${UPLOAD_URL}/`,
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml',
        max: 32 * 1024 * 1024,
        multiple: false,
        withCredentials: true,
        success: (res) => {},
        error: (msg) => {
          console.error('上传失败:', msg);
        }
      },
      toolbar: [
        'emoji', 'headings', 'bold', 'italic', 'strike', 'link', 'quote',
        'list', 'ordered-list', 'check', 'outdent', 'indent',
        'line', 'code', 'inline-code', 'table', 'upload', 'record',
        'preview', 'fullscreen', 'outline', 'edit-mode', 'both',
        'undo', 'redo', 'more'
      ],
      outline: {
        enable: true,
        position: 'left'
      }
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

  // ---------- 加载讨论数据 ----------
  async function loadDiscussionFull(discussionNumber) {
    try {
      // 注意：需要 API 支持返回 viewerHasReacted
      // 如果 API 暂不支持，可通过其他方式判断
      const res = await fetch(`${API_URL}/?d=${discussionNumber}&cfirst=100`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      discussionData = data.discussion;
      if (!discussionData) {
        throw new Error('未找到该讨论');
      }

      // 清空评论容器
      commentContainer.innerHTML = '';

      // ---------- 标题（更新页面标题和元素） ----------
      const titleText = discussionData.title || '无标题';
      document.title = titleText + ' - 群档案';
      titleEl.innerHTML = `<span style="font-size:26pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${titleText}</span>`;

      // ---------- 解析第一行 ----------
      const { info, bodyText, isJson } = parseFirstLine(discussionData.body);

      // 简介
      infoEl.innerHTML = `<span style="font-size:14pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF; font-weight:bold;">${sanitizeHtml(renderMarkdown(info))}</span>`;

      // ---------- 正文（强制图片独占一行） ----------
      let bodyHtml = sanitizeHtml(renderMarkdown(bodyText));
      // 使用更通用的正则匹配所有 img 标签（不区分大小写）
      bodyHtml = bodyHtml.replace(/<img\s+/gi, '<img style="display:block; margin:10px 0; max-width:calc(100% - 20px); height:auto; padding:0 10px;" ');
      textEl.innerHTML = `<div style="padding:0 10px; text-align:left;">${bodyHtml}</div>`;

      // ---------- 顶部 Reaction ----------
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

      // ---------- Vditor 容器 ----------
      const editorContainer = document.createElement('div');
      editorContainer.id = 'vditor-container';
      editorContainer.style.cssText = 'margin:10px 0; text-align:left;';
      commentContainer.appendChild(editorContainer);

      if (isLoggedIn) {
        if (typeof Vditor !== 'undefined') {
          initVditor();
        } else {
          loadVditorScript().then(() => {
            initVditor();
          }).catch(err => console.error('Vditor 加载失败:', err));
        }
      } else {
        editorContainer.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">登录后即可评论</p>';
      }

      // ---------- 评论列表 ----------
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
        bindReactionEvents();
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
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.css';
      document.head.appendChild(link);
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
