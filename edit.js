// ============================================================
// edit.js - 创建新讨论页面（禁用缓存，修复更多）
// ============================================================

// 关键修改：
function initVditor() {
  if (!editingContainer) {
    console.error('#editing 容器未找到');
    return;
  }

  const vditorContainer = document.createElement('div');
  vditorContainer.id = 'vditor-container';
  vditorContainer.style.cssText = 'margin:10px 0; text-align:left;';
  editingContainer.appendChild(vditorContainer);

  if (typeof Vditor === 'undefined') {
    vditorContainer.innerHTML = '<p style="color:red;text-align:center;padding:40px;">Vditor 未加载，请刷新页面重试。</p>';
    return;
  }
  if (vditorInstance) {
    vditorInstance.destroy();
    vditorInstance = null;
  }

  vditorInstance = new Vditor(vditorContainer, {
    height: 500,
    mode: 'ir',
    placeholder: '',
    cache: { enable: false },  // 禁用缓存
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
    outline: { enable: true, position: 'left' },
    after: function() {
      this.setValue(''); // 确保初始为空
    }
  });

  setTimeout(function() {
    const outline = document.querySelector('.vditor-outline');
    if (outline) {
      outline.style.left = '0';
      outline.style.right = 'auto';
    }
  }, 200);
}
