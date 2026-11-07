/* ============================================================
   app.js — 服务状态页逻辑（独立项目）
   ------------------------------------------------------------
   数据来自同源 /api/status（本项目自带函数，见 api/status.js）。
   页面每 30 秒刷新一次；标签页隐藏时停止请求与计时。
   ============================================================ */
(function () {
  'use strict';

  var API = '/api/status';
  var BARS = 48;            // 24 小时切成 48 格（每格 30 分钟）
  var POLL_MS = 30000;
  var state = { doc: null, timer: null, ticker: null };

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function pct(up, total) {
    if (!total) return null;
    return Math.round((up / total) * 1000) / 10;
  }
  function fmtPct(v) {
    if (v == null) return '—';
    return (v >= 100 ? '100' : v.toFixed(1).replace(/\.0$/, '')) + '%';
  }
  function ago(ms) {
    if (!ms) return '—';
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + ' 秒前';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' 分钟前';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.round(h / 24) + ' 天前';
  }
  function hostOf(u) {
    try { return new URL(u).host + (new URL(u).pathname === '/' ? '' : new URL(u).pathname); } catch (e) { return u || ''; }
  }
  // 把探测端吐回来的英文错误翻成人话；原文保留在 title 里
  function errText(s) {
    if (s.ok) return (s.ms || 0) + ' ms';
    var e = String(s.err || '');
    if (/timeout|abort|timed out/i.test(e)) return '超时（10 秒无响应）';
    if (/dns|ENOTFOUND|getaddrinfo/i.test(e)) return '域名解析失败';
    if (/connect|network|fetch failed|ECONN/i.test(e)) return '连接失败';
    if (s.code) return 'HTTP ' + s.code;
    return e ? '异常' : '无响应';
  }

  /* ---------- 把 hist 切成 48 个桶 ---------- */
  function bucketize(doc) {
    var n = doc.services.length;
    var hist = (doc.hist || []).filter(function (h) { return Array.isArray(h) && typeof h[1] === 'string'; });
    hist.sort(function (a, b) { return a[0] - b[0]; });
    var slots = hist.slice(-BARS * 15);              // 2 分钟一格 × 15 = 每桶 30 分钟
    var per = Math.max(1, Math.ceil(slots.length / BARS));
    var buckets = [];
    for (var b = 0; b < BARS; b++) {
      var row = [];
      for (var i = 0; i < n; i++) row.push(null);
      buckets.push(row);
    }
    var L = slots.length;
    for (var j = 0; j < L; j++) {
      var bi = BARS - 1 - Math.floor((L - 1 - j) / per);
      if (bi < 0) continue;
      var bitstr = slots[j][1];
      for (var s = 0; s < n; s++) {
        var ch = bitstr.charAt(s);
        if (ch !== '0' && ch !== '1') continue;
        var cur = buckets[bi][s];
        var v = ch === '1' ? 1 : 0;
        buckets[bi][s] = cur === null ? v : Math.min(cur, v);   // 桶里只要掉过一次就标红
      }
    }
    return { buckets: buckets, hist: hist };
  }

  /* ---------- 顶部横幅 ---------- */
  function renderBanner(doc) {
    var el = $('stBanner');
    var title = $('stBannerTitle');
    var sub = $('stBannerSub');
    if (!doc) return;
    var bad = doc.services.filter(function (s) { return !s.ok; });
    var tail = ' · 最后检测 <span class="st-ago">' + ago(doc.updated) + '</span>';
    if (!bad.length) {
      el.setAttribute('data-state', 'up');
      title.textContent = '全部服务正常';
      sub.innerHTML = doc.services.length + ' 项检查全部通过' + tail;
    } else if (bad.length === doc.services.length) {
      el.setAttribute('data-state', 'down');
      title.textContent = '全部服务异常';
      sub.innerHTML = '可能是网络或数据源整体故障' + tail;
    } else {
      el.setAttribute('data-state', 'warn');
      title.textContent = bad.length + ' 项服务异常';
      sub.innerHTML = esc(bad.map(function (s) { return s.name; }).join('、')) + tail;
    }
  }

  /* ---------- 服务卡片 ---------- */
  function renderList(doc) {
    var box = $('stList');
    var bk = bucketize(doc);
    var html = doc.services.map(function (s, i) {
      var up = 0, total = 0;
      bk.hist.forEach(function (h) {
        var ch = h[1].charAt(i);
        if (ch === '1') { up++; total++; } else if (ch === '0') { total++; }
      });
      var rate = pct(up, total);

      var bars = bk.buckets.map(function (row) {
        var v = row[i];
        var cls = v === null ? 'empty' : (v === 1 ? 'up' : 'down');
        return '<span class="st-bar ' + cls + '"></span>';
      }).join('');

      var st = s.ok ? 'up' : 'down';
      var detail = errText(s);
      var detailTitle = s.ok ? (s.ms + ' ms') : (s.err || detail);

      return '<li class="st-card" data-state="' + st + '">'
        +   '<div class="st-card-head">'
        +     '<span class="st-dot"></span>'
        +     '<div class="st-card-title">'
        +       '<b class="st-name">' + esc(s.name) + '</b>'
        +       '<a class="st-url" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(hostOf(s.url)) + ' ↗</a>'
        +     '</div>'
        +     '<div class="st-card-stat">'
        +       '<span class="st-ms" title="' + esc(detailTitle) + '">' + esc(detail) + '</span>'
        +       '<span class="st-rate">24h ' + fmtPct(rate) + '</span>'
        +     '</div>'
        +   '</div>'
        +   '<div class="st-bars" title="最近 24 小时，每格 30 分钟">' + bars + '</div>'
        + '</li>';
    }).join('');
    box.innerHTML = html;
  }

  /* ---------- 近 7 天表格 ---------- */
  function renderWeek(doc) {
    var tbl = $('stWeek');
    var days = doc.days || {};
    var keys = Object.keys(days).sort().slice(-7);
    if (!keys.length) { tbl.innerHTML = '<tbody><tr><td class="muted">还没有历史数据。</td></tr></tbody>'; return; }
    var head = '<thead><tr><th>日期</th>'
      + doc.services.map(function (s) {
        return '<th>' + esc(s.short || s.name.replace(/^.*·\s*/, '')) + '</th>';
      }).join('')
      + '</tr></thead>';
    var rows = keys.reverse().map(function (k) {
      var d = days[k] || {};
      var cells = doc.services.map(function (_, i) {
        var rate = pct((d.ok && d.ok[i]) || 0, d.n || 0);
        var cls = rate == null ? '' : (rate >= 99.5 ? 'ok' : (rate >= 95 ? 'mid' : 'bad'));
        return '<td class="' + cls + '">' + fmtPct(rate) + '</td>';
      }).join('');
      return '<tr><td class="d">' + esc(k.slice(5)) + '</td>' + cells + '</tr>';
    }).join('');
    tbl.innerHTML = head + '<tbody>' + rows + '</tbody>';
  }

  /* ---------- 空态 ---------- */
  function renderEmpty(info) {
    $('stBanner').setAttribute('data-state', 'unknown');
    $('stBannerTitle').textContent = '暂时读不到状态数据';
    var map = {
      'no-data': 'Worker 还没写过数据。确认 status-probe 已部署、cron 已触发。',
      'no-upstash': '服务端没配 Upstash 环境变量，也没找到可用的上游接口。',
      'read-failed': '读取存储时出错：' + (info.error || '未知错误'),
    };
    $('stBannerSub').textContent = map[info.reason] || (info.reason || '未知原因');
    $('stList').innerHTML = '<li class="st-card" data-state="unknown"><div class="st-card-head">'
      + '<span class="st-dot"></span><div class="st-card-title"><b class="st-name">没有可显示的服务</b>'
      + '<span class="st-url">数据源为空</span></div></div></li>';
    $('stWeek').innerHTML = '<tbody><tr><td class="muted">暂无数据。</td></tr></tbody>';
    $('stUpdated').textContent = '最后检测：—';
  }

  /* ---------- 拉取 ---------- */
  async function load() {
    $('stRefresh').disabled = true;
    try {
      var res = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
      var doc = await res.json();
      if (!doc || doc.ok !== true || !Array.isArray(doc.services) || !doc.services.length) {
        renderEmpty(doc || {});
        return;
      }
      state.doc = doc;
      $('stInterval').textContent = '每 ' + Math.round((doc.intervalSec || 120) / 60) + ' 分钟探测';
      renderBanner(doc);
      renderList(doc);
      renderWeek(doc);
      $('stUpdated').innerHTML = '最后检测：<span class="st-ago">' + ago(doc.updated) + '</span>';
    } catch (e) {
      renderEmpty({ reason: 'read-failed', error: String(e.message || e) });
    } finally {
      $('stRefresh').disabled = false;
    }
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(load, POLL_MS);
    state.ticker = setInterval(function () {
      if (!state.doc) return;
      var a = ago(state.doc.updated);
      var list = document.querySelectorAll('.st-ago');
      for (var i = 0; i < list.length; i++) list[i].textContent = a;
    }, 1000);
  }
  function stopPolling() {
    if (state.timer) clearInterval(state.timer);
    if (state.ticker) clearInterval(state.ticker);
    state.timer = state.ticker = null;
  }

  /* ---------- 主题切换（与主站共用 localStorage 键） ---------- */
  (function theme() {
    var btn = $('stTheme');
    if (!btn) return;
    var root = document.documentElement;
    function paint() {
      var cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      btn.textContent = cur === 'dark' ? '☀' : '◐';
      btn.setAttribute('aria-label', cur === 'dark' ? '切换到亮色主题' : '切换到暗色主题');
    }
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('gb-theme', next); } catch (e) {}
      paint();
    });
    paint();
  })();

  $('stRefresh').addEventListener('click', load);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPolling();
    else { load(); startPolling(); }
  });

  load().then(startPolling);
})();
