// ============================================================
// blog.js - 适配您最新 HTML 的版本
// ============================================================

(function() {
  'use strict';

  const API_URL = 'https://api.blacknet.cc.cd';
  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const COMMENTS_PER_PAGE = 20;
  const DEFAULT_AVATAR = 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';

  // DOM 元素
  const titleEl = document.getElementById('title');
  const infoEl = document.getElementById('information');
  const textEl = document.getElementById('text');
  const commentContainer = document.getElementById('comment');

  let discussionData = null;
  let isLoggedIn = false;
  let currentUser = null;
  let vditorInstance = null;
  let allComments = [];
  let totalComments = 0;
  let currentCommentPage = 1;
  let totalPages = 1;
  let isSubmitting = false;
  let userReactions = {};

  // --- 辅助函数（与之前相同，此处略，可复用之前代码）---
  // 实际使用时请将之前 blog.js 中所有辅助函数、渲染函数、事件处理等完整复制过来
  // 以下只展示关键修改部分，即 Vditor 初始化配置

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
      toolbarConfig: {
        pin: true,
        more: ['table', 'record', 'upload', 'outline', 'fullscreen', 'edit-mode', 'both']
      },
      outline: {
        enable: true,
        position: 'left',
      }
    });
  }

  // --- 其他函数（与之前相同）---
  // 请将之前 blog.js 中除 initVditor 外的所有代码完整复制到这里
  // 由于篇幅，此处不重复全部，但您可以从之前的回答中提取完整代码

  // 注意：submitComment、loadDiscussionFull、renderCommentsPage 等均保持不变
  // 唯一改动是 initVditor 的配置，确保 icon: 'ant' 和 toolbarConfig.more

  // 初始化流程保持不变
  async function init() {
    // ... 同之前
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
