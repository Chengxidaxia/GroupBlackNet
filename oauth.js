// ============================================================
// oauth.js - GitHub OAuth 登录/登出控制（支持头像/用户名）
// 依赖：公共部分加载完成后初始化
// ============================================================

(function() {
  'use strict';

  const OAUTH_BASE = 'https://oauth.blacknet.cc.cd';

  function initOAuth() {
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

    setLoggedOut();

    function login() {
      const remember = rememberCheck ? rememberCheck.checked : false;
      window.location.href = `${OAUTH_BASE}/login${remember ? '?remember=true' : ''}`;
    }

    async function logout() {
      try {
        const res = await fetch(`${OAUTH_BASE}/logout`, { credentials: 'include' });
        if (res.ok) {
          setLoggedOut();
        } else {
          console.error('oauth.js: 登出失败', res.status);
        }
      } catch (e) {
        console.error('oauth.js: 登出异常', e);
      }
    }

    async function checkLoginStatus() {
      try {
        const res = await fetch(`${OAUTH_BASE}/me`, { credentials: 'include' });
        if (res.ok) {
          const user = await res.json();
          setLoggedIn(user);
        } else {
          setLoggedOut();
        }
      } catch (e) {
        console.error('oauth.js: 状态检查失败', e);
        setLoggedOut();
      }
    }

    function handleCallback() {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#user=')) {
        try {
          const userJson = decodeURIComponent(hash.substring(6));
          const user = JSON.parse(userJson);
          setLoggedIn(user);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          return true;
        } catch (e) {
          console.error('解析用户信息失败:', e);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
      return false;
    }

    loginBtn.addEventListener('click', login);
    logoutBtn.addEventListener('click', logout);

    const handled = handleCallback();
    if (!handled) {
      checkLoginStatus();
    }
  }

  if (window.commonsLoaded) {
    initOAuth();
  } else {
    document.addEventListener('commonsLoaded', initOAuth);
  }
})();