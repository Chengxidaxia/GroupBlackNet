/* ============================================================
   app.js — 把 /api/status 渲染成 Upptime 风格的卡片列表
   ------------------------------------------------------------
   页面样式 100% 来自 Upptime（global.css + themes），本文件只生成
   article / h4 / .tag / .bars 这些结构，不改任何视觉规则。
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
  // 探测端返回的英文错误翻成人话
  function errText(s) {
    if (s.ok) return (s.ms || 0) + ' ms';
    var e = String(s.err || '');
    if (/timeout|abort|timed out/i.test(e)) return '超时';
    if (/dns|ENOTFOUND|getaddrinfo/i.test(e)) return '解析失败';
    if (/connect|network|fetch failed|ECONN/i.test(e)) return '连接失败';
    if (s.code) return 'HTTP ' + s.code;
    return '无响应';
  }

  /* ---------- 把 hist 切成 48 个桶（用于 24 小时条） ---------- */
  function bucketize(doc) {
    var n = doc.services.length;
    var hist = (doc.hist || []).filter(function (h) { return Array.isArray(h) && typeof h[1] === 'string'; });
    hist.sort(function (a, b) { return a[0] - b[0]; });
    var slots = hist.slice(-BARS * 15);
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
        buckets[bi][s] = cur === null ? v : Math.min(cur, v);   // 桶里掉过一次就标红
      }
    }
    return { buckets: buckets, hist: hist };
  }

  function rate(up, total) {
    if (!total) return null;
    return Math.round((up / total) * 1000) / 10;
  }

  /* ---------- 每行的 24h / 7d 指标 ---------- */
  function metrics(doc, bk, i) {
    // 24 小时
    var up24 = 0, n24 = 0;
    bk.hist.forEach(function (h) {
      var ch = h[1].charAt(i);
      if (ch === '1') { up24++; n24++; } else if (ch === '0') { n24++; }
    });
    // 近 7 天（days 是日聚合）
    var keys = Object.keys(doc.days || {}).sort().slice(-7);
    var up7 = 0, n7 = 0;
    keys.forEach(function (k) {
      var d = doc.days[k] || {};
      up7 += (d.ok && d.ok[i]) || 0;
      n7 += d.n || 0;
    });
    return { h24: rate(up24, n24), d7: rate(up7, n7) };
  }

  /* ---------- 顶部总状态 ---------- */
  function renderSummary(doc) {
    var bad = doc.services.filter(function (s) { return !s.ok; });
    var el = $('summary');
    if (!bad.length) {
      el.innerHTML = '<span class="tag up">正常</span> '
        + doc.services.length + ' 项检查全部通过，最后检测 <span class="ago">' + ago(doc.updated) + '</span>';
    } else if (bad.length === doc.services.length) {
      el.innerHTML = '<span class="tag down">异常</span> 全部服务无响应，最后检测 <span class="ago">' + ago(doc.updated) + '</span>';
    } else {
      el.innerHTML = '<span class="tag degraded">部分异常</span> '
        + esc(bad.map(function (s) { return s.name; }).join('、'))
        + '，最后检测 <span class="ago">' + ago(doc.updated) + '</span>';
    }
  }

  /* ---------- 服务列表 ---------- */
  function renderList(doc) {
    var bk = bucketize(doc);
    $('list').innerHTML = doc.services.map(function (s, i) {
      var m = metrics(doc, bk, i);
      var st = s.ok ? 'up' : 'down';
      var label = s.ok ? '正常' : '异常';

      // 只画已经有数据的格子：数据不足 24 小时时不会留一长串空格
      var bars = '';
      bk.buckets.forEach(function (row) {
        var v = row[i];
        if (v === null) return;
        bars += '<i class="' + (v === 1 ? 'up' : 'down') + '"></i>';
      });
      if (!bars) bars = '<i class="none"></i>';

      var detail = m.h24 == null ? '还没有 24 小时数据'
        : '24 小时 ' + fmtPct(m.h24)
          + (m.d7 == null ? '' : ' · 近 7 天 ' + fmtPct(m.d7));

      return '<article class="' + st + '">'
        +   '<div class="f">'
        +     '<h4><a href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + esc(hostOf(s.url)) + '">'
        +       esc(s.name) + '</a> <span class="tag ' + st + '">' + label + '</span></h4>'
        +     '<div title="' + esc(s.ok ? s.ms + ' ms' : (s.err || errText(s))) + '">' + esc(errText(s)) + '</div>'
        +   '</div>'
        +   '<div class="bars" title="最近 24 小时，每格 30 分钟">' + bars + '</div>'
        +   '<p style="margin:.5rem 0 0;opacity:.8"><small>' + esc(detail) + '</small></p>'
        + '</article>';
    }).join('');
  }

  /* ---------- 空态 ---------- */
  function renderEmpty(info) {
    var map = {
      'no-data': '探测端还没写入数据（Worker 未部署或 cron 未触发）。',
      'no-upstash': '服务端没有配置数据源。',
      'read-failed': '读取数据出错：' + (info.error || '未知错误'),
    };
    $('summary').innerHTML = '<span class="tag down">读不到数据</span> '
      + esc(map[info.reason] || info.reason || '未知原因');
    $('list').innerHTML = '';
    $('updated').textContent = '';
  }

  /* ---------- 拉取 ---------- */
  async function load() {
    try {
      var res = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
      var doc = await res.json();
      if (!doc || doc.ok !== true || !Array.isArray(doc.services) || !doc.services.length) {
        renderEmpty(doc || {});
        return;
      }
      state.doc = doc;
      renderSummary(doc);
      renderList(doc);
      $('updated').textContent = '最后检测 ' + ago(doc.updated)
        + ' · 每 ' + Math.round((doc.intervalSec || 120) / 60) + ' 分钟探测一次 · 数据源 '
        + (doc.servedBy === 'upstream' ? '主站接口' : 'Upstash');
    } catch (e) {
      renderEmpty({ reason: 'read-failed', error: String(e.message || e) });
    }
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(load, POLL_MS);
    state.ticker = setInterval(function () {
      if (!state.doc) return;
      var a = ago(state.doc.updated);
      var list = document.querySelectorAll('.ago');
      for (var i = 0; i < list.length; i++) list[i].textContent = a;
    }, 1000);
  }
  function stopPolling() {
    if (state.timer) clearInterval(state.timer);
    if (state.ticker) clearInterval(state.ticker);
    state.timer = state.ticker = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPolling();
    else { load(); startPolling(); }
  });

  load().then(startPolling);
})();
