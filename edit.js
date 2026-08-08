// ============================================================
// edit.js - 创建新讨论页面（最终版）
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const DEFAULT_ICON = 'img/pole.jpg';

  const titleInput = document.getElementById('title');
  const infoInput = document.getElementById('info');
  const noiconCheck = document.getElementById('noicon');
  const uploadContainer = document.getElementById('upload');
  const editorContainer = document.getElementById('editing');

  let vditorInstance = null;
  let coverUrl = null;
  let coverFile = null;
  let isLoggedIn = false;

  function updateTitle() {
    const val = titleInput.value.trim();
    document.title = val || '编稿';
  }

  async function checkLogin() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      if (res.ok) {
        isLoggedIn = true;
        return true;
      }
      isLoggedIn = false;
      return false;
    } catch (e) {
      isLoggedIn = false;
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById('edit-styles')) return;
    const style = document.createElement('style');
    style.id = 'edit-styles';
    style.textContent = `
      /* 编辑器容器 */
      #editing {
        width: 80%;
        max-width: 1000px;
        margin: 0 auto;
        min-height: 400px;
        display: block;
      }
      /* Vditor 内容区域 */
      #editing .vditor {
        border-radius: 8px !important;
        border: 1px solid #ddd !important;
      }
      /* 大纲固定左侧 */
      #editing .vditor-outline {
        left: 0 !important;
        right: auto !important;
      }
      /* 提交按钮 */
      .editor-footer {
        text-align: center;
        padding: 16px 0;
      }
      .editor-footer button {
        padding: 12px 40px;
        background: #2da44e;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 18px;
        cursor: pointer;
        font-weight: bold;
      }
      .editor-footer button:hover {
        background: #22863a;
      }
      /* 封面上传 */
      .upload-area {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        cursor: pointer;
        min-height: 120px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #fafafa;
        transition: border-color 0.3s;
      }
      .upload-area.dragover {
        border-color: #2da44e;
        background: #f0f9f0;
      }
      .upload-area img {
        max-width: 100%;
        max-height: 200px;
        margin-top: 8px;
        border-radius: 4px;
      }
      .upload-area .hint {
        color: #888;
        font-size: 14px;
      }
      .upload-area .remove-btn {
        margin-top: 8px;
        background: #dc3545;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 4px 12px;
        cursor: pointer;
      }
      .upload-area.hidden {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  function base64Encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function extractFirstImage(markdown) {
    if (!markdown) return null;
    const match = markdown.match(/!\[.*?\]\((.*?)\)/) ||
                  markdown.match(/<img[^>]+src=["']([^"']+)["']/i) ||
                  markdown.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|svg|webp))/i);
    return match ? match[1] : null;
  }

  // ---------- 封面上传 ----------
  function buildUploadUI() {
    if (!uploadContainer) return;
    uploadContainer.innerHTML = '';
    const area = document.createElement('div');
    area.className = 'upload-area';
    area.id = 'upload-area';
    area.innerHTML = `
      <div class="hint">📷 点击选择或拖拽图片到此作为封面</div>
      <div id="upload-preview"></div>
    `;
    uploadContainer.appendChild(area);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon';
    fileInput.style.display = 'none';
    fileInput.id = 'cover-file-input';
    uploadContainer.appendChild(fileInput);

    area.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) handleCoverFile(file);
      fileInput.value = '';
    });

    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.classList.add('dragover');
    });
    area.addEventListener('dragleave', () => {
      area.classList.remove('dragover');
    });
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (file.type.startsWith('image/') || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') {
        handleCoverFile(file);
      } else {
        alert('仅支持图片格式（JPEG、PNG、GIF、WEBP、SVG、ICO）');
      }
    });

    updateUploadVisibility();
  }

  function updateUploadVisibility() {
    const area = document.getElementById('upload-area');
    if (area) {
      area.classList.toggle('hidden', noiconCheck.checked);
    }
  }

  function updateUploadPreview(file) {
    const previewDiv = document.getElementById('upload-preview');
    if (!previewDiv) return;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewDiv.innerHTML = `
          <img src="${e.target.result}" alt="封面预览" />
          <button class="remove-btn" id="remove-cover">移除</button>
        `;
        document.getElementById('remove-cover').addEventListener('click', (ev) => {
          ev.stopPropagation();
          coverUrl = null;
          coverFile = null;
          updateUploadPreview(null);
          noiconCheck.checked = false;
          updateUploadVisibility();
        });
      };
      reader.readAsDataURL(file);
      coverFile = file;
    } else {
      previewDiv.innerHTML = '';
      coverFile = null;
      coverUrl = null;
    }
  }

  async function handleCoverFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (!allowedTypes.includes(file.type)) {
      alert('仅支持 JPEG、PNG、GIF、WEBP、SVG、ICO 格式');
      return;
    }

    updateUploadPreview(file);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${UPLOAD_URL}/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (data.code === 0) {
        const url = data.data.succMap[file.name];
        coverUrl = url;
        noiconCheck.checked = false;
        updateUploadVisibility();
        console.log('封面上传成功:', coverUrl);
      } else {
        alert('封面上传失败: ' + (data.msg || '未知错误'));
        updateUploadPreview(null);
      }
    } catch (error) {
      console.error('封面上传异常:', error);
      alert('网络错误，请稍后重试');
      updateUploadPreview(null);
    }
  }

  // ---------- Vditor 编辑器 ----------
  function initVditor() {
    if (!editorContainer) {
      console.error('#editing 容器未找到');
      return;
    }
    if (typeof Vditor === 'undefined') {
      editorContainer.innerHTML = '<p style="color:red;text-align:center;padding:40px;">Vditor 未加载，请刷新页面重试。</p>';
      return;
    }
    if (vditorInstance) {
      vditorInstance.destroy();
      vditorInstance = null;
    }
    editorContainer.innerHTML = '';

    vditorInstance = new Vditor(editorContainer, {
      height: 500,
      mode: 'ir',
      placeholder: '在这里写文章内容...',
      cache: { enable: true, id: 'edit-vditor-cache' },
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
      outline: {
        enable: true,
        position: 'left'
      }
    });

    // 确保大纲在左侧
    setTimeout(() => {
      const outline = document.querySelector('.vditor-outline');
      if (outline) {
        outline.style.left = '0';
        outline.style.right = 'auto';
      }
    }, 200);
  }

  // ---------- 提交 ----------
  async function submitDiscussion() {
    if (!vditorInstance) {
      alert('编辑器未初始化');
      return;
    }

    const title = titleInput.value.trim();
    if (!title) {
      alert('请输入标题');
      titleInput.focus();
      return;
    }

    const info = infoInput.value.trim() || '无简介';
    const body = vditorInstance.getValue().trim();
    if (!body) {
      alert('请输入文章内容');
      return;
    }

    let iconUrl;
    if (noiconCheck.checked) {
      iconUrl = DEFAULT_ICON;
    } else if (coverUrl) {
      iconUrl = coverUrl;
    } else {
      iconUrl = extractFirstImage(body) || DEFAULT_ICON;
    }

    const firstLine = JSON.stringify({
      info: base64Encode(info),
      icon: base64Encode(iconUrl)
    });
    const fullBody = firstLine + '\n\n' + body;

    const payload = { title, body: fullBody };

    try {
      const res = await fetch(`${OAUTH_BASE}/discussion`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        alert('讨论创建成功！');
        window.location.href = '/index.html';
      } else {
        alert('创建失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      console.error('提交异常:', error);
      alert('网络错误，请稍后重试');
    }
  }

  // ---------- 提交按钮 ----------
  function buildFooter() {
    if (!editorContainer) return;
    const oldFooter = editorContainer.querySelector('.editor-footer');
    if (oldFooter) oldFooter.remove();

    const footer = document.createElement('div');
    footer.className = 'editor-footer';
    const btn = document.createElement('button');
    btn.textContent = '创建新讨论';
    btn.addEventListener('click', submitDiscussion);
    footer.appendChild(btn);
    editorContainer.appendChild(footer);
  }

  // ---------- 初始化 ----------
  async function init() {
    if (!editorContainer) {
      console.error('#editing 容器未找到');
      return;
    }

    const loggedIn = await checkLogin();
    if (!loggedIn) {
      window.location.href = '/404.html';
      return;
    }

    updateTitle();
    titleInput.addEventListener('input', updateTitle);

    buildUploadUI();

    initVditor();

    // 延迟添加按钮，确保 Vditor 渲染完成
    setTimeout(buildFooter, 300);

    noiconCheck.addEventListener('change', () => {
      if (noiconCheck.checked) {
        coverUrl = null;
        coverFile = null;
        updateUploadPreview(null);
        updateUploadVisibility();
      } else {
        updateUploadVisibility();
      }
    });

    updateUploadVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
