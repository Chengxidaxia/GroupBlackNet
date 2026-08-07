// ============================================================
// main.js - 文章列表加载、排序、分页（支持 JSON 简介）
// 依赖：marked.js（CDN），如果未加载则使用纯文本 fallback
// ============================================================

(function() {
  'use strict';

  // ---------- 配置 ----------
  const API_URL = 'https://api.blacknet.cc.cd';
  const PAGE_SIZE = 20;
  const SORT_SELECT_ID = 'sort';
  const ASC_CHECK_ID = 'UP';

  // ---------- 辅助函数 ----------

  // 安全 Base64 解码（支持 UTF-8）
  function base64Decode(str) {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return atob(str); // fallback
    }
  }

  // 提取正文中第一张图片（支持 ![]() 和 <img>）
  function extractFirstImage(markdown) {
    // 1. 匹配 ![]()
    const mdMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch) return mdMatch[1];
    // 2. 匹配 <img src="...">
    const imgMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) return imgMatch[1];
    return null;
  }

  // 渲染 Markdown 为 HTML（支持 marked 或 fallback）
  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      return marked.parse(text);
    }
    // fallback：简单的换行和实体转义
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  // 解析第一行，返回 { summaryHtml, iconUrl }
  function parseFirstLine(body) {
    // 取第一行（非空）
    const lines = body.split('\n');
    const firstLine = lines.find(line => line.trim() !== '') || '';

    // 默认值
    let summaryHtml = '';
    let iconUrl = null;

    // 尝试解析 JSON
    try {
      const data = JSON.parse(firstLine);
      // 是 JSON
      if (data && typeof data === 'object') {
        // info 段：Base64 解码 -> Markdown -> HTML
        if (data.info) {
          const decoded = base64Decode(data.info);
          summaryHtml = renderMarkdown(decoded);
        }
        // icon 段：Base64 解码 -> 图片 URL
        if (data.icon) {
          const decodedIcon = base64Decode(data.icon);
          // 如果解码后看起来像 URL，直接使用
          if (decodedIcon && /^https?:\/\//.test(decodedIcon)) {
            iconUrl = decodedIcon;
          }
        }
      }
    } catch (e) {
      // 不是 JSON，使用原第一行（去除 Markdown 标记）
      const plain = firstLine
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[.*?\]\(.*?\)/g, '$1')
        .replace(/[#*`>_\-]/g, '')
        .trim() || '无简介';
      summaryHtml = plain;
      // 图标：尝试从正文提取第一张图片，否则默认
      iconUrl = extractFirstImage(body) || 'rc_images/pole.jpg';
    }

    // 如果 JSON 解析后没有 info 或 icon，使用回退
    if (!summaryHtml) {
      summaryHtml = '无简介';
    }
    if (!iconUrl) {
      // 尝试从正文提取第一张图片
      iconUrl = extractFirstImage(body) || 'rc_images/pole.jpg';
    }

    return { summaryHtml, iconUrl };
  }

  // ---------- 其余辅助函数（日期、表情等保持不变） ----------
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

    // 解析第一行
    const { summaryHtml, iconUrl } = parseFirstLine(post.body);

    return `
      <div style="box-sizing: border-box; vertical-align: top; border-radius: 15px; position:relative; display: inline-block; margin:10px; width:80%; min-height:320px; max-width:1000px; background-color:#FFFFFF; border: 1px solid #404040; text-align:left;">
        <div style="margin: 10px; display: block;">
          <div style="text-align:left;">
            <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000;"><br/></span>
            <span style="font-size:26pt; font-family:Arial, Helvetica, sans-serif; color:#444444; font-weight:bold;">${title}<br/><br/></span>
            <div style="vertical-align: top; position:relative; display: inline-block; width:100%; min-height:150px; background:none;">
              <div style="margin: 10px; display: block;">
                <div style="text-align:left;">
                  <span style="font-size:12pt; font-family:Arial, Helvetica, sans-serif; color:#000000; line-height: 1.5;">${summaryHtml}</span>
                </div>
                <div style="text-align:right;">
                  <img src="${iconUrl}" style="vertical-align: bottom; position:relative; display: inline-block; height:150px; background:none;" alt="" />
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

  // ---------- 排序、分页、数据加载等逻辑（完全保持不变） ----------
  // 由于篇幅，以下直接复用之前最终版的代码，仅需将 createCard 替换为上述版本。
  // 但为了完整性，此处列出全部函数（实际已在 final 中提供，这里从略）

  // 注意：为了简洁，下面的排序/分页函数代码略，实际部署时请使用之前已验证的完整 main.js，
  // 仅需要将 createCard 替换为上方的版本，并将 getFirstLinePlainText 和 extractFirstImage 替换为 parseFirstLine。

  // 以下是占位，实际使用时应包含完整逻辑：
  function sortPosts(posts, sortType, ascending) { /* 同之前 */ }
  function renderCards() { /* 同之前，调用 createCard */ }
  function renderPagination() { /* 同之前 */ }
  function createPaginationButtons(container) { /* 同之前 */ }
  async function fetchAllPosts() { /* 同之前 */ }
  function readControls() { /* 同之前 */ }
  function buildStructure() { /* 同之前 */ }
  function bindControls() { /* 同之前 */ }
  async function initMain() { /* 同之前，但需要加载 marked 库 */ }
  // ...
})();