// ============================================================
// main.js - 首页文章列表（分页始终显示，带箭头和省略号）
// ============================================================

(function() {
  'use strict';

  const API_URL = 'https://api.blacknet.cc.cd';
  const PAGE_SIZE = 20;
  const SORT_SELECT_ID = 'sort';
  const ASC_CHECK_ID = 'UP';

  let allPosts = [];
  let currentPage = 1;
  let totalPages = 1;
  let currentSort = 'Default';
  let isAscending = false;
  let cardsContainer = null;
  let sortSelect = null;
  let ascCheck = null;
  const CONTAINER = document.getElementById('main');

  // ---------- 辅助函数 ----------
  function base64Decode(str) {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return atob(str);
    }
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

  function getFirstLinePlainText(markdown) {
    const lines = markdown.split('\n');
    const firstLine = lines.find(line => line.trim() !== '') || '';
    return firstLine
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '$1')
      .replace(/[#*`>_\-]/g, '')
      .trim() || '无简介';
  }

  function parseFirstLine(body) {
    const lines = body.split('\n');
    const firstLine = lines.find(line => line.trim() !== '') || '';
    let info = null;
    let icon = null;
    let bodyText = '';
    let isJson = false;

    try {
      const data = JSON.parse(firstLine);
      isJson = true;
      if (data.info) {
        info = base64Decode(data.info);
      }
      if (data.icon) {
        icon = base64Decode(data.icon);
      }
      const restLines = lines.slice(1);
      bodyText = restLines.join('\n').trim();
    } catch (e) {
      isJson = false;
      info = firstLine
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[.*?\]\(.*?\)/g, '$1')
        .replace(/[#*`>_\-]/g, '')
        .trim() || '无简介';
      const restLines = lines.slice(1);
      bodyText = restLines.join('\n').trim();
    }

    if (!bodyText) bodyText = '';
    return { info, icon, bodyText, isJson };
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

  function renderReactions(reactionGroups) {
    let html = '';
    reactionGroups.forEach(group => {
      const count = group.users.totalCount;
      if (count > 0) {
        const emoji = EMOJI_MAP[group.content] || group.content;
        html += `<span style="font-size:12pt; margin-left:4px;">${emoji} ${count}</span>`;
      }
    });
    return html;
  }

  function getThumbsUp(post) {
    const group = post.reactionGroups.find(g => g.content === 'THUMBS_UP');
    return group ? group.users.totalCount : 0;
  }

  // ---------- 生成卡片 ----------
  function createCard(post) {
    const number = post.number;
    const title = post.title || '无标题';
    const author = post.author.login;
    const avatar = post.author.avatarUrl;
    const createdAt = formatDate(post.createdAt);
    const commentsCount = post.comments.totalCount;
    const reactionsHtml = renderReactions(post.reactionGroups);
    const detailLink = `/blog.html?d=${number}`;

    const { info, icon, bodyText, isJson } = parseFirstLine(post.body);
    const summary = info || getFirstLinePlainText(post.body);
    let imageUrl = icon;
    if (!imageUrl || !imageUrl.startsWith('http')) {
      imageUrl = extractFirstImage(post.body) || 'img/pole.jpg';
    }

    return `
      <div style="box-sizing: border-box; vertical-align: top; border-radius: 15px; position:relative; display: inline-block; margin:10px; width:80%; min-height:320px; max-width:1000px; background-color:#FFFFFF; border: 1px solid #404040; text-align:left;">
        <div style="margin: 10px; display: block;">
          <div style="text-align:left;">
            <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000;"><br/></span>
            <span style="font-size:26pt; font-family:Arial, Helvetica, sans-serif; color:#444444; font-weight:bold;">${title}<br/><br/></span>
            <div style="vertical-align: top; position:relative; display: inline-block; width:100%; min-height:150px; background:none;">
              <div style="margin: 10px; display: block;">
                <div style="text-align:left;">
                  <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000; line-height: 1.5;">${summary}</span>
                </div>
                <div style="text-align:right;">
                  <img src="${imageUrl}" style="vertical-align: bottom; position:relative; display: inline-block; height:150px; background:none;" alt="" onerror="this.src='img/pole.jpg'" />
                </div>
                <div style="text-align:left;">
                  <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000; line-height: 1.5;"><br/><br/><br/></span>
                  <a href="${detailLink}" style="text-decoration:none">
                    <div style="vertical-align: bottom; border-radius: 5px; position:relative; display: inline-block; width:150px; height:40px; background-color:#B1782E; box-shadow: 7px 7px 4px -5px rgba(0,0,0,0.784314);">
                      <div style="display: table; width:100%; height:100%;">
                        <div style="display: table-cell; vertical-align: middle; text-align:center;">
                          <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#FFFFFF;">立刻查看</span>
                        </div>
                      </div>
                    </div>
                  </a>
                  <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000; line-height: 1.5;"><br/></span>
                </div>
                <div style="clear:both;"></div>
              </div>
            </div>
            <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000;"><br/></span>
            <div style="vertical-align: top; position:relative; display: inline-block; width:100%; min-height:50px; background:none;">
              <div style="margin: 10px; display: block;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <a href="https://github.com/${author}" target="_blank" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit;">
                    <img src="${avatar}" style="width:32px; height:32px; border-radius:50%;" alt="avatar" />
                    <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000;">${author}</span>
                  </a>
                  <span style="font-size:10pt; color:#888;">${createdAt}</span>
                  <span style="font-size:10pt; color:#888;">💬 ${commentsCount}</span>
                  ${reactionsHtml}
                </div>
              </div>
            </div>
          </div>
          <div style="clear:both;"></div>
        </div>
      </div>
    `;
  }

  // ---------- 排序 ----------
  function sortPosts(posts, sortType, ascending) {
    if (sortType === 'Default') return posts.slice();
    const sorted = posts.slice();
    if (sortType === 'CREATE_AT') {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortType === 'UPDATED_AT') {
      sorted.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    } else if (sortType === 'UP_AT') {
      sorted.sort((a, b) => getThumbsUp(a) - getThumbsUp(b));
    }
    if (!ascending) sorted.reverse();
    return sorted;
  }

  // ---------- 渲染 ----------
  function renderCards() {
    if (!cardsContainer) return;

    if (!allPosts || allPosts.length === 0) {
      cardsContainer.innerHTML = '<p style="text-align:center;padding:20px;">暂无文章</p>';
      const topEl = document.getElementById('pagination-top');
      const bottomEl = document.getElementById('pagination-bottom');
      if (topEl) topEl.innerHTML = '';
      if (bottomEl) bottomEl.innerHTML = '';
      return;
    }

    const sorted = sortPosts(allPosts, currentSort, isAscending);
    totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, sorted.length);
    const pagePosts = sorted.slice(start, end);

    cardsContainer.innerHTML = '';
    pagePosts.forEach(post => {
      cardsContainer.innerHTML += createCard(post);
    });
    renderPagination();
  }

  // ============================================================
  // ★★★ 新的分页渲染函数（始终显示，带箭头和省略号）★★★
  // ============================================================
  function renderPagination() {
    const topEl = document.getElementById('pagination-top');
    const bottomEl = document.getElementById('pagination-bottom');
    if (topEl) buildPagination(topEl);
    if (bottomEl) buildPagination(bottomEl);
  }

  function buildPagination(container) {
    container.innerHTML = '';
    if (totalPages <= 0) return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap; padding:10px 0;';

    // 上一页
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹';
    prevBtn.className = 'pagination-btn' + (currentPage <= 1 ? ' disabled' : '');
    if (currentPage > 1) {
      prevBtn.addEventListener('click', () => { currentPage--; renderCards(); });
    }
    wrapper.appendChild(prevBtn);

    // 页码
    const maxVisible = 5;
    let pages = [];
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 2);
      let end = Math.min(totalPages - 1, currentPage + 2);
      if (end - start < maxVisible - 1) {
        if (start === 2) end = Math.min(totalPages - 1, start + maxVisible - 2);
        else if (end === totalPages - 1) start = Math.max(2, end - maxVisible + 2);
      }
      if (start > 2) pages.push('…');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('…');
      pages.push(totalPages);
    }

    pages.forEach(item => {
      if (item === '…') {
        const span = document.createElement('span');
        span.textContent = '…';
        span.className = 'pagination-ellipsis';
        span.title = '点击跳转至指定页';
        span.addEventListener('click', function() {
          const input = prompt('请输入要跳转的页码（1-' + totalPages + '）:', currentPage);
          if (input === null) return;
          const page = parseInt(input, 10);
          if (isNaN(page) || page < 1 || page > totalPages) {
            alert('请输入有效页码（1-' + totalPages + '）');
            return;
          }
          currentPage = page;
          renderCards();
        });
        wrapper.appendChild(span);
      } else {
        const btn = document.createElement('button');
        btn.textContent = item;
        btn.className = 'pagination-btn' + (item === currentPage ? ' active' : '');
        btn.addEventListener('click', () => { currentPage = item; renderCards(); });
        wrapper.appendChild(btn);
      }
    });

    // 下一页
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '›';
    nextBtn.className = 'pagination-btn' + (currentPage >= totalPages ? ' disabled' : '');
    if (currentPage < totalPages) {
      nextBtn.addEventListener('click', () => { currentPage++; renderCards(); });
    }
    wrapper.appendChild(nextBtn);

    container.appendChild(wrapper);
  }

  // ---------- 加载数据 ----------
  async function fetchAllPosts() {
    if (cardsContainer) {
      cardsContainer.innerHTML = '<p style="text-align:center;padding:20px;">加载中...</p>';
    }
    try {
      const res = await fetch(`${API_URL}/?first=20`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      allPosts = data.nodes || [];
      console.log(`✅ 成功获取 ${allPosts.length} 篇文章`);
    } catch (error) {
      console.error('❌ 加载失败:', error);
      allPosts = [];
      if (cardsContainer) {
        cardsContainer.innerHTML = '<p style="text-align:center;padding:20px;color:red;">加载失败，请稍后重试。</p>';
      }
    }
  }

  // ---------- 读取控件 ----------
  function readControls() {
    sortSelect = document.getElementById(SORT_SELECT_ID);
    ascCheck = document.getElementById(ASC_CHECK_ID);
    if (sortSelect) {
      currentSort = sortSelect.value;
    } else {
      console.warn('⚠️ 未找到 id="sort" 的下拉框');
    }
    if (ascCheck) {
      isAscending = ascCheck.checked;
    } else {
      console.warn('⚠️ 未找到 id="UP" 的复选框');
    }
  }

  // ---------- 构建 #main ----------
  function buildStructure() {
    if (!CONTAINER) return;
    CONTAINER.innerHTML = '';
    const topControls = document.createElement('div');
    topControls.style.cssText = 'text-align:center; padding:10px 0;';
    const topPagination = document.createElement('div');
    topPagination.id = 'pagination-top';
    topControls.appendChild(topPagination);
    CONTAINER.appendChild(topControls);

    cardsContainer = document.createElement('div');
    cardsContainer.id = 'cards-container';
    cardsContainer.style.cssText = 'text-align:center;';
    CONTAINER.appendChild(cardsContainer);

    const bottomControls = document.createElement('div');
    bottomControls.style.cssText = 'text-align:center; padding:10px 0;';
    const bottomPagination = document.createElement('div');
    bottomPagination.id = 'pagination-bottom';
    bottomControls.appendChild(bottomPagination);
    CONTAINER.appendChild(bottomControls);
  }

  // ---------- 绑定控件 ----------
  function bindControls() {
    if (sortSelect) {
      sortSelect.addEventListener('change', function() {
        currentSort = this.value;
        currentPage = 1;
        renderCards();
      });
    }
    if (ascCheck) {
      ascCheck.addEventListener('change', function() {
        isAscending = this.checked;
        currentPage = 1;
        renderCards();
      });
    }
  }

  // ---------- 主初始化 ----------
  async function initMain() {
    if (!CONTAINER) {
      console.warn('main.js: 未找到 id="main" 的容器');
      return;
    }
    readControls();
    buildStructure();
    bindControls();
    await fetchAllPosts();
    currentPage = 1;
    renderCards();
  }

  // ---------- 等待公共部分加载 ----------
  function start() {
    if (window.commonsLoaded) {
      initMain();
    } else {
      document.addEventListener('commonsLoaded', initMain);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();