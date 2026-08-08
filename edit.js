// ============================================================
// edit.js - 创建新讨论页面（强制 Flex 居中）
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const DEFAULT_ICON = 'img/pole.jpg';

  // DOM 引用
  const titleInput = document.getElementById('title');
  const infoInput = document.getElementById('info');
  const noiconCheck = document.getElementById('noicon');
  const uploadContainer = document.getElementById('upload');
  const editingContainer = document.getElementById('editing');

  let vditorInstance = null;
  let coverUrl = null;
  let coverFile = null;
  let isLoggedIn = false;

  // ---------- 标题同步 ----------
  function updateTitle() {
    const val = titleInput.value.trim();
    document.title = val || '编稿';
  }

  // ---------- 登录检查 ----------
  async function checkLogin() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      if (res.ok) {
        isLoggedIn = true;
        return true;
      } else {
        isLoggedIn = false;
        return false;
      }
    } catch (e) {
      isLoggedIn = false;
      return false;
    }
  }

  // ---------- 样式注入 ----------
  function injectStyles() {
    if (document.getElementById('edit-styles')) return;
    const style = document.createElement('style');
    style.id = 'edit-styles';
    style.textContent = `
      /* 强制 #editing 使用 Flex 垂直居中 */
      #editing {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: flex-start !important;
        width: 100% !important;
        min-height: 400px !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* 编辑器包装器 */
      .edit-editor-wrapper {
        width: 80% !important;
        max-width: 1000px !important;
        min-width: 600px !important;
        background: #ffffff !important;
        border-radius: 8px !important;
        border: 1px solid #ddd !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        min-height: 400px !important;
        text-align: left !important;
        flex-shrink: 0 !important;
      }
      .edit-editor-wrapper .vditor {
        border: none !important;
        border-radius: 0 !important;
        width: 100% !important;
      }
      .edit-editor-wrapper .vditor-content {
        min-height: 400px !important;
      }

      /* 菜单包装器 */
      .edit-menu-wrapper {
        width: 80% !important;
        max-width: 1000px !important;
        text-align: center !important;
        padding: 20px 0 !important;
        margin: 10px 0 0 0 !important;
        flex-shrink: 0 !important;
      }

      /* 封面上传区域 */
      .upload-area {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        cursor: pointer;
        transition: border-color 0.3s;
        min-height: 120px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #fafafa;
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
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 12px;
        cursor: pointer;
      }
      .upload-area.hidden {
        display: none !important;
      }

      /* 强制大纲左侧 */
      .vditor-outline {
        left: 0 !important;
        right: auto !important;
      }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

  // ---------- 辅助函数 ----------
  function base64Encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function extractFirstImage(markdown) {
    if (!markdown) return null;
    const mdMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch && mdMatch[1]) return mdMatch[1];
    const imgMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return imgMatch[1];
    const urlMatch = markdown.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|svg|webp))/i);
    if (urlMatch && urlMatch[1]) return urlMatch[1];
    return null;
  }

  // ---------- 封面上传 UI ----------
  function buildUploadUI() {
    if (!uploadContainer) {
      console.warn('uploadContainer not found');
      return;
    }
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

    area.addEventListener('click', function(e) {
      if (e.target.closest('.remove-btn')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) handleCoverFile(file);
      fileInput.value = '';
    });

    area.addEventListener('dragover', function(e) {
      e.preventDefault();
      area.classList.add('dragover');
    });
    area.addEventListener('dragleave', function(e) {
      e.preventDefault();
      area.classList.remove('dragover');
    });
    area.addEventListener('drop', function(e) {
      e.preventDefault();
      area.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/') || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') {
          handleCoverFile(file);
        } else {
          alert('仅支持图片格式（JPEG、PNG、GIF、WEBP、SVG、ICO）');
        }
      }
    });

    updateUploadVisibility();
  }

  function updateUploadVisibility() {
    const area = document.getElementById('upload-area');
    if (area) {
      if (noiconCheck.checked) {
        area.classList.add('hidden');
      } else {
        area.classList.remove('hidden');
      }
    }
  }

  function updateUploadPreview(file) {
    const previewDiv = document.getElementById('upload-preview');
    if (!previewDiv) return;
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        previewDiv.innerHTML = `
          <img src="${e.target.result}" alt="封面预览" />
          <button class="remove-btn" id="remove-cover">移除</button>
        `;
        document.getElementById('remove-cover').addEventListener('click', function(ev) {
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

  // ---------- 初始化 Vditor ----------
  function initVditor(wrapper) {
    if (!wrapper) {
      console.error('initVditor: wrapper is null');
      return;
    }
    if (typeof Vditor === 'undefined') {
      wrapper.innerHTML = '<p style="color:red;text-align:center;padding:40px;">Vditor 未加载，请刷新页面重试。</p>';
      return;
    }
    if (vditorInstance) {
      vditorInstance.destroy();
      vditorInstance = null;
    }
    wrapper.innerHTML = '';

    vditorInstance = new Vditor(wrapper, {
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

    // 强制大纲左侧
    setTimeout(function() {
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
    } else {
      if (coverUrl) {
        iconUrl = coverUrl;
      } else {
        const extracted = extractFirstImage(body);
        iconUrl = extracted || DEFAULT_ICON;
      }
    }

    const firstLine = JSON.stringify({
      info: base64Encode(info),
      icon: base64Encode(iconUrl)
    });
    const fullBody = firstLine + '\n\n' + body;

    const payload = { title, body: fullBody };
    console.log('创建讨论 payload:', payload);

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

  // ---------- 构建菜单 ----------
  function buildMenu(wrapper) {
    if (!wrapper) {
      console.error('buildMenu: wrapper is null');
      return;
    }
    wrapper.innerHTML = '';
    const submitBtn = document.createElement('button');
    submitBtn.textContent = '创建新讨论';
    submitBtn.style.cssText = `
      padding: 12px 40px;
      background: #2da44e;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 18px;
      cursor: pointer;
      font-weight: bold;
    `;
    submitBtn.addEventListener('click', submitDiscussion);
    wrapper.appendChild(submitBtn);
  }

  // ---------- 初始化 ----------
  async function init() {
    // 1. 检查容器
    if (!editingContainer) {
      console.error('editingContainer not found');
      return;
    }

    // 2. 登录检查
    const loggedIn = await checkLogin();
    if (!loggedIn) {
      window.location.href = '/404.html';
      return;
    }

    // 3. 标题同步
    updateTitle();
    titleInput.addEventListener('input', updateTitle);

    // 4. 封面上传
    buildUploadUI();

    // 5. 清空 #editing 并创建包装器
    editingContainer.innerHTML = '';

    // 创建编辑器包装器
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'edit-editor-wrapper';
    editorWrapper.id = 'editor-wrapper';
    editingContainer.appendChild(editorWrapper);

    // 创建菜单包装器
    const menuWrapper = document.createElement('div');
    menuWrapper.className = 'edit-menu-wrapper';
    menuWrapper.id = 'menu-wrapper';
    editingContainer.appendChild(menuWrapper);

    // 6. 初始化 Vditor
    initVditor(editorWrapper);

    // 7. 构建菜单
    buildMenu(menuWrapper);

    // 8. noicon 切换
    noiconCheck.addEventListener('change', function() {
      if (this.checked) {
        coverUrl = null;
        coverFile = null;
        updateUploadPreview(null);
        updateUploadVisibility();
      } else {
        updateUploadVisibility();
      }
    });

    // 9. 初始隐藏
    updateUploadVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
