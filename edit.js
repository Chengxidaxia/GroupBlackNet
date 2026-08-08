// ============================================================
// edit.js - 创建新讨论页面（含登录检查，未登录跳转 404）
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = 'https://upload.blacknet.cc.cd';
  const DEFAULT_ICON = 'img/pole.jpg';

  // ---------- 检查登录状态，未登录则跳转 ----------
  async function checkLoginAndInit() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      if (!res.ok) {
        // 未登录，跳转到 404
        window.location.href = '/404.html';
        return;
      }
      // 已登录，初始化页面
      initPage();
    } catch (e) {
      console.error('登录检查失败:', e);
      window.location.href = '/404.html';
    }
  }

  // ---------- 页面初始化 ----------
  function initPage() {
    const titleInput = document.getElementById('title');
    const infoInput = document.getElementById('info');
    const noiconCheck = document.getElementById('noicon');
    const uploadContainer = document.getElementById('upload');
    const editorContainer = document.getElementById('editor');
    const menuContainer = document.getElementById('menu');

    let vditorInstance = null;
    let coverUrl = null;
    let coverFile = null;

    // 样式注入（封面上传区域）
    function injectUploadStyles() {
      if (document.getElementById('upload-styles')) return;
      const style = document.createElement('style');
      style.id = 'upload-styles';
      style.textContent = `
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
      `;
      document.head.appendChild(style);
    }
    injectUploadStyles();

    // 辅助函数
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

    // 封面上传 UI
    function buildUploadUI() {
      uploadContainer.innerHTML = '';
      const area = document.createElement('div');
      area.className = 'upload-area';
      area.id = 'upload-area';
      area.innerHTML = `
        <div class="hint">点击选择或拖拽图片到此作为封面</div>
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
          const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
          if (allowedTypes.includes(file.type)) {
            handleCoverFile(file);
          } else {
            alert('仅支持图片格式（JPEG、PNG、GIF、WEBP、SVG、ICO）');
          }
        }
      });

      updateUploadPreview(null);
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

    // 初始化 Vditor
    function initVditor() {
      if (typeof Vditor === 'undefined') {
        editorContainer.innerHTML = '<p style="color:red;">Vditor 未加载，请刷新页面重试。</p>';
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
        outline: { enable: true, position: 'left' }
      });
    }

    // 提交讨论
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

    // 构建菜单
    function buildMenu() {
      menuContainer.innerHTML = '';
      const submitBtn = document.createElement('button');
      submitBtn.textContent = '创建新讨论';
      submitBtn.style.cssText = `
        padding: 10px 30px;
        background: #2da44e;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 18px;
        cursor: pointer;
      `;
      submitBtn.addEventListener('click', submitDiscussion);
      menuContainer.appendChild(submitBtn);
    }

    // 初始化
    buildUploadUI();
    initVditor();
    buildMenu();

    noiconCheck.addEventListener('change', function() {
      if (this.checked) {
        coverUrl = null;
        coverFile = null;
        updateUploadPreview(null);
      }
    });
  }

  // 启动：先检查登录
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkLoginAndInit);
  } else {
    checkLoginAndInit();
  }
})();