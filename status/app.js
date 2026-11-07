/* ============================================================
   app.js — 把 /api/status 渲染成一行一项的状态列表
   ------------------------------------------------------------
   结构：总状态横幅 + 服务行（名称 / 当前耗时 / 24 小时可用率 / 条）
   只有这一份渲染逻辑，不引入任何外部脚本。
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

  /* 状态图标：绿勾 / 黄叹号 / 红叉，取自参考站点的实心圆 + 白色笔画 */
  function icon(ok) {
    if (ok) {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#22c55e"/>'
        + '<path d="M5.9 10.4l2.6 2.6 5.6-5.7" fill="none" stroke="#fff" stroke-width="1.8"'
        + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#ef4444"/>'
      + '<path d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" fill="none" stroke="#fff" stroke-width="1.8"'
      + ' stroke-linecap="round"/></svg>';
  }
  function warnIcon() {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#f59e0b"/>'
      + '<path d="M10 5.6v5.2" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>'
      + '<circle cx="10" cy="14.2" r="1.05" fill="#fff"/></svg>';
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
        buckets[bi][s] = cur === null ? v : Math.min(cur, v);   // 桶里掉过一次就标出来
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
    var up24 = 0, n24 = 0;
    bk.hist.forEach(function (h) {
      var ch = h[1].charAt(i);
      if (ch === '1') { up24++; n24++; } else if (ch === '0') { n24++; }
    });
    var keys = Object.keys(doc.days || {}).sort().slice(-7);
    var up7 = 0, n7 = 0;
    keys.forEach(function (k) {
      var d = doc.days[k] || {};
      up7 += (d.ok && d.ok[i]) || 0;
      n7 += d.n || 0;
    });
    return { h24: rate(up24, n24), d7: rate(up7, n7) };
  }

  /* ---------- 顶部总状态横幅 ---------- */
  function renderBanner(doc) {
    var bad = doc.services.filter(function (s) { return !s.ok; });
    var el = $('banner');
    var title = $('bannerTitle');
    var sub = $('bannerSub');

    if (!bad.length) {
      el.className = 'banner up';
      title.textContent = '一切运行正常';
      sub.innerHTML = '所有服务均按预期运行 · 最后检测 <span class="ago">' + ago(doc.updated) + '</span>';
    } else if (bad.length === doc.services.length) {
      el.className = 'banner down';
      title.textContent = '服务全部不可用';
      sub.innerHTML = '可能是网络或数据源整体故障 · 最后检测 <span class="ago">' + ago(doc.updated) + '</span>';
    } else {
      el.className = 'banner warn';
      title.textContent = bad.length + ' 项服务异常';
      sub.innerHTML = esc(bad.map(function (s) { return s.name; }).join('、'))
        + ' · 最后检测 <span class="ago">' + ago(doc.updated) + '</span>';
    }
    // 图标跟着状态换：全绿绿勾、部分异常黄叹号、全断红叉
    var ic = el.querySelector('svg');
    if (ic) {
      ic.outerHTML = !bad.length ? icon(true) : (bad.length === doc.services.length ? icon(false) : warnIcon());
    }
  }

  /* ---------- 服务列表 ---------- */
  function renderList(doc) {
    var bk = bucketize(doc);
    $('list').innerHTML = doc.services.map(function (s, i) {
      var m = metrics(doc, bk, i);
      var st = s.ok ? 'up' : 'down';

      // 只画已经有数据的格子：数据不足 24 小时时不会先摆一长串空槽
      var bars = '';
      bk.buckets.forEach(function (row) {
        var v = row[i];
        if (v === null) return;
        bars += '<i class="' + (v === 1 ? 'up' : 'down') + '"></i>';
      });
      if (!bars) bars = '<i class="warn"></i>';

      var tip = '24 小时 ' + fmtPct(m.h24)
        + ' · 近 7 天 ' + fmtPct(m.d7)
        + ' · 当前 ' + (s.ok ? (s.ms || 0) + ' ms' : errText(s));

      return '<article class="svc-row ' + st + '">'
        +   '<div class="row">'
        +     '<div class="svc">'
        +       icon(s.ok)
        +       '<b><a href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + esc(hostOf(s.url)) + '">'
        +         esc(s.name) + '</a></b>'
        +       '<em>' + esc(errText(s)) + '</em>'
        +     '</div>'
        +     '<div class="pct" title="' + esc(tip) + '"><b>' + fmtPct(m.h24) + '</b> 可用率</div>'
        +   '</div>'
        +   '<div class="bars" title="最近 24 小时，每格 30 分钟">' + bars + '</div>'
        + '</article>';
    }).join('');

    // 卡片里的链接沿用模板做法：整块可点太吵，只让名称可点
    $('list').querySelectorAll('article a').forEach(function (a) {
      a.style.textDecoration = 'none';
    });
  }

  /* ---------- 空态 ---------- */
  function renderEmpty(info) {
    var map = {
      'no-data': '探测端还没写入数据（Worker 未部署或 cron 未触发）。',
      'no-upstash': '服务端没有配置数据源。',
      'read-failed': '读取数据出错：' + (info.error || '未知错误'),
    };
    $('banner').className = 'banner warn';
    var ic = $('banner').querySelector('svg');
    if (ic) ic.outerHTML = warnIcon();
    $('bannerTitle').textContent = '暂时读不到状态数据';
    $('bannerSub').textContent = map[info.reason] || info.reason || '未知原因';
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
      renderBanner(doc);
      renderList(doc);
      $('updated').textContent = '最后更新 ' + ago(doc.updated)
        + ' · 每 ' + Math.round((doc.intervalSec || 120) / 60) + ' 分钟探测';
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
