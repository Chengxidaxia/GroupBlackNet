// ============================================================
// edit.js — 写稿页：标题 / 分类 / 简介 / 标签 / 封面 / 正文（Vditor）
// 提交：POST oauth.blacknet.cc.cd/discussion { title, body }
// 说明：后端接口不变 —— 所有新增字段（category / coverText / allowComments / tags）
//       全部写入正文首行 JSON，与 info / icon 同级。
// ============================================================
(function () {
  'use strict';

  const OAUTH_BASE = (window.BLACKNET && window.BLACKNET.OAUTH_BASE) || 'https://oauth.blacknet.cc.cd';
  const UPLOAD_URL = (window.BLACKNET && window.BLACKNET.UPLOAD_URL) || 'https://upload.blacknet.cc.cd';
  const DEFAULT_ICON = (window.BLACKNET && window.BLACKNET.DEFAULT_ICON) || 'https://grp.blacknet.cc.cd/img/pole.jpg';
  const VDITOR_BASE = (window.BLACKNET && window.BLACKNET.VDITOR_BASE) || 'vditor/4.0.0';

  const $ = id => document.getElementById(id);
  const esc = s => (window.GB ? GB.esc(s) : String(s == null ? '' : s));
  const toast = msg => (window.GB ? GB.toast(msg) : console.warn(msg));

  let vditor = null;
  let vdReady = false;           // after() 触发后才可安全调 getValue（Lute WASM 异步加载）
  let coverMode = 'image';       // image | text | none
  let coverUrl = '';             // 上传成功后的图片地址
  let coverDataURL = '';         // 本地预览
  let category = 3;
  let isSubmitting = false;
  let isLoggedIn = false;

  /* ---------------- 分类 ---------------- */
  function renderCats() {
    const box = $('cats');
    if (!box) return;
    const list = (window.GB && GB.cats) || [];
    box.innerHTML = list.map(c => `
      <button type="button" class="cat-pill ${c.id === category ? 'on' : ''}" data-id="${c.id}">
        <span class="d" style="background:hsl(${c.hue} 62% 50%)"></span>${esc(c.name)}<span class="id">#${c.id}</span>
      </button>`).join('');
  }
  function bindCats() {
    const box = $('cats');
    if (!box) return;
    box.addEventListener('click', e => {
      const p = e.target.closest('.cat-pill');
      if (!p) return;
      category = parseInt(p.dataset.id, 10) || 0;
      [...box.children].forEach(el => el.classList.toggle('on', parseInt(el.dataset.id, 10) === category));
      updateAll();
    });
  }
  async function setupCategories() {
    if (window.GB) await GB.catReady;
    const hint = $('catSrc');
    const src = (window.GB && GB.catSource) === 'remote' ? 'CF 存储' : '内置兜底';
    if (hint) hint.textContent = `JSON 的 category（数字 ID）· 来源：${src}`;
    const list = (window.GB && GB.cats) || [];
    if (!list.some(c => c.id === category) && list[0]) category = list[0].id;
    renderCats();
    updateAll();
  }

  /* ---------------- 封面 ---------------- */
  function setCoverMode(mode) {
    coverMode = mode;
    const seg = $('coverSeg');
    if (seg) [...seg.children].forEach(el => el.classList.toggle('on', el.dataset.mode === mode));
    if ($('coverImageRow')) $('coverImageRow').style.display = mode === 'image' ? 'flex' : 'none';
    if ($('coverTextRow')) $('coverTextRow').style.display = mode === 'text' ? 'block' : 'none';
    if ($('coverNoneRow')) $('coverNoneRow').style.display = mode === 'none' ? 'block' : 'none';
    updateAll();
  }

  function bindCover() {
    const seg = $('coverSeg');
    if (seg) seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (b) setCoverMode(b.dataset.mode);
    });

    const drop = $('coverDrop'), file = $('coverFile');
    if (drop && file) {
      drop.addEventListener('click', e => { if (e.target !== file) file.click(); });
      file.addEventListener('change', () => {
        const f = file.files[0];
        if (f) handleCoverFile(f);
        file.value = '';
      });
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
      drop.addEventListener('drop', e => {
        e.preventDefault(); drop.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f) handleCoverFile(f);
      });
    }
    const ct = $('coverText');
    if (ct) ct.addEventListener('input', updateAll);
  }

  function previewLocalImage(src) {
    const box = $('coverPrev');
    if (box) box.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '';
  }

  async function handleCoverFile(file) {
    const okTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (!okTypes.includes(file.type)) { toast('仅支持 JPEG / PNG / GIF / WEBP / SVG / ICO'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('图片不能超过 10MB'); return; }

    const reader = new FileReader();
    reader.onload = ev => { coverDataURL = ev.target.result; previewLocalImage(coverDataURL); updateAll(); };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${UPLOAD_URL}/`, { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json().catch(() => ({}));
      const map = data && data.data && data.data.succMap;
      const url = map && (map[file.name] || Object.values(map)[0]);
      if (data.code === 0 && url) {
        coverUrl = url;
        toast('封面上传成功');
      } else {
        coverUrl = '';
        previewLocalImage('');
        coverDataURL = '';
        toast('封面上传失败：' + ((data && data.msg) || '未知错误'));
      }
    } catch (e) {
      console.error('封面上传异常:', e);
      coverUrl = '';
      toast('封面上传失败（网络错误）');
    }
    updateAll();
  }

  /* ---------------- Markdown / Vditor ---------------- */
  const INITIAL_MD = '';

  function getMD() {
    // Lute（WASM）异步加载完成、after() 触发前，getValue 必然抛
    // 「Cannot read properties of undefined (reading 'VditorDOM2Md')」→ 就绪前一律回退
    if (vditor && vdReady && typeof vditor.getValue === 'function') {
      try { return vditor.getValue(); }
      catch (e) { console.warn('getValue 尚未就绪：', e); return ''; }
    }
    const fb = $('mdFallback');
    return fb ? fb.value : '';
  }
  function setVdStatus(text, kind) {
    const el = $('vdStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'vd-status ' + (kind || '');
    el.style.display = kind === 'ok' ? 'none' : 'block';
  }
  function degradeToTextarea(msg) {
    vdReady = false;
    vditor = null;
    const ta = $('mdFallback');
    if (ta) {
      ta.style.display = 'block';
      if (!ta.value) ta.value = INITIAL_MD;
      ta.addEventListener('input', updateAll);
    }
    const host = $('vditor');
    if (host) host.style.display = 'none';
    if (msg) setVdStatus(msg, 'err');
    updateAll();
  }

  function waitVditor(timeout) {
    const limit = timeout || 10000;
    return new Promise(resolve => {
      let waited = 0;
      (function poll() {
        if (typeof Vditor !== 'undefined') return resolve(true);
        if (waited >= limit) return resolve(false);
        waited += 200; setTimeout(poll, 200);
      })();
    });
  }

  function initEditor() {
    const host = $('vditor');
    if (!host) return;
    if (typeof Vditor === 'undefined') { degradeToTextarea('编辑器脚本加载失败，已降级为普通文本框。'); return; }
    const from = window.__vditorFrom === 'cdn' ? 'CDN' : '本地';
    setVdStatus('编辑器已加载（' + from + ' Vditor 4.0）', 'ok');
    const cdnBase = window.__vditorFrom === 'cdn' ? 'https://cdn.jsdelivr.net/npm/vditor@4.0.0' : VDITOR_BASE;

    try {
      vditor = new Vditor('vditor', {
        cdn: cdnBase,
        mode: 'wysiwyg',
        height: 720,
        minHeight: 480,
        placeholder: '用 Markdown 书写正文…',
        value: INITIAL_MD,
        cache: { enable: false },
        lang: 'zh_CN',
        icon: 'ant',
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'classic',
        counter: { enable: true },
        outline: { enable: false },
        preview: { theme: { current: 'light' }, hljs: { enable: true, style: 'github' }, markdown: { toc: false } },
        upload: {
          url: `${UPLOAD_URL}/`,
          fieldName: 'file',
          accept: 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/ogg,video/quicktime',
          max: 100 * 1024 * 1024,
          multiple: false,
          withCredentials: true
        },
        toolbar: [
          'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
          'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
          'quote', 'line', 'code', 'inline-code', 'insert-before', 'insert-after', '|',
          'upload', 'record', 'table', '|',
          'undo', 'redo', '|',
          'fullscreen', 'edit-mode',
          // 「更多」：官方写法 —— 自定义项自带子工具栏（toolbar 数组）
          { name: 'more', toolbar: ['both', 'code-theme', 'content-theme', 'export', 'outline', 'preview', 'devtools', 'info', 'help'] },
          '|',
          {
            name: 'publish-btn',
            tip: '发布',
            className: 'toolbar-publish',
            icon: '<span class="tb-publish">发布</span>',
            click: () => submitDiscussion()
          }
        ],
        toolbarConfig: { pin: true },
        input: () => updateAll(),
        after: () => { vdReady = true; updateAll(); }
      });
      if (!window.__vditorFrom || window.__vditorFrom !== 'cdn') {
        // 本地 Vditor 若 Lute 加载失败（网络/路径问题），8 秒后仍未就绪则降级
        setTimeout(() => {
          if (!vdReady && vditor) {
            console.warn('Vditor after() 超时未触发，降级为文本框');
            degradeToTextarea('编辑器初始化超时（Lute 未就绪），已降级为普通文本框。');
          }
        }, 8000);
      }
    } catch (e) {
      console.error('Vditor 初始化失败：', e);
      degradeToTextarea('Vditor 初始化失败：' + (e && e.message ? e.message : e) + '（已降级为普通文本框）');
    }
  }

  /* ---------------- 提交 ---------------- */
  function extractFirstImage(md) {
    if (!md) return null;
    const a = md.match(/!\[.*?\]\((.*?)\)/);
    if (a && a[1]) return a[1];
    const b = md.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (b && b[1]) return b[1];
    const c = md.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|svg|webp))/i);
    return c ? c[1] : null;
  }

  async function submitDiscussion() {
    if (isSubmitting) return;
    const title = ($('title') && $('title').value.trim()) || '';
    if (!title) { toast('请输入标题'); $('title').focus(); return; }

    const md = getMD().trim();
    if (!md) { toast('请输入正文内容'); return; }

    const info = ($('info') && $('info').value.trim()) || '无简介';
    const tags = (($('tags') && $('tags').value) || '').split(',').map(s => s.trim()).filter(Boolean);
    const allow = !$('allowComments') || $('allowComments').checked;
    const coverText = ($('coverText') && $('coverText').value.trim()) || '';

    let iconUrl = '';
    if (coverMode === 'image') iconUrl = coverUrl || extractFirstImage(md) || DEFAULT_ICON;
    // text / none：icon 留空，由前端按 coverText 或分类渐变呈现

    const firstLine = JSON.stringify({
      info: GB.b64e(info),
      icon: iconUrl ? GB.b64e(iconUrl) : '',
      coverText: coverMode === 'text' ? coverText : '',
      category: category,
      allowComments: allow,
      tags: tags
    });
    const fullBody = firstLine + '\n\n' + md;

    if (window.GB && GB.demoMode) {
      GB.showDemoNotice();
      toast('演示模式：已生成首行 JSON 与正文，但不会真正提交（后端未放行本机域名）');
      console.log('[演示] 将提交：\n' + fullBody);
      return;
    }

    isSubmitting = true;
    const btn = $('submitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '发布中…'; }
    const tbBtn = document.querySelector('.vditor-toolbar [data-type="publish-btn"]');
    if (tbBtn) tbBtn.style.pointerEvents = 'none';

    try {
      const res = await fetch(`${OAUTH_BASE}/discussion`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: fullBody })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const n = data.discussion && data.discussion.number;
        toast('发布成功');
        setTimeout(() => { window.location.href = n ? `/blog.html?d=${n}` : '/index.html'; }, 500);
        return;
      }
      toast('创建失败：' + (data.error || ('HTTP ' + res.status)));
    } catch (e) {
      console.error('提交异常:', e);
      toast('网络错误，请稍后重试');
    } finally {
      isSubmitting = false;
      if (btn) { btn.disabled = false; btn.textContent = '发布文章'; }
      if (tbBtn) tbBtn.style.pointerEvents = 'auto';
    }
  }

  /* ---------------- 联动更新 ---------------- */
  function escapeAttr(s) { return esc(s); }

  function updateAll() {
    const title = ($('title') && $('title').value.trim()) || '';
    const info = ($('info') && $('info').value.trim()) || '';
    const tags = (($('tags') && $('tags').value) || '').split(',').map(s => s.trim()).filter(Boolean);
    const allow = !$('allowComments') || $('allowComments').checked;
    const ctext = ($('coverText') && $('coverText').value.trim()) || '';
    const md = getMD();

    const tc = $('titleCount');
    if (tc) tc.textContent = `${title.length} / 120`;
    const wc = $('wordCount');
    if (wc) wc.textContent = `${md.replace(/\s/g, '').length} 字`;
    document.title = title ? title + ' · 写稿 · 群档案' : '写稿 · 群档案';

    // 卡片预览
    const cat = (window.GB && GB.catInfo(category)) || { name: '随笔', hue: 214 };
    const hue = cat.hue;
    const thumb = $('prevThumb');
    if (thumb) {
      let inner;
      if (coverMode === 'image' && (coverDataURL || coverUrl)) {
        inner = `<img src="${escapeAttr(coverDataURL || coverUrl)}" alt="">`;
      } else if (coverMode === 'text' && ctext) {
        inner = `<div class="cover-fill" style="background:${GB.grad(hue)}"><span style="font-size:20px">${esc(ctext)}</span></div>`;
      } else {
        inner = `<div class="cover-fill" style="background:${GB.grad(hue)}"><span style="font-size:34px">${esc(cat.name)}</span></div>`;
      }
      thumb.innerHTML = inner + `<span class="chip" style="background:hsl(${hue} 62% 42%)">${esc(cat.name)}</span>`;
    }
    if ($('prevTitle')) $('prevTitle').textContent = title || '（未填标题）';
    if ($('prevEx')) $('prevEx').textContent = info || '（未填简介）';

    // 首行 JSON（base64 用占位符展示，避免长串乱码）
    const useImg = coverMode === 'image' && (coverUrl || coverDataURL);
    const useText = coverMode === 'text' && ctext;
    const infoPh = info ? `&lt;base64 简介 ${info.length} 字&gt;` : '';
    const iconPh = useImg ? `&lt;base64 图片 ${Math.round((coverDataURL || '').length / 1024)} KB&gt;` : '';
    const tagsHtml = tags.map(t => `<span class="s">"${esc(t)}"</span>`).join(', ');
    const out = $('jsonOut');
    if (out) {
      out.innerHTML =
`{
  <span class="k">"info"</span>: <span class="s">"${infoPh}"</span>,
  <span class="k">"icon"</span>: <span class="s">"${iconPh}"</span>,
  <span class="k">"coverText"</span>: <span class="s">"${esc(useText ? ctext : '')}"</span>,
  <span class="k">"category"</span>: <span class="n">${category}</span>,
  <span class="k">"allowComments"</span>: <span class="b">${allow}</span>,
  <span class="k">"tags"</span>: [${tagsHtml}]
}`;
    }
  }

  /* ---------------- 登录 / 初始化 ---------------- */
  async function checkLogin() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      isLoggedIn = res.ok;
      return isLoggedIn;
    } catch (e) { return false; }
  }

  async function init() {
    if (!$('vditor')) return;
    const loggedIn = await checkLogin();
    if (!loggedIn) {
      // 本地预览：后端 CORS 未放行本机域名，登录态取不到 → 仍展示编辑器（演示）
      if (window.GB && GB.demoMode) {
        GB.showDemoNotice();
      } else {
        window.location.href = '/404.html';
        return;
      }
    }

    ['title', 'info', 'tags'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', updateAll);
    });
    const ac = $('allowComments');
    if (ac) ac.addEventListener('change', updateAll);

    bindCats();
    bindCover();
    setCoverMode('image');
    await setupCategories();

    (async () => {
      const ok = await waitVditor(10000);
      if (ok) initEditor();
      else degradeToTextarea('编辑器脚本加载失败（本地与 CDN 均不可用），已降级为普通文本框。');
    })();

    const sb = $('submitBtn');
    if (sb) sb.addEventListener('click', submitDiscussion);

    // 主题切换时同步 Vditor 主题
    document.addEventListener('gb:theme', e => {
      if (!vditor) return;
      const dark = e.detail === 'dark';
      try { vditor.setTheme(dark ? 'dark' : 'classic'); } catch (err) {}
      try {
        const base = window.__vditorFrom === 'cdn' ? 'https://cdn.jsdelivr.net/npm/vditor@4.0.0' : VDITOR_BASE;
        vditor.setContentTheme(dark ? 'dark' : 'light', base + '/dist/css/content-theme');
      } catch (err) {}
    });

    updateAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
