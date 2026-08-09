// ============================================================
// blog.js - 文章详情页（禁用缓存，修复更多）
// ============================================================

// 由于代码较长，仅列出关键修改部分：
// 1. 在 initVditor 中设置 cache: { enable: false }
// 2. 确保 toolbar 包含 'more'
// 3. 移除 after 回调中的 setValue（因为禁用缓存后无需清空）

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
    cache: { enable: false },  // 禁用缓存，彻底解决残留
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
      'undo', 'redo', 'more'  // 确保存在
    ],
    outline: { enable: true, position: 'left' },
    // 由于禁用缓存，无需清空，但为了保险可以保留 after
    after: function() {
      this.setValue(''); // 确保初始为空
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
