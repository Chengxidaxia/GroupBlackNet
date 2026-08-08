// ============================================================
// oauth.js - GitHub OAuth 登录/登出控制（支持返回原页面）
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';

  const loginBtn = document.getElementById('login');
  const logoutBtn = document.getElementById('logout');
  const rememberCheck = document.getElementById('remember');

  if (!loginBtn || !logoutBtn) {
    console.warn('oauth.js: 未找到 id="login" 或 id="logout" 的元素');
    return;
  }

  const loginArea = document.getElementById('login-area');
  const userArea = document.getElementById('user-area');
  const userAvatar = document.getElementById('user-avatar');
  const usernameSpan = document.getElementById('username');
  const userLink = document.getElementById('user-link');

  // ---------- UI 切换 ----------
  function setLoggedIn(user) {
    if (loginArea) loginArea.style.display = 'none';
    if (userArea) userArea.style.display = 'flex';
    if (userAvatar && user) userAvatar.src = user.avatar_url;
    if (usernameSpan && user) usernameSpan.textContent = user.login;
    if (userLink && user) userLink.href = `https://github.com/${user.login}`;
  }

  function setLoggedOut() {
    if (loginArea) loginArea.style.display = 'flex';
    if (userArea) userArea.style.display = 'none';
  }

  // 初始状态：未登录
  setLoggedOut();

  // ---------- 登录（存储返回地址） ----------
  function login() {
    // 存储当前页面 URL，登录后跳转回来
    sessionStorage.setItem('return_to', window.location.href);
    const remember = rememberCheck ? rememberCheck.checked : false;
    window.location.href = `${OAUTH_BASE}/login${remember ? '?remember=true' : ''}`;
  }

  // ---------- 登出（刷新页面） ----------
  async function logout() {
    try {
      const res = await fetch(`${OAUTH_BASE}/logout`, { credentials: 'include' });
      if (res.ok) {
        setLoggedOut();
        // 退出后立即刷新当前页面
        window.location.reload();
      } else {
        console.error('oauth.js: 登出失败', res.status);
      }
    } catch (e) {
      console.error('oauth.js: 登出异常', e);
    }
  }

  // ---------- 检查登录状态 ----------
  async function checkLoginStatus() {
    try {
      const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
      if (res.ok) {
        const user = await res.json();
        setLoggedIn(user);
        return true;
      } else {
        setLoggedOut();
        return false;
      }
    } catch (e) {
      console.error('oauth.js: 状态检查失败', e);
      setLoggedOut();
      return false;
    }
  }

  // ---------- 处理 OAuth 回调（含跳转回原页面） ----------
  function handleCallback() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#user=')) {
      try {
        const userJson = decodeURIComponent(hash.substring(6));
        const user = JSON.parse(userJson);
        setLoggedIn(user);
        // 清除 hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        // 从 sessionStorage 获取返回地址并跳转
        const returnTo = sessionStorage.getItem('return_to');
        if (returnTo) {
          sessionStorage.removeItem('return_to');
          // 如果返回地址不是当前地址，则跳转
          if (returnTo !== window.location.href) {
            window.location.href = returnTo;
            return true; // 跳转中
          }
        }
        return true;
      } catch (e) {
        console.error('解析用户信息失败:', e);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
    return false;
  }

  // ---------- 绑定事件 ----------
  loginBtn.addEventListener('click', login);
  logoutBtn.addEventListener('click', logout);

  // ---------- 初始化 ----------
  function init() {
    // 优先处理回调（跳转）
    const handled = handleCallback();
    // 如果没有跳转，则检查登录状态更新 UI
    if (!handled) {
      checkLoginStatus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
