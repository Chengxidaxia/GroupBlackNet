// ============================================================
// oauth.js — GitHub OAuth 登录/登出控制（等待公共部分加载）
// 依赖：config.js（window.BLACKNET.OAUTH_BASE）、head.html（相关元素 id）
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = (window.BLACKNET && window.BLACKNET.OAUTH_BASE) || 'https://oauth.blacknet.cc.cd';
  const toast = msg => { if (window.GB && GB.toast) GB.toast(msg); else console.warn(msg); };

  // ---------- 延迟初始化函数 ----------
  function initOAuth() {
    const loginBtn = document.getElementById('login');
    const logoutBtn = document.getElementById('logout');
    const rememberCheck = document.getElementById('remember');

    if (!loginBtn || !logoutBtn) {
      console.warn('oauth.js: 未找到 id="login" 或 id="logout" 的元素（可能 head.html 未加载）');
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
      document.dispatchEvent(new CustomEvent('gb:auth', { detail: { loggedIn: true, user } }));
    }

    function setLoggedOut() {
      if (loginArea) loginArea.style.display = 'flex';
      if (userArea) userArea.style.display = 'none';
      document.dispatchEvent(new CustomEvent('gb:auth', { detail: { loggedIn: false, user: null } }));
    }

    // 初始状态：未登录
    setLoggedOut();

    // ---------- 登录（存储返回地址） ----------
    function login() {
      try { sessionStorage.setItem('return_to', window.location.href); } catch (e) {}
      const remember = rememberCheck ? rememberCheck.checked : false;
      window.location.href = `${OAUTH_BASE}/login${remember ? '?remember=true' : ''}`;
    }

    // ---------- 登出（刷新页面） ----------
    async function logout() {
      try {
        const res = await fetch(`${OAUTH_BASE}/logout`, { credentials: 'include' });
        if (res.ok) {
          setLoggedOut();
          window.location.reload();
        } else {
          console.error('oauth.js: 登出失败', res.status);
          toast('登出失败（' + res.status + '），请稍后重试');
        }
      } catch (e) {
        console.error('oauth.js: 登出异常', e);
        toast('登出失败，请检查网络');
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
        }
        setLoggedOut();
        return false;
      } catch (e) {
        console.error('oauth.js: 状态检查失败', e);
        setLoggedOut();
        return false;
      }
    }

    // ---------- 处理 OAuth 回调（#user=<json>） ----------
    function handleCallback() {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#user=')) {
        try {
          const user = JSON.parse(decodeURIComponent(hash.substring(6)));
          setLoggedIn(user);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);

          let returnTo = null;
          try { returnTo = sessionStorage.getItem('return_to'); } catch (e) {}
          if (returnTo && returnTo !== window.location.href) {
            try { sessionStorage.removeItem('return_to'); } catch (e) {}
            window.location.href = returnTo;
            return true;
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
    if (!handleCallback()) checkLoginStatus();
  }

  // ---------- 等待公共部分加载完成 ----------
  if (window.commonsLoaded) {
    initOAuth();
  } else {
    document.addEventListener('commonsLoaded', initOAuth);
  }
})();
