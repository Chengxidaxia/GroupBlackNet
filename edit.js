// ============================================================
// edit.js - 创建新讨论（移除 cdn，避免冲突）
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const DEFAULT_ICON = 'https://grp.blacknet.cc.cd/img/pole.jpg';

  const titleInput = document.getElementById('title');
  const infoInput = document.getElementById('info');
  const noiconCheck = document.getElementById('noicon');
  const uploadContainer = document.getElementById('upload');
  const editingContainer = document.getElementById('editing');

  let vditorInstance = null;
  let coverUrl = null;
  let coverFile = null;
  let isLoggedIn = false;
  let isSubmitting = false;

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
      } else {
        isLoggedIn = false;
        return false;
      }
    } catch(e) {
      isLoggedIn = false;
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById('edit-styles')) return;
    const style = document.createElement('style');
    style.id = 'edit-styles';
    style.textContent = `
      #editing { width:85%; margin:0 auto; display:block; min-height:400px; }
      #vditor-container { margin:10px 0; text-align:left; width:100%; }
      .upload-area {
        border:2px dashed #ccc; border-radius:8px; padding:20px; text-align:center;
        cursor:pointer; transition:border-color 0.3s; min-height:120px;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#fafafa;
      }
      .upload-area.dragover { border-color:#2da44e; background:#f0f9f0; }
      .upload-area img { max-width:100%; max-height:200px; margin-top:8px; border-radius:4px; }
      .upload-area .hint { color:#888; font-size:14px; }
      .upload-area .remove-btn { margin-top:8px; background:#dc3545; color:white; border:none; border-radius:4px; padding:4px 12px; cursor:pointer; }
      .upload-area.hidden { display:none !important; }
    `;
    document.head.appendChild(style);
  }
  injectStyles();

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

    area.addEventListener('click', function(e) {
      if (e.target.closest('.remove-btn')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', function() {
      const file = fileInput.files[0];
      if (file) handleCoverFile(file);
      fileInput.value = '';
    });

    area.addEventListener('dragover', function(e) {
      e.preventDefault();
      area.classList.add('dragover');
    });
    area.addEventListener('dragleave', function() {
      area.classList.remove('dragover');
    });
    area.addEventListener('drop', function(e) {
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

  // ========== 提交讨论 ==========
  async function submitDiscussion() {
    if (isSubmitting) return;
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
    console.log('创建讨论 payload:', payload);

    const toolbarBtn = document.querySelector('.vditor-toolbar__item[data-name="submit"]');
    const bottomBtn = document.getElementById('edit-submit-btn');
    const disableButtons = () => {
      if (toolbarBtn) toolbarBtn.style.pointerEvents = 'none';
      if (bottomBtn) bottomBtn.disabled = true;
      if (toolbarBtn) toolbarBtn.style.opacity = '0.5';
    };
    const enableButtons = () => {
      if (toolbarBtn) {
        toolbarBtn.style.pointerEvents = 'auto';
        toolbarBtn.style.opacity = '1';
      }
      if (bottomBtn) bottomBtn.disabled = false;
    };

    isSubmitting = true;
    disableButtons();

    try {
      const res = await fetch(`${OAUTH_BASE}/discussion`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        const discussionNumber = data.discussion?.number;
        if (discussionNumber) {
          window.location.href = `/blog.html?d=${discussionNumber}`;
        } else {
          window.location.href = '/index.html';
        }
      } else {
        alert('创建失败: ' + (data.error || '未知错误'));
        enableButtons();
      }
    } catch (error) {
      console.error('提交异常:', error);
      alert('网络错误，请稍后重试');
      enableButtons();
    } finally {
      isSubmitting = false;
    }
  }

  // ---------- 初始化 Vditor ----------
  function initVditor() {
    if (!editingContainer) {
      console.error('#editing 容器未找到');
      return;
    }

    const vditorContainer = document.createElement('div');
    vditorContainer.id = 'vditor-container';
    vditorContainer.style.cssText = 'margin:10px 0; text-align:left; width:100%;';
    editingContainer.appendChild(vditorContainer);

    vditorContainer.addEventListener('wheel', function(e) {
      e.stopPropagation();
    }, { passive: true });

    if (typeof Vditor === 'undefined') {
      vditorContainer.innerHTML = '<p style="color:red;text-align:center;padding:40px;">Vditor 未加载，请刷新页面重试。</p>';
      return;
    }
    if (vditorInstance) {
      vditorInstance.destroy();
      vditorInstance = null;
    }

    // ★ 关键修改：移除 cdn 配置，避免与外部加载的 Vditor 冲突 ★
    vditorInstance = new Vditor(vditorContainer, {
      height: 800,
      mode: 'ir',
      placeholder: '',
      value: '',
      cache: { enable: false },
      lang: 'zh_CN',
      // 不再设置 cdn
      icon: 'ant',
      theme: 'classic',
      upload: {
        url: `${UPLOAD_URL}/`,
        fieldName: 'file',
        accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/ogg,video/quicktime',
        max: 100 * 1024 * 1024,
        multiple: false,
        withCredentials: true,
      },
      toolbar: [
        'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
        'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
        'quote', 'line', 'code', 'inline-code', 'insert-before', 'insert-after', '|',
        'upload', 'record', 'table', '|',
        'undo', 'redo', '|',
        'fullscreen', 'edit-mode', 'both',
        {
          name: 'more',
          toolbar: ['both', 'code-theme', 'content-theme', 'export', 'outline', 'preview', 'devtools', 'info', 'help']
        },
        '|',
        {
          name: 'submit',
          icon: '<svg viewBox="0 0 32 32" style="fill: #2da44e; width: 18px; height: 18px;"><path d="M6 4l20 12-20 12z"></path></svg>',
          tip: '发布文章',
          click: submitDiscussion
        }
      ],
      toolbarConfig: { pin: true },
      outline: { enable: true, position: 'left' }
    });

    setTimeout(function() {
      const outline = document.querySelector('.vditor-outline');
      if (outline) {
        outline.style.left = '0';
        outline.style.right = 'auto';
      }
    }, 200);
  }

  async function init() {
    if (!editingContainer) {
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

    updateUploadVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
